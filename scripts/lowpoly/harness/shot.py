import math
import os

import bpy
from mathutils import Vector

# ═══════════════════════════════════════════════════════════════════════════
# SHOT — THE CAMERA AND THE LIGHT, AND IT PHOTOGRAPHS THE GLB
#
# Trimmed down from the old pipeline's shot.py. Three of its rules were paid
# for in full days and are kept verbatim:
#
#   ⚠️ view_transform = "Standard" IS NOT OPTIONAL. Blender 4.x defaults to
#      AgX, which is built for photographic footage and washes a flat
#      stylised palette out completely. A whole afternoon went on "why is the
#      green wrong" with the answer being a colour management dropdown.
#
#   ⚠️ FOUR ANGLES, ALWAYS. One azimuth cannot separate absent geometry from
#      occluded geometry. The old pipeline called an arm MISSING that was
#      behind a torso and a grip FINE that was mangled, same day, opposite
#      directions. Nothing here takes a single azimuth.
#
#   ⚠️ FRAMING IS A WIDTH IN WORLD UNITS, through an ORTHO camera. `width` is
#      the magnification: a 1.85 m figure at width=2.3 is a full body and the
#      same figure at width=0.4 is a head. A 900px full-body render puts a
#      hand at thirty pixels, and every judgement made at that scale was
#      wrong.
#
# What is NEW here, and the reason this file is short: IT LOADS THE GLB.
# The old harness photographed the Blender scene and the exporter then
# produced something else -- that is how five clips got baked before one was
# keyed. There is no build in this process at all; if it is not in the glb,
# it is not in the picture.
# ═══════════════════════════════════════════════════════════════════════════

ANGLES = (34, -55, 125, 215)
_STAGED = [False]


def load_glb(path, name=None):
    """Import one glb and return its mesh object, origin at the world origin."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("%s imported no mesh (got %s)"
                           % (path, [o.type for o in new]))
    ob = meshes[0]
    # glTF is Y-up; the importer re-parents under an empty with a -90 X
    # rotation. Flatten that so z is up again and measurements mean metres
    # off the floor rather than metres along some parent's axis.
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    ob.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o is not ob and o.type == "EMPTY":
            bpy.data.objects.remove(o, do_unlink=True)
    if name:
        ob.name = name
    return ob


def wipe_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    _STAGED[0] = False


def bounds(ob):
    co = [ob.matrix_world @ v.co for v in ob.data.vertices]
    return (Vector((min(c.x for c in co), min(c.y for c in co),
                    min(c.z for c in co))),
            Vector((max(c.x for c in co), max(c.y for c in co),
                    max(c.z for c in co))))


def stage(bg=(0.40, 0.46, 0.52, 1.0), ground=True, ground_size=24):
    """World, floor and three lights. Idempotent.

    ⚠️ THE KEY STAYS LOW AND FRONTAL. On the old hero a light high overhead
       carved a shadow that read as anatomy and an afternoon went looking for
       a modelling bug. On flat-shaded geometry the risk is the opposite and
       worse: a hard overhead key makes every top face white and every side
       face black, and the model stops reading as colour at all.
    """
    if _STAGED[0]:
        return
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.image_settings.file_format = "PNG"
    sc.render.film_transparent = False
    sc.world = bpy.data.worlds.new("ShotWorld")
    sc.world.use_nodes = True
    sc.world.node_tree.nodes["Background"].inputs[0].default_value = bg
    sc.world.node_tree.nodes["Background"].inputs[1].default_value = 0.30

    if ground:
        bpy.ops.mesh.primitive_plane_add(size=ground_size, location=(0, 0, 0))
        g = bpy.context.active_object
        g.name = "ShotGround"
        gm = bpy.data.materials.new("ShotGroundMat")
        gm.use_nodes = True
        b = gm.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (0.21, 0.27, 0.16, 1)
        b.inputs["Roughness"].default_value = 0.95
        g.data.materials.append(gm)

    # ── EXPOSURE IS A FIXED NUMBER, NOT A FEEL ───────────────────────────
    # ⚠️ THE FIRST LINE-UP CAME BACK WHITE. A 0.44 mid-brown tunic rendered
    #    cream and a 0.44 grey rock rendered white, and it looked for all the
    #    world like the palette was wrong -- I was one step from desaturating
    #    every colour in style.py to fix a problem that was three area lamps.
    #
    #    With view_transform = "Standard" there is NO highlight rolloff: any
    #    linear value over 1.0 clips flat to white, so an over-bright key
    #    does not "look bright", it DELETES the colour. On flat-shaded
    #    geometry that is fatal, because flat colour is the entire style.
    #
    #    So the lights are SUNS and the arithmetic is written down. A lambert
    #    surface of albedo c under irradiance E renders at c*E/pi. Wanting a
    #    key-facing face to land at about its own albedo means E ~= pi, so
    #    KEY is 2.6 and not 900. Every number below is in those units:
    #      key 2.15 -> a lit face at ~0.68x albedo, which after the sRGB
    #                 encode reads as the colour itself. 2.6 was 25% hot.
    #      fill 0.55 -> shadow side still reads as the same hue, not as black
    #      rim 0.75 -> separates the silhouette from the background
    #      world 0.30 -> the floor of the whole image, nothing goes to black
    for nm, strength, loc in (("key", 2.15, (3.4, -4.2, 3.4)),
                              ("fill", 0.55, (-4.2, -3.0, 2.2)),
                              ("rim", 0.75, (-1.4, 4.4, 3.6))):
        d = bpy.data.lights.new(nm, type="SUN")
        d.energy = strength
        d.angle = math.radians(6.0)      # a little softness on the terminator
        o = bpy.data.objects.new(nm, d)
        bpy.context.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (Vector((0, 0, 0.9)) - Vector(loc))             .to_track_quat("-Z", "Y").to_euler()
    _STAGED[0] = True


def frame_on(center, width, azim, elev=16.0, dist=30.0):
    """Ortho camera `azim` degrees round `center`, framing `width` metres.

    elev defaults to 16 rather than the old pipeline's 7: these models are
    judged as objects on a floor, and a near-horizontal camera hides the top
    faces, which on flat-shaded geometry are half the silhouette.
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
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y") \
        .to_euler()
    return cam


def full_body(ob, air=1.25):
    """(center, width) framing the whole object with a little air."""
    lo, hi = bounds(ob)
    h = hi.z - lo.z
    w = max(hi.x - lo.x, hi.y - lo.y, h)
    return Vector((0, 0, (lo.z + hi.z) * 0.5)), w * air


def shoot(path, res=(900, 900)):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = os.path.abspath(path)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    return path
