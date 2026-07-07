import "server-only";

import { searchCatalog } from "@/lib/marketplace/search.js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// Game/publisher noise that catalog product names omit — stripping it lets the strict text-search match.
const NOISE = [
    "wizards of the coast", "magic: the gathering", "magic the gathering",
    "pokémon - trading card game:", "pokemon - trading card game:",
    "pokémon trading card game:", "pokemon trading card game:",
    "pokémon tcg:", "pokemon tcg:", "pokémon:", "pokemon:", "pokémon", "pokemon",
    "yu-gi-oh!", "yugioh:", "yugioh", "trading card game",
];

function stripNoise(value) {
    let s = ` ${String(value || "").toLowerCase()} `;
    for (const n of NOISE) s = s.split(n).join(" ");
    return s.replace(/\s+/g, " ").trim();
}

async function openaiChat(messages, jsonMode = false) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");
    const body = { model: "gpt-4.1-mini", temperature: 0, messages };
    if (jsonMode) body.response_format = { type: "json_object" };
    const resp = await fetch(OPENAI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
}

// Match a messy store product title to a TCGplayer catalog product: AI generates a clean query, we
// search the catalog with a few variants, then AI picks the best candidate (weighing type + price).
export async function matchProductToCatalog({ name, price = null, category = null }) {
    const title = String(name || "").trim();
    if (!title) return null;

    let aiQuery = "";
    try {
        aiQuery = stripNoise(
            await openaiChat([
                { role: "system", content: "Convert a messy store product title into a TCGplayer catalog search query: just the SET NAME + product type. A 'booster box' is usually a 'Play Booster Display' or 'Draft Booster Box'; there are also 'Play Booster Pack', 'Collector Booster', 'Bundle', 'Elite Trainer Box'. Do NOT include the game or publisher. Output ONLY the query." },
                { role: "user", content: `Store title: "${title}"` },
            ]),
        );
    } catch {
        aiQuery = "";
    }

    const norm = stripNoise(title);
    const keywords = norm.split(" ").filter((w) => w.length > 2).slice(0, 4).join(" ");
    const queries = [...new Set([aiQuery, norm, keywords].filter(Boolean))];

    const byId = new Map();
    for (const q of queries) {
        const results = await searchCatalog({ query: q, limit: 8 });
        for (const r of results) byId.set(String(r.catalogProductId), r);
    }
    const candidates = [...byId.values()].slice(0, 20);
    if (candidates.length === 0) return null;

    const lines = candidates
        .map((c) => `id=${c.catalogProductId} | ${c.name}` +
            (c.setName ? ` | set: ${c.setName}` : "") +
            (c.game ? ` | game: ${c.game}` : "") +
            (c.marketPrice != null ? ` | market ~$${c.marketPrice}` : ""))
        .join("\n");

    let verdict;
    try {
        const out = await openaiChat([
            { role: "system", content: 'You match a store\'s TCG product to the correct catalog entry. Respond ONLY with JSON: {"id":"<catalog id or none>","confidence":"high|medium|low","reason":"<one sentence comparing product type, set, and price>"}.' },
            { role: "user", content: `Store item:\nname: ${title}\n${category ? `category: ${category}\n` : ""}your price: $${price ?? "?"}\n\nCandidates:\n${lines}\n\nPick the SAME product. Compare product type (single vs pack vs box/display vs case), set, and whether your price is roughly consistent with market. Prefer the best plausible match; use confidence for doubt. Choose 'none' only if nothing is plausibly the same product.` },
        ], true);
        verdict = JSON.parse(out);
    } catch {
        return null;
    }

    const chosen = candidates.find((c) => String(c.catalogProductId) === String(verdict?.id));
    if (!chosen) return null;

    return {
        catalogProductId: String(chosen.catalogProductId),
        suggestedName: chosen.name,
        suggestedImageUrl: chosen.imageUrl || null,
        suggestedSetName: chosen.setName || null,
        suggestedGame: chosen.game || null,
        suggestedMarketPrice: chosen.marketPrice ?? null,
        confidence: verdict?.confidence || "medium",
        reason: verdict?.reason || null,
    };
}
