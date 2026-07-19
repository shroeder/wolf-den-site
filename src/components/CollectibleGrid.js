"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { collectiblesForLevel } from "@/lib/marketplace/collectibles.js";
import { cosmeticPrice } from "@/lib/marketplace/cosmetic-price.js";

// The member's companions. Unlocked ones show in color and (when selectable) can be featured. Locked ones
// are dimmed with their unlock level — or, when the member can afford it, tapped to BUY early with gold.
export default function CollectibleGrid({ level = 1, unlockAll = false, selectable = false, featuredId = null, unlockedOnly = false, owned = [], gold = 0 }) {
    const router = useRouter();
    const [featured, setFeatured] = useState(featuredId);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const ownedSet = new Set(owned);
    const all = collectiblesForLevel(level, { unlockAll, owned: ownedSet });
    const items = unlockedOnly ? all.filter((i) => i.unlocked) : all;
    const unlocked = all.filter((i) => i.unlocked).length;

    async function feature(item) {
        const next = featured === item.id ? null : item.id; // click featured again to clear
        const prev = featured;
        setFeatured(next);
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/showcase-collectible", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: next }) });
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                setFeatured(prev);
                setErr(d?.error || "Couldn't update.");
            } else {
                router.refresh();
            }
        } catch {
            setFeatured(prev);
            setErr("Couldn't update.");
        } finally { setBusy(false); }
    }

    async function buy(item) {
        if (busy) return;
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/cosmetic-shop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: "pet", ref: item.id }) });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error === "not_enough_gold" ? "Not enough gold." : (d?.error || "Couldn't buy that pet."));
            router.refresh();
        } catch (e) {
            setErr(e?.message || "Couldn't buy that pet.");
        } finally { setBusy(false); }
    }

    function onTap(c, forSale, price) {
        if (busy) return;
        if (c.unlocked) { if (selectable) feature(c); return; }
        if (forSale && gold >= price) buy(c);
    }

    if (unlockedOnly && !items.length) {
        return <p className="muted" style={{ margin: 0 }}>No pets unlocked yet — level up to tame companions.</p>;
    }

    return (
        <div>
            <p className="collectible-count muted">
                🐾 {unlockedOnly ? unlocked : `${unlocked} / ${all.length}`} pets unlocked
                {selectable ? <span> · tap one to set your companion, or buy a locked one with gold</span> : null}
            </p>
            <div className="collectible-grid">
                {items.map((c) => {
                    const Icon = c.Icon;
                    const isFeatured = featured === c.id && c.unlocked;
                    const forSale = !c.unlocked && !unlockedOnly;
                    const price = forSale ? cosmeticPrice("pet", c.level) : 0;
                    const canAfford = gold >= price;
                    const clickable = (selectable && c.unlocked) || (forSale && canAfford);
                    return (
                        <button
                            type="button"
                            key={c.id}
                            onClick={() => onTap(c, forSale, price)}
                            disabled={busy || !clickable}
                            className={`collectible rar-${c.rarity} ${c.unlocked ? "is-unlocked" : "is-locked"}${isFeatured ? " is-featured" : ""}${clickable ? " is-clickable" : ""}`}
                            title={c.unlocked ? `${c.name} — ${c.hint}${selectable ? (isFeatured ? " · featured (tap to remove)" : " · tap to feature") : ""}` : (forSale ? `${c.name} · buy for ${price.toLocaleString()} gold` : `${c.name} · unlocks at Level ${c.level}`)}
                        >
                            <span className="collectible-icon" style={c.unlocked ? { color: c.color } : undefined}>
                                <Icon aria-hidden="true" />
                            </span>
                            <span className="collectible-name">{c.unlocked ? c.name : (forSale ? `🪙 ${price.toLocaleString()}` : `Lv ${c.level}`)}</span>
                            {isFeatured ? <span className="collectible-star" aria-hidden="true">★</span> : null}
                        </button>
                    );
                })}
            </div>
            {err ? <p className="collectible-credit" style={{ color: "#ff6b6b" }}>{err}</p> : null}
            <p className="collectible-credit muted">
                Item art by <a href="https://game-icons.net" target="_blank" rel="noreferrer">game-icons.net</a> (CC BY 3.0)
            </p>
        </div>
    );
}
