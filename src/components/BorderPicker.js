"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { bordersForLevel } from "@/lib/marketplace/borders.js";

// Lets a member equip a cosmetic avatar border they've unlocked. Each swatch previews the frame on
// THEIR avatar. Equipping POSTs to /api/marketplace/border then router.refresh() so the hero (and
// every server-rendered avatar) picks up the change. Locked frames show their unlock level.
export default function BorderPicker({ current = "none", level = 1, avatarUrl = null, displayLabel = "", unlockAll = false }) {
    const router = useRouter();
    const [equipped, setEquipped] = useState(current || "none");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const borders = bordersForLevel(level, unlockAll);
    const initial = (displayLabel || "?").slice(0, 1).toUpperCase();

    async function equip(id, unlocked) {
        if (!unlocked || busy || id === equipped) return;
        const prev = equipped;
        setEquipped(id); // optimistic
        setBusy(true);
        setErr("");
        try {
            const r = await fetch("/api/marketplace/border", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ border: id }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || "Could not equip that border.");
            router.refresh();
        } catch (e) {
            setEquipped(prev);
            setErr(e?.message || "Could not equip that border.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="border-picker">
            <div className="border-swatches">
                {borders.map((b) => {
                    const isSel = equipped === b.id;
                    return (
                        <button
                            key={b.id}
                            type="button"
                            disabled={!b.unlocked || busy}
                            className={`border-swatch${isSel ? " is-selected" : ""}${!b.unlocked ? " is-locked" : ""}`}
                            onClick={() => equip(b.id, b.unlocked)}
                            aria-pressed={isSel}
                            title={b.unlocked ? b.label : `Unlocks at Level ${b.level}`}
                        >
                            <span className={`border-swatch-av${b.id !== "none" ? ` av-border av-border-${b.id}` : ""}`}>
                                {avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={avatarUrl} alt="" />
                                ) : (
                                    <span aria-hidden="true">{initial}</span>
                                )}
                                {!b.unlocked ? <span className="border-swatch-lock" aria-hidden="true">🔒</span> : null}
                            </span>
                            <span className="border-swatch-label">{b.label}</span>
                            <span className="border-swatch-sub muted">{b.unlocked ? (isSel ? "Equipped ✓" : b.hint) : `Lv ${b.level}`}</span>
                        </button>
                    );
                })}
            </div>
            {err ? <p className="shop-payment-error" style={{ marginTop: 8 }}>{err}</p> : null}
        </div>
    );
}
