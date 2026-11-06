import bpy, os, sys, math
from mathutils import Vector

# ═══════════════════════════════════════════════════════════════════════════
# FILM — THE FIRST ARTEFACT, AND IT IS THE DELIVERABLE
#
#   "I don't want my 3D art pipeline to hand me problems. I want it to hand
#    me art."  — Luke, 2026-11-05
#
# This runs BEFORE a measurement and before a theory. It produces two things
# and they are for two different readers:
#
#   <Clip>.mp4          THE DELIVERABLE, looping, full figure, for Luke.
#                       An animation is a video. Every judgement I made about
#                       the swing from a still sheet was wrong, and the three
#                       defects he named -- juggling it, holding it behind his
#                       back, an umbrella -- live entirely in the motion.
#
#   <region>_f##_az##   THE INSTRUMENT, magnified, four angles, for me.
#                       I cannot read 3D art at composition scale. A 640px
#                       full body puts the hands at twenty pixels and I called
#                       a hand growing out of a man's abdomen "looks fine".
#                       Every single time I magnified I found the truth in
#                       seconds; I just never did it unprompted. So the
#                       harness does it unprompted, every run.
#
# ⚠️ IT PHOTOGRAPHS THE EXPORTED SCENE, NOT THE AUTHORING ONE. export-all.py
# runs first, so what is filmed is the state the GLB saw -- IK baked to bone
# keys, constraints gone, helpers deleted, modifiers applied. Three defects in
# a row were invisible from the source scene: helper geometry behind a
# modifier that never applies, a material assigned after the export call, and
# a body that was correct in Blender and wrong in the browser.
#
# Usage:
#   "C:\Program Files\Blender Foundation\Blender 4.4\blender.exe" -b \
#       --online-mode -P scripts/anim/harness/film.py
#
#   FILM_CLIP=Mine|all        default Mine
#   FILM_AZ=34|all            video azimuth(s); regions are always 4 angles
#   FILM_REGIONS=grip,head    default grip,hand_l,hand_r,head,shoulders,feet
#                             (none = skip, video only)
#   FILM_FRAMES=1,13,18       default: 8 evenly spaced across the clip
#   FILM_LOOPS=3  FILM_FPS=24  FILM_OUT=<dir>
# ═══════════════════════════════════════════════════════════════════════════

HERE = os.path.dirname(os.path.abspath(__file__))
ANIM = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, ANIM)

# ⚠️ THE PIPELINE SCRIPTS LOCATE THEMSELVES FROM `__file__`, AND exec DOES NOT
# GIVE THEM ONE OF THEIR OWN -- they inherit the caller's. Running them from a
# subdirectory therefore has export-all.py look for build-walk.py in here. Lie
# about `__file__` for the duration rather than rewriting six scripts.
_real_file = __file__
__file__ = os.path.join(ANIM, "export-all.py")
exec(open(__file__).read())
__file__ = _real_file

import importlib
import shot as _shot
import video as _video
import kit as _kit
for _m in (_shot, _video, _kit):
    importlib.reload(_m)

OUT = os.environ.get("FILM_OUT", os.path.join(ANIM, "_film"))
FPS = int(os.environ.get("FILM_FPS", "24"))
LOOPS = int(os.environ.get("FILM_LOOPS", "3"))
VID_RES = (720, 900)
REG_RES = (900, 900)

_want = os.environ.get("FILM_CLIP", "Mine")
CLIPS = [(n, e) for n, e, _c in STASHED] if _want == "all" else \
        [(n, e) for n, e, _c in STASHED if n == _want]
if not CLIPS:
    raise SystemExit("FILM_CLIP=%r is not a clip. Have: %s"
                     % (_want, ", ".join(n for n, _e, _c in STASHED)))

_az = os.environ.get("FILM_AZ", "34")
VID_AZ = list(_shot.ANGLES) if _az == "all" else [float(x) for x in _az.split(",")]

# FILM_VIDEO=0 shoots the instrument only. For a CONTROL -- the same region on
# a clip already known to render clean -- the video is 40 wasted renders, and
# the first probe I ever trusted without a control was measuring the wrong
# object entirely.
WANT_VIDEO = os.environ.get("FILM_VIDEO", "1") != "0"

_rg = os.environ.get("FILM_REGIONS",
                     "grip,hand_l,hand_r,head,shoulders,feet")
REGIONS = [] if _rg in ("none", "") else [r.strip() for r in _rg.split(",")]

