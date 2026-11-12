// ── WHICH IMAGE MODEL WE DRAW WITH, IN ONE PLACE ─────────────────────────────────────────────────────────────
// ⚠️ THIS EXISTS BECAUSE THE LAST ONE WAS HARDCODED 103 TIMES AND DIED ALL AT ONCE.
//
// Every generator in scripts/ had `model: "gpt-image-1"` written into its own fetch call. On 2026-11-11 OpenAI
// retired that model and every one of them started answering
//
//     400 — The model 'gpt-image-1' does not exist.
//
// which reads like a typo and is not: the account, the key and the billing were all fine the whole time. See
// check-openai.mjs, which exists now so the next person gets that answer in three seconds instead of an hour.
//
// The cost is the other half of the same mistake. ai-trace.mjs priced every image at `40 / 1e6` — gpt-image-1's
// output rate — as a bare number in the middle of a cost calculation. Point the scripts at a cheaper model and
// the AI Costs screen would have gone on reporting the old price forever, silently, with nothing to notice.
// So the rate lives beside the name and is looked up BY the name.
//
// ⚠️ WHY 1.5 AND NOT 2.6. The deck already holds 133 painted cards drawn by gpt-image-1, and these are not a
// fresh set — they are eleven more cards going into that deck. gpt-image-1.5 is the point release of the same
// model and the nearest thing to the hand that drew the other 133; gpt-image-2.x is two generations along and
// more likely to look like a different artist. Prefer continuity over newness for anything joining existing
// art, and reach for a 2.x line when starting a set from scratch.
export const IMAGE_MODEL = "gpt-image-1.5";

// Dollars per 1,000,000 OUTPUT tokens, from OpenAI's pricing page, 2026-11-11.
// The token COUNT per image is a function of size and quality and lives in ai-trace.mjs (IMG_TOKENS); this is
// only the rate it is multiplied by.
export const IMAGE_PRICE_PER_MTOK = {
    "gpt-image-1": 40,       // retired 2026-11; kept so old ledger rows still price correctly
    "gpt-image-1-mini": 8,
    "gpt-image-1.5": 32,
    "gpt-image-2": 30,
    "gpt-image-2.5-flare": 30,
    "gpt-image-2.5-sunburst": 30,
    "gpt-image-2.6-flare": 30,
    "gpt-image-2.6-sunburst": 30,
};

/** The output rate for a model name, falling back to the one we draw with rather than to zero. */
export function imagePricePerMtok(model) {
    const key = String(model || IMAGE_MODEL);
    if (IMAGE_PRICE_PER_MTOK[key]) return IMAGE_PRICE_PER_MTOK[key];
    // Dated snapshots ("gpt-image-2.5-flare-2026-09-08") price as their base model.
    const base = Object.keys(IMAGE_PRICE_PER_MTOK).find((k) => key.startsWith(k));
    return base ? IMAGE_PRICE_PER_MTOK[base] : IMAGE_PRICE_PER_MTOK[IMAGE_MODEL];
}
