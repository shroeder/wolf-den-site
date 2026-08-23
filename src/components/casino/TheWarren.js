"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cas } from "@/components/casino/casino-audio.js";
import { Haptic, unlock } from "@/components/arena/arena-audio.js";

// ── THE WARREN ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke, describing the machine he wants this to feel like: "you pick an egg and it kind of bounces and then
// something pops out, most of the time it's these little ducks and they jump out one by one and they keep
// adding up the score over and over again till they're done jumping out... eventually you either pick the bear
// which ends the bonus or you get [the hero] and it's this huge event and then it goes to the next screen
// that's a new background, the eggs look better and you just keep going."
//
// THE THING THAT MAKES IT NOT THE PICK HE THREW OUT is that a tap opens a SEQUENCE. The burrow shakes, and
// then the critters come out one at a time, and the total climbs with each one, and you do not know how many
// are coming. A pick that resolves to a number the instant you touch it has one beat. This has as many beats
// as there are animals, and the count is itself the suspense.
//
// So the animation is not decoration here, it IS the feature, and it is built out of four separate timings
// that must not be collapsed into one:
//
//   SHAKE    ~700ms   the burrow rocks before anything comes out. This is the whole reason it works: the
//                     pause is where the player decides what they are hoping for.
//   HOP      ~340ms   each critter, one at a time, arcing out and landing. The gap is deliberately long
//                     enough to read as individuals rather than as a burst.
//   COUNT    with it  the round total ticks up per critter rather than jumping once at the end.
//   SETTLE   ~600ms   a beat before the board is live again, so the last animal is not stepped on.
//
// Everything is decided on the server before the first tap; this screen only reveals. See runWarren.

const STAGE_ART = {
    hollow: "/images/delves/bg-hollow-rest.webp",
    sunken: "/images/delves/bg-sunken-rest.webp",
    ember: "/images/delves/bg-ember-rest.webp",
    astral: "/images/delves/bg-astral-rest.webp",
    kinghoard: "/images/delves/rare-orchardheart.webp",
};
const HOARD_ART = "/images/delves/rare-kinghoard.webp";
const MOTHER_ART = "/images/delves/foe-warren-mother.webp";

const SHAKE_MS = 700;
const HOP_MS = 340;
const SETTLE_MS = 600;

