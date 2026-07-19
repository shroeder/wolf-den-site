"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { backgroundsForLevel } from "@/lib/marketplace/backgrounds.js";
import { cosmeticPrice } from "@/lib/marketplace/cosmetic-price.js";

// Equip a background you've unlocked — or BUY a locked one early with gold (tap it). Equipping/buying
// POSTs then router.refresh() so the hero re-renders.
export default function BackgroundPicker({ current = "none", level = 1, unlockAll = false, owned = [], gold = 0 }) {
    const router = useRouter();
    const [equipped, setEquipped] = useState(current || "none");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const ownedSet = new Set(owned);
    const backgrounds = backgroundsForLevel(level, { unlockAll, owned: ownedSet });

    async function equip(id) {
        if (busy || id === equipped) return;
        const prev = equipped;
        setEquipped(id);
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/background", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ background: id }) });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || "Could not equip that background.");
            router.refresh();
        } catch (e) {
            setEquipped(prev);
            setErr(e?.message || "Could not equip that background.");
        } finally { setBusy(false); }
    }

    async function buy(id) {
        if (busy) return;
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/cosmetic-shop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: "background", ref: id }) });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error === "not_enough_gold" ? "Not enough gold." : (d?.error || "Couldn't buy that background."));
            router.refresh();
        } catch (e) {
            setErr(e?.message || "Couldn't buy that background.");
        } finally { setBusy(false); }
    }

    return (
        <div className="bg-picker">
            <div className="bg-swatches">
                {backgrounds.map((b) => {
                    const isSel = equipped === b.id;
                    const forSale = !b.unlocked && b.id !== "none";
                    const price = forSale ? cosmeticPrice("background", b.level) : 0;
                    const canAfford = gold >= price;
                    return (
                        <button
                            key={b.id}
                            type="button"
                            disabled={busy || (!b.unlocked && (!forSale || !canAfford))}
                            className={`bg-swatch${isSel ? " is-selected" : ""}${!b.unlocked ? " is-locked" : ""}`}
                            onClick={() => (b.unlocked ? equip(b.id) : (forSale && canAfford ? buy(b.id) : null))}
                            aria-pressed={isSel}
                            title={b.unlocked ? b.label : (forSale ? `Buy for ${price.toLocaleString()} gold` : `Unlocks at Level ${b.level}`)}
                        >
                            <span className={`bg-swatch-scene${b.id !== "none" ? ` bg-scene bg-${b.id}` : ""}`}>
                                {!b.unlocked ? <span className="bg-swatch-lock" aria-hidden="true">{forSale ? "🪙" : "🔒"}</span> : null}
                            </span>
                            <span className="bg-swatch-label">{b.label}</span>
                            <span className="bg-swatch-sub muted">
                                {b.unlocked ? (isSel ? "Equipped ✓" : b.hint) : (forSale ? `🪙 ${price.toLocaleString()}${canAfford ? "" : " · need more"}` : `Lv ${b.level}`)}
                            </span>
                        </button>
                    );
                })}
            </div>
            {err ? <p className="shop-payment-error" style={{ marginTop: 8 }}>{err}</p> : null}
        </div>
    );
}
