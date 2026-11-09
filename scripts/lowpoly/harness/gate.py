import json
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import shot      # noqa: E402
import style     # noqa: E402

# ═══════════════════════════════════════════════════════════════════════════
# GATE — THE STYLE, AS SIX ASSERTIONS ON THE EXPORTED GLB
#
#     npm run lp:gate
#
# ⚠️ IT READS THE GLB, NOT THE BUILD. The single most expensive lesson in the
#    old pipeline: a metric is only evidence if it measures the thing that
#    SHIPS. Twice, a number was swept against a scene the exporter then
#    changed, and the constant it produced was baked in anyway. There is no
#    model-building code in this file at all -- it imports public/models/lp
#    and measures what three.js will receive.
#
# ⚠️ AND IT PROVES IT CAN FAIL, EVERY RUN, BEFORE IT JUDGES ANYTHING.
#    `_selftest()` runs four deliberately-broken meshes through the SAME
#    check functions and requires every one to be rejected. This is the
#    "validate the probe against a known-bad control" rule, enforced instead
#    of remembered: a gate that cannot discriminate is worse than no gate,
#    because it reads as evidence. If the self-test does not fail its four
#    cases, the gate reports FAILED and judges nothing.
#
# The six checks, and the defect each one exists for:
#
#   TRIS      a model quietly becoming detailed. "Very simple" has a number.
#   FLAT      one smooth polygon, which reads as a plastic highlight in a
#             flat-shaded scene and is invisible in a thumbnail.
#   PALETTE   an off-palette colour, which makes the set stop being a set.
#             Checked on the EXPORTED material, so a colour that survives
#             style.colour() but is mangled by the exporter is still caught.
#   FLOOR     a model hovering or sunk. The old hero hung 0.2 units in the
#             air for an afternoon and measured flat-footed the whole time.
#   SCALE     a tree at waist height. Only visible against the player, so it
#             is checked against the player's constant and not by eye.
#   CLEAN     loose vertices, zero-area faces, and anything in the glb that
#             is not the model: a camera, a light, an animation.
# ═══════════════════════════════════════════════════════════════════════════

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
MANIFEST = os.path.join(ROOT, "public", "models", "lp", "manifest.json")

COLOUR_EPS = 0.02           # exported base colour vs palette, per channel
FLAT_EPS = math.radians(1.0)   # a face normal may stray this far, no more
SCALE_EPS = 0.03            # player height, fractional
MAX_BYTES = 96 * 1024


# ── THE CHECKS. Each returns a list of complaints; empty is a pass. ──────

def check_tris(ob, entry):
    n = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    cap = style.budget(entry["kind"])
    if n > cap:
        return ["TRIS %d over the %s budget of %d" % (n, entry["kind"], cap)]
    return []


def check_flat(ob, entry=None):
    """Flat means every vertex normal agrees with its own face's normal.

    ⚠️ NOT `polygon.use_smooth`. That was this check's first implementation
       and it was a bad probe: it failed the tree on 6 faces whose normals
       deviate by 0.00 degrees, while a glb round-trip sets the flag for its
       own reasons. Measured properly against a control, the SAME run showed
       the rock genuinely off by 29 degrees on 36 faces -- a real defect the
       flag and the render both agreed to hide.

       So the probe is the angle three.js will actually shade with: the
       per-loop normal against the face normal it belongs to.
    """
    me = ob.data
    worst, bad = 0.0, 0
    for p in me.polygons:
        dev = 0.0
        for li in p.loop_indices:
            ln = me.loops[li].normal
            if ln.length > 0:
                dev = max(dev, p.normal.angle(ln))
        worst = max(worst, dev)
        if dev > FLAT_EPS:
            bad += 1
    if bad:
        return ["FLAT %d of %d faces are shaded, not faceted "
                "(worst %.1f deg of normal deviation)"
                % (bad, len(me.polygons), math.degrees(worst))]
    return []


