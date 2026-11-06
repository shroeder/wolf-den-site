import bpy, os, sys, math, importlib

# ── SOLVE THE GRIP'S COUPLED PARAMETERS TOGETHER ──────────────────────────
# ⚠️ A ONE-AT-A-TIME SWEEP OF COUPLED PARAMETERS CHASES ITS OWN TAIL. I have
# now re-swept the shaft roll three times in one session, and each time it was
# because something upstream of it moved:
#
#     310  chosen when the pole sweep scored wrist bend alone
#     345  after the curl-sign fix changed what the left hand demands
#     321  after the grip solve was reworked to wrap the fingers
#
# and every one of those numbers was "the answer" until the next change. Now
# GRIP_LO is in play too, and sweeping it against a roll tuned for the OLD
# GRIP_LO scores every candidate on a handicap: 0.10 and 0.14 read as OVER
# THE LIMIT, which may be the roll's fault rather than theirs.
#
# So sweep the pair. For each hand position, re-solve the roll from scratch
# and report that position's BEST achievable wrist -- which is the only
# honest way to compare them -- then photograph the winner of each.
HERE = os.path.dirname(os.path.abspath(__file__))
ANIM = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, ANIM)
_PROBE_OUT = os.path.join(ANIM, "_film", "_gripsolve")
APEX = int(os.environ.get("APEX", "18"))
CAND = [float(x) for x in os.environ.get("CAND", "0.05,0.10,0.14,0.18").split(",")]
ROLLS = [float(x) for x in os.environ.get("ROLLS",
         "0,45,90,135,180,225,270,315").split(",")]

print("")
print("=" * 74)
print("GRIP_LO x ROLL — each hand position judged at ITS OWN best roll")
print("=" * 74)
table = []
for lo in CAND:
    os.environ["GRIP_LO_TEST"] = "%.3f" % lo
    bpy.ops.wm.read_homefile(use_empty=True)
    g = {"__name__": "__main__"}
    for _s in ("build-walk.py", "build-twist.py", "build-armour.py",
               "build-pick.py"):
        g["__file__"] = os.path.join(ANIM, _s)
        exec(open(g["__file__"]).read(), g)
    sys.path.insert(0, HERE)
    import clips, shot as _shot, kit as _kit
    importlib.reload(clips)
    clips.init(g)
    arm, human = g["arm"], g["human"]
    sc = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()

    def bend_for(roll):
        clips.ROLL_TEST = roll
        clips.key_mine()
        worst = 0.0
        for f in range(1, 41):
            sc.frame_set(f)
            dg.update()
            for s_ in ("l", "r"):
                fa = (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].tail) - \
                     (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].head)
                hd = (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].tail) - \
                     (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].head)
                if fa.length > 1e-6 and hd.length > 1e-6:
                    worst = max(worst, math.degrees(fa.angle(hd)))
        return worst

    scores = [(r, bend_for(r)) for r in ROLLS]
    best_roll, best_bend = min(scores, key=lambda x: x[1])
    print("   GRIP_LO %.3f  best roll %5.1f  ->  wrist %5.1f   %s"
          % (lo, best_roll, best_bend, "ok" if best_bend <= 80 else "OVER"))
    print("        %s" % "  ".join("%.0f:%.0f" % (r, b) for r, b in scores))
    table.append((lo, best_roll, best_bend))

    bend_for(best_roll)
    sc.frame_set(APEX)
    dg.update()
    _shot._STAGED[0] = False
    _shot.stage(human)
    _kit.set_kit("Mine")
    c, w = _shot.region(arm, human, "grip")
    for az in (-55, 125):
        _shot.frame_on(c, w, az)
        _shot.shoot(os.path.join(_PROBE_OUT, "lo%03d_roll%03d_f%02d_az%d.png"
                                 % (int(lo * 1000), int(best_roll), APEX, az)),
                    res=(900, 900))
print("=" * 74)
for lo, r, b in table:
    print("   GRIP_LO %.3f -> roll %.1f, wrist %.1f" % (lo, r, b))
print("GRIPSOLVE_OK %s   — now LOOK; the numbers only say what is legal"
      % _PROBE_OUT)
