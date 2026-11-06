import bpy, math, os, sys
from mathutils import Vector

# ═══════════════════════════════════════════════════════════════════════════
# THE RIG — bones from the same numbers that built the mesh.
#
# ⚠️ THE WORST DAY OF THE LAST PIPELINE CAME FROM A BIND MISMATCH: the rig was
# fitted to a generic base mesh rather than to the character, so every joint
# sat a hip-height from the flesh it drove, ten numeric assertions went green,
# and the body deformed wrongly while every measurement said it was fine.
#
# That failure is not expressible here. body.py exposes arm_path(), leg_path()
# and TORSO; this file reads THOSE, so a joint cannot be anywhere other than
# inside the limb it drives. There is no fitting step to get wrong.
#
# ⚠️ AND THE DEFECT THAT STARTED THE REBUILD IS A SKINNING DEFECT, so it gets
# a structural answer here rather than a cosmetic one. Raising an arm flattens
# the deltoid because every vertex is a weighted AVERAGE of two bone matrices,
# and averaging two widely separated rotations collapses toward the joint
# axis. Blender's Preserve Volume fixes it in one checkbox and DOES NOT
# EXPORT -- glTF skinning is linear blend. The fix that survives export is a
# helper bone: split the rotation across two joints so neither one has to
# carry the whole thing. See DELTOID below.
# ═══════════════════════════════════════════════════════════════════════════

MIRROR = {"l": 1.0, "r": -1.0}


def _p(path, i):
    return Vector(path[i][0])


def joints(body):
    """Every joint centre, read off the mesh's own construction data."""
    J = {"pelvis": Vector((0, 0, 0.955)),
         "spine_01": Vector((0, 0.004, 1.06)),
         "spine_02": Vector((0, 0.004, 1.19)),
         "chest": Vector((0, -0.002, 1.33)),
         "neck": Vector((0, -0.004, 1.50)),
         "head": Vector((0, 0.0, 1.62)),
         "head_top": Vector((0, 0.004, 1.79))}
    for s in ("l", "r"):
        a, l = body.arm_path(s), body.leg_path(s)
        m = MIRROR[s]
        J["clav_%s" % s] = Vector((m * 0.035, -0.010, 1.455))
        J["shoulder_%s" % s] = Vector((m * 0.165, -0.004, 1.445))
        J["elbow_%s" % s] = _p(a, 3)
        J["wrist_%s" % s] = _p(a, 6)
        J["hand_end_%s" % s] = _p(a, 9)
        J["hip_%s" % s] = Vector((m * 0.082, 0.0, 0.915))
        J["knee_%s" % s] = _p(l, 3)
        J["ankle_%s" % s] = _p(l, 6)
        J["ball_%s" % s] = _p(l, 8)
        J["toe_%s" % s] = _p(l, 9)
    return J


