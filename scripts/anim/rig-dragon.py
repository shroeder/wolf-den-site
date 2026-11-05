import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

# ═══════════════════════════════════════════════════════════════════════════
# RIG THE DRAGON
#
# The hero cost a day to a bind mismatch: MPFB fitted its rig to base.obj and
# not to the character, so every joint sat a hip-height away from the flesh it
# was supposed to drive, and nothing in the file said so. The fix was to
# measure the body and scale the rest bones onto it after the fact.
#
# Here that failure is not expressible. The mesh and the skeleton come out of
# the SAME joint graph -- build-dragon.py's (J, E) -- so a bone is inside its
# limb by construction, and this script never guesses a position.
#
# Weights are computed, not solved. Bone-heat is a diffusion solve over the
# surface; it is better than this when it converges and it reports
# "failed to find solution for one or more bones" when it does not, which it
# will on a membrane that is a separate 0.03-thick shell. Distance to the bone
# SEGMENT has no failure mode, and with the graph this sparse it is accurate.
# ═══════════════════════════════════════════════════════════════════════════
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "build-dragon.py")).read())

ROOT_JOINT = BODY[1]          # the belly: the one joint everything hangs off
NEAREST = 4                   # bones allowed to influence one vertex
FALLOFF = 3.0                 # 1/d**FALLOFF -- higher is more local
REACH = 2.3                   # ignore a bone further than REACH x the nearest


# ── 1. COLLAPSE EVERYTHING TO ONE MESH ──────────────────────────────────────
def _apply(ob):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.active_object

drg = _apply(drg)
MEMBRANES = [_apply(m) for m in MEMBRANES]
# ── TAG THE MEMBRANE BEFORE IT STOPS BEING ITS OWN OBJECT ───────────────────
# Surfacing needs to know which vertices are sail and which are hide, and
# after the join nothing distinguishes them: the membrane is weighted to the
# same wing bones as the arm's flesh, so no bone group can answer it. A join
# merges vertex groups by name and gives absent verts zero, so a group set
# here survives as a clean mask -- and Decimate interpolates it, so it
# survives that too.
for _m in MEMBRANES:
    _g = _m.vertex_groups.new(name="MEMBRANE")
    _g.add(range(len(_m.data.vertices)), 1.0, "REPLACE")
bpy.ops.object.select_all(action="DESELECT")
for o in [drg] + MEMBRANES:
    o.select_set(True)
bpy.context.view_layer.objects.active = drg
bpy.ops.object.join()
drg = bpy.context.active_object
drg.name = "Dragon"
print("MESH %d verts, %d faces" % (len(drg.data.vertices), len(drg.data.polygons)))


# ── 2. THE ARMATURE ─────────────────────────────────────────────────────────
# (J, E) is an undirected tree. Walk it outward from the belly so every bone
# runs parent -> child, which is the only orientation an armature accepts.
adj = {}
for a, b in E:
    adj.setdefault(a, []).append(b)
    adj.setdefault(b, []).append(a)

order, seen, stack = [], {ROOT_JOINT}, [ROOT_JOINT]
while stack:
    p = stack.pop()
    for c in adj.get(p, []):
        if c not in seen:
            seen.add(c)
            order.append((p, c))
            stack.append(c)
if len(order) != len(E):
    raise RuntimeError("graph is not one connected tree: %d of %d edges reached"
                       % (len(order), len(E)))

ad = bpy.data.armatures.new("DragonRig")
arm = bpy.data.objects.new("DragonRig", ad)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")

eb_of = {}                                   # child joint -> its edit bone
rb = ad.edit_bones.new("root")
rb.head = J[ROOT_JOINT]
rb.tail = J[ROOT_JOINT] + Vector((0, -0.40, 0))
used = set()
for p, c in order:
    nm = NAME[c] or "j%03d" % c
    while nm in used:
        nm += "x"
    used.add(nm)
    b = ad.edit_bones.new(nm)
    b.head, b.tail = J[p], J[c]
    b.parent = eb_of.get(p, rb)
    # Only chain-connect where the child really continues the parent, so a
    # limb branching off the spine can be posed without dragging the spine.
    b.use_connect = p in eb_of and len(adj.get(p, [])) == 2
    eb_of[c] = b

bpy.ops.armature.select_all(action="SELECT")
bpy.ops.armature.calculate_roll(type="GLOBAL_POS_Z")
bpy.ops.object.mode_set(mode="OBJECT")
BONES = [b.name for b in ad.bones]
print("RIG %d bones" % len(BONES))


# ── 3. WEIGHTS ──────────────────────────────────────────────────────────────
# Distance from each vertex to each bone SEGMENT (not to its head -- a long
# bone's midpoint would otherwise lose to a short neighbour's endpoint).
V = np.empty(len(drg.data.vertices) * 3, dtype=np.float64)
drg.data.vertices.foreach_get("co", V)
V = V.reshape(-1, 3)
Hd = np.array([list(ad.bones[n].head_local) for n in BONES])
Tl = np.array([list(ad.bones[n].tail_local) for n in BONES])

D = np.empty((len(BONES), len(V)))
for i in range(len(BONES)):
    ab = Tl[i] - Hd[i]
    L2 = float(ab @ ab) or 1e-9
    t = np.clip(((V - Hd[i]) @ ab) / L2, 0.0, 1.0)[:, None]
    D[i] = np.linalg.norm(V - (Hd[i] + t * ab), axis=1)

near = np.argsort(D, axis=0)[:NEAREST]                  # (NEAREST, nverts)
dmin = D[near[0], np.arange(len(V))]
W = np.zeros_like(near, dtype=np.float64)
for k in range(NEAREST):
    d = D[near[k], np.arange(len(V))]
    W[k] = np.where(d <= dmin * REACH, 1.0 / np.power(d + 1e-4, FALLOFF), 0.0)
W /= W.sum(axis=0, keepdims=True)

# Bucket by quantised weight: one add() per (bone, bucket) instead of one per
# (bone, vertex). 30k verts x 4 bones is 120k calls the slow way.
groups = [drg.vertex_groups.new(name=n) for n in BONES]
buckets = {}
for k in range(NEAREST):
    for vi, (bi, w) in enumerate(zip(near[k], W[k])):
        if w > 0.004:
            buckets.setdefault((int(bi), int(round(w * 200))), []).append(vi)
for (bi, q), idxs in buckets.items():
    groups[bi].add(idxs, q / 200.0, "ADD")
print("WEIGHTS %d vertex-group writes (%d naive)" % (len(buckets), len(V) * NEAREST))

drg.parent = arm
drg.matrix_parent_inverse = arm.matrix_world.inverted()
md = drg.modifiers.new("Armature", "ARMATURE")
md.object = arm

# ── 4. DOES EVERY BONE ACTUALLY OWN SOME FLESH? ─────────────────────────────
# Not a gate -- a reading. A bone with no vertices is a bone whose motion will
# be invisible, and on the hero that went unnoticed for hours.
orphan = [BONES[i] for i in range(len(BONES))
          if not np.any((near == i) & (W > 0.004))]
print("BONES_WITH_NO_FLESH %d%s" % (len(orphan), (": " + ", ".join(orphan[:12])) if orphan else ""))
print("RIG_READY")
