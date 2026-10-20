"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { memberSession } from "@/lib/member-session-client";

// ── GAMIFYING THE FUNNEL ─────────────────────────────────────────────────────────────────────────────────────
// Luke: "if you arent logged in you should see fun stuff pop out from the sides and jiggle around and tempt
// you to sign up ... a chest or boss or ship ... and also help you understand the context of the ask and the
// game ... regardless of page you are on if you aren't logged in." Then: "Make sure its super cool looking
// and has lots of dopamine. Did you riff off what I talked about or did you simply just do my 3 examples?"
//
// The first cut WAS just the three examples: six sprites, one sentence each, a link. An advert with a jiggle.
//
// ⚠️ THE RIFF IS THAT YOU CAN CATCH THEM. "Gamify the funnel" taken literally — a stranger does not need to
// be TOLD the game is fun, they need a go on it, and the one thing we can hand somebody with no account is
// the loop itself: something appears, you grab it, it bursts, a number goes up, and the next one arrives
// FASTER. That is the dopamine shape of every reward in the Den, delivered in the margin of a shop page,
// before anybody has typed an email address.
//
// So a peeker is a catch, not a banner. Tap it and it pops into a burst of loot, the bag fills by one, and
// the thing that was a link becomes the receipt. Catch all five and the ask lands as the payoff for a game
// they have just played rather than as the price of reading on.
//
// ⚠️ EVERY WORD OF IT IS TRUE, WHICH IS THE PART THAT WAS EASIEST TO GET WRONG. The tempting finale was
// "your chest is waiting" — it is not. createBuyer gives a new member an avatar, an alias and starter seeds,
// and no chest. What IS true is the line the home page has carried all along and that boss.js actually pays:
// everyone who fights the weekly boss earns a loot chest and a ticket for the real cards. The finale says
// that and nothing more. A funnel that lies is a refund request with extra steps.
//
// ⚠️ AND IT COSTS NO REQUEST. This mounts in the root layout, so it runs on every page for every visitor:
// CLAUDE.md's rule is that such a thing reads at most ONE endpoint, and this one reads none of its own —
// `memberSession` hands it the answer SiteHeader was already fetching. The sprites are files the site
// already serves, and the burst is CSS.

// The hoard, in catch order. Five, not six: a bag that fills in five is one somebody can finish inside a
// visit to a shop, and an unfinished collection is a worse feeling than never having been offered one.
//
// ⚠️ THE BOSS IS FIRST ON PURPOSE. It is the only line that answers "why would I" to somebody who came here
// to buy cards, so it has to survive being the one peeker a bouncing visitor ever sees. The rest are breadth
// — they say "this is bigger than you think", which is the other half of what a stranger is missing.
const HOARD = [
    {
        id: "boss",
        art: "/images/grove/boss-great_weaver.webp",
        tag: "Weekly boss",
        line: "The whole pack fights one of these every week. Real cards go home with somebody.",
        got: "The Great Weaver",
        tone: "boss",
    },
    {
        id: "chest",
        art: "/images/delves/ev-chest.webp",
        tag: "Loot",
        line: "Chests drop the whole time you play. This one fell out of a delve.",
        got: "A sealed chest",
        tone: "loot",
    },
    {
        id: "ship",
        art: "/images/fleet/fleet_assize.png",
        tag: "The Fleet",
        line: "You get a ship. It sails without you and comes home heavier than it left.",
        got: "A ship of your own",
        tone: "sea",
    },
    {
        id: "class",
        art: "/images/arena/class/reaver.webp",
        tag: "The Arena",
        line: "Pick a class, learn a skill tree, climb a ladder of real opponents.",
        got: "The Reaver",
        tone: "blood",
    },
    {
        id: "fish",
        art: "/images/fish/fish_anglerfish.png",
        tag: "Fishing",
        line: "There is a lake in here too. Of course there is.",
        got: "Something from the deep",
        tone: "deep",
    },
];

// ⚠️ WHERE IT MUST NOT GO. Three kinds of page, each for its own reason:
//   · the game and the sign-up page — the pitch IS the page; a peeker there is the advert on top of itself.
//   · the admin screens — that is Luke working, not a visitor being converted.
//   · anything to do with paying — a thing that slides in and wobbles while somebody is entering a card
//     number is not a funnel, it is a reason to abandon a basket.
const MUTED = /^\/(marketplace|play|admin|checkout)(\/|$)|\/(checkout|cart)(\/|$)|^\/shop\/(account|orders)(\/|$)/;

