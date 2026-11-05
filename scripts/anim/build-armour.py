import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector

# ═══════════════════════════════════════════════════════════════════════════
# EQUIPMENT — plate armour that can be put on and taken off
#
# ⚠️ THE SHIELD'S TRICK DOES NOT WORK HERE. A shield is rigid and lives on
# one bone, so it is skinned to hand_l and carried. A cuirass crosses THREE
# spine bones and two clavicles; bolt it to one and the chest tears out of it
# the moment the hero leans into a brace.
#
# So each plate is CUT OUT OF THE HERO'S OWN SURFACE and thickened outward.
# Two problems solve themselves at once:
#
#   FIT       the plate is the body's surface, so it cannot clip through the
#             chest or float off it. Shrinkwrapping a separately modelled
#             shell onto a body is the usual way, and it is the usual way
#             because getting a hand-modelled one to sit right is the whole
#             job.
#   SKINNING  duplicating a vertex duplicates its vertex groups. The plate
#             arrives already weighted to exactly the bones that drive the
#             flesh underneath it, which is by definition correct. There is
#             no transfer step and nothing to get wrong.
#
# ⚠️ GEOMETRY MODIFIERS MUST BE APPLIED HERE. export-all.py exports with
# export_apply=False, because applying would flatten the Armature modifier
# and the hero would ship as a statue. Anything left unapplied on a plate is
# therefore simply absent from the GLB -- it would export as the paper-thin
# shell before Solidify ran.
#
# Each plate is its own object with its own name, so the lab can show and
# hide them independently. That IS the equip system: one skeleton, several
# meshes, toggle visibility.
# ═══════════════════════════════════════════════════════════════════════════

_H = max(v.co.z for v in human.data.vertices) - min(v.co.z for v in human.data.vertices)
# ⚠️ MEASURE THE FIGURE BEFORE CHOOSING A THICKNESS. The hero stands 2.212
# units, so a plate at 0.0075 of that is 1.4cm of steel at human scale --
# four times the thickest historical breastplate. Every piece came out
# inflated, and the pauldrons read as water wings. Real plate is 1.5-3mm;
# this is a little over that because a game silhouette wants to be readable.
PLATE = 0.0028 * _H          # shell thickness, ~5mm at human scale
LIFT = 0.0060 * _H           # standoff, the padding underneath
RIM = 0.0016 * _H            # bevel on the cut edge

_gi = {g.name: g.index for g in human.vertex_groups}
_nv = len(human.data.vertices)

_W = {}
for v in human.data.vertices:
    for g in v.groups:
        _W.setdefault(g.group, np.zeros(_nv))[v.index] = g.weight

def _weight(groups):
    t = np.zeros(_nv)
    for n in groups:
        if n in _gi and _gi[n] in _W:
            t += _W[_gi[n]]
    return t

_CO = np.empty(_nv * 3)
human.data.vertices.foreach_get("co", _CO)
_CO = _CO.reshape(-1, 3)


_EDGES = np.empty(len(human.data.edges) * 2, dtype=np.int64)
human.data.edges.foreach_get("vertices", _EDGES)
_EDGES = _EDGES.reshape(-1, 2)


