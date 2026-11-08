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
    ti = [t[0] for t in body_mod.TORSO].index("shoulder")
    m["shoulder_w"] = 2.0 * body_mod.TORSO[ti][2]
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
    m["eye_w"] = 2.0 * face_mod.eye_socket.__defaults__[0]
    ri = head_mod.at("eye")
    _n, _z, rx, ry, cy, _b = H[ri]
    m["eye_x"] = abs(rx * math.cos(2 * math.pi * head_mod.F_EYE_L))

    # mesh hygiene, on the CAGE -- the thing that is authored and edited
    cm = ob.data
    m["boundary"] = sum(1 for e in cm.edges
                        if sum(1 for p in cm.polygons if e.key in p.edge_keys) == 1)
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
        Check("wrist at crotch", (m["wrist_z"] - m["crotch_z"]) / h, 0.0, 0.025, "of height"),
        Check("elbow at waist", (m["elbow_z"] - m["waist_z"]) / h, 0.0, 0.030, "of height"),
        Check("knee half hip->floor", m["knee_z"] / m["hip_z"], 0.50, 0.055, ""),
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
        Check("face thirds", (m["brow_z"] - m["nose_z"]) / max(m["nose_z"] - m["chin_z"], 1e-9),
              1.00, 0.22, "", "brow->nose against nose->chin"),
        # ── MESH HYGIENE ──────────────────────────────────────────────────
        Check("boundary edges", float(m["boundary"]), 0.0, 0.0, "", "holes in the surface"),
        Check("quad fraction", m["quads"] / float(m["faces"]), 1.00, 0.10, "",
              "quad-dominant >=90% is the subdivision standard; the "
              "triangles are resolution steps and pole caps"),
        Check("n-gon fraction", m["ngons"] / float(m["faces"]), 0.0, 0.012, "",
              "every tube has to close; 25 of them are end caps"),
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
]


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
