"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Lets a member choose their PRIMARY badge — the one shown as the folder tab on their card. Lists the
// badges they hold as selectable chips (+ an "Auto" option that falls back to their top-ranked badge).
// POSTs to /api/marketplace/featured-badge then refreshes so the tab updates.
export default function FeaturedBadgePicker({ badges = [], current = null }) {
    const router = useRouter();
    const [selected, setSelected] = useState(current || null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    if (!badges.length) {
        return <p className="muted" style={{ marginTop: 0 }}>Earn a badge and you can pin one here as your card&apos;s tab.</p>;
    }

    async function choose(slug) {
        if (busy || slug === selected) return;
        const prev = selected;
        setSelected(slug);
        setBusy(true);
        setErr("");
        try {
            const r = await fetch("/api/marketplace/featured-badge", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ slug }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || "Could not set your primary badge.");
            router.refresh();
        } catch (e) {
            setSelected(prev);
            setErr(e?.message || "Could not set your primary badge.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="feat-badge-picker">
            <div className="feat-badge-chips">
                <button
                    type="button"
                    disabled={busy}
                    className={`feat-badge-chip${!selected ? " is-selected" : ""}`}
                    onClick={() => choose(null)}
                    aria-pressed={!selected}
                    title="Automatically use your top-ranked badge"
                >
                    ✨ Auto
                </button>
                {badges.map((b) => {
                    const isSel = selected === b.slug;
                    return (
                        <button
                            key={b.slug}
                            type="button"
                            disabled={busy}
                            className={`feat-badge-chip${isSel ? " is-selected" : ""}`}
                            style={{ "--chip-color": b.color || "#c8a24a" }}
                            onClick={() => choose(b.slug)}
                            aria-pressed={isSel}
                            title={b.label}
                        >
                            <span aria-hidden="true">{b.icon || "🏅"}</span> {b.label}
                        </button>
                    );
                })}
            </div>
            {err ? <p className="shop-payment-error" style={{ marginTop: 8 }}>{err}</p> : null}
        </div>
    );
}
