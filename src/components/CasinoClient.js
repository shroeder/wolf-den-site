"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import FeatureDailies from "@/components/FeatureDailies";
import { Haptic, Sfx, unlock } from "@/components/arena/arena-audio.js";

// ── THE FLOOR ────────────────────────────────────────────────────────────────────────────────────────────────
// A room laid out like the tavern: you walk left and right along it, the other people in it are really there,
// and the things you walk up to are MACHINES rather than people. Luke's brief, and the reason it is a room at
// all rather than a menu of games — a casino you scroll is a list; a casino you walk into is a place.
//
// WHAT IS HERE AND WHAT IS NOT. One machine works end to end: the slot. The other cabinets are drawn, named
// and dark, because a floor with one machine and no sign of the rest reads as finished when it is not — and
// because the shape of the room is the thing worth agreeing on before four more games are written into it.
//
// The art is CSS. Every cabinet on this floor is a gradient and a border, deliberately: art costs money to
// generate and this is a layout to be argued with first. When the floor plan is right, the cabinets get
// painted.
const MACHINES = [
    { id: "slot", x: 10, label: "Wolf's Luck", kind: "Slots", live: true },
    { id: "slot2", x: 24, label: "Den Fortune", kind: "Slots", live: true },
    { id: "slot3", x: 38, label: "Moonrise", kind: "Slots", live: true },
    { id: "roulette", x: 52, label: "The Wheel", kind: "Roulette", live: true },
    { id: "keno", x: 66, label: "Keno", kind: "Keno", live: true },
    { id: "bingo", x: 80, label: "The Hall", kind: "Bingo", live: true },
    { id: "blackjack", x: 94, label: "The Table", kind: "Blackjack", live: true },
];

// How close you have to stand for a machine to be usable. Wide enough that walking to something feels like
// arriving rather than threading a needle.
const REACH = 9;

// Which cabinets are slot machines. Three of them now, and they are not one machine in three paint jobs —
// see SLOT_MACHINES in casino.js. The client does not decide anything about them: it sends which cabinet
// you are standing at and draws whatever came back.
const SLOTS = new Set(["slot", "slot2", "slot3"]);

const SYMBOL_ART = {
    wolf: { glyph: "▲", tone: "#ffd75e" },
    chest: { glyph: "■", tone: "#ff9f43" },
    laurel: { glyph: "❖", tone: "#8bf0b4" },
    doubloon: { glyph: "●", tone: "#ffe9b8" },
    bone: { glyph: "▬", tone: "#cbd3dc" },
    moon: { glyph: "◗", tone: "#9fc6dd" },
    star: { glyph: "✦", tone: "#d9c2ff" },
};

const money = (n) => Math.round(Number(n) || 0).toLocaleString();

// Every way a hand can end, said the way somebody would say it out loud. "dealer_bust" is a state name, not
// a sentence, and a table that reports state names is a table that reads like a debug log.
const OUTCOME = {
    blackjack: "Blackjack.",
    win: "You take it.",
    dealer_bust: "Dealer busts.",
    push: "Push — your stake comes back.",
    lose: "The house takes it.",
    bust: "Bust.",
    dealer_blackjack: "Dealer had blackjack.",
};

// The same outcomes again, short — these label ONE hand of a split, where the full sentence would not fit
// and would read oddly twice over ("The house takes it. The house takes it.").
const OUTCOME_SHORT = {
    blackjack: "blackjack",
    win: "won",
    dealer_bust: "won",
    push: "push",
    lose: "lost",
    bust: "bust",
    dealer_blackjack: "lost",
};

// A card, drawn in CSS like every other thing on this floor. Red suits red, black suits pale — the one piece
// of card design that is not decoration, because it is how you read a hand at a glance.
const SUIT_ART = { s: { glyph: "♠", red: false }, h: { glyph: "♥", red: true }, d: { glyph: "♦", red: true }, c: { glyph: "♣", red: false } };
function Card({ card }) {
    const rank = String(card).slice(0, -1);
    const suit = SUIT_ART[String(card).slice(-1)] || SUIT_ART.s;
    return (
        <span className={`cas-card${suit.red ? " is-red" : ""}`}>
            <b>{rank}</b><i>{suit.glyph}</i>
        </span>
    );
}