def _soft(x, lo, hi):
    """0 below lo, 1 above hi, smooth in between."""
    t = np.clip((x - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _blur(f, n):
    """Average a per-vertex field across the mesh's own edges."""
    for _ in range(n):
        acc = np.zeros_like(f)
        cnt = np.zeros_like(f)
        np.add.at(acc, _EDGES[:, 0], f[_EDGES[:, 1]])
        np.add.at(acc, _EDGES[:, 1], f[_EDGES[:, 0]])
        np.add.at(cnt, _EDGES[:, 0], 1.0)
        np.add.at(cnt, _EDGES[:, 1], 1.0)
        f = np.where(cnt > 0, 0.45 * f + 0.55 * acc / np.maximum(cnt, 1), f)
    return f


def _deburr(ob, passes=7):
    """Erode notches out of a cut edge, then keep only the largest piece.

    ⚠️ BLURRING THE SELECTION IS NOT ENOUGH. A face survives only when ALL
    of its vertices do, so however smooth the underlying field is, the
    boundary is quantised to whole faces and comes out as a staircase of
    quad-sized notches. Rendered on a body that reads as torn metal, and I
    blamed it on holes, then on Z-fighting, before isolating the plate and
    seeing that the shell was solid and only its edge was wrong.

    A notch is a face hanging off the edge by one side, so it has two or
    more boundary edges of its own. Dropping those repeatedly walks the
    boundary back to something a smith could have cut. The same pass strips
    the stray flaps the selection leaves behind."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for _ in range(passes):
        doomed = [f for f in bm.faces
                  if sum(1 for e in f.edges if len(e.link_faces) < 2) >= 2]
        if not doomed:
            break
        bmesh.ops.delete(bm, geom=doomed, context="FACES")

    # Largest connected island only; the rest are specks.
    seen, best = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, island = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            island.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        if len(island) > len(best):
            best = island
    drop = [f for f in bm.faces if f not in set(best)]
    if drop:
        bmesh.ops.delete(bm, geom=drop, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces],
                     context="VERTS")
    bm.to_mesh(ob.data)
    bm.free()
    return len(ob.data.polygons)


def _radius(ob):
    """Mean distance of the mesh from the body's vertical axis."""
    n = len(ob.data.vertices)
    if not n:
        return 0.0
    a = np.empty(n * 3)
    ob.data.vertices.foreach_get("co", a)
    a = a.reshape(-1, 3)
    return float(np.hypot(a[:, 0], a[:, 1]).mean())


def steel(name, base, metal=0.92, rough=0.34):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*base, 1.0)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    return m


def plate(name, groups, thresh=0.55, zlo=None, zhi=None, extra=None,
          thick=None, lift=None, mat=None, smooth=10):
    """Cut the region out of the hero, lift it off the skin and thicken it."""
    # ⚠️ A HARD THRESHOLD ON A SMOOTH FIELD CUTS A RAGGED EDGE. Weight varies
    # continuously, so `>= 0.55` passes and fails in a saw-tooth that follows
    # the topology rather than any line a smith would cut. The pauldrons came
    # out looking torn and the cuirass had a shredded hem, and relaxing
    # afterwards could not fix it because the border is exactly what a
    # volume-preserving smooth holds still.
    #
    # Build membership as a SOFT field instead, blur it across the mesh's own
    # edges, and cut at the half-way line. The contour is then as smooth as
    # the blur, independently of how the triangles happen to fall.
    # ⚠️ AND THE BLUR HAS TO BE WIDE ENOUGH TO MATTER. Seven iterations on a
    # 13k-vertex body is a radius of a couple of millimetres, so the cut
    # still stair-stepped along the quad topology.
    band = 0.020 * _H
    score = np.ones(_nv)
    if thresh is not None:
        score *= _soft(_weight(groups), thresh - 0.18, thresh + 0.18)
    if zlo is not None:
        score *= _soft(_CO[:, 2], zlo - band, zlo + band)
    if zhi is not None:
        score *= 1.0 - _soft(_CO[:, 2], zhi - band, zhi + band)
    if extra is not None:
        score *= np.asarray(extra, dtype=float)
    keep = _blur(score, 16) > 0.5
    if keep.sum() < 40:
        raise RuntimeError("%s selected only %d vertices" % (name, keep.sum()))

    dup = human.copy()
    dup.data = human.data.copy()
    dup.name = name
    dup.data.name = name
    bpy.context.collection.objects.link(dup)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = dup
    dup.select_set(True)
    dup.modifiers.clear()

    # ⚠️ SHAPE KEYS BLOCK modifier_apply. freeze-hero bakes 32 of them into
    # the body and they are meaningless on a plate.
    if dup.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)

    # Select what is NOT wanted and delete it; a face survives only when all
    # of its vertices do, which gives a clean cut edge for free.
    for v in dup.data.vertices:
        v.select = not keep[v.index]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="VERT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    _deburr(dup)

    # ── RELAX IT INTO A PLATE ───────────────────────────────────────────────
    # ⚠️ A SHELL CUT FROM A BODY IS A CAST OF THAT BODY. Fit was the whole
    # reason for this approach and it is also its one failure: the first
    # working cuirass reproduced the nipples, the navel and every abdominal
    # crease in chrome, so it read as body paint rather than armour. Armour
    # is an IDEALISED form -- a smith beats a smooth curve, he does not chase
    # anatomy. Smoothing hard before thickening throws the detail away and
    # keeps the fit, which is the half worth keeping.
    # ⚠️ AND NOT WITH THE PLAIN SMOOTH MODIFIER. Laplacian averaging pulls
    # every vertex toward its neighbours, which on a closed-ish shell means
    # straight inward: at 26 iterations the greaves contracted further than
    # the standoff could pay back and sank into the shins, and the cuirass
    # tore open where the chest came through it. LAPLACIANSMOOTH with
    # use_volume_preserve does the same relaxation and pushes the result
    # back out to the volume it started with.
    _rs = _radius(dup)
    sm = dup.modifiers.new("Relax", "LAPLACIANSMOOTH")
    sm.iterations = smooth
    sm.lambda_factor = 1.8
    sm.lambda_border = 0.0
    sm.use_volume_preserve = True
    sm.use_normalized = True
    bpy.ops.object.modifier_apply(modifier="Relax")
    _r0 = _radius(dup)
    if _r0 < _rs * 0.985:
        print("   note: %s contracted %.1f%% while relaxing"
              % (name, 100 * (1 - _r0 / _rs)))
    # ── STAND IT OFF THE SKIN ───────────────────────────────────────────────
    # ⚠️ NOT WITH shrink_fatten. Its sign convention is the opposite of what
    # it reads like, so the plates were pushed INWARD. That stayed hidden
    # while they were 1.4cm thick -- Solidify's outward offset was bigger
    # than the mistake and shoved them back outside the body -- and the
    # moment the thickness came down to something realistic, every piece
    # sank under the skin. The cuirass simply vanished and I went looking
    # for a selection bug. Displace along NORMAL has one meaning.
    dis = dup.modifiers.new("Lift", "DISPLACE")
    dis.direction = "NORMAL"
    dis.mid_level = 0.0
    dis.strength = lift or LIFT
    bpy.ops.object.modifier_apply(modifier="Lift")
    _r1 = _radius(dup)

    sol = dup.modifiers.new("Sol", "SOLIDIFY")
    sol.thickness = thick or PLATE
    sol.offset = 1.0                      # grow outward, away from the body
    sol.use_rim = True
    bev = dup.modifiers.new("Bev", "BEVEL")
    bev.width = RIM
    bev.segments = 2
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(38)
    for m in ("Sol", "Bev"):
        bpy.ops.object.modifier_apply(modifier=m)

    bpy.ops.object.shade_smooth()
    dup.data.materials.clear()
    dup.data.materials.append(mat or STEEL)

    am = dup.modifiers.new("Armature", "ARMATURE")
    am.object = arm
    dup.parent = arm
    dup.matrix_parent_inverse = arm.matrix_world.inverted()
    # A reading, not a gate: did the shell actually move AWAY from the body?
    # A plate that lifts inward is invisible, and invisible looks exactly
    # like a selection that picked nothing.
    print("PLATE %-10s %5d verts, %5d faces   lift %+.4f (axis radius %.3f -> %.3f)"
          % (name, len(dup.data.vertices), len(dup.data.polygons),
             _r1 - _r0, _r0, _r1))
    return dup


