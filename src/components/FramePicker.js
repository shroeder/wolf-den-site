"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { framesForLevel } from "@/lib/marketplace/frames.js";

// Lets a member equip a cosmetic profile frame they've unlocked. Each swatch previews the inset frame
// on a mini card. Equipping POSTs to /api/marketplace/frame then router.refresh() so the hero re-renders.
export default function FramePicker({ current = "none", level = 1, unlockAll = false }) {
    const router = useRouter();
    const [equipped, setEquipped] = useState(current || "none");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const frames = framesForLevel(level, { unlockAll });

    async function equip(id, unlocked) {
        if (!unlocked || busy || id === equipped) return;
        const prev = equipped;
        setEquipped(id);
        setBusy(true);
        setErr("");
        try {
            const r = await fetch("/api/marketplace/frame", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ frame: id }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || "Could not equip that frame.");
            router.refresh();
        } catch (e) {
            setEquipped(prev);
            setErr(e?.message || "Could not equip that frame.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="bg-picker">
            <div className="bg-swatches">
                {frames.map((f) => {
                    const isSel = equipped === f.id;
                    return (
                        <button
                            key={f.id}
                            type="button"
                            disabled={!f.unlocked || busy}
                            className={`bg-swatch${isSel ? " is-selected" : ""}${!f.unlocked ? " is-locked" : ""}`}
                            onClick={() => equip(f.id, f.unlocked)}
                            aria-pressed={isSel}
                            title={f.unlocked ? f.label : `Unlocks at Level ${f.level}`}
                        >
                            <span className={`bg-swatch-scene frame-swatch${f.id !== "none" ? ` frame frame-${f.id}` : ""}`}>
                                <span className="frame-swatch-mark" aria-hidden="true">{f.icon}</span>
                                {!f.unlocked ? <span className="bg-swatch-lock" aria-hidden="true">🔒</span> : null}
                            </span>
                            <span className="bg-swatch-label">{f.label}</span>
                            <span className="bg-swatch-sub muted">{f.unlocked ? (isSel ? "Equipped ✓" : f.hint) : `Lv ${f.level}`}</span>
                        </button>
                    );
                })}
            </div>
            {err ? <p className="shop-payment-error" style={{ marginTop: 8 }}>{err}</p> : null}
        </div>
    );
}
