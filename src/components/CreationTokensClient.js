"use client";

import { useEffect, useRef, useState } from "react";

import { coinBonusPct } from "@/lib/marketplace/creation-tokens.js";

// Buy CREATIONS — a creation you spend in the "Make your own" flow to design your own AI art
// (yours forever, non-tradeable). A purchase grants CREATIONS + COINS, never store credit. Purple/pink theme,
// continuing the "Make your own" palette. Card capture uses the Square Web Payments SDK, same as store credit,
// and the actual charge is DARK behind PAYMENTS_ENABLED. The owner can self-grant a tier for testing.
// (The underlying balance field is custom_deco_credits; "Creations" is display-only wording.)

const PURPLE = "#c9a2ff";
const PURPLE_DEEP = "#a56be8";
const PINK = "#ff9ec2";
const PINK_DEEP = "#e0559a";

function usd(cents) {
    return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
}

// Minimal Square Web Payments SDK loader (mirrors the store-credit client's).
function loadSquare() {
    if (typeof window === "undefined") return Promise.resolve(null);
    if (window.Square) return Promise.resolve(window.Square);
    const existing = document.querySelector('script[data-square-payments="1"]');
    if (existing) {
        return new Promise((resolve, reject) => {
            existing.addEventListener("load", () => (window.Square ? resolve(window.Square) : reject(new Error("Square SDK unavailable."))), { once: true });
            existing.addEventListener("error", () => reject(new Error("Failed to load Square.")), { once: true });
        });
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://web.squarecdn.com/v1/square.js";
        script.async = true;
        script.dataset.squarePayments = "1";
        script.onload = () => (window.Square ? resolve(window.Square) : reject(new Error("Square SDK unavailable.")));
        script.onerror = () => reject(new Error("Failed to load Square."));
        document.head.appendChild(script);
    });
}

