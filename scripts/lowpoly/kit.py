import math

import bpy
from mathutils import Euler, Vector

import style

# ═══════════════════════════════════════════════════════════════════════════
# THE KIT — EVERY MODEL IS BUILT FROM THESE FIVE SHAPES
#
# No modifiers. No booleans. No subdivision. No bevels. Nothing that makes
# geometry you did not count.
#
#   ⚠️ WHY HAND-BUILT PRIMITIVES AND NOT bpy.ops.mesh.primitive_*:
#      The operator cube is fine, but the operator cylinder/cone give you
#      32 sides by default and a triangle fan cap, and the previous pipeline
#      died of geometry it did not ask for. Here a 6-sided prism is 20
#      triangles and the number is arithmetic, not a surprise -- which is
#      what makes style.TRI_BUDGET an enforceable ceiling instead of a wish.
#
#   ⚠️ FLAT IS SET AT CREATION, AND THE MESH IS TRIANGULATED AT JOIN.
#      Flat shading is most of the RuneScape look, and it is not a render
#      setting -- it travels in the glb as per-face normals. The gate does
#      not check the `use_smooth` FLAG (that was a bad probe: it failed a
#      tree whose normals deviate by 0.00 degrees). It measures the angle
#      between each vertex normal and its own face, which is what three.js
#      shades with, and `join()` triangulates so that a non-planar face --
#      the one thing that can break it -- cannot exist.
#
# Each helper returns the created object. Build a model as a list of these,
# then `join(parts, name)`.
# ═══════════════════════════════════════════════════════════════════════════

_MATS = {}


def material(name):
    """The one material for a palette colour. Shared across every model in
    the scene, so eight parts in `tunic` are one material slot, not eight."""
    if name in _MATS and name in bpy.data.materials:
        return _MATS[name]
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = style.colour(name)
        # Matte. A specular rim on a flat-shaded box is the single fastest
        # way to stop looking like 2003 and start looking like a mobile game.
        bsdf.inputs["Roughness"].default_value = 0.92
        bsdf.inputs["Metallic"].default_value = 0.0
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.18
        m.diffuse_color = style.colour(name)
    _MATS[name] = m
    return m


