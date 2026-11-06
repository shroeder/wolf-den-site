import bpy, math, os
from mathutils import Vector

# ═══════════════════════════════════════════════════════════════════════════
# SHOT — PUT THE CAMERA ON THE DEFECT, NOT ON THE COMPOSITION
#
# This exists because of one sentence I wrote in qa.py and then did not
# implement: "A 640px full body puts the hands at twenty pixels. Every time I
# looked at one I was wrong; every time I magnified I was right in seconds."
# The sheet block underneath that comment renders a 520x660 FULL FIGURE. The
# lesson was in the file as prose and absent as code, which is the same as
# absent.
#
# So framing is a WIDTH IN WORLD UNITS around a point read off the posed
# skeleton. `frame_on(hands_mid, 0.45, az)` is 45cm of a 2.2m man filling the
# frame -- a real magnified render, not an upscaled crop of a wide one.
#
#   ⚠️ FOUR ANGLES, ALWAYS. One azimuth cannot separate absent geometry from
#      occluded geometry. I called an arm MISSING that was behind the torso
#      and a grip FINE that was mangled, same day, opposite directions.
#      ANGLES is the default and nothing here takes a single azimuth.
#
#   ⚠️ NO CONTACT SHEETS. A tiled sheet is for comparing options; it is NOT
#      for deciding whether one thing is correct, and every time I judged
#      from a 230px cell in an 8-wide grid I was confidently wrong. This
#      module deliberately has no tiler. One file per look, full size.
#
# Import it after the scene exists (export-all.py has run) and hand it the
# objects; it keeps no module-level reference to the character.
# ═══════════════════════════════════════════════════════════════════════════

ANGLES = (34, -55, 125, 215)

_STAGED = [False]


def measure(human):
    """(floor_z, top_z, height) of the character as it stands right now."""
    zs = [(human.matrix_world @ v.co).z for v in human.data.vertices]
    return min(zs), max(zs), max(zs) - min(zs)


def stage(human, ground=True, bg=(0.40, 0.44, 0.49, 1.0)):
    """Lights, world and floor. Idempotent -- safe to call per shot."""
    if _STAGED[0]:
        return
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    # ⚠️ NOT OPTIONAL. Blender 4.x defaults to AgX, which is built for
    # photographic footage and washes a flat stylised palette out completely.
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.image_settings.file_format = "PNG"
    sc.world = bpy.data.worlds.new("ShotWorld")
    sc.world.use_nodes = True
    sc.world.node_tree.nodes["Background"].inputs[0].default_value = bg

    lo, hi, _h = measure(human)
    mid = Vector((0, 0, (lo + hi) * 0.52))
    if ground:
        bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, lo))
        gob = bpy.context.active_object
        gob.name = "ShotGround"
        gm = bpy.data.materials.new("ShotGroundMat")
        gm.use_nodes = True
        gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"] \
            .default_value = (0.26, 0.28, 0.31, 1)
        gob.data.materials.append(gm)

    # ⚠️ KEEP THE KEY LOW AND FRONTAL. A light high overhead carves a shadow
    # under the pectoral that reads as a breast, and I spent an afternoon
    # looking for a modelling bug that was a light.
    for nm, energy, loc, size in (("shot_key", 320, (2.4, -3.2, 2.2), 3.0),
                                  ("shot_fill", 90, (-3.0, -2.2, 1.6), 4.0),
                                  ("shot_rim", 190, (-1.0, 3.2, 2.6), 2.5)):
        d = bpy.data.lights.new(nm, type="AREA")
        d.energy = energy
        d.size = size
        o = bpy.data.objects.new(nm, d)
        bpy.context.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (mid - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    _STAGED[0] = True


def frame_on(center, width, azim, elev=7.0, dist=9.0):
    """Ortho camera `azim` degrees round `center`, framing `width` world units.

    width IS the magnification -- it is the horizontal extent of the frame in
    the same units the character is measured in, so a 2.2-unit figure at
    width=2.6 is a full body and the same figure at width=0.45 is two fists.
    """
    sc = bpy.context.scene
    center = Vector(center)
    cam = bpy.data.objects.get("ShotCam")
    if cam is None:
        cd = bpy.data.cameras.new("ShotCam")
        cd.type = "ORTHO"
        cam = bpy.data.objects.new("ShotCam", cd)
        bpy.context.collection.objects.link(cam)
    cam.data.ortho_scale = width
    sc.camera = cam
    a, e = math.radians(azim), math.radians(elev)
    cam.location = (center.x + dist * math.sin(a) * math.cos(e),
                    center.y - dist * math.cos(a) * math.cos(e),
                    center.z + dist * math.sin(e))
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    return cam


def shoot(path, res=(900, 900)):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    return path


# ── WHERE THE DEFECTS LIVE ────────────────────────────────────────────────
# Read off the POSED skeleton every frame, so a region tracks the thing it is
# named after instead of hovering where that thing was in the rest pose. The
# widths are the figure's own height times a fraction, so they survive a
# shorter or heavier hero out of MPFB.
#
# ⚠️ EVERY ONE OF THESE IS A DEFECT I MISSED AT COMPOSITION SCALE, not a list
# of body parts. grip: a hand growing out of the man's abdomen. head: the
# haft walking across his face at the apex. feet: a point that never reached
# the floor. shoulders: 179 degrees of upperarm twist on a frame whose
# neighbours were clean.
REGIONS = {
    "grip":      (("hand_l", "hand_r"), 0.26),
    "hand_l":    (("hand_l",), 0.16),
    "hand_r":    (("hand_r",), 0.16),
    "head":      (("head", "neck_01"), 0.30),
    "shoulders": (("upperarm_l", "upperarm_r", "spine_03"), 0.42),
    "feet":      (("foot_l", "foot_r"), 0.34),
    "body":      (("pelvis", "head"), 1.30),
}


def region(arm, human, name):
    """(center, width) for a named region, in world space, this frame."""
    bones, frac = REGIONS[name]
    pts = []
    for bn in bones:
        pb = arm.pose.bones.get(bn)
        if pb is None:
            continue
        pts.append(arm.matrix_world @ pb.head)
        pts.append(arm.matrix_world @ pb.tail)
    if not pts:
        raise KeyError("region %r: none of %s exist on this rig" % (name, bones))
    c = Vector((sum(p.x for p in pts) / len(pts),
                sum(p.y for p in pts) / len(pts),
                sum(p.z for p in pts) / len(pts)))
    _lo, _hi, h = measure(human)
    return c, max(h * frac, 0.08)


def full_body(human):
    """(center, width) framing the whole figure with a little air."""
    lo, hi, h = measure(human)
    return Vector((0, 0, (lo + hi) * 0.52)), h * 1.22
