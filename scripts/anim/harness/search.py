"""SEARCH — solve the free parameters instead of typing them.

⚠️ A GATE SAYS A POSE IS WRONG. A SWEEP SAYS WHICH VALUE IS RIGHT.

The single most useful thing learned building the pickaxe swing, and it was
learned the long way. Hours went into adjusting numbers by hand and into
starting a pose VALIDATOR -- and Luke stopped the validator, correctly. The
same measurement is worth ten times more inside a search than inside an
assertion, because the assertion hands the problem back and the search hands
back the answer.

Everything that finally worked on that swing was a sweep, not a check:

    the shaft's roll about its own axis   wrists 83 -> 52, overspun by 50 deg
    the elbow pole angle, per frame        wrist 123 -> 47
    each finger's curl vs shaft radius     instead of one global amount
    the hip drop, bisected                 so the point reaches the floor

⚠️ AND TURN HIS WORDS INTO A SWEEP. Every time Luke described a defect
physically -- "it looks like you've overspun the pickaxe and it's causing his
hands to twist" -- he was naming a PARAMETER. Sweeping it settled in ninety
seconds what an hour of adjusting had not. A physical description is a
variable to search, immediately.

Pure Python on purpose: no bpy, so the bottom of this file is a self-test that
runs under any interpreter.

    python scripts/anim/harness/search.py
"""

import math


# ── READINGS, NOT VERDICTS ────────────────────────────────────────────────
# "Too far down" was my verdict on the dragon's wingtips three times running
# and it never once said how far; a probe printed -0.79 and the fix took one
# attempt. So every search here RETURNS ITS WHOLE TABLE and prints it on
# request. A single winning number with no neighbours is unfalsifiable -- you
# cannot see whether the minimum is a basin or a spike on noise.

class Result(object):
    __slots__ = ("best", "cost", "table", "name")

    def __init__(self, name, best, cost, table):
        self.name, self.best, self.cost, self.table = name, best, cost, table

    def __repr__(self):
        return "<%s best=%s cost=%.4f over %d samples>" % (
            self.name, _fmt(self.best), self.cost, len(self.table))

    def report(self, top=8, out=print):
        out("  SWEEP %s -> %s   (cost %.4f)" % (self.name, _fmt(self.best), self.cost))
        rows = sorted(self.table, key=lambda r: r[1])[:top]
        for v, c in rows:
            out("     %-22s %10.4f%s" % (_fmt(v), c, "   <-- chosen" if v == self.best else ""))
        worst = max(self.table, key=lambda r: r[1])
        out("     %-22s %10.4f   (worst, for contrast)" % (_fmt(worst[0]), worst[1]))
        # ⚠️ A FLAT TABLE MEANS THE PARAMETER DOES NOTHING, and a sweep that
        # reports a confident winner off a flat table is how a cosmetic knob
        # gets tuned for an hour. Say so rather than letting it pass.
        span = worst[1] - self.cost
        if span < 1e-9 or span < abs(self.cost) * 1e-6:
            out("     ⚠️ FLAT: every sample scored the same. This parameter is")
            out("        not connected to this cost -- do not tune it here.")

    @property
    def span(self):
        """How much the cost moved across the sweep. Near zero = no effect."""
        if not self.table:
            return 0.0
        return max(c for _v, c in self.table) - min(c for _v, c in self.table)


def _fmt(v):
    if isinstance(v, float):
        return "%.3f" % v
    if isinstance(v, tuple):
        return "(" + ", ".join(_fmt(x) for x in v) + ")"
    return str(v)


def linspace(lo, hi, n):
    if n < 2:
        return [lo]
    step = (hi - lo) / float(n - 1)
    return [lo + step * i for i in range(n)]


def sweep(name, values, cost, report=False, out=print):
    """Score every value, keep the cheapest, keep the whole table.

    `cost` may return None to mean "not evaluable here" -- a candidate that
    could not be measured is DISCARDED, never scored zero. Scoring an
    unmeasurable sample as zero makes it win.
    """
    table = []
    for v in values:
        c = cost(v)
        if c is None or (isinstance(c, float) and math.isnan(c)):
            continue
        table.append((v, float(c)))
    if not table:
        raise ValueError("sweep %r: no candidate was evaluable" % name)
    best, bc = min(table, key=lambda r: r[1])
    r = Result(name, best, bc, table)
    if report:
        r.report(out=out)
    return r


