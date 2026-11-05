import bpy, os
import numpy as np

# ═══════════════════════════════════════════════════════════════════════════
# SURFACING THE DRAGON — unwrap, shade, bake
#
# Three steps that get run together and are usually confused with each other:
#
#   UNWRAP   cut the surface open and flatten it, so a pixel has somewhere to
#            live. Smart UV Project is fine here and would not be on a face,
#            because the pattern is generated from 3D POSITION -- a seam
#            between two islands still lines up, since both sides sample the
#            same point in space.
#   SHADE    author the look procedurally: scales, belly scutes, membrane
#            veins, horn keratin. No painting, no photo textures, nothing
#            bought.
#   BAKE     freeze that shader into images. A browser cannot evaluate a
#            Voronoi graph; glTF carries base colour, roughness and a normal
#            map and nothing else.
#
# ⚠️ WHICH VERTEX IS WHAT CANNOT BE RECOVERED HERE. The membrane is weighted
# to the same wing bones as the arm's flesh, so no bone group separates them.
# rig-dragon.py tags a MEMBRANE vertex group while they are still separate
# objects; this reads it back. Keratin IS recoverable from bone names, and
# the belly is geometric.
# ═══════════════════════════════════════════════════════════════════════════
TEX = int(os.environ.get("TEX", "1024"))
DEC = float(os.environ.get("DEC", "0.42"))
SHOT = os.environ.get("OUT_DIR")

bpy.context.view_layer.objects.active = drg
bpy.ops.object.select_all(action="DESELECT")
drg.select_set(True)

# ── 1. DECIMATE FIRST ───────────────────────────────────────────────────────
# Unwrap the geometry that actually ships. Unwrapping 30k faces and then
# collapsing them to 14k drags every UV through the collapse with it.
dec = drg.modifiers.new("Dec", "DECIMATE")
dec.ratio = DEC
bpy.ops.object.modifier_move_to_index(modifier="Dec", index=0)
bpy.ops.object.modifier_apply(modifier="Dec")
print("DECIMATED to %d faces" % len(drg.data.polygons))


# ── 2. REGION MASKS ─────────────────────────────────────────────────────────
# One colour attribute carrying three masks: R membrane, G keratin, B belly.
# The shader reads it; nothing has to re-derive it.
me = drg.data
nv = len(me.vertices)
gi = {g.name: g.index for g in drg.vertex_groups}

memb = np.zeros(nv)
gm = gi.get("MEMBRANE")
for v in me.vertices:
    for g in v.groups:
        if g.group == gm:
            memb[v.index] = g.weight

# ── KERATIN ── horn, spike, claw.
#
# ⚠️ NOT FROM THE WEIGHTS. Two bakes were lost to that. Weights spread over
# the nearest four bones, so a ridge spike owns a little of the back beside
# it and a claw a little of the foot; summing those fractions and treating
# the total as opacity painted the whole head, neck, legs and tail bone-white
# twice. Thresholding the sum harder only moved the line, because the sum is
# genuinely large on a back crowded with spikes.
#
# The question is not "how much keratin influence is here", it is "is this
# point ON a spike" -- which is a geometric test with an exact answer: is the
# NEAREST bone a keratin bone, and by how clear a margin.
KER = [i for i, n in enumerate(BONES)
       if n.startswith(("horn_", "browspike_", "ridge")) or "toe" in n]
OTH = [i for i in range(len(BONES)) if i not in set(KER)]

VP = np.empty(nv * 3)
me.vertices.foreach_get("co", VP)
VP = VP.reshape(-1, 3)
Hd2 = np.array([list(ad.bones[n].head_local) for n in BONES])
Tl2 = np.array([list(ad.bones[n].tail_local) for n in BONES])
D2 = np.empty((len(BONES), nv))
for i in range(len(BONES)):
    ab = Tl2[i] - Hd2[i]
    L2 = float(ab @ ab) or 1e-9
    t = np.clip(((VP - Hd2[i]) @ ab) / L2, 0.0, 1.0)[:, None]
    D2[i] = np.linalg.norm(VP - (Hd2[i] + t * ab), axis=1)

# ⚠️ AND NOT BY COMPARING IT TO THE NEAREST OTHER BONE EITHER. That was the
# third attempt and it was worse than it looked: a spike bone STARTS at the
# skin, while the bone it would be compared against runs down the CENTRE of
# the body. So every surface vertex near a spike's base is nearer the spike
# than the spine and wins the comparison. Measured, that put keratin at 0.53
# on the skull, 0.43 on the muzzle and 0.62 at mid-tail -- the whole animal
# bleached, and it survived two rounds of me looking at renders and blaming
# the lighting.
#
# A spike is THIN. Absolute distance against the spike's own thickness is
# the test, and it needs no second opinion.
dk = D2[KER].min(axis=0)

