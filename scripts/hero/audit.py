import bpy, math, os, sys
from mathutils import Vector

# ═══════════════════════════════════════════════════════════════════════════
# THE AUDIT — what "professional" means, as numbers, measured off the mesh
# that ships.
#
# ⚠️ THIS EXISTS BECAUSE I CANNOT JUDGE 3D ART BY EYE AND HAVE PROVED IT
# REPEATEDLY. Three rounds of this build went on a nose that "looked like a
# beak" and was an ordinary 26 mm; printing the front-most point at each
# landmark found the real defect -- the brow sitting 15 mm behind the lips --
# in one pass. A render tells me something is wrong. It does not tell me
# WHICH thing, and my guess about which has been wrong more often than right.
#
# So the figure is checked against the canon a life-drawing course teaches,
# which is not a matter of taste: eight and a half heads tall, shoulders
# just under three head-widths, arm span equal to height, wrist at the
# crotch, knee halfway from hip to floor, eyes on the head's midline, the
# face in equal thirds. Those are numbers, they are published, and a figure
# that misses them reads as wrong to everybody without anybody being able to
# say why.
#
# ⚠️ AND EVERY CHECK MUST BE SHOWN TO DISCRIMINATE BEFORE IT IS TRUSTED.
# A metric that passes whatever you feed it is worse than no metric, because
# it certifies. `--selftest` deliberately breaks the model in a specific way
# and asserts that the check which owns that defect -- and ideally only it --
# goes red. A check that cannot fail is deleted.
#
#     blender -b -P scripts/hero/audit.py
#     blender -b -P scripts/hero/audit.py -- --selftest
# ═══════════════════════════════════════════════════════════════════════════

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import cage, body as body_mod, head as head_mod, hand as hand_mod
import foot as foot_mod, rig as rig_mod, face as face_mod
for m in (cage, head_mod, hand_mod, foot_mod, face_mod, body_mod, rig_mod):
    importlib.reload(m)


class Check:
    __slots__ = ("name", "got", "want", "tol", "unit", "note")

    def __init__(self, name, got, want, tol, unit="", note=""):
        self.name, self.got, self.want, self.tol = name, got, want, tol
        self.unit, self.note = unit, note

    @property
    def ok(self):
        return self.got is not None and abs(self.got - self.want) <= self.tol

    @property
    def off(self):
        """How far outside tolerance, in tolerances. 0 when passing."""
        if self.got is None:
            return 99.0
        return max(0.0, (abs(self.got - self.want) - self.tol) / max(self.tol, 1e-9))