_shot.stage(human, floor_z=FLOOR)
print("")
print("=" * 78)
print("FILM — the deliverable first")
print("=" * 78)
_lo, _hi, _h = _shot.measure(human)
print("figure %.3f units tall, floor at %.3f" % (_h, _lo))

made = []
for name, end in CLIPS:
    arm.animation_data_create()
    arm.animation_data.action = bpy.data.actions[name]
    held = _kit.set_kit(name)
    print("")
    print("%s — %d frames, holding %s" % (name, end, ", ".join(held) or "nothing"))

    _ff = os.environ.get("FILM_FRAMES", "")
    if _ff:
        sample = [int(x) for x in _ff.split(",")]
    else:
        # ⚠️ EVENLY SPACED, AND ALWAYS INCLUDING THE LAST FRAME. The worst
        # frame of Mine was f18 at the apex and the worst of an earlier
        # version was f12, mid-lift -- neither is a frame anybody would pick
        # by hand, and f12 was invisible to a metric that only looked at
        # frames I had chosen to look at.
        k = min(8, end)
        sample = sorted({1 + int(round(i * (end - 1) / float(k - 1)))
                         for i in range(k)}) if k > 1 else [1]

    # ── THE VIDEO ──────────────────────────────────────────────────────────
    # ⚠️ FRAME THE WHOLE CLIP, NOT THE FIRST POSE. full_body() measures the
    # figure as it stands right now, and the width was taken once from
    # whatever pose frame 1 happened to be -- so the moment he raised a hand
    # it went off the top of the picture, and the one thing the clip existed
    # to show was the thing not in shot. Sweep the clip's own vertical extent
    # off the skeleton first (cheap -- bones, not an evaluated mesh) and frame
    # to that, with the height fixed for the whole clip so the camera does not
    # breathe.
    ctr, w = _shot.full_body(human)
    _zlo, _zhi = 1e9, -1e9
    for f in range(1, end + 1):
        sc.frame_set(f)
        for pb in arm.pose.bones:
            for pt in (arm.matrix_world @ pb.head, arm.matrix_world @ pb.tail):
                _zlo, _zhi = min(_zlo, pt.z), max(_zhi, pt.z)
    _zlo = min(_zlo, FLOOR)
    _span = (_zhi - _zlo) * 1.16
    w = max(w, _span * VID_RES[0] / float(VID_RES[1]))
    _zmid = (_zlo + _zhi) * 0.5
    print("   frame  %.2f units tall over %d frames" % (_span, end))
    for az in (VID_AZ if WANT_VIDEO else []):
        fdir = os.path.join(OUT, name, "body_az%d" % int(az))
        frames = []
        for f in range(1, end + 1):
            sc.frame_set(f)
            # Re-frame per frame: a clip that TRAVELS walks out of a fixed
            # ortho frame, and _rootmove.py exists because I could not tell
            # which clips travel. Track the pelvis horizontally, hold Z.
            pel = arm.matrix_world @ arm.pose.bones["pelvis"].head
            c = Vector((pel.x, pel.y, _zmid))
            _shot.frame_on(c, w, az)
            frames.append(_shot.shoot(
                os.path.join(fdir, "f%04d.png" % f), res=VID_RES))
        mp4 = os.path.join(OUT, "%s_az%d.mp4" % (name, int(az)))
        path, nf = _video.from_pngs(frames, mp4, fps=FPS, loops=LOOPS,
                                    res=VID_RES)
        made.append(path)
        print("   VIDEO  %-28s %d frames x%d  %.1fs  %d KB"
              % (os.path.basename(path), end, LOOPS, nf / float(FPS),
                 os.path.getsize(path) // 1024))

    # ── THE INSTRUMENT ─────────────────────────────────────────────────────
    for rname in REGIONS:
        if rname not in _shot.REGIONS:
            print("   (no region %r — have %s)"
                  % (rname, ", ".join(sorted(_shot.REGIONS))))
            continue
        for f in sample:
            sc.frame_set(f)
            try:
                c, w2 = _shot.region(arm, human, rname)
            except KeyError as exc:
                print("   (%s)" % exc)
                break
            for az in _shot.ANGLES:
                _shot.frame_on(c, w2, az)
                _shot.shoot(os.path.join(OUT, name, "%s_f%02d_az%d.png"
                                         % (rname, f, int(az))), res=REG_RES)
        print("   ZOOM   %-10s %s  x4 angles  (%.0f mm wide)"
              % (rname, ",".join("f%d" % f for f in sample), w2 * 1000))

print("")
print("=" * 78)
print("FILM_OK  %s" % OUT)
for p in made:
    print("   %s" % p)
print("=" * 78)
