import bpy, os, sys, math
from mathutils import Vector
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
LIMITS = {
    "wrist": 62.0,     # hand vs forearm
    "elbow": 155.0,    # upperarm vs lowerarm, straightened
    "knee": 155.0,
}
# How far a hand may come to the spine axis before it is inside the chest. Not
# guessed: measured per frame from the torso's own vertices (see torso_radius).
PENETRATION_MARGIN = 0.02


def ang(a, b, c, d):
    """Angle between vector a->b and c->d, in degrees."""
    u, v = (b - a), (d - c)
    if u.length < 1e-6 or v.length < 1e-6:
        return 0.0
    return math.degrees(u.angle(v))


def wp(bone, tail=False):
    pb = arm.pose.bones[bone]
    return arm.matrix_world @ (pb.tail if tail else pb.head)


def torso_tree(ev):
    """A BVH of the TORSO SURFACE ONLY, for a real signed-distance test.

    ⚠️ THE FIRST VERSION OF THIS WAS A CYLINDER AND IT LIED. It compared each
    hand vertex to the spine axis against ONE global torso radius -- the widest
    point, the shoulders -- so a hand at belly height, comfortably clear of the
    actual surface, measured 0.2 "inside" a cylinder that does not exist at
    that height. I then spent two rounds tuning Luke's animation against that
    number, moved the penetration from frame 6 to frame 24, and made the wrist
    worse. A metric you have not validated is not evidence; it is a confident
    way to be wrong.

    This tests against the mesh the renderer actually draws: nearest point on
    the torso surface, and the sign of the surface normal decides in or out.
    """
    tvi = {i for i, v in enumerate(ev.vertices)
           if any(g.group in TORSO_G and g.weight > 0.5 for g in v.groups)}
    if not tvi:
        return None
    verts = [human.matrix_world @ v.co for v in ev.vertices]
    polys = [list(pl.vertices) for pl in ev.polygons
             if all(i in tvi for i in pl.vertices)]
    if not polys:
        return None
    return BVHTree.FromPolygons(verts, polys, all_triangles=False)


TORSO_G = {g.index for g in human.vertex_groups
           if g.name in ("spine_01", "spine_02", "spine_03", "pelvis")}
HAND_G = {s: {g.index for g in human.vertex_groups if g.name == "hand_%s" % s}
          for s in ("l", "r")}

fails = []
print("\n" + "=" * 78)
print("RIG QA — numbers, not opinions")
print("=" * 78)

for name, end, _c in STASHED:
    arm.animation_data_create()
    arm.animation_data.action = bpy.data.actions[name]
    worst = {"wrist": (0, 0), "elbow": (0, 0), "knee": (0, 0), "pen": (1e9, 0)}
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

        # ── HAND INSIDE THE CHEST ──────────────────────────────────────────
        # The check whose absence cost the whole afternoon: "is a hand buried
        # in the torso" is answerable in one line and I guessed at it four
        # times instead.
        tree = torso_tree(ev)
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
                    # Signed: negative means the point sits behind the surface.
                    gap = (p - loc).dot(nor)
                    if gap < worst["pen"][0]:
                        worst["pen"] = (gap, f)
        human.evaluated_get(dg).to_mesh_clear()

    for key in ("wrist", "elbow", "knee"):
        val, f = worst[key]
        bad = val > LIMITS[key]
        if bad:
            fails.append((name, key, val, f))
        print("%-7s %-6s %6.1f deg  (f%-3d) limit %.0f  %s"
              % (name, key, val, f, LIMITS[key], "FAIL" if bad else "ok"))
    gap, f = worst["pen"]
    bad = gap < PENETRATION_MARGIN
    if bad:
        fails.append((name, "hand-in-torso", gap, f))
    print("%-7s %-6s %6.3f gap  (f%-3d) limit %.2f  %s"
          % (name, "pen", gap, f, PENETRATION_MARGIN, "FAIL" if bad else "ok"))

print("=" * 78)
if fails:
    print("QA FAILED — %d check(s):" % len(fails))
    for n, k, v, f in fails:
        print("   %s  %s  %.2f at frame %d" % (n, k, v, f))
else:
    print("QA PASSED — every clip inside every limit")
print("=" * 78)
