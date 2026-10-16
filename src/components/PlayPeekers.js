"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { memberSession } from "@/lib/member-session-client";

// ── GAMIFYING THE FUNNEL ─────────────────────────────────────────────────────────────────────────────────────
// Luke: "I would think if you arent logged in you should see fun stuff pop out from the sides and jiggle
// around and tempt you to sign up. Like a chest or boss or ship, things to tempt you into joining and also
// help you understand the context of the ask and the game ... regardless of page you are on if you aren't
// logged in."
//
// The sign-up page was built and then had ONE visitor in two days, because the only door to it was a button
// on the second card of the home page. Sixty people a day arrive and almost all of them land on the shop or a
// product. So the pitch stops waiting on a page nobody walks to, and goes and finds them.
//
// ⚠️ EACH ONE TEACHES SOMETHING, AND THAT IS HALF THE ASK. A sprite that jiggles is a decoration; a sprite
// that says what it IS turns a stranger's "what is this" into the reason to press. So every peeker carries
// one short sentence of game, and the first one anybody sees is the one about real cards — the actual hook,
// and the thing a card shop's visitors already care about.
//
// ⚠️ AND IT COSTS NO REQUEST. This mounts in the root layout, which means it runs on every page of the site
// for every visitor: the rule in CLAUDE.md is that such a thing may read at most ONE endpoint, and this one
// reads none of its own. `memberSession` hands it the answer SiteHeader was already fetching. The sprites are
// static files the site already serves. Nothing here touches the database.

// Who comes out, in order. Six corners of the game, so three page views in a row are three different ideas
// rather than the same chest three times.
//
// ⚠️ THE PRIZE ONE IS FIRST ON PURPOSE. It is the only line that answers "why would I" in a sentence, and on
// a card shop's website it is the one claim the audience already values. The rest are breadth — they exist to
// say "this is bigger than you think", which is the other half of what a stranger is missing.
const PEEKERS = [
    {
        id: "boss",
        art: "/images/grove/boss-great_weaver.webp",
        line: "The pack fights a boss every week. Beat it and real cards go home with somebody.",
        tag: "Weekly boss",
    },
    {
        id: "chest",
        art: "/images/delves/ev-chest.webp",
        line: "Chests drop while you play. Free, and there is one waiting the day you start.",
        tag: "Loot",
    },
    {
        id: "ship",
        art: "/images/fleet/fleet_assize.png",
        line: "You get a ship. It sails without you and comes home heavier than it left.",
        tag: "The Fleet",
    },
    {
        id: "class",
        art: "/images/arena/class/reaver.webp",
        line: "Pick a class, learn a skill tree, climb a ladder of real opponents.",
        tag: "The Arena",
    },
    {
        id: "gem",
        art: "/images/gems/ruby_t5.png",
        line: "Socket gems into gear worth chasing for months.",
        tag: "The Forge",
    },
    {
        id: "fish",
        art: "/images/fish/fish_anglerfish.png",
        line: "There is a lake in here too. Of course there is.",
        tag: "Fishing",
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
const FIRST_MS = 7000;      // after landing
const GAP_MS = 26000;       // between one ducking out and the next arriving
const SHOW_MS = 11000;      // how long one waits to be pressed before it gives up
const MAX_PER_VISIT = 4;    // and then it stops asking for this visit

const SEEN_KEY = "wolfden-peek-seen";     // how many this visit (sessionStorage — resets with the tab)
const OFF_KEY = "wolfden-peek-off";       // dismissed, with a date (localStorage)
const OFF_DAYS = 7;

export default function PlayPeekers() {
    const pathname = usePathname();
    const muted = useMemo(() => MUTED.test(pathname || "/"), [pathname]);
    // { i, side, phase } — phase is "in" while it is on screen, "out" while it ducks away.
    const [peek, setPeek] = useState(null);
    const timers = useRef([]);
    const stopped = useRef(false);
    // ⚠️ READ ONCE AND HELD, because this component is in the LAYOUT and survives navigation. Re-reading
    // storage on every pathname change would restart the count on a visitor who is browsing, which is how
    // "tempting" turns into "every page of this shop shouts at me".
    const countRef = useRef(null);

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

    // ── THE CHAIN ────────────────────────────────────────────────────────────────────────────────────
    // Wait, come out, wait to be pressed, duck away, wait again. Scheduled rather than run on an interval so
    // the gap is measured from when the last one LEFT, not from a clock that kept running while one was on
    // screen — otherwise a visitor who reads a long product page gets two at once.
    //
    // ⚠️ IT IS A PLAIN FUNCTION INSIDE THE EFFECT, NOT A useCallback. The chain is recursive — the last beat
    // schedules the next one — and a memoised callback that names itself is the dependency knot the hook
    // lint refuses outright. Declared here it closes over `alive`, which is also what stops a timer from a
    // torn-down effect waking up and starting a fresh chain alongside the live one.
    useEffect(() => {
        // ⚠️ A MUTED PAGE JUST RENDERS NOTHING — it does NOT reach in and clear the state. Calling a setter
        // from an effect body is the cascading-render shape the lint gate refuses, and it is unnecessary:
        // the guard at the bottom of this component hides it, and the timers already scheduled take it down
        // on their own clock. Walking into the game and back out therefore leaves the chain intact rather
        // than silently ending the visit's pitch.
        if (muted) return undefined;
        if (stopped.current) return undefined;
        // Already running (a navigation inside the same layout) — leave the chain alone.
        if (countRef.current !== null) return undefined;

        let alive = true;
        const hold = (fn, at) => { timers.current.push(setTimeout(fn, at)); };
        const run = (delay) => {
            hold(() => {
                if (!alive || stopped.current) return;
                const n = countRef.current ?? 0;
                if (n >= MAX_PER_VISIT) { stopped.current = true; return; }
                countRef.current = n + 1;
                try { sessionStorage.setItem(SEEN_KEY, String(n + 1)); } catch { /* private mode */ }
                // Alternating sides, so two in a row are not the same movement in the same corner.
                setPeek({ i: n % PEEKERS.length, side: n % 2 === 0 ? "right" : "left", phase: "in" });
                hold(() => setPeek((p) => (p ? { ...p, phase: "out" } : p)), SHOW_MS);
                hold(() => { setPeek(null); run(GAP_MS); }, SHOW_MS + 700);
            }, delay);
        };

        (async () => {
            try {
                const off = Number(localStorage.getItem(OFF_KEY) || 0);
                if (off && Date.now() - off < OFF_DAYS * 86400000) { stopped.current = true; return; }
                countRef.current = Number(sessionStorage.getItem(SEEN_KEY) || 0);
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

    useEffect(() => () => clearTimers(), [clearTimers]);

    if (!peek || muted) return null;
    const p = PEEKERS[peek.i];

    return (
        <div className={`peek peek-${peek.side} is-${peek.phase}`} role="complementary" aria-label="About the Wolf Den game">
            <Link href="/play" className="peek-body" onClick={stop}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="peek-art" src={p.art} alt="" width="76" height="76" loading="lazy" decoding="async" draggable={false} />
                <span className="peek-words">
                    <b className="peek-tag">{p.tag}</b>
                    <span className="peek-line">{p.line}</span>
                    <span className="peek-cta">Play free — no download →</span>
                </span>
            </Link>
            <button type="button" className="peek-x" onClick={dismiss} aria-label="Hide this">
                <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
                    <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                </svg>
            </button>
        </div>
    );
}