def check_palette(ob, entry=None):
    out = []
    mats = [m for m in ob.data.materials if m]
    if len(mats) > style.MAX_MATERIALS:
        out.append("PALETTE %d materials, ceiling is %d"
                   % (len(mats), style.MAX_MATERIALS))
    for m in mats:
        rgb = None
        if m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED":
                    rgb = tuple(n.inputs["Base Color"].default_value)[:3]
                    break
        if rgb is None:
            rgb = tuple(m.diffuse_color)[:3]
        near = [k for k, v in style.PALETTE.items()
                if all(abs(a - b) <= COLOUR_EPS for a, b in zip(rgb, v))]
        if not near:
            out.append("PALETTE %s is %s, which is not a palette colour"
                       % (m.name, tuple(round(c, 3) for c in rgb)))
    return out


def check_floor(ob, entry=None):
    lo, _hi = shot.bounds(ob)
    if abs(lo.z - style.FLOOR_Z) > style.FLOOR_TOLERANCE:
        return ["FLOOR lowest vertex at z=%.4f, not %.4f (%s by %.1f mm)"
                % (lo.z, style.FLOOR_Z,
                   "floating" if lo.z > 0 else "sunk", abs(lo.z) * 1000)]
    return []


def check_scale(ob, entry):
    lo, hi = shot.bounds(ob)
    h = hi.z - lo.z
    key = entry.get("scale", "prop")
    if key not in style.SCALE_OF:
        return ["SCALE unknown scale class %r" % key]
    lo_mult, hi_mult = style.SCALE_OF[key]
    if key == "player":
        want = style.PLAYER_HEIGHT
        if abs(h - want) > want * SCALE_EPS:
            return ["SCALE %.3f m, and the player IS the ruler at %.2f m"
                    % (h, want)]
        return []
    lo_m = lo_mult * style.PLAYER_HEIGHT
    hi_m = hi_mult * style.PLAYER_HEIGHT
    if not (lo_m <= h <= hi_m):
        return ["SCALE %.2f m is outside %.2f-%.2f m for a %r "
                "(%.2f x the player)" % (h, lo_m, hi_m, key,
                                         h / style.PLAYER_HEIGHT)]
    return []


def check_clean(ob, entry=None):
    out = []
    me = ob.data
    used = set()
    for p in me.polygons:
        used.update(p.vertices)
        if p.area < 1e-8:
            out.append("CLEAN polygon %d has no area" % p.index)
    loose = len(me.vertices) - len(used)
    if loose:
        out.append("CLEAN %d loose vertices belong to no face" % loose)
    if not me.polygons:
        out.append("CLEAN the mesh has no faces at all")
    return out


CHECKS = (check_tris, check_flat, check_palette, check_floor, check_scale,
          check_clean)


# ── THE SELF-TEST: FOUR THINGS THAT MUST BE REJECTED ─────────────────────

def _scratch(name, verts, faces, colour_rgb, smooth=False, lift=0.0):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x, y, z + lift) for (x, y, z) in verts], [], faces)
    me.validate()
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    m = bpy.data.materials.new(name + "_mat")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = \
        tuple(colour_rgb) + (1.0,)
    me.materials.append(m)
    bpy.context.collection.objects.link(ob)
    return ob


_CUBE_V = [(-0.5, -0.5, 0), (0.5, -0.5, 0), (0.5, 0.5, 0), (-0.5, 0.5, 0),
           (-0.5, -0.5, 1), (0.5, -0.5, 1), (0.5, 0.5, 1), (-0.5, 0.5, 1)]
_CUBE_F = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2),
           (2, 6, 7, 3), (3, 7, 4, 0)]


