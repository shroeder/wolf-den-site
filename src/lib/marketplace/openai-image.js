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
    // gpt-4o (not -mini) is markedly better at reading the facing of a 3/4-view figure. A short answer with a
    // one-word instruction keeps it cheap. The prompt explicitly frames the 3/4 case so a slightly-angled
    // body still resolves to the side it's turned toward.
    const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-4o",
            temperature: 0,
            max_tokens: 5,
            messages: [{ role: "user", content: [
                { type: "text", text: "This is a small game character sprite, usually drawn at a 3/4 angle. Which side of the image is the FRONT of its body and face turned toward? If it's angled, pick the side its chest/nose points to. Answer with exactly one word: left or right." },
                { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
            ] }],
        }),
    });
    if (!resp.ok) throw new Error(`Facing detection request failed (${resp.status}).`);
    const data = await resp.json().catch(() => null);
    const answer = (data?.choices?.[0]?.message?.content || "").toLowerCase();
    if (answer.includes("left") && !answer.includes("right")) return "left";
    if (answer.includes("right") && !answer.includes("left")) return "right";
    return "unknown"; // a real but ambiguous answer — settle as no-flip; staff can override manually.
}

// Public: store a PNG buffer to Blob and return its URL (same convention as generateImage).
export async function storePng(buffer, pathPrefix = "marketplace/ai") {
    const path = `${pathPrefix}/${Date.now()}-${Math.round(Math.random() * 1e6)}.png`;
    const blob = await put(path, buffer, { access: "public", contentType: "image/png" });
    return blob.url;
}

export async function generateImage(prompt, { size = "1024x1024", pathPrefix = "marketplace/ai", quality = "medium", faceRight = false } = {}) {
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
