"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { redeemUrl } from "@/lib/marketplace/redeem-link";
import PackageCard from "@/components/PackageCard";

// Buy store credit (real dollars on your account) with a card, and spend it in-store via a QR staff scan.
// $1 = 200 coins on top of the credit. Card capture uses the Square Web Payments SDK, same as shop checkout.

const PRESETS_CENTS = [500, 1000, 2500, 5000, 10000];

function usd(cents) {
    return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
}

// Minimal Square Web Payments SDK loader (mirrors the shop cart's, trimmed).
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

const reasonLabel = {
    purchase: "Added credit",
    spend_store: "Spent in store",
    spend_online: "Spent online",
    refund: "Refund",
    adjust: "Adjustment",
};

export default function StoreCreditClient({
    paymentsEnabled,
    squareApplicationId,
    squareLocationId,
    initialBalanceCents = 0,
    initialEvents = [],
    coinsPerCent = 2,
    feeRate = 0.035,
    minCents = 500,
    maxCents = 50000,
    coinBonus = 0,
    offers = [],
}) {
    const [balanceCents, setBalanceCents] = useState(initialBalanceCents);
    const [events, setEvents] = useState(initialEvents);
    const [amountCents, setAmountCents] = useState(1000);
    const [customDollars, setCustomDollars] = useState("");
    const [cardState, setCardState] = useState("idle"); // idle | loading | ready | error
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [done, setDone] = useState(null); // { amountCents, coins }
    // The selected package, or null for an ordinary credit load. A package fixes the amount and the coin line,
    // so everything derived below reads off it when one is chosen.
    const [pkgId, setPkgId] = useState(null);
    const cardRef = useRef(null);

    // In-store spend QR.
    const [claim, setClaim] = useState(null); // { qr, expiresAt }
    const [claimBusy, setClaimBusy] = useState(false);

    const missingSquareConfig = !squareApplicationId || !squareLocationId;
    const pkg = pkgId ? offers.find((o) => o.id === pkgId) || null : null;
    // A package is a credit load with a fixed price and a better coin line — so the fee, the charge and the
    // coins all come off the package when one is selected, and off the slider when one is not.
    const payCents = pkg ? pkg.priceCents : amountCents;
    const feeCents = Math.round(payCents * feeRate);
    const chargedCents = payCents + feeCents;
    const baseCoins = pkg ? pkg.coins : payCents * coinsPerCent;
    const bonusCoins = Math.round(baseCoins * coinBonus); // guaranteed bonus from equipped credit gear
    const coins = baseCoins + bonusCoins;

    // Mount the Square card field once payments are usable.
    useEffect(() => {
        if (!paymentsEnabled || missingSquareConfig) return undefined;
        let disposed = false;
        let mounted = null;
        (async () => {
            try {
                setCardState("loading");
                const Square = await loadSquare();
                if (disposed) return;
                const payments = Square?.payments?.(squareApplicationId, squareLocationId);
                if (!payments) throw new Error("Square did not initialize.");
                const node = document.getElementById("credit-card");
                if (node) node.innerHTML = "";
                // Dark-theme the Square card iframe so it doesn't render as a jarring white block. The key is
                // the INPUT backgroundColor — without it Square leaves the fields white regardless of text color.
                const card = await payments.card({
                    style: {
                        // input.backgroundColor is what actually fills the fields dark (per Square's docs);
                        // .input-container only accepts border props.
                        input: { backgroundColor: "#15161c", color: "#f5ead2", fontFamily: "inherit", fontSize: "16px" },
                        "input::placeholder": { color: "#8a8272" },
                        ".input-container": { borderColor: "#4a3f1f", borderRadius: "10px" },
                        ".input-container.is-focus": { borderColor: "#ffd75e" },
                        ".input-container.is-error": { borderColor: "#ff6b5e" },
                        ".message-text": { color: "#ffb0a0" },
                        ".message-icon": { color: "#ffb0a0" },
                        ".message-text.is-error": { color: "#ff6b5e" },
                        ".message-icon.is-error": { color: "#ff6b5e" },
                    },
                });
                mounted = card;
                await card.attach("#credit-card");
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
    }, [paymentsEnabled, missingSquareConfig, squareApplicationId, squareLocationId]);

    async function refresh() {
        const r = await fetch("/api/marketplace/credit", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
        if (r && typeof r.balanceCents === "number") { setBalanceCents(r.balanceCents); setEvents(r.events || []); }
    }

    function pickPreset(cents) { setAmountCents(cents); setCustomDollars(""); setPkgId(null); }
    function onCustom(v) {
        setCustomDollars(v);
        setPkgId(null);
        const dollars = Math.floor(Number(v) || 0);
        if (dollars > 0) setAmountCents(Math.min(maxCents, Math.max(0, dollars * 100)));
    }

    async function buy() {
        setErr(""); setDone(null);
        if (!pkg && amountCents < minCents) { setErr(`Minimum is ${usd(minCents)}.`); return; }
        if (!pkg && amountCents > maxCents) { setErr(`Maximum is ${usd(maxCents)}.`); return; }
        if (!cardRef.current) { setErr("Card form isn't ready yet."); return; }
        setBusy(true);
        try {
            const tokenized = await cardRef.current.tokenize();
            if (tokenized?.status !== "OK" || !tokenized.token) throw new Error("Card details were not accepted.");
            const res = await fetch("/api/marketplace/credit/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(pkg ? { sourceId: tokenized.token, packageId: pkg.id } : { sourceId: tokenized.token, amountCents }),
            });
            const d = await res.json().catch(() => null);
            if (!res.ok || !d?.ok) throw new Error(d?.error || "Purchase failed.");
            setBalanceCents(d.balanceCents ?? balanceCents + payCents);
            setDone({ amountCents: d.amountCents, coins: d.coins, bonusCoins: d.bonusCoins || 0 });
            refresh();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Purchase failed.");
        } finally {
            setBusy(false);
        }
    }

    async function showInStoreQr() {
        setErr(""); setClaimBusy(true);
        try {
            const res = await fetch("/api/marketplace/credit/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
            const d = await res.json().catch(() => null);
            if (!res.ok || !d?.ok) throw new Error(d?.error === "no_credit" ? "You have no store credit to spend yet." : d?.error || "Couldn't create a code.");
            const qr = await QRCode.toDataURL(redeemUrl("credit", d.token), { width: 320, margin: 1 }).catch(() => null);
            setClaim({ qr, expiresAt: d.expiresAt });
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn't create a code.");
        } finally {
            setClaimBusy(false);
        }
    }
    function closeQr() { setClaim(null); refresh(); }

    return (
        <>
            <section className="card credit-hero">
                <div className="credit-hero-glow" aria-hidden="true" />
                <div className="credit-hero-top">
                    <span className="credit-hero-coin" aria-hidden="true">🪙</span>
                    <div className="credit-hero-copy">
                        <h1 className="credit-hero-title">Top up. Spend anywhere.</h1>
                        <p className="credit-hero-sub">Load store credit and pocket <strong>{coinsPerCent * 100} coins for every $1</strong> — the same dollars work in the shop, online, <em>and</em> in the game.</p>
                    </div>
                </div>
                <div className="credit-balance">
                    <span className="credit-balance-label">Your balance</span>
                    <span className="credit-balance-amount">{usd(balanceCents)}</span>
                </div>
                <div className="credit-perks">
                    <span className="credit-perk"><b>🪙 {coinsPerCent * 100}/$1</b>coins on top</span>
                    <span className="credit-perk"><b>🏪 In-store & online</b>spend it anywhere</span>
                    <span className="credit-perk"><b>♾️ Never expires</b>real money, kept</span>
                    <span className="credit-perk"><b>⚡ Instant</b>lands in your wallet</span>
                </div>
            </section>

            {done ? (
                <section className="card credit-done">
                    <div style={{ fontSize: "2rem" }}>🎉</div>
                    <h2 style={{ margin: "4px 0" }}>Added {usd(done.amountCents)} credit!</h2>
                    <p className="muted" style={{ marginTop: 0 }}>+{done.coins.toLocaleString()} coins dropped into your wallet{done.bonusCoins > 0 ? <> (incl. <strong style={{ color: "#7cffb2" }}>+{done.bonusCoins.toLocaleString()}</strong> gear bonus)</> : null}. New balance: <strong>{usd(balanceCents)}</strong>.</p>
                    <button className="pill" onClick={() => setDone(null)}>Buy more</button>
                </section>
            ) : (
                <section className="card">
                    {/* ── PACKAGES, ABOVE THE ORDINARY AMOUNTS ────────────────────────────────────────────
                        A package is the same $5 going in — you still get every cent back as spendable credit —
                        with more coins and something you cannot get any other way on top. It sits above the
                        plain amounts because that is the offer, and selecting one takes over the amount. */}
                    {offers.length ? (
                        <div className="credit-pkgs">
                            {offers.map((o) => (
                                <PackageCard
                                    key={o.id}
                                    offer={o}
                                    selected={pkgId === o.id}
                                    onToggle={() => setPkgId(pkgId === o.id ? null : o.id)}
                                />
                            ))}
                        </div>
                    ) : null}
                    <h2 style={{ marginTop: offers.length ? 14 : 0 }}>{pkg ? "Or add credit on its own" : "Add credit"}</h2>
                    <div className="credit-presets" style={pkg ? { opacity: 0.45 } : undefined}>
                        {PRESETS_CENTS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                className={`credit-chip${amountCents === c && !customDollars ? " is-active" : ""}${c === 2500 ? " is-featured" : ""}`}
                                onClick={() => pickPreset(c)}
                            >
                                {c === 2500 ? <span className="credit-chip-flag">★ Popular</span> : null}
                                <span className="credit-chip-usd">{usd(c)}</span>
                                <span className="credit-chip-coins">+{Math.round(c * coinsPerCent * (1 + coinBonus)).toLocaleString()} 🪙</span>
                            </button>
                        ))}
                    </div>
                    <label className="credit-custom">
                        <span className="muted">Custom amount</span>
                        <span className="credit-custom-field">
                            <span>$</span>
                            <input
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="25"
                                value={customDollars}
                                onChange={(e) => onCustom(e.target.value.replace(/[^0-9]/g, ""))}
                            />
                        </span>
                    </label>

                    <div className="credit-summary">
                        {/* ── SAY WHAT IS BEING BOUGHT ──────────────────────────────────────────────────────
                            This summary used to read "Credit added / Coins earned / fee / You pay" whether you
                            had the package selected or not — identical shape, different numbers, and the item
                            never named anywhere. Kaishiern saw the stand advertised, topped up $25 on its own
                            an hour after launch, and got no stand: "I had a deal pop up offering a pet stand if
                            I topped up, which I did, but I can't find the pet stand?" He was not careless; the
                            checkout never told him what he was buying. */}
                        {pkg ? (
                            <div className="credit-summary-item">
                                <span>{pkg.name}</span><strong>included</strong>
                            </div>
                        ) : null}
                        <div><span className="muted">Credit added</span><strong>{usd(amountCents)}</strong></div>
                        <div><span className="muted">Coins earned</span><strong>{coins.toLocaleString()} 🪙</strong></div>
                        {bonusCoins > 0 ? (
                            <div><span className="muted">↳ Gear bonus (+{Math.round(coinBonus * 100)}%)</span><strong style={{ color: "#7cffb2" }}>+{bonusCoins.toLocaleString()} 🪙</strong></div>
                        ) : null}
                        <div><span className="muted">Processing fee (3.5%)</span><strong>{usd(feeCents)}</strong></div>
                        <div className="credit-summary-total"><span>You pay</span><strong>{usd(chargedCents)}</strong></div>
                    </div>

                    {/* The other half: an offer is on the page and they have NOT taken it. Topping up on its own
                        is a perfectly good thing to do, but it must not be mistaken for the offer. */}
                    {!pkg && offers.length ? (
                        <p className="credit-nopkg" role="note">
                            This is store credit on its own — it does not include {offers[0].name}. To get that,
                            choose the {usd(offers[0].priceCents)} offer above.
                        </p>
                    ) : null}

                    {!paymentsEnabled ? (
                        <p className="muted">Online purchases are currently unavailable. You can still spend existing credit in-store.</p>
                    ) : missingSquareConfig ? (
                        <p className="muted">Card payments aren’t configured yet.</p>
                    ) : (
                        <>
                            <div id="credit-card" className="credit-card-field" />
                            {cardState === "loading" ? <p className="muted">Loading secure card form…</p> : null}
                            <button className="btn-primary credit-buy" onClick={buy} disabled={busy || cardState !== "ready"}>
                                {busy ? "Processing…" : `Pay ${usd(chargedCents)}`}
                            </button>
                            <p className="muted" style={{ fontSize: "0.75rem", marginTop: 6 }}>Secure checkout by Square. Card charged only on success.</p>
                        </>
                    )}
                    {err ? <p className="form-error" role="alert">{err}</p> : null}
                </section>
            )}

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Spend in store</h2>
                <p className="muted" style={{ marginTop: 0 }}>Show this code to staff at the register. They’ll scan it and enter the amount to take off your purchase.</p>
                {claim ? (
                    <div className="credit-qr">
                        {claim.qr ? <img src={claim.qr} alt="Store credit QR" width={240} height={240} /> : null}
                        <p className="muted">Balance available: <strong>{usd(balanceCents)}</strong></p>
                        <button className="pill" onClick={closeQr}>Done</button>
                    </div>
                ) : (
                    <button className="pill" onClick={showInStoreQr} disabled={claimBusy || balanceCents <= 0}>
                        {claimBusy ? "…" : balanceCents > 0 ? "📲 Show my in-store code" : "No credit to spend yet"}
                    </button>
                )}
            </section>

            {events.length ? (
                <section className="card">
                    <h2 style={{ marginTop: 0 }}>History</h2>
                    <ul className="credit-history">
                        {events.map((e, i) => (
                            <li key={i}>
                                <span>{reasonLabel[e.reason] || e.reason}</span>
                                <span className={e.deltaCents >= 0 ? "credit-plus" : "credit-minus"}>
                                    {e.deltaCents >= 0 ? "+" : "−"}{usd(Math.abs(e.deltaCents))}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </>
    );
}
