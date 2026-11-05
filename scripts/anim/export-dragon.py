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

# ── SURFACE IT ── unwrap, shade, bake. Decimation lives in there too, so the
# UVs belong to the geometry that actually ships.
exec(open(os.path.join(HERE, "texture-dragon.py")).read())

bpy.ops.object.select_all(action="DESELECT")
drg.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm

path = os.path.join(REPO, "public", "models", "dragon.glb")
bpy.ops.export_scene.gltf(
    filepath=path, export_format="GLB", use_selection=True,
    export_animations=True, export_animation_mode="ACTIONS",
    export_frame_range=False, export_yup=True, export_apply=False,
    export_materials="EXPORT", export_image_format="AUTO",
    export_jpeg_quality=88,
)
print("GLB_OK %s  %d KB" % (os.path.basename(path), os.path.getsize(path) // 1024))
for n, e in HELD:
    print("   %-6s %2d frames" % (n, e))
