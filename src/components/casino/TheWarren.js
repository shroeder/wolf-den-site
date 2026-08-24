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
// The egg breaking is its own beat. Without it the egg shook and then simply stopped existing while
// animals appeared somewhere else on screen — which is a shake and a spawn, not a hatch.
const CRACK_MS = 420;
const HOP_MS = 380;
const SETTLE_MS = 520;

export default function TheWarren({ warren, onDone }) {
    // Where we are: which stage, and which room. `at` counts burrows OPENED on this stage, which is also the
    // index into that stage's `opened` list — the server decided the order, this only walks it.
    const [stage, setStage] = useState(0);
    const [at, setAt] = useState(0);
    const [busy, setBusy] = useState(false);
    const [shaking, setShaking] = useState(-1);     // which egg is rocking
    const [cracking, setCracking] = useState(-1);  // which egg is breaking open, right now
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

    // Fifteen eggs on the wall; the Hoard shows three geodes and then three MORE, so it is never a board
    // being emptied — it is the same choice, again, until she is behind one.
    const slots = warren?.board || 15;
    // Which stone each of the three is, this time round. Rotated by how many have been cracked so the
    // trio changes between picks rather than the same three rising again.
    const GEODES = ["amethyst", "emerald", "ruby"];

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

        const next = inHoard ? hoard?.opened?.[at] : cur?.opened?.[at];
        if (!next) { setShaking(-1); setBusy(false); return; }

        // ── AND THEN IT BREAKS ───────────────────────────────────────────────────────────────────────────
        // Luke: "They need to actually come out of the egg. The egg needs to crack open." It used to shake
        // and then quietly vanish while animals appeared elsewhere — a shake and a spawn, not a hatch. The
        // shell splits, flashes, and throws a ring, and only then does anything climb out of it.
        setShaking(-1);
        setCracking(slot);
        Cas.reelStop(4, 0.9);
        Haptic.crit();
        await wait(CRACK_MS);
        setCracking(-1);

        if (next.kind === "pups" || next.kind === "mound") {
            // ── THEY COME OUT ONE AT A TIME ──────────────────────────────────────────────────────────────
            // The heart of it. Each one hops, lands, and adds — and because the count is not known in
            // advance, every extra animal is a small escalation on its own.
            const list = next.kind === "mound" ? [next.chips] : next.pups;
            for (let i = 0; i < list.length; i += 1) {
                const chips = list[i];
                // ── AND THEY LAND ON THE FLOOR ───────────────────────────────────────────────────────────
                // Not beside the egg they came out of — down in the open ground under the wall, which is
                // where the reference machine puts them and which is the better idea for a reason worth
                // saying: eight animals out of one egg would pile on top of that egg and cover the board.
                // Spread across the floor they stay separate, they stay visible while the next one arrives,
                // and the growing crowd IS the count.
                // ── OUT OF THE EGG THEY WERE IN ──────────────────────────────────────────────────────────
                // They used to drop from an abstract "above" at an x picked off their index, so an animal
                // could climb out of the top-left egg and land under the far right of the wall. They fall
                // from the column their own egg is in now — which is what makes it a hatch rather than a
                // spawn — and they fan out around that column as more of them arrive.
                const col = slot % 5;
                const eggX = (col + 0.5) * 20;
                const fan = ((i % 2 ? 1 : -1) * Math.ceil(i / 2)) * 7.5;
                setHops((p) => [...p, {
                    id: `${stage}-${at}-${i}-${slot}`,
                    chips,
                    art: pool.length ? pool[(i + at + stage) % pool.length] : null,
                    x: Math.min(93, Math.max(7, eggX + fan)),
                    // A shallow depth ladder so a crowd of twenty is a crowd rather than a queue.
                    y: (i % 3) * 9,
                    flip: i % 2 === 0,
                    delay: (i % 3) * 40,
                }]);
                setWon((n) => n + chips);
                // Rising pitch down the line, so a long train sounds like a build rather than a loop.
                Cas.coin(Math.min(4, i));
                Haptic.hit(0.28 + Math.min(0.4, i * 0.06));
                await wait(HOP_MS);
            }
            await wait(SETTLE_MS);
            // ── AND THEY STAY ────────────────────────────────────────────────────────────────────────────
            // Luke: "They need to stay on the bottom until you reach the next phase or end." They used to be
            // swept off after every egg, which threw away the best thing the floor does: by the fourth egg
            // of a room there is a CROWD down there, and the crowd is the score in a form you do not have to
            // read. It is cleared when the room changes and not before — see the Elder and the Mother.
            setAt((n) => n + 1);
            // In the Hoard the board is never spent — three more rise. Clearing `spent` is what brings
            // them back, and bumping `at` rotates which three stones they are.
            if (inHoard) setSpent([]);
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
            setHops([]);   // a new room is a new floor; the last room's crowd stays behind in it
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

            {/* ── THE HOARD ───────────────────────────────────────────────────────────────────────────
                Luke, on the reference: "the dome actually a big thing full screen and it needs to look
                amazing. we wouldnt use a dome but something more theme appropriate."

                So it is not the wall with better eggs on it — it is a different screen. Three colossal
                geodes, most of the phone tall, and cracking one does not empty a board: three more rise.
                The only room in the game where the objects are bigger than the text. */}
            {inHoard ? (
                <div className="wr-hoard">
                    <div className="wr-geodes" key={at}>
                        {GEODES.map((g, i) => (
                            <button key={g} type="button"
                                className={`wr-geode${shaking === i ? " is-cracking" : ""}${spent.includes(i) ? " is-gone" : ""}${spent.length && !spent.includes(i) ? " is-passed" : ""}`}
                                disabled={busy || done || spent.length > 0}
                                onClick={() => open(i)}
                                aria-label="Crack this geode open"
                                style={{ "--i": i }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/images/casino/warren/geode-${GEODES[(i + at) % 3]}.png`} alt="" draggable="false" />
                            </button>
                        ))}
                    </div>
                    {hops.length ? (
                        <div className="wr-haul">
                            <b>+{hops[hops.length - 1].chips.toLocaleString()}</b>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* ── THE WALL ────────────────────────────────────────────────────────────────────────────
                Fifteen eggs, five across, hanging above an open floor — which is what the machine Luke
                pointed at actually looks like, and it beats a three-by-three grid of holes for a reason
                that is not only cosmetic: a wall reads as a PLACE with things in it, and it leaves the
                bottom of the screen empty for the animals to land in. */}
            {!inHoard ? <div className="wr-wall">
                {Array.from({ length: slots }, (_, i) => (
                    <button key={`${stage}-${inHoard}-${i}`} type="button"
                        className={`wr-egg${shaking === i ? " is-shaking" : ""}${cracking === i ? " is-cracking" : ""}${spent.includes(i) && cracking !== i ? " is-open" : ""}`}
                        disabled={busy || done || spent.includes(i)}
                        onClick={() => open(i)}
                        aria-label={inHoard ? "Open a mound" : "Open an egg"}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/images/casino/warren/${room}.png`} alt="" draggable="false" />
                        {/* The shell coming apart: a flash inside it and a ring thrown outwards. Its own
                            element because the egg is an <img> and an image cannot carry pseudo-elements. */}
                        {cracking === i ? <i className="wr-break" aria-hidden="true" /> : null}
                    </button>
                ))}
            </div> : null}

            {/* ── AND THE FLOOR THEY LAND ON ──────────────────────────────────────────────────────────
                Deliberately empty. It is where everything that comes out of an egg ends up, and an empty
                third of the screen is not wasted space here — it is the stage. */}
            {!inHoard ? <div className="wr-floor">
                {hops.map((h) => (
                    <span key={h.id} className={`wr-critter${h.flip ? " is-flip" : ""}`}
                        style={{ left: `${h.x}%`, bottom: `${4 + h.y}px`, "--delay": `${h.delay}ms` }}>
                        <u>+{h.chips.toLocaleString()}</u>
                        {h.art
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={h.art} alt="" draggable="false" />
                            : null}
                    </span>
                ))}
            </div> : null}

            <p className="wr-say">
                {done ? "That is the warren emptied."
                    : busy ? " "
                    : inHoard ? "Crack one open. She is behind one of them."
                    : "Open an egg. One holds the Elder, one holds the Mother."}
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