// The beats. Late enough that the page has been read first — a peeker that arrives before the visitor has
// seen what they came for is an interruption rather than an invitation.
//
// ⚠️ THE GAP SHRINKS WITH EVERY CATCH, AND THAT IS THE ESCALATION. A fixed interval is a timer; a
// shortening one is a game noticing that you are playing. Anybody who ignores them stays on the long
// spacing, so the only person who gets chased is the person enjoying it.
const FIRST_MS = 6500;
const GAP_MS = [26000, 17000, 12000, 9000, 7000];
const SHOW_MS = 11000;      // how long an uncaught one waits before it gives up
const CAUGHT_MS = 2800;     // how long the receipt stays before it ducks away
const FINALE_MS = 11000;    // the full-bag card gets longer, because it carries the ask
const OUT_MS = 560;

const SEEN_KEY = "wolfden-peek-seen";     // how many have ARRIVED this visit (sessionStorage)
const BAG_KEY = "wolfden-peek-bag";       // how many have been CAUGHT this visit
const OFF_KEY = "wolfden-peek-off";       // dismissed, with a date (localStorage)
const OFF_DAYS = 7;

// The burst. Rolled once per catch and handed to the DOM as custom properties, so twelve pieces cost the
// compositor twelve transforms off ONE keyframe rather than twelve animations to parse. The same trick the
// Hallowe'en candy explosion uses, and the reason a burst this size is free on a mid-range phone.
function rollBurst(seed) {
    return Array.from({ length: 12 }, (_, i) => {
        const a = (-150 + ((i * 37 + seed * 13) % 120)) * (Math.PI / 180);
        const v = 40 + ((i * 19 + seed * 7) % 46);
        return {
            i,
            dx: Math.round(Math.cos(a) * v),
            dy: Math.round(Math.sin(a) * v),
            rot: ((i * 61 + seed * 29) % 360) - 180,
            size: 5 + ((i * 11 + seed) % 6),
            delay: ((i * 13) % 9) / 100,
            kind: i % 3,
        };
    });
}

