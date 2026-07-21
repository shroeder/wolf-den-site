"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { bordersForLevel } from "@/lib/marketplace/borders.js";
import { cosmeticPrice } from "@/lib/marketplace/cosmetic-price.js";

// Equip a border you've unlocked — or BUY a locked one early with gold (tap it). Role borders stay
// badge-gated (not for sale). Equipping/buying POSTs then router.refresh() so avatars re-render.
export default function BorderPicker({ current = "none", level = 1, avatarUrl = null, displayLabel = "", unlockAll = false, badges = [], owned = [], gold = 0 }) {
    const router = useRouter();
    const [equipped, setEquipped] = useState(current || "none");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const ownedSet = new Set(owned);
    const borders = bordersForLevel(level, { unlockAll, badges, owned: ownedSet });
    const initial = (displayLabel || "?").slice(0, 1).toUpperCase();

    async function equip(id) {
        if (busy || id === equipped) return;
        const prev = equipped;
        setEquipped(id); // optimistic
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/border", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ border: id }) });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || "Could not equip that border.");
            router.refresh();
        } catch (e) {
            setEquipped(prev);
            setErr(e?.message || "Could not equip that border.");
        } finally { setBusy(false); }
    }

    async function buy(id) {
        if (busy) return;
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/cosmetic-shop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: "border", ref: id }) });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error === "not_enough_gold" ? "Not enough gold." : (d?.error || "Couldn't buy that border."));
            router.refresh();
        } catch (e) {
            setErr(e?.message || "Couldn't buy that border.");
        } finally { setBusy(false); }
    }

    return (
        <div className="border-picker">
            <div className="border-swatches">
                {borders.map((b) => {
                    const isSel = equipped === b.id;
                    const forSale = !b.unlocked && !b.requiresBadges && b.id !== "none";
                    const price = forSale ? cosmeticPrice("border", b.level) : 0;
                    const canAfford = gold >= price;
                    return (
                        <button
                            key={b.id}
                            type="button"
                            disabled={busy || (!b.unlocked && !forSale)}
                            className={`border-swatch${isSel ? " is-selected" : ""}${!b.unlocked ? " is-locked" : ""}`}
                            onClick={() => (b.unlocked ? equip(b.id) : (forSale ? (canAfford ? buy(b.id) : router.push("/marketplace/credit")) : null))}
                            aria-pressed={isSel}
                            title={b.unlocked ? b.label : (forSale ? (canAfford ? `Buy for ${price.toLocaleString()} gold` : "Get more coins") : `Unlocks at Level ${b.level}`)}
                        >
                            <span className={`border-swatch-av${b.id !== "none" ? ` av-border av-border-${b.id}` : ""}`}>
                                {avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={avatarUrl} alt="" />
                                ) : (
                                    <span aria-hidden="true">{initial}</span>
                                )}
                                {!b.unlocked ? <span className="border-swatch-lock" aria-hidden="true">{forSale ? "💰" : "🔒"}</span> : null}
                            </span>
                            <span className="border-swatch-label">{b.label}</span>
                            <span className="border-swatch-sub muted">
                                {b.unlocked ? (isSel ? "Equipped ✓" : b.hint) : (b.requiresBadges ? b.lockLabel : (forSale ? (canAfford ? `💰 ${price.toLocaleString()}` : `💰 ${price.toLocaleString()} · ＋ coins`) : `Lv ${b.level}`))}
                            </span>
                        </button>
                    );
                })}
            </div>
            {err ? <p className="shop-payment-error" style={{ marginTop: 8 }}>{err}</p> : null}
        </div>
    );
}