def measure(ob):
    """Every landmark, from the module data that built the mesh plus the
    evaluated surface. Reading the modules rather than guessing at the
    geometry is the same contract the rig has: one source, several readers."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = ob.evaluated_get(dg).to_mesh()
    V = [v.co for v in me.vertices]

    H = head_mod.HEAD
    hz = {n: H[i][1] for i, (n, *_r) in enumerate(H)}
    tz = {t[0]: t[1] for t in body_mod.TORSO}
    L = body_mod.leg_path("l")
    A = body_mod.arm_path("l")
    J = rig_mod.joints(body_mod)

    m = {}
    # ⚠️ HEIGHT IS CROWN TO SOLE, NOT CROWN TO ZERO, and the difference is
    # not pedantry -- it is what makes the check able to SEE a defect. The
    # discrimination run shortened his legs by a fifth and "heads tall" did
    # not move, because the crown had not moved and the floor was assumed.
    # A metric that cannot notice a figure standing on stumps is not
    # measuring proportion, it is measuring one number I happened to set.
    m["floor"] = min(v.z for v in V)
    m["height"] = max(v.z for v in V) - m["floor"]
    m["chin_z"] = hz["chin"]
    m["crown_z"] = m["height"]
    m["head_h"] = m["crown_z"] - m["chin_z"]
    # ⚠️ HEAD BREADTH IS MEASURED WHERE THERE ARE NO EARS. Taking the widest
    # point of everything above the chin measures the ear tips, which made
    # the head 34 mm wider than it is and quietly flattered every ratio
    # built on it.
    # Ears are protrusions at the BACK half of the skull, so the front half
    # gives a breadth that is ear-free without needing to know where they
    # were put. Measured on the evaluated surface, not the cage, because the
    # cage is 5% wider than anything that renders.
    _cy = H[head_mod.at("eye")][4]
    m["head_w"] = 2.0 * max(abs(v.x) for v in V
                            if hz["jaw"] < v.z < hz["brow"] and v.y < _cy)
    # ⚠️ AND SHOULDER WIDTH IS NOT THE WIDEST THING AT SHOULDER HEIGHT. In
    # an A-pose the arms have already swung out by then, so 2*max|x| over
    # that band measured the upper ARMS: it read 0.619 m against a real
    # biacromial 0.496, and reported the shoulders half a head wider than
    # they are. Read the ring that IS the shoulder.
    #
    # ⚠️ AND READ IT WITH ITS MUSCLE ON. Taking 2*rx ignores the bumps that
    # every ring on this body is shaped by, so the shoulders measured 496 mm
    # when the surface is 531 -- and 3.3 head-widths PASSED while the real
    # figure was at 3.5 and reading blocky from the front. A width taken off
    # a radius is the width of a cylinder nobody built.
    def ring_width(name):
        ti = [t[0] for t in body_mod.TORSO].index(name)
        _n, _z, rx, _ry, _cy, b = body_mod.TORSO[ti]
        mult = cage.shape(body_mod.N, b)
        return 2.0 * max(abs(rx * mult[i] * math.cos(2 * math.pi * i / body_mod.N))
                         for i in range(body_mod.N))

    m["shoulder_w"] = ring_width("shoulder")
    m["waist_w"] = ring_width("waist")
    m["hip_w"] = ring_width("hips")
    # ⚠️ SPAN IS ALONG THE ARM, NOT ACROSS THE RENDER. He is modelled in an
    # A-pose, so the x extent of the figure is nowhere near his reach -- it
    # read 0.794 of his height and sent me looking for arms that were 20%
    # too short, when what was short was the measurement. Arm span is a
    # length along the chain: both shoulders apart, plus two arms.
    sh = Vector(A[0][0])
    tip = max((Vector(c) for segs in body_mod.hand_plan("l")["digits"].values()
               for c, _r in segs), key=lambda v: (v - sh).length)
    m["arm_len"] = (tip - sh).length
    m["span"] = 2.0 * (body_mod.SHOULDER_X + m["arm_len"])
    m["neck_w"] = 2.0 * body_mod.TORSO[[t[0] for t in body_mod.TORSO].index("neck")][2]

    # ⚠️ THE CANON IS FOR ARMS HANGING STRAIGHT DOWN AND HE IS IN AN A-POSE.
    # "Wrist at the crotch" and "elbow at the waist" are measured on a
    # standing figure with the arms vertical; read straight off a 40-degree
    # A-pose they put the wrist 139 mm high and reported the arms 8% short
    # when they are the right length. What the canon is really about is the
    # distance ALONG the arm, so hang it: shoulder height minus the length
    # from the shoulder to that joint.
    sh_z = A[0][0][2]
    m["wrist_z"] = sh_z - (Vector(A[body_mod.ARM_AT["wrist"]][0]) - Vector(A[0][0])).length
    m["elbow_z"] = sh_z - (Vector(A[body_mod.ARM_AT["elbow"]][0]) - Vector(A[0][0])).length
    m["crotch_z"] = tz["crotch"]
    m["waist_z"] = tz["waist"]
    m["hip_z"] = J["hip_l"].z
    m["knee_z"] = J["knee_l"].z
    m["hand_len"] = (Vector(A[body_mod.ARM_AT["end"]][0])
                     - Vector(A[body_mod.ARM_AT["wrist"]][0])).length

    sole = [v for v in V if v.z < 0.12 and v.x > 0.0]
    m["foot_len"] = (max(v.y for v in sole) - min(v.y for v in sole)) if sole else None

    m["eye_z"] = hz["eye"]
    m["brow_z"] = hz["brow"]
    m["nose_z"] = hz["nose_base"]
    # How far a joint's landmark stands proud of the limb either side of it.
    def proud(path, name, at_map, frac):
        i = at_map[name]
        k = int(round(frac * body_mod.NA)) % body_mod.NA

        def front(j):
            r = path[j][1]
            ru = r[0] if isinstance(r, (tuple, list)) else r
            b = path[j][2] if len(path[j]) > 2 else None
            return ru * cage.shape(body_mod.NA, b)[k]
        return front(i) - max(front(i - 1), front(i + 1))

    m["patella"] = proud(L, "knee", body_mod.LEG_AT, 0.0)
    m["olecranon"] = proud(A, "elbow", body_mod.ARM_AT, 0.5)
    # The ankle bone, measured the same way: a local widening between the
    # shin above it and the foot below.
    # ⚠️ MEASURED ON ITS OWN RING, NOT THE ONE THAT BRIDGES. Pointed at
    # "ankle" this compared the joint against leg_path's HEEL entry -- which
    # has not been meshed since the foot became its own cage; the leg stops
    # at the ankle and everything past it is reference for the rig. It
    # reported -0.8 mm against a bone that was there.
    m["malleolus"] = proud(L, "malleolus", body_mod.LEG_AT, 0.25)
    # ⚠️ EAR PROJECTION, MEASURED THE SAME WAY HEAD BREADTH IS. The ear is
    # the only thing sticking out at its own height, so the skull's width
    # on the FRONT half of that z band is an ear-free reference and the
    # difference is how far the ear stands off. Guessing it from the
    # construction number is wrong twice over: the direction is angled
    # back, and subdivision pulls a ridge with ten verts inward.
    ez0, ez1 = hz["nose_base"] - 0.012, hz["lid_low"] + 0.012
    band = [v for v in V if ez0 < v.z < ez1]
    _ecy = H[head_mod.at("cheek")][4]
    if band:
        m["ear_proj"] = (max(abs(v.x) for v in band)
                         - max(abs(v.x) for v in band if v.y < _ecy))
        ear = [v for v in band if abs(v.x) > max(abs(w.x) for w in band) - 0.012]
        m["ear_h"] = max(v.z for v in ear) - min(v.z for v in ear)
    else:
        m["ear_proj"] = m["ear_h"] = None
    # ⚠️ HOW FAR THE FACE FALLS AWAY UNDER THE CHIN. Without it the lower
    # face is a wedge into the neck -- which is what a jowl is, and what he
    # had. Measured on the evaluated surface at the midline, chin against
    # 12 mm below it.
    def front_at(z, tol=0.004):
        ys = [v.y for v in V if abs(v.z - z) < tol and abs(v.x) < 0.007]
        return min(ys) if ys else None
    _c, _u = front_at(hz["chin"]), front_at(hz["chin"] - 0.012)
    m["chin_undercut"] = (_u - _c) if (_c is not None and _u is not None) else None
    # ⚠️ NOSE WIDTH, MEASURED ON THE FRONT-MOST SLICE AT THE NOSTRIL LINE.
    # The wings of a nose line up with the inner corners of the eyes -- it
    # is about one eye wide, a fifth of head breadth. Taking the whole z
    # band would measure the cheeks, so only the verts within 8 mm of the
    # front-most point at that height count, which is the nose and nothing
    # else.
    # ⚠️ AND IT IS NOT "NEAR THE FRONT-MOST POINT". That measured 19 mm
    # against a real 39, because the front-most point is the nose's TIP and
    # its wings sit 20 mm further back -- the filter excluded the very thing
    # being measured. What defines the width is where the nose stops
    # standing proud of the CHEEK beside it, so the cheek is the datum.
    # ⚠️ AND "PROUD BY 3 mm" IS A THRESHOLD I WOULD BE PICKING TO GET AN
    # ANSWER. It counted the gentle tail of the bump and read 68 mm; a
    # larger threshold would have read whatever I chose. Full width at half
    # maximum is the honest version -- how wide the nose is where it stands
    # out HALF as far as it does at its most -- and it has no free knob.
    nb = [v for v in V if abs(v.z - hz["nose_base"]) < 0.004]
    side = [v.y for v in nb if abs(v.x) > 0.040]
    if nb and side:
        datum = min(side)
        peak = datum - min(v.y for v in nb)
        m["nose_w"] = 2.0 * max(abs(v.x) for v in nb
                                if (datum - v.y) >= 0.5 * peak)
    else:
        m["nose_w"] = None
    m["mouth_w"] = 2.0 * face_mod.mouth.__defaults__[0]
    m["eye_w"] = 2.0 * face_mod.eye_socket.__defaults__[0]
    ri = head_mod.at("eye")
    _n, _z, rx, ry, cy, _b = H[ri]
    m["eye_x"] = abs(rx * math.cos(2 * math.pi * head_mod.F_EYE_L))

    # mesh hygiene, on the CAGE -- the thing that is authored and edited
    cm = ob.data
    # ⚠️ THIS WAS QUADRATIC AND IT COST FIVE MINUTES A RUN. Counting an
    # edge's faces by scanning every polygon for every edge is 3300 x 3300
    # = 11 million membership tests, which made the audit take 34 seconds
    # and the self-test -- which builds the figure eight times -- take 4m57.
    # Nothing was slow about Blender; Blender starts in 0.38s. Tally the
    # edges once instead.
    seen = {}
    for p in cm.polygons:
        for k in p.edge_keys:
            seen[k] = seen.get(k, 0) + 1
    m["boundary"] = sum(1 for v in seen.values() if v == 1)
    counts = {}
    for p in cm.polygons:
        counts[len(p.vertices)] = counts.get(len(p.vertices), 0) + 1
    m["faces"] = len(cm.polygons)
    m["tris"] = counts.get(3, 0)
    m["quads"] = counts.get(4, 0)
    m["ngons"] = sum(v for k, v in counts.items() if k > 4)
    areas = sorted(p.area for p in cm.polygons)
    med = areas[len(areas) // 2]
    m["area_spread"] = areas[-1] / med if med > 0 else None
    # ⚠️ THE SHORTEST EDGE CATCHES A WHOLE CLASS OF JOIN BUG. The hand's
    # first ring sat at exactly the arm's last one, so bridging 12 verts to
    # 26 across zero distance built a collar of collapsed faces -- and the
    # wrist rendered as a deep crushed pinch for as long as the hand has
    # existed. Nothing saw it: the mesh was manifold, closed, correctly
    # proportioned, and every check passed.
    #
    # Smallest AREA was tried first and is the wrong statistic: a nostril
    # quad is legitimately a hundredth of the median and the check has to
    # tolerate it, which leaves it too slack to see a collapse. A collapsed
    # bridge has near-zero EDGES, and nothing on this figure legitimately
    # does -- the finest real feature is a couple of millimetres.
    #
    # ⚠️ AND I FIRST TOLD THIS STORY ABOUT THE WRONG DEFECT. The 0.125 mm
    # edge was the MOUTH's corner, not the wrist -- measuring the figure
    # with the wrist put back on top of the arm leaves the shortest edge
    # completely unchanged. A bridge between two COINCIDENT rings of
    # different counts does not collapse its edges at all: corresponding
    # verts sit at different angles round the same circle, so the cross
    # edges have real length and the FACES have none. Two defects of the
    # same family and they need two different statistics.
    #
    # Scored as a reciprocal, which is not a trick: a floor check needs a
    # wide tolerance, and a wide tolerance makes "tolerances outside" tiny,
    # so a genuine collapse would read as a 0.07 move and the
    # discrimination run would call the check blind. 1/length EXPLODES as
    # an edge collapses. The floor is set from the data rather than from
    # what passes -- real fine geometry on this figure bottoms out at
    # 0.87 mm, a chamfer at the palm's edge, and the mouth corner was
    # 0.125. 0.6 mm separates them.
    m["min_edge"] = min((cm.vertices[e.vertices[0]].co
                         - cm.vertices[e.vertices[1]].co).length
                        for e in cm.edges)
    m["collapse"] = 1.0 / max(m["min_edge"] * 1000.0, 1e-6)
    # ⚠️ AND THIS IS THE ONE THAT SEES A COLLAPSED BRIDGE. Faces with
    # almost no area are what coincident rings produce, and the wrist built
    # a whole collar of them: 13 faces under 2% of the median against 2 in
    # a healthy figure, which is a count that cannot be argued with.
    m["degenerate"] = sum(1 for f in cm.polygons if f.area < 0.02 * med)
    # ⚠️ AND EVERY BRIDGE NOW REPORTS ITSELF AS IT IS BUILT, so the figure
    # can be asked directly how many joins are collapsed rather than having
    # each one photographed and squinted at. A systematic pass over all 26
    # of them -- arms, wrist, hips, ankles, fingers, toes, thumb, ears,
    # eyes, nostrils, mouth -- found exactly the two already fixed and
    # nothing else, which is worth knowing with certainty rather than
    # hoping.
    m["bad_bridges"] = cage.bridge_report()[1]
    m["verts"] = len(cm.vertices)
    return m


def checks(m):
    """The canon. Targets are the published figures a life class teaches;
    tolerances are what a trained eye stops noticing."""
    h, hh, hw = m["height"], m["head_h"], m["head_w"]
    c = [
        # ── PROPORTION ────────────────────────────────────────────────────
        Check("heads tall", h / hh, 8.5, 0.35, "heads",
              "heroic figure; 7.5 is average, 8.5 is the hero canon"),
        # ⚠️ THE HEROIC CANON, NOT THE REALISTIC ONE. 2.7 head-widths is the
        # figure a life class draws; this character is built to the comic
        # proportions the rest of the art is drawn to, which is 2.85-3.25.
        # Scoring him against the wrong canon is not a stricter standard,
        # it is the wrong standard.
        Check("shoulders", m["shoulder_w"] / hw, 3.05, 0.25, "head-widths"),
        # ⚠️ SPAN DOUBLE-COUNTS THE SHOULDERS AND IS THE WRONG CHECK HERE.
        # Arm span equals height on a REAL figure, where the arm is measured
        # from a joint that sits well inside the acromion. Add a heroic
        # shoulder to a correct arm and span comes out at 1.09 of height
        # with nothing wrong -- the broad shoulders are already their own
        # check. Arm length against height does not double-count anything.
        Check("arm length", m["arm_len"] / h, 0.437, 0.018, "of height",
              "shoulder joint to fingertip"),
        # ⚠️ THE V IS THE WHOLE SILHOUETTE OF A HEROIC FIGURE and nothing was
        # watching it. Straight-on was the one view never rendered -- the
        # standard four angles are all three-quarter -- and from the front
        # he read as a slab. Shoulder against waist and shoulder against hip
        # are the two numbers that own that read.
        Check("shoulder : waist", m["shoulder_w"] / m["waist_w"], 1.55, 0.20, ""),
        Check("shoulder : hip", m["shoulder_w"] / m["hip_w"], 1.45, 0.15, ""),
        Check("wrist at crotch", (m["wrist_z"] - m["crotch_z"]) / h, 0.0, 0.025, "of height"),
        Check("elbow at waist", (m["elbow_z"] - m["waist_z"]) / h, 0.0, 0.030, "of height"),
        Check("knee half hip->floor", m["knee_z"] / m["hip_z"], 0.50, 0.055, ""),
        # ⚠️ A JOINT WITH NO LANDMARK IS A DIAMETER, NOT A JOINT, and it is
        # most of why the limbs read as smooth tubes. These measure the
        # patella and the olecranon against the limb EITHER SIDE of them,
        # which is what the eye actually reads -- a bump given as a fraction
        # of its own ring can be large and still sit behind its neighbours,
        # which is exactly what the first attempt did.
        Check("patella proud", m["patella"] * 1000, 9.0, 3.5, "mm"),
        Check("olecranon proud", m["olecranon"] * 1000, 9.0, 3.5, "mm"),
        Check("malleolus proud", m["malleolus"] * 1000, 5.0, 2.5, "mm",
              "the ankle bone; without it the leg tapers into a sock"),
        Check("hand length", m["hand_len"] / h, 0.108, 0.013, "of height"),
        Check("foot length", (m["foot_len"] or 0) / h, 0.152, 0.018, "of height"),
        # ⚠️ 0.52 WAS A NUMBER I INVENTED AND IT FAILED THE MODEL FOR BEING
        # RIGHT. A male neck is about 120 mm across against a 150 mm head
        # breadth. A target that is not from a source is not a standard, and
        # this one was the worst "failure" on the first scorecard.
        Check("neck width", m["neck_w"] / hw, 0.78, 0.10, "head-widths"),
        # ── THE HEAD ──────────────────────────────────────────────────────
        Check("head w/h", hw / hh, 0.70, 0.055, "",
              "a head is taller than it is wide; this was 1.15 once"),
        Check("eyes on midline", (m["crown_z"] - m["eye_z"]) / hh, 0.50, 0.06, "down from crown"),
        Check("eye separation", 2.0 * m["eye_x"] / hw, 0.45, 0.06, "head-widths"),
        # ⚠️ A FACE IS FIVE EYES WIDE. The oldest rule in portrait drawing
        # and the one that catches an eye drawn at whatever size looked
        # right: when the socket got loops of its own the obvious next move
        # was to open it wider, and this says by how much it may not.
        Check("eye width", m["eye_w"] / hw, 0.200, 0.035, "head-widths",
              "a head is five eyes across"),
        # An ear is about as tall as the nose is long -- one third of the
        # face -- and stands roughly 17 mm off the skull.
        Check("ear height", (m["ear_h"] or 0) / hh, 0.265, 0.055, "of head height"),
        Check("ear projection", (m["ear_proj"] or 0) * 1000, 17.0, 5.0, "mm"),
        # The corners of a mouth sit under the pupils -- about a third of
        # the head's breadth. The first lattice came out 58 mm, a letterbox.
        Check("nose width", (m["nose_w"] or 0) / hw, 0.235, 0.040, "head-widths",
              "the wings line up with the inner eye corners"),
        Check("mouth width", m["mouth_w"] / hw, 0.335, 0.045, "head-widths"),
        Check("chin undercut", (m["chin_undercut"] or 0) * 1000, 30.0, 10.0, "mm",
              "how far the face falls back 12 mm under the chin"),
        Check("face thirds", (m["brow_z"] - m["nose_z"]) / max(m["nose_z"] - m["chin_z"], 1e-9),
              1.00, 0.22, "", "brow->nose against nose->chin"),
        # ── MESH HYGIENE ──────────────────────────────────────────────────
        Check("boundary edges", float(m["boundary"]), 0.0, 0.0, "", "holes in the surface"),
        Check("quad fraction", m["quads"] / float(m["faces"]), 1.00, 0.10, "",
              "quad-dominant >=90% is the subdivision standard; the "
              "triangles are resolution steps and pole caps"),
        Check("n-gon fraction", m["ngons"] / float(m["faces"]), 0.0, 0.012, "",
              "every tube has to close; 25 of them are end caps"),
        Check("edge collapse", m["collapse"], 0.5, 1.1, "1/mm",
              "floor 0.6 mm; the mouth's pinched corner read 8.0"),
        Check("collapsed bridges", m["bad_bridges"], 0.0, 0.5, "",
              "a join with no span between mismatched loops, or one that "
              "produced a face with no area"),
        Check("degenerate faces", float(m["degenerate"]), 0.0, 4.0, "",
              "faces under 2% of median area; a bridge between coincident "
              "rings builds a collar of them, as the wrist did"),
        Check("face area spread", m["area_spread"], 1.0, 34.0, "x median",
              "a face far larger than its neighbours subdivides unevenly"),
    ]
    return c


def report(cs, m):
    print("")
    print("  HERO AUDIT   %d verts, %d faces" % (m["verts"], m["faces"]))
    print("  " + "-" * 68)
    bad = 0
    for c in cs:
        mark = "  ok " if c.ok else "  ** "
        if not c.ok:
            bad += 1
        got = "n/a" if c.got is None else "%8.3f" % c.got
        print("%s%-22s %s   want %.3f +/- %.3f %s"
              % (mark, c.name, got, c.want, c.tol, c.unit))
        if not c.ok and c.note:
            print("        %s" % c.note)
    print("  " + "-" * 68)
    print("  %d of %d pass%s" % (len(cs) - bad, len(cs),
                                 "" if bad == 0 else
                                 "   worst: %s" % max(cs, key=lambda x: x.off).name))
    print("")
    return bad


def run():
    bpy.ops.wm.read_homefile(use_empty=True)
    ob = body_mod.build()
    m = measure(ob)
    cs = checks(m)
    return report(cs, m), cs, m


# ── DISCRIMINATION ────────────────────────────────────────────────────────
# ⚠️ EACH BREAK MUST TURN ITS OWN CHECK RED. A scorecard that stays green
# while the model is deliberately ruined is not measuring the model, and
# every hour spent tuning against it is wasted -- which is exactly how a
# shredded fist shipped through six clips with every check passing.
BREAKS = [
    ("head squashed to the old 4-ring ball", "head w/h",
     lambda: _scale_head(0.72)),
    ("head enlarged by a quarter", "heads tall",
     lambda: _scale_head(1.25)),
    ("feet lifted clear of the floor", "heads tall",
     lambda: _lift_feet(0.085)),
    ("feet back to flippers", "foot length",
     lambda: _shrink_feet(0.55)),
    ("eyes set together like a doll", "eye separation",
     lambda: _set_eyes(0.902, 0.598)),
    ("arms given an extra hand's length", "arm length",
     lambda: _stretch_arms(1.12)),
    ("shoulders back to the 531 mm slab", "shoulder : waist",
     lambda: _widen("shoulder", 1.085)),
    ("waist thickened to a tube", "shoulder : waist",
     lambda: _widen("waist", 1.30)),
    ("knee flattened back to a tube", "patella proud",
     lambda: _flatten_joint("leg_path", "knee", 0)),
    ("elbow flattened back to a tube", "olecranon proud",
     lambda: _flatten_joint("arm_path", "elbow", 1)),
    ("ankle flattened back to a tube", "malleolus proud",
     lambda: _flatten_joint("leg_path", "malleolus", 0)),
    ("ears flattened against the skull", "ear projection",
     lambda: _flat_ears()),
    ("mouth widened to a letterbox", "mouth width",
     lambda: _wide_mouth()),
    ("hand pushed back onto the arm's last ring", "collapsed bridges",
     lambda: _collapse_wrist()),
    ("mouth corner pinched to a point", "edge collapse",
     lambda: setattr(face_mod, "LIP_LINE_INSET", 0.999)),
    ("chin merged back into the neck", "chin undercut",
     lambda: _jowl()),
    ("nose wings spread wide", "nose width",
     lambda: _spread_nose()),
]


def _spread_nose():
    """⚠️ THE FIRST VERSION OF THIS BREAK WIDENED THE WINGS AND THE CHECK
    DID NOT MOVE -- correctly. Full width at half maximum is set by the
    bump that makes the PEAK, and the wings never reach half of it, so
    spreading them changes a number the metric does not read. A break has
    to attack what the check actually measures or it proves nothing."""
    i = head_mod.at("nose_base")
    n, z, rx, ry, cy, b = head_mod.HEAD[i]
    head_mod.HEAD[i] = (n, z, rx, ry, cy,
                        [(c, w * 1.85, a) if abs(c - head_mod.T_FRONT) < 1e-6
                         else (c, w, a) for c, w, a in b])


def _jowl():
    """Pull the under-jaw ring forward until the jaw is a wedge again."""
    i = head_mod.at("under_jaw")
    n, z, rx, ry, cy, b = head_mod.HEAD[i]
    head_mod.HEAD[i] = (n, z, rx * 1.18, ry * 1.30, cy - 0.016, b)


def _collapse_wrist():
    """Put the palm's first station back where the arm's last ring is."""
    hand_mod.WRIST_GAP = 0.0


def _wide_mouth():
    orig = face_mod.mouth

    def wide(bm, rings, ri0, cols, n, **kw):
        return orig(bm, rings, ri0, cols, n, w=0.0330)
    face_mod.mouth = wide
    face_mod.mouth.__defaults__ = (0.0330, 0.0122, 0.0058, 0.0016)


def _flat_ears():
    orig = face_mod.ear

    def flat(bm, rings, ri0, cols, n, side, **kw):
        return orig(bm, rings, ri0, cols, n, side, out=0.006, bowl=0.002)
    face_mod.ear = flat


def _flatten_joint(fn_name, ring, which):
    """Strip the joint ring's landmark bump, leaving a smooth taper."""
    orig = getattr(body_mod, fn_name)
    idx = (body_mod.LEG_AT if which == 0 else body_mod.ARM_AT)[ring]

    def flat(side):
        p = list(orig(side))
        e = p[idx]
        p[idx] = (e[0], e[1])
        return p
    setattr(body_mod, fn_name, flat)


