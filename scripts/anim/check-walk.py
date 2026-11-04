import bpy, math, os, sys
from mathutils import Vector

# ── THE GATE ─────────────────────────────────────────────────────────────────
# Seven assertions, all arithmetic. Every defect this walk has shipped so far
# fails at least one of them, including the backward knee I could not see and
# the hip bob that silently never applied.
OUT = os.environ.get("OUT_DIR", ".")
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "build-walk.py")).read())

sc = bpy.context.scene
rows = []
for f in range(1, FRAMES + 1):
    sc.frame_set(f)
    bpy.context.view_layer.update()
    # ⚠️ RE-READ matrix_world EVERY FRAME. The hip bob animates the armature
    # OBJECT, so a matrix captured once outside this loop is stale from frame 2
    # onward -- which reported the feet floating by exactly the bob amount and
    # sent me looking for a bug in the walk instead of in the measurement.
    W = arm.matrix_world.copy()
    r = {"f": f}
    for s in ("l", "r"):
        hip = W @ arm.pose.bones["thigh_%s" % s].head
        knee = W @ arm.pose.bones["calf_%s" % s].head
        ank = W @ arm.pose.bones["foot_%s" % s].head
        toe = W @ arm.pose.bones["ball_%s" % s].tail
        th, sh = (knee - hip).length, (ank - knee).length
        span = (ank - hip).length
        cosk = max(-1.0, min(1.0, (th * th + sh * sh - span * span) / (2 * th * sh)))
        r["%s_knee_deg" % s] = math.degrees(math.acos(cosk))
        t = (knee.z - hip.z) / (ank.z - hip.z) if abs(ank.z - hip.z) > 1e-6 else 0.0
        r["%s_pole" % s] = knee.y - (hip.y + t * (ank.y - hip.y))
        # Thigh elevation from straight-down. A walk peaks near 25 deg; a
        # march drives the thigh toward horizontal (90).
        d = (knee - hip)
        r["%s_thigh_deg" % s] = math.degrees(math.atan2(math.hypot(d.x, d.y), -d.z))
        r["%s_ank_y" % s] = ank.y
        r["%s_ank_z" % s] = ank.z
        r["%s_toe_z" % s] = toe.z
        r["%s_sole" % s] = min(ank.z - ANKLE_H, toe.z)
    for s in ("l", "r"):
        d = (W @ arm.pose.bones["lowerarm_%s" % s].head) - (W @ arm.pose.bones["upperarm_%s" % s].head)
        r["%s_arm_elev" % s] = math.degrees(math.atan2(math.hypot(d.x, d.y), -d.z))
    r["hip_z"] = (W @ arm.pose.bones["pelvis"].head).z
    # ── GROUND TRUTH: THE DEFORMED MESH ITSELF ────────────────────────────
    # Deriving the sole from bone positions means approximating where the foot
    # surface is, and that approximation has no heel -- so heel strike read as
    # airborne. The evaluated mesh has every vertex of the actual foot in it.
    dg = bpy.context.evaluated_depsgraph_get()
    ev = human.evaluated_get(dg)
    mw = ev.matrix_world
    r["mesh_low"] = min((mw @ v.co).z for v in ev.data.vertices)
    r["low"] = min(r["l_sole"], r["r_sole"])
    r["stride"] = abs(r["l_ank_y"] - r["r_ank_y"])
    rows.append(r)

