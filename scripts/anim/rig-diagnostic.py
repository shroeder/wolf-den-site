import bpy, math, os, sys
from mathutils import Vector, Euler

# ═══════════════════════════════════════════════════════════════════════════
# RIG DIAGNOSTIC
#
# The thing that should have run before a single keyframe was authored.
#
# A rig that MOVES the mesh is not the same as a rig that moves it CORRECTLY.
# I confirmed the first and assumed the second, then spent a whole session
# animating a skeleton whose joints do not sit inside the limbs they drive.
#
# Everything here is a yes/no with a number attached. No renders, no judgement.
# ═══════════════════════════════════════════════════════════════════════════
OUT = os.environ.get("OUT_DIR", ".")
KEEP_HELPERS = os.environ.get("KEEP_HELPERS", "0") == "1"

bpy.ops.preferences.addon_enable(module="bl_ext.blender_org.mpfb")
from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService
bpy.ops.wm.read_homefile(use_empty=True)

macro = TargetService.get_default_macro_info_dict()
if os.environ.get("MACRO", "custom") == "custom":
    for k, v in (("gender", 1.0), ("age", 0.55), ("muscle", 0.95), ("weight", 0.56),
                 ("height", 0.80), ("proportions", 1.0), ("cupsize", 0.0), ("firmness", 0.9)):
        macro[k] = v
print("  MACRO MODE: %s   SCALE: %s" % (os.environ.get("MACRO", "custom"), os.environ.get("SCALE", "0.1")))
human = HumanService.create_human(macro_detail_dict=macro, scale=float(os.environ.get("SCALE", "0.1")),
                                  feet_on_ground=True, detailed_helpers=False)
# ⚠️ THE MACRO DETAILS ARE SHAPE KEYS. If the rig is fitted while they are
# still live, it binds against geometry that is not the geometry you can see,
# and the armature then stretches the body (1.255x on this character).
if os.environ.get("BAKE_FIRST", "0") == "1":
    if human.data.shape_keys:
        n = len(human.data.shape_keys.key_blocks)
        bpy.context.view_layer.objects.active = human
        human.select_set(True)
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
        human.select_set(False)
        print("  BAKED %d shape keys BEFORE rigging" % n)
if os.environ.get("RIG_VIA", "service") == "operator":
    # What the add-on's own button does, rather than my direct service call.
    bpy.ops.object.select_all(action="DESELECT")
    human.select_set(True)
    bpy.context.view_layer.objects.active = human
    sc = bpy.context.scene
    for prop, val in (("MPFB_ADD_STANDARD_RIG_standard_rig", "game_engine"),
                      ("MPFB_ADD_STANDARD_RIG_import_weights", True)):
        try: setattr(sc, prop, val)
        except Exception: pass
    try:
        bpy.ops.mpfb.add_standard_rig()
        print("  RIG VIA OPERATOR add_standard_rig")
    except Exception as e:
        print("  OPERATOR FAILED: %s" % e)
    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
else:
    arm = HumanService.add_builtin_rig(human, "game_engine")
    print("  RIG VIA SERVICE add_builtin_rig")

# ── ALIGN THE FLESH TO THE SKELETON ──────────────────────────────────────
# The rig is correctly SIZED (bones span 1.654, mesh spans 1.659) but sits
# ~0.81 lower -- its origin is at hip height, not the floor. The armature
# modifier deforms by pose-relative-to-rest, so what decides anatomy is where
# the VERTICES sit relative to the bones. Sliding the mesh data down onto the
# skeleton makes every joint land inside the limb it drives.
if os.environ.get("ALIGN", "0") == "1":
    bz = [(arm.matrix_world @ b.head_local).z for b in arm.data.bones] +          [(arm.matrix_world @ b.tail_local).z for b in arm.data.bones]
    dg0 = bpy.context.evaluated_depsgraph_get(); ev0 = human.evaluated_get(dg0)
    mz = [(ev0.matrix_world @ v.co).z for v in ev0.data.vertices]
    dz = min(bz) - min(mz)
    for v in human.data.vertices:
        v.co.z += dz
    bpy.context.view_layer.update()
    print("  ALIGNED mesh by %+.4f onto the skeleton" % dz)

print("")
print("  ════ A. OBJECT GRAPH ═══════════════════════════════════════════")
print("  human            : %s   parent=%s" % (human.name, human.parent.name if human.parent else None))
print("  armature         : %s" % arm.name)
print("  human.matrix_world translation %s" % (tuple(round(v, 4) for v in human.matrix_world.translation),))
print("  arm.matrix_world   translation %s" % (tuple(round(v, 4) for v in arm.matrix_world.translation),))
print("  human.matrix_parent_inverse t  %s" % (tuple(round(v, 4) for v in human.matrix_parent_inverse.translation),))
mods = [(m.type, getattr(m, "object", None).name if getattr(m, "object", None) else "-") for m in human.modifiers]
print("  human modifiers  : %s" % (mods,))
others = [o.name for o in bpy.data.objects if o.type == "MESH" and o is not human]
print("  other meshes     : %s" % ((others or "none"),))

print("")
print("  ════ B. WEIGHTS ════════════════════════════════════════════════")
bones = [b.name for b in arm.data.bones]
vgs = [g.name for g in human.vertex_groups]
matched = [n for n in bones if n in vgs]
print("  bones %d | vertex groups %d | groups matching a bone: %d" % (len(bones), len(vgs), len(matched)))
missing = [n for n in bones if n not in vgs]
print("  bones with NO vertex group: %s" % ((missing[:8] if missing else "none"),))
vg_idx = {g.index: g.name for g in human.vertex_groups}
weighted = 0
for v in human.data.vertices:
    if any(g.weight > 0.0001 and vg_idx.get(g.group) in matched for g in v.groups):
        weighted += 1
