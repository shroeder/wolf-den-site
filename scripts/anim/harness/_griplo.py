import bpy, os, sys, math
from mathutils import Vector

# ── WHERE ON THE HAFT DOES THE OFF HAND GO? ───────────────────────────────
# GRIP_LO was 0.05 and nobody ever swept it. At the apex the butt's end face
# is visible in frame with the off hand curled over the air just past it.
#
# ⚠️ EACH CANDIDATE NEEDS A FULL REBUILD, because the grip offset is baked
# into hand_mount() at build time -- the hand's goal is derived from its own
# measured grip frame against that position. So this is a separate script
# from _offgrip.py, which only re-keys.
#
# Prints, per candidate: how far the hand's grip centre sits from the butt of
# the wood (in fists), and the gated wrist figure. Then LOOK at the renders.
HERE = os.path.dirname(os.path.abspath(__file__))
ANIM = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, ANIM)
_PROBE_OUT = os.path.join(ANIM, "_film", "_griplo")
APEX = int(os.environ.get("APEX", "18"))
CAND = [float(x) for x in os.environ.get("CAND", "0.05,0.10,0.14,0.18").split(",")]

results = []
for lo in CAND:
    os.environ["GRIP_LO_TEST"] = "%.3f" % lo
    # A fresh file per candidate: build-pick mutates the rig and the mounts.
    bpy.ops.wm.read_homefile(use_empty=True)
    g = {"__name__": "__main__"}
    for _s in ("build-walk.py", "build-twist.py", "build-armour.py",
               "build-pick.py"):
        g["__file__"] = os.path.join(ANIM, _s)
        exec(open(g["__file__"]).read(), g)
    sys.path.insert(0, HERE)
    import importlib, clips, shot as _shot, kit as _kit
    importlib.reload(clips)
    clips.init(g)
    clips.key_mine()

    arm, human, TOOL = g["arm"], g["human"], g["TOOL"]
    SHAFT_R, LEG = g["SHAFT_R"], g["LEG"]
    OFF_HAND, PICK_HAND = g["OFF_HAND"], g["PICK_HAND"]
    sc = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()

    bend = 0.0
    for f in range(1, 41):
        sc.frame_set(f)
        dg.update()
        for s_ in ("l", "r"):
            fa = (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].tail) - \
                 (arm.matrix_world @ arm.pose.bones["lowerarm_%s" % s_].head)
            hd = (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].tail) - \
                 (arm.matrix_world @ arm.pose.bones["hand_%s" % s_].head)
            if fa.length > 1e-6 and hd.length > 1e-6:
                bend = max(bend, math.degrees(fa.angle(hd)))

    sc.frame_set(APEX)
    dg.update()
    # Where does the wood actually stop? Take the butt as the lowest vertex
    # on the shaft's own axis, measured in tool space.
    inv = TOOL.matrix_world.inverted()
    ev = bpy.data.objects["Pickaxe"].evaluated_get(dg)
    me = ev.to_mesh()
    zs = [(inv @ (ev.matrix_world @ v.co)).z for v in me.vertices]
    butt = min(zs)
    ev.to_mesh_clear()
    fist = 0.075 * LEG
    print("   GRIP_LO %.3f  grip centre %+.3f, butt %+.3f -> %+.2f fists above "
          "the end   wrist %5.1f %s"
          % (lo, lo * LEG, butt, (lo * LEG - butt) / fist, bend,
             "ok" if bend <= 80 else "OVER"))
    results.append((lo, bend))

    _shot._STAGED[0] = False
    _shot.stage(human)
    _kit.set_kit("Mine")
    c, w = _shot.region(arm, human, "grip")
    for az in (-55, 34):
        _shot.frame_on(c, w, az)
        _shot.shoot(os.path.join(_PROBE_OUT, "lo%03d_f%02d_az%d.png"
                                 % (int(lo * 1000), APEX, az)), res=(900, 900))
print("GRIPLO_OK %s" % _PROBE_OUT)
