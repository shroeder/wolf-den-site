"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cas } from "@/components/casino/casino-audio.js";
import { Haptic, unlock } from "@/components/arena/arena-audio.js";

// ── THE PETTING PEN ──────────────────────────────────────────────────────────────────────────────────────────
// Luke: "this bonus needs work. it should replace the play area with a first class game, it should be a pet
// themed mini game, where you pet different pets and they give you random bonuses."
//
// It was seven grey boxes with question marks in them, sitting UNDER the reels, which is a form asking you to
// press it four times. A bonus round is the rarest thing on the machine — one spin in two hundred and
// thirty-three — and it should be the moment the slot machine stops being a slot machine.
//
// So the reels go away entirely and the pen takes the whole board: your own pets, on the farm's own sky, and
// you walk along petting them. Every pet gives something and one of them has had enough, which is the same
// board the server always decided — the taps still only REVEAL it. What changed is that the thing being
// revealed is an animal you collected rather than a numbered box.
//
// WHY THE MEMBER'S OWN PETS. They are the thing people have been collecting for months, and this is the only
// place in the game that pays you for having them. Somebody who owns forty pets should see forty different
// faces here across a year of bonus rounds, and somebody who owns none still gets a full paddock — see
// petsForPick, which falls back rather than showing an empty field.

// ── ONE PICK GAME, THREE SUBJECTS ────────────────────────────────────────────────────────────────────────────
// The Hunt pets its animals in a field, The Deep hauls them up in a net, The Vault opens what it finds. Same
// interaction — tap, something gives you a number, one of them ends it — with a different place, a different
// verb and a different pool.
//
// ONE COMPONENT, not three. Three copies of a pick game means two of them stop getting the fixes: the pop
// that lands on the wrong thing, the orphaned row, the unreadable caption — all three were found once here
// and would have had to be found again twice more.
const SKIN = {
    pen: { title: "The petting pen", say: "Pet them one at a time. One of them will have had enough.",
        done: "That is the lot. Well done.", verbs: ["nuzzles you", "rolls over", "headbutts your hand",
            "purrs", "thumps its tail", "leans in", "chirps at you", "flops down happily"],
        endWord: "has had enough" },
    trawl: { title: "The trawl", say: "Haul the net up, one at a time. Something down there will cut it.",
        done: "The net is empty. Back up you go.",
        verbs: ["comes up thrashing", "is heavier than it looks", "glitters", "surfaces slowly",
            "brings the net taut", "is worth the trip", "shines in the dark", "was hiding down there"],
        endWord: "cuts the net" },
    locks: { title: "The locks", say: "One lock at a time. One of them is holding the door shut.",
        done: "The door is closed again.",
        verbs: ["gives", "clicks open", "turns easily", "yields", "falls away", "opens clean",
            "was barely holding", "comes apart"],
        endWord: "will not turn" },
};

const FARM_BG = {
    day: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838066440-671862.png",
    dusk: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838089019-734565.png",
    night: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838349373-318702.png",
    dawn: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/farm-bg/1784838132569-798406.png",
};
// ── A DEEP-SEA NET HAUL OVER A RED BARN ──────────────────────────────────────────────────────────────────────
// This function's own comment said "The Deep is under water, so it does not take the farm's hour" and the very
// next line handed The Deep the farm's NIGHT SKY. So The Trawl — a net coming up out of the ocean, full of
// squid and marlin — played against a barn, a fence, a tree and a field of grass.
//
// It only shows up if you look at it. The comment is right, the gate is green, the code compiles, and the
// screen is a fishing bonus in a barnyard.
const SEA_BG = "/images/sailing/battle-bg-night.webp";

// The same sky the farm would be showing right now. A pen that is always noon while the farm next door is at
// dusk is two different farms.
function skyNow(board) {
    // Only the pen is outdoors on the farm, so only the pen takes the farm's hour.
    if (board === "trawl") return SEA_BG;
    if (board === "locks") return FARM_BG.dusk;
    const h = new Date().getHours();
    if (h < 6) return FARM_BG.night;
    if (h < 9) return FARM_BG.dawn;
    if (h < 18) return FARM_BG.day;
    if (h < 21) return FARM_BG.dusk;
    return FARM_BG.night;
}

