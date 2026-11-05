import bpy, bmesh, math
from mathutils import Vector, Matrix, Quaternion, Euler

# ═══════════════════════════════════════════════════════════════════════════
# THE PICKAXE, AND A RIGHT ARM THAT CAN SWING IT
#
# Runs after build-walk.py, on the rig it leaves behind.
#
# ⚠️ THE RIGHT-ARM IK IS CREATED WITH INFLUENCE 0. A constraint is not part
# of an action -- once it exists it applies to EVERY clip, so adding an IK
# chain here would have snapped the right arm of the walk, the run, the idle
# and the brace to wherever this target empty happened to sit. Influence is
# raised to 1 only inside key_mine, and Mine is baked last, so every clip
# authored before it bakes with the arm still on FK.
#
# ⚠️ AND THE TOOL IS SKINNED, NOT BONE-PARENTED. Same as the shield: bone
# parenting rides correctly in Blender and the glTF exporter silently drops
# it. One vertex group, weight 1, an Armature modifier.
# ═══════════════════════════════════════════════════════════════════════════

PICK_HAND = "r"
# ⚠️ HAFT LENGTH AND GRIP POSITION DECIDE THE WHOLE STRIKE POSE, AND A SHORT
# ONE CANNOT BE ANIMATED OUT. The pick arm sticks out sideways from the head,
# so the tip sits at an angle OFF the haft axis -- and that angle is set by
# the length of haft above the fist. At 1.05 long gripped 0.40 up, the tip is
# 43 degrees off the shaft, which means the only way to put the point on the
# floor is to stand the haft bolt upright against the stomach and crouch
# under it. That is not a pose anyone can fix with keyframes.
#
# Measured: 1.38 long gripped at 0.42 drops the tip to 27 degrees off the
# shaft, the haft lands 18 degrees forward of vertical with the hands at a
# normal 0.72, and the off hand is inside its own reach the whole way round.
# One number fixes the shape of the pose, the posture, AND the grip.
# ⚠️ SIZE IT AGAINST THE MAN, AND MEASURE IT. I lengthened the haft to
# buy a better strike pose and never checked the result against him: it
# came out 1.50 long with a 0.94 head on a hero 2.21 tall -- 68% of his
# height with a 76cm head. A pickaxe is about half a man tall with a
# 50cm head. _pickshot.py prints both ratios now.
HAFT_LEN = 1.05                   # butt at local z=0, head at z=HAFT_LEN
GRIP_HI = 0.26                    # the driving hand, upper
GRIP_LO = 0.05                    # the off hand, down at the butt for leverage

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


def _build_pick(scale):
    """Haft up the local +Z, head crossing it at the top.

    The head is lofted from rectangular rings along Y: a long tapered spike
    on the -Y side, a short flaring adze on +Y, thickest at the eye where the
    haft passes through. Flat-shaded, because a forged tool has facets and a
    smooth one reads as plastic."""
    me = bpy.data.meshes.new("Pickaxe")
    bm = bmesh.new()

    # ── HAFT ── slightly thicker at the head end, with a swell at the butt so
    # the hand has something to stop against.
    for z0, z1, r0, r1 in ((0.00, 0.050, 0.0300, 0.0250),
                           (0.050, 0.90, 0.0250, 0.0230),
                           (0.90, HAFT_LEN, 0.0230, 0.0285)):
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12,
                              radius1=r0 * scale, radius2=r1 * scale,
                              depth=(z1 - z0) * scale,
                              matrix=Matrix.Translation((0, 0, (z0 + z1) * 0.5 * scale)))
    haft_faces = set(bm.faces)

    # ── GRIP ── a leather wrap where the hands go.
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12,
                          radius1=0.0300 * scale, radius2=0.0300 * scale,
                          depth=(GRIP_HI + 0.07 - GRIP_LO + 0.07) * scale,
                          matrix=Matrix.Translation(
                              (0, 0, (GRIP_LO - 0.07 + GRIP_HI + 0.07) * 0.5 * scale)))
    grip_faces = set(bm.faces) - haft_faces

    # ── HEAD ── (y, z, half_x, half_z).
    #
    # ⚠️ DOUBLE-ENDED. The first head had a spike one side and a flaring adze
    # the other, which is a mattock -- from the side, the only angle a swing
    # is ever seen from, it read as a hammer with a hook. A mining pick is
    # SYMMETRIC: two tapered points, both drooping a little toward the work.
    # The symmetry is also why it reads at speed, because whichever way round
    # the head is in a given frame the silhouette is the same.
    # ⚠️ THE DROOP IS WHAT MAKES IT READ AS A PICK. At 6.7 degrees the two
    # points and the eye fall on almost one line, and from the side -- the
    # only angle a swing is seen from -- the head reads as a single slender
    # crescent blade rather than two spikes. 18 degrees separates them. It
    # trades a little against the strike pose: more droop puts the point
    # further off the haft axis, which stands the haft more upright at
    # impact, so this is as much curve as the pose can pay for.
    TIP_Y, TIP_Z, EYE_Z = 0.272, 0.934, 1.022
    PROF = []
    for sgn in (-1, 1):
        for fy, fz, hx, hz in ((1.000, 0.000, 0.0055, 0.0075),
                               (0.740, 0.555, 0.0130, 0.0200),
                               (0.440, 0.830, 0.0230, 0.0300),
                               (0.170, 0.955, 0.0320, 0.0430)):
            PROF.append((sgn * fy * TIP_Y,
                         TIP_Z + (EYE_Z - TIP_Z) * fz, hx, hz))
        if sgn < 0:
            PROF.append((0.0, EYE_Z, 0.0400, 0.0520))
    PROF[4:] = sorted(PROF[4:], key=lambda r: r[0])
    PROF = sorted(PROF, key=lambda r: r[0])

    rings = []
    for y, z, hx, hz in PROF:
        ring = [bm.verts.new((sx * hx * scale, y * scale, (z + sz * hz) * scale))
                for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        rings.append(ring)
    head_faces = []
    for a, b in zip(rings, rings[1:]):
        for i in range(4):
            head_faces.append(bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i])))
    head_faces.append(bm.faces.new(list(reversed(rings[0]))))
    head_faces.append(bm.faces.new(rings[-1]))

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    for f in bm.faces:
        f.smooth = f in haft_faces or f in grip_faces
        f.material_index = 0 if f in head_faces else (2 if f in grip_faces else 1)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Pickaxe", me)
    for m in (_iron, _wood, _leather):
        me.materials.append(m)
    bpy.context.collection.objects.link(ob)
    bmesh.ops.recalc_face_normals  # noqa: B018  (already done above)
    return ob


