import bpy, os, sys, math
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree

# ═══════════════════════════════════════════════════════════════════════════
# RIG QA — THE PIPELINE HAS TO FIND ITS OWN DEFECTS
#
# Luke, 2026-11-05, after watching me fail at this all afternoon: "I don't want
# my 3D art pipeline to hand me problems. I want it to hand me art."
#
# Everything here exists because of a specific way I got it wrong today. I am
# writing the mistakes down rather than the rules, because the rules are
# obvious in hindsight and the mistakes are what actually recur.
#
#   ⚠️ I REVIEWED AT COMPOSITION SCALE. A 640px full-body render puts the hands
#      at about twenty pixels. I looked at that and said "both hands on the
#      haft, looks fine" — about a frame with a hand growing out of the man's
#      abdomen, which Luke then spotted from across a room. EVERY time I zoomed
#      I found the truth in seconds. So: this never reports on a whole-body
#      image. It crops to the anatomy and magnifies.
#
#   ⚠️ I JUDGED FROM ONE CAMERA ANGLE. Twice, in opposite directions: an arm
#      declared MISSING that was merely behind the torso, and a grip declared
#      FINE that was mangled. A single azimuth cannot distinguish absent
#      geometry from occluded geometry. So: four angles, always, never one.
#
#   ⚠️ I THEORISED AND THEN LOOKED FOR SUPPORT. Four hypotheses for the belly
#      hand — bone placement, stray weights, wrist angle, torso penetration —
#      each written up confidently, each measured afterwards, all four wrong.
#      Where I had a number I was right every time; where I had an opinion I
#      was wrong most times. So: this prints numbers and FAILS. It does not
#      render an opinion.
#
#   ⚠️ AND THE THRESHOLD WAS A TEXTBOOK NUMBER, NOT THIS MESH'S NUMBER.
#      _wrist.py says "a wrist does about 70" and passed Mine at 69 — which
#      tears visibly. Idle sits at 60 and renders clean. Linear blend skinning
#      shears long before a joint reaches its anatomical limit, so the only
#      honest threshold is calibrated from clips that LOOK right. See LIMITS.
#
#   Usage:
#     blender --background --online-mode --python scripts/anim/qa.py
#     QA_SHEETS=1 ...   also write contact sheets for every failing frame
# ═══════════════════════════════════════════════════════════════════════════
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
exec(open(os.path.join(HERE, "export-all.py")).read())

OUT = os.environ.get("QA_OUT", os.path.join(HERE, "_qa"))
SHEETS = os.environ.get("QA_SHEETS") == "1"
dg = bpy.context.evaluated_depsgraph_get()

# ── THE THRESHOLDS, AND WHERE EACH NUMBER CAME FROM ────────────────────────
# ⚠️ CALIBRATED AGAINST RENDERS, NOT ANATOMY. Idle's left wrist runs 57-60 deg
# and renders clean at full zoom; Mine's ran 69 and tore the hand open. The cap
# therefore sits at 62 — above every clip known to look right, below the lowest
# known to look wrong. If a clip that renders clean ever trips it, RAISE it and
# say so here; do not silence the check.
# ⚠️ wrist RAISED 62 -> 80 ON EVIDENCE, 2026-11-06, NOT TO MAKE A GATE PASS.
# 62 was set when Idle ran 57 clean and Mine ran 69 and tore -- but that was
# BEFORE build-twist.py gave the forearm a twist joint. The rig changed under
# the threshold. Re-checked by rendering Mine f18 (the worst frame, 77.6) bare
# at magnification: both hands read as hands, fingers and thumbs intact,
# forearms smooth, no shear at either wrist. A human wrist does about 80 of
# flexion, so 80 is the anatomical figure and the mesh now survives it.
# If you lower the twist fraction in build-twist.py, lower this with it.
LIMITS = {
    "wrist": 80.0,     # hand vs forearm
    "elbow": 155.0,    # upperarm vs lowerarm, straightened
    "knee": 155.0,
}

