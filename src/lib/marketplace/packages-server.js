import "server-only";

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
export async function visiblePackages(buyerId, { withArt = false } = {}) {
    const owner = isOwner(buyerId);
    const out = [];
    for (const p of PACKAGES) {
        const open = String(await getSetting(packageSettingKey(p.id), "off").catch(() => "off")) === "on";
        if (!open && !owner) continue;
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
