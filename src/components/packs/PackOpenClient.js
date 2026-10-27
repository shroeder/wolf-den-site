"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Haptic } from "@/components/arena/arena-audio.js";
import { BUYBACK_MIN_CENTS, BUYBACK_PERCENT, buyBackIsFloored, packsWorth } from "@/lib/marketplace/buyback.js";
import { PACK_TIERS, tierByKey } from "@/lib/marketplace/pack-rarity.js";
import { burst, coinIn, coinOut, fanfare, rumble, shimmer, stopPackAudio, tally, tierChord } from "@/components/packs/pack-audio.js";

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
// `sold` is how long the card takes to leave, and `tally` is the count-up that replaces it.
const T = { shake: 950, burst: 420, reveal: 560, sold: 420, tally: 1150 };

const usd = (cents) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

/**
 * A number that rolls rather than jumping. The balance moving is the second most dopamine-dense thing on this
 * screen after the value, so it is never allowed to simply change.
 *
 * `startAt` is for a figure that MOUNTS already needing to move — the count-up after a sale, which appears on
 * screen for the first time showing the old balance and then climbs to the new one. Without it the hook
 * initialises to the target, and a counter that is born holding its answer has nothing left to count.
 */
function useRolling(target, ms = 650, startAt = null) {
    const begin = startAt === null ? target : startAt;
    const [shown, setShown] = useState(begin);
    const from = useRef(begin);
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

/**
 * The card turning into money. Rolled in the tap handler and parked in state for the two reasons spelled out
 * over rollDebris — fresh angles on every render teleport the pieces mid-flight, and Math.random() during a
 * render fails the purity rule the build enforces.
 *
 * Fewer pieces than the burst, all of them gold, and thrown a shorter distance. This is a payout landing, not
 * a bag coming apart: it should read as the card being counted out rather than destroyed.
 */
function rollCoins() {
    return Array.from({ length: 14 }, (_, i) => ({
        id: `c${i}`,
        angle: (360 / 14) * i + (Math.random() * 18 - 9),
        distance: 0.3 + Math.random() * 0.6,
        size: 9 + Math.random() * 13,
        spin: Math.random() * 520 - 260,
        delay: Math.random() * 130,
    }));
}

/**
 * ── WHAT A SALE LEAVES ON THE SCREEN ─────────────────────────────────────────────────────────────────────
 * Luke, 2026-10-27, on the sold screen: "When u sell, it should move on from the card you no longer own. And
 * it should do a count up animation on the store credit in the middle of the screen."
 *
 * The screen he was looking at kept everything: the card at full size, its rays still turning, its tier, its
 * name and its market value — a reveal still celebrating an object that now belongs to the shop — with the
 * payout added underneath as a line of text. The member's own money was the small print on somebody else's
 * card.
 *
 * So the sale gets the stage. The card collapses into coins, and what rises where it was is the only thing
 * the member now owns: the balance, counting from what it was to what it is. ⚠️ THE COUNT STARTS AT THE OLD
 * FIGURE — a number that merely appears is a fact, and a number that climbs is a payout. That is the whole
 * difference, and it is why the balance write is held back until this component exists to spend it.
 */
function PackBank({ fromCents, toCents, payoutCents, cardName }) {
    const shown = useRolling(toCents, T.tally, fromCents);
    return (
        <div className="pk-bank">
            <p className="pk-bank-plus">+{usd(payoutCents)}</p>
            <p className="pk-bank-label">Store credit</p>
            <p className="pk-bank-total">{usd(shown)}</p>
            {/* The receipt, and deliberately the quietest line here. The card is named because somebody
                selling eight packs in a row should be able to see WHICH one just paid — but it is named in
                grey body text, not shown, because the point of this screen is that we have moved on. */}
            {cardName ? <p className="pk-bank-what">{`${cardName} sold back`}</p> : null}
        </div>
    );
}

/**
 * ── ⚠️ THE OPENING HAS EXACTLY ONE IMPLEMENTATION, AND NOW IT HAS TWO DOORS ──────────────────────────────
 * Luke, 2026-10-27: "I want to have vendor in the casino who sells mystery packs."
 *
 * The casino is the second place a member can buy a pack, and it is NOT a second pack feature. Everything
 * about an open — the price, the gate, the shake, the server deciding the card as the credit is spent, the
 * sell-or-keep — is the same event in both rooms, and this file is where it lives. The vendor on the floor is
 * a DOOR to it, not a copy of it: the whole lesson of sell-at-the-reveal versus sell-from-the-vault, which
 * drifted into two different sets of consequences before being merged, is that two paths for one transaction
 * always drift.
 *
 * So the component grew two props and nothing else:
 *
 *   `hideLaunch`  — the room already has a call to action (a vendor you walk up to), so this one renders
 *                   nothing at rest. ⚠️ IT STILL RENDERS THE MODAL. Hiding the launcher is not the same as
 *                   not mounting: a member resumed into a pending open must get their card wherever they
 *                   are standing, and that is driven by `initial.pending` below.
 *   `openSignal`  — a counter the room bumps to open the modal. A number rather than a boolean because the
 *                   modal closes itself, and a boolean the parent has to remember to lower is a door that
 *                   will not open twice.
 */
export default function PackOpenClient({ initial, hideLaunch = false, openSignal = 0 }) {
    const [pool, setPool] = useState(initial?.pool || null);
    // ── THE PICKER (docs/category-packs.md §9) ───────────────────────────────────────────────────────────
    // `pool` above is the BAGS pool summary and always has been. `pools` is the shelf of packs a member may
    // choose between — the bags plus every category pool their gate allows — and `picked` is the one
    // currently centred in the carousel. A member with one pool never sees any of it.
    const [pools, setPools] = useState(initial?.pools || []);
    const [picked, setPicked] = useState(0);
    const trackRef = useRef(null);
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
    // The card a member tapped in the sheet, shown full-size over it. Held as the CARD OBJECT rather than an
    // index, because the sheet re-reads `chosen.cards` whenever the pool refreshes and an index would start
    // pointing at a different card mid-look.
    const [peek, setPeek] = useState(null);
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
    // The sale, in its two beats. `sellOut` is the card leaving; `bank` is the count-up that replaces it and
    // carries the two figures it counts between. See PackBank.
    const [sellOut, setSellOut] = useState(false);
    const [bank, setBank] = useState(null);
    const [coins, setCoins] = useState(null);
    const timers = useRef([]);
    const rolledBalance = useRolling(balanceCents);

    // ⚠️ EVERY FIGURE ON THE IDLE SCREEN COMES FROM THE SELECTED POOL, NOT FROM THE BAGS. The shortfall, the
    // button's price and whether it is openable at all are the picked pack's, or the whole carousel quotes
    // one price and charges another.
    const chosen = pools[picked] || null;
    // ⚠️ ONE FLAG, THREE READERS. The carousel, the arena's height and the idle bag all key off this. The
    // first cut had the picker's condition written out at each site and the ARENA BAG kept rendering
    // underneath — a second full-size bag overflowing a zero-height box, straight over the buttons.
    const showPicker = phase === PHASE.idle && pools.length > 1;
    const priceCents = chosen ? chosen.priceCents : (pool?.priceCents ?? 0);
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
        setPools(data.pools || []);
        setBalanceCents(data.balanceCents);
    }, []);

    /**
     * The room opening the door from outside.
     *
     * ⚠️ IT IGNORES THE FIRST VALUE, AND HAS TO. Effects run on mount, so reading the signal unconditionally
     * would open the modal on every casino page load for anybody standing anywhere — the member arrives in
     * the room and a pack-buying screen takes the whole display before they have touched anything. Only a
     * CHANGE is a tap; the value it changed from is just where the counter happened to start.
     *
     * The pool is re-read on the way in for the same reason the launcher does it: the shop counter sells out
     * of this pool all day, and a casino tab left open overnight would otherwise offer a bag that is gone.
     */
    const lastSignal = useRef(openSignal);
    useEffect(() => {
        if (openSignal === lastSignal.current) return;
        lastSignal.current = openSignal;
        setModalOpen(true);
        refreshPool();
    }, [openSignal, refreshPool]);

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
                body: JSON.stringify({ pool: chosen?.key || "bags" }),
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

    /**
     * Sell it or keep it.
     *
     * ⚠️ SELLING IS TWO BEATS, NOT ONE REPAINT. The card has to be gone before the money arrives, or the
     * screen is asking the member to look at a card and a balance at the same time and the balance loses —
     * see PackBank for the whole argument. So the tap starts the card leaving, and T.sold later the counter
     * takes the stage it vacated.
     *
     * ⚠️ AND THE BALANCE IS NOT WRITTEN UNTIL THAT MOMENT. Setting it on the response rolls the header figure
     * during the card's exit: two numbers moving in two places, and the little one wins because it moves
     * first. The refresh is held back with it for the same reason — it carries a balance of its own.
     */
    async function choose(which) {
        if (busy || !open || choice) return;
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
            setChoice(which);
            if (which !== "sell") {
                refreshPool();
                return;
            }

            const fromCents = balanceCents;
            // ⚠️ THE 409 PATH CARRIES NO FIGURE. "already_chosen" is an error body — it has a code and
            //    nothing else — so the count-up has to be able to work out where it is going on its own, or
            //    a double-tap renders NaN in 3rem type across the middle of the screen.
            const toCents = typeof data.balanceCents === "number"
                ? data.balanceCents
                : fromCents + (open.card.sellBackCents || 0);

            coinIn();
            Haptic.fire([0, 14, 40, 26]);
            setCoins(rollCoins());
            setSellOut(true);
            at(T.sold, () => {
                setBalanceCents(toCents);
                setBank({ fromCents, toCents, payoutCents: Math.max(0, toCents - fromCents) });
                tally(T.tally);
                refreshPool();
            });
        } finally {
            setBusy(false);
        }
    }

    function reset() {
        clearTimers();
        setOpen(null);
        setChoice(null);
        setDebris(null);
        setSellOut(false);
        setBank(null);
        setCoins(null);
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
    const canOpen = chosen
        ? chosen.open && shortfall === 0 && priceCents > 0
        : (pool?.remaining || 0) > 0 && shortfall === 0 && priceTrusted;
    // "Blown" is every phase after the bag is gone. It is one derived flag rather than three comparisons
    // because four different things key off it and they must not be able to disagree.
    const blown = phase === PHASE.burst || phase === PHASE.reveal || phase === PHASE.readout;
    // ⚠️ THE CARD GOES WHEN THE COUNTER ARRIVES, AND NOT ONE RENDER EITHER SIDE OF IT. Unmounting it on the
    // tap kills the exit animation mid-flight; leaving it mounted past the bank puts a sold card behind the
    // balance. Both halves key off the same piece of state so they cannot disagree.
    const showCard = Boolean(open) && blown && !bank;
    // null unless the sell-back beats what the pack cost — see packsWorth.
    const multiple = packsWorth(open?.card?.sellBackCents, open?.priceCents ?? priceCents);
    // ── ⚠️ THE LINE HAS TO SURVIVE BEING CHECKED ON A CALCULATOR ─────────────────────────────────────────
    // Both numbers it talks about are on screen to the cent, inches apart, so "60% of $1.40" over a $1.00
    // button is a sum that visibly does not come out — and a disclosure whose own arithmetic fails reads as
    // the rate being invented. The payout is never plain 60%: it rounds UP to a quarter and floors at a
    // dollar, both in the member's favour, and the line says which one did it.
    //
    //   $258.00 → $155.00   "60% of $258.00, rounded up"   154.80 rounded to 155.00  ✓
    //     $1.40 →   $1.00   "60% of $1.40, rounded up"       0.84 rounded to   1.00  ✓
    //     $1.20 →   $1.00   "60% · $1.00 minimum"            0.72 is under the floor ✓
    const rateLine = buyBackIsFloored(open?.card?.valueCents)
        ? `${BUYBACK_PERCENT}% · ${usd(BUYBACK_MIN_CENTS)} minimum`
        : `${BUYBACK_PERCENT}% of ${usd(open?.card?.valueCents)}, rounded up`;
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
    // ── THE ROOM IS THE CALL TO ACTION ───────────────────────────────────────────────────────────────────
    // On the casino floor the member walks up to a vendor; a second gold banner on the page under him would
    // be two doors to one room. ⚠️ null AT REST, NEVER AN UNMOUNTED COMPONENT — see the note on hideLaunch.
    if (!modalOpen && hideLaunch) return null;

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
            className={`pk-stage pk-${phase}${sellOut && !bank ? " pk-selling" : ""}${bank ? " pk-banked" : ""}`}
            style={{
                "--tier-glow": tier.glow,
                "--tier-edge": tier.edge,
                "--tier-rank": tierIndex < 0 ? 0 : tierIndex,
            }}
            onClick={phase === PHASE.shake ? skip : undefined}
        >
            <button
                type="button"
                className="pk-close"
                onClick={closeModal}
                hidden={!closable}
                aria-label="Close"
            >
                &#215;
            </button>

            {/* ⚠️ IT COLLAPSES ONCE THE BAG GOES, IT DOES NOT DISAPPEAR. The first cut hid this outright to
                buy the card its height, and Luke found the hole standing at the choice on a real pull: "I
                cant see how much store credit i have here." "Sell back — $4.00" is a number with no meaning
                unless you can see what it is being added TO, and sell-or-keep is the one decision on this
                screen where the balance is load-bearing. So the label and the figure collapse onto one line
                and the packs-left pill goes — about 20px instead of about 56 — and the card pays for it by
                settling to 50dvh instead of 54. */}
            <header className={`pk-top${blown ? " pk-top-slim" : ""}`}>
                <div className="pk-bal">
                    <span className="pk-bal-label">Store credit</span>
                    <strong className="pk-bal-value">{usd(rolledBalance)}</strong>
                </div>
                {/* ⚠️ IT COUNTS THE PACK YOU ARE LOOKING AT. With a carousel this pill read "76 packs left"
                    over a Pokémon pack holding 910 cards — the bags' number, under somebody else's pack. */}
                {(chosen || pool) && !blown ? (
                    <button type="button" className="pk-shelf-btn" onClick={() => setShelfOpen(true)}>
                        {/* JSX eats the whitespace between an expression and the text after it, which
                            rendered as "79packs left". A template string keeps the space it was written with. */}
                        {chosen && pools.length > 1
                            ? `${chosen.units} inside · see what's inside`
                            : `${pool.remaining} packs left · see what's inside`}
                    </button>
                ) : null}
            </header>

            {/* ── THE PICKER ──────────────────────────────────────────────────────────────────────────────
                Luke, on the PrizePicks Packs screen: "I like how prize picks does it where you swipe left
                and right between pack types and its sleek and simple yet you can still evaluate what's
                inside." A snap track with the neighbours showing at both edges, so it is obvious there are
                more without a dot row or an arrow explaining it.

                ⚠️ IT REPLACES THE ARENA RATHER THAN SITTING ABOVE IT, and only while idle. The bag standing
                in the arena IS the pack you are about to open, so showing a carousel of packs over a
                different single bag would be two answers to the same question.

                ⚠️ AND IT IS ABSENT ENTIRELY FOR ONE POOL. A member whose gate allows only the bags gets the
                screen exactly as it was — a carousel of one is a control that does nothing. */}
            {showPicker ? (
                <div className="pk-picker">
                    <div
                        className="pk-pick-track"
                        ref={trackRef}
                        onScroll={(e) => {
                            // The centred card, from the scroll offset. No observer and no rAF: one
                            // division against the track's own child width, which cannot drift from the
                            // snap points because it IS the snap point.
                            const el = e.currentTarget;
                            const w = el.firstChild?.offsetWidth || 1;
                            const i = Math.max(0, Math.min(pools.length - 1, Math.round(el.scrollLeft / w)));
                            if (i !== picked) setPicked(i);
                        }}
                    >
                        {pools.map((p, i) => (
                            <article
                                key={p.key}
                                className={`pk-pick${i === picked ? " pk-pick-on" : ""}${p.open ? "" : " pk-pick-shut"}`}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {/* ⚠️ THE POOL'S OWN BAG, falling back to the house one. Same crest on every
                                    pack — provably the same, it is the same pixels — and a different colour
                                    of foil, so the carousel reads as a product line rather than as four
                                    names under one picture. */}
                                {/* ── TAP THE BAG TO SEE INSIDE IT ────────────────────────────────────
                                    Luke, 2026-10-27: "i want to simply click a bag to get to this modal."
                                    The pill in the header still works and is still the obvious affordance,
                                    but the bag is the biggest thing on the screen and the thing a thumb
                                    goes to — asking somebody to look at the bag and then tap a pill
                                    somewhere else is a step that earns nothing.

                                    ⚠️ IT ALSO SELECTS. Tapping a NEIGHBOUR bag used to be impossible, so
                                    the sheet could only ever be opened for the centred pool. Now it centres
                                    that pool first and opens its sheet — otherwise tapping the Pokémon bag
                                    at the edge would open the bags' card list, which is the one thing this
                                    sheet must never get wrong. */}
                                <button
                                    type="button"
                                    className="pk-pick-bag-btn"
                                    onClick={() => {
                                        Haptic.tap();
                                        if (i !== picked) {
                                            setPicked(i);
                                            const track = trackRef.current;
                                            const card = track?.children?.[i];
                                            if (track && card) {
                                                track.scrollTo({
                                                    left: card.offsetLeft - (track.clientWidth - card.clientWidth) / 2,
                                                    behavior: "smooth",
                                                });
                                            }
                                        }
                                        setShelfOpen(true);
                                    }}
                                    aria-label={`See what is inside ${p.brand}`}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        className="pk-pick-bag"
                                        src={p.art || "/images/packs/mystery-bag-drawn-600.webp"}
                                        alt=""
                                        aria-hidden="true"
                                    />
                                </button>
                                <h3 className="pk-pick-name">{p.brand}</h3>
                                {p.open ? (
                                    /* ── ⚠️ NOT THEIR STAT ROW ────────────────────────────────────────
                                       PrizePicks leads with "Min pull", which works for them because
                                       theirs is 30% of the price. Ours is $1.00 on a $15 pack — seven
                                       percent — so leading with it would put our weakest fact in our
                                       largest type. Max pull is real and in the pool right now, the count
                                       is what makes a pool read as a shelf rather than a short list, and
                                       the median is unflattering on purpose: printing it is what makes the
                                       other two believable. */
                                    <div className="pk-pick-stats">
                                        <span>
                                            <b>{usd(p.maxCents)}</b>
                                            <i>Max pull</i>
                                        </span>
                                        <span>
                                            <b>{p.units}</b>
                                            {/* ⚠️ "Cards inside" was 68px against a 68px column — it
                                                filled its own cell exactly and ran under the dividers
                                                either side. The card is 220px wide (78% of a track already
                                                inset 11%), so the label has to be short enough to live in a
                                                third of that. "910" above it carries the meaning anyway. */}
                                            <i>Cards</i>
                                        </span>
                                        {p.medianCents ? (
                                            <span>
                                                <b>{usd(p.medianCents)}</b>
                                                <i>Typical</i>
                                            </span>
                                        ) : null}
                                    </div>
                                ) : (
                                    /* A closed pool is LISTED, not hidden — a pack somebody saw yesterday
                                       that silently vanished is a pack they think they imagined. */
                                    <p className="pk-pick-shut-line">Resting — back soon</p>
                                )}
                            </article>
                        ))}
                    </div>
                </div>
            ) : null}

            <div className={`pk-arena${showPicker ? " pk-arena-picked" : ""}`}>
                {/* Behind everything, and only ever coloured AFTER the burst. */}
                <div className="pk-flood" aria-hidden="true" />
                {/* The white-out at the instant of detonation. One frame of nothing is what sells a bang —
                    it also covers the swap from bag to card, so the two are never both visible. */}
                <div className="pk-flash" aria-hidden="true" />
                {/* A ring leaving the blast, tier-coloured, because by this point the answer is known. */}
                <div className="pk-shock" aria-hidden="true" />

                <div className="pk-bagwrap">
                    {/* ⚠️ NOT WHILE THE PICKER IS UP. The bag in the carousel is the pack you are choosing;
                        a second one standing in the arena is the same question answered twice, and at this
                        size it lands on top of the controls. */}
                    {!blown && !showPicker ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        /* ⚠️ THE BAG THAT SHAKES IS THE ONE THAT WAS PICKED. Filmed on the first live open:
                           a crimson Pokémon pack was chosen and a BLACK bag shook apart — the arena art was
                           hardcoded to the house bag from back when there was only one. The carousel had
                           just spent a swipe teaching which pack this is, and the reveal contradicted it.

                           ⚠️ AND THE srcSet GOES WITH IT. The 900w variant only exists for the house bag;
                           pointing a recoloured pool at it would silently serve the black one on any screen
                           that chose the wide source. */
                        <img
                            className="pk-bag"
                            src={chosen?.art || "/images/packs/mystery-bag-drawn-600.webp"}
                            srcSet={chosen?.art ? undefined
                                : "/images/packs/mystery-bag-drawn-600.webp 600w, /images/packs/mystery-bag-drawn-900.webp 900w"}
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
                                {/* The gold wash that crosses the face as it is sold. It is on the FACE and
                                    not on .pk-card, because the card itself is carrying the shrink — a
                                    second transform on the same element would overwrite the first. */}
                                <span className="pk-card-cash" aria-hidden="true" />
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

                    {/* The card counted out into coins. Same container as the burst's debris, so it inherits
                        --blast and is thrown the same way on every screen size. */}
                    {coins ? (
                        <div className="pk-debris" aria-hidden="true">
                            {coins.map((c) => (
                                <span
                                    key={c.id}
                                    className="pk-coin"
                                    style={{
                                        "--a": `${c.angle}deg`,
                                        "--d": c.distance,
                                        "--sz": `${c.size}px`,
                                        "--spin": `${c.spin}deg`,
                                        "--delay": `${c.delay}ms`,
                                    }}
                                />
                            ))}
                        </div>
                    ) : null}

                    {/* The balance, where the card was. */}
                    {bank ? (
                        <PackBank
                            fromCents={bank.fromCents}
                            toCents={bank.toCents}
                            payoutCents={bank.payoutCents}
                            cardName={open?.card?.name}
                        />
                    ) : null}
                </div>
            </div>

            {/* ⚠️ THE SOLD SCREEN IS A DIFFERENT SCREEN, NOT THIS ONE WITH A LINE ADDED. Everything above the
                buttons here — the tier, the name, the market value — describes a card the member has just
                stopped owning, and none of it survives the sale. What takes its place is in the arena above:
                the payout, and the balance counting up to meet it. */}
            {phase === PHASE.readout && open && bank ? (
                <div className="pk-result pk-result-sold">
                    <div className="pk-done">
                        <p className="pk-done-line">Spends like cash here — no fees, no waiting.</p>
                        <div className="pk-actions">
                            <button type="button" className="pk-btn pk-btn-primary" onClick={reset} disabled={!canOpen}>
                                {canOpen ? "Open another" : "Done"}
                            </button>
                            <a className="pk-btn pk-btn-ghost" href="/marketplace/vault">Go to the vault</a>
                        </div>
                    </div>
                </div>
            ) : null}

            {phase === PHASE.readout && open && !bank ? (
                <div className="pk-result">
                    <p className="pk-tier" style={{ color: tier.glow }}>{tier.label}</p>
                    <h2 className="pk-name">{open.card.name}</h2>
                    {open.card.subtitle ? <p className="pk-sub">{open.card.subtitle}</p> : null}
                    <p className="pk-value">{usd(open.card.valueCents)}</p>
                    {open.bigHit ? <p className="pk-big">That&apos;s going on the board.</p> : null}

                    {choice === "vault" ? (
                        <div className="pk-done">
                            <p className="pk-done-line">Added to your vault.</p>
                            <div className="pk-actions">
                                <button type="button" className="pk-btn pk-btn-primary" onClick={reset} disabled={!canOpen}>
                                    {canOpen ? "Open another" : "Done"}
                                </button>
                                <a className="pk-btn pk-btn-ghost" href="/marketplace/vault">Go to the vault</a>
                            </div>
                        </div>
                    ) : (
                        <div className="pk-actions pk-actions-choice">
                        {/* ── TWO CHOICES, BOTH OF THEM WANTED ────────────────────────────────────────────
                            Luke: "Buttons to sell should be super sexy, and the take should be cta for add
                            to card vault."

                            ⚠️ "Keep it" ON A GHOST BUTTON WAS THE BUG, NOT THE STYLING. A grey outline next
                            to a filled gold one is the shape of a cancel — this site has trained people that
                            the quiet one is the way out. So the screen was quietly arguing for the sell on
                            every pull, including the ones somebody actually wants to own, and the vault —
                            the entire second half of this feature — was the button that looked like "no
                            thanks".

                            Both are CTAs now, and they are DIFFERENT ANIMALS: gold is cash, the vault is
                            jewel-toned and says what it does. Each carries its own second line so the choice
                            is legible without reading either label twice. */}
                            {/* ⚠️ THE BUTTON SHOWS WHAT WE WILL ACTUALLY PAY, AND THE SERVER SENT IT.
                                Sell-back is the counter's 60% trade rate, so the card's value and the
                                payout are two different numbers now — putting the value on the sell button
                                would be the screen quoting a price it is not going to honour. sellBackCents
                                arrives with the card; nothing here multiplies money by a rate. */}
                            <button
                                type="button"
                                className={`pk-cta pk-cta-sell${multiple ? " pk-cta-bank" : ""}`}
                                onClick={() => choose("sell")}
                                disabled={busy || Boolean(choice)}
                            >
                                <span className="pk-cta-kick">Sell back</span>
                                <span className="pk-cta-main">{usd(open.card.sellBackCents)}</span>
                                {/* ⚠️ THE CELEBRATION ONLY FIRES WHEN THERE IS SOMETHING TO CELEBRATE.
                                    packsWorth returns null below 1×, so a card that paid less than the pack
                                    cost says nothing here rather than reading "0.4× your pack" back to
                                    somebody at the moment they decide what to do about it. */}
                                {multiple ? (
                                    <span className="pk-cta-bank-line">{`${multiple}× your pack`}</span>
                                ) : null}
                                {/* ── ⚠️ THE RATE IS ON THIS BUTTON ON EVERY PULL, WITH NO EXCEPTIONS ──────
                                    Luke, 2026-10-27, looking at a $38.00 Victini offering $23.00: "The
                                    selling value should be clear that its 60 percent of the value."

                                    It used to be — until the pull was good enough to say "1.2× your pack",
                                    which REPLACED the rate line. So the disclosure vanished on exactly the
                                    cards where the gap between $38.00 and $23.00 is largest and the member
                                    is most likely to wonder about it, and the loudest, most celebratory
                                    version of this screen was the one that said least about what it was
                                    paying. The two facts are not alternatives: the multiple is the
                                    celebration and the rate is the disclosure, and the disclosure does not
                                    get to lose a fight with it for one line of space.

                                    ⚠️ AND IT NAMES THE FIGURE, not just the percentage — "60% of $38.00" is
                                    the arithmetic done where the member can check it. The payout rounds up
                                    to a quarter and floors at a dollar (see buyback.js), so what lands is
                                    always at or above what this line says. */}
                                <span className="pk-cta-sub">{rateLine}</span>
                                <span className="pk-cta-shine" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                className="pk-cta pk-cta-vault"
                                onClick={() => choose("vault")}
                                disabled={busy || Boolean(choice)}
                            >
                                <span className="pk-cta-kick">Keep it</span>
                                <span className="pk-cta-main">Card Vault</span>
                                {/* The full value lives on THIS button, because keeping is the path that
                                    gets it. Saying so is both the honest comparison and the better one. */}
                                <span className="pk-cta-sub">worth {usd(open.card.valueCents)}</span>
                                <span className="pk-cta-shine" aria-hidden="true" />
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
                            {/* ⚠️ A RESTING POOL IS NOT AN EMPTY ONE. Yu-Gi-Oh is shut because one card
                                carries its value, not because we ran out — and "Out of packs" told a member
                                the shelf was bare when it holds fifty-one cards. The card behind this button
                                says "Resting — back soon"; the button has to agree with it. */}
                            {!priceTrusted
                                ? "Pack pricing unavailable"
                                : chosen && !chosen.open
                                    ? "Resting — back soon"
                                    : canOpen || shortfall > 0
                                        ? `Open ${chosen && pools.length > 1 ? chosen.brand : "a pack"} — ${usd(priceCents)}`
                                        : "Out of packs"}
                        </button>
                    )}
                    <p className="pk-fine">Opens are final. The card is yours either way.</p>
                </div>
            ) : null}

            {shelfOpen && (chosen || pool) ? (
                <div className="pk-shelf" role="dialog" aria-label="What is in the packs">
                    <div className="pk-shelf-head">
                        <strong>
                            {chosen && pools.length > 1
                                ? `${chosen.brand} — ${chosen.units} inside`
                                : `${pool.remaining} packs left`}
                        </strong>
                        <button
                            type="button"
                            className="pk-btn pk-btn-ghost"
                            onClick={() => { setShelfOpen(false); setPeek(null); }}
                        >
                            Close
                        </button>
                    </div>
                    <p className="pk-shelf-note">
                        Every card still in the pool, best first. This is the same pool the shop counter is
                        selling from, so it moves.
                    </p>
                    {/* ── THE ODDS, WHERE THE HOUSE ALREADY DECIDED ODDS GO ────────────────────────────
                        Not on the carousel face, where it would read as a disclaimer — one tap in, on the
                        way to spending, for somebody who has asked. Same rule the chests follow, and it is
                        computed off the same pool query the pull uses rather than typed. */}
                    {chosen?.beatsBp != null ? (
                        <p className="pk-shelf-odds">
                            {`${(chosen.beatsBp / 100).toFixed(0)}% of cards in here are worth ${usd(priceCents)} or more.`}
                        </p>
                    ) : null}
                    {/* ── THE CARD, NOT A ROW OF TEXT ──────────────────────────────────────────────────
                        Luke, 2026-10-27: "the modal isnt dopamine enough it should show sprites and
                        rarity colors". It was a price list — a name, a grey line, a figure — for a screen
                        whose only job is to make you want to open the pack. The art is already on every
                        row (inventory_feed.image_url, which the carousel face never had room for), and
                        the rarity colour was already computed and was being thrown at a 3px left edge.
                        Both now carry their weight: a real thumbnail lit by its own tier, and the tier
                        named in words next to the price so the colour means something.

                        ⚠️ `tierByKey` FALLS BACK TO COMMON ON UNDEFINED. That is why every shelf-pool
                        card was grey — see the note in shelfPoolCards. If a row here is the wrong
                        colour, the card's `tier` is missing on the server, not broken here. */}
                    <ul className="pk-shelf-list">
                        {((chosen && pools.length > 1 ? chosen.cards : pool.cards) || []).map((card) => {
                            const t = tierByKey(card.tier);
                            return (
                                <li key={card.id} style={{ "--row-edge": t.edge, "--row-glow": t.glow }}>
                                    {/* ⚠️ A BUTTON, NOT AN onClick ON THE <li>. The row is the tap target and
                                        it has to be reachable by keyboard and announce itself; a clickable
                                        list item is neither. The button fills the row and the layout above
                                        moves onto it unchanged. */}
                                    <button
                                        type="button"
                                        className="pk-shelf-row"
                                        onClick={() => { Haptic.tap(); setPeek(card); }}
                                        aria-label={`${card.name}, ${usd(card.valueCents)}, ${t.label}`}
                                    >
                                    <span className="pk-shelf-art">
                                        {card.imageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={card.imageUrl} alt="" loading="lazy" decoding="async" />
                                        ) : (
                                            <span className="pk-shelf-art-none" aria-hidden="true" />
                                        )}
                                    </span>
                                    <span className="pk-shelf-text">
                                        <span className="pk-shelf-name">{card.name}</span>
                                        {card.subtitle ? <span className="pk-shelf-sub">{card.subtitle}</span> : null}
                                    </span>
                                    <span className="pk-shelf-right">
                                        <span className="pk-shelf-value">{usd(card.valueCents)}</span>
                                        <span className="pk-shelf-tier">{t.label}</span>
                                    </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    {/* ── THE CARD, BIG ───────────────────────────────────────────────────────────────
                        Luke, 2026-10-27: "I need to be able to click the cards and have it show me
                        details and a better view of the card."

                        It sits INSIDE .pk-shelf rather than beside it, so closing the sheet closes this
                        too and there is never a card floating over a dismissed list. Tap anywhere to
                        close — the whole backdrop is the target, because a 44px × on a phone held
                        one-handed is a worse answer than "tap it again".

                        ⚠️ THE ART IS THE SAME URL THE ROW USED. inventory_feed.image_url is Square's
                        own photo of the actual card in the case, not a stock scan — which is the point:
                        condition is a number on a row and a thing you can SEE here. It is served at its
                        native size, so object-fit: contain and no upscaling beyond it. */}
                    {peek ? (
                        <div
                            className="pk-peek"
                            role="dialog"
                            aria-label={peek.name}
                            onClick={() => setPeek(null)}
                        >
                            {/* ⚠️ THE WAY OUT CANNOT BE BELOW THE FOLD. The only close was the button at the
                                bottom of the card, and on a tall card photo that sits off-screen — Luke,
                                2026-10-27: "No way to close without scrolling down." Tapping the backdrop
                                worked, but the card fills nearly the whole sheet, so there was barely any
                                backdrop left to hit. This X is pinned to the OVERLAY rather than to the
                                card, so it cannot scroll away with the card's contents. */}
                            <button
                                type="button"
                                className="pk-peek-close"
                                onClick={(e) => { e.stopPropagation(); setPeek(null); }}
                                aria-label="Close card"
                            >
                                ×
                            </button>
                            <div
                                className="pk-peek-card"
                                style={{ "--row-glow": tierByKey(peek.tier).glow }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="pk-peek-art">
                                    {peek.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={peek.imageUrl} alt={peek.name} />
                                    ) : (
                                        <div className="pk-peek-none">No photo on file</div>
                                    )}
                                </div>
                                <div className="pk-peek-body">
                                    <h4 className="pk-peek-name">{peek.name}</h4>
                                    {peek.subtitle ? <p className="pk-peek-sub">{peek.subtitle}</p> : null}
                                    <div className="pk-peek-rows">
                                        <div>
                                            <span>Shelf price</span>
                                            <strong>{usd(peek.valueCents)}</strong>
                                        </div>
                                        <div>
                                            <span>Rarity in this pack</span>
                                            <strong style={{ color: tierByKey(peek.tier).glow }}>
                                                {tierByKey(peek.tier).label}
                                            </strong>
                                        </div>
                                        {/* ⚠️ SENT BY THE SERVER, NEVER MULTIPLIED HERE. The sell-back rate
                                            lives in buyback.js and the moment a client works it out there
                                            are two implementations of one number, one of them in a bundle
                                            somebody is still running from cache. */}
                                        {peek.sellBackCents != null ? (
                                            <div>
                                                <span>Sells back for</span>
                                                <strong>{usd(peek.sellBackCents)}</strong>
                                            </div>
                                        ) : null}
                                    </div>
                                    {/* The bottom Close is GONE, not moved. It was the tallest thing below the
                                        figures and therefore the thing pushing itself off-screen; the pinned
                                        X above replaces it and costs no height at all. */}
                                    <p className="pk-peek-note">
                                        Photographed in the shop. Pull it and it is yours — keep it or sell it
                                        straight back for store credit.
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
