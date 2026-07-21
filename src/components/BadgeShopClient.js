"use client";

import { useCallback, useEffect, useState } from "react";

import CoinCta from "@/components/CoinCta";

// The gold badge shop — prestige badges you can just buy. Lives on the Badges page.
export default function BadgeShopClient() {
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState("");
    const [msg, setMsg] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/marketplace/badge-shop", { cache: "no-store" });
            if (!res.ok) return;
            setState(await res.json());
        } catch {
            /* ignore — shop just stays hidden */
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function buy(slug, label) {
        if (busy) return;
        setBusy(slug);
        setMsg(null);
        try {
            const res = await fetch("/api/marketplace/badge-shop", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slug }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
                setMsg({ ok: true, text: `Unlocked “${label}”! 🎉` });
                await load();
            } else {
                const errs = {
                    not_enough_gold: "Not enough gold yet.",
                    already_owned: "You already own that one.",
                    not_for_sale: "That badge isn't for sale.",
                };
                setMsg({ ok: false, text: errs[data.error] || "Couldn't buy that right now." });
            }
        } catch {
            setMsg({ ok: false, text: "Couldn't buy that right now." });
        } finally {
            setBusy("");
        }
    }

    const badges = state?.badges || [];
    if (!badges.length) return null;

    return (
        <div>
            <p className="muted" style={{ marginTop: 0 }}>
                Pure flex — spend your gold on a prestige badge. You&apos;ve got <strong>💰 {(state?.gold || 0).toLocaleString()}</strong>.
            </p>
            {msg ? (
                <p className={msg.ok ? "" : "muted"} style={{ marginTop: 0, color: msg.ok ? "var(--accent, #37e0a1)" : undefined }}>{msg.text}</p>
            ) : null}
            <div className="badge-board">
                {badges.map((b) => (
                    <div key={b.slug} className={`badge-tile${b.owned ? " is-earned" : " is-locked"}`} style={b.owned && b.color ? { borderColor: b.color } : undefined}>
                        <span className="badge-tile-icon" style={{ background: b.owned ? b.color || "#333" : undefined }} aria-hidden="true">{b.icon || "🏅"}</span>
                        <span className="badge-tile-label">{b.label}</span>
                        {b.description ? <span className="badge-tile-desc muted">{b.description}</span> : null}
                        {b.owned ? (
                            <span className="badge-tile-status is-earned">Owned ✓</span>
                        ) : b.canAfford ? (
                            <button
                                type="button"
                                className="btn btn-small"
                                disabled={busy === b.slug}
                                onClick={() => buy(b.slug, b.label)}
                                style={{ marginTop: 6 }}
                            >
                                {busy === b.slug ? "Buying…" : `Buy · 💰 ${b.price.toLocaleString()}`}
                            </button>
                        ) : (
                            // Unaffordable → a real CTA to buy coins, not a muted disabled-looking label.
                            <span style={{ marginTop: 6, display: "inline-block" }}><CoinCta price={b.price} /></span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
