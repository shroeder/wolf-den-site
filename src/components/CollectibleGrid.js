"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { collectiblesForLevel } from "@/lib/marketplace/collectibles.js";

// The member's collection: a grid of unlockable vector items (game-icons). Unlocked ones show in color;
// locked ones are dimmed with their unlock level.
//
// selectable: clicking an unlocked item features it on your card + public profile (click the featured one
// again to clear). featuredId marks the current pick. unlockedOnly: render just the earned items as a
// read-only "shelf" (used on public profiles).
export default function CollectibleGrid({ level = 1, unlockAll = false, selectable = false, featuredId = null, unlockedOnly = false }) {
    const router = useRouter();
    const [featured, setFeatured] = useState(featuredId);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const all = collectiblesForLevel(level, { unlockAll });
    const items = unlockedOnly ? all.filter((i) => i.unlocked) : all;
    const unlocked = all.filter((i) => i.unlocked).length;

    async function choose(item) {
        if (!selectable || busy || !item.unlocked) return;
        const next = featured === item.id ? null : item.id; // click the featured one again to clear
        const prev = featured;
        setFeatured(next);
        setBusy(true);
        setErr("");
        try {
            const r = await fetch("/api/marketplace/showcase-collectible", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ id: next }),
            });
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                setFeatured(prev);
                setErr(d?.error || "Couldn't update.");
            } else {
                router.refresh(); // reflect the featured item on the card/hero
            }
        } catch {
            setFeatured(prev);
            setErr("Couldn't update.");
        } finally {
            setBusy(false);
        }
    }

    if (unlockedOnly && !items.length) {
        return <p className="muted" style={{ margin: 0 }}>No pets unlocked yet — level up to tame companions.</p>;
    }

    return (
        <div>
            <p className="collectible-count muted">
                🐾 {unlockedOnly ? unlocked : `${unlocked} / ${all.length}`} pets unlocked
                {selectable ? <span> · tap one to set your companion</span> : null}
            </p>
            <div className="collectible-grid">
                {items.map((c) => {
                    const Icon = c.Icon;
                    const isFeatured = featured === c.id && c.unlocked;
                    const clickable = selectable && c.unlocked;
                    return (
                        <button
                            type="button"
                            key={c.id}
                            onClick={() => choose(c)}
                            disabled={!clickable}
                            className={`collectible rar-${c.rarity} ${c.unlocked ? "is-unlocked" : "is-locked"}${isFeatured ? " is-featured" : ""}${clickable ? " is-clickable" : ""}`}
                            title={c.unlocked ? `${c.name} — ${c.hint}${selectable ? (isFeatured ? " · featured (tap to remove)" : " · tap to feature") : ""}` : `${c.name} · unlocks at Level ${c.level}`}
                        >
                            <span className="collectible-icon" style={c.unlocked ? { color: c.color } : undefined}>
                                <Icon aria-hidden="true" />
                            </span>
                            <span className="collectible-name">{c.unlocked ? c.name : `Lv ${c.level}`}</span>
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
