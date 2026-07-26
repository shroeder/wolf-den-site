import "server-only";

import { put } from "@vercel/blob";
import sharp from "sharp";

// AI art generation via OpenAI's image model (gpt-image-1), stored to Vercel Blob. Reuses the same
// OPENAI_API_KEY the site already uses for product matching. Admin-only callers (cost control).
const IMAGES_URL = "https://api.openai.com/v1/images/generations";
const IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";
const CHAT_URL = "https://api.openai.com/v1/chat/completions";

// gpt-image-1 has a strong bias to draw creatures facing LEFT and ignores "face right" in the prompt. So
// after generating, we ask a cheap vision model which way it's facing and horizontally mirror (sharp.flop)
// when it came out left. Best-effort: any failure returns the image unchanged rather than blocking art.
async function orientFacingRight(buffer, key) {
    try {
        const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
        const resp = await fetch(CHAT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                max_tokens: 3,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Which horizontal direction is this creature's head/face pointing? Reply with exactly one word: left or right." },
                            { type: "image_url", image_url: { url: dataUrl } },
                        ],
                    },
                ],
            }),
        });
        if (!resp.ok) return { buffer, flipped: false };
        const data = await resp.json().catch(() => null);
        const answer = (data?.choices?.[0]?.message?.content || "").toLowerCase();
        if (answer.includes("left") && !answer.includes("right")) {
            return { buffer: await sharp(buffer).flop().png().toBuffer(), flipped: true };
        }
        return { buffer, flipped: false };
    } catch {
        return { buffer, flipped: false };
    }
}

// Public: vision-check an already-rendered PNG and mirror it to face right if needed. Returns
// { buffer, flipped }. Used to repair existing sprites without regenerating the art.
export async function faceBufferRight(buffer) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { buffer, flipped: false };
    return orientFacingRight(buffer, key);
}

// Turn a player's short (often vague, over-literal) decoration description into ONE vivid, concrete visual
// prompt that captures their INTENT — inferring sensible materials, colors, shape, mood, style — for the cute
// 2D decoration art model. The image model takes terse prompts too literally and misses the point; this pass
// fixes that. Best-effort: returns null on any failure so the caller falls back to the raw wording. Never adds
// brands/copyrighted characters (those get refused downstream anyway).
export async function refineDecoPrompt(description, correction = "") {
    const key = process.env.OPENAI_API_KEY;
    const desc = String(description || "").trim().slice(0, 300);
    if (!key || desc.length < 3) return null;
    try {
        const sys =
            "You are a prompt engineer for a 2D RPG game's decoration art generator. Rewrite the player's short description of a decoration into ONE vivid, concrete visual description of a SINGLE decorative object or creature. Generously interpret their intent: infer sensible form, materials, colors, and standout details so the art looks intentional rather than a clumsy literal reading. Describe ONLY the object itself — do NOT specify an art style, rendering, lighting, or background (the renderer applies a fixed house style). Keep it one standalone decoration a player would place on a farm. Never reference a real brand, company, or copyrighted/trademarked character. Output ONLY the description as a noun phrase — no 'a picture of', no preamble, no quotes — 40 words max.";
        const user =
            correction && correction.trim()
                ? `Description: ${desc}\nThe player asked to adjust the PREVIOUS version like this: ${correction.trim().slice(0, 200)}\nRewrite the full description with that adjustment applied.`
                : `Description: ${desc}`;
        const resp = await fetch(CHAT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                max_tokens: 120,
                temperature: 0.7,
                messages: [
                    { role: "system", content: sys },
                    { role: "user", content: user },
                ],
            }),
        });
        if (!resp.ok) return null;
        const data = await resp.json().catch(() => null);
        let out = (data?.choices?.[0]?.message?.content || "").trim();
        out = out
            .replace(/^["']|["']$/g, "")
            .replace(/\s+/g, " ")
            .slice(0, 400);
        return out.length >= 3 ? out : null;
    } catch {
        return null;
    }
}

