// ── WHERE A PRIZE SITS ON THE WHEEL ──────────────────────────────────────────────────────────────────────────
// The disc art and the icon ring are a contract, and it took several wrong numbers to find it. That maths now
// lives here rather than inside SpinWheel.js, because there are two wheels drawn from the same picture — the
// member's daily spin and the counter screen's demo wheel — and a second copy of ICON_R is a second wheel with
// the sprites in the wrong place.
//
// No "server-only" and no imports: both readers are client components.

export const WEDGES = 20;
export const WEDGE_DEG = 360 / WEDGES;
// Icon ring phase: disc dividers sit at 9°, 27°… so wedge CENTERS are at 0°, 18°… (measured from the art).
// Icons were landing on the divider lines at offset 9.
export const WEDGE_OFFSET = 0;

// ── WHERE THE PRIZE SPRITES SIT ──────────────────────────────────────────────────────────────────────────────
// READ THE UNITS BEFORE TOUCHING THIS NUMBER. iconPos writes `left: ${50 + r*sinθ}%`, and a percentage there is
// a percentage of the rotor's WIDTH — so the offset from centre is r% of the width, and the rotor's RADIUS is
// 50 of these units, not 100. Every past attempt at this number got that wrong in one direction or the other:
// 25.5 and 28.5 read as "huddled around the hub" because they are only 0.51 and 0.57 of the radius, and 62 —
// picked while thinking 100 was the rim — put the whole ring of sprites outside the wheel, floating in the page
// around the frame.
//
// Measured off the composited art (disc at 82% inside the frame), in ROTOR RADII:
//     the disc's hub ends at        0.308   →  ICON_R 15.4
//     the frame's inner rim starts  0.812   →  ICON_R 40.6
// An icon is 9.5% of the rotor wide and its <img> is 116% of that, so it reaches ±5.5 ICON_R units:
//     15.4 + 5.5 = 20.9   <=   ICON_R   <=   40.6 - 5.5 = 35.1
// 34 is the top of that band: dead centre of each wedge, out in the FAT end where a pie slice is widest, which
// is where every prize wheel ever built puts them. The size is set from the geometry too — at this radius each
// wedge is 0.215 rotor radii wide at the icon ring, and a 9.5% icon is 0.220 across, so they sit one per slice
// and just touch instead of overlapping their neighbours.
//
// The wolf's muzzle hangs down to 0.583 of the radius, so an icon does pass behind it once per turn. That is
// deliberate and already handled: the WINNING icon lifts above the frame when the wheel stops (see
// .cw-ring.has-won .cw-rotor), so the one sprite that has to be readable never is covered.
export const ICON_R = 34;

/**
 * Position an icon at wedge i of an N-wedge ring (percent coords + radial rotation).
 *
 * ── THE ROUNDING IS NOT COSMETIC ─────────────────────────────────────────────────────────────────────────
 * Math.sin/cos are not required to agree to the last bit between engines, and Node and Chrome do disagree on
 * some of these angles. A wheel rendered on the server and hydrated in the browser therefore produced
 * `left: 22.492917678460892%` against `left: 22.49291767846089%` — different strings for the same position,
 * which React reports as a hydration mismatch and refuses to patch up. Four decimal places of a percentage is
 * ~0.04px on a 1000px wheel: invisible, and identical everywhere.
 *
 * The member's wheel never hit this because it only mounts after its state has loaded, so its icons were
 * never in the server HTML. The counter screen renders them straight out of the page.
 */
const fix = (n) => Number(n.toFixed(4));

export function iconPos(i, offset, deg, r) {
    const th = i * deg + offset;
    const rad = (th * Math.PI) / 180;
    return {
        left: `${fix(50 + r * Math.sin(rad))}%`,
        top: `${fix(50 - r * Math.cos(rad))}%`,
        transform: `translate(-50%, -50%) rotate(${th}deg)`,
    };
}

/**
 * The rotation that parks wedge `idx` dead under the pointer at top, always moving FORWARD from `prev`.
 *
 * NO JITTER. It used to stop up to ±3.6° off centre "for feel" — noise on the one signal the whole wheel
 * exists to send. Dead centre under the wolf, every time.
 */
export function landingRotation(prev, idx, turns, deg = WEDGE_DEG, offset = WEDGE_OFFSET) {
    const targetMod = (((-(idx * deg + offset)) % 360) + 360) % 360;
    let n = Math.ceil(prev / 360) * 360 + turns * 360 + targetMod;
    if (n <= prev + 360) n += 360;
    return n;
}