export default function CreationTokensClient({
    paymentsEnabled,
    squareApplicationId,
    squareLocationId,
    tiers = [],
    initialTokenBalance = 0,
    isOwner = false,
}) {
    const [tokenBalance, setTokenBalance] = useState(initialTokenBalance);
    const [selectedId, setSelectedId] = useState(tiers.find((t) => t.popular)?.id || tiers[0]?.id || null);
    const [cardState, setCardState] = useState("idle"); // idle | loading | ready | error
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [done, setDone] = useState(null); // { tokens, coins, owner }
    const cardRef = useRef(null);

    const selected = tiers.find((t) => t.id === selectedId) || null;
    const missingSquareConfig = !squareApplicationId || !squareLocationId;
    const canCharge = paymentsEnabled && !missingSquareConfig;

    // Mount the Square card field once payments are usable.
    useEffect(() => {
        if (!canCharge) return undefined;
        let disposed = false;
        let mounted = null;
        (async () => {
            try {
                setCardState("loading");
                const Square = await loadSquare();
                if (disposed) return;
                const payments = Square?.payments?.(squareApplicationId, squareLocationId);
                if (!payments) throw new Error("Square did not initialize.");
                const node = document.getElementById("creation-card");
                if (node) node.innerHTML = "";
                const card = await payments.card({
                    style: {
                        input: { backgroundColor: "#1b1226", color: "#f3e9ff", fontFamily: "inherit", fontSize: "16px" },
                        "input::placeholder": { color: "#a892c4" },
                        ".input-container": { borderColor: "#4a2f6e", borderRadius: "10px" },
                        ".input-container.is-focus": { borderColor: PURPLE },
                        ".input-container.is-error": { borderColor: "#ff6b5e" },
                        ".message-text": { color: "#ffb0a0" },
                        ".message-icon": { color: "#ffb0a0" },
                        ".message-text.is-error": { color: "#ff6b5e" },
                        ".message-icon.is-error": { color: "#ff6b5e" },
                    },
                });
                mounted = card;
                await card.attach("#creation-card");
                if (disposed) { await card.destroy().catch(() => {}); return; }
                cardRef.current = card;
                setCardState("ready");
            } catch (e) {
                if (disposed) return;
                setCardState("error");
                setErr(`Secure card form couldn't load: ${e?.message || "unknown error"}.`);
            }
        })();
        return () => { disposed = true; if (mounted?.destroy) mounted.destroy().catch(() => {}); cardRef.current = null; };
    }, [canCharge, squareApplicationId, squareLocationId]);

    async function buy() {
        setErr(""); setDone(null);
        if (!selected) { setErr("Pick a creation bundle."); return; }
        if (!cardRef.current) { setErr("Card form isn't ready yet."); return; }
        setBusy(true);
        try {
            const tokenized = await cardRef.current.tokenize();
            if (tokenized?.status !== "OK" || !tokenized.token) throw new Error("Card details were not accepted.");
            const res = await fetch("/api/marketplace/creations/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sourceId: tokenized.token, tierId: selected.id }),
            });
            const d = await res.json().catch(() => null);
            if (!res.ok || !d?.ok) throw new Error(d?.error || "Purchase failed.");
            if (typeof d.tokenBalance === "number") setTokenBalance(d.tokenBalance);
            setDone({ tokens: d.tokens, coins: d.coins, owner: false });
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Purchase failed.");
        } finally {
            setBusy(false);
        }
    }

    // Owner-only: grant the selected tier's contents with no charge, for testing.
    async function ownerGrant() {
        setErr(""); setDone(null);
        if (!selected) return;
        setBusy(true);
        try {
            const res = await fetch("/api/marketplace/creations/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tierId: selected.id, grant: true }),
            });
            const d = await res.json().catch(() => null);
            if (!res.ok || !d?.ok) throw new Error(d?.error || "Grant failed.");
            if (typeof d.tokenBalance === "number") setTokenBalance(d.tokenBalance);
            setDone({ tokens: d.tokens, coins: d.coins, owner: true });
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Grant failed.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <section className="card" style={{ position: "relative", overflow: "hidden", background: "linear-gradient(160deg, rgba(165,107,232,0.22), rgba(224,85,154,0.12))", border: "1px solid rgba(201,162,255,0.4)" }}>
                <div aria-hidden="true" style={{ position: "absolute", top: -60, right: -40, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,158,194,0.35), transparent 70%)", pointerEvents: "none" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span aria-hidden="true" style={{ fontSize: "2.2rem", filter: "drop-shadow(0 2px 8px rgba(224,85,154,0.5))" }}>🎨</span>
                    <div>
                        <h1 style={{ margin: 0, fontSize: "1.5rem", color: PURPLE, letterSpacing: "0.2px" }}>Creations</h1>
                        <p className="muted" style={{ margin: "2px 0 0" }}>Spend a creation to <strong style={{ color: PINK }}>design your own AI art</strong> — describe it, our pipeline draws it, and it&apos;s <em>yours forever</em>.</p>
                    </div>
                </div>
                <div style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 12, background: "rgba(0,0,0,0.28)", border: "1px solid rgba(201,162,255,0.4)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                    <span className="muted" style={{ fontSize: 13 }}>Your creations</span>
                    <strong style={{ fontSize: "1.35rem", color: PURPLE }}>🎨 {tokenBalance.toLocaleString()}</strong>
                </div>
                <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12.5 }}>
                    <span style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(201,162,255,0.16)", color: "#e7d4ff", fontWeight: 700 }}>🎨 Creations + 🪙 coins in one buy</span>
                    <span style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(255,158,194,0.16)", color: "#ffd6e7", fontWeight: 700 }}>♾️ Yours forever</span>
                    <span style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(201,162,255,0.16)", color: "#e7d4ff", fontWeight: 700 }}>🔒 Personal & non-tradeable</span>
                </div>
            </section>

            {done ? (
                <section className="card" style={{ textAlign: "center", border: "1px solid rgba(201,162,255,0.45)" }}>
                    <div style={{ fontSize: "2rem" }}>🎉</div>
                    <h2 style={{ margin: "4px 0", color: PURPLE }}>{done.owner ? "Granted" : "Purchased"} {done.tokens} creation{done.tokens === 1 ? "" : "s"}!</h2>
                    <p className="muted" style={{ marginTop: 0 }}>+{done.coins.toLocaleString()} 🪙 coins dropped into your wallet. You now have <strong style={{ color: PURPLE }}>🎨 {tokenBalance.toLocaleString()}</strong> creations.</p>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                        <button className="pill" onClick={() => setDone(null)}>Buy more</button>
                        <a className="pill" href="/marketplace/farm" style={{ textDecoration: "none" }}>Go make one →</a>
                    </div>
                </section>
            ) : (
                <section className="card">
                    <h2 style={{ marginTop: 0 }}>Pick a bundle</h2>
                    <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Bigger bundles are a better deal — more creations and more coins per dollar.</p>
                    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                        {tiers.map((t) => {
                            const active = t.id === selectedId;
                            const bonus = coinBonusPct(t);
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setSelectedId(t.id)}
                                    style={{
                                        position: "relative",
                                        textAlign: "left",
                                        padding: "14px 12px 12px",
                                        borderRadius: 14,
                                        cursor: "pointer",
                                        border: `2px solid ${active ? PURPLE : "rgba(201,162,255,0.28)"}`,
                                        background: active ? "linear-gradient(180deg, rgba(201,162,255,0.22), rgba(224,85,154,0.14))" : "rgba(255,255,255,0.03)",
                                        boxShadow: active ? "0 4px 18px rgba(165,107,232,0.35)" : "none",
                                        WebkitTapHighlightColor: "transparent",
                                    }}
                                >
                                    {t.bestValue ? <span style={badgeStyle(PINK_DEEP, PINK)}>★ Best value</span> : t.popular ? <span style={badgeStyle(PURPLE_DEEP, PURPLE)}>★ Popular</span> : bonus > 0 ? <span style={badgeStyle(PURPLE_DEEP, PURPLE)}>+{bonus}% coins</span> : null}
                                    <div style={{ fontSize: "1.3rem", fontWeight: 900, color: active ? PURPLE : "#f6efff" }}>{usd(t.priceCents)}</div>
                                    <div style={{ marginTop: 6, fontWeight: 800, color: "#efe3ff" }}>🎨 {t.tokens} creations</div>
                                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#ffd6e7" }}>🪙 +{t.coins.toLocaleString()} coins</div>
                                    {bonus > 0 && !t.bestValue && !t.popular ? null : bonus > 0 ? <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>+{bonus}% coins vs. base</div> : <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Base bundle</div>}
                                </button>
                            );
                        })}
                    </div>

                    {selected ? (
                        <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "rgba(201,162,255,0.08)", border: "1px solid rgba(201,162,255,0.25)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span className="muted">Creations</span><strong style={{ color: PURPLE }}>🎨 {selected.tokens}</strong></div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginTop: 4 }}><span className="muted">Coins</span><strong style={{ color: PINK }}>🪙 {selected.coins.toLocaleString()}</strong></div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(201,162,255,0.2)" }}><span style={{ fontWeight: 800, color: "#f6efff" }}>You pay</span><strong style={{ color: "#ffffff" }}>{usd(selected.priceCents)}</strong></div>
                        </div>
                    ) : null}

                    {!paymentsEnabled ? (
                        <p className="muted" style={{ marginTop: 14 }}>Online purchases are currently unavailable. Check back soon to stock up on creations.</p>
                    ) : missingSquareConfig ? (
                        <p className="muted" style={{ marginTop: 14 }}>Card payments aren&apos;t configured yet.</p>
                    ) : (
                        <>
                            <div id="creation-card" style={{ marginTop: 14, minHeight: 44 }} />
                            {cardState === "loading" ? <p className="muted">Loading secure card form…</p> : null}
                            <button
                                onClick={buy}
                                disabled={busy || cardState !== "ready" || !selected}
                                style={{ marginTop: 12, width: "100%", padding: 13, fontWeight: 900, border: "none", borderRadius: 12, cursor: busy ? "default" : "pointer", color: "#2a0f45", background: `linear-gradient(180deg, ${PURPLE}, ${PURPLE_DEEP})`, boxShadow: "0 3px 0 #7d47c0", opacity: busy || cardState !== "ready" ? 0.6 : 1 }}
                            >
                                {busy ? "Processing…" : selected ? `Pay ${usd(selected.priceCents)}` : "Pick a bundle"}
                            </button>
                            <p className="muted" style={{ fontSize: "0.75rem", marginTop: 6 }}>Secure checkout by Square. Card charged only on success.</p>
                        </>
                    )}

                    {isOwner ? (
                        <button
                            onClick={ownerGrant}
                            disabled={busy || !selected}
                            style={{ marginTop: 12, width: "100%", padding: 11, fontWeight: 800, borderRadius: 12, cursor: busy ? "default" : "pointer", color: "#efe3ff", background: "rgba(0,0,0,0.25)", border: "1px dashed rgba(201,162,255,0.5)", opacity: busy ? 0.6 : 1 }}
                        >
                            🎁 Grant myself this bundle (owner test — no charge)
                        </button>
                    ) : null}

                    {err ? <p className="form-error" role="alert" style={{ marginTop: 12 }}>{err}</p> : null}
                </section>
            )}

            <section className="card">
                <h2 style={{ marginTop: 0 }}>How creations work</h2>
                <ol className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
                    <li>Open <strong style={{ color: PURPLE }}>Make your own</strong> wherever creations are offered — like your farm decorations.</li>
                    <li>Describe what you want — the pipeline draws it. Not quite right? Add a tweak and it redraws.</li>
                    <li>Pick your favorite. It&apos;s <strong>yours forever</strong> and never tradeable.</li>
                    <li>Each design spends <strong>1 creation</strong>. Coins from your buy are yours to spend anywhere in the game.</li>
                </ol>
            </section>
        </>
    );
}

function badgeStyle(border, text) {
    return {
        position: "absolute",
        top: -9,
        right: 8,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 900,
        color: text,
        background: "#241033",
        border: `1px solid ${border}`,
        whiteSpace: "nowrap",
    };
}