def _mesh(name, verts, faces, colour, loc=(0, 0, 0), rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    me.from_pydata([Vector(v) for v in verts], [], faces)
    me.validate()
    for p in me.polygons:
        p.use_smooth = False
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = Euler([math.radians(a) for a in rot], "XYZ")
    ob.data.materials.append(material(colour))
    bpy.context.collection.objects.link(ob)
    return ob


# ── BOX — 12 triangles ───────────────────────────────────────────────────
# `center` is the middle of the box; `size` is its full extent. Stated that
# way because a model is a stack of parts whose tops meet other parts'
# bottoms, and half-extents turn every seam into mental arithmetic.
def box(name, center, size, colour, rot=(0, 0, 0)):
    sx, sy, sz = (s / 2.0 for s in size)
    v = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
         (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]
    f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
         (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return _mesh(name, v, f, colour, loc=center, rot=rot)


# ── FRUSTUM — 12 triangles, a box with a different top ───────────────────
# The workhorse. Every limb, every trunk section, every roof. A tapered box
# is what makes a low-poly figure read as a body instead of a packing crate,
# and it costs exactly the same as a box.
def frustum(name, center, bottom, top, height, colour, rot=(0, 0, 0),
            shift=(0.0, 0.0)):
    bx, by = (s / 2.0 for s in bottom)
    tx, ty = (s / 2.0 for s in top)
    dx, dy = shift
    h = height / 2.0
    v = [(-bx, -by, -h), (bx, -by, -h), (bx, by, -h), (-bx, by, -h),
         (-tx + dx, -ty + dy, h), (tx + dx, -ty + dy, h),
         (tx + dx, ty + dy, h), (-tx + dx, ty + dy, h)]
    f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
         (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return _mesh(name, v, f, colour, loc=center, rot=rot)


# ── PRISM — 4n-4 triangles (6 sides = 20) ────────────────────────────────
# A tube with a countable number of sides. Six is the house default: three
# sides lit differently reads as round at this scale, and eight is already
# spending triangles on a trunk nobody looks at.
def prism(name, center, radius, height, colour, sides=6, top_radius=None,
          rot=(0, 0, 0), twist=0.0):
    tr = radius if top_radius is None else top_radius
    h = height / 2.0
    v, n = [], sides
    for i in range(n):
        a = 2 * math.pi * i / n + math.radians(twist)
        v.append((radius * math.cos(a), radius * math.sin(a), -h))
    for i in range(n):
        a = 2 * math.pi * i / n + math.radians(twist)
        v.append((tr * math.cos(a), tr * math.sin(a), h))
    f = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        f.append((i, j, j + n, i + n))
    return _mesh(name, v, f, colour, loc=center, rot=rot)


# ── CONE — 2n-2 triangles (6 sides = 10) ─────────────────────────────────
# Leaf clusters, hats, spikes. `apex_shift` leans the point without rotating
# the base, which is how three stacked leaf cones stop looking like a stack.
def cone(name, center, radius, height, colour, sides=6, rot=(0, 0, 0),
         apex_shift=(0.0, 0.0), twist=0.0):
    h = height / 2.0
    v, n = [], sides
    for i in range(n):
        a = 2 * math.pi * i / n + math.radians(twist)
        v.append((radius * math.cos(a), radius * math.sin(a), -h))
    v.append((apex_shift[0], apex_shift[1], h))
    f = [tuple(range(n - 1, -1, -1))]
    for i in range(n):
        f.append((i, (i + 1) % n, n))
    return _mesh(name, v, f, colour, loc=center, rot=rot)


# ── WEDGE — 8 triangles ──────────────────────────────────────────────────
# A box with one edge collapsed: blades, roofs, fins, the flat side of a
# rock. Cheaper than a frustum and the only shape here with a sharp edge.
def wedge(name, center, size, colour, rot=(0, 0, 0)):
    sx, sy, sz = (s / 2.0 for s in size)
    v = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
         (-sx, 0.0, sz), (sx, 0.0, sz)]
    f = [(0, 1, 2, 3), (0, 4, 5, 1), (2, 5, 4, 3), (1, 5, 2), (0, 3, 4)]
    return _mesh(name, v, f, colour, loc=center, rot=rot)


# ── ASSEMBLY ─────────────────────────────────────────────────────────────

def mirror_x(ob, name=None):
    """A copy flipped across x. Hands, feet, pauldrons -- and it guarantees
    the pair actually matches, which hand-typed coordinates do not."""
    cp = ob.copy()
    cp.data = ob.data.copy()
    cp.name = name or (ob.name + "_m")
    cp.data.name = cp.name
    cp.location = (-ob.location.x, ob.location.y, ob.location.z)
    cp.scale = (-ob.scale.x, ob.scale.y, ob.scale.z)
    e = ob.rotation_euler
    cp.rotation_euler = Euler((e.x, -e.y, -e.z), "XYZ")
    bpy.context.collection.objects.link(cp)
    return cp


def join(parts, name):
    """One object, one mesh, floor at z=0, origin centred in x and y.

    ⚠️ THE MODEL IS PUT ON THE FLOOR HERE, NOT BY EYE IN THE PART
       COORDINATES. The old pipeline lost an afternoon to a hero hanging
       0.2 units in the air that measured flat-footed -- the floor was laid
       from the wrong pose. Dropping the joined mesh by its own lowest
       vertex makes "stands on the ground" arithmetic, and the gate then
       re-measures it on the exported result.
    """
    if not parts:
        raise ValueError("nothing to join")
    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name

    # Negative-scaled mirrors leave inside-out normals until the transform
    # is applied and the normals recalculated. Invisible in a flat-lit
    # preview; a black limb in the glb.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    # ⚠️ TRIANGULATE. A quad with four jittered corners is NOT PLANAR, and a
    #    flat-shaded non-planar quad carries one averaged normal across two
    #    triangles that do not agree with it -- 29 degrees of disagreement on
    #    the first rock, which shades as a soft bend across a face that is
    #    supposed to be a facet. It is invisible at thumbnail size and it was
    #    invisible in the render; the gate caught it.
    #
    #    Triangulating here makes the defect UNEXPRESSIBLE rather than
    #    checked-for: a triangle is planar by construction. It costs nothing
    #    -- the triangle count is identical, because that is what a quad
    #    always was to the exporter -- and it means the number in the
    #    manifest is exactly the number three.js receives.
    bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
    bpy.ops.object.mode_set(mode="OBJECT")

    zs = [v.co.z for v in ob.data.vertices]
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    dz = min(zs) - style.FLOOR_Z
    cx = (min(xs) + max(xs)) / 2.0
    cy = (min(ys) + max(ys)) / 2.0
    for v in ob.data.vertices:
        v.co.x -= cx
        v.co.y -= cy
        v.co.z -= dz
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def wipe():
    """An empty scene. Blender's startup file ships a cube, a camera and a
    light, and all three end up in the glb if you forget."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras,
                  bpy.data.lights, bpy.data.armatures):
        for b in list(block):
            if b.users == 0:
                block.remove(b)
    _MATS.clear()


def triangles(ob):
    """Triangles the exporter will write -- an n-gon is n-2 of them."""
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def measure(ob):
    """(height, width_x, depth_y) in metres, as it stands."""
    co = [ob.matrix_world @ v.co for v in ob.data.vertices]
    return (max(c.z for c in co) - min(c.z for c in co),
            max(c.x for c in co) - min(c.x for c in co),
            max(c.y for c in co) - min(c.y for c in co))
