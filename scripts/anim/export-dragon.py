import bpy, os, sys

# ═══════════════════════════════════════════════════════════════════════════
# EXPORT THE DRAGON
#
# Simpler than the hero's exporter for one reason: this rig has no IK. Every
# clip is already plain bone rotation, so there is nothing to bake down and
# no constraint that has to survive until the last clip. The hero needed
# clear_constraints=False threaded through four bakes; here the actions are
# the final data.
#
# ⚠️ ONE FILE, EVERY CLIP. A three.js AnimationMixer can only cross-fade
# actions that share a skeleton, so all four have to ride in one container.
# ═══════════════════════════════════════════════════════════════════════════
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
exec(open(os.path.join(HERE, "anim-dragon.py")).read())

# ── SCALE ── one material, no textures. The lab shades it; this just keeps
# the GLB from arriving default-grey, which is how the hero shipped twice.
m = bpy.data.materials.new("DragonScale")
m.use_nodes = True
p = m.node_tree.nodes["Principled BSDF"]
p.inputs["Base Color"].default_value = (0.072, 0.150, 0.118, 1.0)
p.inputs["Roughness"].default_value = 0.55
p.inputs["Metallic"].default_value = 0.08
drg.data.materials.clear()
drg.data.materials.append(m)

# ── DECIMATE ── 29k faces is a desktop number. Collapse carries vertex
# groups through, so the bind survives.
dec = drg.modifiers.new("Dec", "DECIMATE")
dec.ratio = 0.42
bpy.context.view_layer.objects.active = drg
bpy.ops.object.modifier_move_to_index(modifier="Dec", index=0)
bpy.ops.object.modifier_apply(modifier="Dec")
print("DECIMATED to %d faces" % len(drg.data.polygons))

bpy.ops.object.select_all(action="DESELECT")
drg.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm

path = os.path.join(REPO, "public", "models", "dragon.glb")
bpy.ops.export_scene.gltf(
    filepath=path, export_format="GLB", use_selection=True,
    export_animations=True, export_animation_mode="ACTIONS",
    export_frame_range=False, export_yup=True, export_apply=False,
    export_materials="EXPORT",
)
print("GLB_OK %s  %d KB" % (os.path.basename(path), os.path.getsize(path) // 1024))
for n, e in HELD:
    print("   %-6s %2d frames" % (n, e))
