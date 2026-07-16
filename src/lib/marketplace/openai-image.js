import "server-only";

import { put } from "@vercel/blob";

// AI art generation via OpenAI's image model (gpt-image-1), stored to Vercel Blob. Reuses the same
// OPENAI_API_KEY the site already uses for product matching. Admin-only callers (cost control).
const IMAGES_URL = "https://api.openai.com/v1/images/generations";
const IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";

export async function generateImage(prompt, { size = "1024x1024", pathPrefix = "marketplace/ai" } = {}) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");

    const resp = await fetch(IMAGES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size, background: "transparent", quality: "medium", n: 1 }),
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`OpenAI image ${resp.status}: ${text.slice(0, 300)}`);
    }
    const data = await resp.json().catch(() => null);
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI returned no image");

    const buffer = Buffer.from(b64, "base64");
    const path = `${pathPrefix}/${Date.now()}-${Math.round(Math.random() * 1e6)}.png`;
    const blob = await put(path, buffer, { access: "public", contentType: "image/png" });
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