base = FLOOR
# ⚠️ GROUND IS THE MEDIAN, NOT THE MINIMUM. Anchoring to min() lets a single
# sunken frame redefine the floor, after which every correctly planted frame
# reports as "lifted" -- which is exactly backwards and sent me chasing a
# lifting bug that did not exist while the real defect was penetration.
_ml = sorted(r["mesh_low"] for r in rows)
MESH_FLOOR = _ml[len(_ml) // 2]
fails = []
def check(name, ok, detail):
    print("  %-26s %s  %s" % (name, "PASS" if ok else "FAIL", detail))
    if not ok: fails.append(name)

print("")
print("  f | Lknee Lpole  | Rknee Rpole  | stride | hipZ   | L sole  R sole  (0 = on floor)")
for r in rows:
    print("  %2d | %5.0f %+7.4f | %5.0f %+7.4f | %6.3f | %+6.3f | %+.4f %+.4f" % (
        r["f"], r["l_knee_deg"], r["l_pole"], r["r_knee_deg"], r["r_pole"],
        r["stride"], r["hip_z"], r["l_sole"] - base, r["r_sole"] - base))
print("")

worst_pole = max(max(r["l_pole"], r["r_pole"]) for r in rows)
check("knee points forward", worst_pole < -0.002,
      "worst knee offset %+.4f (must be negative on BOTH legs, every frame)" % worst_pole)

# The SWING leg is meant to fold -- it tucks under to clear the ground. Only
# the leg carrying the body has to stay near straight, so the crouch test
# applies to the STANCE leg alone.
stance_knees = []
for i, r in enumerate(rows):
    s_ = "l" if (i / FRAMES) < 0.5 else "r"
    stance_knees.append(r["%s_knee_deg" % s_])
mink, maxk = min(stance_knees), max(stance_knees)
swing_min = min(min(r["l_knee_deg"], r["r_knee_deg"]) for r in rows)
check("stance leg not crouched", 145 <= mink and maxk <= 179.3,
      "stance knee %.0f..%.0f deg, swing folds to %.0f" % (mink, maxk, swing_min))

air = [r["f"] for r in rows if r["mesh_low"] - MESH_FLOOR > 0.012]
check("a foot is always down", not air, "max lift off floor %.4f, frames %s" % (
    max(r["mesh_low"] - MESH_FLOOR for r in rows), air or "none"))

sink = [r["f"] for r in rows if r["mesh_low"] - MESH_FLOOR < -0.012]
check("no foot through floor", not sink, "deepest %.4f, frames %s" % (
    min(r["mesh_low"] - MESH_FLOOR for r in rows), sink or "none"))

slides = {}
for s in ("l", "r"):
    pl = [r["%s_ank_y" % s] for r in rows if r["%s_sole" % s] - base < 0.012]
    slides[s] = (max(pl) - min(pl)) if len(pl) > 1 else 0.0
    # a planted foot in an in-place walk MUST travel backward; what must not
    # happen is the foot moving while it is supposed to be stuck mid-stance
check("stance count", min(len([r for r in rows if r["%s_sole" % s] - base < 0.012]) for s in ("l", "r")) >= FRAMES * 0.35,
      "L %d frames, R %d frames down of %d" % (
          len([r for r in rows if r["l_sole"] - base < 0.012]),
          len([r for r in rows if r["r_sole"] - base < 0.012]), FRAMES))

ms = max(r["stride"] for r in rows)
check("stride length", 0.50 <= ms <= 0.78, "max separation %.3f" % ms)

hips = [r["hip_z"] for r in rows]
bob = max(hips) - min(hips)
check("hip bob present", 0.025 <= bob <= 0.11, "travel %.3f" % bob)

sym = max(abs(rows[i]["l_knee_deg"] - rows[(i + FRAMES // 2) % FRAMES]["r_knee_deg"]) for i in range(FRAMES))
check("left/right symmetry", sym < 6.0, "worst half-cycle mismatch %.1f deg" % sym)

maxarm = max(max(r["l_arm_elev"], r["r_arm_elev"]) for r in rows)
minarm = min(min(r["l_arm_elev"], r["r_arm_elev"]) for r in rows)
check("arms hang at the sides", maxarm <= 30.0,
      "upper arm %.0f..%.0f deg from vertical (hanging ~10-20, A-pose 42, T-pose 90)" % (minarm, maxarm))

maxthigh = max(max(r["l_thigh_deg"], r["r_thigh_deg"]) for r in rows)
check("no marching", maxthigh <= 34.0, "peak thigh lift %.0f deg from vertical (walk ~25, march 60+)" % maxthigh)

print("")
print("  RESULT: %s" % ("ALL PASS" if not fails else "FAILED -> " + ", ".join(fails)))