// Public: DETECT which way a rendered sprite faces WITHOUT modifying the image. Returns "left" | "right" |
// "unknown" for a genuine model answer. THROWS on an infra failure (no key / fetch / non-200) so the caller
// can leave the sprite unchecked and retry later instead of permanently recording a wrong "no-flip". Used to
// set a flip flag we apply at render time (instead of re-storing a mirrored image).
export async function detectFacing(bufferOrUrl) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY missing for facing detection.");
    let dataUrl;
    if (typeof bufferOrUrl === "string") {
        const resp = await fetch(bufferOrUrl);
        if (!resp.ok) throw new Error(`Sprite fetch failed (${resp.status}).`);
        dataUrl = `data:image/png;base64,${Buffer.from(await resp.arrayBuffer()).toString("base64")}`;
    } else {
        dataUrl = `data:image/png;base64,${bufferOrUrl.toString("base64")}`;
    }
    // Reading the facing of a small 3/4-view figure is the whole ballgame here — a wrong read means a
    // human has to manually un-flip the sprite. Two things make it reliable: (1) detail:"high" so the model
    // sees the full-res sprite (at "low" the image is downsampled to ~a thumbnail, where left/right is a
    // coin-flip), and (2) a 3-way MAJORITY VOTE with a little temperature, so one bad read can't decide it.
    const askOnce = async () => {
        const resp = await fetch(CHAT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: "gpt-4o",
                temperature: 0.4,
                max_tokens: 3,
                messages: [{ role: "user", content: [
                    { type: "text", text: "A game character sprite, drawn at a 3/4 angle. Look at which direction its NOSE and CHEST point — that's the way it faces. Ignore the image sides; judge only the character's own orientation. Answer exactly one word: left or right." },
                    { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
                ] }],
            }),
        });
        if (!resp.ok) throw new Error(`Facing detection request failed (${resp.status}).`);
        const data = await resp.json().catch(() => null);
        const answer = (data?.choices?.[0]?.message?.content || "").toLowerCase();
        if (answer.includes("left") && !answer.includes("right")) return "left";
        if (answer.includes("right") && !answer.includes("left")) return "right";
        return "unknown";
    };
    const votes = await Promise.all([askOnce(), askOnce(), askOnce()]);
    const left = votes.filter((v) => v === "left").length;
    const right = votes.filter((v) => v === "right").length;
    if (left > right) return "left";
    if (right > left) return "right";
    return "unknown"; // genuine tie/ambiguous — settle as no-flip; staff can override manually.
}

// Public: store a PNG buffer to Blob and return its URL (same convention as generateImage).
export async function storePng(buffer, pathPrefix = "marketplace/ai") {
    const path = `${pathPrefix}/${Date.now()}-${Math.round(Math.random() * 1e6)}.png`;
    const blob = await put(path, buffer, { access: "public", contentType: "image/png" });
    return blob.url;
}

export async function generateImage(prompt, { size = "1024x1024", pathPrefix = "marketplace/ai", quality = "medium", faceRight = false, resizeTo = null, deHalo = false } = {}) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");

    const resp = await fetch(IMAGES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size, background: "transparent", quality, n: 1 }),
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`OpenAI image ${resp.status}: ${text.slice(0, 300)}`);
    }
    const data = await resp.json().catch(() => null);
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI returned no image");

    let buffer = Buffer.from(b64, "base64");
    // Enforce a consistent right-facing orientation (e.g. pets/companions that fight toward the boss).
    if (faceRight) buffer = (await orientFacingRight(buffer, key)).buffer;
    // Future-proof the die-cut white halo: safely peel it off die-cut sprite generations (no-ops when there's
    // no halo, keeps the original if a pale subject would go ragged). Callers opt in; never used on scenes.
    if (deHalo) { const { deHaloBuffer } = await import("@/lib/marketplace/dehalo.js"); buffer = await deHaloBuffer(buffer); }
    // Optionally downscale before storing (e.g. badges render at ~24px — no need to ship a 1024px, ~1.5MB PNG).
    // Preserves transparency; sharp is loaded lazily so callers that don't resize don't pull it in.
    if (resizeTo) {
        const sharp = (await import("sharp")).default;
        buffer = await sharp(buffer).resize(resizeTo, resizeTo, { fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
    }
    const path = `${pathPrefix}/${Date.now()}-${Math.round(Math.random() * 1e6)}.png`;
    const blob = await put(path, buffer, { access: "public", contentType: "image/png" });
    return blob.url;
}

// Opaque landscape scene (no transparency) — used for boss battle backgrounds. Returns the Blob URL.
export async function generateSceneImage(prompt, { pathPrefix = "marketplace/boss-bg" } = {}) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");

    const resp = await fetch(IMAGES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1536x1024", background: "opaque", quality: "medium", n: 1 }),
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`OpenAI scene ${resp.status}: ${text.slice(0, 300)}`);
    }
    const data = await resp.json().catch(() => null);
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI returned no image");
    const buffer = Buffer.from(b64, "base64");
    const blob = await put(`${pathPrefix}/${Date.now()}-${Math.round(Math.random() * 1e6)}.png`, buffer, { access: "public", contentType: "image/png" });
    return blob.url;
}

// Image-to-image: transform a reference PNG with a prompt (gpt-image-1 edits). Used to redraw a member's
// avatar as a full-body sprite so it actually matches their avatar. Returns the stored Blob URL.
export async function editImage(imageBuffer, prompt, { size = "1024x1024", pathPrefix = "marketplace/ai" } = {}) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");

    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("image", new Blob([imageBuffer], { type: "image/png" }), "avatar.png");
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", "medium");
    form.append("background", "transparent");
    form.append("n", "1");

    const resp = await fetch(IMAGE_EDITS_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`OpenAI edit ${resp.status}: ${text.slice(0, 300)}`);
    }
    const data = await resp.json().catch(() => null);
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI returned no image");

    const buffer = Buffer.from(b64, "base64");
    const path = `${pathPrefix}/${Date.now()}-${Math.round(Math.random() * 1e6)}.png`;
    const blob = await put(path, buffer, { access: "public", contentType: "image/png" });
    return blob.url;
}
