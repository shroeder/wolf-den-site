"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PACK_TIERS, tierByKey } from "@/lib/marketplace/pack-rarity.js";
import { coinIn, coinOut, fanfare, flip, rise, slam, stopPackAudio, tierChord, zip } from "@/components/packs/pack-audio.js";

// ── THE PACK OPENING ─────────────────────────────────────────────────────────────────────────────────────────
// Design doc §3. The rule the gachapon already set holds here unchanged:
//
//   THE SERVER DECIDES THE CARD AT THE MOMENT THE CREDIT IS SPENT. The animation is theatre over a decided
//   result. Nothing about how the player taps or waits may touch the outcome.
//
// ⚠️ THE GLOW DURING THE RISE IS COLOURLESS, AND THAT IS A DECISION, NOT AN OVERSIGHT (Luke, 2026-10-26). It
// gets brighter; it never gets bluer or golder. The moment the rise carries tier information, the player
// learns to read it and every common becomes a small disappointment the animation PERFORMS at them. Tension
// comes from the pause at the top, which is identical for every card. Everything after the flip is truth, and
// all of it is truth.

const PHASE = {
    idle: "idle",
    committing: "committing",
    zip: "zip",
    rise: "rise",
    flip: "flip",
    slam: "slam",
    readout: "readout",
};

// Milliseconds. The rise is the long one on purpose: it is the held breath.
const T = { zip: 400, rise: 1600, stall: 250, flip: 450, slam: 220, readout: 600 };

const usd = (cents) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

/**
 * A number that rolls rather than jumping. The balance moving is the second most dopamine-dense thing on this
 * screen after the value, so it is never allowed to simply change.
 */
function useRolling(target, ms = 650) {
    const [shown, setShown] = useState(target);
    const from = useRef(target);
    useEffect(() => {
        const start = performance.now();
        const a = from.current;
        const b = target;
        if (a === b) return undefined;
        let raf = 0;
        const tick = (now) => {
            const t = Math.min(1, (now - start) / ms);
            // easeOutCubic — fast off the mark, settles rather than stopping dead.
            const e = 1 - (1 - t) ** 3;
            setShown(Math.round(a + (b - a) * e));
            if (t < 1) raf = requestAnimationFrame(tick);
            else from.current = b;
        };
        // poll-gate: local
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, ms]);
    return shown;
}

