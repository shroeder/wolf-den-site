import "server-only";

import { put } from "@vercel/blob";
import { logGeneration, logText, estimateImageCost } from "@/lib/marketplace/ai-ledger.js";
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
        // Runs on every faceRight sprite, so it's small per call and never small in aggregate.
        await logText({ model: "gpt-4o-mini", usage: data?.usage, source: "vision/facing", label: "Facing check", origin: "auto" });
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
        await logText({ model: "gpt-4o-mini", usage: data?.usage, source: "text/deco-prompt", label: "Creation prompt refine", origin: "creation" });
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

// Turn a decoration's NAME into a short, editable one-line visual description the player can tweak before
// drawing (they type a name, we imagine what it looks like). Best-effort — null on any failure.
export async function describeDecoFromName(name) {
    const key = process.env.OPENAI_API_KEY;
    const nm = String(name || "").trim().slice(0, 60);
    if (!key || nm.length < 2) return null;
    try {
        const resp = await fetch(CHAT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                max_tokens: 90,
                temperature: 0.8,
                messages: [
                    {
                        role: "system",
                        content:
                            "Given a decoration's NAME, write ONE short vivid sentence describing what it looks like — its form, materials, colors, and a standout detail — as a single decorative object a player would place on a farm. No preamble, no quotes, max 30 words. Never reference a real brand or copyrighted character.",
                    },
                    { role: "user", content: `Name: ${nm}` },
                ],
            }),
        });
        if (!resp.ok) return null;
        const data = await resp.json().catch(() => null);
        await logText({ model: "gpt-4o-mini", usage: data?.usage, source: "text/deco-name", label: "Creation name → description", origin: "creation" });
        const out = (data?.choices?.[0]?.message?.content || "")
            .trim()
            .replace(/^["']|["']$/g, "")
            .replace(/\s+/g, " ")
            .slice(0, 300);
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
        // gpt-4o at detail:"high", THREE times per sprite for the majority vote — the most expensive text call
        // in the app by a wide margin, and it was completely invisible before this.
        await logText({ model: "gpt-4o", usage: data?.usage, source: "vision/facing-vote", label: "Facing vote (1 of 3)", origin: "auto" });
        const answer = (data?.choices?.[0]?.message?.content || "").toLowerCase();
        if (answer.includes("left") && !answer.includes("right")) return "left";
        if (answer.includes("right") && !answer.includes("left")) return "right";
        return "unknown";
    };
    // ONE call, not three. The majority vote existed to stabilise a coin-flip, but measuring it against 452
    // already-labelled sprites showed the extra two calls weren't buying correctness — the labels are wrong on
    // clearly directional creatures and meaningless on symmetrical ones. Paying triple for that isn't a
    // trade-off, it's just triple. Left as a manual admin tool; nothing calls it on a schedule any more.
    const votes = [await askOnce()];
    const left = votes.filter((v) => v === "left").length;
    const right = votes.filter((v) => v === "right").length;
    if (left > right) return "left";
    if (right > left) return "right";
    return "unknown"; // genuine tie/ambiguous — settle as no-flip; staff can override manually.
}

// Store an image buffer to Blob and return its URL.
//
// gpt-image-1 hands back a 1024x1024 PNG, ~1.5-2.4 MB. Sprites are drawn at 48-148 CSS px, so shipping the raw
// return value meant ~2 GB of art was being downloaded by phones to paint thumbnails — the largest single line
// on the Vercel bill and the reason the Town and Farm were slow on mobile. Everything now goes out as WebP,
// capped at SPRITE_MAX_PX, which is ~3x the biggest size any sprite renders at (more pixels than a 3x-DPR phone
// can show) and lands each file at 20-90 KB. Pass maxWidth explicitly for backdrops, which are painted
// full-width and genuinely need the resolution.
const SPRITE_MAX_PX = 640;
// Backdrops are painted across the full width of a scrolling scene, so they keep real resolution.
const SCENE_MAX_PX = 1600;

export async function storeImage(buffer, pathPrefix, { maxWidth = SPRITE_MAX_PX, quality = 88 } = {}) {
    const sharp = (await import("sharp")).default;
    const out = await sharp(buffer)
        .resize({ width: maxWidth, height: maxWidth, fit: "inside", withoutEnlargement: true })
        .webp({ quality, effort: 5 })
        .toBuffer();
    const path = `${pathPrefix}/${Date.now()}-${Math.round(Math.random() * 1e6)}.webp`;
    const blob = await put(path, out, { access: "public", contentType: "image/webp", cacheControlMaxAge: 31536000 });
    return blob.url;
}

