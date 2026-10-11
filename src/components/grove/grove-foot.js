// ── WHERE A SPRITE'S FEET ARE, MEASURED IN THE BROWSER ───────────────────────────────────────────────────────
// Luke: "the enemies and player and pet are floating, maybe we can fix that for all platforms?"
//
// Every creature in the Grove carries a `foot` — the share of its plate that is transparent air UNDER the
// body — and the renderer nudges the art down by it so the drawing stands on the floor its box is standing
// on. Those numbers are authored in GROVE_SIZE and measured offline by scripts/grove-sprite-bounds.mjs.
//
// ⚠️ THE HERO AND THE PET CANNOT HAVE AN AUTHORED NUMBER, AND THAT IS WHY THEY WERE THE WORST OFFENDERS.
// They are not catalogue art: they are whatever sprite the member has equipped, a blob URL that differs per
// player and changes whenever they change it. There is no table that could hold a value for a picture
// nobody has seen yet. So this is the same measurement, done once in the browser, on whatever turned up.
//
// ⚠️ MASS, NOT BOUNDING BOX. The naive answer is the lowest non-transparent pixel, and on these sprites that
// is a stray sparkle or a wisp of cape two percent below the boots — which reports almost no air on a sprite
// that visibly has some. A row only counts as the bottom of the body when a real share of its width is
// opaque, which is the same rule grove-sprite-bounds.mjs applies offline.
//
// Cheap by construction: the image is drawn once into a 64px square, so a measurement reads 4,096 pixels
// rather than a million, and the answer is cached per URL for the life of the page. A phone pays for this
// once per sprite, ever.

// ⚠️ 192, NOT 64, BECAUSE THE GRID SIZE IS THE ERROR BAR. One row of a 64px square is 1.6% of the sprite,
// which on a seven-unit hero is nearly two pixels — the same size as the air being measured, so the answer
// rounded up a whole step and planted him two pixels INTO the floor. Measured against the char slab, whose
// top edge is flat, that turned a float of nothing into a sink of three. 192 makes a step 0.5%, and the
// scan is 37k pixels once per sprite for the life of the page.
const SIZE = 192;
const ALPHA_FLOOR = 12;      // "transparent" comes back at alpha 1-3 — see sprite-alpha-floor-drop-shadow-box
const MASS = 0.06;           // share of the row's width that has to be opaque for it to be the body's bottom
const cache = new Map();

/**
 * The transparent air under a sprite, as a share of its height. Resolves to 0 for anything that cannot be
 * measured — a sprite that fails to load, or a cross-origin image the canvas refuses to read back.
 *
 * ⚠️ 0 IS THE SAFE ANSWER, NOT A FAILURE. It is exactly today's behaviour, so a tainted canvas leaves the
 * body where it already was rather than throwing inside a render.
 */
export function footOf(url) {
    if (!url || typeof document === "undefined") return Promise.resolve(0);
    const hit = cache.get(url);
    if (hit) return hit;

    const job = (async () => {
        try {
            const img = new Image();
            // Required for the pixel read: without it a blob-store sprite taints the canvas and getImageData
            // throws. The store serves a permissive CORS header, and the catch below covers it if it ever
            // stops doing so.
            img.crossOrigin = "anonymous";
            img.src = url;
            await img.decode();

            const cv = document.createElement("canvas");
            cv.width = SIZE;
            cv.height = SIZE;
            const cx = cv.getContext("2d", { willReadFrequently: true });
            if (!cx) return 0;
            cx.drawImage(img, 0, 0, SIZE, SIZE);
            const { data } = cx.getImageData(0, 0, SIZE, SIZE);

            const need = Math.max(2, Math.round(SIZE * MASS));
            for (let y = SIZE - 1; y >= 0; y -= 1) {
                let n = 0;
                for (let x = 0; x < SIZE; x += 1) {
                    if (data[(y * SIZE + x) * 4 + 3] > ALPHA_FLOOR) n += 1;
                }
                if (n >= need) return (SIZE - 1 - y) / SIZE;
            }
            return 0;
        } catch {
            return 0;
        }
    })();

    cache.set(url, job);
    return job;
}
