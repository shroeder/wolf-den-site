"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import AvatarStack from "@/components/AvatarStack";
import { avatarImageUrl, COSMETIC_SLOTS, cosmeticsForSlotWithLock } from "@/lib/marketplace/avatar-cosmetics.js";
import { cosmeticPrice } from "@/lib/marketplace/cosmetic-price.js";

const SLOT_LABELS = { headwear: "Headwear", aura: "Aura" };

// Equip avatar cosmetics (auras) per slot, or BUY a locked one early with gold (tap it). Native cosmetics
// draw into the avatar image; auras layer on via AvatarStack.
export default function AvatarCosmeticsPicker({ avatarConfig = null, initial = "?", level = 1, unlockAll = false, badges = [], current = {}, owned = [], gold = 0 }) {
    const router = useRouter();
    const [equipped, setEquipped] = useState(() => ({ ...current }));
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const ownedSet = new Set(owned);
    const previewUrl = useMemo(() => avatarImageUrl(avatarConfig, equipped), [avatarConfig, equipped]);

    async function commit(slot, nextId) {
        if (busy) return;
        const prev = equipped;
        setEquipped({ ...equipped, [slot]: nextId });
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/avatar-cosmetic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slot, id: nextId }) });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || "Could not equip that.");
            router.refresh();
        } catch (e) {
            setEquipped(prev);
            setErr(e?.message || "Could not equip that.");
        } finally { setBusy(false); }
    }

    async function buy(id) {
        if (busy) return;
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/cosmetic-shop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: "cosmetic", ref: id }) });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error === "not_enough_gold" ? "Not enough gold." : (d?.error || "Couldn't buy that."));
            router.refresh();
        } catch (e) {
            setErr(e?.message || "Couldn't buy that.");
        } finally { setBusy(false); }
    }

    return (
        <div className="cos-picker">
            <div className="cos-preview">
                <AvatarStack avatarUrl={previewUrl} initial={initial} size={120} cosmetics={equipped} />
            </div>
            <div className="cos-slots">
                {COSMETIC_SLOTS.map((slot) => {
                    const items = cosmeticsForSlotWithLock(slot, level, { badges, unlockAll, owned: ownedSet });
                    return (
                        <div className="cos-slot" key={slot}>
                            <span className="cos-slot-label">{SLOT_LABELS[slot]}</span>
                            <div className="cos-chips">
                                <button
                                    type="button"
                                    className={`cos-chip${!equipped[slot] ? " is-selected" : ""}`}
                                    disabled={busy}
                                    onClick={() => commit(slot, null)}
                                    aria-pressed={!equipped[slot]}
                                    title="None"
                                >
                                    None
                                </button>
                                {items.map((c) => {
                                    const forSale = !c.unlocked && !c.requiresBadges;
                                    const price = forSale ? cosmeticPrice("cosmetic", c.level) : 0;
                                    const canAfford = gold >= price;
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            className={`cos-chip${equipped[slot] === c.id ? " is-selected" : ""}${!c.unlocked ? " is-locked" : ""}`}
                                            disabled={busy || (!c.unlocked && !forSale)}
                                            onClick={() => (c.unlocked ? commit(slot, equipped[slot] === c.id ? null : c.id) : (forSale ? (canAfford ? buy(c.id) : router.push("/marketplace/credit")) : null))}
                                            aria-pressed={equipped[slot] === c.id}
                                            title={c.unlocked ? `${c.label} — ${c.hint}` : (forSale ? (canAfford ? `Buy for ${price.toLocaleString()} gold` : "Get more coins") : `Unlocks at Level ${c.level}`)}
                                        >
                                            <span aria-hidden="true">{c.icon}</span> {c.label}
                                            {!c.unlocked ? <span className="cos-chip-lock"> · {forSale ? (canAfford ? `💰 ${price.toLocaleString()}` : `💰 ${price.toLocaleString()} · ＋ coins`) : `Lv ${c.level}`}</span> : null}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
            {err ? <p className="shop-payment-error" style={{ marginTop: 8 }}>{err}</p> : null}
        </div>
    );
}