STEEL = steel("PlateSteel", (0.158, 0.168, 0.186))
BRASS = steel("PlateBrass", (0.340, 0.235, 0.088), metal=0.95, rough=0.30)

_shoulder_z = (arm.matrix_world @ arm.data.bones["upperarm_l"].head_local).z
_hip_z = (arm.matrix_world @ arm.data.bones["thigh_l"].head_local).z
_neck_z = (arm.matrix_world @ arm.data.bones["neck_01"].head_local).z

ARMOUR = []

# ⚠️ SELECT A PLATE BY EXCLUSION, NOT BY A WEIGHT THRESHOLD. "Sum of the
# torso bones is over 0.30" sounds like the torso and is not: weight varies
# smoothly, so the test passes and fails in patches near the limit and the
# surviving faces come out in islands. The cuirass rendered as a shredded
# tabard with holes through it. The question that has a clean answer is the
# negative one -- a torso vertex is one that is NOT arm, NOT leg and NOT
# neck -- because those regions ARE firmly weighted and their boundaries are
# where the body actually articulates.
# Every arm group, fingers included. Listing only upperarm/lowerarm/hand
# left the fingers weighted to index_*, middle_*, pinky_*, ring_* and
# thumb_* -- so a fingertip scored zero "arm" and passed the torso test.
# The hero got little steel chips on his knuckles.
_ARMS = _weight(tuple(n for n in _gi if n.startswith(
    ("upperarm_", "lowerarm_", "hand_", "index_", "middle_",
     "pinky_", "ring_", "thumb_"))))
