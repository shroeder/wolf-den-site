import "server-only";

import { db } from "@/lib/db";

import { PACKAGES, packageSettingKey } from "@/lib/marketplace/packages.js";
import { decorationById } from "@/lib/marketplace/decorations.js";
import { getDecoSprites } from "@/lib/marketplace/farm-decorations.js";
import { getPetSpriteData } from "@/lib/marketplace/pet-sprite.js";
import { getSetting } from "@/lib/settings.js";
import { isOwner } from "@/lib/marketplace/owner.js";

// ── WHO MAY SEE WHICH PACKAGE, DECIDED ONCE ──────────────────────────────────────────────────────────────────
// This gate was written out three times — the credit page, the checkout and the town — and a package is now
// advertised in more places than that. Three copies of a visibility rule is three chances for one of them to
// quietly say yes when the others say no, and the one that says yes is the one that leaks an unreleased item to
// the whole Den.
//
// The rule: a package is visible when its setting says "on". Before that, ONLY the owner sees it, flagged
// `ownerPreview` so every surface can label it rather than pretending it is live. That is what makes it
// possible to build the advertising and look at it in place without anybody else being shown a thing they
// cannot buy.
//
// ⚠️ VISIBILITY IS NOT PERMISSION. The checkout re-checks the same setting itself — see credit/checkout. This
// decides what is DRAWN; that decides what can be BOUGHT, and the two are deliberately separate so a bug in
// one cannot become a free item.
// ── AND ONCE YOU OWN IT, IT IS GONE ──────────────────────────────────────────────────────────────────────────
// Everywhere. The shop, the farm banner, the Vault sign: a package you already have simply is not offered to
// you again.
//
// I first built this the other way — the shop kept showing it marked "You own this" on the reasoning that a
// shop which deletes what you just bought looks broken. Luke: "I would prefer not to see the package at all if
// I already have it." He is right and the argument for keeping it was thin: the headline item is one-per-farm,
// so there is genuinely nothing left to sell, and a card that exists only to tell you it has nothing for you is
// clutter on the one screen that should be all offer.
//
// The checkout still refuses a duplicate on its own (409), because hiding is not enforcing and a stale tab is
// all it would take.
export async function visiblePackages(buyerId, { withArt = false } = {}) {
    const owner = isOwner(buyerId);
    const out = [];
    for (const p of PACKAGES) {
        const open = String(await getSetting(packageSettingKey(p.id), "off").catch(() => "off")) === "on";
        if (!open && !owner) continue;
        const has = p.decoId
            ? await db.queryOne(
                `SELECT 1 FROM mkt_deco_owned WHERE buyer_id = $1 AND deco_id = $2 AND qty > 0 LIMIT 1`,
                [buyerId, p.decoId]
            ).catch(() => null)
            : null;
        if (has) continue;   // already yours — not offered anywhere
        const offer = { ...p, ownerPreview: !open };
        if (withArt) {
            // The item and the three demo companions that sit on its tiers. Only fetched when a surface is
            // actually going to draw them — the town's sign needs a name and a price and nothing else.
            const def = decorationById(p.decoId);
            const [decoSprites, petSprites] = await Promise.all([
                getDecoSprites([p.decoId]).catch(() => ({})),
                getPetSpriteData().catch(() => ({})),
            ]);
            offer.decoSprite = decoSprites[p.decoId] || null;
            offer.decoSize = def?.size || 132;
            offer.tiers = def?.tiers || [];
            offer.demoPetSprites = (p.demoPets || []).map((id) => petSprites[id]?.url || null);
        }
        out.push(offer);
    }
    return out;
}

/** The one to advertise right now, or null. First visible wins — packages are a rotating slot, not a shelf. */
export async function featuredPackage(buyerId, opts = {}) {
    const all = await visiblePackages(buyerId, opts);
    return all[0] || null;
}