def refine(name, lo, hi, cost, coarse=12, fine=12, rounds=2, report=False, out=print):
    """Coarse sweep, then re-sweep the winning bracket. Same total samples buy
    far more resolution than one flat pass.

    ⚠️ 48 STEPS, NOT 24, WAS A REAL BUG. The elbow-pole sweep had three terms
    competing and a 15-degree step walked straight past the minimum between
    samples. If a cost has more than one term, resolution is not a nicety.
    """
    last = None
    for k in range(rounds):
        n = coarse if k == 0 else fine
        last = sweep("%s[%d]" % (name, k), linspace(lo, hi, n), cost,
                     report=report and k == rounds - 1, out=out)
        step = (hi - lo) / float(n - 1) if n > 1 else 0.0
        lo, hi = last.best - step, last.best + step
    return last


def bisect(name, f, lo, hi, iters=28, report=False, out=print):
    """Find x in [lo, hi] with f(x) == 0, assuming f(lo) <= 0 <= f(hi).

    This is the hip drop: "how deep does he have to get for the point to touch
    the floor." ONE equation and ONE unknown -- which is only possible because
    the pose was authored in a frame where the other three constraints cannot
    be violated. See bodyframe.py.
    """
    flo, fhi = f(lo), f(hi)
    if (flo > 0) == (fhi > 0):
        # ⚠️ NOT AN ANSWER. Returning a midpoint here is how a solve silently
        # becomes a guess; the caller gets a number and no idea it is fiction.
        raise ValueError("bisect %r: f does not change sign on [%s, %s] "
                         "(f(lo)=%.4f f(hi)=%.4f)" % (name, _fmt(lo), _fmt(hi), flo, fhi))
    for _ in range(iters):
        mid = (lo + hi) * 0.5
        if (f(mid) > 0) == (fhi > 0):
            hi = mid
        else:
            lo = mid
    x = (lo + hi) * 0.5
    if report:
        out("  BISECT %s -> %s   (residual %.6f)" % (name, _fmt(x), f(x)))
    return x


# ── THE SWEEP NEEDS A MEMORY ──────────────────────────────────────────────
# ⚠️ THE BUG THIS EXISTS FOR, IN FULL. Every frame of Mine picked its own
# minimum-cost elbow pole with no reference to the frame before it, so two
# adjacent frames could land on OPPOSITE SIDES of the arm and the shoulder
# would snap through a half turn between them. That is exactly what f12 was:
# arms wrapped across the chest, hands crossing the face, 179 degrees of
# upperarm twist, in the middle of a lift whose neighbours were both clean.
#
# And the instrument could not see it, which is the worse half. I reported
# "shoulder fixed, 165 -> 24" having measured with something blind to the
# worst frame in the clip.
#
# A per-frame optimum is not a trajectory. Continuity is part of the cost.

class Tracked(object):
    """A sweep with a memory of what it chose last frame.

    `weight` is in cost-units per unit of parameter distance. Set it from the
    cost scale, not from taste: a jump that costs less than `weight * jump`
    is one the solver will refuse to take.
    """

    def __init__(self, name, weight, dist=None):
        self.name = name
        self.weight = float(weight)
        self.dist = dist or (lambda a, b: abs(a - b))
        self.last = None
        self.history = []

    def pick(self, values, cost, report=False, out=print):
        base = {}
        for v in values:
            c = cost(v)
            if c is None or (isinstance(c, float) and math.isnan(c)):
                continue
            base[v] = float(c)
        if not base:
            raise ValueError("Tracked %r: no candidate was evaluable" % self.name)
        if self.last is None:
            table = [(v, c) for v, c in base.items()]
        else:
            table = [(v, c + self.weight * self.dist(v, self.last))
                     for v, c in base.items()]
        best, bc = min(table, key=lambda r: r[1])
        r = Result(self.name, best, bc, table)
        if report:
            r.report(out=out)
            if self.last is not None:
                raw = base[best]
                cheapest_raw = min(base.values())
                if raw > cheapest_raw + 1e-9:
                    out("     (continuity held it at %s; the raw minimum was "
                        "%.4f, %.4f cheaper)" % (_fmt(best), cheapest_raw, raw - cheapest_raw))
        self.history.append(best)
        self.last = best
        return r

    def jumps(self):
        """The biggest step the chosen trajectory ever takes. Read it -- a
        trajectory that is smooth everywhere except one frame is the f12
        failure, and the clip-wide worst-case number cannot see it."""
        return [self.dist(a, b) for a, b in zip(self.history, self.history[1:])]


