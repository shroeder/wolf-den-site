import "server-only";

import { createServerLogger } from "@/lib/server-logger";

import { entitiesOf, recurring } from "./patterns.js";

const logger = createServerLogger({ source: "job", subsystem: "outreach-ai" });
const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

// ── WHERE THE MODEL EARNS ITS PLACE ──────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-13: "You will see patterns in behavior for sure. Some people like specific pokemon. Other
// peoole like to buy dual lands."
//
// Those two examples are not the same problem and that is the whole argument for this file. "Likes Umbreon"
// is a repeated string and `recurring()` finds it for nothing. "Buys dual lands" is a fact about Magic that
// no amount of string matching recovers: the three cards are called Volcanic Island, Tundra and Bayou, they
// share no token, and nothing in the shop's data says they are the same kind of card. A model knows.
//
// ── SO THE MODEL CHOOSES, AND THE CODE CONSTRAINS ────────────────────────────────────────────────────────────
// It never sees a price it can change, never names an item that is not already in stock, and never decides
// a discount — the margin rule did that before this file was called. Its entire authority is to rank a list
// it was handed and say why in one sentence. Everything it returns is checked back against that list, and
// anything it invents is dropped.
//
// ⚠️ AND IT FAILS OPEN, TO THE PROGRAMMATIC ORDER. No key, a timeout, a refusal, malformed JSON: the caller
// gets the scored picks it already had. The email is never blocked on the model, because an outreach job
// that silently stops when OpenAI has a bad morning is worse than one that occasionally picks second-best.

function digest(profile, names) {
    const chars = recurring(names, "character").filter((c) => c.count > 1).slice(0, 6);
    const rarities = recurring(names, "rarity").slice(0, 3);
    const conditions = names.map((n) => entitiesOf(n).condition).filter(Boolean);
    return {
        repeatedCharacters: chars.map((c) => `${c.value} x${c.count}`),
        usualRarities: rarities.map((r) => r.value),
        usualCondition: conditions.length ? conditions.join(", ") : null,
        typicalSpend: `$${(profile.typicalCents / 100).toFixed(2)}`,
    };
}

/**
 * Re-rank `candidates` for one member. Returns `{ picks, pattern }` — picks are always a subset of what was
 * passed in, in the model's preferred order, hero first.
 */
export async function aiRank({ profile, boughtNames, candidates, max = 3 }) {
    const key = process.env.OPENAI_API_KEY;
    const fallback = { picks: candidates.slice(0, max), pattern: null };
    if (!key || !candidates.length || !boughtNames.length) return fallback;

    const menu = candidates.slice(0, 35).map((c, i) => ({
        i,
        name: c.name,
        price: `$${(c.priceCents / 100).toFixed(2)}`,
        deal: c.offer ? `${c.offer.pct}% off` : null,
    }));

    const prompt = [
        "You work the counter at a game shop and you know the regulars.",
        "",
        "This customer has bought, most recent first:",
        ...boughtNames.slice(0, 20).map((n) => `  - ${n}`),
        "",
        `Signals already extracted: ${JSON.stringify(digest(profile, boughtNames))}`,
        "",
        "In stock right now, numbered:",
        ...menu.map((m) => `  ${m.i}. ${m.name} — ${m.price}${m.deal ? ` (${m.deal})` : ""}`),
        "",
        `Pick the ${max} they are most likely to actually buy, best first.`,
        "",
        "Work out what their purchases IMPLY, then sell them that. Accessories are evidence, not an",
        "interest: an 800-card deck case and sleeves means a Commander player, so offer Commander decks or",
        "the staples that go in one, NOT another deck box. A playmat means they play in person. A binder",
        "means they collect a set. Someone buying one character repeatedly wants that character again.",
        "",
        "Other real patterns: an evolution line, a set or era, a card type (dual lands, shocklands,",
        "trainers, full arts), a rarity habit, a condition habit, a price bracket.",
        "",
        "Reject anything that is only loosely 'the same game' - a jigsaw puzzle is not a card. Never pick",
        "something that is simply what they already own.",
        "",
        'Reply as JSON only: {"picks":[<numbers>],"pattern":"<under 12 words, what they are into>"}',
    ].join("\n");

    try {
        const resp = await fetch(CHAT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: MODEL,
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                temperature: 0.2,
                max_tokens: 220,
            }),
        });
        const json = await resp.json();
        const parsed = JSON.parse(json?.choices?.[0]?.message?.content || "{}");

        // ⚠️ INDEXES ARE VALIDATED, NOT TRUSTED. A hallucinated 47 against a 35-item menu is an undefined
        // that reaches the template as an empty row; a repeated index is the same card twice in one email.
        const seen = new Set();
        const picks = [];
        for (const raw of Array.isArray(parsed.picks) ? parsed.picks : []) {
            const i = Number(raw);
            if (!Number.isInteger(i) || i < 0 || i >= menu.length || seen.has(i)) continue;
            seen.add(i);
            picks.push(candidates[i]);
            if (picks.length >= max) break;
        }
        if (!picks.length) return fallback;

        // Top up from the scored order if the model was stingy, so an email is never short.
        for (const c of candidates) {
            if (picks.length >= max) break;
            if (!picks.includes(c)) picks.push(c);
        }
        const pattern = typeof parsed.pattern === "string" && parsed.pattern.length < 80 ? parsed.pattern.trim() : null;
        return { picks, pattern };
    } catch (error) {
        logger.warn("ai rank failed, using scored order", { error: String(error) });
        return fallback;
    }
}
