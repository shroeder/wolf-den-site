"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import BadgeArt from "@/components/BadgeArt";

const MAX = 3;

// Lets a member choose which badges (up to 3) show on their card. The top-ranked of the chosen set
// silently becomes the folder tab. No "auto" control — picking none just falls back to their top few.
// POSTs the chosen slugs to /api/marketplace/showcase-badges then refreshes so the card updates.
export default function ShowcaseBadgePicker({ badges = [], current = [] }) {
    const router = useRouter();
    const [chosen, setChosen] = useState(() => new Set(current || []));
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    if (!badges.length) {
        return <p className="muted" style={{ marginTop: 0 }}>Earn some badges and you can choose which show on your card.</p>;
    }

    async function toggle(slug) {
        if (busy) return;
        const next = new Set(chosen);
        if (next.has(slug)) {
            next.delete(slug);
        } else {
            if (next.size >= MAX) return; // at the cap — deselect one first
            next.add(slug);
        }
        const prev = chosen;
        setChosen(next);
        setBusy(true);
        setErr("");
        try {
            // Persist in the badges' own rank order so the tab (first) is deterministic.
            const ordered = badges.filter((b) => next.has(b.slug)).map((b) => b.slug);
            const r = await fetch("/api/marketplace/showcase-badges", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ slugs: ordered }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || "Could not update your badges.");
            router.refresh();
        } catch (e) {
            setChosen(prev);
            setErr(e?.message || "Could not update your badges.");
        } finally {
            setBusy(false);
        }
    }

    const atCap = chosen.size >= MAX;

    return (
        <div className="feat-badge-picker">
            <div className="feat-badge-chips">
                {badges.map((b) => {
                    const isSel = chosen.has(b.slug);
                    return (
                        <button
                            key={b.slug}
                            type="button"
                            disabled={busy || (!isSel && atCap)}
                            className={`feat-badge-chip${isSel ? " is-selected" : ""}`}
                            style={{ "--chip-color": b.color || "#c8a24a" }}
                            onClick={() => toggle(b.slug)}
                            aria-pressed={isSel}
                            title={b.label}
                        >
                            <BadgeArt slug={b.slug} icon={b.icon || "🏅"} /> {b.label}
                        </button>
                    );
                })}
            </div>
            <p className="muted" style={{ marginTop: 8, fontSize: "0.78rem" }}>
                {chosen.size ? `Showing ${chosen.size} of ${MAX} — the top one is your card tab.` : `Pick up to ${MAX}. Leave empty to show your top badges automatically.`}
            </p>
            {err ? <p className="shop-payment-error" style={{ marginTop: 4 }}>{err}</p> : null}
        </div>
    );
}
