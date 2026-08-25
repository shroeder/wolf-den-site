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
// Three stones, rotated by which visit you are on so a second trip is not the same three again.
const GEODES = ["amethyst", "emerald", "ruby"];

const SHAKE_MS = 700;
// The egg breaking is its own beat. Without it the egg shook and then simply stopped existing while
// animals appeared somewhere else on screen — which is a shake and a spawn, not a hatch.
const CRACK_MS = 420;
const HOP_MS = 380;
// The wall turning itself over at the end. Long enough to read a board of fifteen, short enough that it is
// a reveal rather than a screen you are stuck on.
const REST_MS = 2600;
const SETTLE_MS = 520;
// Long enough to actually enjoy him. The old shout held 2,400ms and most of that was reading; this is the
// same budget spent on the animal instead of on a caption.
const ELDER_MS = 2600;

export default function TheWarren({ warren, onDone, owner = false }) {
    // Where we are: which stage, and which room. `at` counts burrows OPENED on this stage, which is also the
    // index into that stage's `opened` list — the server decided the order, this only walks it.
    const [stage, setStage] = useState(0);
    const [at, setAt] = useState(0);
    const [busy, setBusy] = useState(false);
    const [shaking, setShaking] = useState(-1);     // which egg is rocking
    const [cracking, setCracking] = useState(-1);  // which egg is breaking open, right now
    // What the geode just cracked open for, or null. Its OWN state rather than the last entry in `hops`,
    // which now persists for a whole room — so reading the haul off it left the previous geode's number on
    // screen while you chose the next one.
    const [haul, setHaul] = useState(null);
    const [hops, setHops] = useState([]);           // critters currently out, with their chips
    const [won, setWon] = useState(0);
    const [banner, setBanner] = useState(null);     // "mother" | "hoard"
    // ── THE ELDER, OUT ON THE FLOOR ──────────────────────────────────────────────────────────────────────
    // Luke: "the elder wolf — I'd rather he pop out like everything else but have him dance around and have
    // a good time, instead of just a modal in the middle, because that's the core dopamine part right there
    // and I feel like we're missing out on a lot of dopamine."
    //
    // He is right, and the reason is that a full-screen shout is the same shape as an ERROR. It stops the
    // room, greys what you were looking at and puts a slab of text over it — which is what a game does when
    // something has gone wrong, not when the best thing on the machine has just happened. Everything else in
    // this bonus hatches out of an egg and lands on the floor; the one moment worth celebrating was the one
    // that did not. So he hatches too, from the egg you actually touched, and then he has a party.
    const [elder, setElder] = useState(null);      // { x, art }
    const [inHoard, setInHoard] = useState(false);
    const [done, setDone] = useState(false);
    // What every UNOPENED nest held, once the Mother has ended it. Slot index -> the thing inside.
    const [rest, setRest] = useState(null);
    // Which board slots have been opened, so a burrow cannot be picked twice and the room visibly empties.
    const [spent, setSpent] = useState([]);
    const timers = useRef([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const wait = (ms) => new Promise((r) => timers.current.push(setTimeout(r, ms)));

    // ── VISITS, NOT ROOMS ────────────────────────────────────────────────────────────────────────────────
    // The last room loops: an Elder down there opens one geode and puts you straight back on the same wall.
    // So `stage` walks a list of VISITS, and the Deep Warren can appear in it several times over — which is
    // why the depth pips read the visit's OWN room number rather than counting how many walls you have seen.
    const stages = useMemo(() => warren?.stages || [], [warren]);
    const cur = stages[stage];
    const room = cur?.key || "hollow";
    const pool = warren?.art?.pets?.[room] || [];

    const slots = warren?.board || 15;
    // Which stone each of the three is, this time round. Rotated by how many have been cracked so the
    // trio changes between picks rather than the same three rising again.

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

        const next = cur?.opened?.[at];
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

        if (next.kind === "pups") {
            // ── THEY COME OUT ONE AT A TIME ──────────────────────────────────────────────────────────────
            // The heart of it. Each one hops, lands, and adds — and because the count is not known in
            // advance, every extra animal is a small escalation on its own.
            const list = next.pups;
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
            // ── THE ELDER ────────────────────────────────────────────────────────────────────────────────
            // He comes out of the egg your finger landed on, at the column it was in, and dances. Luke: "he
            // like congratulates you and it's this huge event and then it goes to the next screen that's a
            // new background, the eggs look better."
            const toHoard = cur?.geode != null;
            const col = slot % 5;
            setElder({ x: Math.min(78, Math.max(22, (col + 0.5) * 20)), art: warren?.art?.elder || null });
            Cas.jackpot();
            Haptic.crit();
            await wait(ELDER_MS);
            setElder(null);
            // The Hoard still gets its shout: it is a ROOM you are being shown, not a creature, and there is
            // nothing to hatch. The Elder's was the one that should never have been a slab of text.
            if (toHoard) { setBanner("hoard"); await wait(1500); setBanner(null); }

            // ── AND IN THE LAST ROOM, A GEODE ────────────────────────────────────────────────────────────
            // One crack, and then back onto the same wall to look for another Elder. The geode is not a
            // room you work through — it is a prize the last room hands you, over and over, until she
            // finds you.
            if (toHoard) {
                setInHoard(true);
                await new Promise((r) => { crackDone.current = r; });
                setInHoard(false);
            }

            // ── A NEW ROOM IS A NEW WALL; THE SAME ROOM IS NOT ───────────────────────────────────────
            // Luke: "when you return from the hoard the eggs you opened should still be open."
            //
            // This cleared the board after every Elder, which is right when he takes you DOWN a room and
            // wrong when he hands you a geode and puts you back on the same wall — the Deep Warren is a
            // loop, and wiping it each time round said the room had reset when the server knows perfectly
            // well that it has not. The next visit's `stage` says which of the two just happened.
            const sameRoom = stages[stage + 1]?.room === cur?.room;
            if (!sameRoom) {
                setSpent([]);
                setHops([]);   // a new wall is a new floor; the last one's crowd stays behind in it
            }
            setAt(0);
            setStage((n) => n + 1);
            setBusy(false);
            return;
        }

        // The Warren Mother. It is over, and it says so with its own face rather than with a sentence.
        setBanner("mother");
        Cas.dread();
        Haptic.crit();
        await wait(2100);
        setBanner(null);

        // ── AND THEN THE WALL OPENS ITSELF ───────────────────────────────────────────────────────────
        // Luke: "when you lose by picking the other thing it should show what the value of the non-picked
        // eggs were — where other bears and wolves were."
        //
        // A round that ends on the wrong egg and then simply stops is the one moment the machine owes you
        // an answer, and it was giving none: the wall went dark still full of eggs nobody would ever see
        // inside. Every unopened nest turns over dim, holding what it held — and the Elder you were one
        // egg away from is the whole reason to do it. Held back until after the Mother's shout so it reads
        // as what WAS there and never as something you collected.
        const left = cur?.rest || [];
        if (left.length) {
            // `spent` is the value this callback closed over, and the Mother's own egg was added to it by a
            // setState at the top of this same invocation — so reading it here is one behind, which shifted
            // every label by a slot and put "ELDER" on a shell that had already been opened. The egg in hand
            // is added explicitly rather than waiting for a render that will not come until after this.
            const closed = [...spent, slot];
            const idx = Array.from({ length: slots }, (_, i) => i).filter((i) => !closed.includes(i));
            const map = {};
            idx.forEach((slotAt, k) => { if (left[k]) map[slotAt] = left[k]; });
            setRest(map);
            Cas.coins(0.3);
            await wait(REST_MS);
        }
        setDone(true);
        setBusy(false);
    }, [busy, done, spent, cur, at, stage, pool, slots, stages]);

    // ── CRACKING ONE ─────────────────────────────────────────────────────────────────────────────────────
    // Its own handler rather than a branch of `open`, because the Hoard is not a board being walked: it is
    // one choice, once, and the round is paused on a promise until it is made.
    const crackDone = useRef(null);
    const crack = useCallback(async (i) => {
        if (cracking >= 0 || !cur?.geode) return;
        unlock();
        setCracking(i);
        Cas.reelStop(4, 0.95);
        Haptic.crit();
        await wait(CRACK_MS);
        setHaul(cur.geode);
        setWon((n) => n + cur.geode);
        Cas.jackpot();
        Haptic.crit();
        await wait(1900);
        setHaul(null);
        setCracking(-1);
        crackDone.current?.();
        crackDone.current = null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cracking, cur]);

    // ── OWNER: WALK ME STRAIGHT TO THE GEODES ────────────────────────────────────────────────────────────
    // Luke: "I need a way to trigger the, like, dome picker... the very last stage where you pick the prize.
    // I need to test that out."
    //
    // "Force hoard" upstairs already guarantees the RUN contains one — that part works, and it finds one in
    // about five hundred re-rolls. What it cannot do is shorten the walk: the geodes are the last room, and
    // getting to them means tapping through every burrow of every room above first. Judging how the biggest
    // screen in the game feels is not something you should have to earn four rooms of egg-hatching for,
    // every single time.
    //
    // PLAYBACK ONLY. It moves the cursor to the visit the server already decided carries a geode; it does
    // not create one, does not touch a number, and cannot appear on a run that has none. The rooms it skips
    // were paid when the server ran them — `total` is not assembled from this animation (see the note on
    // `opened` below), so skipping the walk cannot skip a payout.
    const skipToHoard = useCallback(() => {
        if (busy || done) return;
        const k = stages.findIndex((st, i) => i >= stage && st.geode != null);
        if (k < 0) return;
        setBusy(true);
        setSpent([]); setHops([]); setAt(0); setBanner(null);
        // ── AND THE TALLY DOES NOT LIE ABOUT THE ROOMS IT SKIPPED ────────────────────────────────────
        // The counter is accumulated by the walk, so jumping the cursor left it reading 0 over a run that
        // had already paid four rooms — and the number on screen while you judge the geode is the number
        // the geode is about to be added to. Seeded with what the skipped visits came to, read off the
        // server's own pup values (`chips` in the walk below is exactly this list).
        setWon(stages.slice(0, k).reduce((a, st) => a
            + st.opened.reduce((b, n) => b + (n.pups || []).reduce((c, v) => c + v, 0), 0)
            + (st.geode || 0), 0));
        setStage(k);
        setInHoard(true);
        // `open` normally awaits this promise and does the cleanup afterwards. Nothing is awaiting it here,
        // so the resolver IS the cleanup — same steps, same order, in the one place they are written.
        crackDone.current = () => { setInHoard(false); setSpent([]); setHops([]); setAt(0); setStage(k + 1); setBusy(false); };
    }, [busy, done, stages, stage]);

    // Counted in ROOMS rather than visits — six trips through the Deep Warren is still the Deep Warren, and
    // the pips would otherwise run off the end of the bar.
    const depth = cur?.room || 1;
    // Is there a geode still ahead of us on this run? Decides whether the owner control is worth drawing.
    const hoardAhead = owner && stages.some((st, i) => i >= stage && st.geode != null);
    // ── WHAT THE WHOLE RUN CAME TO ───────────────────────────────────────────────────────────────────────
    // Counted off the server's own record of the round rather than off anything the screen tallied as it
    // went — a summary assembled from the animation is a summary that can disagree with the payout.
    const opened = (warren?.stages || []).reduce((a, st) => a + st.opened.length, 0);
    const hatched = (warren?.stages || []).reduce((a, st) =>
        a + st.opened.reduce((b, n) => b + (n.pups?.length || 0), 0), 0);
    const geodes = Number(warren?.geodes || 0);
    const deepest = Number(warren?.reached || 1);
    const reachedHoard = geodes > 0;

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

            {/* Owner only, and only while a geode is still ahead — see skipToHoard. On the
                remove-before-launch list with the rest of the force controls. */}
            {hoardAhead && !inHoard ? (
                <button type="button" className="wr-skip" disabled={busy} onClick={skipToHoard}>
                    owner · skip to the geodes
                </button>
            ) : null}

            {/* ── THE HOARD ───────────────────────────────────────────────────────────────────────────
                Luke, on the reference: "the dome actually a big thing full screen and it needs to look
                amazing. we wouldnt use a dome but something more theme appropriate."

                So it is not the wall with better eggs on it — it is a different screen. Three colossal
                geodes, most of the phone tall, and cracking one does not empty a board: three more rise.
                The only room in the game where the objects are bigger than the text. */}
            {inHoard ? (
                <div className="wr-hoard">
                    <div className="wr-geodes">
                        {GEODES.map((g, i) => (
                            <button key={g} type="button"
                                className={`wr-geode${cracking === i ? " is-cracking" : ""}${cracking >= 0 && cracking !== i ? " is-passed" : ""}`}
                                disabled={cracking >= 0}
                                onClick={() => crack(i)}
                                aria-label="Crack this geode open"
                                style={{ "--i": i }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/images/casino/warren/geode-${GEODES[(i + stage) % 3]}.png`} alt="" draggable="false" />
                            </button>
                        ))}
                    </div>
                    {haul != null ? (
                        <div className="wr-haul"><b>+{haul.toLocaleString()}</b></div>
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
                        className={`wr-egg${shaking === i ? " is-shaking" : ""}${cracking === i ? " is-cracking" : ""}${spent.includes(i) && cracking !== i ? " is-open" : ""}${rest?.[i] ? " is-rest" : ""}`}
                        style={{ "--i": i }}
                        disabled={busy || done || spent.includes(i)}
                        onClick={() => open(i)}
                        aria-label={inHoard ? "Open a mound" : "Open an egg"}>
                        {/* ── AND THE SHELL STAYS ────────────────────────────────────────────────
                            An opened space used to be the same egg at 16% opacity, which reads as an egg
                            that faded rather than one that hatched. It is the empty broken bottom half
                            now, in that room's own material — so the wall tells you what happened to
                            every space on it, and a room half worked through looks it. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/images/casino/warren/${room}${spent.includes(i) && cracking !== i ? "-shell" : ""}.png`}
                            alt="" draggable="false" />
                        {/* The shell coming apart: a flash inside it and a ring thrown outwards. Its own
                            element because the egg is an <img> and an image cannot carry pseudo-elements. */}
                        {cracking === i ? <i className="wr-break" aria-hidden="true" /> : null}
                        {/* What this one held. The Elder gets his own face — being one egg away from him is
                            the thing worth knowing — and a nest of pups shows what it was worth. */}
                        {rest?.[i] ? (
                            <span className={`wr-was is-${rest[i].kind}`}>
                                {rest[i].kind === "pups"
                                    ? <b>{(rest[i].pups || []).reduce((a, v) => a + v, 0).toLocaleString()}</b>
                                    : <b>{rest[i].kind === "elder" ? "ELDER" : "HER"}</b>}
                            </span>
                        ) : null}
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

                {/* ── AND THE ELDER, HAVING A PARTY ───────────────────────────────────────────────────
                    Same floor, same hatch, four times the size — and then he dances instead of standing
                    there. The sparks are thrown from under his feet rather than raining down, so the
                    energy comes from HIM: the room is reacting to the animal, not decorating him. */}
                {elder ? (
                    <span className="wr-elder" style={{ left: `${elder.x}%` }}>
                        <i className="wr-elder-pop" aria-hidden="true">
                            {Array.from({ length: 12 }, (_, k) => <b key={k} style={{ "--k": k }} />)}
                        </i>
                        {elder.art
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={elder.art} alt="" draggable="false" />
                            : null}
                        <u>THE ELDER</u>
                        <em>{stages[stage + 1]?.name || "Deeper"}</em>
                    </span>
                ) : null}
            </div> : null}

            <p className="wr-say">
                {done ? "That is the warren emptied."
                    : busy ? " "
                    : inHoard ? "Crack one open. Then back to the wall."
                    : "Open an egg. One holds the Elder, one holds the Mother."}
            </p>

            {/* ── AND THE RECKONING ───────────────────────────────────────────────────────────────────
                Luke: "it should total up everything for you at the end of the bonus. And then have a
                button in the middle that says you're done."

                It ended on a small button along the bottom edge reading "Take 46 chips", under a screen
                still full of eggs — which is a receipt, not an ending. A run through the Warren is the
                longest thing on this floor and it deserves to be added up: how deep you got, how many
                eggs you opened, how many animals are standing on the floor, and the number, once, at the
                size it is worth. In the middle, because there is nothing else left to look at. */}
            {done ? (
                <div className="wr-end" role="status">
                    <i>{reachedHoard ? "You cracked the Deep Warren open" : "The warren is closed"}</i>
                    <b>{won.toLocaleString()}</b>
                    <em>chips</em>
                    <ul className="wr-tally">
                        <li><span>{deepest}</span> {deepest === 1 ? "room" : "rooms"} deep</li>
                        <li><span>{opened}</span> {opened === 1 ? "egg" : "eggs"} opened</li>
                        <li><span>{hatched}</span> out of them</li>
                        {geodes ? <li><span>{geodes}</span> {geodes === 1 ? "geode" : "geodes"}</li> : null}
                    </ul>
                    <button type="button" className="wr-go" onClick={onDone}>Done</button>
                </div>
            ) : null}

            {/* ── THE TWO THAT ARE STILL A SHOUT ──────────────────────────────────────────────────────
                The Hoard is a ROOM you are being shown and the Mother is the run ending — neither is a
                creature coming out of an egg, and neither has anything to hatch. The Elder used to be here
                with them and should never have been: see the note beside `elder` at the top. */}
            {banner ? (
                <div className={`wr-shout is-${banner}`} role="status">
                    {banner === "mother" ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={MOTHER_ART} alt="" />
                            <b>THE MOTHER</b>
                            <em>She has had enough of you.</em>
                        </>
                    ) : (
                        <>
                            <b>THE HOARD</b>
                            <em>Nobody gets this far. Take what you can carry.</em>
                        </>
                    )}
                </div>
            ) : null}
        </div>
    );
}
