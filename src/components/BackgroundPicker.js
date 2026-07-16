"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { backgroundsForLevel } from "@/lib/marketplace/backgrounds.js";

// Lets a member equip a cosmetic profile background they've unlocked. Each swatch previews the scene.
// Equipping POSTs to /api/marketplace/background then router.refresh() so the hero re-renders.
export default function BackgroundPicker({ current = "none", level = 1, unlockAll = false }) {
    const router = useRouter();
    const [equipped, setEquipped] = useState(current || "none");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const backgrounds = backgroundsForLevel(level, { unlockAll });

    async function equip(id, unlocked) {
        if (!unlocked || busy || id === equipped) return;
        const prev = equipped;
        setEquipped(id);
        setBusy(true);
        setErr("");
        try {
            const r = await fetch("/api/marketplace/background", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ background: id }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || "Could not equip that background.");
            router.refresh();
        } catch (e) {
            setEquipped(prev);
            setErr(e?.message || "Could not equip that background.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="bg-picker">
            <div className="bg-swatches">
                {backgrounds.map((b) => {
                    const isSel = equipped === b.id;
                    return (
                        <button
                            key={b.id}
                            type="button"
                            disabled={!b.unlocked || busy}
                            className={`bg-swatch${isSel ? " is-selected" : ""}${!b.unlocked ? " is-locked" : ""}`}
                            onClick={() => equip(b.id, b.unlocked)}
                            aria-pressed={isSel}
                            title={b.unlocked ? b.label : `Unlocks at Level ${b.level}`}
                        >
                            <span className={`bg-swatch-scene${b.id !== "none" ? ` bg-scene bg-${b.id}` : ""}`}>
                                {!b.unlocked ? <span className="bg-swatch-lock" aria-hidden="true">🔒</span> : null}
                            </span>
                            <span className="bg-swatch-label">{b.label}</span>
                            <span className="bg-swatch-sub muted">{b.unlocked ? (isSel ? "Equipped ✓" : b.hint) : `Lv ${b.level}`}</span>
                        </button>
                    );
                })}
            </div>
            {err ? <p className="shop-payment-error" style={{ marginTop: 8 }}>{err}</p> : null}
        </div>
    );
}