# ── ⚠️ TWIST IS THE ONE THAT MANGLES AN ARM, AND BEND CANNOT SEE IT ────────
# Luke, 2026-11-05: "their arms are, like, getting completely twisted and
# mangled when they're trying to swing the axe... the most important test is
# whether or not the animation has flaws in the human anatomy."
#
# He is right and the first version of this file was blind to it. Every check
# above measures the ANGLE BETWEEN TWO BONE VECTORS. A forearm rotated 180
# degrees about its own length has an identical vector -- elbow to wrist is
# unchanged -- so it scores a perfect zero while the limb is wrung like a
# towel. Bend is one of three rotational freedoms and it is the one that
# happens to be easy to measure.
#
# These are anatomy, not taste, and two of them are HARD:
#   lowerarm  pronation/supination at the radioulnar joint, ~75 one way and
#             ~85 the other. 90 is already generous.
#   hand      A WRIST HAS NO TWIST AXIS. Forearm rotation is what turns the
#             palm over. Any twist here is the rig wringing a joint that
#             physically cannot do it -- 15 is tolerance for float noise and
#             skinning slop, not a real allowance.
#   calf      A KNEE IS A HINGE. Same argument.
#   upperarm  shoulder internal/external rotation, genuinely large.
# ⚠️ hand IS 45, NOT THE ANATOMICAL 15, AND THAT IS A DELIBERATE CLIMBDOWN.
# A wrist really has no twist axis, so 15 is what anatomy says. But measured:
# Idle 9, Walk 28, Run 36, Impact 39, Brace 41, Mine 64 -- and Luke calls
# everything up to Brace "within the realm of plausible" while Mine is the one
# that looks wrung. A gate that fails five clips including four acceptable ones
# is a gate somebody switches off. 45 sits above Brace and below Mine, so it
# fails exactly what looks wrong today. Lower it as the rig improves.
TWIST_LIMITS = {"upperarm": 90.0, "lowerarm": 90.0, "hand": 45.0,
                "thigh": 45.0, "calf": 15.0}

# ⚠️ TWO OF THESE READINGS ARE NOT YET TRUSTWORTHY. Said out loud rather than
# silenced, because a gate nobody believes is worse than no gate:
#   lowerarm  reads 177-180 on Brace, Run, Impact and Mine, and 0.1 on Walk
#             and Idle. A near-binary jump to exactly 180 is an axis flip in
#             _roll_about when the two up-vectors go antiparallel, not a real
#             forearm doing a half turn. DO NOT fix an animation against this
#             number until the degenerate case is handled.
#   calf      clean clips sit at 10.2 (Walk) and 10.5 (Idle), so the old 10
#             limit failed known-good work. 15 clears them; whether Run at 62
#             and Impact at 48 are real knee twist or the same flip is still
#             open.
# upperarm and hand DO discriminate -- hand runs Walk 9 / Idle 16 / Run 23 /
# Impact 45 / Brace 47 / Mine 69, matching the renders, and upperarm fails on
# Mine alone. Those two are safe to work against.
SUSPECT = {"lowerarm", "calf"}
# How far a hand may come to the spine axis before it is inside the chest. Not
# guessed: measured per frame from the torso's own vertices (see torso_radius).
PENETRATION_MARGIN = 0.02
# ⚠️ POKE IS MEASURED BUT NOT GATED -- IT FAILED ITS OWN VALIDATION.
# Counts by clip: Idle 164, Walk 186, Brace 375, Mine 632, Impact 658, Run 970.
# Rendered and checked: Idle's cuirass is CLEAN at full zoom, so its 164 are
# false positives, and Run scores WORST of all six while looking fine. The
# ordering does not track the renders, so the number cannot be acted on.
#
# Known weaknesses of the outward-ray test: where a plate is thin or strongly
# curved the body normal runs ALONG the steel rather than through it and the
# ray escapes; and the 0.04 "is this spot covered" radius catches flesh the
# plate does not really cover. Probably wants a depth comparison between an
# armour-only and a body-only render instead of a geometric ray.
#
# It still prints, because the defect is real -- flesh does punch through the
# cuirass on Mine f18 -- and a number nobody trusts is still better than
# forgetting the defect exists, which is what happened the first time I saw it.
POKE_VERTS = None


def ang(a, b, c, d):
    """Angle between vector a->b and c->d, in degrees."""
    u, v = (b - a), (d - c)
    if u.length < 1e-6 or v.length < 1e-6:
        return 0.0
    return math.degrees(u.angle(v))