// Public: store a buffer to Blob and return its URL (same convention as generateImage). Name kept for its
// callers; the stored file is WebP now, not PNG.
export async function storePng(buffer, pathPrefix = "marketplace/ai", opts = {}) {
    return storeImage(buffer, pathPrefix, opts);
}

// `meta` is the provenance the AI Costs history is built on — origin (batch/creation/member/cron/admin), the
// batch it belongs to, and WHO caused it when a member did. Callers that pass nothing still get a costed row;
// they just show up as "unknown", which is a gap worth seeing rather than a silent omission.
// How good the image needs to be is a function of HOW BIG IT ENDS UP, not of what it costs. A flat `low`
// default saved money on 127 decorations a month that get downscaled to 320px — where the extra detail is
// thrown away by the resize regardless — and spent the same nothing on the 6 boss portraits a month that fill
// half a phone screen and stay there for ten days. That's the wrong trade in both directions.
//
// So: anything downscaled to a tile stays `low` (you cannot see the difference), and anything rendered large
// gets `medium`. Measured against the last 30 days of real volume this is about +$6/month, and essentially all
// of it lands on the boss splash, the backgrounds, the town buildings and members' own hero sprites.
// An explicit `quality` still wins — this only decides what happens when the caller doesn't care.
// NOTE the knock-on: raising a sprite's resizeTo past this line also promotes it to `medium`. Decorations went
// to 512 (they can be scaled 2.5x on the farm, so 320 was being upscaled) and therefore crossed it — about
// +$4/month for the ~127 drawn each month. That's intentional, not an accident of the threshold: the farm is
// the most-decorated surface in the game. Anything genuinely tile-sized — badges at 160, the loot pig at 256 —
// still sits below and still draws cheap.
const TILE_PX = 320;
function qualityForOutput(resizeTo) {
    return resizeTo && resizeTo <= TILE_PX ? "low" : "medium";
}

export async function generateImage(prompt, { size = "1024x1024", pathPrefix = "marketplace/ai", quality = null, faceRight = false, resizeTo = null, deHalo = false, meta = {} } = {}) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");
    quality = quality || qualityForOutput(resizeTo);

    const resp = await fetch(IMAGES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size, background: "transparent", quality, n: 1 }),
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        // A refusal still costs input tokens and is the thing you most want to see in the history, so it is
        // logged before the throw rather than disappearing into the caller's catch.
        await logGeneration({ size, quality, source: pathPrefix, prompt, ok: false, error: text.slice(0, 300), ...meta });
        throw new Error(`OpenAI image ${resp.status}: ${text.slice(0, 300)}`);
    }
    const data = await resp.json().catch(() => null);
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
        await logGeneration({ size, quality, source: pathPrefix, prompt, ok: false, error: "no image returned", ...meta });
        throw new Error("OpenAI returned no image");
    }

    let buffer = Buffer.from(b64, "base64");
    // Enforce a consistent right-facing orientation (e.g. pets/companions that fight toward the boss).
    if (faceRight) buffer = (await orientFacingRight(buffer, key)).buffer;
    // Future-proof the die-cut white halo: safely peel it off die-cut sprite generations (no-ops when there's
    // no halo, keeps the original if a pale subject would go ragged). Callers opt in; never used on scenes.
    if (deHalo) { const { deHaloBuffer } = await import("@/lib/marketplace/dehalo.js"); buffer = await deHaloBuffer(buffer); }
    // Downscale + WebP on the way out. `resizeTo` (callers that already asked for a smaller sprite, e.g.
    // badges at ~24px) still wins; everything else lands on the SPRITE_MAX_PX cap instead of shipping the raw
    // 1024px PNG. Transparency is preserved either way.
    const url = await storeImage(buffer, pathPrefix, { maxWidth: resizeTo || SPRITE_MAX_PX });
    await logGeneration({ size, quality, source: pathPrefix, prompt, url, ...meta });
    return url;
}

// Opaque landscape scene (no transparency) — used for boss battle backgrounds. Returns the Blob URL.
export async function generateSceneImage(prompt, { pathPrefix = "marketplace/boss-bg", quality = "medium", meta = {} } = {}) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");

    // A scene keeps its full resolution and is painted across the entire card - it is the single largest image
    // the game renders, so it is the last place to be saving a hundredth of a cent. Four of these a month.
    const resp = await fetch(IMAGES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1536x1024", background: "opaque", quality, n: 1 }),
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`OpenAI scene ${resp.status}: ${text.slice(0, 300)}`);
    }
    const data = await resp.json().catch(() => null);
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI returned no image");
    const buffer = Buffer.from(b64, "base64");
    // A backdrop is painted across the whole scene, so it keeps its resolution — only the encoding changes.
    const url = await storeImage(buffer, pathPrefix, { maxWidth: SCENE_MAX_PX });
    await logGeneration({ size: "1536x1024", quality, source: pathPrefix, prompt, url, ...meta });
    return url;
}