# Belly is geometric: a downward-facing surface. No tag can know it and no
# bone owns it -- the same spine bone drives the back and the stomach.
nrm = np.empty(nv * 3)
me.vertices.foreach_get("normal", nrm)
nz = nrm.reshape(-1, 3)[:, 2]


def smooth(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


kerat = 1.0 - smooth(dk, 0.05, 0.15)
memb = smooth(memb, 0.35, 0.70)
# A belly is the UNDERSIDE, not "anything not facing straight up". At a
# lower bound of 0.05 a vertical shin picks up ~0.2 of it, which would not
# matter if the two colours were close -- see the palette note below.
belly = smooth(-nz, 0.30, 0.88) * (1.0 - memb) * (1.0 - kerat)

ca = me.color_attributes.new(name="region", type="FLOAT_COLOR", domain="POINT")
flat = np.empty(nv * 4)
flat[0::4], flat[1::4], flat[2::4], flat[3::4] = memb, kerat, belly, 1.0
ca.data.foreach_set("color", flat)
# A reading, not a gate: what do the masks actually say at points I can
# name? "The head looks cream" is not something a picture can attribute to a
# branch of a shader graph.
for _lbl, _b in (("skull", "head_01"), ("muzzle", "head_03"), ("shin", "fore_l_03"),
                 ("flank", "spine_03"), ("tailmid", "tail_04"), ("wing", "spar2_l_02")):
    _h = np.array(list(ad.bones[_b].head_local))
    _t = np.array(list(ad.bones[_b].tail_local))
    _c = (_h + _t) * 0.5
    _sel = np.linalg.norm(VP - _c, axis=1) < 0.45
    if _sel.sum():
        print("   AT %-8s n=%4d  membrane %.2f  keratin %.2f  belly %.2f"
              % (_lbl, _sel.sum(), memb[_sel].mean(), kerat[_sel].mean(), belly[_sel].mean()))

print("MASKS membrane %d verts, keratin %d, belly %d"
      % (int((memb > 0.5).sum()), int((kerat > 0.5).sum()), int((belly > 0.5).sum())))


# ── 3. UNWRAP ───────────────────────────────────────────────────────────────
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004, scale_to_bounds=False)
bpy.ops.object.mode_set(mode="OBJECT")
print("UV islands unwrapped, %d loops" % len(me.uv_layers[0].data))


# ── 4. THE PROCEDURAL MATERIAL ──────────────────────────────────────────────
mat = bpy.data.materials.new("DragonProc")
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)

def N(kind, **kw):
    n = nt.nodes.new(kind)
    for k, v in kw.items():
        setattr(n, k, v)
    return n

def L(a, ao, b, bi):
    nt.links.new(a.outputs[ao], b.inputs[bi])

def RGB(r, g, b):
    n = N("ShaderNodeRGB")
    n.outputs[0].default_value = (r, g, b, 1.0)
    return n

def VAL(x):
    n = N("ShaderNodeValue")
    n.outputs[0].default_value = x
    return n

def mix(fac_node, fac_out, a, ao, b, bo, blend="MIX"):
    m = N("ShaderNodeMixRGB", blend_type=blend)
    if fac_node is None:
        m.inputs["Fac"].default_value = fac_out
    else:
        L(fac_node, fac_out, m, "Fac")
    L(a, ao, m, "Color1")
    L(b, bo, m, "Color2")
    return m

coord = N("ShaderNodeTexCoord")
geo = N("ShaderNodeNewGeometry")
reg = N("ShaderNodeAttribute", attribute_name="region")
sep = N("ShaderNodeSeparateColor")
L(reg, "Color", sep, "Color")
M_MEM, M_KER, M_BEL = "Red", "Green", "Blue"

# ── scales ── DISTANCE_TO_EDGE gives cell borders directly, which is what a
# scale pattern is. F1 gives a per-cell random for tonal variation.
cells = N("ShaderNodeTexVoronoi", feature="DISTANCE_TO_EDGE")
cells.inputs["Scale"].default_value = 26.0
cells.inputs["Randomness"].default_value = 0.85
L(coord, "Object", cells, "Vector")
edge = N("ShaderNodeValToRGB")
edge.color_ramp.elements[0].position = 0.00
edge.color_ramp.elements[0].color = (0.30, 0.30, 0.30, 1)
edge.color_ramp.elements[1].position = 0.085
edge.color_ramp.elements[1].color = (1.06, 1.06, 1.06, 1)
L(cells, "Distance", edge, "Fac")

tone = N("ShaderNodeTexVoronoi", feature="F1")
tone.inputs["Scale"].default_value = 26.0
L(coord, "Object", tone, "Vector")

