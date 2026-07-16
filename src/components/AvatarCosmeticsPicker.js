"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import AvatarStack from "@/components/AvatarStack";
import { avatarImageUrl, COSMETIC_SLOTS, cosmeticsForSlotWithLock } from "@/lib/marketplace/avatar-cosmetics.js";

const SLOT_LABELS = { headwear: "Headwear", aura: "Aura" };

// Equip avatar cosmetics per slot onto the member's portrait, with a live preview. Native cosmetics
// (hats) are drawn into the avatar image; auras layer on via AvatarStack. POSTs each change.
export default function AvatarCosmeticsPicker({ avatarConfig = null, initial = "?", level = 1, unlockAll = false, badges = [], current = {} }) {
    const router = useRouter();
    const [equipped, setEquipped] = useState(() => ({ ...current }));
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const previewUrl = useMemo(() => avatarImageUrl(avatarConfig, equipped), [avatarConfig, equipped]);

    async function commit(slot, nextId) {
        if (busy) return;
        const prev = equipped;
        setEquipped({ ...equipped, [slot]: nextId });
        setBusy(true);
        setErr("");
        try {
            const r = await fetch("/api/marketplace/avatar-cosmetic", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ slot, id: nextId }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || "Could not equip that.");
            router.refresh();
        } catch (e) {
            setEquipped(prev);
            setErr(e?.message || "Could not equip that.");
        } finally {
            setBusy(false);
        }
    }

    // Tapping the equipped item again removes it; tapping "None" clears the slot.
    function choose(slot, id, unlocked) {
        if (!unlocked) return;
        commit(slot, equipped[slot] === id ? null : id);
    }

    return (
        <div className="cos-picker">
            <div className="cos-preview">
                <AvatarStack avatarUrl={previewUrl} initial={initial} size={120} cosmetics={equipped} />
            </div>
            <div className="cos-slots">
                {COSMETIC_SLOTS.map((slot) => {
                    const items = cosmeticsForSlotWithLock(slot, level, { badges, unlockAll });
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
                                {items.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        className={`cos-chip${equipped[slot] === c.id ? " is-selected" : ""}${!c.unlocked ? " is-locked" : ""}`}
                                        disabled={busy || !c.unlocked}
                                        onClick={() => choose(slot, c.id, c.unlocked)}
                                        aria-pressed={equipped[slot] === c.id}
                                        title={c.unlocked ? `${c.label} — ${c.hint}` : `Unlocks at Level ${c.level}`}
                                    >
                                        <span aria-hidden="true">{c.icon}</span> {c.label}
                                        {!c.unlocked ? <span className="cos-chip-lock"> · Lv {c.level}</span> : null}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
            {err ? <p className="shop-payment-error" style={{ marginTop: 8 }}>{err}</p> : null}
        </div>
    );
}