// What each pet says when you reach it. Nothing here is mechanical — it is the difference between a number
// appearing and an animal giving you something.
export default function PettingPen({ pick, onDone }) {
    const [turned, setTurned] = useState([]);     // indexes already petted, in order
    const [pop, setPop] = useState(null);         // { i, text, kind }
    const [shown, setShown] = useState(0);        // the running total, counting up
    const [bump, setBump] = useState(-1);         // which pet is mid-animation
    const timers = useRef([]);
    const board = pick?.board || "pen";
    const skin = SKIN[board] || SKIN.pen;
    const sky = useMemo(() => skyNow(board), [board]);

    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const cards = pick?.picked || [];
    const pets = pick?.pets || [];
    const each = pick?.each || [];
    const over = turned.some((i) => cards[i]?.kind === "end");

    // ── THE NUMBER CLIMBS ────────────────────────────────────────────────────────────────────────────────
    // Counted up rather than stated, and deliberately not at a constant rate: a total that ticks evenly reads
    // as a progress bar, and one that starts fast and eases out reads as money landing.
    const target = useMemo(() => {
        let sum = 0; let mult = 1;
        for (const i of turned) {
            const c = cards[i];
            if (!c) continue;
            if (c.kind === "mult") mult *= c.value;
            else if (c.kind === "chips") sum += each[i] || 0;
        }
        return Math.round(sum * mult);
    }, [turned, cards, each]);

    useEffect(() => {
        if (shown >= target) return undefined;
        const gap = Math.max(1, target - shown);
        const step = Math.max(1, Math.round(gap / 6));
        const t = setTimeout(() => setShown((n) => Math.min(target, n + step)), 42);
        return () => clearTimeout(t);
    }, [shown, target]);

    const pet = useCallback((i) => {
        if (over || turned.includes(i)) return;
        unlock();
        const card = cards[i];
        if (!card) return;
        setTurned((t) => [...t, i]);
        setBump(i);
        timers.current.push(setTimeout(() => setBump(-1), 520));

        if (card.kind === "end") {
            setPop({ i, kind: "end", text: skin.endWord });
            Cas.lose();
            Haptic.hit(0.7);
            timers.current.push(setTimeout(() => onDone(), 1500));
            return;
        }
        if (card.kind === "mult") {
            setPop({ i, kind: "mult", text: `×${card.value}` });
            Cas.multUp(card.value);
            Haptic.crit();
            return;
        }
        setPop({ i, kind: "chips", text: `+${(each[i] || 0).toLocaleString()}` });
        Cas.coins(Math.min(1, (each[i] || 0) / 300));
        Haptic.hit(0.45);
    }, [over, turned, cards, each, onDone, skin]);

    return (
        <div className="pen" style={{ backgroundImage: `url(${sky})` }}>
            <div className="pen-sky" aria-hidden="true" />

            <div className="pen-head">
                <i>{skin.title}</i>
                <b>{shown.toLocaleString()}</b>
                <em>chips</em>
            </div>
            <p className="pen-say">
                {over ? skin.done : skin.say}
            </p>

            {/* THREE ACROSS FOR A SMALL FLOCK, FOUR FOR A BIG ONE. Nine pets in four columns leaves a single
                animal orphaned on its own row, which reads as a mistake rather than a paddock. */}
            <div className="pen-field" style={{ "--cols": cards.length <= 9 ? 3 : 4 }}>
                {cards.map((c, i) => {
                    const p = pets[i] || {};
                    const done = turned.includes(i);
                    return (
                        <button key={i} type="button"
                            className={`pen-pet${done ? " is-done" : ""}${bump === i ? " is-bump" : ""}${over && !done ? " is-out" : ""}`}
                            disabled={over || done}
                            onClick={() => pet(i)}
                            aria-label={done ? `${p.name} — already taken` : `${board === "pen" ? "Pet" : "Take"} the ${p.name}`}>
                            {/* The pop sits on the animal that gave it, not in a corner of the screen. A number
                                that appears somewhere else is a number you have to go and find. */}
                            {pop?.i === i ? <span className={`pen-pop is-${pop.kind}`}>{pop.text}</span> : null}
                            {p.url
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={p.url} alt="" draggable="false" />
                                : <span className="pen-noart" aria-hidden="true">?</span>}
                            <span className="pen-name">{done ? (c.kind === "end" ? skin.endWord : skin.verbs[i % skin.verbs.length]) : p.name}</span>
                        </button>
                    );
                })}
            </div>

            {over ? (
                <button type="button" className="pen-go" onClick={onDone}>
                    Take {shown.toLocaleString()} chips
                </button>
            ) : null}
        </div>
    );
}