# ── dorsal to ventral ── a dragon is dark on top and pale underneath, and the
# surface normal already knows which way a point faces.
nsep = N("ShaderNodeSeparateXYZ")
L(geo, "Normal", nsep, "Vector")
dorsal = N("ShaderNodeMapRange")
dorsal.inputs["From Min"].default_value = -0.55
dorsal.inputs["From Max"].default_value = 0.65
L(nsep, "Z", dorsal, "Value")

# ⚠️ THESE ARE LINEAR VALUES AND THE EYE JUDGES sRGB. Linear 0.2 displays
# at about 0.48 -- more than twice as bright as it reads on the page. The
# first palette paired a hide at 0.07 with belly scutes at 0.60: an EIGHT
# times ratio, so a mask leaking 20% onto a shin still landed halfway to
# white. Three rounds went on hunting a mask bug that was not there; the
# masks were right and the palette had no mid-tones in it. Keep every region
# within roughly 3x of its neighbours.
hide = mix(dorsal, "Result", RGB(0.088, 0.076, 0.048), "Color",
           RGB(0.030, 0.055, 0.042), "Color")
hide = mix(None, 0.16, hide, "Color", tone, "Color", "OVERLAY")
hide = mix(None, 0.92, hide, "Color", edge, "Color", "MULTIPLY")

# ── belly scutes ── broad bands across the underside, not scales.
scute = N("ShaderNodeTexWave", wave_type="BANDS", bands_direction="Y")
scute.inputs["Scale"].default_value = 3.4
scute.inputs["Distortion"].default_value = 1.6
scute.inputs["Detail"].default_value = 2.0
L(coord, "Object", scute, "Vector")
sramp = N("ShaderNodeValToRGB")
sramp.color_ramp.elements[0].position = 0.35
sramp.color_ramp.elements[0].color = (0.130, 0.112, 0.070, 1)
sramp.color_ramp.elements[1].position = 0.60
sramp.color_ramp.elements[1].color = (0.235, 0.200, 0.126, 1)
L(scute, "Fac", sramp, "Fac")
body = mix(sep, M_BEL, hide, "Color", sramp, "Color")

# ── membrane ── oxblood, with the vein network a wing actually has. High
# distortion on a wave turns regular bands into branching lines.
vein = N("ShaderNodeTexWave", wave_type="BANDS", bands_direction="X")
vein.inputs["Scale"].default_value = 4.2
vein.inputs["Distortion"].default_value = 3.2
vein.inputs["Detail"].default_value = 3.0
L(coord, "Object", vein, "Vector")
vramp = N("ShaderNodeValToRGB")
# ⚠️ KEEP THE CONTRAST LOW. A high-contrast wave over a whole sail is not
# veining, it is brain coral -- which is exactly what the second bake looked
# like. A real wing is a near-flat leather with the structure READ FROM THE
# SPARS; the veins are a whisper on top of it.
vramp.color_ramp.elements[0].position = 0.46
vramp.color_ramp.elements[0].color = (0.088, 0.036, 0.031, 1)
vramp.color_ramp.elements[1].position = 0.78
vramp.color_ramp.elements[1].color = (0.150, 0.066, 0.052, 1)
L(vein, "Fac", vramp, "Fac")
grain = N("ShaderNodeTexNoise")
grain.inputs["Scale"].default_value = 34.0
grain.inputs["Detail"].default_value = 6.0
grain.inputs["Roughness"].default_value = 0.62
L(coord, "Object", grain, "Vector")
memsurf = mix(grain, "Fac", vramp, "Color", RGB(0.168, 0.076, 0.058), "Color")
surf = mix(sep, M_MEM, body, "Color", memsurf, "Color")

# ── keratin ── horn, spike and claw. Pale, nearly uniform, faintly streaked.
kn = N("ShaderNodeTexNoise")
kn.inputs["Scale"].default_value = 11.0
kn.inputs["Detail"].default_value = 5.0
L(coord, "Object", kn, "Vector")
ker = mix(kn, "Fac", RGB(0.150, 0.132, 0.098), "Color", RGB(0.300, 0.272, 0.212), "Color")
surf = mix(sep, M_KER, surf, "Color", ker, "Color")

# ── roughness ── hide is satin, membrane is matte, horn is polished.
# ⚠️ A LINKED SOCKET IGNORES ITS default_value. This used to wire both
# inputs to Value nodes and THEN assign the defaults, so roughness baked as
# 0.0 over the entire animal -- a mirror finish that blew every surface out
# to cream under three area lights. Two rounds went on blaming the region
# masks, which were correct the whole time; rendering the masks as raw
# colour settled it in one shot.
rgh = N("ShaderNodeMixRGB")
L(sep, M_MEM, rgh, "Fac")
rgh.inputs["Color1"].default_value = (0.47, 0.47, 0.47, 1)
rgh.inputs["Color2"].default_value = (0.76, 0.76, 0.76, 1)
rgh = mix(sep, M_KER, rgh, "Color", RGB(0.30, 0.30, 0.30), "Color")

