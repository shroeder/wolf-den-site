"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Haptic } from "@/components/arena/arena-audio.js";
import { PACK_TIERS, tierByKey } from "@/lib/marketplace/pack-rarity.js";
import { burst, coinIn, coinOut, fanfare, rumble, shimmer, stopPackAudio, tierChord } from "@/components/packs/pack-audio.js";

// ── THE PACK OPENING ─────────────────────────────────────────────────────────────────────────────────────────
// Design doc §3, rebuilt 2026-10-27. The rule the gachapon set still holds unchanged:
//
//   THE SERVER DECIDES THE CARD AT THE MOMENT THE CREDIT IS SPENT. The animation is theatre over a decided
//   result. Nothing about how the player taps or waits may touch the outcome.
//
// ── WHY THIS IS A REWRITE AND NOT A TWEAK ────────────────────────────────────────────────────────────────────
// The first version had the card RISE OUT OF THE BAG. On screen that read as a rectangle sliding up behind a
// drawing — because that is exactly what it was — and the "seam of light" meant to sell the opening was a
// white bar floating in mid-air attached to nothing. The illusion asked a flat PNG to do something flat PNGs
// cannot do: contain an object. Luke, 2026-10-27: "it looks awful the card is clearly not inside the bag,
// there is a white horizontal bar just floating."
//
// A bag that DESTROYS ITSELF has no such problem. Nothing has to pass through anything — the bag is there, and
// then it is debris, and the card is where the bag was. It is also a better beat: the pause before a
// detonation is worth more than the pause before a slide.
//
// ── THE RULE THAT SURVIVES THE REWRITE ───────────────────────────────────────────────────────────────────────
// ⚠️ THE SHAKE IS IDENTICAL FOR EVERY CARD. No tier colour, no tier sound, no longer shake for a better pull.
// Everything that knows the answer happens at the burst and after. A build-up that leaks the result teaches
// the player to read it, and then every common deflates before the card is even visible. This is the old
// colourless-glow decision in its new clothes, and it has the same second life as before: since nothing
// before the burst depends on the answer, nothing before the burst has to WAIT for it either — the request
// hides inside the shake.

const PHASE = {
    idle: "idle",
    shake: "shake",
    burst: "burst",
    reveal: "reveal",
    readout: "readout",
};

// Milliseconds. The shake is the held breath; everything after it gets out of the card's way.
const T = { shake: 950, burst: 420, reveal: 560 };

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

/**
 * The debris field — shards of bag and a cloud of sparks, each with its own angle, distance, spin and delay.
 *
 * ⚠️ ROLLED IN THE TAP HANDLER AND PARKED IN STATE, NOT DURING RENDER. Two separate reasons, and they happen
 * to agree:
 *
 *   — Fresh random angles on every render would teleport every shard to a new position on each state change
 *     mid-animation, and there are three of those between the burst and the readout. That reads as a glitch,
 *     not an explosion.
 *   — Math.random() during render is impure, and react-hooks/purity fails the build over it. A useMemo does
 *     not make it legal; it only makes it usually-not-wrong, which is a worse place to be.
 *
 * So the field is decided at the moment the pack is opened — which is also simply where it belongs — and is
 * then fixed for the whole sequence.
 */
