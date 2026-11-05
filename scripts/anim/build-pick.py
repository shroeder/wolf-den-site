import bpy, bmesh, math
from mathutils import Vector, Matrix, Quaternion, Euler

# ═══════════════════════════════════════════════════════════════════════════
# THE PICKAXE, AND A RIG WHERE THE HANDS CANNOT LEAVE IT
#
# ⚠️ THE TOOL IS THE CONTROL. THE HANDS ARE ITS CHILDREN.
#
# The first version had it the other way round: the tool was welded to the
# driving hand, and the off hand chased a world-space point recomputed from
# the tool every frame. That is a hand hunting a moving target, and it lost.
# Six attempts to fix it by adjusting the target all failed, because the
# target was never the problem -- the architecture was.
#
# Now one empty IS the pickaxe's position and orientation. Both wrist IK
# targets and both hand-rotation targets are PARENTED to it at fixed local
# offsets. Animating the clip means moving one object. A hand cannot come
# off the haft, because it is not following the haft; it is bolted to it.
#
# ⚠️ AND THE OFFSETS ARE MEASURED, NOT CHOSEN. A closed fist has a real axis
# and the skeleton knows it: the line from the pinky knuckle to the index
# knuckle runs up through the hole, and the centre of the proximal joints is
# where a shaft sits. Mounting to a rotation picked because the arithmetic
# looked tidy is what left the shaft resting against the palm instead of in
# it -- measured, the fingers were 0.115 from the axis where a grip is 0.04.
# ═══════════════════════════════════════════════════════════════════════════

PICK_HAND = "r"
OFF_HAND = "l" if PICK_HAND == "r" else "r"
HAFT_LEN = 1.05
GRIP_HI = 0.26                    # driving hand, up the haft
GRIP_LO = 0.05                    # off hand, at the butt

_iron = bpy.data.materials.new("PickIron")
_iron.use_nodes = True
_ip = _iron.node_tree.nodes["Principled BSDF"]
_ip.inputs["Base Color"].default_value = (0.055, 0.058, 0.065, 1)
_ip.inputs["Metallic"].default_value = 0.95
_ip.inputs["Roughness"].default_value = 0.36

_wood = bpy.data.materials.new("PickHaft")
_wood.use_nodes = True
_wp = _wood.node_tree.nodes["Principled BSDF"]
_wp.inputs["Base Color"].default_value = (0.135, 0.072, 0.030, 1)
_wp.inputs["Roughness"].default_value = 0.72

_leather = bpy.data.materials.new("PickGrip")
_leather.use_nodes = True
_lp = _leather.node_tree.nodes["Principled BSDF"]
_lp.inputs["Base Color"].default_value = (0.052, 0.032, 0.020, 1)
_lp.inputs["Roughness"].default_value = 0.85

TIP_Y, TIP_Z, EYE_Z = 0.272, 0.934, 1.022


def _build_pick(scale):
    """Haft up local +Z, head crossing it at the top. Symmetric: two drooping
    points, no adze -- a mining pick, not a mattock."""
    me = bpy.data.meshes.new("Pickaxe")
    bm = bmesh.new()
    for z0, z1, r0, r1 in ((0.00, 0.040, 0.0285, 0.0235),
                           (0.040, 0.70, 0.0235, 0.0215),
                           (0.70, HAFT_LEN, 0.0215, 0.0265)):
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12,
                              radius1=r0 * scale, radius2=r1 * scale,
                              depth=(z1 - z0) * scale,
                              matrix=Matrix.Translation((0, 0, (z0 + z1) * 0.5 * scale)))
    haft = set(bm.faces)
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12,
                          radius1=0.0285 * scale, radius2=0.0285 * scale,
                          depth=(GRIP_HI - GRIP_LO + 0.16) * scale,
                          matrix=Matrix.Translation(
                              (0, 0, (GRIP_LO + GRIP_HI) * 0.5 * scale)))
    grip = set(bm.faces) - haft

    PROF = []
    for sgn in (-1, 1):
        for fy, fz, hx, hz in ((1.000, 0.000, 0.0055, 0.0075),
                               (0.740, 0.555, 0.0130, 0.0200),
                               (0.440, 0.830, 0.0230, 0.0300),
                               (0.170, 0.955, 0.0320, 0.0430)):
            PROF.append((sgn * fy * TIP_Y, TIP_Z + (EYE_Z - TIP_Z) * fz, hx, hz))
    PROF.append((0.0, EYE_Z, 0.0400, 0.0520))
    PROF.sort(key=lambda r: r[0])

    rings = []
    for y, z, hx, hz in PROF:
        rings.append([bm.verts.new((sx * hx * scale, y * scale, (z + sz * hz) * scale))
                      for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    head = []
    for a, b in zip(rings, rings[1:]):
        for i in range(4):
            head.append(bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i])))
    head.append(bm.faces.new(list(reversed(rings[0]))))
    head.append(bm.faces.new(rings[-1]))

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    for f in bm.faces:
        f.smooth = f in haft or f in grip
        f.material_index = 0 if f in head else (2 if f in grip else 1)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Pickaxe", me)
    for m in (_iron, _wood, _leather):
        me.materials.append(m)
    bpy.context.collection.objects.link(ob)
    return ob