def _roll_about(axis, up, ref):
    """Signed angle from ref to up around axis, or None if ill-conditioned.

    ⚠️ THE MISSING GUARD IS WHY lowerarm AND calf WERE NONSENSE. Roll is read
    by projecting two up-vectors onto the plane perpendicular to the bone. When
    a joint is strongly bent, the PARENT's up-vector lies almost along the
    child's axis, its projection collapses to near-zero, and the angle between
    two nearly-null vectors is noise -- which lands on +/-180 as often as not.
    That is exactly the signature we saw: 177-180 on Brace, Run, Impact and
    Mine, 0.1 on Walk and Idle. Not a forearm doing a half turn. A degenerate
    projection.

    Returning None rather than a number is the point. A measurement that
    cannot be made must say so; the alternative is four clips carrying a
    fabricated failure, which is what they carried all day.
    """
    axis = axis.normalized()
    u = (up - axis * up.dot(axis))
    r = (ref - axis * ref.dot(axis))
    # Below this the projection is mostly rounding error. 0.25 of a unit
    # vector is about 15 degrees off the bone axis.
    if u.length < 0.45 or r.length < 0.45:
        return None
    u.normalize(); r.normalize()
    return math.degrees(math.atan2(u.cross(r).dot(axis), u.dot(r)))


def _roll_pair(pb, use_x):
    """Roll of a bone about its own length vs rest, read against X or Z."""
    ax = pb.tail - pb.head
    if ax.length < 1e-6:
        return None
    k = Vector((1.0, 0.0, 0.0)) if use_x else Vector((0.0, 0.0, 1.0))
    now = _roll_about(ax, pb.matrix.to_3x3() @ k, pb.parent.matrix.to_3x3() @ k)
    rb, rp = pb.bone, pb.parent.bone
    rest = _roll_about(rb.tail_local - rb.head_local,
                       rb.matrix_local.to_3x3() @ k, rp.matrix_local.to_3x3() @ k)
    if now is None or rest is None:
        return None
    return abs((now - rest + 180.0) % 360.0 - 180.0)


def twist_deg(bone):
    """Roll of this bone about its own length, away from rest.

    ⚠️ READ AGAINST TWO AXES AND CROSS-CHECKED, because one axis lies. The
    previous version used the bone's Z alone and reported lowerarm_l as either
    UNMEASURABLE or EXACTLY 179 -- never a value in between, across all 40
    frames of Mine, while lowerarm_r sat at 0-3 the whole time. A quantity with
    only two states is a branch artifact, not a physical measurement: the left
    arm's rest orientation puts its Z near the flip point of atan2, so the
    measured and rest rolls land on opposite branches and differ by a half
    turn that is not there.
    
    Measuring against X as well and taking the better-conditioned projection
    removes the dependence on any one axis being well placed. If the two
    readings disagree by about 180 we are on a flipped branch and the smaller
    is the true one -- a bone cannot be simultaneously barely rolled and
    half-turned.
    """
    pb = arm.pose.bones[bone]
    if pb.parent is None:
        return 0.0
    a = _roll_pair(pb, False)
    b = _roll_pair(pb, True)
    if a is None and b is None:
        return None
    if a is None or b is None:
        return a if b is None else b
    if abs(abs(a - b) - 180.0) < 20.0:
        return min(a, b)
    return max(a, b)


def wp(bone, tail=False):
    pb = arm.pose.bones[bone]
    return arm.matrix_world @ (pb.tail if tail else pb.head)


