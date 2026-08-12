// ── HOW THE DEN DRAWS A FIGHTER ──────────────────────────────────────────────────────────────────────────────
// The prompt wrapper, the facing check and the deterministic reframing, extracted from gen-arena-npcs.mjs so
// the Long Road's hundred can be drawn by exactly the same pipeline rather than by a second copy of it that
// agrees with this one today. Everything here was learned the hard way once already; the comments are kept
// with the code they explain.
import sharp from "sharp";

const STYLE = "Painterly cel-shaded 2D video-game art, bold clean dark outlines, chunky readable silhouette, high contrast, vibrant colors, soft inner shading, fantasy action-RPG style.";

// ── FRAMING ── "feet near the bottom edge" is what cropped seven of the first ten. The model reads it as an
// instruction to fill the canvas, so it runs the figure off both ends: the plume sliced off the helmet, the
// feet gone entirely, which on the sand reads as a fighter standing in a hole with the top of his head
// missing. Ask for the margin explicitly and CHECK for it after rather than trusting it.
const CUTOUT = "Full body, standing in a ready combat stance, facing right. The ENTIRE figure must fit INSIDE the frame with clear empty space on all four sides — leave roughly 8% of the frame empty above the top of the head and 6% empty below the feet, and do not let any part of the character, weapon, cape, wings or hair touch or run off any edge of the image. ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — absolutely NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white sticker rim. No text, no words, no letters, no logo, no watermark, no border.";

/** Wrap a subject into the Den's fighter prompt. */
export const fighterPrompt = (subject) => `A single fantasy ARENA COMBATANT character. ${subject} ${STYLE} ${CUTOUT}`;

export const MARGIN = 0.03;   // of the frame, required on every side

/**
 * WHICH WAY IS IT LOOKING.
 *
 * Every sprite in this game is drawn FACING RIGHT and the arena mirrors the opponent to turn them around, so a
 * sprite that comes back facing left ends up mirrored into facing AWAY from the hero — two fighters standing
 * back to back. That is exactly what shipped when the veteran was re-rolled: the prompt asks for "facing
 * right", the model drew left, the margin checker had no opinion about it, and the Den watched an axeman
 * admire the far wall. A flip is free and lossless, so this does not re-roll — it asks, and mirrors if left.
 */
export async function facesLeft(buf, key) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-4o", temperature: 0, max_tokens: 3,
            messages: [{ role: "user", content: [
                { type: "text", text: "A game character sprite drawn at a 3/4 angle. Look at which direction its NOSE and CHEST point — that is the way it faces. Ignore the image sides; judge only the character's own orientation. Answer exactly one word: left or right." },
                { type: "image_url", image_url: { url: `data:image/png;base64,${(await sharp(buf).png().toBuffer()).toString("base64")}`, detail: "high" } },
            ] }],
        }),
    }).catch(() => null);
    if (!r || !r.ok) return false; // unreadable → leave it alone rather than flipping on a guess
    const answer = ((await r.json().catch(() => null))?.choices?.[0]?.message?.content || "").toLowerCase();
    return answer.includes("left") && !answer.includes("right");
}

// ── THE FRAME IS OURS, NOT THE MODEL'S ───────────────────────────────────────────────────────────────────────
// Asking for margin does not get margin: four rolls came back at 0–1% top with the instruction stated in
// pixels, because a model composing a character fills the canvas. That is what a good portrait does everywhere
// except here, where the canvas edge is a hard clip and a flush helmet reads as a sliced head.
//
// So the framing is done here, deterministically, and it fixes a second thing: art framed all over the place
// renders the same character up to 13% larger or smaller than its neighbours. One frame for all of them means
// every opponent in the game is finally to scale with every other. This never crops — it trims to the ink,
// scales that to fit, and pastes it into a clean canvas.
export const CANVAS = 384;
const HEAD_ROOM = 0.07;
const FOOT_ROOM = 0.05;
const SIDE_ROOM = 0.07;
export async function frame(buf, { flip = false } = {}) {
    const source = flip ? await sharp(buf).flop().toBuffer() : buf; // flop = mirror horizontally
    const { data } = await sharp(source).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
    const ink = await sharp(data)
        .resize({
            width: Math.round(CANVAS * (1 - SIDE_ROOM * 2)),
            height: Math.round(CANVAS * (1 - HEAD_ROOM - FOOT_ROOM)),
            fit: "inside",
        })
        .toBuffer();
    const m = await sharp(ink).metadata();
    return sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{
            input: ink,
            left: Math.round((CANVAS - m.width) / 2),
            top: Math.round(CANVAS * (1 - FOOT_ROOM)) - m.height,   // stood on the same line, every band
        }])
        .webp({ quality: 88, alphaQuality: 100 })
        .toBuffer();
}

/** Where the ink actually sits, as a fraction of the frame on each side. */
export async function inkMargins(buf) {
    const img = sharp(buf);
    const m = await img.metadata();
    const { info } = await img.trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
    const top = -info.trimOffsetTop;
    const left = -info.trimOffsetLeft;
    return {
        top: top / m.height,
        bottom: (m.height - (top + info.height)) / m.height,
        left: left / m.width,
        right: (m.width - (left + info.width)) / m.width,
    };
}
export const shortSides = (mg) => Object.entries(mg).filter(([, v]) => v < MARGIN).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`);

/** One image, with retries. Medium quality: low looks cheap and these are opponents you stare at. */
export async function generate(prompt, key) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const r = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
                body: JSON.stringify({
                    model: "gpt-image-1", prompt, n: 1, size: "1024x1024",
                    quality: "medium", background: "transparent", output_format: "png",
                }),
            });
            const j = await r.json();
            const b64 = j?.data?.[0]?.b64_json;
            if (!b64) throw new Error(j?.error?.message || "no image");
            return Buffer.from(b64, "base64");
        } catch (e) {
            if (attempt === 3) throw e;
            await new Promise((res) => setTimeout(res, 4000 * attempt));
        }
    }
    return null;
}
