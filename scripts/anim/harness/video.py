import bpy, os, glob

# ═══════════════════════════════════════════════════════════════════════════
# VIDEO — IF IT MOVES, THE DELIVERABLE IS A VIDEO
#
# Luke, 2026-11-05, on the pickaxe swing that took hours and arrived bad:
# how do I stop doing this. The answer was not a new insight -- it was an
# ORDER OF OPERATIONS, and step one is this file:
#
#   ⚠️ I JUDGED AN ANIMATION FROM STILL SHEETS FOR HOURS. A pose sheet cannot
#      show weight, timing, or an arm that never leaves the torso. Three of
#      the defects Luke named -- "he's juggling it", "now he's holding it
#      behind his back", "it looks like an umbrella" -- are all about MOTION
#      and not one of them is visible in a frame. There was no video step in
#      this pipeline at all. That is why the swing could be wrong for hours
#      while every still I had looked plausible.
#
# Blender cannot write a GIF, so this is H.264 MP4, and it LOOPS -- a 1.6
# second clip played once tells you nothing, and most players do not repeat.
#
# Assembled from the PNGs through the sequencer in the current scene rather
# than rendering the 3D view straight to FFMPEG, for two reasons: the frames
# are worth keeping (any one of them is a still I can magnify later), and a
# loop is three strips instead of three renders.
# ═══════════════════════════════════════════════════════════════════════════


def from_pngs(files, out_path, fps=24, loops=3, res=None):
    """Assemble `files` (in order) into a looping MP4 at `out_path`.

    Uses the current scene's sequencer and puts it back as it found it, so
    this can be called between 3D renders.
    """
    if not files:
        raise ValueError("no frames to assemble")
    sc = bpy.context.scene
    files = [os.path.abspath(p) for p in files]
    n = len(files)

    se = sc.sequence_editor_create()
    for s in list(se.sequences_all):
        se.sequences.remove(s)

    for k in range(loops):
        try:
            st = se.sequences.new_image(name="loop%d" % k, filepath=files[0],
                                        channel=1, frame_start=1 + k * n,
                                        fit_method="ORIGINAL")
        except TypeError:        # older signature, no fit_method
            st = se.sequences.new_image(name="loop%d" % k, filepath=files[0],
                                        channel=1, frame_start=1 + k * n)
        for p in files[1:]:
            st.elements.append(os.path.basename(p))

    keep = (sc.render.image_settings.file_format, sc.render.filepath,
            sc.frame_start, sc.frame_end, sc.render.use_sequencer,
            sc.render.fps, sc.render.use_file_extension,
            sc.render.resolution_x, sc.render.resolution_y)
    try:
        if res:
            sc.render.resolution_x, sc.render.resolution_y = res
        sc.render.use_sequencer = True
        sc.render.fps = fps
        sc.frame_start, sc.frame_end = 1, n * loops
        sc.render.image_settings.file_format = "FFMPEG"
        sc.render.ffmpeg.format = "MPEG4"
        sc.render.ffmpeg.codec = "H264"
        sc.render.ffmpeg.constant_rate_factor = "HIGH"
        sc.render.ffmpeg.ffmpeg_preset = "GOOD"
        sc.render.ffmpeg.audio_codec = "NONE"
        base = os.path.splitext(out_path)[0]
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        # ⚠️ BLENDER DECIDES THE VIDEO FILENAME, NOT YOU. For a movie format
        # it appends the frame range: "Mine0001-0120.mp4". Four rounds of a
        # previous bug were spent inspecting a stale copy of a file that was
        # being written somewhere else, so this globs for what was actually
        # produced and renames it, then reports the real path.
        for old in glob.glob(base + "*.mp4"):
            os.remove(old)
        sc.render.use_file_extension = True
        sc.render.filepath = base
        bpy.ops.render.render(animation=True)
        made = sorted(glob.glob(base + "*.mp4"), key=os.path.getmtime)
        if not made:
            raise RuntimeError("ffmpeg wrote nothing for %s" % out_path)
        src = made[-1]
        if os.path.abspath(src) != os.path.abspath(out_path):
            if os.path.exists(out_path):
                os.remove(out_path)
            os.rename(src, out_path)
    finally:
        for s in list(se.sequences_all):
            se.sequences.remove(s)
        (sc.render.image_settings.file_format, sc.render.filepath,
         sc.frame_start, sc.frame_end, sc.render.use_sequencer,
         sc.render.fps, sc.render.use_file_extension,
         sc.render.resolution_x, sc.render.resolution_y) = keep
    return out_path, n * loops