_LEGS = _weight(("thigh_l", "thigh_r", "calf_l", "calf_r"))
_HEAD = _weight(("neck_01", "head"))
# ⚠️ THE CUIRASS MUST NOT REACH ONTO THE DELTOID. It and the pauldron were
# both lifted about 5mm off the same patch of shoulder, so the two shells
# ended up coplanar and Z-FOUGHT -- which renders as speckled holes and
# reads exactly like torn metal. I spent a round looking for a hole in the
# geometry. The cuirass stops earlier, and the pauldron is lifted clear
# rather than merely lifted.
_TORSO = ((1.0 - _soft(_ARMS, 0.04, 0.20))
          * (1.0 - _soft(_LEGS, 0.10, 0.34))
          * (1.0 - _soft(_HEAD, 0.10, 0.34)))

# ── CUIRASS ── the whole torso, hip to collarbone.
ARMOUR.append(plate(
    "Cuirass", (), thresh=None, extra=_TORSO,
    zlo=_hip_z + 0.030 * _H, zhi=_shoulder_z + 0.015 * _H))

# ── PAULDRONS ── the CAP of each shoulder only. Including the clavicle and
# reaching 0.085 of body height down the arm wrapped them round the whole
# upper arm and met them over the sternum; the hero looked padded, not
# armoured. Shoulder bone only, top of the arm only, and held outboard of
# the chest.
for _s in ("l", "r"):
    _sx = 1.0 if _s == "l" else -1.0
    ARMOUR.append(plate(
        "Pauldron_%s" % _s.upper(), ("upperarm_%s" % _s,),
        # A low threshold keeps the region CONTIGUOUS and lets the Z plane
        # make the edge; at 0.55 the boundary followed a weight contour and
        # came out as a ragged saw-tooth.
        thresh=0.22, zlo=_shoulder_z - 0.030 * _H,
        extra=_soft(_CO[:, 0] * _sx, 0.030 * _H, 0.075 * _H),
        thick=PLATE * 1.25, lift=LIFT * 2.4))

# ── GREAVES ── shin plates, and the piece that proves the system is not
# special-cased to the torso. Floor clears the ankle.
for _s in ("l", "r"):
    ARMOUR.append(plate(
        "Greave_%s" % _s.upper(), ("calf_%s" % _s,), thresh=0.70,
        zlo=0.085 * _H, mat=BRASS))

print("ARMOUR %d pieces: %s" % (len(ARMOUR), ", ".join(o.name for o in ARMOUR)))