function rollDebris() {
    // ⚠️ `distance` IS A UNITLESS FRACTION, NOT PIXELS. The CSS owns the blast radius as --blast, which is
    //    min(42vw, 200px) — so the explosion is the same shape on a 375px phone and a 1440px desktop
    //    instead of being a timid puff on one and off-screen on the other. A number from here is
    //    multiplied by that; it never carries a unit of its own.
    const shards = Array.from({ length: 16 }, (_, i) => ({
        id: `s${i}`,
        // Spread evenly around the circle and THEN jittered, rather than fully random: 16 independent
        // random angles clump, and a clumped explosion looks like it leaked out of one side of the bag.
        angle: (360 / 16) * i + (Math.random() * 20 - 10),
        distance: 0.42 + Math.random() * 0.58,
        size: 11 + Math.random() * 21,
        spin: Math.random() * 760 - 380,
        delay: Math.random() * 70,
    }));
    const sparks = Array.from({ length: 28 }, (_, i) => ({
        id: `k${i}`,
        angle: Math.random() * 360,
        distance: 0.26 + Math.random() * 0.92,
        size: 4 + Math.random() * 8,
        delay: Math.random() * 280,
        life: 520 + Math.random() * 680,
    }));
    return { shards, sparks };
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
    // ── THE PAGE IS NOT THE PLACE FOR THIS ───────────────────────────────────────────────────────────────
    // Luke, 2026-10-27, looking at it on his phone: "This should be a modal, there should be one call to
    // action that glimmers."
    //
    // He is right, and it is the same problem the reveal already had one answer to. An inline panel has to
    // share the screen with the site header, the XP bar, the cart and the Live Chase Board below it, so it
    // competes with all of them for attention AND loses most of the height to them. A modal has one job and
    // the whole screen to do it in. The page keeps exactly one thing — the CTA that opens this.
    //
    // ⚠️ A member resumed into a pending choice opens STRAIGHT into the modal. The card is already theirs
    //    and already paid for; the one thing they cannot be shown is a page that looks like nothing happened.
    const [modalOpen, setModalOpen] = useState(Boolean(initial?.pending));
    // Null until a pack is opened. A member resumed into the readout never had a burst on this page load, so
    // there is nothing to throw — see the guard on the render.
    const [debris, setDebris] = useState(null);
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
     * Hold the page still behind the modal.
     *
     * ⚠️ IT RESTORES WHAT WAS THERE RATHER THAN SETTING "", because this is a shared global and another
     * component may own it. Writing an empty string on the way out is how a scroll lock from one screen
     * silently unlocks another's.
     */
    useEffect(() => {
        if (!modalOpen) return undefined;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = previous; };
    }, [modalOpen]);

    const refreshPool = useCallback(async () => {
        const res = await fetch("/api/marketplace/packs", { cache: "no-store" }).catch(() => null);
        if (!res?.ok) return;
        const data = await res.json();
        setPool(data.pool);
        setBalanceCents(data.balanceCents);
    }, []);

    /**
     * Everything from the detonation onward, which is the only part that needs the server's answer.
     *
     * ⚠️ SPLIT HERE ON PURPOSE, AND IT FALLS STRAIGHT OUT OF THE IDENTICAL-SHAKE RULE: if nothing before the
     * burst may carry information about the result, then nothing before the burst needs to WAIT for it.
     */
    const detonate = useCallback((result) => {
        const idx = PACK_TIERS.findIndex((t) => t.key === result.tier);
        const strength = Math.max(0.2, idx / 5);

        setPhase(PHASE.burst);
        burst(strength);
        tierChord(idx);
        // The bag going is the one moment on this screen worth a real buzz, and bigger pulls hit harder.
        // Haptic.fire is a no-op where navigator.vibrate is absent, which is every desktop and all of iOS —
        // so this is additive everywhere and required nowhere.
        Haptic.fire([0, Math.round(32 + strength * 54), 42, Math.round(16 + strength * 44)]);

        at(150, () => shimmer(10 + idx * 5));
        at(T.burst, () => setPhase(PHASE.reveal));
        at(T.burst + T.reveal, () => setPhase(PHASE.readout));
        if (result.bigHit) at(T.burst + 180, fanfare);
    }, [at]);

    /** Tap through the shake straight to the bang. Nobody sits through the same 950ms eight times in a row. */
    const skip = useCallback(() => {
        // ⚠️ Nothing to skip TO until the server has answered — detonating with no card would blow the bag
        //    apart and leave an empty frame behind it.
        if (!open || phase !== PHASE.shake) return;
        clearTimers();
        detonate(open);
    }, [open, phase, clearTimers, detonate]);

    /**
     * ⚠️ THE ANIMATION STARTS ON THE TAP, NOT ON THE RESPONSE.
     *
     * The first version awaited the server and only then began, and filming it frame by frame showed what
     * that actually looks like: the member taps, and for 2.4 SECONDS absolutely nothing happens — no
     * movement, the balance frozen — and then the whole reveal fires at once. A dead pause right after the
     * one committed action on the screen reads as a broken button, and the fix is not a spinner.
     *
     * Because the shake is identical for every card, it runs immediately and the network hides inside it.
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
        setOpen(null);
        setDebris(rollDebris());

        const startedAt = performance.now();
        const balanceBefore = balanceCents;

        setBalanceCents(Math.max(0, balanceCents - priceCents));
        coinOut();
        setPhase(PHASE.shake);
        rumble(T.shake);
        // chestShake is a stutter that tightens — knocks at 170/150/130/110ms getting harder as they go. It
        // was written for the chest and it is the same gesture: something straining before it gives. It is
        // reused rather than re-authored so the two never drift apart.
        Haptic.chestShake();

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

        // If the server beat the shake, wait for the shake. If the shake beat the server, the bag has been
        // rattling a moment longer than planned — which reads as suspense — and it goes the instant the
        // answer lands.
        at(Math.max(0, T.shake - (performance.now() - startedAt)), () => detonate(data));
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
                Haptic.fire([0, 14, 40, 26]);
                if (typeof data.balanceCents === "number") setBalanceCents(data.balanceCents);
            }
            setChoice(which);
            refreshPool();
        } finally {
            setBusy(false);
        }
    }

    function reset() {
        clearTimers();
        setOpen(null);
        setChoice(null);
        setDebris(null);
        setPhase(PHASE.idle);
    }

    /**
     * ⚠️ THERE IS NO CLOSE DURING AN OPEN, AND THAT IS NOT AN OVERSIGHT. Between the tap and the choice the
     * member has spent credit on a card that is already theirs; a dismiss at that point would leave a pending
     * row with nobody looking at it. The × only exists at idle, and once a choice has been made.
     */
    function closeModal() {
        clearTimers();
        stopPackAudio();
        reset();
        setError(null);
        setShelfOpen(false);
        setModalOpen(false);
        refreshPool();
    }

    const shortfall = Math.max(0, priceCents - balanceCents);
    // ⚠️ A price we could not confirm must not be chargeable. See packPrice() — the hard-coded fallback is
    //    fine for a board and would quietly bill $25 for a $20 pack.
    const priceTrusted = pool?.priceTrusted !== false;
    const canOpen = (pool?.remaining || 0) > 0 && shortfall === 0 && priceTrusted;
    // "Blown" is every phase after the bag is gone. It is one derived flag rather than three comparisons
    // because four different things key off it and they must not be able to disagree.
    const blown = phase === PHASE.burst || phase === PHASE.reveal || phase === PHASE.readout;
    const showCard = Boolean(open) && blown;
    // The × exists only where a dismiss cannot strand a paid-for card. See closeModal().
    const closable = phase === PHASE.idle || Boolean(choice);

    // ── THE ONE CALL TO ACTION ───────────────────────────────────────────────────────────────────────────
    // Luke: "there should be one call to action that glimmers."
    //
    // ⚠️ ONE. The panel this replaces put four things on the page at once — a balance, a "79 packs left · see
    // what's inside" pill, the open button and a line of fine print — and a screen with four things on it has
    // no call to action, it has a menu. All three of the others still exist; they are inside the modal, where
    // somebody who has already decided to open a pack will read them.
    //
    // The glimmer is a shine that crosses the button every few seconds. It is the only animated thing on the
    // page at rest, which is the entire point: it is what the eye lands on.
    //
    // ⚠️ DARK WITH A GOLD EDGE, NOT A SOLID GOLD SLAB. The first cut was a filled gold bar and Luke's read
    // was immediate — "Button looks very off and not proffessional". Three things were wrong with it and
    // they compound: a saturated fill that size is a banner ad rather than a control; its gradient went
    // muddy olive across the dead space on the right; and it sat directly above the Live Chase Board's warm
    // brown panel, so the top of the page was one undifferentiated field of yellow. That last one is the
    // same complaint as "I really dont like the slight yellow bg" — gold has to be the ACCENT on this site,
    // never the ground, or it stops reading as gold at all.
    //
    // So this is built in the idiom .ph-start already proved on the hub: dark gradient, gold hairline, art
    // left, body centre, value right. The price on the right is also what fixes the emptiness — a row with
    // something at both ends is balanced; one with a label floating at the left is a slab with text on it.
    if (!modalOpen) {
        return (
            <section className="pk-launch-wrap">
                <button
                    type="button"
                    className="pk-launch"
                    onClick={() => { setModalOpen(true); refreshPool(); }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        className="pk-launch-bag"
                        src="/images/packs/mystery-bag-drawn-600.webp"
                        alt=""
                        aria-hidden="true"
                    />
                    <span className="pk-launch-body">
                        <span className="pk-launch-kick">Mystery packs</span>
                        <span className="pk-launch-line">Open a pack</span>
                        <span className="pk-launch-sub">
                            {pool?.remaining ? `${pool.remaining} left · pays with store credit` : "Back soon"}
                        </span>
                    </span>
                    {priceTrusted && pool?.remaining ? (
                        <span className="pk-launch-price">{usd(priceCents)}</span>
                    ) : null}
                    <span className="pk-launch-go" aria-hidden="true">&#8250;</span>
                    <span className="pk-glimmer" aria-hidden="true" />
                </button>
            </section>
        );
    }

    return (
        <section
            className={`pk-stage pk-${phase}`}
            style={{
                "--tier-glow": tier.glow,
                "--tier-edge": tier.edge,
                "--tier-rank": tierIndex < 0 ? 0 : tierIndex,
            }}
            onClick={phase === PHASE.shake ? skip : undefined}
        >
            {/* ⚠️ HIDDEN THE MOMENT THE BAG GOES, and that is a layout decision as much as a visual one: on a
                375×667 phone the card has to be big AND both buttons have to be above the fold, and the
                header was the row that made that impossible. While a card is on screen nothing else should be
                asking for the eye anyway. */}
            <button
                type="button"
                className="pk-close"
                onClick={closeModal}
                hidden={!closable}
                aria-label="Close"
            >
                &#215;
            </button>

            <header className="pk-top" hidden={blown}>
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
                {/* Behind everything, and only ever coloured AFTER the burst. */}
                <div className="pk-flood" aria-hidden="true" />
                {/* The white-out at the instant of detonation. One frame of nothing is what sells a bang —
                    it also covers the swap from bag to card, so the two are never both visible. */}
                <div className="pk-flash" aria-hidden="true" />
                {/* A ring leaving the blast, tier-coloured, because by this point the answer is known. */}
                <div className="pk-shock" aria-hidden="true" />

                <div className="pk-bagwrap">
                    {!blown ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            className="pk-bag"
                            src="/images/packs/mystery-bag-drawn-600.webp"
                            srcSet="/images/packs/mystery-bag-drawn-600.webp 600w, /images/packs/mystery-bag-drawn-900.webp 900w"
                            sizes="(max-width: 640px) 52vw, 240px"
                            alt="A Wolf Den mystery pack"
                        />
                    ) : null}

                    {/* Shards of the bag, thrown outward. Dark with a gold edge, because that is what the bag
                        is actually made of — debris that does not match the object it came from reads as
                        confetti, which is a party, not an explosion. */}
                    {blown && debris ? (
                        <div className="pk-debris" aria-hidden="true">
                            {debris.shards.map((s) => (
                                <span
                                    key={s.id}
                                    className="pk-shard"
                                    style={{
                                        "--a": `${s.angle}deg`,
                                        "--d": s.distance,
                                        "--sz": `${s.size}px`,
                                        "--spin": `${s.spin}deg`,
                                        "--delay": `${s.delay}ms`,
                                    }}
                                />
                            ))}
                            {debris.sparks.map((k) => (
                                <span
                                    key={k.id}
                                    className="pk-spark"
                                    style={{
                                        "--a": `${k.angle}deg`,
                                        "--d": k.distance,
                                        "--sz": `${k.size}px`,
                                        "--delay": `${k.delay}ms`,
                                        "--life": `${k.life}ms`,
                                    }}
                                />
                            ))}
                        </div>
                    ) : null}

                    {showCard ? (
                        <div className="pk-card">
                            {/* Rays behind the card. This is after the reveal, so it is allowed to say how
                                good the pull was — the fan gets brighter and wider with the tier. */}
                            <div className="pk-rays" aria-hidden="true" />
                            <div className="pk-card-face">
                                {open.card.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={open.card.imageUrl} alt={open.card.name} />
                                ) : (
                                    <div className="pk-card-noart">{open.card.name}</div>
                                )}
                                {/* A sheen that crosses the face once as it lands, and keeps crossing for a
                                    mythic. Foil, basically. */}
                                <span className="pk-sheen" aria-hidden="true" />
                            </div>
                        </div>
                    ) : null}
                </div>
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
                            {/* The two numbers are the whole sentence. They carry their own weight rather
                                than being buried in a line of flat grey. */}
                            <p className="pk-need">
                                You&apos;re <strong>{usd(shortfall)}</strong> short of a{" "}
                                <strong>{usd(priceCents)}</strong> pack.
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
