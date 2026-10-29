"use client";

import { useCallback, useMemo, useState } from "react";

import { BUYBACK_PERCENT } from "@/lib/marketplace/buyback.js";

const usd = (cents) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

const TABS = [
    { key: "cards", label: "Cards" },
    { key: "orders", label: "On order" },
    { key: "history", label: "History" },
];

const ACTION_LABEL = {
    opened: "Opened a pack",
    vaulted: "Kept the card",
    sold_back: "Sold back",
    ordered: "Ordered",
    cancelled: "Order cancelled",
    shipped: "Shipped",
    picked_up: "Picked up",
    refunded: "Refunded",
};

function shortDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function VaultClient({ initial }) {
    const [vault, setVault] = useState(initial);
    const [tab, setTab] = useState("cards");
    const [selected, setSelected] = useState(() => new Set());
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null);
    const [detail, setDetail] = useState(null);
    const [ordering, setOrdering] = useState(null); // null | "choose" | "pickup" | "shipping"
    const [address, setAddress] = useState({ name: "", email: "", addressLine1: "", city: "", state: "", postalCode: "", country: "US" });
    const [quote, setQuote] = useState(null);
    const [rateId, setRateId] = useState(null);

    // Memoised because `vault?.held || []` is a fresh array every render, which would make every useMemo
    // below it recompute on every keystroke elsewhere in the tree.
    const held = useMemo(() => vault?.held || [], [vault?.held]);

    const selectedCards = useMemo(
        () => held.filter((c) => selected.has(c.id)),
        [held, selected]
    );
    // ⚠️ WHAT WE WILL PAY, NOT WHAT THEY ARE WORTH. This was summing valueCents while the Sell back button
    //    handed over the 60% trade rate, so the bar and the confirm sheet would both have quoted a figure
    //    the sale was never going to produce. sellBackCents is sent per card by the server; nothing here
    //    multiplies money by a rate, and summing the per-card payouts is also what the server does — rating
    //    a basket once rounds once and pays less than selling the same cards one at a time.
    const selectedTotal = selectedCards.reduce((sum, c) => sum + c.sellBackCents, 0);
    const selectedMarket = selectedCards.reduce((sum, c) => sum + c.valueCents, 0);

    const refresh = useCallback(async () => {
        const res = await fetch("/api/marketplace/vault", { cache: "no-store" }).catch(() => null);
        if (!res?.ok) return;
        setVault(await res.json());
        setSelected(new Set());
    }, []);

    function toggle(id) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function sellSelected() {
        if (busy || !selectedCards.length) return;
        setBusy(true);
        try {
            const res = await fetch("/api/marketplace/vault/sell", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cardIds: selectedCards.map((c) => c.id) }),
            });
            const data = await res.json();
            if (!res.ok) {
                setNotice(data.error || "Couldn't sell those.");
                return;
            }
            setNotice(`Sold ${data.soldCount} card${data.soldCount === 1 ? "" : "s"} for ${usd(data.creditedCents)}.`);
            setConfirming(false);
            setDetail(null);
            await refresh();
        } finally {
            setBusy(false);
        }
    }

    async function placeOrder(mode) {
        if (busy) return;
        setBusy(true);
        try {
            const rate = quote?.rates?.find((r) => r.id === rateId);
            const res = await fetch("/api/marketplace/vault/order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cardIds: selectedCards.map((c) => c.id),
                    mode,
                    shipping: mode === "shipping" ? address : null,
                    shipmentId: quote?.shipmentId || null,
                    rateId: rate?.id || null,
                    shippingCents: rate?.amountCents || 0,
                    insuranceCents: quote?.insuranceCents || 0,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setNotice(data.error || "Couldn't create that order.");
                return;
            }
            setNotice(
                mode === "pickup"
                    ? `${data.cardCount} card${data.cardCount === 1 ? "" : "s"} set aside for pickup. We'll have them ready.`
                    : `${data.cardCount} card${data.cardCount === 1 ? "" : "s"} on the way.`
            );
            setOrdering(null);
            setQuote(null);
            await refresh();
        } finally {
            setBusy(false);
        }
    }

    async function getQuote() {
        if (busy) return;
        setBusy(true);
        try {
            const res = await fetch("/api/marketplace/vault/order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "quote", cardIds: selectedCards.map((c) => c.id), shipping: address }),
            });
            const data = await res.json();
            if (!res.ok) { setNotice(data.error || "Couldn't price that."); return; }
            setQuote(data);
            setRateId(data.rates?.[0]?.id || null);
        } finally {
            setBusy(false);
        }
    }

    async function cancelOrder(id) {
        if (busy) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/marketplace/vault/order/${id}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
            });
            const data = await res.json();
            setNotice(res.ok
                ? `${data.returnedCount} card${data.returnedCount === 1 ? "" : "s"} back in your vault.`
                : data.error || "Couldn't cancel that.");
            await refresh();
        } finally {
            setBusy(false);
        }
    }

    if (!vault) return null;

    return (
        <section className="vt-wrap">
            <header className="vt-head">
                <div>
                    <span className="vt-head-label">Vault value</span>
                    <strong className="vt-head-value">{usd(vault.totals?.heldValueCents)}</strong>
                </div>
                <div>
                    <span className="vt-head-label">Cards</span>
                    <strong className="vt-head-value">{vault.totals?.heldCount ?? 0}</strong>
                </div>
                {/* ⚠️ ONLY ONCE IT HAS A NUMBER IN IT. A fourth stat reading "$0.00" on the day somebody
                    opens their first pack is a reminder that they have never had anything, on the screen
                    built to make the vault feel like an account. It appears the moment it can brag. */}
                {vault.totals?.earnedBackCents > 0 ? (
                    <div>
                        <span className="vt-head-label">Earned back</span>
                        <strong className="vt-head-value vt-gold">{usd(vault.totals.earnedBackCents)}</strong>
                    </div>
                ) : null}
                <div>
                    <span className="vt-head-label">Store credit</span>
                    <strong className="vt-head-value vt-gold">{usd(vault.balanceCents)}</strong>
                </div>
                {/* ── ⚠️ THE WAY BACK TO THE PACKS ────────────────────────────────────────────────
                    A member, 2026-10-28: "it would be great if there was a button in the card vault to
                    bring you back to the packs quickly."

                    The vault is where you land after every open, and it had no door onward — so the loop
                    that the whole feature is built around (open, look at it, open another) ended in a
                    dead end that could only be escaped through the menu. It sits in the header rather
                    than at the bottom of a list that can be a hundred cards long. */}
                <a className="vt-head-open" href="/mystery-bags">
                    <span className="vt-head-open-main">Open another</span>
                    <span className="vt-head-open-go" aria-hidden="true">&#8250;</span>
                </a>
            </header>

            {notice ? <p className="vt-notice">{notice}</p> : null}

            {/* Not a native select, and not a dropdown — three tabs are three tabs. */}
            <nav className="vt-tabs">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        className={`vt-tab ${tab === t.key ? "vt-tab-on" : ""}`}
                        onClick={() => setTab(t.key)}
                    >
                        {t.label}
                        {t.key === "orders" && vault.totals?.onOrderCount
                            ? ` (${vault.totals.onOrderCount})`
                            : ""}
                    </button>
                ))}
            </nav>

            {tab === "cards" ? (
                held.length === 0 ? (
                    <div className="vt-empty">
                        <p>Nothing in the vault yet.</p>
                        <a className="pk-btn pk-btn-primary" href="/mystery-bags">Open a pack</a>
                    </div>
                ) : (
                    <>
                        <ul className="vt-grid">
                            {held.map((card) => {
                                const on = selected.has(card.id);
                                return (
                                    <li key={card.id} className={`vt-tile ${on ? "vt-tile-on" : ""}`} style={{ "--edge": card.edge, "--glow": card.glow }}>
                                        <button type="button" className="vt-tile-art" onClick={() => setDetail(card)}>
                                            {card.imageUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={card.imageUrl} alt={card.name} loading="lazy" />
                                            ) : (
                                                <span className="vt-noart">{card.name}</span>
                                            )}
                                            {/* Readable from across the grid. The row of "Selected" labels
                                                underneath tells you the same thing one tile at a time. */}
                                            {on ? (
                                                <span className="vt-tile-check" aria-hidden="true">
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M4 12.6 9.2 18 20 6.4" />
                                                    </svg>
                                                </span>
                                            ) : null}
                                        </button>
                                        <div className="vt-tile-body">
                                            <span className="vt-tile-name">{card.name}</span>
                                            <span className="vt-tile-sub">{card.subtitle}</span>
                                            <span className="vt-tile-value" style={{ color: card.glow }}>
                                                {usd(card.valueCents)}
                                            </span>
                                            {/* Both numbers, always, because they are different numbers.
                                                The value is what the card is; the trade is what it pays. */}
                                            <span className="vt-tile-trade">
                                                trades for {usd(card.sellBackCents)}
                                            </span>
                                            {card.valueCents !== card.pulledValueCents ? (
                                                <span className="vt-tile-was">pulled at {usd(card.pulledValueCents)}</span>
                                            ) : null}
                                        </div>
                                        {/* ⚠️ NOT A NATIVE CHECKBOX. Luke: "Checkbook ghetto". A browser
                                            checkbox is the one control that cannot be styled into the rest
                                            of a dark theme — accent-color paints the tick and nothing else,
                                            so it stays a bright system square in the corner of a card worth
                                            real money. Same rule as never shipping a native <select>.

                                            A button with aria-pressed is the correct semantic for a toggle
                                            that is not part of a form submission, and it gets the whole tile
                                            as its hit area via the tick badge on the art. */}
                                        <button
                                            type="button"
                                            className="vt-pick"
                                            aria-pressed={on}
                                            onClick={() => toggle(card.id)}
                                        >
                                            <span className="vt-pick-box" aria-hidden="true">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M4 12.6 9.2 18 20 6.4" />
                                                </svg>
                                            </span>
                                            <span className="vt-pick-label">{on ? "Selected" : "Select"}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>

                        {selectedCards.length ? (
                            <div className="vt-bar">
                                <span>
                                    {selectedCards.length} selected · {usd(selectedTotal)}
                                </span>
                                <div className="vt-bar-actions">
                                    {/* The same pair as the reveal's, so they mean the same thing in both
                                        places: gold is cash out, jewel-toned is take delivery. A ghost
                                        button here read as the way to back out of selecting. */}
                                    <button
                                        type="button"
                                        className="pk-btn pk-btn-vault"
                                        onClick={() => { setOrdering("choose"); setQuote(null); }}
                                    >
                                        Get them
                                    </button>
                                    <button
                                        type="button"
                                        className="pk-btn pk-btn-sell"
                                        onClick={() => setConfirming(true)}
                                    >
                                        Sell back
                                        <span className="pk-btn-shine" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </>
                )
            ) : null}

            {tab === "orders" ? (
                (vault.orders || []).length === 0 ? (
                    <div className="vt-empty"><p>No orders yet.</p></div>
                ) : (
                    <ul className="vt-orders">
                        {vault.orders.map((o) => (
                            <li key={o.id}>
                                <div>
                                    <strong>{o.cardCount} card{o.cardCount === 1 ? "" : "s"}</strong>
                                    <span className="vt-order-sub">
                                        {o.mode === "pickup" ? "Store pickup" : "Shipping"} · {o.fulfillmentStatus.replace("_", " ")}
                                        {o.trackingNumber ? ` · ${o.carrier || ""} ${o.trackingNumber}` : ""}
                                    </span>
                                </div>
                                <div className="vt-order-right">
                                    <span className="vt-order-date">{shortDate(o.createdAt)}</span>
                                    {o.canCancel ? (
                                        <button
                                            type="button"
                                            className="vt-cancel"
                                            onClick={() => cancelOrder(o.id)}
                                            disabled={busy}
                                        >
                                            Cancel
                                        </button>
                                    ) : null}
                                </div>
                            </li>
                        ))}
                    </ul>
                )
            ) : null}

            {tab === "history" ? (
                (vault.history || []).length === 0 ? (
                    <div className="vt-empty"><p>Nothing yet.</p></div>
                ) : (
                    <ul className="vt-history">
                        {vault.history.map((h) => (
                            <li key={h.id}>
                                <span className="vt-hist-what">
                                    {ACTION_LABEL[h.action] || h.action}
                                    {h.meta?.card ? <em> — {h.meta.card}</em> : null}
                                </span>
                                {h.creditDeltaCents !== 0 ? (
                                    <span className={h.creditDeltaCents > 0 ? "vt-up" : "vt-down"}>
                                        {h.creditDeltaCents > 0 ? "+" : "−"}{usd(Math.abs(h.creditDeltaCents))}
                                    </span>
                                ) : <span />}
                                <span className="vt-hist-when">{shortDate(h.at)}</span>
                            </li>
                        ))}
                    </ul>
                )
            ) : null}

            {detail ? (
                <div className="vt-sheet" role="dialog" aria-label={detail.name}>
                    <div className="vt-sheet-art" style={{ "--glow": detail.glow }}>
                        {detail.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={detail.imageUrl} alt={detail.name} />
                        ) : null}
                    </div>
                    <p className="vt-sheet-tier" style={{ color: detail.glow }}>{detail.tierLabel}</p>
                    <h2 className="vt-sheet-name">{detail.name}</h2>
                    <p className="vt-sheet-sub">{detail.subtitle}</p>
                    <p className="vt-sheet-value">{usd(detail.valueCents)}</p>
                    <p className="vt-sheet-trade">
                        {`Trades back for ${usd(detail.sellBackCents)} — ${BUYBACK_PERCENT}% store credit, the same rate we pay at the counter.`}
                    </p>
                    {!detail.releasable ? (
                        <p className="vt-hold">
                            Ready to ship or collect from {shortDate(detail.releasableAt)} — new store credit
                            settles first.
                        </p>
                    ) : null}
                    <div className="vt-sheet-actions">
                        <button
                            type="button"
                            className="pk-btn pk-btn-sell"
                            onClick={() => { setSelected(new Set([detail.id])); setConfirming(true); }}
                        >
                            Sell back — {usd(detail.sellBackCents)}
                            <span className="pk-btn-shine" aria-hidden="true" />
                        </button>
                        <button type="button" className="pk-btn pk-btn-ghost" onClick={() => setDetail(null)}>
                            Close
                        </button>
                    </div>
                </div>
            ) : null}

            {ordering ? (
                <div className="vt-sheet" role="dialog" aria-label="Get your cards">
                    {ordering === "choose" ? (
                        <>
                            <h2 className="vt-sheet-name">
                                Get {selectedCards.length} card{selectedCards.length === 1 ? "" : "s"}
                            </h2>
                            <p className="vt-sheet-sub">{usd(selectedMarket)} of cards</p>
                            {selectedCards.some((c) => !c.releasable) ? (
                                <p className="vt-hold">
                                    Some of these aren&apos;t ready to leave yet — new store credit settles
                                    first. They&apos;ll stay in your vault and the rest can go now.
                                </p>
                            ) : null}
                            <div className="vt-sheet-actions">
                                {/* Pickup first and free: it is the cheap, obvious option for local players
                                    and the lowest-risk one for us. */}
                                <button type="button" className="pk-btn pk-btn-primary" onClick={() => placeOrder("pickup")} disabled={busy}>
                                    Collect from the shop — free
                                </button>
                                <button type="button" className="pk-btn pk-btn-ghost" onClick={() => setOrdering("shipping")} disabled={busy}>
                                    Ship them to me
                                </button>
                                <button type="button" className="pk-btn pk-btn-ghost" onClick={() => setOrdering(null)}>
                                    Not now
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <h2 className="vt-sheet-name">Where to?</h2>
                            <div className="vt-form">
                                {[
                                    ["name", "Full name", "text"],
                                    ["email", "Email", "email"],
                                    ["addressLine1", "Address", "text"],
                                    ["city", "City", "text"],
                                    ["state", "State", "text"],
                                    ["postalCode", "ZIP", "text"],
                                ].map(([key, label, type]) => (
                                    <label key={key}>
                                        <span>{label}</span>
                                        <input
                                            type={type}
                                            value={address[key]}
                                            onChange={(e) => { setAddress((a) => ({ ...a, [key]: e.target.value })); setQuote(null); }}
                                        />
                                    </label>
                                ))}
                            </div>

                            {quote ? (
                                <>
                                    {quote.insured ? (
                                        <p className="vt-hold">
                                            Insured and signature-required — these are worth{" "}
                                            {usd(quote.declaredCents)}. Insurance is {usd(quote.insuranceCents)},
                                            included in the prices below.
                                        </p>
                                    ) : null}
                                    <ul className="vt-rates">
                                        {quote.rates.map((r) => (
                                            <li key={r.id}>
                                                <label>
                                                    <input
                                                        type="radio"
                                                        name="vault-rate"
                                                        checked={rateId === r.id}
                                                        onChange={() => setRateId(r.id)}
                                                    />
                                                    <span>{r.carrier} {r.service}</span>
                                                    <strong>{usd(r.totalCents)}</strong>
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            ) : null}

                            <div className="vt-sheet-actions">
                                {quote ? (
                                    <button type="button" className="pk-btn pk-btn-primary" onClick={() => placeOrder("shipping")} disabled={busy || !rateId}>
                                        Ship it — {usd(quote.rates.find((r) => r.id === rateId)?.totalCents || 0)}
                                    </button>
                                ) : (
                                    <button type="button" className="pk-btn pk-btn-primary" onClick={getQuote} disabled={busy || !address.addressLine1 || !address.postalCode}>
                                        {busy ? "Pricing…" : "Get shipping prices"}
                                    </button>
                                )}
                                <button type="button" className="pk-btn pk-btn-ghost" onClick={() => setOrdering("choose")}>
                                    Back
                                </button>
                            </div>
                        </>
                    )}
                </div>
            ) : null}

            {/* ⚠️ Bulk selling is the single worst thing this feature could do by accident, so the confirm
                names every card and the total before anything moves. */}
            {confirming ? (
                <div className="vt-sheet" role="dialog" aria-label="Confirm sell back">
                    <h2 className="vt-sheet-name">Sell {selectedCards.length} card{selectedCards.length === 1 ? "" : "s"} back?</h2>
                    <ul className="vt-confirm-list">
                        {selectedCards.map((c) => (
                            <li key={c.id}>
                                <span>{c.name}</span>
                                <span style={{ color: c.glow }}>{usd(c.sellBackCents)}</span>
                            </li>
                        ))}
                    </ul>
                    {/* ⚠️ THE RATE IS ON THE SCREEN WHERE THE MONEY MOVES, not only on the card sheet one tap
                        back. A list of payouts and a total is a screen somebody can agree to without ever
                        having been told what the figures are a share OF — and this is the bulk path, where
                        the sum is largest and the per-card arithmetic is hardest to do in your head. */}
                    <p className="vt-confirm-rate">
                        {`${BUYBACK_PERCENT}% of market value — the same rate we pay at the counter.`}
                    </p>
                    <p className="vt-confirm-total">
                        <span>Store credit</span>
                        <strong className="vt-gold">+{usd(selectedTotal)}</strong>
                    </p>
                    <div className="vt-sheet-actions">
                        <button type="button" className="pk-btn pk-btn-sell" onClick={sellSelected} disabled={busy}>
                            {busy ? "Selling…" : `Sell for ${usd(selectedTotal)}`}
                        </button>
                        <button type="button" className="pk-btn pk-btn-ghost" onClick={() => setConfirming(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
