"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Burst from "@/components/casino/Burst";
import { Cas } from "@/components/casino/casino-audio.js";
import { Haptic } from "@/components/arena/arena-audio.js";

// ── THE COUNT IS THE CELEBRATION ─────────────────────────────────────────────────────────────────────────────
// Luke: "we are missing the slow count up and celebration when you win... across all slots we don't do a good
// job counting up the chips. It's a big dopamine opportunity."
//
// He is right, and the reason is that every cabinet had its own idea of what a win looks like. The five-reel
// machines ticked a number up in a 13px line under the glass over about eight tenths of a second; the colossal
// cabinet did not count at all, it just printed the total. Both are receipts. The count IS the win — it is the
// only part of a payout that lasts longer than the instant, and a machine that hands you the number has spent
// the whole event before you have looked up.
//
// So there is one of these now and every cabinet uses it. Two things make it work:
//
//   THE LENGTH IS THE SIZE. A 2-chip win must not take four seconds and a 900-chip win must not take one. The
//   duration comes off the MULTIPLE — what the spin paid against what it cost — so the machine spends time in
//   proportion to what happened, which is the whole grammar of a slot floor. A number that always takes the
//   same time to arrive is a progress bar.
//
//   AND IT ESCALATES. Past ten times the stake the count stops being a line under the reels and takes the
//   cabinet: a title, coins thrown, a held beat. Below that it stays out of the way. A machine that shouts
//   about everything is a machine that shouts about nothing — see the note on CELEBRATE_AT.
//
// The tiers below are read off the multiple, not the chips, because a 200-chip win means something different
// at a 20 stake than at a 500 one and only the multiple knows which.
const TIERS = [
    // Ordinary. No title, no coins, no splash — it counts where it stands, briskly.
    { at: 0, ms: 780, label: null, burst: null, hold: 0 },
    // BIG WIN. The first tier that takes the screen. Ten times the stake is the same threshold the horns
    // already used (BIG_WIN_AT), so the sound and the picture agree about what a big win is.
    { at: 10, ms: 2100, label: "BIG WIN", burst: "coin", hold: 900 },
    // MEGA. Thirty times. Coins by the fistful and long enough that the number visibly climbs past numbers
    // you have seen before, which is the part people describe afterwards.
    { at: 30, ms: 3200, label: "MEGA WIN", burst: "hoard", hold: 1100 },
    // COLOSSAL. Seventy-five times the stake — a handful of spins in ten thousand. It gets five seconds and
    // everything the component has, because if this one is not worth stopping the room for, none of them are.
    { at: 75, ms: 4600, label: "COLOSSAL WIN", burst: "hoard", hold: 1500 },
];

export const tierFor = (multiple) => {
    let t = TIERS[0];
    for (const x of TIERS) if ((multiple || 0) >= x.at) t = x;
    return t;
};
/** Does this win take the screen? Callers use it to get out of the way (hide readouts, hold the reels). */
export const isBigWin = (multiple) => tierFor(multiple).label !== null;

/**
 * @param {number} chips     what the spin paid, in chips
 * @param {number} multiple  chips ÷ stake — what decides how loud this is
 * @param {string} tone      the machine's colour, for the coins and the glow
 * @param {Function} onDone  called once the count and its held beat are over
 */
export default function WinTally({ chips = 0, multiple = 0, tone = "#ffd75e", ms = null, onDone = null }) {
    // `ms` overrides the tier's own duration. There is one caller: the free-round recap, which is counting a
    // whole round rather than a spin and wants longer than the ordinary tier would give it. The TIER still
    // decides everything else, so a recap cannot accidentally become a splash.
    const tier = useMemo(() => {
        const t = tierFor(multiple);
        return ms ? { ...t, ms } : t;
    }, [multiple, ms]);
    const [at, setAt] = useState(0);
    const [over, setOver] = useState(false);
    const doneRef = useRef(onDone);
    doneRef.current = onDone;

    useEffect(() => {
        if (!chips) return undefined;
        setAt(0); setOver(false);
        // ── THE SOUND OF A NUMBER GOING UP ───────────────────────────────────────────────────────────────
        // One ping per frame is a buzz, so it fires every fourth and the PITCH rises with the count. That
        // rising line is what makes a long count feel like it is going somewhere rather than merely taking
        // a while — it is the same trick as a slot's ratchet, and it is doing most of the work here.
        let raf = 0, t0 = 0, frame = 0, dead = false;
        const step = (t) => {
            if (dead) return;
            if (!t0) t0 = t;
            const k = Math.min(1, (t - t0) / tier.ms);
            // Fast at first and easing to a stop: the number should look like it is ARRIVING at a total,
            // not like a timer running out.
            const e = 1 - Math.pow(1 - k, 3);
            setAt(Math.round(chips * e));
            frame += 1;
            if (frame % 4 === 0 && k < 1) Cas.coin(Math.round(k * 10) - 3);
            if (k < 1) { raf = requestAnimationFrame(step); return; }
            // Landed. The bigger the win the more it is worth hearing about.
            if (tier.label) { Cas.jackpot(); Haptic.crit(); } else Cas.coins(0.55);
            setOver(true);
        };
        raf = requestAnimationFrame(step);
        return () => { dead = true; cancelAnimationFrame(raf); };
    }, [chips, tier]);

    // The held beat AFTER the number lands. Without it a big win vanishes at the exact moment it finishes
    // being impressive, which is the one frame nobody should be looking at an empty screen.
    useEffect(() => {
        if (!over) return undefined;
        const t = setTimeout(() => doneRef.current?.(), tier.hold);
        return () => clearTimeout(t);
    }, [over, tier]);

    if (!chips) return null;

    // Ordinary wins stay a line. Only the tiers with a title take the cabinet.
    if (!tier.label) {
        return (
            <span className="wt-line" style={{ "--tone": tone }}>
                <b>{at.toLocaleString()}</b> chips
            </span>
        );
    }

    return (
        <div className={`wt-splash is-${tier.label.split(" ")[0].toLowerCase()}`} style={{ "--tone": tone }} role="status">
            <i className="wt-rays" aria-hidden="true" />
            {/* Coins land on the `over` flag as well as at the start, so the pile arrives twice: once as the
                count begins and once as it lands. One throw at the top is over before the number is. */}
            <Burst kind={tier.burst} tone={tone} />
            {over ? <Burst key="land" kind={tier.burst} tone={tone} /> : null}
            <span className="wt-title">{tier.label}</span>
            <b className="wt-n">{at.toLocaleString()}</b>
            <span className="wt-sub">chips</span>
        </div>
    );
}