PICK = _build_pick(LEG)

# ── MOUNT ──────────────────────────────────────────────────────────────────
# ⚠️ GIVE THE PROP A REST ROTATION AND THE CLIP CONTROLS IT ABSOLUTELY.
# Because the tool is skinned rigidly to one bone, its world rotation is
#     tool(t) = D(t) @ R_REST
# where D is whatever world-space delta the hand's Copy Rotation applies on
# top of the hand's rest basis. R_REST is chosen so that at D = identity the
# haft points straight DOWN and the pick faces FORWARD -- so an animator can
# then say "tilt the haft 35 degrees forward" and write exactly that, with
# the hand's own mirrored rest basis cancelling out of the arithmetic
# entirely. That basis is what buried the right foot 70mm earlier in this
# project; here it cannot participate.
R_REST = Quaternion((0, 1, 0), math.pi)       # +Z_local -> world -Z, -Y stays -Y
HAND_P = "hand_%s" % PICK_HAND
_pm = arm.matrix_world @ arm.pose.bones[HAND_P].bone.matrix_local
PICK_HAND_REST_Q = _pm.to_quaternion()
PICK.matrix_world = (Matrix.Translation(_pm.translation
                                        - (R_REST @ Vector((0, 0, GRIP_HI * LEG))))
                     @ R_REST.to_matrix().to_4x4())
bpy.context.view_layer.update()

_pvg = PICK.vertex_groups.new(name=HAND_P)
_pvg.add(list(range(len(PICK.data.vertices))), 1.0, "REPLACE")
_pam = PICK.modifiers.new("Armature", "ARMATURE")
_pam.object = arm
PICK.parent = arm
PICK.matrix_parent_inverse = arm.matrix_world.inverted()

# Where the two hands sit on the haft, in the tool's own local space. The clip
# turns these into world positions so the off hand can be IK'd onto the haft
# wherever the swing has carried it.
PICK_LOCAL = {"hi": Vector((0, 0, GRIP_HI * LEG)), "lo": Vector((0, 0, GRIP_LO * LEG))}
# ⚠️ THE CLIP NEEDS THE TIP AND MUST NOT RETYPE IT. key_mine solves the
# contact pose by putting this exact point on the floor; a second copy of
# the coordinate is how the solve silently starts aiming at thin air the
# first time the head profile is touched.
PICK_TIP = Vector((0, -0.272 * LEG, 0.934 * LEG))
PICK_REST_M = PICK.matrix_world.copy()
PICK_HAND_REST_M = (arm.matrix_world @ arm.pose.bones[HAND_P].matrix).copy()

# ── RIGHT ARM IK ───────────────────────────────────────────────────────────
_psho = arm.matrix_world @ arm.pose.bones["upperarm_%s" % PICK_HAND].head
ARM_R = ((arm.matrix_world @ arm.pose.bones[HAND_P].head) - _psho).length
# ⚠️ ARM_R IS THE RESTING REACH, NOT THE MAXIMUM. The A-pose arm is
# slightly bent, so shoulder-to-wrist at rest is 0.612 while a straight
# arm spans 0.643 -- and an IK chain asked for 0.63 quietly stops short
# instead of reporting anything. Anything that has to decide whether a
# target is reachable needs the bone lengths, not the rest distance.
ARM_FULL = {s_: (arm.pose.bones['upperarm_%s' % s_].length
                 + arm.pose.bones['lowerarm_%s' % s_].length) for s_ in ('l', 'r')}
_pick_goal = empty("pick_goal", (_psho.x, FWD * 0.3 * LEG, FLOOR + LEG * 1.1))
_pick_pole = empty("pick_pole", (_psho.x - 0.5 * LEG, 0.5 * LEG, FLOOR + LEG * 0.9))
_pick_ik = arm.pose.bones["lowerarm_%s" % PICK_HAND].constraints.new("IK")
_pick_ik.target = _pick_goal
_pick_ik.pole_target = _pick_pole
_pick_ik.chain_count = 2
_pick_ik.pole_angle = math.radians(-90)
_pick_ik.use_tail = True
_pick_ik.influence = 0.0          # see the header -- raised only by key_mine

_pgrip = empty("pgrip", (0, 0, 0))
_pgrip.rotation_mode = "QUATERNION"
_pgrip.rotation_quaternion = PICK_HAND_REST_Q
_pgc = arm.pose.bones[HAND_P].constraints.new("COPY_ROTATION")
_pgc.target = _pgrip
_pgc.target_space = "WORLD"
_pgc.owner_space = "WORLD"
_pgc.influence = 0.0

close_fist(PICK_HAND, 0.85)
print("PICKAXE %d faces, skinned to %s; arm reach %.3f; IK idle at influence 0"
      % (len(PICK.data.polygons), HAND_P, ARM_R))