def _widen(name, f):
    ti = [t[0] for t in body_mod.TORSO].index(name)
    n, z, rx, ry, cy, b = body_mod.TORSO[ti]
    body_mod.TORSO[ti] = (n, z, rx * f, ry, cy, b)


def _scale_head(f):
    """Grow or squash the head about its own crown."""
    top = head_mod.HEAD[-1][1]
    head_mod.HEAD[:] = [(n, top - (top - z) * f, rx, ry, cy, b)
                        for n, z, rx, ry, cy, b in head_mod.HEAD]


def _lift_feet(dz):
    """⚠️ AND THIS ONE EXISTS BECAUSE OF A LANDMINE THE SELFTEST FOUND.
    foot.py places the sole at an ABSOLUTE z and uses only the x of the
    ankle it is handed, so shortening the legs left the feet standing
    exactly where they were -- the figure would have been cut off at the
    shins with the feet floating below, and "heads tall" did not move,
    because it was measuring crown-to-zero rather than crown-to-sole. Both
    are fixed; this break keeps the floor half of that measurement honest."""
    foot_mod.STATIONS[:] = [(y, hw, z0 + dz, z1 + dz)
                            for y, hw, z0, z1 in foot_mod.STATIONS]


def _stretch_arms(f):
    orig = body_mod.arm_path

    def longer(side):
        p = orig(side)
        o = p[0][0]
        return [((o[0] + (c[0] - o[0]) * f, o[1] + (c[1] - o[1]) * f,
                  o[2] + (c[2] - o[2]) * f),) + tuple(rest) for c, *rest in p]
    body_mod.arm_path = longer