# ── A METRIC YOU HAVE NOT VALIDATED IS NOT EVIDENCE ───────────────────────
# ⚠️ IT IS A CONFIDENT WAY TO BE WRONG, and it has cost more time than any
# bug in this pipeline. The roll call:
#
#   A hand-in-torso check that modelled the torso as a cylinder of ONE global
#   radius (the shoulders), so a hand at belly height read as 0.2 "inside".
#   Two rounds of animation were then tuned against that number and the
#   wrist got WORSE.
#
#   A later version of the same check read the normal of an OPEN BOUNDARY and
#   called a hand 0.085 deep in the chest when it was 0.46 away, overhead and
#   to the side. Frames 13-20 were re-posed to satisfy it, at a cost of 4
#   degrees of wrist, and then reverted.
#
#   Ten assertions on a walk cycle, all green, all measuring the SKELETON --
#   while the BODY deformed wrongly because the rig sat 0.8m below the mesh.
#   That green was used to argue Luke out of what was on his screen.
#
# The fix is not care. It is DISCRIMINATION, run before the metric is
# believed once: the probe must pass every case known to look right and fail
# every case known to look wrong. A control that is correct BY CONSTRUCTION
# -- the grip that cannot be wrong because it is parented -- exposed a broken
# probe in a single run, after twelve iterations of trusting it.

def discriminates(name, probe, good, bad, out=print):
    """Does `probe` separate known-good cases from known-bad ones?

    good / bad are lists of (label, case). Returns True only if EVERY good
    case scores below EVERY bad one, and prints the margin either way.
    """
    gs = [(lab, float(probe(c))) for lab, c in good]
    bs = [(lab, float(probe(c))) for lab, c in bad]
    if not gs or not bs:
        raise ValueError("discriminates %r: needs at least one good and one "
                         "bad case. A probe with no control is not validated, "
                         "it is just a number." % name)
    worst_good = max(gs, key=lambda r: r[1])
    best_bad = min(bs, key=lambda r: r[1])
    ok = worst_good[1] < best_bad[1]
    out("  PROBE %s: %s" % (name, "DISCRIMINATES" if ok else "DOES NOT DISCRIMINATE"))
    for lab, v in sorted(gs, key=lambda r: r[1]):
        out("     good  %-24s %10.4f" % (lab, v))
    for lab, v in sorted(bs, key=lambda r: r[1]):
        out("     bad   %-24s %10.4f" % (lab, v))
    if ok:
        out("     margin %.4f — any threshold in (%.4f, %.4f) separates them"
            % (best_bad[1] - worst_good[1], worst_good[1], best_bad[1]))
    else:
        out("     ⚠️ %r (good) scores %.4f, at or above %r (bad) at %.4f."
            % (worst_good[0], worst_good[1], best_bad[0], best_bad[1]))
        out("        DO NOT TUNE ANYTHING AGAINST THIS PROBE. Fix the probe.")
    return ok


def threshold_between(name, probe, good, bad):
    """The honest threshold: above every good case, below every bad one.

    ⚠️ NEVER A TEXTBOOK NUMBER. _wrist.py said "a wrist does about 70" and
    passed a clip at 69 that visibly tears, while a clean clip runs 57-60.
    Linear blend skinning shears long before a joint reaches its anatomical
    limit, so the only honest threshold is calibrated from assets that LOOK
    right. Raises if the two populations overlap, because then no threshold
    exists and picking one is pretending.
    """
    g = max(float(probe(c)) for _l, c in good)
    b = min(float(probe(c)) for _l, c in bad)
    if g >= b:
        raise ValueError("threshold_between %r: good reaches %.4f but bad "
                         "starts at %.4f — they overlap, so no threshold "
                         "separates them." % (name, g, b))
    return g + (b - g) * 0.5