// TRUE wide scene via OUTPAINTING — generate a base tile, then extend it RIGHT step-by-step by feeding the real
// right-edge pixels back with a fill-mask so the model paints a genuine continuation (no seams, no repeat — not a
// "clever tile"). Sequential, so keep `steps` modest under a serverless time budget. Returns the stored Blob URL.
export async function generateOutpaintedSceneImage(basePrompt, contPrompt, { pathPrefix = "marketplace/boss-bg", steps = 3, quality = "low", meta = {} } = {}) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");
    const W = 1536, H = 1024, SEED = 800, NEW = W - SEED;
    const genBase = async () => {
        const r = await fetch(IMAGES_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model: "gpt-image-1", prompt: basePrompt, size: `${W}x${H}`, background: "opaque", quality, n: 1 }) });
        if (!r.ok) throw new Error(`OpenAI base ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
        const b64 = (await r.json().catch(() => null))?.data?.[0]?.b64_json;
        if (!b64) throw new Error("OpenAI returned no image");
        return Buffer.from(b64, "base64");
    };
    // Reused mask: keep the left SEED px (opaque), let the right NEW px be repainted (transparent alpha).
    const mask = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y += 1) { const row = y * W; for (let x = 0; x < W; x += 1) mask[(row + x) * 4 + 3] = x < SEED ? 255 : 0; }
    const maskPng = await sharp(mask, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    const extend = async (panorama, panoW) => {
        const seed = await sharp(panorama).extract({ left: panoW - SEED, top: 0, width: SEED, height: H }).toBuffer();
        const canvas = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: seed, left: 0, top: 0 }]).png().toBuffer();
        const form = new FormData();
        form.append("model", "gpt-image-1");
        form.append("image", new Blob([canvas], { type: "image/png" }), "canvas.png");
        form.append("mask", new Blob([maskPng], { type: "image/png" }), "mask.png");
        form.append("prompt", contPrompt);
        form.append("size", `${W}x${H}`);
        form.append("quality", quality);
        form.append("n", "1");
        const r = await fetch(IMAGE_EDITS_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
        if (!r.ok) throw new Error(`OpenAI outpaint ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
        const b64 = (await r.json().catch(() => null))?.data?.[0]?.b64_json;
        if (!b64) throw new Error("OpenAI returned no image");
        const fresh = await sharp(Buffer.from(b64, "base64")).resize(W, H).extract({ left: SEED, top: 0, width: NEW, height: H }).toBuffer();
        const grown = await sharp({ create: { width: panoW + NEW, height: H, channels: 4, background: { r: 20, g: 24, b: 16, alpha: 1 } } })
            .composite([{ input: panorama, left: 0, top: 0 }, { input: fresh, left: panoW, top: 0 }]).png().toBuffer();
        return { buf: grown, width: panoW + NEW };
    };
    let buf = await genBase();
    let width = W;
    for (let i = 0; i < Math.max(1, Math.min(6, steps)); i += 1) { const r = await extend(buf, width); buf = r.buf; width = r.width; }
    const out = await sharp(buf).flatten({ background: { r: 20, g: 24, b: 16 } }).webp({ quality: 86, effort: 5 }).toBuffer();
    // Outpainted panoramas are several tiles wide on purpose — no width cap here, or the scrolling scene the
    // outpainting exists to build would be squeezed back down to one screen.
    const blob = await put(`${pathPrefix}/${Date.now()}-${Math.round(Math.random() * 1e6)}.webp`, out, { access: "public", contentType: "image/webp", cacheControlMaxAge: 31536000 });
    // This is the priciest call in the app: one base draw plus `steps` edit passes, each billing a reference
    // image back in. Logged as a single row carrying the whole run's cost, not one row per invisible step.
    await logGeneration({
        size: `${W}x${H}`, quality, edit: true, source: pathPrefix, prompt: basePrompt, url: blob.url,
        label: `Outpainted panorama (${steps + 1} passes)`,
        costUsd: estimateImageCost({ size: `${W}x${H}`, quality }) + steps * (estimateImageCost({ size: `${W}x${H}`, quality, edit: true })),
        ...meta,
    });
    return blob.url;
}

