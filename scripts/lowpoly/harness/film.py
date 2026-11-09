import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import shot      # noqa: E402
import style     # noqa: E402
import video     # noqa: E402

# ═══════════════════════════════════════════════════════════════════════════
# FILM — STEP ONE, AND THE DELIVERABLE
#
#     npm run lp:film                  # every model, plus the line-up
#     MODEL=player npm run lp:film     # one
#
# ⚠️ A STATIC MODEL STILL GETS A VIDEO, AND IT IS A TURNTABLE.
#    The old pipeline's hard lesson was that a pose sheet cannot show motion.
#    The low-poly version of that lesson is that a still cannot show a
#    SILHOUETTE: flat-shaded geometry changes character completely as it
#    turns, faces flip from lit to unlit in one step, and a gap between two
#    stacked cones is invisible from three of six sides. Four stills plus a
#    full rotation is the only honest look at a faceted object.
#
# ⚠️ AND THE LINE-UP IS PART OF THE DELIVERABLE, NOT A NICETY.
#    Every model rendered alone fills its own frame and therefore looks
#    correctly sized. Scale errors are only visible in company, next to the
#    figure that defines the unit -- which is exactly how a "big" tree ends
#    up ankle height. The last file this writes is every model standing on
#    one floor beside the player.
# ═══════════════════════════════════════════════════════════════════════════

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(ROOT, "scripts", "lowpoly", "_film")
MANIFEST = os.path.join(ROOT, "public", "models", "lp", "manifest.json")

TURN_FRAMES = 24          # 15 degrees a step
TURN_FPS = 20


def manifest():
    with open(MANIFEST, "r", encoding="utf-8") as fh:
        return json.load(fh)["models"]


def turntable(entry):
    """A full rotation as an mp4, plus four stills. Returns (video, stills)."""
    shot.wipe_scene()
    ob = shot.load_glb(os.path.join(ROOT, "public", entry["url"].lstrip("/")))
    shot.stage()
    center, width = shot.full_body(ob)

    frames = []
    d = os.path.join(OUT, entry["id"])
    for i in range(TURN_FRAMES):
        az = 360.0 * i / TURN_FRAMES
        shot.frame_on(center, width, az)
        frames.append(shot.shoot(os.path.join(d, "turn_%03d.png" % i),
                                 res=(640, 640)))
    mp4, nframes = video.from_pngs(frames, os.path.join(OUT, "%s_turn.mp4"
                                                        % entry["id"]),
                                   fps=TURN_FPS, loops=2, res=(640, 640))

    stills = []
    for az in shot.ANGLES:
        shot.frame_on(center, width, az)
        stills.append(shot.shoot(
            os.path.join(OUT, "%s_az%d.png" % (entry["id"], az)),
            res=(900, 900)))
    print("VIDEO %s (%d frames)" % (mp4, nframes))
    for s in stills:
        print("STILL %s" % s)
    return mp4, stills


def lineup(entries):
    """Every model on one floor, player first, spaced by their own widths."""
    shot.wipe_scene()
    shot.stage(ground_size=40)
    order = ([e for e in entries if e["id"] == "player"]
             + [e for e in entries if e["id"] != "player"])
    x = 0.0
    tallest = style.PLAYER_HEIGHT
    for e in order:
        ob = shot.load_glb(os.path.join(ROOT, "public", e["url"].lstrip("/")),
                           name="L_%s" % e["id"])
        lo, hi = shot.bounds(ob)
        half = max(hi.x - lo.x, 0.5) / 2.0
        x += half + 0.45
        ob.location.x = x
        x += half
        tallest = max(tallest, hi.z)
    width = x + 1.4

    out = []
    for az in (0, 34):
        shot.frame_on((x / 2.0, 0, tallest * 0.45), width, az, elev=12.0)
        out.append(shot.shoot(os.path.join(OUT, "lineup_az%d.png" % az),
                              res=(1500, 760)))
    for p in out:
        print("LINEUP %s" % p)
    return out


def main():
    want = os.environ.get("MODEL", "all").strip()
    entries = manifest()
    if want not in ("", "all"):
        entries = [e for e in entries if e["id"] == want]
        if not entries:
            print("NO SUCH MODEL IN THE MANIFEST: %s. Run lp:make first." % want)
            sys.exit(1)
    os.makedirs(OUT, exist_ok=True)
    for e in entries:
        turntable(e)
    # The line-up always shows the whole set, even when one model was filmed:
    # a scale check of one object against nothing is not a check.
    lineup(manifest())
    print("FILMED %d" % len(entries))


main()
