"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { framesForLevel } from "@/lib/marketplace/frames.js";
import { cosmeticPrice } from "@/lib/marketplace/cosmetic-price.js";

// Equip a frame you've unlocked — or BUY a locked one early with gold (tap it). Role frames stay
// badge-gated (not for sale).
export default function FramePicker({ current = "none", level = 1, unlockAll = false, badges = [], owned = [], gold = 0 }) {
    const router = useRouter();
    const [equipped, setEquipped] = useState(current || "none");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const ownedSet = new Set(owned);
    const frames = framesForLevel(level, { unlockAll, badges, owned: ownedSet });

    async function equip(id) {
        if (busy || id === equipped) return;
        const prev = equipped;
        setEquipped(id);
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/frame", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ frame: id }) });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || "Could not equip that frame.");
            router.refresh();
        } catch (e) {
            setEquipped(prev);
            setErr(e?.message || "Could not equip that frame.");
        } finally { setBusy(false); }
    }

    async function buy(id) {
        if (busy) return;
        setBusy(true); setErr("");
        try {
            const r = await fetch("/api/marketplace/cosmetic-shop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: "frame", ref: id }) });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error === "not_enough_gold" ? "Not enough gold." : (d?.error || "Couldn't buy that frame."));
            router.refresh();
        } catch (e) {
            setErr(e?.message || "Couldn't buy that frame.");
        } finally { setBusy(false); }
    }

    return (
        <div className="bg-picker">
            <div className="bg-swatches">
                {frames.map((f) => {
                    const isSel = equipped === f.id;
                    const forSale = !f.unlocked && !f.requiresBadges && f.id !== "none";
                    const price = forSale ? cosmeticPrice("frame", f.level) : 0;
                    const canAfford = gold >= price;
                    return (
                        <button
                            key={f.id}
                            type="button"
                            disabled={busy || (!f.unlocked && !forSale)}
                            className={`bg-swatch${isSel ? " is-selected" : ""}${!f.unlocked ? " is-locked" : ""}`}
                            onClick={() => (f.unlocked ? equip(f.id) : (forSale ? (canAfford ? buy(f.id) : router.push("/marketplace/credit")) : null))}
                            aria-pressed={isSel}
                            title={f.unlocked ? f.label : (forSale ? (canAfford ? `Buy for ${price.toLocaleString()} gold` : "Get more coins") : `Unlocks at Level ${f.level}`)}
                        >
                            <span className={`bg-swatch-scene frame-swatch${f.id !== "none" ? ` frame frame-${f.id}` : ""}`}>
                                <span className="frame-swatch-mark" aria-hidden="true">{f.icon}</span>
                                {!f.unlocked ? <span className="bg-swatch-lock" aria-hidden="true">{forSale ? "💰" : "🔒"}</span> : null}
                            </span>
                            <span className="bg-swatch-label">{f.label}</span>
                            <span className="bg-swatch-sub muted">
                                {f.unlocked ? (isSel ? "Equipped ✓" : f.hint) : (f.requiresBadges ? f.lockLabel : (forSale ? (canAfford ? `💰 ${price.toLocaleString()}` : `💰 ${price.toLocaleString()} · ＋ coins`) : `Lv ${f.level}`))}
                            </span>
                        </button>
                    );
                })}
            </div>
            {err ? <p className="shop-payment-error" style={{ marginTop: 8 }}>{err}</p> : null}
        </div>
    );
}