export default function CasinoClient({ initial }) {
    const [st, setSt] = useState(initial);
    // ── WALKING IN FACING SOMETHING ──────────────────────────────────────────────────────────────────────
    // `?at=blackjack` starts you at that cabinet instead of at the door. The floor is six machines wide and
    // getting to the far end is thirteen taps, which is fine when you are wandering and tedious when you came
    // back for one thing. It also makes a machine linkable — from a bounty card, a badge, a message.
    // Unknown or missing name just starts you at the door, so a bad link is a walk rather than an error.
    const [x, setX] = useState(() => {
        if (typeof window === "undefined") return 14;
        const want = new URLSearchParams(window.location.search).get("at");
        return MACHINES.find((m) => m.id === want)?.x ?? 14;
    });
    const [facing, setFacing] = useState(1);
    const [at, setAt] = useState(null);          // the machine you are standing at
    const [bet, setBet] = useState(100);
    const [spin, setSpin] = useState(null);      // the last pull, for the reels and the callout
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const xRef = useRef(x);
    // ── THE CAMERA ───────────────────────────────────────────────────────────────────────────────────────
    // The floor is WIDER than the screen and scrolls with you. Six cabinets already crowd a phone; fitting
    // the whole room into one viewport stops working the moment there are more, and a casino you can see all
    // of at once is a menu with a carpet. The room is the window, `.cas-world` is the floor, and the window
    // follows you.
    const roomRef = useRef(null);
    // Reels mid-spin: the symbols cycling before they land. Null when the machine is at rest.
    const [rolling, setRolling] = useState(null);
    const [landed, setLanded] = useState(0);     // how many reels have stopped, 0..3
    const [flash, setFlash] = useState(null);    // "win" | "big" — the celebration, cleared on a timer
    const timers = useRef([]);
    // The wheel: which bet is on the felt, and where it landed.
    const [wheelBet, setWheelBet] = useState("gold");
    const [wheel, setWheel] = useState(null);
    // The ticket: five numbers of forty, and the last draw.
    const [ticket, setTicket] = useState([]);
    const [keno, setKeno] = useState(null);
    // The last thing that was not gold. Cleared at the start of every play so it can never look like the
    // machine just paid out twice.
    const [prize, setPrize] = useState(null);
    // What the pets did on this play, and the pet itself if one turned up. Separate from `prize` because a
    // pet arriving is a different size of moment than a chest and must not quietly replace one.
    const [note, setNote] = useState(null);
    const [wonPet, setWonPet] = useState(null);
    // The one machine with a hand in progress. It comes down from the server on load, so closing the tab
    // mid-hand is not a way to lose a stake — nor a way to walk out of one.
    const [hand, setHand] = useState(initial?.blackjack?.hand || null);
    // The hall. `card` is the whole answer the moment it arrives; `called` is how far the ceremony has got
    // through the forty balls, which is the only thing the animation actually advances.
    const [card, setCard] = useState(null);
    const [called, setCalled] = useState(0);
    const rakeRate = initial?.blackjack?.rakeRate ?? 0.2;

    // ── WALKING ──────────────────────────────────────────────────────────────────────────────────────────────
    // Your position is local and immediate — the walk must never wait on a round trip — and pushed to the
    // server on a timer so the other people in the room see you move. The same shape the tavern uses.
    useEffect(() => { xRef.current = x; }, [x]);
    useEffect(() => {
        const id = setInterval(() => {
            fetch("/api/marketplace/casino", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "move", x: xRef.current, y: 72, facing }),
            }).catch(() => {});
        }, 2500);
        return () => clearInterval(id);
    }, [facing]);

    // Who else is on the floor. Polled rather than pushed, because a casino is not a fight — a few seconds of
    // staleness in where somebody is standing costs nothing.
    useEffect(() => {
        const id = setInterval(async () => {
            const r = await fetch("/api/marketplace/casino").then((x2) => x2.json()).catch(() => null);
            if (r?.open) setSt((p) => ({ ...p, others: r.others, gold: r.gold }));
        }, 6000);
        return () => clearInterval(id);
    }, []);

    // Keep the window centred on you. Written imperatively rather than as a transform because scrollLeft
    // needs no arithmetic about percentages of percentages, and the browser smooths it for free.
    useEffect(() => {
        const el = roomRef.current;
        if (!el) return;
        const world = el.scrollWidth;
        el.scrollTo({ left: (world * x) / 100 - el.clientWidth / 2, behavior: "smooth" });
    }, [x]);

    const walk = useCallback((dir) => {
        unlock();
        Sfx.ui();
        setFacing(dir);
        setX((p) => Math.max(4, Math.min(96, p + dir * 6)));
        setErr(null);
    }, []);

    // What you are standing in front of. Recomputed from position rather than remembered, so walking away
    // closes the machine without anything having to tell it to.
    useEffect(() => {
        const near = MACHINES.find((m) => Math.abs(m.x - x) <= REACH);
        setAt(near || null);
    }, [x]);

    // ── ONE PULL, AS AN EVENT ────────────────────────────────────────────────────────────────────────────
    // The server answers in a few milliseconds and that is exactly the problem: an instant result is a number
    // appearing, not a spin. The reels cycle while the request is in flight and then land LEFT TO RIGHT with
    // a thunk each, which is the whole drama of a slot machine — the third reel is where the tension lives,
    // and it cannot exist if all three resolve on the same frame.
    //
    // The outcome is never in doubt by then: the server decided it before the first reel stopped. The
    // ceremony is presentation over a result already banked, which is the honest version of this — nothing
    // here can change what was rolled.
    // ── WHAT THE PETS DID ────────────────────────────────────────────────────────────────────────────────
    // Every machine ends here, which is the point: a prize, a free play, a refund and a pet arriving are the
    // same four things wherever you were standing, and a floor where the slot celebrates differently from the
    // wheel is a floor that has to be learned twice.
    //
    // It also fixes something the slot had on its own: `pull` cleared the prize banner and never set it, so
    // the slot's chests were rolled by the server, banked, and never shown.
    const absorb = useCallback((r) => {
        if (r.prize) { setPrize(r.prize); Sfx.gemSet?.(); Haptic.crit(); }
        // The quiet ones. Said plainly and briefly — the pet paying for a pull is a nice thing to notice, not
        // an event to stop the room for.
        if (r.onHouse) setNote({ kind: "house", text: "On the house — your stake came back." });
        else if (r.refund > 0) setNote({ kind: "refund", text: `The Croupier's Cat pushes ${money(r.refund)} back.` });
        else setNote(null);
        // The loud one. A casino pet is a 1-in-hundreds-to-thousands event and the rarest is 1 in 5,556, so
        // it gets the room: its own banner, held until you walk away or play again, and the perk strip
        // updates underneath it so the thing it BOUGHT you is visible in the same breath.
        if (r.pet) {
            setWonPet(r.pet);
            Sfx.crit(1); Haptic.crit();
            setSt((prev) => ({
                ...prev,
                perks: { ...(prev?.perks || {}), pets: [...(prev?.perks?.pets || []), { id: r.pet.id, name: r.pet.name }] },
            }));
        }
    }, []);

    const pull = useCallback(async () => {
        if (busy) return;
        unlock();
        setBusy(true); setErr(null); setFlash(null); setLanded(0); setPrize(null); setNote(null); setWonPet(null);
        Sfx.whoosh();

        // Cycle the reels while we wait. Cleared when the result lands, so a slow network spins longer
        // rather than freezing on the old result — and it cycles THIS cabinet's symbols, because a machine
        // teasing you with a star it does not have is a machine lying about its own paytable.
        const ids = (st?.slots?.[at.id]?.symbols || []).map((x) => x.id);
        const spinner = setInterval(() => {
            setRolling([0, 1, 2].map(() => ids[Math.floor(Math.random() * ids.length)]));
        }, 70);

        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "spin", bet, machine: at.id }),
        }).then((x2) => x2.json()).catch(() => null);

        if (!r?.ok) {
            clearInterval(spinner);
            setRolling(null); setBusy(false);
            setErr(r?.error === "no_gold" ? "Not enough gold for that bet." : "That didn't go through.");
            return;
        }

        // A minimum spin, so a fast answer still feels like a machine rather than a calculator.
        const MIN_SPIN = 520;
        timers.current.push(setTimeout(() => {
            clearInterval(spinner);
            setRolling(null);
            setSpin(r);
            setSt((p) => ({ ...p, gold: r.gold }));

            // Reels stop one at a time. The gap widens for the last one — that pause IS the near-miss.
            [0, 1, 2].forEach((i) => {
                timers.current.push(setTimeout(() => {
                    setLanded(i + 1);
                    Sfx.impact(0.3 + i * 0.12);
                    Haptic.hit(0.35);
                }, i === 2 ? 620 : i * 230));
            });

            timers.current.push(setTimeout(() => {
                setBusy(false);
                absorb(r);
                const three = r.reels[0] === r.reels[1] && r.reels[1] === r.reels[2];
                if (r.won > 0) {
                    setFlash(three ? "big" : "win");
                    if (three) { Sfx.crit(0.9); Haptic.crit(); } else { Sfx.gemSet?.(); Haptic.hit(0.6); }
                    timers.current.push(setTimeout(() => setFlash(null), three ? 2200 : 1200));
                }
            }, 780));
        }, MIN_SPIN));
    }, [bet, busy, absorb, at, st]);

    // ── THE WHEEL AND THE TICKET ─────────────────────────────────────────────────────────────────────────
    // Both are ONE ROLL, so they share a shape: take the bet, show the result, celebrate if it paid. The slot
    // gets its own function because its ceremony is three separate landings; these two resolve at once and
    // pretending otherwise would be theatre with nothing behind it.
    const play = useCallback(async (body, onResult) => {
        if (busy) return;
        unlock();
        setBusy(true); setErr(null); setFlash(null); setPrize(null); setNote(null); setWonPet(null);
        Sfx.whoosh();
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }).then((x2) => x2.json()).catch(() => null);
        setBusy(false);
        if (!r?.ok) {
            setErr(r?.error === "no_gold" ? "Not enough gold for that bet."
                : r?.error === "bad_ticket" ? "Pick five numbers first."
                    : "That didn't go through.");
            return;
        }
        onResult(r);
        setSt((p) => ({ ...p, gold: r.gold }));
        absorb(r);
        if (r.won > 0) {
            // A payout worth more than ten times the stake is the moment worth shaking the room for.
            const big = r.won >= r.bet * 10;
            setFlash(big ? "big" : "win");
            if (big) { Sfx.crit(0.9); Haptic.crit(); } else { Sfx.gemSet?.(); Haptic.hit(0.6); }
            timers.current.push(setTimeout(() => setFlash(null), big ? 2200 : 1200));
        } else {
            Sfx.block(0.3);
        }
    }, [busy, absorb]);

    // ── THE TABLE ────────────────────────────────────────────────────────────────────────────────────────
    // Four verbs against one endpoint. The client sends no state at all — not which hand, not what is in it —
    // because everything about a hand of blackjack that could be worth lying about lives in a row on the
    // server. All this function decides is which word to send.
    const table = useCallback(async (action, body = {}) => {
        if (busy) return;
        unlock();
        setBusy(true); setErr(null); setFlash(null);
        if (action === "bj_deal") { setPrize(null); setNote(null); setWonPet(null); }
        Sfx.whoosh();
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action, ...body }),
        }).then((x2) => x2.json()).catch(() => null);
        setBusy(false);
        if (!r?.ok) {
            setErr(r?.error === "no_gold" ? "Not enough gold for that bet."
                : r?.error === "cannot_double" ? "You can only double on your first two cards."
                    : r?.error === "no_hand" ? "That hand is already finished."
                        : "That didn't go through.");
            return;
        }
        setHand(r.hand || null);
        if (r.gold != null) setSt((p) => ({ ...p, gold: r.gold }));
        // A card landing is a small sound; the hand ENDING is the moment. Splitting them is what keeps a hit
        // from feeling like a result.
        if (r.hand && r.hand.open) { Sfx.impact(0.4); Haptic.hit(0.35); return; }
        absorb(r);
        const beat = r.hand?.outcome;
        if (beat === "blackjack") { setFlash("big"); Sfx.crit(0.9); Haptic.crit(); }
        else if (r.won > 0) { setFlash("win"); Sfx.gemSet?.(); Haptic.hit(0.6); }
        else if (beat === "push") { Sfx.block(0.2); }
        else { Sfx.block(0.3); Haptic.hit(0.25); }
        if (r.won > 0 || beat === "blackjack") {
            timers.current.push(setTimeout(() => setFlash(null), beat === "blackjack" ? 2200 : 1200));
        }
    }, [busy, absorb]);

    // ── THE HALL ────────────────────────────────────────────────────────────────────────────────────────
    // One request buys the card, deals it and scores it. What happens next on screen is a ceremony over a
    // result already banked — the balls come out one at a time and the card daubs itself as they land,
    // because the whole appeal of bingo is watching your own card fill in, and a grid that arrives already
    // completed is a receipt.
    //
    // Nothing here can change the outcome, which is why the reveal is allowed to be pure presentation.
    const BALL_MS = 85;
    const buyCard = useCallback(async () => {
        if (busy) return;
        unlock();
        setBusy(true); setErr(null); setFlash(null); setPrize(null); setNote(null); setWonPet(null);
        setCard(null); setCalled(0);
        Sfx.whoosh();
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "bingo", bet }),
        }).then((x2) => x2.json()).catch(() => null);
        if (!r?.ok) {
            setBusy(false);
            setErr(r?.error === "no_gold" ? "Not enough gold for that card." : "That didn't go through.");
            return;
        }
        setCard(r);
        setSt((p) => ({ ...p, gold: r.gold }));

        // Ball by ball. The last five are slowed down: by then you can see what you need, and the pause is
        // where the game actually lives.
        (r.drawn || []).forEach((_, i) => {
            const late = i >= (r.drawn.length - 5);
            const at = i * BALL_MS + (late ? (i - (r.drawn.length - 5)) * 220 : 0);
            timers.current.push(setTimeout(() => {
                setCalled(i + 1);
                Sfx.ui?.();
            }, at));
        });
        const total = (r.drawn?.length || 0) * BALL_MS + 5 * 220 + 260;
        timers.current.push(setTimeout(() => {
            setBusy(false);
            absorb(r);
            if (r.won > 0) {
                const big = r.mult >= 8;
                setFlash(big ? "big" : "win");
                if (big) { Sfx.crit(0.9); Haptic.crit(); } else { Sfx.gemSet?.(); Haptic.hit(0.6); }
                timers.current.push(setTimeout(() => setFlash(null), big ? 2200 : 1200));
            } else Sfx.block(0.3);
        }, total));
    }, [bet, busy, absorb]);

    // Three of whatever this cabinet actually rolls, taken from the middle of its own symbol list so the
    // idle machine is neither promising a jackpot nor showing three blanks.
    const idleReels = useMemo(() => {
        const syms = (st?.slots?.[at?.id]?.symbols || []).map((x) => x.id);
        if (syms.length < 3) return ["moon", "bone", "doubloon"];
        const mid = Math.floor(syms.length / 2);
        return [syms[mid], syms[syms.length - 1], syms[Math.max(0, mid - 1)]];
    }, [st, at]);

    const toggleNumber = useCallback((n) => {
        setTicket((p) => (p.includes(n) ? p.filter((v) => v !== n) : p.length >= 5 ? p : [...p, n]));
    }, []);

    // Every timer this component starts is cleared on unmount — walking out mid-spin must not leave a
    // callback firing into a component that is gone.
    useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

    return (
        <section className="cas">
            <header className="cas-top">
                <a className="cas-out" href="/marketplace/town">← Town</a>
                <b className="cas-name">The Casino</b>
                <span className="cas-purse">{money(st?.gold)}<i>gold</i></span>
            </header>

            {/* ── WHO IS WORKING THE FLOOR FOR YOU ────────────────────────────────────────────────────────
                The five casino pets do nothing you can see at the moment they fire — a stake quietly comes
                back, a prize rolls off a better shelf. A perk you cannot point at is a perk nobody believes
                they have, so the ones you own sit at the top of the room by name. Nothing here when you own
                none: an empty rail advertising five pets you have never seen is a nag, not a feature. */}
            {(st?.perks?.pets || []).length ? (
                <div className="cas-pets">
                    {st.perks.pets.map((p) => <span key={p.id} className="cas-pet" title={p.perk || ""}>{p.name}</span>)}
                </div>
            ) : null}

            {/* ── THE ROOM ────────────────────────────────────────────────────────────────────────────────
                Positioned in percentages so the floor is the same room on any screen: a machine at 50 is in
                the middle of a phone and the middle of a desktop, rather than drifting with the viewport. */}
            <div className="cas-room" ref={roomRef}>
              <div className="cas-world">
                <div className="cas-floor" aria-hidden="true" />
                {MACHINES.map((m) => (
                    <div key={m.id} className={`cas-mach${m.live ? " is-live" : ""}${at?.id === m.id ? " is-near" : ""}`}
                        style={{ left: `${m.x}%` }}>
                        {/* The cabinet, drawn rather than approximated. It was a gradient and a border for
                            as long as the floor plan was still being argued about, which was the right order
                            to do it in — art costs money to get wrong, and the plan changed three times. */}
                        <span className="cas-mach-body">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/images/casino/${m.id}.webp`} alt="" draggable="false" />
                        </span>
                        <b>{m.label}</b>
                        <em>{m.live ? m.kind : "soon"}</em>
                    </div>
                ))}

                {/* Everybody else, really here. Drawn behind you so your own hero is never hidden by a crowd. */}
                {(st?.others || []).map((o) => (
                    <div key={o.id} className="cas-other" style={{ left: `${o.x}%` }} title={o.name}>
                        {o.sprite ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={o.sprite} alt="" draggable="false" style={{ transform: `scaleX(${o.facing})` }} />
                        ) : <span className="cas-blank" />}
                        <b>{o.name}</b>
                    </div>
                ))}

                {/* YOU. Everybody else in the room has been drawn with their own avatar since the floor
                    opened; your own hero was a plain circle, which made the one person you are actually
                    looking at the only one who was not there. */}
                <div className="cas-you" style={{ left: `${x}%` }}>
                    {st?.me?.sprite ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={st.me.sprite} alt="" draggable="false" style={{ transform: `scaleX(${facing})` }} />
                    ) : <span className="cas-blank is-you" style={{ transform: `scaleX(${facing})` }} />}
                </div>
              </div>
            </div>

            <div className="cas-walk">
                <button type="button" onClick={() => walk(-1)} aria-label="Walk left">◀</button>
                <span>{at ? at.label : "walk to a machine"}</span>
                <button type="button" onClick={() => walk(1)} aria-label="Walk right">▶</button>
            </div>

            {/* ── THE MACHINE YOU ARE AT ──────────────────────────────────────────────────────────────────
                Only rendered when you are standing at one, so the room is the screen and the game is
                something you walk up to rather than a panel that is always there. */}
            {at ? (
                <div className={`cas-panel${at.live ? "" : " is-dark"}`}>
                    <div className="cas-panel-head">
                        <b>{st?.slots?.[at.id]?.label || at.label}</b>
                        <em>{at.live ? at.kind : "not built yet"}</em>
                    </div>

                    {/* ── WHICH MACHINE IS THIS ───────────────────────────────────────────────────────
                        Three slot cabinets are only worth the floor space if the difference between them
                        is legible BEFORE you spend anything. The two numbers that describe a slot machine
                        are how often it pays and how much it pays at the top — so both are printed, and
                        the return is printed beside them because a floor that hides its own odds is a
                        floor that has something to hide. All three return within a point of each other,
                        which is exactly the thing worth being able to check. */}
                    {SLOTS.has(at.id) && st?.slots?.[at.id] ? (
                        <p className="cas-vol">
                            <span>{st.slots[at.id].blurb}</span>
                            <i>
                                pays on {Math.round(st.slots[at.id].hitRate * 100)}% of pulls
                                {" · "}top {money(Math.max(...Object.values(st.slots[at.id].pays.three)))}x
                                {" · "}returns {(st.slots[at.id].rtp * 100).toFixed(1)}%
                            </i>
                        </p>
                    ) : null}

                    {/* Each machine draws its own game. The slot's ceremony is three landings; the wheel and
                        the ticket resolve in one, so they get a result and a celebration and no theatre. */}
                    {at.live && at.id === "roulette" ? (
                        <>
                            <div className="cas-wheel">
                                {(st?.wheel?.segments || []).map((seg) => (
                                    <span key={seg.i}
                                        className={`cas-seg is-${seg.kind}${wheel?.seg?.i === seg.i ? " is-hit" : ""}`} />
                                ))}
                                {wheel ? (
                                    <b className={`cas-wheel-out${wheel.hit ? " is-win" : ""}`}>
                                        {wheel.hit ? `${money(wheel.won)} gold` : "The house takes it"}
                                    </b>
                                ) : <b className="cas-wheel-out">Place a bet</b>}
                            </div>
                            <div className="cas-picks">
                                {Object.entries(st?.wheel?.bets || {}).map(([id, b2]) => (
                                    <button key={id} type="button"
                                        className={`cas-pick${wheelBet === id ? " is-on" : ""}`}
                                        onClick={() => setWheelBet(id)}>
                                        {b2.label}<i>{b2.pays}x</i>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : null}

                    {at.live && at.id === "keno" ? (
                        <>
                            <div className="cas-grid">
                                {Array.from({ length: st?.keno?.pool || 40 }, (_, i) => i + 1).map((n) => {
                                    const mine = ticket.includes(n);
                                    const drew = keno?.drawn?.includes(n);
                                    return (
                                        <button key={n} type="button"
                                            className={`cas-num${mine ? " is-mine" : ""}${drew ? " is-drawn" : ""}${mine && drew ? " is-hit" : ""}`}
                                            onClick={() => toggleNumber(n)}>{n}</button>
                                    );
                                })}
                            </div>
                            <p className={`cas-result${keno?.won > 0 ? " is-win" : ""}`}>
                                {keno
                                    ? `${keno.hits.length} of 5 — ${keno.won > 0 ? `${money(keno.won)} gold` : "nothing"}`
                                    : `${ticket.length} of 5 picked`}
                            </p>
                        </>
                    ) : null}

                    {at.live && SLOTS.has(at.id) ? (
                        <>
                            <div className={`cas-reels${flash ? ` is-${flash}` : ""}`}>
                                {/* IDLE, the reels show three of THIS cabinet's own symbols. They were
                                    hard-coded to moon/bone/doubloon, which is fine on the machine that has
                                    those and a lie on the two that do not — Moonrise sat there displaying a
                                    doubloon it cannot roll. A machine teasing a symbol that is not on its
                                    reels is the one thing a paytable must never do. */}
                                {(rolling || spin?.reels || idleReels).map((sym, i) => {
                                    // A reel is SPINNING until its own stop lands. Each one is independent,
                                    // which is what lets the third hang while the first two already match.
                                    const stopped = !rolling && landed > i;
                                    return (
                                        <span key={i}
                                            className={`cas-reel${rolling ? " is-spin" : ""}${stopped ? " is-stop" : ""}`}
                                            style={{ "--tone": SYMBOL_ART[sym]?.tone || "#cbd3dc", "--i": i }}>
                                            {SYMBOL_ART[sym]?.glyph || "?"}
                                        </span>
                                    );
                                })}
                                {/* The celebration sits OVER the reels rather than beside them, so the win
                                    happens where you were already looking. */}
                                {flash ? (
                                    <span className={`cas-pop is-${flash}`} aria-hidden="true">
                                        {flash === "big" ? "JACKPOT" : "WIN"}
                                    </span>
                                ) : null}
                            </div>
                            {spin ? (
                                <p className={`cas-result${spin.won > 0 ? " is-win" : ""}`}>
                                    {spin.won > 0
                                        ? `${money(spin.won)} gold — ${spin.mult}x`
                                        : "Nothing. Again?"}
                                </p>
                            ) : <p className="cas-result">Pick a stake and pull.</p>}

                        </>
                    ) : null}

                    {/* ── THE CARD ───────────────────────────────────────────────────────────────────
                        Five columns under B-I-N-G-O, daubed as the balls land. The winning lines are sent
                        down with the result rather than worked out here — the server already knows which
                        ones paid, and a screen that recomputes them is a second implementation of the rules
                        that can disagree with the one that paid the money. */}
                    {at.live && at.id === "bingo" ? (
                        <div className="cas-hall">
                            <div className="cas-hall-top">
                                <span>{st?.bingo?.players?.length
                                    ? `${st.bingo.players.length} in this round — same forty numbers`
                                    : "Everyone who buys in this round plays the same forty numbers"}</span>
                            </div>

                            <div className="cas-bhead" aria-hidden="true">
                                {["B", "I", "N", "G", "O"].map((L) => <b key={L}>{L}</b>)}
                            </div>
                            <div className="cas-bcard">
                                {[0, 1, 2, 3, 4].map((row) => (
                                    [0, 1, 2, 3, 4].map((col) => {
                                        const n = card?.card?.[col]?.[row];
                                        const hit = n === 0 || (card && card.drawn.slice(0, called).includes(n));
                                        const won = Boolean(card && !busy && (
                                            card.lines?.some((l) => (l.kind === "row" && l.i === row)
                                                || (l.kind === "col" && l.i === col)
                                                || (l.kind === "diag" && l.i === 0 && row === col)
                                                || (l.kind === "diag" && l.i === 1 && row + col === 4))
                                            || (card.corners && card.lines?.length === 0
                                                && (row === 0 || row === 4) && (col === 0 || col === 4))
                                        ));
                                        return (
                                            <span key={`${row}-${col}`}
                                                className={`cas-bcell${hit ? " is-hit" : ""}${won ? " is-line" : ""}${n === 0 ? " is-free" : ""}`}>
                                                {card ? (n === 0 ? "★" : n) : ""}
                                            </span>
                                        );
                                    })
                                ))}
                            </div>

                            {/* The balls, in the order they came out. The newest one is the loud one. */}
                            <div className="cas-balls">
                                {(card?.drawn || []).slice(0, called).map((n, i) => (
                                    <span key={`${n}-${i}`} className={`cas-ball${i === called - 1 ? " is-new" : ""}`}>{n}</span>
                                ))}
                                {!card ? <span className="cas-balls-idle">Forty balls. A line gets your card back.</span> : null}
                            </div>

                            <p className={`cas-result${card && !busy && card.won > 0 ? " is-win" : ""}`}>
                                {!card ? `Two lines pays ${st?.bingo?.pays?.[2] ?? 2.5}x · six pays ${money(st?.bingo?.pays?.[6] ?? 300)}x`
                                    : busy ? `${called} of ${card.drawn.length} called…`
                                        : card.label
                                            ? `${card.label} — ${card.won > 0 ? `${money(card.won)} gold` : "no pay"}`
                                            : "Not this time."}
                            </p>
                        </div>
                    ) : null}

                    {/* ── THE FELT ────────────────────────────────────────────────────────────────────
                        Dealer on top, you below, the way a table is laid out — and the face-down card is
                        drawn face-down rather than left out, because the shape of the hand is the whole
                        thing you are reading. It is genuinely not in the payload while the hand is open. */}
                    {at.live && at.id === "blackjack" ? (
                        <div className="cas-felt">
                            <div className="cas-seat">
                                <span className="cas-seat-who">Dealer{hand && !hand.dealerHidden ? ` · ${hand.dealerValue.total}` : ""}</span>
                                <div className="cas-cards">
                                    {(hand?.dealer || []).map((c, i) => <Card key={`d${i}${c}`} card={c} />)}
                                    {hand?.dealerHidden ? <span className="cas-card is-down" aria-label="face down" /> : null}
                                    {!hand ? <span className="cas-card is-empty" /> : null}
                                </div>
                            </div>
                            {/* YOUR HANDS — plural, because a split makes two of them and they are played in
                                order. One hand is a list of length one, so there is no separate un-split
                                layout to keep in step with this one. The hand in play is the lit one; the
                                other is dimmed rather than hidden, because knowing what is waiting is half
                                of why you split. */}
                            {(hand?.hands || [null]).map((h, i) => (
                                <div key={i} className={`cas-seat is-you${h && hand.hands.length > 1 ? " is-multi" : ""}${h?.isActive ? " is-turn" : ""}`}>
                                    <span className="cas-seat-who">
                                        {hand?.hands?.length > 1 ? `Hand ${i + 1}` : "You"}
                                        {h ? ` · ${h.value.total}${h.value.soft && h.value.total <= 21 ? " soft" : ""}` : ""}
                                        {h?.doubled ? " · doubled" : ""}
                                        {h && !hand.open && h.outcome ? ` · ${OUTCOME_SHORT[h.outcome] || h.outcome}` : ""}
                                    </span>
                                    <div className="cas-cards">
                                        {(h?.cards || []).map((c, j) => <Card key={`p${i}-${j}${c}`} card={c} />)}
                                        {!h ? <span className="cas-card is-empty" /> : null}
                                    </div>
                                </div>
                            ))}
                            <p className={`cas-result${hand && !hand.open && hand.won > 0 ? " is-win" : ""}`}>
                                {!hand ? `Blackjack pays 3:2. The house rakes ${Math.round(rakeRate * 100)}% of what you win — never your stake.`
                                    : hand.open ? (hand.hands?.[hand.active]?.canSplit ? "Hit, stand, double, or split." : "Hit, stand, or double.")
                                        : hand.outcome === "split" ? "Both hands played."
                                            : OUTCOME[hand.outcome] || "Hand over."}
                                {hand && !hand.open && hand.won > 0 ? ` +${money(hand.won)} gold` : ""}
                                {hand && !hand.open && hand.rake > 0 ? ` (rake ${money(hand.rake)})` : ""}
                            </p>
                        </div>
                    ) : null}

                    {/* ── WHAT YOU WON THAT WAS NOT GOLD ──────────────────────────────────────────────
                        Shared by every machine, because a prize is a prize wherever it came from — and it
                        sits ABOVE the stake row so it is the last thing you read before deciding to go
                        again. That placement is the whole reason it is worth showing. */}
                    {/* ── THE PET TURNED UP ───────────────────────────────────────────────────────────
                        The rarest thing on this floor: 1 in 455 plays at the kindest and 1 in 5,556 at the
                        worst. It gets its own banner above everything else, and it says what the pet DOES —
                        a prestige drop whose effect you have to go and look up is a drop that lands flat. */}
                    {wonPet ? (
                        <div className="cas-newpet">
                            <b>{wonPet.name}</b>
                            <em>{wonPet.hint || "Joins your collection"}</em>
                            <i>{wonPet.perk || "works the floor from now on"}</i>
                        </div>
                    ) : null}

                    {/* The quiet ones — a free play, a refund. One line, no ceremony. */}
                    {note ? <p className={`cas-note is-${note.kind}`}>{note.text}</p> : null}

                    {prize ? (
                        <div className={`cas-prize${prize.jackpot ? " is-jackpot" : ""}`}>
                            {prize.spriteUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={prize.spriteUrl} alt="" draggable="false" />
                            ) : null}
                            <span>
                                <b>{prize.label || prize.kind}</b>
                                <em>{prize.where || "Added to your things"}</em>
                            </span>
                        </div>
                    ) : null}

                    {/* ONE STAKE ROW AND ONE BUTTON for every machine, because the stake is the same decision
                        wherever you are standing and a floor where each cabinet invents its own controls is a
                        floor you have to learn three times. */}
                    {at.live ? (
                        <>
                            {/* The stake row goes away mid-hand. The bet is already placed and the chips are
                                already gone — leaving four stake buttons live under a hand in progress asks
                                a question that has no answer until the hand is over.
                                NOT the `hidden` attribute: it works by the user-agent rule
                                `[hidden] { display: none }`, which ANY display in a stylesheet outranks —
                                and .cas-bets sets `display: flex`. It looked hidden in every screenshot that
                                happened to catch a finished hand, and was there the whole time in an open
                                one. Rendering nothing cannot be overridden by a stylesheet. */}
                            {at.id === "blackjack" && hand?.open ? null : (
                            <div className="cas-bets">
                                {[25, 100, 500, 2500].map((v) => (
                                    <button key={v} type="button"
                                        className={`cas-bet${bet === v ? " is-on" : ""}`}
                                        onClick={() => setBet(v)}>{money(v)}</button>
                                ))}
                            </div>
                            )}
                            {at.id === "blackjack" && hand?.open ? (
                                // MID-HAND the stake is already placed, so the stake row above is dead and
                                // these three are the only decision on the screen.
                                // Every button's legality comes from the SERVER's flags on the active hand,
                                // never from the client working the rules out again. A Split button that
                                // appears on a hand the table will refuse is worse than no button.
                                <div className={`cas-acts${hand.hands?.[hand.active]?.canSplit ? " is-four" : ""}`}>
                                    <button type="button" className="cas-act" disabled={busy} onClick={() => table("bj_hit")}>Hit</button>
                                    <button type="button" className="cas-act is-stand" disabled={busy} onClick={() => table("bj_stand")}>Stand</button>
                                    <button type="button" className="cas-act is-double"
                                        disabled={busy || !hand.hands?.[hand.active]?.canDouble || (st?.gold || 0) < hand.stake}
                                        onClick={() => table("bj_double")}>Double</button>
                                    {hand.hands?.[hand.active]?.canSplit ? (
                                        <button type="button" className="cas-act is-split"
                                            disabled={busy || (st?.gold || 0) < hand.stake}
                                            onClick={() => table("bj_split")}>Split</button>
                                    ) : null}
                                </div>
                            ) : null}
                            {at.id === "blackjack" && hand?.open ? null : (
                            <button type="button" className="cas-pull"
                                disabled={busy || (st?.gold || 0) < bet || (at.id === "keno" && ticket.length !== 5)}
                                onClick={() => {
                                    if (SLOTS.has(at.id)) return pull();
                                    if (at.id === "blackjack") return table("bj_deal", { bet });
                                    if (at.id === "bingo") return buyCard();
                                    if (at.id === "roulette") return play({ action: "wheel", bet, choice: wheelBet }, setWheel);
                                    return play({ action: "keno", bet, picks: ticket }, setKeno);
                                }}>
                                {busy ? "…"
                                    : (st?.gold || 0) < bet ? "Not enough gold"
                                        : at.id === "keno" && ticket.length !== 5 ? "Pick five numbers"
                                            : `${SLOTS.has(at.id) ? "Pull" : at.id === "blackjack" ? "Deal" : at.id === "roulette" ? "Spin" : at.id === "bingo" ? "Buy a card" : "Play"} · ${money(bet)}`}
                            </button>
                            )}
                            {err ? <p className="cas-err">{err}</p> : null}
                        </>
                    ) : (
                        <p className="cas-soon">The lights are on and nothing is inside yet.</p>
                    )}
                </div>
            ) : null}

            {/* THE DAY'S THREE, at the very bottom. This sat between the room and the walk controls for
                exactly one screenshot: it is tall enough on a phone that it pushed the ◀ ▶ buttons off the
                bottom of the screen, so the floor became a room you could not walk around. Anything that
                is not the room or the machine goes below both. */}
            <FeatureDailies feature="casino" />

        </section>
    );
}