def _shrink_feet(f):
    foot_mod.STATIONS[:] = [(y * f, hw, z0, z1) for y, hw, z0, z1 in foot_mod.STATIONS]
    foot_mod.TOE_LEN = foot_mod.TOE_LEN * f * 0.3


def _set_eyes(l, r):
    head_mod.F_EYE_L, head_mod.F_EYE_R = l, r


def selftest():
    print("\n  DISCRIMINATION -- every break must turn its own check red\n")
    base_bad, base_cs, _m = run()
    base_off = {c.name: c.off for c in base_cs}
    failures = []
    for label, owner, break_it in BREAKS:
        for mod in (cage, head_mod, hand_mod, foot_mod, body_mod, rig_mod):
            importlib.reload(mod)
        break_it()
        bpy.ops.wm.read_homefile(use_empty=True)
        ob = body_mod.build()
        cs = {c.name: c for c in checks(measure(ob))}
        # ⚠️ "IT WENT RED" IS NOT EVIDENCE IF IT WAS ALREADY RED. Two of
        # these checks fail at baseline, so red-after-breaking tells you
        # nothing about whether they can SEE the break. What discriminates
        # is the distance outside tolerance GROWING -- a check that cannot
        # move when the thing it measures is ruined is not measuring it.
        before = base_off.get(owner, 0.0)
        after = cs[owner].off
        fired = (not cs[owner].ok) and after > before + 0.25
        print("  %-40s -> %-22s %s  (%.2f -> %.2f tolerances out)"
              % (label, owner, "SEES IT " if fired else "*** BLIND",
                 before, after))
        if not fired:
            failures.append((label, owner))
    for mod in (cage, head_mod, hand_mod, foot_mod, body_mod, rig_mod):
        importlib.reload(mod)
    print("")
    if failures:
        raise SystemExit("  %d check(s) cannot detect their own defect.\n" % len(failures))
    print("  every check discriminates.\n")
    return base_bad


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "--selftest" in argv:
        selftest()
    else:
        bad, _cs, _m = run()
        print("AUDIT_%s" % ("CLEAN" if bad == 0 else "FAIL %d" % bad))