// WIDE panorama scene — gpt-image-1 tops out at 1536x1024 (1.5:1), so we generate N panels of ONE continuous
// scene and feather-blend them into a single ~3-4x-wide image. The farm uses this so a backdrop can scroll wide
// while staying fully UNIQUE (no mirror-tiling / visible repeat). Returns the stored Blob URL.
export async function generateWideSceneImage(prompt, { pathPrefix = "marketplace/boss-bg", panels = 3, overlap = 180 } = {}) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");
    const W = 1536, H = 1024;
    const N = Math.max(2, Math.min(4, panels));
    const spots = ["the far-LEFT section", "a LEFT-CENTER section", "a RIGHT-CENTER section", "the far-RIGHT section"];
    const bufs = [];
    for (let i = 0; i < N; i++) {
        // Each panel is a different slice of ONE continuous horizontal scene; pin the horizon/ground/lighting so
        // adjacent panels line up and the feathered seam is invisible.
        const p = `${prompt}\n\nThis is ${spots[i] || "another section"} of ONE long continuous horizontal panorama. Keep the horizon line, ground/floor height, lighting, color palette and art style EXACTLY consistent across the whole width so sections join seamlessly. Vary only the incidental details (which trees, bushes, props appear) so no two sections look identical.`;
        const resp = await fetch(IMAGES_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model: "gpt-image-1", prompt: p, size: `${W}x${H}`, background: "opaque", quality: "low", n: 1 }),
        });
        if (!resp.ok) { const t = await resp.text().catch(() => ""); throw new Error(`OpenAI wide-scene ${resp.status}: ${t.slice(0, 200)}`); }
        const b64 = (await resp.json().catch(() => null))?.data?.[0]?.b64_json;
        if (!b64) throw new Error("OpenAI returned no image");
        bufs.push(Buffer.from(b64, "base64"));
    }
    // Feather mask: a single-channel alpha ramp 0→255 over the first `overlap` px, then fully opaque. Applied to
    // each panel after the first so its left edge fades over the previous panel — hiding the join.
    const ramp = Buffer.alloc(W * H);
    for (let y = 0; y < H; y++) { const row = y * W; for (let x = 0; x < W; x++) ramp[row + x] = x < overlap ? Math.round((x / overlap) * 255) : 255; }
    const finalW = W + (N - 1) * (W - overlap);
    const layers = [];
    for (let i = 0; i < N; i++) {
        const left = i * (W - overlap);
        if (i === 0) { layers.push({ input: bufs[0], left: 0, top: 0 }); continue; }
        const faded = await sharp(bufs[i]).joinChannel(ramp, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
        layers.push({ input: faded, left, top: 0 });
    }
    const out = await sharp({ create: { width: finalW, height: H, channels: 4, background: { r: 18, g: 22, b: 14, alpha: 1 } } })
        .composite(layers).webp({ quality: 86, effort: 5 }).toBuffer();
    // Stitched panorama — genuinely finalW wide, so no cap here either.
    const blob = await put(`${pathPrefix}/${Date.now()}-${Math.round(Math.random() * 1e6)}.webp`, out, { access: "public", contentType: "image/webp", cacheControlMaxAge: 31536000 });
    return blob.url;
}

// Image-to-image: transform a reference PNG with a prompt (gpt-image-1 edits). Used to redraw a member's
// avatar as a full-body sprite so it actually matches their avatar. Returns the stored Blob URL.
export async function editImage(imageBuffer, prompt, { size = "1024x1024", pathPrefix = "marketplace/ai", quality = "low", meta = {} } = {}) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");

    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("image", new Blob([imageBuffer], { type: "image/png" }), "avatar.png");
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", quality);
    form.append("background", "transparent");
    form.append("n", "1");

    const resp = await fetch(IMAGE_EDITS_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        await logGeneration({ size, quality, edit: true, source: pathPrefix, prompt, ok: false, error: text.slice(0, 300), ...meta });
        throw new Error(`OpenAI edit ${resp.status}: ${text.slice(0, 300)}`);
    }
    const data = await resp.json().catch(() => null);
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
        await logGeneration({ size, quality, edit: true, source: pathPrefix, prompt, ok: false, error: "no image returned", ...meta });
        throw new Error("OpenAI returned no image");
    }

    const buffer = Buffer.from(b64, "base64");
    const url = await storeImage(buffer, pathPrefix, { maxWidth: SCENE_MAX_PX });
    // An edit bills the reference image back in as input on top of the output, so it costs more than a fresh
    // draw of the same size — estimateImageCost() adds that when edit is true.
    await logGeneration({ size, quality, edit: true, source: pathPrefix, prompt, url, ...meta });
    return url;
}