def torso_tree(ev):
    """BVH of the torso surface, plus its open boundary, for a signed test.

    ⚠️ THIRD VERSION. The failures are instructive and all the same shape --
    the proxy was never the surface I thought it was:
      1. A CYLINDER of one global radius (the shoulders). A hand at belly
         height read 0.2 "inside" a shape that does not exist there. I tuned
         two rounds of animation against it before checking.
      2. The real surface, but IGNORING ITS EDGES. Filtering faces by vertex
         group cuts the mesh open at the shoulders, neck and hips, and a
         nearest-point landing on one of those open rims has a meaningless
         normal. It reported hand_r 0.085 INSIDE his chest on Mine f18 when
         the hand was 0.46 away, overhead and out to the side -- found only
         because the harness started printing WHERE, not just how deep.
    Hits near a boundary edge are now discarded: the test is only meaningful
    where the surface actually has a well-defined inside.
    """
    tvi = {i for i, v in enumerate(ev.vertices)
           if any(g.group in TORSO_G and g.weight > 0.5 for g in v.groups)}
    if not tvi:
        return None, []
    verts = [human.matrix_world @ v.co for v in ev.vertices]
    polys = [list(pl.vertices) for pl in ev.polygons
             if all(i in tvi for i in pl.vertices)]
    if not polys:
        return None, []
    edge = {}
    for pl in polys:
        for k in range(len(pl)):
            e = tuple(sorted((pl[k], pl[(k + 1) % len(pl)])))
            edge[e] = edge.get(e, 0) + 1
    rim = [verts[i] for e, c in edge.items() if c == 1 for i in e]
    return BVHTree.FromPolygons(verts, polys, all_triangles=False), rim


TORSO_G = {g.index for g in human.vertex_groups
           if g.name in ("spine_01", "spine_02", "spine_03", "pelvis")}
HAND_G = {s: {g.index for g in human.vertex_groups if g.name == "hand_%s" % s}
          for s in ("l", "r")}

PLATES = ("Cuirass", "Pauldron_L", "Pauldron_R", "Greave_L", "Greave_R")


def plate_poke(ev):
    """How many body vertices are sticking OUT through a piece of armour.

    ⚠️ A WHOLE CLASS OF DEFECT LIVES ONLY IN THE MESH. Every angle in this file
    reads the skeleton, so flesh punching through steel scores a clean pass. It
    is in the QA sheet for Mine f18, and I had seen the same thing hours before
    with no way to record it, so it was lost.

    ⚠️ SECOND ATTEMPT. The first compared each body vertex to the nearest point
    on the plate and used the sign of the plate's normal. A solidified plate has
    an INNER and an OUTER surface whose normals oppose, so flesh correctly
    tucked under the inner surface read as "outside" -- every clip failed, all
    at exactly 0.030, which was my own search radius saturating. A metric that
    returns the same number for good and bad work is measuring the search, not
    the mesh.

    This asks the question with no sign ambiguity: stand on the body vertex,
    look outward along its own normal, and see whether the armour is there. If
    the plate covers this spot but is not in front of the flesh, the flesh is
    outside it. Rim vertices are skipped -- flesh is meant to be outside the
    armour at its edges.
    """
    bad, where = 0, None
    for nm in PLATES:
        ob = bpy.data.objects.get(nm)
        if ob is None or ob.hide_render:
            continue
        pm = ob.evaluated_get(dg).to_mesh()
        verts = [ob.matrix_world @ v.co for v in pm.vertices]
        polys = [list(pl.vertices) for pl in pm.polygons]
        count = {}
        for pl in pm.polygons:
            vs = list(pl.vertices)
            for k in range(len(vs)):
                e = tuple(sorted((vs[k], vs[(k + 1) % len(vs)])))
                count[e] = count.get(e, 0) + 1
        rim = [verts[i] for e, c in count.items() if c == 1 for i in e]
        tree = BVHTree.FromPolygons(verts, polys, all_triangles=False)
        n_bad = 0
        for v in ev.vertices:
            p = human.matrix_world @ v.co
            near = tree.find_nearest(p, 0.04)
            if near is None or near[0] is None:
                continue                      # plate does not cover this spot
            if any((near[0] - r).length < 0.04 for r in rim):
                continue                      # at the edge of the plate
            nrm = (human.matrix_world.to_3x3() @ v.normal).normalized()
            if tree.ray_cast(p + nrm * 1e-4, nrm, 0.08)[0] is None:
                n_bad += 1                    # nothing between flesh and air
        ob.evaluated_get(dg).to_mesh_clear()
        if n_bad > bad:
            bad, where = n_bad, nm
    return bad, where