PICK = _build_pick(LEG)
PICK_TIP = Vector((0, -TIP_Y * LEG, TIP_Z * LEG))

close_fist(PICK_HAND, 0.90)
close_fist(OFF_HAND, 0.86)
bpy.context.view_layer.update()


SHAFT_R = 0.0285 * LEG
FINGER_R = 0.011 * LEG


def grip_frame(side):
    """Where a closed fist can hold a shaft of THIS thickness, and which way
    it runs. +Z runs up out of the thumb side.

    ⚠️ THE CENTRE IS SOLVED, NOT AVERAGED. Averaging the knuckle positions
    puts the axis on the line the FINGER BONES lie on -- so the shaft is
    threaded through them. Measured, the finger joints came out 0.013 to
    0.027 from the axis against a shaft radius of 0.030: his fingers were
    inside the wood, and I read those numbers and called it a perfect grip.
    A held shaft sits in the HOLE, clear of every bone by its own radius
    plus a finger. Search the plane square to the axis for the point that
    actually achieves that."""
    def bone(n, tail=False):
        pb = arm.pose.bones["%s_%s" % (n, side)]
        return arm.matrix_world @ (pb.tail if tail else pb.head)
    i1, p1 = bone("index_01"), bone("pinky_01")
    z = (i1 - p1).normalized()
    fwd = Vector((0.0, FWD, 0.0))
    y = fwd - z * fwd.dot(z)
    y = y.normalized() if y.length > 1e-5 else Vector((0, 0, 1)).cross(z).normalized()
    x = y.cross(z)

    ring = [bone(n, t) for n in ("index_01", "index_02", "index_03",
                                 "middle_01", "middle_02", "middle_03",
                                 "pinky_01", "pinky_02", "pinky_03",
                                 "thumb_02", "thumb_03") for t in (False, True)]
    seed = sum(ring, Vector()) / len(ring)
    want = SHAFT_R + FINGER_R
    best, centre = -1e9, seed
    for ix in range(-14, 15):
        for iy in range(-14, 15):
            c = seed + x * (ix * 0.004 * LEG) + y * (iy * 0.004 * LEG)
            gap = min((p - c - z * (p - c).dot(z)).length for p in ring)
            score = -abs(gap - want)
            if score > best:
                best, centre = score, c
    clear = min((p - centre - z * (p - centre).dot(z)).length for p in ring)
    print("        grip %s: nearest bone %.4f from the axis "
          "(shaft %.4f, want >= %.4f)" % (side, clear, SHAFT_R, want))
    return centre, Matrix((x, y, z)).transposed().to_3x3()


# ── THE CONTROL ─────────────────────────────────────────────────────────────
TOOL = empty("tool_ctrl", (0, 0, 0))
TOOL.rotation_mode = "QUATERNION"
_children = []
TOOL_LOCALS = {}


def _mount(ob, loc, quat=None):
    ob.parent = TOOL
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.location = loc
    if quat is not None:
        ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = quat
    _children.append(ob)
    # ⚠️ RECORD THE OFFSET. Every other clip keys these same empties in world
    # space, so whatever Impact left on them is still sitting there; keying
    # them inside Mine without re-stating the offset first records that stale
    # world value as a LOCAL one and throws the hand across the room.
    TOOL_LOCALS[ob.name] = (Vector(loc), quat.copy() if quat else None)
    return ob


