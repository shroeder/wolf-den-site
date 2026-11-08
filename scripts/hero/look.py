import bpy, math, os
from mathutils import Vector

# ─────────────────────────────────────────────────────────────────────────
# LOOK — the smallest thing that lets me see what I am building.
#
# This is written before any geometry, on purpose. I cannot judge 3D art by
# eye at composition scale and I cannot judge motion from stills, so a build
# with no render step is a build I will get wrong and not know.
#
# Deliberately tiny. The previous pipeline's equivalent grew to five modules;
# this is one file and it does two things: put a camera on a point at a width
# in metres, and save a PNG.
# ─────────────────────────────────────────────────────────────────────────

ANGLES = (34, -55, 125, 215)
_READY = [False]


def stage(floor_z=0.0, bg=(0.40, 0.44, 0.49, 1.0)):
    if _READY[0]:
        return
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    # Blender 4.x defaults to AgX, which washes flat stylised colour out.
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.image_settings.file_format = "PNG"
    sc.world = bpy.data.worlds.new("W")
    sc.world.use_nodes = True
    sc.world.node_tree.nodes["Background"].inputs[0].default_value = bg

    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, floor_z))
    g = bpy.context.active_object
    g.name = "Ground"
    m = bpy.data.materials.new("GroundMat")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.26, 0.28, 0.31, 1)
    g.data.materials.append(m)

    # Key low and frontal: a light high overhead carves a shadow under the
    # pectoral that reads as a breast.
    # ⚠️ AN OVERLIT FIGURE HAS NO FORM. At 420 W the clay clipped to near
    # white and every muscle I had just authored was invisible -- I spent a
    # render cycle deciding the anatomy was not reading when it was simply
    # blown out. Key around 190 W, a dim fill so the shadow side still has
    # information, and a rim to separate him from the ground.
    for nm, en, loc, size in (("key", 190, (2.4, -3.2, 2.2), 2.4),
                              ("fill", 42, (-3.0, -2.2, 1.6), 4.0),
                              ("rim", 95, (-1.0, 3.2, 2.6), 2.0)):
        d = bpy.data.lights.new(nm, type="AREA")
        d.energy, d.size = en, size
        o = bpy.data.objects.new(nm, d)
        bpy.context.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (Vector((0, 0, 1.0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    _READY[0] = True


def clay(ob, rgb=(0.62, 0.44, 0.36)):
    m = bpy.data.materials.new("Clay")
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*rgb, 1.0)
    p.inputs["Roughness"].default_value = 0.62
    ob.data.materials.clear()
    ob.data.materials.append(m)


def shot(path, center, width, azim, res=(900, 1100), elev=7.0, dist=12.0):
    """Ortho camera `azim` degrees around `center`, framing `width` METRES."""
    sc = bpy.context.scene
    center = Vector(center)
    cam = bpy.data.objects.get("Cam")
    if cam is None:
        cd = bpy.data.cameras.new("Cam")
        cd.type = "ORTHO"
        cam = bpy.data.objects.new("Cam", cd)
        bpy.context.collection.objects.link(cam)
    cam.data.ortho_scale = width
    sc.camera = cam
    a, e = math.radians(azim), math.radians(elev)
    cam.location = (center.x + dist * math.sin(a) * math.cos(e),
                    center.y - dist * math.cos(a) * math.cos(e),
                    center.z + dist * math.sin(e))
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.resolution_x, sc.render.resolution_y = res
    # ⚠️ KEEP THE PREVIOUS FRAME. Judging a change by looking at the new
    # render alone means comparing it against my memory of the old one,
    # which is exactly where I drift: several passes on this figure "fixed"
    # something and I could not actually tell afterwards whether it was
    # better. The last version of every shot is one directory away, so
    # before and after can be looked at side by side.
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        prev = os.path.join(os.path.dirname(path), "_prev")
        os.makedirs(prev, exist_ok=True)
        try:
            os.replace(path, os.path.join(prev, os.path.basename(path)))
        except OSError:
            pass
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def sheet(out_dir, tag, center, width, angles=ANGLES, res=(900, 1100)):
    """One file per angle. Four angles, because one cannot tell absent
    geometry from occluded geometry."""
    return [shot(os.path.join(out_dir, "%s_az%d.png" % (tag, int(a))),
                 center, width, a, res=res) for a in angles]