print("  vertices with a bone weight: %d of %d (%.1f%%)" % (
    weighted, len(human.data.vertices), 100.0 * weighted / max(1, len(human.data.vertices))))

def ev_coords():
    dg = bpy.context.evaluated_depsgraph_get()
    ev = human.evaluated_get(dg)
    mw = ev.matrix_world
    return [mw @ v.co for v in ev.data.vertices]

print("")
print("  ════ C. DO BONES SIT INSIDE THE BODY AT REST? ══════════════════")
bpy.context.view_layer.update()
rest = ev_coords()
mlo, mhi = min(p.z for p in rest), max(p.z for p in rest)
raw = [human.matrix_world @ v.co for v in human.data.vertices]
rlo, rhi = min(p.z for p in raw), max(p.z for p in raw)
print("  UNdeformed mesh height %.4f   (z %+.4f .. %+.4f)" % (rhi - rlo, rlo, rhi))
print("  DEFORMED   mesh height %.4f   (z %+.4f .. %+.4f)" % (mhi - mlo, mlo, mhi))
print("  >>> armature changes height by %.3fx  (1.000 = bind is correct)" % ((mhi - mlo) / max(1e-6, rhi - rlo)))
W = arm.matrix_world
for n in ("pelvis", "spine_03", "head", "thigh_l", "calf_l", "foot_l", "hand_l"):
    pb = arm.pose.bones.get(n)
    if not pb: continue
    p = W @ pb.head
    # nearest mesh vertex to this joint, and whether the joint is INSIDE the body
    d = min((p - q).length for q in rest)
    print("  %-9s world %-24s nearest mesh vertex %.4f away" % (
        n, str(tuple(round(v, 3) for v in p)), d))

print("")
print("  ════ D. DOES A BONE ACTUALLY DRIVE ITS OWN FLESH? ══════════════")
# The decisive test. Rotate one bone and measure how far the vertices WEIGHTED
# TO THAT BONE move. If its own flesh does not follow it, the bind is broken.
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="POSE")
for pb in arm.pose.bones:
    pb.rotation_mode = "XYZ"

def group_verts(name):
    g = human.vertex_groups.get(name)
    if not g: return []
    out = []
    for v in human.data.vertices:
        for gg in v.groups:
            if gg.group == g.index and gg.weight > 0.5:
                out.append(v.index); break
    return out

# ⚠️ MPFB PUTS A MASK MODIFIER ON THE BODY. It deletes the helper geometry, so
# the EVALUATED mesh has fewer vertices than the base and the indices do not
# correspond. Any per-vertex comparison has to turn it off first.
_mask = next((m for m in human.modifiers if m.type == "MASK"), None)
if _mask:
    _mask.show_viewport = False
    bpy.context.view_layer.update()
    print("  (mask modifier disabled for the vertex test)")

base = ev_coords()
print("  base verts %d vs mesh verts %d" % (len(base), len(human.data.vertices)))
print("  bone        own-flesh verts   moved by   expected ~   verdict")
for n in ("thigh_l", "calf_l", "upperarm_l", "head"):
    idx = group_verts(n)
    if not idx:
        print("  %-11s (no vertex group over weight 0.5)" % n); continue
    pb = arm.pose.bones[n]
    pb.rotation_euler = Euler((math.radians(25), 0, 0), "XYZ")
    bpy.context.view_layer.update()
    after = ev_coords()
    moved = sum((after[i] - base[i]).length for i in idx) / len(idx)
    # a point r from the pivot swept 25 deg travels about 0.436*r
    pivot = W @ pb.head
    r = sum((base[i] - pivot).length for i in idx) / len(idx)
    expect = 2 * r * math.sin(math.radians(25) / 2)
    ok = "OK" if moved > expect * 0.5 else "*** DEAD ***"
    print("  %-11s %5d            %.4f     %.4f       %s" % (n, len(idx), moved, expect, ok))
    pb.rotation_euler = Euler((0, 0, 0), "XYZ")
    bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode="OBJECT")
print("")

print("")
print("  ════ E. DOES EACH BONE SIT IN ITS OWN FLESH? ═══════════════════")
# The check that would have caught this on minute one. For each bone, take the
# centroid of the vertices it owns and compare it to the bone's own segment.
# If a joint is not inside the limb it drives, nothing downstream can be
# trusted -- and every measurement I made all session was of a skeleton
# sitting somewhere the body is not.
bpy.context.view_layer.update()
ev = ev_coords()
worst = 0.0
for n in ("pelvis", "spine_03", "neck_01", "head", "thigh_l", "calf_l",
          "foot_l", "upperarm_l", "lowerarm_l", "hand_l"):
    idx = group_verts(n)
    pb = arm.pose.bones.get(n)
    if not idx or not pb:
        print("  %-11s --" % n); continue
    cen = Vector((0, 0, 0))
    for i in idx: cen += ev[i]
    cen /= len(idx)
    h, t = W @ pb.head, W @ pb.tail
    seg = t - h
    L = seg.length or 1e-6
    u = max(0.0, min(1.0, (cen - h).dot(seg) / (L * L)))
    dist = (cen - (h + seg * u)).length
    worst = max(worst, dist / L)
    flag = "" if dist < L * 0.9 else "   *** JOINT IS OUTSIDE ITS LIMB ***"
    print("  %-11s centroid %6.3f from the bone (bone is %.3f long) -> %.0f%% of its length%s" % (
        n, dist, L, 100 * dist / L, flag))
print("")
print("  WORST: centroid sits %.0f%% of a bone length away from its own bone" % (100 * worst))
print("  (under ~50%% means the skeleton is inside the body; over 100%% means it is not)")