# ── bump ── the scale edges are real relief; the membrane only has veins.
hgt = mix(sep, M_MEM, cells, "Distance", vein, "Fac")
hgt = mix(sep, M_KER, hgt, "Color", VAL(0.5), "Value")
bump = N("ShaderNodeBump")
bump.inputs["Strength"].default_value = 0.42
bump.inputs["Distance"].default_value = 0.04
L(hgt, "Color", bump, "Height")

bsdf = N("ShaderNodeBsdfPrincipled")
out = N("ShaderNodeOutputMaterial")
L(surf, "Color", bsdf, "Base Color")
L(rgh, "Color", bsdf, "Roughness")
L(bump, "Normal", bsdf, "Normal")
bsdf.inputs["Metallic"].default_value = 0.0
L(bsdf, "BSDF", out, "Surface")

me.materials.clear()
me.materials.append(mat)


# ── 5. BAKE ─────────────────────────────────────────────────────────────────
# Cycles only. One sample is enough: none of these passes is a light
# transport problem, they are a texture evaluated at a surface point.
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = 1
sc.render.bake.margin = 8
sc.render.bake.use_selected_to_active = False

baked = {}
img_node = N("ShaderNodeTexImage")

def bake(name, kind, res, non_color):
    img = bpy.data.images.new("dragon_%s" % name, res, res, alpha=False,
                              float_buffer=False, is_data=non_color)
    img_node.image = img
    nt.nodes.active = img_node
    sc.cycles.bake_type = kind
    if kind == "DIFFUSE":
        sc.render.bake.use_pass_direct = False
        sc.render.bake.use_pass_indirect = False
        sc.render.bake.use_pass_color = True
    bpy.ops.object.bake(type=kind)
    # ⚠️ SETTING file_format ON AN IN-MEMORY BAKE DOES NOTHING. The glTF
    # exporter embeds the bytes the image actually HAS, and a freshly baked
    # buffer has none -- so it re-encodes everything as PNG and the flag is
    # silently ignored. 1024 colour + 1024 normal as PNG is 2.6MB of texture
    # in a 4.2MB GLB. Writing each one to disk in the format we want and
    # reloading it gives the exporter real compressed bytes to carry.
    #
    # Colour and roughness take JPEG happily. The normal map does not --
    # JPEG rings around an edge, and on a normal that ringing is a lighting
    # error rather than a soft pixel -- so it stays PNG and pays for that by
    # being half the resolution.
    fmt = "PNG" if name == "normal" else "JPEG"
    ext = "png" if fmt == "PNG" else "jpg"
    tmp = os.path.join(bpy.app.tempdir, "dragon_%s.%s" % (name, ext))
    sc.render.image_settings.file_format = fmt
    sc.render.image_settings.quality = 90
    img.file_format = fmt
    img.save_render(tmp, scene=sc)
    img.source = "FILE"
    img.filepath = tmp
    img.reload()
    img.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    img.pack()
    baked[name] = img
    if SHOT:
        import shutil
        shutil.copy(tmp, os.path.join(SHOT, "dragon_%s.%s" % (name, ext)))
    print("BAKED %-8s %dx%d" % (name, res, res))

bake("color", "DIFFUSE", TEX, False)
bake("rough", "ROUGHNESS", TEX // 2, True)
bake("normal", "NORMAL", TEX // 2, True)


# ── 6. THE SHIPPING MATERIAL ────────────────────────────────────────────────
# glTF carries images, not node graphs. Everything above is now three PNGs.
fin = bpy.data.materials.new("DragonScale")
fin.use_nodes = True
ft = fin.node_tree
for n in list(ft.nodes):
    ft.nodes.remove(n)
fb = ft.nodes.new("ShaderNodeBsdfPrincipled")
fo = ft.nodes.new("ShaderNodeOutputMaterial")
ft.links.new(fb.outputs["BSDF"], fo.inputs["Surface"])
fb.inputs["Metallic"].default_value = 0.0

for sock, key, extra in (("Base Color", "color", None),
                         ("Roughness", "rough", None),
                         ("Normal", "normal", "map")):
    tn = ft.nodes.new("ShaderNodeTexImage")
    tn.image = baked[key]
    if key != "color":
        tn.image.colorspace_settings.name = "Non-Color"
    if extra == "map":
        nm = ft.nodes.new("ShaderNodeNormalMap")
        ft.links.new(tn.outputs["Color"], nm.inputs["Color"])
        ft.links.new(nm.outputs["Normal"], fb.inputs[sock])
    else:
        ft.links.new(tn.outputs["Color"], fb.inputs[sock])

me.materials.clear()
me.materials.append(fin)
sc.render.engine = "BLENDER_EEVEE_NEXT"
print("TEXTURED")