def cam_for(azim):
    """Place an ortho camera at `azim` degrees around the figure, matching the
    look the hero is normally reviewed in (low frontal key, Standard view
    transform) so a QA sheet is comparable to a _hfilm shot."""
    zs = [(human.matrix_world @ v.co).z for v in human.data.vertices]
    lo, hi = min(zs), max(zs)
    mid = Vector((0, 0, (lo + hi) * 0.52))
    cam = bpy.data.objects.get("QACam")
    if cam is None:
        cd = bpy.data.cameras.new("QACam")
        cd.type = "ORTHO"
        cd.ortho_scale = (hi - lo) * 1.15
        cam = bpy.data.objects.new("QACam", cd)
        bpy.context.collection.objects.link(cam)
        for n_, en, l, sz in (("qk", 320, (2.4, -3.2, 2.2), 3.0),
                              ("qf", 90, (-3.0, -2.2, 1.6), 4.0),
                              ("qr", 190, (-1.0, 3.2, 2.6), 2.5)):
            d = bpy.data.lights.new(n_, type="AREA")
            d.energy = en
            d.size = sz
            o = bpy.data.objects.new(n_, d)
            bpy.context.collection.objects.link(o)
            o.location = l
            o.rotation_euler = (mid - Vector(l)).to_track_quat("-Z", "Y").to_euler()
        sc.render.engine = "BLENDER_EEVEE_NEXT"
        sc.view_settings.view_transform = "Standard"
    sc.camera = cam
    a, e, D = math.radians(azim), math.radians(7), 9
    cam.location = (D * math.sin(a) * math.cos(e), -D * math.cos(a) * math.cos(e),
                    mid.z + D * math.sin(e))
    cam.rotation_euler = (mid - Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()


fails = []
print("\n" + "=" * 78)
print("RIG QA — numbers, not opinions")
print("=" * 78)

for name, end, _c in STASHED:
    arm.animation_data_create()
    arm.animation_data.action = bpy.data.actions[name]
    worst = {"wrist": (0, 0), "elbow": (0, 0), "knee": (0, 0), "pen": (1e9, 0),
             "poke": (0.0, 0, None)}
    pen_at = [None]
    twist = {k: (0, 0) for k in TWIST_LIMITS}
    nodata = set()
    for f in range(1, end + 1):
        sc.frame_set(f)
        dg.update()
        ev = human.evaluated_get(dg).to_mesh()

        for s in ("l", "r"):
            w = ang(wp("lowerarm_%s" % s), wp("lowerarm_%s" % s, True),
                    wp("hand_%s" % s), wp("hand_%s" % s, True))
            if w > worst["wrist"][0]:
                worst["wrist"] = (w, f)
            e = ang(wp("upperarm_%s" % s), wp("upperarm_%s" % s, True),
                    wp("lowerarm_%s" % s), wp("lowerarm_%s" % s, True))
            if e > worst["elbow"][0]:
                worst["elbow"] = (e, f)
            k = ang(wp("thigh_%s" % s), wp("thigh_%s" % s, True),
                    wp("calf_%s" % s), wp("calf_%s" % s, True)) \
                if arm.pose.bones.get("thigh_%s" % s) else 0.0
            if k > worst["knee"][0]:
                worst["knee"] = (k, f)
            for part in TWIST_LIMITS:
                bn = "%s_%s" % (part, s)
                if arm.pose.bones.get(bn):
                    tw = twist_deg(bn)
                    if tw is not None and tw > twist[part][0]:
                        twist[part] = (tw, f)
                    if tw is None:
                        nodata.add(part)

        # ── HAND INSIDE THE CHEST ──────────────────────────────────────────
        # The check whose absence cost the whole afternoon: "is a hand buried
        # in the torso" is answerable in one line and I guessed at it four
        # times instead.
        tree, rim = torso_tree(ev)
        if tree is not None:
            for s_ in ("l", "r"):
                for v in ev.vertices:
                    if not any(g.group in HAND_G[s_] and g.weight > 0.5 for g in v.groups):
                        continue
                    p = human.matrix_world @ v.co
                    hit = tree.find_nearest(p)
                    if hit is None or hit[0] is None:
                        continue
                    loc, nor = hit[0], hit[1]
                    if any((loc - r).length < 0.05 for r in rim):
                        continue        # open edge: the normal means nothing
                    # Signed: negative means the point sits behind the surface.
                    gap = (p - loc).dot(nor)
                    if gap < worst["pen"][0]:
                        worst["pen"] = (gap, f)
                        # ⚠️ A FAILURE THAT CANNOT SAY WHERE IT IS gets fixed
                        # by guesswork. I moved this one from f6 to f24 to f18
                        # to f16 patching frames blind before adding this.
                        pen_at[0] = (s_, tuple(round(c, 3) for c in p),
                                     tuple(round(c, 3) for c in loc))
        pk, pw = plate_poke(ev)
        if pk > worst["poke"][0]:
            worst["poke"] = (pk, f, pw)
        human.evaluated_get(dg).to_mesh_clear()

    for key in ("wrist", "elbow", "knee"):
        val, f = worst[key]
        bad = val > LIMITS[key]
        if bad:
            fails.append((name, key, val, f))
        print("%-7s %-6s %6.1f deg  (f%-3d) limit %.0f  %s"
              % (name, key, val, f, LIMITS[key], "FAIL" if bad else "ok"))
    for part, lim in TWIST_LIMITS.items():
        val, f = twist[part]
        tag = "  (some frames unmeasurable)" if part in nodata else ""
        bad = val > lim
        if bad:
            fails.append((name, "%s-TWIST" % part, val, f))
        print("%-7s %-6s %6.1f deg  (f%-3d) limit %.0f  %s%s"
              % (name, part[:5] + "~", val, f, lim, "FAIL" if bad else "ok", tag))
    pk, f, pw = worst["poke"]
    print("%-7s %-6s %6d vts  (f%-3d) %s"
          % (name, "poke", pk, f, "SUSPECT - not gated, see POKE_VERTS"))
    gap, f = worst["pen"]
    # ⚠️ 1e9 MEANS EVERY CANDIDATE WAS DISCARDED, NOT THAT THE CLIP IS CLEAN.
    # The rim exclusion can leave a clip with nothing tested at all, and a
    # silent "ok" there is a check pretending to work.
    if gap > 1e8:
        print("%-7s %-6s %s" % (name, "pen", "NO DATA - every hit fell on an open edge"))
        continue
    bad = gap < PENETRATION_MARGIN
    if bad:
        fails.append((name, "hand-in-torso", gap, f))
    print("%-7s %-6s %6.3f gap  (f%-3d) limit %.2f  %s"
          % (name, "pen", gap, f, PENETRATION_MARGIN, "FAIL" if bad else "ok"))
    if bad and pen_at[0]:
        print("         hand_%s at %s   nearest torso point %s"
              % (pen_at[0][0], pen_at[0][1], pen_at[0][2]))

# ── ⚠️ A FAILURE HAS TO PHOTOGRAPH ITSELF ─────────────────────────────────
# The two lessons that cost the most are here as CODE, not as advice:
#   FOUR ANGLES. One azimuth cannot separate absent geometry from occluded
#   geometry. I called an arm missing that was behind the torso, and a grip
#   fine that was mangled -- same mistake, opposite directions, same day.
#   AND A ZOOM. A 640px full body puts the hands at twenty pixels. Every time
#   I looked at one I was wrong; every time I magnified I was right in seconds.
# So the harness never asks anyone to go and find the frame. It renders it.
if fails and SHEETS:
    os.makedirs(OUT, exist_ok=True)
    want = sorted({(n, int(f)) for n, _k, _v, f in fails})
    print("")
    print("SHEETS -> %s" % OUT)
    sc.render.resolution_x, sc.render.resolution_y = 520, 660
    sc.render.image_settings.file_format = "PNG"
    for clip, frame in want:
        arm.animation_data.action = bpy.data.actions[clip]
        sc.frame_set(frame)
        for az in (34, -55, 125, 215):
            cam_for(az)
            sc.render.filepath = os.path.join(OUT, "%s_f%02d_az%d.png" % (clip, frame, az))
            bpy.ops.render.render(write_still=True)
        print("   %s f%d  4 angles" % (clip, frame))

print("=" * 78)
if fails:
    print("QA FAILED — %d check(s):" % len(fails))
    for n, k, v, f in fails:
        print("   %s  %s  %.2f at frame %d" % (n, k, v, f))
else:
    print("QA PASSED — every clip inside every limit")
print("=" * 78)