# ═════════════════════════════════════════════════════════════════════════
# SELF-TEST — the module validates its own claims. python search.py
# ═════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    fails = []

    def check(label, cond):
        print("  %-54s %s" % (label, "ok" if cond else "FAIL"))
        if not cond:
            fails.append(label)

    print("search.py self-test")
    print("-" * 70)

    r = sweep("parabola", linspace(-5, 5, 101), lambda x: (x - 1.3) ** 2)
    check("sweep finds the minimum", abs(r.best - 1.3) < 0.06)

    # ⚠️ THE CLAIM IS "SAME BUDGET, BETTER RESOLUTION", so that is what gets
    # asserted -- and it took two wrong assertions to get there, both of the
    # kind this module exists to prevent:
    #   1. demanding 0.005 of a search whose final grid spacing is 0.04. A
    #      tolerance tighter than the instrument is a textbook threshold.
    #   2. comparing on ONE target. The flat grid has a point at 1.25, so on
    #      target 1.3 it got lucky and "won". A single sample measures luck.
    # Averaged over targets spread across the interval, it measures the thing.
    targets = [1.3, -2.77, 0.04, 3.91, -4.4, 2.5]
    flat_err = sum(abs(sweep("f", linspace(-5, 5, 33),
                             lambda x, t=t: (x - t) ** 2).best - t)
                   for t in targets) / len(targets)
    fine_err = sum(abs(refine("r", -5, 5, lambda x, t=t: (x - t) ** 2,
                              coarse=11, fine=11, rounds=3).best - t)
                   for t in targets) / len(targets)
    check("refine beats a flat sweep of the same 33 samples",
          fine_err < flat_err)

    r = sweep("flat", linspace(0, 1, 9), lambda x: 4.0)
    check("a flat table reports zero span", r.span == 0.0)

    seen = []
    r = sweep("gappy", linspace(0, 4, 5),
              lambda x: None if x < 2 else -x)
    check("unevaluable candidates are discarded, not scored 0", r.best == 4.0)

    x = bisect("root", lambda t: t * t * t - 2.0, 0.0, 4.0)
    check("bisect solves a root", abs(x - 2.0 ** (1 / 3.0)) < 1e-5)

    try:
        bisect("nosign", lambda t: t * t + 1.0, -1.0, 1.0)
        check("bisect refuses a bracket with no sign change", False)
    except ValueError:
        check("bisect refuses a bracket with no sign change", True)

    # ── THE f12 CASE, REPRODUCED ──────────────────────────────────────────
    # A cost with two nearly-equal basins, 180 apart, whose depths cross over
    # mid-clip. Without memory the choice flips sides; with memory it does
    # not. This is the actual shape of the arm flip.
    def cost_at(frame):
        def c(th):
            a = 1.0 + 0.30 * (frame - 6) / 6.0        # basin near 0
            b = 1.0 - 0.30 * (frame - 6) / 6.0        # basin near 180
            return min(a + abs(th) / 180.0, b + abs(th - 180.0) / 180.0)
        return c

    naive = [sweep("f%d" % f, linspace(0, 350, 36), cost_at(f)).best
             for f in range(1, 13)]
    flips = sum(1 for a, b in zip(naive, naive[1:]) if abs(a - b) > 90)
    check("a memoryless sweep flips sides mid-clip (reproduces f12)", flips >= 1)

    tr = Tracked("pole", weight=0.01)
    for f in range(1, 13):
        tr.pick(linspace(0, 350, 36), cost_at(f))
    check("Tracked holds one side across the crossover",
          max(tr.jumps() or [0]) <= 90)

    # ── DISCRIMINATION ────────────────────────────────────────────────────
    quiet = lambda *_a, **_k: None
    good = [("idle", 57.0), ("walk", 60.0)]
    bad = [("mine-v1", 123.0), ("mine-v2", 83.0)]
    check("a real probe discriminates",
          discriminates("wrist", lambda c: c, good, bad, out=quiet))
    t = threshold_between("wrist", lambda c: c, good, bad)
    check("the threshold sits between the populations", 60.0 < t < 83.0)

    # The cylinder-radius torso probe: reads a belly-height hand as deeply
    # inside, so it scores a GOOD case worse than a bad one.
    broken = lambda c: 0.48 - c          # c = distance from the spine axis
    check("a broken probe is caught, not believed",
          not discriminates("torso-cylinder", broken,
                            [("hand at belly", 0.30)],
                            [("hand in chest", 0.42)], out=quiet))
    try:
        threshold_between("torso-cylinder", broken,
                          [("hand at belly", 0.30)], [("hand in chest", 0.42)])
        check("no threshold is handed out for an overlapping probe", False)
    except ValueError:
        check("no threshold is handed out for an overlapping probe", True)

    print("-" * 70)
    print("SELF-TEST %s" % ("PASSED" if not fails else
                            "FAILED: " + ", ".join(fails)))
    raise SystemExit(1 if fails else 0)