export default function PackOpenClient({ initial }) {
    const [pool, setPool] = useState(initial?.pool || null);
    const [balanceCents, setBalanceCents] = useState(initial?.balanceCents || 0);
    // An open the member walked away from mid-reveal is presented FINISHED, at the choice — the card is
    // already theirs and already paid for, so replaying a moment they have already had would be theatre over
    // a decision they are waiting to make. Derived in the initialiser rather than in an effect: a setState in
    // an effect renders the idle stage for a frame first, which flashes the bag at somebody mid-pull.
    const [phase, setPhase] = useState(initial?.pending ? PHASE.readout : PHASE.idle);
    const [open, setOpen] = useState(initial?.pending || null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [choice, setChoice] = useState(null);
    const [shelfOpen, setShelfOpen] = useState(false);
    const [skipHint, setSkipHint] = useState(false);
    const timers = useRef([]);
    const rolledBalance = useRolling(balanceCents);

    const priceCents = pool?.priceCents ?? 0;
    const tier = useMemo(() => tierByKey(open?.tier), [open?.tier]);
    const tierIndex = useMemo(() => PACK_TIERS.findIndex((t) => t.key === tier.key), [tier.key]);

    const clearTimers = useCallback(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
    }, []);

    const at = useCallback((ms, fn) => {
        timers.current.push(setTimeout(fn, ms));
    }, []);

    useEffect(() => () => { clearTimers(); stopPackAudio(); }, [clearTimers]);

    /**
     * Everything from the flip onward, which is the only part that needs the server's answer.
     *
     * ⚠️ SPLIT HERE ON PURPOSE, AND IT FALLS STRAIGHT OUT OF THE COLOURLESS-GLOW RULE: if nothing before the
     * flip may carry information about the result, then nothing before the flip needs to WAIT for it. The zip
     * and the rise are the same for every card, so they start on the tap and the network hides inside them.
     */
    const revealFrom = useCallback((result) => {
        const idx = PACK_TIERS.findIndex((t) => t.key === result.tier);
        setPhase(PHASE.flip);
        flip();
        at(T.flip, () => {
            setPhase(PHASE.slam);
            slam(Math.max(0.15, idx / 5));
            tierChord(idx);
            if (result.bigHit) at(260, fanfare);
        });
        at(T.flip + T.slam, () => setPhase(PHASE.readout));
    }, [at]);

    /** Jump to the end with the slam intact. Required, not polish — nobody sits through this eight times. */
    const skip = useCallback(() => {
        // ⚠️ Nothing to skip TO until the server has answered. Before that the rise is genuinely all there is,
        //    and jumping to a slam with no card would show an empty frame.
        if (!open) return;
        if (phase === PHASE.idle || phase === PHASE.readout || phase === PHASE.committing) return;
        clearTimers();
        setSkipHint(false);
        setPhase(PHASE.slam);
        slam(Math.max(0.15, tierIndex / 5));
        tierChord(tierIndex);
        if (open?.bigHit) setTimeout(fanfare, 220);
        setTimeout(() => setPhase(PHASE.readout), T.slam);
    }, [phase, clearTimers, tierIndex, open]);

    /**
     * ⚠️ THE ANIMATION STARTS ON THE TAP, NOT ON THE RESPONSE.
     *
     * The first version awaited the server and only then began the sequence, and filming it frame by frame
     * showed what that actually looks like: the member taps, and for 2.4 SECONDS absolutely nothing happens —
     * no zip, no movement, the balance frozen — and then the whole reveal fires at once. A dead pause right
     * after the one committed action on the screen reads as a broken button, and the fix is not a spinner.
     *
     * Because the zip and the rise are identical for every card (the colourless-glow rule), they can run
     * immediately and the network hides inside them. The server's answer is only needed at the flip, ~2.25s
     * in. This is the gachapon's pattern — hold the answer until the handle is round.
     *
     * The balance is debited OPTIMISTICALLY for the same reason: we know the price, and the spend has to be
     * visible before anything else moves. The server's exact figure replaces it when it lands, and a failure
     * rolls it back.
     */
    async function doOpen() {
        if (busy || !canOpen) return;
        setBusy(true);
        setError(null);
        setChoice(null);
        setSkipHint(false);
        setOpen(null);

        const startedAt = performance.now();
        const balanceBefore = balanceCents;

        setBalanceCents(Math.max(0, balanceCents - priceCents));
        coinOut();
        setPhase(PHASE.zip);
        zip();
        at(T.zip, () => { setPhase(PHASE.rise); rise(T.rise); });

        const abort = (message) => {
            clearTimers();
            setBalanceCents(balanceBefore);
            setPhase(PHASE.idle);
            setError(message);
        };

        let data = null;
        try {
            const res = await fetch("/api/marketplace/packs/open", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            data = await res.json();
            if (!res.ok || !data.ok) {
                abort(data?.error || "Couldn't open a pack.");
                return;
            }
        } catch {
            abort("Network error — your credit wasn't touched.");
            return;
        } finally {
            setBusy(false);
        }

        setBalanceCents(data.balanceCents);
        setOpen(data);
        setSkipHint(true);

        // If the server beat the rise, wait for the rise. If the rise beat the server, the card has been
        // hanging at the top of its travel — which reads as suspense — and the flip fires at once.
        const flipAt = T.zip + T.rise + T.stall;
        at(Math.max(0, flipAt - (performance.now() - startedAt)), () => revealFrom(data));
    }

    async function choose(which) {
        if (busy || !open) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/marketplace/packs/${open.id}/choose`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ choice: which }),
            });
            const data = await res.json();
            // A 409 means the first tap already landed. That is not a failure to show anybody.
            if (!res.ok && data.code !== "already_chosen") {
                setError(data.error || "Couldn't do that.");
                return;
            }
            if (which === "sell") {
                coinIn();
                if (typeof data.balanceCents === "number") setBalanceCents(data.balanceCents);
            }
            setChoice(which);
            refreshPool();
        } finally {
            setBusy(false);
        }
    }

    const refreshPool = useCallback(async () => {
        const res = await fetch("/api/marketplace/packs", { cache: "no-store" }).catch(() => null);
        if (!res?.ok) return;
        const data = await res.json();
        setPool(data.pool);
        setBalanceCents(data.balanceCents);
    }, []);

    function reset() {
        clearTimers();
        setOpen(null);
        setChoice(null);
        setPhase(PHASE.idle);
        setSkipHint(false);
    }

    const shortfall = Math.max(0, priceCents - balanceCents);
    // ⚠️ A price we could not confirm must not be chargeable. See packPrice() — the hard-coded fallback is
    //    fine for a board and would quietly bill $25 for a $20 pack.
    const priceTrusted = pool?.priceTrusted !== false;
    const canOpen = (pool?.remaining || 0) > 0 && shortfall === 0 && priceTrusted;
    const revealing = phase !== PHASE.idle && phase !== PHASE.committing;
    const showCard = Boolean(open) && (phase === PHASE.flip || phase === PHASE.slam || phase === PHASE.readout);

    return (
        <section
            className={`pk-stage pk-${phase}`}
            style={{ "--tier-glow": tier.glow, "--tier-edge": tier.edge, "--tier-shake": `${tier.shake}px` }}
            onClick={revealing && phase !== PHASE.readout ? skip : undefined}
        >
            <header className="pk-top">
                <div className="pk-bal">
                    <span className="pk-bal-label">Store credit</span>
                    <strong className="pk-bal-value">{usd(rolledBalance)}</strong>
                </div>
                {pool ? (
                    <button type="button" className="pk-shelf-btn" onClick={() => setShelfOpen(true)}>
                        {/* JSX eats the whitespace between an expression and the text after it, which
                            rendered as "79packs left". A template string keeps the space it was written with. */}
                        {`${pool.remaining} packs left · see what's inside`}
                    </button>
                ) : null}
            </header>

            <div className="pk-arena">
                {/* The flood is behind everything and only ever coloured AFTER the flip. */}
                <div className="pk-flood" aria-hidden="true" />

                <div className="pk-bagwrap">
                    {/* The card rises OUT OF THE BAG'S OPENING now that the bag is portrait with its zip
                        across the top. It used to rise from behind a landscape bag and pretend. */}
                    {/* ⚠️ THE CARD EXISTS FROM THE ZIP ONWARD, BEFORE THE SERVER HAS ANSWERED. It rises
                        showing its BACK, which is identical for every card — so there is nothing to know yet.
                        Gating this on `open` is what made the first version wait 2.4s before moving. */}
                    {revealing ? (
                        <div className={`pk-card ${showCard ? "pk-card-face" : ""}`}>
                            <div className="pk-card-inner">
                                <div className="pk-card-back" />
                                <div className="pk-card-front">
                                    {open?.card?.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={open.card.imageUrl} alt={open.card.name} />
                                    ) : (
                                        <div className="pk-card-noart">{open?.card?.name || ""}</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        className="pk-bag"
                        src="/images/packs/mystery-bag-drawn-600.webp"
                        srcSet="/images/packs/mystery-bag-drawn-600.webp 600w, /images/packs/mystery-bag-drawn-900.webp 900w"
                        sizes="(max-width: 640px) 58vw, 260px"
                        alt="A Wolf Den mystery pack"
                    />
                    <div className="pk-mouth" aria-hidden="true" />
                </div>

                {skipHint && open && revealing && phase !== PHASE.readout ? (
                    <p className="pk-skip">Tap to skip</p>
                ) : null}
            </div>

            {phase === PHASE.readout && open ? (
                <div className="pk-result">
                    <p className="pk-tier" style={{ color: tier.glow }}>{tier.label}</p>
                    <h2 className="pk-name">{open.card.name}</h2>
                    {open.card.subtitle ? <p className="pk-sub">{open.card.subtitle}</p> : null}
                    <p className="pk-value">{usd(open.card.valueCents)}</p>
                    {open.bigHit ? <p className="pk-big">That&apos;s going on the board.</p> : null}

                    {choice ? (
                        <div className="pk-done">
                            <p className="pk-done-line">
                                {choice === "sell"
                                    ? `Sold back for ${usd(open.card.valueCents)}.`
                                    : "Added to your vault."}
                            </p>
                            <div className="pk-actions">
                                <button type="button" className="pk-btn pk-btn-primary" onClick={reset} disabled={!canOpen}>
                                    {canOpen ? "Open another" : "Done"}
                                </button>
                                <a className="pk-btn pk-btn-ghost" href="/marketplace/vault">Go to the vault</a>
                            </div>
                        </div>
                    ) : (
                        <div className="pk-actions">
                            {/* Deliberately not symmetrical: selling is the filled one because it is the
                                instant, legible reward; keeping is the quieter, more considered choice. */}
                            <button
                                type="button"
                                className="pk-btn pk-btn-primary"
                                onClick={() => choose("sell")}
                                disabled={busy}
                            >
                                Sell back — {usd(open.card.valueCents)}
                            </button>
                            <button
                                type="button"
                                className="pk-btn pk-btn-ghost"
                                onClick={() => choose("vault")}
                                disabled={busy}
                            >
                                Keep it
                            </button>
                        </div>
                    )}
                </div>
            ) : null}

            {phase === PHASE.idle ? (
                <div className="pk-foot">
                    {error ? <p className="pk-error">{error}</p> : null}
                    {shortfall > 0 && priceTrusted ? (
                        <>
                            <p className="pk-need">
                                You&apos;re {usd(shortfall)} short of a {usd(priceCents)} pack.
                            </p>
                            <a className="pk-btn pk-btn-primary" href="/marketplace/credit">Add store credit</a>
                        </>
                    ) : (
                        <button
                            type="button"
                            className="pk-btn pk-btn-open"
                            onClick={doOpen}
                            disabled={!canOpen || busy}
                        >
                            {!priceTrusted
                                ? "Pack pricing unavailable"
                                : pool?.remaining
                                    ? `Open a pack — ${usd(priceCents)}`
                                    : "Out of packs"}
                        </button>
                    )}
                    <p className="pk-fine">Opens are final. The card is yours either way.</p>
                </div>
            ) : null}

            {shelfOpen && pool ? (
                <div className="pk-shelf" role="dialog" aria-label="What is in the packs">
                    <div className="pk-shelf-head">
                        <strong>{pool.remaining} packs left</strong>
                        <button type="button" className="pk-btn pk-btn-ghost" onClick={() => setShelfOpen(false)}>
                            Close
                        </button>
                    </div>
                    <p className="pk-shelf-note">
                        Every card still in the pool, best first. This is the same pool the shop counter is
                        selling from, so it moves.
                    </p>
                    <ul className="pk-shelf-list">
                        {pool.cards.map((card) => {
                            const t = tierByKey(card.tier);
                            return (
                                <li key={card.id} style={{ "--row-edge": t.edge }}>
                                    <span className="pk-shelf-name">{card.name}</span>
                                    <span className="pk-shelf-sub">{card.subtitle}</span>
                                    <span className="pk-shelf-value" style={{ color: t.glow }}>
                                        {usd(card.valueCents)}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : null}
        </section>
    );
}
