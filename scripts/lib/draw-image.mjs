// ── ONE PLACE THAT KNOWS WHICH MODEL DRAWS ───────────────────────────────────────────────────────────────────
// Luke, 2026-10-27: "Use the old model, the new ones are just a fallback."
//
// gpt-image-1 IS the house style and is tried first on every single image. Everything in the game was drawn by
// it, and a model swap silently restyles every sprite made from here on — so it stays a decision rather than a
// default, and nothing here quietly settles on a newer one.
//
// ⚠️ AND AS OF 2026-10-23 IT IS RETIRED, SO THE FALLBACK FIRES EVERY TIME. The API's own answer, which is
// worth reading because the error is actively misleading:
//
//     GET /v1/models/gpt-image-1  ->  { "id": "gpt-image-1", "shutdown_date": "2026-10-23" }
//     POST /v1/images/generations ->  400 "The model 'gpt-image-1' does not exist."
//
// It resolves, it is still listed, and the key is healthy — it simply will not draw. The first failure in the
// ledger is 2026-10-23T19:00 and there have been hundreds since. The moment OpenAI restores it, every caller
// here goes back to using it with no change at all, which is the whole reason the dead model stays at the head
// of the list instead of being deleted from it.
//
// ⚠️ 1.5 AND MINI ARE NOT A HOME EITHER: both report shutdown_date 2026-12-01. Only the gpt-image-2 / 2.5
// family is live past that, and [[gpt-image-1-is-the-house-style]] is the record of what those draw like —
// tested over eleven generations and rejected: "it's all high detail and noisy, its not the right style."
// That is a decision for Luke before December, not a default for a script to make in October.
//
// ── WHY THIS IS A MODULE AND NOT A COPIED LOOP ───────────────────────────────────────────────────────────────
// This chain was written inline in gen-pack-bag.mjs first. A second generator needing it is exactly the moment
// the repo's loudest rule applies — two paths for one decision always drift, and the one that drifts is the
// one nobody is looking at. When the model question is settled it must be settled ONCE.
//
//     const { buf, model } = await drawImage({ key, prompt, size, quality, background });
//
// Returns the PNG bytes and which model actually drew them, because a picture whose provenance is unrecorded
// is one nobody can explain the look of six months later.

/** House first, newest last. Nothing is removed from the head of this list just because it is failing today. */
export const DRAW_MODELS = ["gpt-image-1", "gpt-image-1.5", "gpt-image-1-mini"];

/**
 * ⚠️ ONLY A MISSING MODEL FALLS THROUGH. A bad prompt, a rate limit or a billing problem throws on the first
 * model — silently retrying a real error down three models just pays for it three times.
 */
const MISSING = /does not exist|not have access|deprecated|retired|shut ?down/i;

export async function drawImage({
    key, prompt, size = "1024x1024", quality = "medium", background = "transparent",
    models = DRAW_MODELS, onFallback = null,
}) {
    let last = null;
    for (const model of models) {
        const res = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, prompt, size, quality, background, n: 1 }),
        });
        const body = await res.json();
        if (res.ok) return { buf: Buffer.from(body.data[0].b64_json, "base64"), model, body };

        const msg = String(body?.error?.message || "");
        if (!(res.status === 400 && MISSING.test(msg))) {
            throw new Error(`${model}: ${JSON.stringify(body?.error || body).slice(0, 300)}`);
        }
        last = msg;
        if (onFallback) onFallback(model, msg);
    }
    throw new Error(`every model refused — last said: ${last}`);
}