export default function PlayPeekers() {
    const pathname = usePathname();
    const muted = useMemo(() => MUTED.test(pathname || "/"), [pathname]);
    // { i, side, phase, caught, full, burst } — phase is "in" on screen, "out" while it ducks away.
    const [peek, setPeek] = useState(null);
    const [bag, setBag] = useState(0);
    const timers = useRef([]);
    const stopped = useRef(false);
    const bagRef = useRef(0);
    // ⚠️ READ ONCE AND HELD, because this component is in the LAYOUT and survives navigation. Re-reading
    // storage on every pathname change would restart the run for a visitor who is browsing, which is how
    // "tempting" turns into "every page of this shop shouts at me".
    const countRef = useRef(null);
    const nextRef = useRef(null);
    // What is on screen, for the catch handler to read without depending on the render that made it.
    const peekRef = useRef(null);

    const clearTimers = useCallback(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
    }, []);

    const stop = useCallback(() => {
        stopped.current = true;
        clearTimers();
        setPeek(null);
    }, [clearTimers]);

    const dismiss = useCallback(() => {
        try { localStorage.setItem(OFF_KEY, String(Date.now())); } catch { /* private mode */ }
        stop();
    }, [stop]);

    // ── THE CATCH ───────────────────────────────────────────────────────────────────────────────────
    // The beat the whole thing exists for. It does NOT navigate: the first tap is the reward, and the way
    // in is what the receipt turns into. A tap that silently became a page load would have spent the only
    // moment of game a stranger gets on a redirect.
    //
    // ⚠️ EVERY SIDE EFFECT HAPPENS HERE, NOT INSIDE A setPeek UPDATER, AND ONE TAP USED TO COUNT TWICE.
    // The first cut bumped the bag, wrote sessionStorage, buzzed the phone and scheduled the next peeker
    // from inside the updater — and React calls an updater twice on purpose to catch impurity, so a single
    // catch took the bag from 0 to 2 on film. The visible count was the lucky part; the duplicated timers
    // were the half that would have put two peekers on screen at once later. The updater is a value now.
    const grab = useCallback(() => {
        const p = peekRef.current;
        if (!p || p.caught) return;
        const n = Math.min(HOARD.length, bagRef.current + 1);
        bagRef.current = n;
        setBag(n);
        try { sessionStorage.setItem(BAG_KEY, String(n)); } catch { /* private mode */ }
        // Real haptics where they exist. A no-op on desktop and on iOS Safari, which is the right failure:
        // nothing to feature-detect and nothing to apologise for.
        try { navigator.vibrate?.(14); } catch { /* ok */ }
        clearTimers();
        const full = n >= HOARD.length;
        const stay = full ? FINALE_MS : CAUGHT_MS;
        const hold = (fn, at) => { timers.current.push(setTimeout(fn, at)); };
        hold(() => setPeek((q) => (q ? { ...q, phase: "out" } : q)), stay);
        hold(() => {
            setPeek(null);
            if (full) { stopped.current = true; return; }
            nextRef.current?.(GAP_MS[Math.min(n, GAP_MS.length - 1)]);
        }, stay + OUT_MS);
        setPeek({ ...p, caught: true, full, burst: rollBurst(n) });
    }, [clearTimers]);

    // ── THE CHAIN ────────────────────────────────────────────────────────────────────────────────────
    // Wait, come out, wait to be caught, duck away, wait again. Scheduled rather than run on an interval so
    // the gap is measured from when the last one LEFT, not from a clock that kept running while one was on
    // screen — otherwise a visitor reading a long product page gets two at once.
    //
    // ⚠️ A PLAIN FUNCTION INSIDE THE EFFECT, NOT A useCallback. The chain is recursive — the last beat
    // schedules the next — and a memoised callback that names itself is the dependency knot the hook lint
    // refuses outright. Declared here it also closes over `alive`, which is what stops a timer belonging to
    // a torn-down effect from starting a second chain beside the live one.
    useEffect(() => {
        // ⚠️ A MUTED PAGE JUST RENDERS NOTHING — it does NOT reach in and clear the state. Calling a setter
        // from an effect body is the cascading-render shape the lint gate refuses, and it is unnecessary:
        // the guard at the bottom hides it, and the timers already scheduled take it down on their own
        // clock. Walking into the game and back out therefore leaves the run intact.
        if (muted) return undefined;
        if (stopped.current) return undefined;
        if (countRef.current !== null) return undefined;

        let alive = true;
        const hold = (fn, at) => { timers.current.push(setTimeout(fn, at)); };
        const run = (delay) => {
            hold(() => {
                if (!alive || stopped.current) return;
                const n = countRef.current ?? 0;
                if (n >= HOARD.length) { stopped.current = true; return; }
                countRef.current = n + 1;
                try { sessionStorage.setItem(SEEN_KEY, String(n + 1)); } catch { /* ok */ }
                // Alternating sides, so two in a row are not the same movement in the same corner.
                setPeek({ i: n, side: n % 2 === 0 ? "right" : "left", phase: "in", caught: false, burst: null });
                // An UNCAUGHT one gives up on its own clock. A caught one is on grab()'s instead, which is
                // why that function clears these two first.
                hold(() => setPeek((p) => (p && !p.caught ? { ...p, phase: "out" } : p)), SHOW_MS);
                hold(() => {
                    setPeek((p) => (p && !p.caught ? null : p));
                    if (!stopped.current) run(GAP_MS[Math.min(bagRef.current, GAP_MS.length - 1)]);
                }, SHOW_MS + OUT_MS);
            }, delay);
        };
        nextRef.current = run;

        (async () => {
            try {
                const off = Number(localStorage.getItem(OFF_KEY) || 0);
                if (off && Date.now() - off < OFF_DAYS * 86400000) { stopped.current = true; return; }
                countRef.current = Number(sessionStorage.getItem(SEEN_KEY) || 0);
                bagRef.current = Number(sessionStorage.getItem(BAG_KEY) || 0);
                setBag(bagRef.current);
            } catch { countRef.current = 0; }
            // ⚠️ MEMBERS NEVER SEE IT. The whole thing is an ask to sign up, and asking somebody who signed
            // up months ago is the clearest possible signal that nothing here knows who they are.
            const buyer = await memberSession();
            if (!alive) return;
            if (buyer) { stopped.current = true; return; }
            run(FIRST_MS);
        })();
        return () => { alive = false; };
    }, [muted]);

    useEffect(() => { peekRef.current = peek; }, [peek]);

    useEffect(() => () => clearTimers(), [clearTimers]);

    if (!peek || muted) return null;
    const h = HOARD[peek.i];
    const full = Boolean(peek.caught && peek.full);

    return (
        <div
            className={`peek peek-${peek.side} is-${peek.phase} tone-${h.tone}${peek.caught ? " is-caught" : ""}${full ? " is-full" : ""}`}
            role="complementary"
            aria-label="The Wolf Den game"
        >
            <div className="peek-body">
                <div className="peek-artwrap">
                    {/* The glow is its own element so it can pulse without touching the sprite's jiggle —
                        two animations writing one transform is the fight that silently cancels one. */}
                    <span className="peek-glow" aria-hidden="true" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="peek-art" src={h.art} alt="" width="76" height="76" loading="lazy" decoding="async" draggable={false} />
                    {peek.burst ? (
                        <span className="peek-burst" aria-hidden="true">
                            {peek.burst.map((b) => (
                                <i
                                    key={b.i}
                                    className={`peek-bit k${b.kind}`}
                                    style={{
                                        "--dx": `${b.dx}px`, "--dy": `${b.dy}px`, "--rot": `${b.rot}deg`,
                                        width: `${b.size}px`, height: `${b.size}px`, animationDelay: `${b.delay}s`,
                                    }}
                                />
                            ))}
                        </span>
                    ) : null}
                </div>

                <div className="peek-words">
                    {peek.caught ? (
                        <>
                            <b className="peek-tag peek-got">Caught — {h.got}</b>
                            <span className="peek-line">
                                {full
                                    ? "That is the whole hoard. Everyone who fights the weekly boss earns a loot chest and a ticket for the real cards."
                                    : "In the bag. There is a great deal more of this inside."}
                            </span>
                        </>
                    ) : (
                        <>
                            <b className="peek-tag">{h.tag}</b>
                            <span className="peek-line">{h.line}</span>
                        </>
                    )}

                    {/* The bag. Pips rather than a number, because a number is a score and a row of pips is
                        a SET — and a set with two of five filled is the thing that makes somebody want the
                        other three. */}
                    <span className="peek-bag" aria-label={`${bag} of ${HOARD.length} caught`}>
                        {HOARD.map((x, i) => (
                            <i key={x.id} className={`peek-pip${i < bag ? " is-on" : ""}${peek.caught && i === bag - 1 ? " is-new" : ""}`} />
                        ))}
                        <span className="peek-bagn">{bag}/{HOARD.length}</span>
                    </span>

                    {/* ── ⚠️ THE LINK IS ALWAYS THERE NOW, NOT ONLY ONCE YOU HAVE CAUGHT ONE ──────────
                        This used to show "Tap to catch it" and nothing else until the pill was tapped, so
                        the ONLY door into the game was behind a deliberate interaction with a floating card
                        that has a big ✕ on it. The most button-like thing on it was the close button.

                        Measured on the day the 30th promo went out: 119 signed-out visitors, 57 of them on
                        shop pages, 30 on the product itself — and four signups, which is the ordinary daily
                        number and three of those were within eight minutes of each other, so almost
                        certainly people standing at the counter. The traffic more than doubled and the
                        conversion did not move at all.

                        A visitor who is there to look at one product does not play a five-stage catching
                        game to find out there is a game. The catch is still there and still pays its set —
                        it is just no longer the toll gate in front of the only link. */}
                    <Link href="/play" className="peek-go" onClick={stop}>
                        {full ? "Claim your character — free" : peek.caught ? "See the rest — free" : "Play free — no download"}
                    </Link>
                    {peek.caught ? null : <span className="peek-hint">…or tap the sprite to catch it</span>}
                </div>
            </div>

            {/* ⚠️ THE WHOLE PILL IS THE CATCH TARGET, and it is a real button over the card rather than a
                handler on a div — so it is reachable by keyboard and announces what it does. It is removed
                once caught, which is what lets the link underneath be pressed. */}
            {!peek.caught ? (
                <button type="button" className="peek-hit" onClick={grab} aria-label={`Catch ${h.got} — about the Wolf Den game`} />
            ) : null}

            <button type="button" className="peek-x" onClick={dismiss} aria-label="Hide this">
                <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
                    <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                </svg>
            </button>
        </div>
    );
}