def _selftest():
    """Four known-bad meshes, each of which MUST be caught by its check.

    The control matters as much as the cases: a clean cube at the right
    height in a palette colour must PASS all four, or the checks are simply
    rejecting everything and prove nothing.
    """
    entry = {"kind": "prop", "scale": "prop"}
    cases = [
        ("control (must pass)", _scratch(
            "sf_ok", _CUBE_V, _CUBE_F, style.PALETTE["stone"]),
         None),
        # ⚠️ The smooth case has to be a mesh whose normals REALLY deviate,
        # not merely one with the flag set -- that distinction is the whole
        # reason this check was rewritten. A cube shaded smooth has its
        # corner normals averaged across three faces: 54 degrees out.
        ("smooth shading", _scratch(
            "sf_smooth", _CUBE_V, _CUBE_F, style.PALETTE["stone"], smooth=True),
         check_flat),
        ("off-palette colour", _scratch(
            "sf_colour", _CUBE_V, _CUBE_F, (1.0, 0.0, 1.0)),
         check_palette),
        ("floating 20 cm", _scratch(
            "sf_float", _CUBE_V, _CUBE_F, style.PALETTE["stone"], lift=0.20),
         check_floor),
        ("a 24 m prop", _scratch(
            "sf_huge", [(x * 24, y * 24, z * 24) for x, y, z in _CUBE_V],
            _CUBE_F, style.PALETTE["stone"]),
         check_scale),
    ]
    broken = []
    for label, ob, expect in cases:
        found = []
        for c in CHECKS:
            found += c(ob, entry)
        if expect is None:
            if found:
                broken.append("the CONTROL cube was rejected: %s" % found)
        else:
            if not expect(ob, entry):
                broken.append("%r passed %s -- the check cannot discriminate"
                              % (label, expect.__name__))
        bpy.data.objects.remove(ob, do_unlink=True)
    return broken


# ── RUN ──────────────────────────────────────────────────────────────────

def main():
    shot.wipe_scene()
    broken = _selftest()
    if broken:
        print("SELFTEST FAILED -- the gate cannot be trusted and judged "
              "nothing:")
        for b in broken:
            print("   %s" % b)
        print("GATE FAILED")
        sys.exit(1)
    print("selftest ok: 4 known-bad meshes rejected, control accepted")

    with open(MANIFEST, "r", encoding="utf-8") as fh:
        entries = json.load(fh)["models"]
    want = os.environ.get("MODEL", "all").strip()
    if want not in ("", "all"):
        entries = [e for e in entries if e["id"] == want]

    fails = 0
    for e in entries:
        shot.wipe_scene()
        path = os.path.join(ROOT, "public", e["url"].lstrip("/"))
        if not os.path.exists(path):
            print("  %-8s FAIL  no glb at %s" % (e["id"], path))
            fails += 1
            continue
        before = set(bpy.data.objects)
        ob = shot.load_glb(path)
        extras = [o.type for o in bpy.data.objects
                  if o not in before and o is not ob and o.type != "EMPTY"]

        out = []
        for c in CHECKS:
            out += c(ob, e)
        if extras:
            out.append("CLEAN the glb also contains %s" % extras)
        if bpy.data.actions:
            out.append("CLEAN the glb carries %d animation(s)"
                       % len(bpy.data.actions))
        size = os.path.getsize(path)
        if size > MAX_BYTES:
            out.append("SIZE %.1f KB, ceiling is %d KB"
                       % (size / 1024.0, MAX_BYTES // 1024))

        lo, hi = shot.bounds(ob)
        n = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        if out:
            fails += 1
            print("  %-8s FAIL  %4d tris  %.2f m" % (e["id"], n, hi.z - lo.z))
            for o in out:
                print("           %s" % o)
        else:
            print("  %-8s ok    %4d tris / %-3d   %.2f m   %d mats   %4.1f KB"
                  % (e["id"], n, style.budget(e["kind"]), hi.z - lo.z,
                     len([m for m in ob.data.materials if m]), size / 1024.0))

    if fails:
        print("GATE FAILED — %d of %d models" % (fails, len(entries)))
        sys.exit(1)
    print("GATE PASSED — %d models, flat, on-palette, on the floor, in scale"
          % len(entries))


main()