def hand_mount(side, along):
    """The local transform, IN TOOL SPACE, that this hand must have to grip
    the haft `along` up its length -- derived from that hand's own measured
    grip frame, so each hand holds the shaft the way that hand can."""
    centre, basis = grip_frame(side)
    wrist = arm.matrix_world @ arm.pose.bones["hand_%s" % side].head
    rest_q = (arm.matrix_world
              @ arm.pose.bones["hand_%s" % side].bone.matrix_local).to_quaternion()
    d = basis.inverted()                       # rest world -> tool local
    return (Vector((0, 0, along * LEG)) - (d @ (centre - wrist)),
            (d @ rest_q.to_matrix()).to_quaternion())


# ── RIGHT ARM: a new IK chain, parked at influence 0 ────────────────────────
# A constraint is not part of an action: once it exists it applies to EVERY
# clip, so this would otherwise snap the right arm of the walk, run, idle and
# brace. key_mine raises it, and Mine is baked last.
_w, _q = hand_mount(PICK_HAND, GRIP_HI)
_pick_goal = _mount(empty("pick_goal", (0, 0, 0)), _w, None)
_pgrip = _mount(empty("pgrip", (0, 0, 0)), (0, 0, 0), _q)
_psho = arm.matrix_world @ arm.pose.bones["upperarm_%s" % PICK_HAND].head
_pick_pole = empty("pick_pole", (_psho.x * 2.1, 0.55 * LEG, FLOOR + LEG * 1.25))
_pick_ik = arm.pose.bones["lowerarm_%s" % PICK_HAND].constraints.new("IK")
_pick_ik.target = _pick_goal
_pick_ik.pole_target = _pick_pole
_pick_ik.chain_count = 2
_pick_ik.pole_angle = math.radians(-90)
_pick_ik.use_tail = True
_pick_ik.influence = 0.0
_pgc = arm.pose.bones["hand_%s" % PICK_HAND].constraints.new("COPY_ROTATION")
_pgc.target = _pgrip
_pgc.target_space = "WORLD"
_pgc.owner_space = "WORLD"
_pgc.influence = 0.0

# ── LEFT ARM: build-walk's guard IK, re-hung off the control ────────────────
# ⚠️ PARENT WITH AN IDENTITY INVERSE AND LEAVE THE CONTROL AT THE ORIGIN.
# Every other clip keys these two in WORLD space. With the control unmoved
# and no parent-inverse, local == world, so those clips are untouched. Only
# Mine animates the control, and only there do they ride it.
OFF_W, OFF_Q = hand_mount(OFF_HAND, GRIP_LO)
_mount(_hand_goal, OFF_W, None)
_mount(_grip, (0, 0, 0), OFF_Q)
TOOL_CHILDREN = _children

# ⚠️ THE TOOL IS NOT A CHILD OF THE CONTROL -- IT IS SKINNED, AND DRIVEN
# THROUGH THE HAND. Parenting it to the control as well as skinning it to
# hand_r applies both transforms and the pickaxe swings twice as far as it
# should, which is what put the head at his hip with the haft over his
# shoulder. Skinning is also the only route that survives export: the glTF
# exporter silently drops bone parenting.
#
# It still follows the control exactly, because the control drives the hand
# and the hand carries the tool. Mount it so that at rest the tool sits
# where the driving hand's own rest pose would put it:
#     tool_rest = hand_rest @ (hand-in-tool)^-1
# Then hand_now = CONTROL @ hand-in-tool gives tool_now = CONTROL, exactly.
WRIST_IN_TOOL = Vector(_w)   # the driving wrist, in tool space
_Th = Matrix.Translation(_w) @ _q.to_matrix().to_4x4()
PICK.matrix_world = (arm.matrix_world
                     @ arm.pose.bones["hand_%s" % PICK_HAND].bone.matrix_local) @ _Th.inverted()
PICK.parent = arm
PICK.matrix_parent_inverse = arm.matrix_world.inverted()

_vg = PICK.vertex_groups.new(name="hand_%s" % PICK_HAND)
_vg.add(list(range(len(PICK.data.vertices))), 1.0, "REPLACE")
_am = PICK.modifiers.new("Armature", "ARMATURE")
_am.object = arm
bpy.context.view_layer.update()

ARM_FULL = {s_: (arm.pose.bones["upperarm_%s" % s_].length
                 + arm.pose.bones["lowerarm_%s" % s_].length) for s_ in ("l", "r")}
print("PICKAXE %d faces | %d targets parented to the tool control"
      % (len(PICK.data.polygons), len(TOOL_CHILDREN)))