export default function TheWarren({ warren, onDone }) {
    // Where we are: which stage, and which room. `at` counts burrows OPENED on this stage, which is also the
    // index into that stage's `opened` list — the server decided the order, this only walks it.
    const [stage, setStage] = useState(0);
    const [at, setAt] = useState(0);
    const [busy, setBusy] = useState(false);
    const [shaking, setShaking] = useState(-1);     // which burrow is rocking
    const [hops, setHops] = useState([]);           // critters currently out, with their chips
    const [won, setWon] = useState(0);
    const [banner, setBanner] = useState(null);     // "elder" | "mother" | "hoard"
    const [inHoard, setInHoard] = useState(false);
    const [done, setDone] = useState(false);
    // Which board slots have been opened, so a burrow cannot be picked twice and the room visibly empties.
    const [spent, setSpent] = useState([]);
    const timers = useRef([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const wait = (ms) => new Promise((r) => timers.current.push(setTimeout(r, ms)));

    const stages = useMemo(() => warren?.stages || [], [warren]);
    const cur = stages[stage];
    const room = inHoard ? "kinghoard" : (cur?.key || "hollow");
    const pool = warren?.art?.pets?.[room] || [];
    const hoard = warren?.hoard;

    // The burrows on screen. In the warren proper there are nine; in the Hoard there are six mounds.
    const slots = inHoard ? (hoard?.mounds || 6) : (warren?.board || 9);

    // ── OPENING ONE ──────────────────────────────────────────────────────────────────────────────────────
    // The tapped burrow is not the one the server chose — the server chose an ORDER, and this maps the slot
    // the finger landed on to the next thing in that order. Which is the honest way round: pretending the
    // member's choice of slot decides the outcome would be a lie, and pretending it does not matter which
    // slot they touched would look broken.
    const open = useCallback(async (slot) => {
        if (busy || done || spent.includes(slot)) return;
        unlock();
        setBusy(true);
        setSpent((p) => [...p, slot]);
        setShaking(slot);
        Cas.reelStop(1, 0.45);
        Haptic.hit(0.3);
        await wait(SHAKE_MS);
        setShaking(-1);

        const next = inHoard ? hoard?.opened?.[at] : cur?.opened?.[at];
        if (!next) { setBusy(false); return; }

        if (next.kind === "pups" || next.kind === "mound") {
            // ── THEY COME OUT ONE AT A TIME ──────────────────────────────────────────────────────────────
            // The heart of it. Each one hops, lands, and adds — and because the count is not known in
            // advance, every extra animal is a small escalation on its own.
            const list = next.kind === "mound" ? [next.chips] : next.pups;
            for (let i = 0; i < list.length; i += 1) {
                const chips = list[i];
                setHops((p) => [...p, {
                    id: `${stage}-${at}-${i}-${slot}`,
                    slot,
                    chips,
                    art: pool.length ? pool[(i + at + stage) % pool.length] : null,
                    // Fanned out so five animals out of one burrow do not stack into one shape.
                    dx: (i - (list.length - 1) / 2) * 34 + (i % 2 ? 6 : -6),
                    lift: 54 + (i % 3) * 16,
                }]);
                setWon((n) => n + chips);
                // Rising pitch down the line, so a long train sounds like a build rather than a loop.
                Cas.coin(Math.min(4, i));
                Haptic.hit(0.28 + Math.min(0.4, i * 0.06));
                await wait(HOP_MS);
            }
            await wait(SETTLE_MS);
            setHops([]);
            setAt((n) => n + 1);
            setBusy(false);
            return;
        }

        if (next.kind === "elder") {
            // ── THE ELDER, AND DOWN A LEVEL ──────────────────────────────────────────────────────────────
            // The big event. Everything stops, the room is named, and then the whole board is replaced by a
            // deeper one. Luke: "he like congratulates you and it's this huge event and then it goes to the
            // next screen that's a new background, the eggs look better."
            const last = stage >= stages.length - 1;
            setBanner(last && warren?.full ? "hoard" : "elder");
            Cas.jackpot();
            Haptic.crit();
            await wait(2400);
            setBanner(null);
            setSpent([]);
            setAt(0);
            if (last) {
                if (warren?.full) { setInHoard(true); } else { setDone(true); }
            } else {
                setStage((n) => n + 1);
            }
            setBusy(false);
            return;
        }

        // The Warren Mother. It is over, and it says so with its own face rather than with a sentence.
        setBanner("mother");
        Cas.pot();
        Haptic.crit();
        await wait(2100);
        setBanner(null);
        setDone(true);
        setBusy(false);
    }, [busy, done, spent, inHoard, hoard, cur, at, stage, stages.length, pool, warren]);

    const depth = inHoard ? stages.length + 1 : stage + 1;

    return (
        <div className={`wr is-${room}${inHoard ? " is-hoard" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="wr-bg" src={inHoard ? HOARD_ART : (STAGE_ART[room] || STAGE_ART.hollow)} alt="" />
            <div className="wr-veil" aria-hidden="true" />

            {/* ── HOW DEEP, AND HOW MUCH ──────────────────────────────────────────────────────────────
                The depth is the ladder made visible: five pips, filling as you go, so a player who has
                never seen the bottom still knows there IS one. */}
            <div className="wr-head">
                <i>{inHoard ? "The Hoard" : cur?.name || "The Warren"}</i>
                <b key={won}>{won.toLocaleString()}</b>
                <em>chips</em>
                <div className="wr-depth" aria-label={`Level ${depth} of ${stages.length + 1}`}>
                    {Array.from({ length: 6 }, (_, i) => (
                        <span key={i} className={i < depth ? "is-on" : ""} />
                    ))}
                </div>
            </div>

            <div className={`wr-board${inHoard ? " is-mounds" : ""}`}>
                {Array.from({ length: slots }, (_, i) => (
                    <button key={`${stage}-${inHoard}-${i}`} type="button"
                        className={`wr-nest${shaking === i ? " is-shaking" : ""}${spent.includes(i) ? " is-open" : ""}`}
                        disabled={busy || done || spent.includes(i)}
                        onClick={() => open(i)}
                        aria-label={inHoard ? "Open a mound" : "Open a burrow"}>
                        <span className="wr-lid" aria-hidden="true" />
                        {/* The animals that came out of THIS burrow, hopping. Rendered inside it so they
                            arc from the thing that was opened rather than from the middle of the screen. */}
                        {hops.filter((h) => h.slot === i).map((h) => (
                            <span key={h.id} className="wr-hop"
                                style={{ "--dx": `${h.dx}px`, "--lift": `${h.lift}px` }}>
                                {h.art
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={h.art} alt="" draggable="false" />
                                    : null}
                                <u>+{h.chips.toLocaleString()}</u>
                            </span>
                        ))}
                    </button>
                ))}
            </div>

            <p className="wr-say">
                {done ? "That is the warren emptied."
                    : busy ? " "
                    : inHoard ? "Open a mound. One of them is her."
                    : "Open a burrow. One holds the Elder, one holds the Mother."}
            </p>

            {done ? (
                <button type="button" className="wr-go" onClick={onDone}>
                    Take {won.toLocaleString()} chips
                </button>
            ) : null}

            {/* ── THE THREE MOMENTS ───────────────────────────────────────────────────────────────────
                The Elder takes you down, the Hoard is the room past the bottom, and the Mother ends it.
                Each takes the whole screen, because each is the only thing happening. */}
            {banner ? (
                <div className={`wr-shout is-${banner}`} role="status">
                    {banner === "mother" ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={MOTHER_ART} alt="" />
                            <b>THE MOTHER</b>
                            <em>She has had enough of you.</em>
                        </>
                    ) : banner === "hoard" ? (
                        <>
                            <b>THE HOARD</b>
                            <em>Nobody gets this far. Take what you can carry.</em>
                        </>
                    ) : (
                        <>
                            {warren?.art?.elder
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={warren.art.elder} alt="" />
                                : null}
                            <b>THE ELDER</b>
                            <em>{stages[stage + 1]?.name || "Deeper"} — and everything down there is bigger.</em>
                        </>
                    )}
                </div>
            ) : null}
        </div>
    );
}
