import bpy, bmesh, math, os
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
# ⚠️ THESE ARE WHERE THE HANDS GO AND THEY WERE NEVER SWEPT. GRIP_LO at 0.05
# put the off hand HALF A FIST OFF THE END of the wood -- the butt's end face
# is visible in the apex render with the hand curled over the air past it.
# Sweepable now; _offgrip.py renders each candidate.
GRIP_HI = float(os.environ.get("GRIP_HI_TEST") or 0.26)   # driving hand, up the haft
GRIP_LO = float(os.environ.get("GRIP_LO_TEST") or 0.05)   # off hand, near the butt

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

# Thumbs stay on a fixed curl; only the fingers are solved.
_CURL_SIGN = {s_: _curl_sign(s_) for s_ in ('l', 'r')}
for _s in ('l', 'r'):
    for _seg, _deg in (('01', 26), ('02', 34), ('03', 30)):
        _b = arm.pose.bones.get('thumb_%s_%s' % (_seg, _s))
        if _b:
            _b.rotation_euler = Euler(
                (math.radians(_deg * 0.9 * _CURL_SIGN[_s]), 0, 0), 'XYZ')
bpy.context.view_layer.update()


SHAFT_R = 0.0285 * LEG
SKIN = 0.009 * LEG          # fingertip flesh outside the bone


def _curl(side, finger, amt):
    for seg, deg in (("01", 58), ("02", 76), ("03", 48)):
        b = arm.pose.bones.get("%s_%s_%s" % (finger, seg, side))
        if b:
            b.rotation_euler = Euler((math.radians(deg * amt * _CURL_SIGN[side]),
                                      0, 0), "XYZ")


def grip_frame(side):
    """Where a fist holds a shaft of THIS thickness, which way it runs, and
    how far each finger has to close to reach it.

    ⚠️ THE CENTRE IS NOT THE AVERAGE OF THE KNUCKLES. That puts the axis on
    the line the finger BONES lie on, threading the shaft through them --
    measured, finger joints 0.013 to 0.027 from the axis against a 0.030
    shaft. Nor is it "the biggest gap near the hand": searching for that
    walked 0.095 away and found the open air beside his fist. A held shaft
    lies against the PALM, one radius in from the knuckles, and the fingers
    close until they meet it."""
    def bone(n, tail=False):
        pb = arm.pose.bones["%s_%s" % (n, side)]
        return arm.matrix_world @ (pb.tail if tail else pb.head)

    for fng in ("index", "middle", "ring", "pinky"):
        _curl(side, fng, 0.45)
    bpy.context.view_layer.update()
    knuck = [bone("%s_01" % f) for f in ("index", "middle", "ring", "pinky")]
    tips = [bone("%s_03" % f, True) for f in ("index", "middle", "ring", "pinky")]
    kmid = sum(knuck, Vector()) / 4.0
    z = (bone("index_01") - bone("pinky_01")).normalized()

    # ⚠️ SEATING THE SHAFT AGAINST THE FINGERTIPS MAKES A CRADLE, NOT A GRIP.
    # The previous version curled to 0.80, read where the tips had come to,
    # and put the shaft there, one radius back. That CANNOT fail -- and it
    # cannot succeed either, because the shaft is placed to fit whatever
    # shape the fingers are already in, so they are never required to come
    # AROUND it. Rendered bare, with the tool hidden, both hands were an open
    # C with a gap you could put a wrist through. From one azimuth that reads
    # as a grip, which is why it survived.
    #
    # The shaft goes where a held shaft goes: against the PALM, just inside
    # the knuckles. The palm direction is read from the hand itself -- curl
    # hard and see which way the fingertips travel, because that is the palm
    # by definition.
    for fng in ("index", "middle", "ring", "pinky"):
        _curl(side, fng, 1.40)
    bpy.context.view_layer.update()
    deep = sum((bone("%s_03" % f, True)
                for f in ("index", "middle", "ring", "pinky")), Vector()) / 4.0
    palm_d = (deep - kmid)
    palm_d = (palm_d - z * palm_d.dot(z))
    palm_d = palm_d.normalized() if palm_d.length > 1e-5 else Vector((0, 0, -1))
    centre = kmid + palm_d * (SHAFT_R + SKIN)
    fwd = Vector((0.0, FWD, 0.0))
    y = fwd - z * fwd.dot(z)
    y = y.normalized() if y.length > 1e-5 else palm
    x = y.cross(z)

    # ── CLOSE EACH FINGER ONTO THE SHAFT ──────────────────────────────────
    # One global curl cannot fit four fingers of different length around a
    # cylinder: they cup it instead of closing on it, which is exactly how
    # it looked. Solve each one.
    want = SHAFT_R + SKIN
    chose = {}
    for fng in ("index", "middle", "ring", "pinky"):
        # ⚠️ SCAN, DO NOT BISECT. Closing a finger does not reduce its
        # distance to the shaft monotonically -- past a point the tip curls
        # PAST the shaft and the distance grows again, so bisection walks
        # off and leaves three fingers of the left hand short.
        #
        # ⚠️ AND THE DISTANCE ALONE HAS TWO SOLUTIONS, WHICH IS THE WHOLE
        # BUG. "Tip is one radius from the axis" is satisfied by a finger
        # that has wrapped round to the palm side AND by a barely-curled
        # finger still sitting on the knuckle side -- and the second one is
        # nearer, so it always won. That is the open C.
        #
        # So the cost is SIGNED: a finger has only gripped once its tip is
        # past the axis, on the palm side. Unwrapped candidates are pushed
        # out of contention rather than being quietly preferred.
        #
        # ⚠️ THE RANGE HAS TO REACH 1.7, AND 1.0 IS NOT A CLOSED FIST.
        # 58/76/48 degrees at amount 1.0 is a loose cup -- the curl sweep
        # shows the hand only closing near 1.5. An earlier fix capped this
        # at 1.0 "because the print calls 1.0 a closed fist"; the print was
        # wrong and the cap made the fingers LESS closed. What the cap was
        # really for -- a ring finger looping a full circle at 1.45 -- is
        # handled properly by the signed term, which stops rewarding a tip
        # that has gone all the way round and come back.
        best, bamt = 1e9, 0.8
        for k in range(61):
            amt = 0.20 + k * 0.025
            _curl(side, fng, amt)
            bpy.context.view_layer.update()
            t = bone("%s_03" % fng, True)
            r = (t - centre) - z * (t - centre).dot(z)
            d = abs(r.length - want)
            # How far past the axis, toward the palm, the tip has come.
            # Negative means it never got round the shaft at all.
            wrap = r.dot(palm_d)
            if wrap <= 0.0:
                d += 1.0 + (-wrap)
            if d < best:
                best, bamt = d, amt
        _curl(side, fng, bamt)
        chose[fng] = bamt
    bpy.context.view_layer.update()
    gaps = [((bone("%s_03" % f, True) - centre)
             - z * (bone("%s_03" % f, True) - centre).dot(z)).length
            for f in ("index", "middle", "ring", "pinky")]
    print("        grip %s: fingertips %s from the axis (shaft %.4f)"
          % (side, " ".join("%.3f" % g for g in gaps), SHAFT_R))
    # ⚠️ 1.0 IS A LOOSE CUP, NOT A CLOSED FIST. 58/76/48 degrees only closes
    # the hand near 1.5, which is why the solver legitimately wants >1.
    print("        grip %s: curl %s  (1.5 is about a closed fist)"
          % (side, " ".join("%s %.2f" % (f[:3], chose[f])
                            for f in ("index", "middle", "ring", "pinky"))))
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