def chain(J):
    """(name, head, tail, parent, deform). Order matters: parents first."""
    B = [("pelvis", J["pelvis"], J["spine_01"], None, True),
         ("spine_01", J["spine_01"], J["spine_02"], "pelvis", True),
         ("spine_02", J["spine_02"], J["chest"], "spine_01", True),
         ("chest", J["chest"], J["neck"], "spine_02", True),
         ("neck", J["neck"], J["head"], "chest", True),
         ("head", J["head"], J["head_top"], "neck", True)]
    for s in ("l", "r"):
        B += [("clav_%s" % s, J["clav_%s" % s], J["shoulder_%s" % s], "chest", True),
              # ── THE DELTOID HELPER ──────────────────────────────────────
              # Sits at the shoulder, points down the upper arm, and takes
              # HALF the upperarm's rotation (a Copy Rotation at 0.5, applied
              # in pose mode below). The shoulder cap weights to this bone, so
              # a 150-degree arm raise asks each of two joints for 75 instead
              # of asking one for all of it. Linear blend skinning collapses
              # in proportion to the angle it has to average across, so
              # halving the angle is most of the fix -- and unlike Preserve
              # Volume it is just a bone, so it exports.
              ("deltoid_%s" % s, J["shoulder_%s" % s],
               J["shoulder_%s" % s].lerp(J["elbow_%s" % s], 0.42), "clav_%s" % s, True),
              ("upperarm_%s" % s, J["shoulder_%s" % s], J["elbow_%s" % s], "clav_%s" % s, True),
              ("lowerarm_%s" % s, J["elbow_%s" % s], J["wrist_%s" % s], "upperarm_%s" % s, True),
              ("hand_%s" % s, J["wrist_%s" % s], J["hand_end_%s" % s], "lowerarm_%s" % s, True),
              ("thigh_%s" % s, J["hip_%s" % s], J["knee_%s" % s], "pelvis", True),
              ("calf_%s" % s, J["knee_%s" % s], J["ankle_%s" % s], "thigh_%s" % s, True),
              ("foot_%s" % s, J["ankle_%s" % s], J["ball_%s" % s], "calf_%s" % s, True),
              ("toe_%s" % s, J["ball_%s" % s], J["toe_%s" % s], "foot_%s" % s, True)]
    return B


def build(ob, body):
    J = joints(body)
    ad = bpy.data.armatures.new("HeroRig")
    rig = bpy.data.objects.new("HeroRig", ad)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    made = {}
    for name, head, tail, parent, deform in chain(J):
        eb = ad.edit_bones.new(name)
        eb.head, eb.tail = head, tail
        eb.use_deform = deform
        if parent:
            eb.parent = made[parent]
        eb.use_connect = False
        made[name] = eb
    bpy.ops.object.mode_set(mode="OBJECT")

    # The helper takes half of what the real joint does.
    for s in ("l", "r"):
        pb = rig.pose.bones["deltoid_%s" % s]
        c = pb.constraints.new("COPY_ROTATION")
        c.target = rig
        c.subtarget = "upperarm_%s" % s
        c.target_space = c.owner_space = "LOCAL"
        c.influence = 0.5
    print("RIG %d bones" % len(ad.bones))
    return rig


# ── WEIGHTS ───────────────────────────────────────────────────────────────
# ⚠️ NOT BONE HEAT. It is better when it converges and it says "failed to
# find solution for one or more bones" when it does not -- and what it does
# on a cage this coarse is unpredictable. Distance to the bone SEGMENT,
# inverse-power over the nearest few, has no failure mode and is exact enough
# on a skeleton this sparse. It is then SMOOTHED across the cage edges,
# because a raw distance field assigns in patches and a patchy weight map
# tears the surface at exactly the places a smooth one would hold.

def _seg_dist(p, a, b, over=3.0):
    """Distance to a bone, with a bone's reach limited to its OWN SPAN.

    ⚠️ PLAIN SEGMENT DISTANCE DRAGS THE TORSO UP WITH THE ARM. For a vertex
    on the trapezius the nearest point on the upperarm is its HEAD -- the
    shoulder joint, a few centimetres away -- while the nearest point on the
    chest bone is further. So the upperarm wins a vertex that belongs to the
    neck, and raising the arm pulls a tall fin of shoulder up with it. That
    is what the first skin did, and it looked worse than the bought rig.

    A vertex whose projection falls OFF THE END of a bone is outside that
    bone's domain, so the overshoot is charged at a multiple. Bones then
    claim what lies beside them and not what lies beyond them.
    """
    d = b - a
    tt = (p - a).dot(d) / max(d.dot(d), 1e-9)
    t = max(0.0, min(1.0, tt))
    base = (p - (a + d * t)).length
    overshoot = (-tt if tt < 0.0 else (tt - 1.0 if tt > 1.0 else 0.0)) * d.length
    return base + over * overshoot


