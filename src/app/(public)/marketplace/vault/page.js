import { redirect } from "next/navigation";

import VaultClient from "@/components/vault/VaultClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getStoreCredit } from "@/lib/marketplace/store-credit.js";
import { getVault } from "@/lib/marketplace/vault.js";
import { vaultOpenFor } from "@/lib/marketplace/vault-gate.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Card Vault | Wolf Den",
    robots: { index: false, follow: false },
};

// Door 2 of 9 (docs/virtual-packs-and-the-card-vault.md §16.2). A redirect rather than a 404 page: somebody
// who cannot use this has almost certainly followed a stale link, and the marketplace home is where they
// wanted to be.
export default async function VaultPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer || !vaultOpenFor(buyer.id)) redirect("/marketplace");

    const [vault, balanceCents] = await Promise.all([
        getVault(buyer.id).catch(() => null),
        getStoreCredit(buyer.id).catch(() => 0),
    ]);

    // ⚠️ `stack`, NOT `stack reveal`.
    //
    // `.reveal > *` animates `fade-in-up`, whose final keyframe is `transform: translateY(0)` with
    // fill-mode `both` — so the transform value PERSISTS after the animation ends. A transformed element is a
    // containing block for `position: fixed` descendants, which means the vault's bottom sheet anchored
    // itself to this section instead of to the viewport and rendered off the bottom of the screen.
    //
    // This is the same trap as the filter that stopped the mobile menu opening, arriving through an animation
    // instead of a filter. `transform: translateY(0)` is still a transform; only `transform: none` is not.
    return (
        <div className="stack">
            <h1 style={{ marginBottom: 4 }}>Card Vault</h1>
            <p className="muted" style={{ marginTop: 0 }}>
                Cards you pulled and kept. Sell them back for store credit whenever you like, or have them
                shipped or put aside for collection.
            </p>
            <VaultClient initial={{ ...(vault || { held: [], orders: [], history: [], totals: {} }), balanceCents }} />
        </div>
    );
}