def skin(ob, rig, body, power=4.0, keep=4, smooth_rounds=3):
    J = joints(body)
    segs = [(n, h, t) for n, h, t, _p, deform in chain(J) if deform]
    names = [n for n, _h, _t in segs]
    for n in names:
        if n not in ob.vertex_groups:
            ob.vertex_groups.new(name=n)

    me = ob.data
    W = []
    for v in me.vertices:
        p = ob.matrix_world @ v.co
        d = [(_seg_dist(p, h, t), i) for i, (_n, h, t) in enumerate(segs)]
        d.sort()
        top = d[:keep]
        w = [(i, 1.0 / max(dist, 1e-4) ** power) for dist, i in top]
        s = sum(x for _i, x in w) or 1.0
        W.append({i: x / s for i, x in w})

    # Laplacian smoothing of the weight field over the cage's own edges.
    nbr = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        nbr[a].append(b)
        nbr[b].append(a)
    # ⚠️ SMOOTHING MUST NOT LET A WEIGHT TRAVEL. Each round lets a vertex pick
    # up bones from its neighbours, so without a floor the support GROWS by a
    # ring every round: four rounds carried upperarm influence from the
    # shoulder all the way to the hip, and raising the arm pulled the whole
    # flank up into a sail from hip to ear. The raw distance field was never
    # the problem -- a mid-torso vertex gives the arm about 2% -- the
    # diffusion was.
    #
    # So prune after every round. A bone that ends up under FLOOR on a vertex
    # is noise that arrived by diffusion, not a real influence, and dropping
    # it stops the front advancing while still smoothing locally.
    FLOOR = 0.05
    for _ in range(smooth_rounds):
        nxt = []
        for i, w in enumerate(W):
            acc = {k: x * 0.60 for k, x in w.items()}
            share = 0.40 / max(len(nbr[i]), 1)
            for j in nbr[i]:
                for k, x in W[j].items():
                    acc[k] = acc.get(k, 0.0) + x * share
            acc = {k: x for k, x in acc.items() if x >= FLOOR}
            acc = dict(sorted(acc.items(), key=lambda kv: -kv[1])[:keep])
            s = sum(acc.values()) or 1.0
            nxt.append({k: x / s for k, x in acc.items()})
        W = nxt

    for i, w in enumerate(W):
        for bi, x in w.items():
            if x > 1e-4:
                ob.vertex_groups[names[bi]].add([i], x, "REPLACE")

    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    # ⚠️ ARMATURE BEFORE SUBSURF. Deform the cage, then subdivide it -- the
    # other order subdivides first and then drags a dense mesh around with
    # the same coarse weights, which is both slower and blockier.
    while ob.modifiers.find("Armature") > 0:
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_move_up(modifier="Armature")
    ob.parent = rig

    spread = sum(len(w) for w in W) / float(len(W))
    print("SKIN %d verts, %.1f bones per vert after %d smoothing rounds"
          % (len(W), spread, smooth_rounds))

    # ⚠️ A BONE'S REACH IS A NUMBER, SO PRINT IT. Twice now I have stared at
    # a render trying to work out why a fin of torso follows the arm, when
    # the question "how far down the body does upperarm_r actually reach"
    # has an exact answer. A bone that influences a vertex far outside its
    # own span is the whole defect, and it is invisible in a still until it
    # is posed.
    for bn in ("upperarm_r", "deltoid_r", "clav_r", "chest", "spine_02"):
        if bn not in names:
            continue
        bi = names.index(bn)
        zs = [(ob.matrix_world @ me.vertices[i].co).z
              for i, w in enumerate(W) if w.get(bi, 0.0) > 0.25]
        if zs:
            h, t = segs[bi][1], segs[bi][2]
            span = (min(h.z, t.z), max(h.z, t.z))
            leak = max(0.0, span[0] - min(zs))
            print("   %-11s owns %3d verts  z %.2f..%.2f   bone spans %.2f..%.2f%s"
                  % (bn, len(zs), min(zs), max(zs), span[0], span[1],
                     "   <-- reaches %.2f m below its own head" % leak
                     if leak > 0.12 else ""))
    return mod
