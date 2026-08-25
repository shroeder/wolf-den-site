"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cas } from "@/components/casino/casino-audio.js";
import { Haptic, unlock } from "@/components/arena/arena-audio.js";
import ChipStore from "@/components/casino/ChipStore.js";
import { GlobalChatTab } from "@/components/SocialHub";

// ── BEHIND THE ROPE ──────────────────────────────────────────────────────────────────────────────────────────
// The room a VIP walks into. It is built out of the same four parts the casino floor is — a wide painted scene,
// people standing in it, things you can walk up to, and a panel that opens when you do — because it IS the
// casino floor's little brother and a second set of conventions in the same building would be a second thing
// to learn for no reason.
//
// WHAT IS ACTUALLY IN HERE, and what each one reuses:
//   the room      one painted 3:1 elevation (gen-vip-lounge.mjs). Flat, no vanishing point, because the
//                 camera pans and a perspective scene is right from exactly one camera position.
//   other VIPs    `mkt_town_presence` on the lounge's own zone. Same machinery as the floor and the tavern.
//   the chat      the `vip` channel, which already existed (migration 402) and already has a join window.
//                 SocialHub's own GlobalChatTab renders it; this screen only says which channel to point at.
//   the bartender a sprite you tap, who says one true thing about how the game works. See vip.js.
//   the vendor    a sprite you tap, who opens ChipStore against the VIP shelf. The same component the
//                 Counter uses, handed a different list.
//
// The only thing written from scratch is the noticeboard, because nothing else in the game is a message left
// for a group rather than for a person.

const POST = (body) => fetch("/api/marketplace/casino", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}).then((r) => r.json()).catch(() => null);

// Where the two people you can talk to are PAINTED in the room, as a percentage across it. They are not
// placed freely: the bar is at the right-hand end of the picture and they have to stand at it, so these two
// numbers belong to the painting and move only when it is redrawn.
const BARTENDER_X = 78;
const VENDOR_X = 90;
// How close you have to stand to talk to somebody, in the same units. The floor uses 5 against a machine
// spacing of 9; these two are 12 apart, so 6 keeps the same feel without their reaches overlapping.
const REACH = 6;

export default function VipLounge({ state, chips, me, onClose, onChips }) {
    const [st, setSt] = useState(state || null);
    const [x, setX] = useState(20);
    const [facing, setFacing] = useState(1);
    // Which of the two is open, or null. One at a time: they stand a foot apart and two panels would cover
    // the room they are standing in.
    const [open, setOpen] = useState(null);
    const [note, setNote] = useState("");
    const [saying, setSaying] = useState(null);
    const [busy, setBusy] = useState(false);
    const xRef = useRef(20);
    const roomRef = useRef(null);

    useEffect(() => { xRef.current = x; }, [x]);

    // ── YOU ARE HERE, AND SO IS EVERYBODY ELSE ───────────────────────────────────────────────────────────
    // Position pushed on a timer and the room re-read on the same one. Identical shape to the casino floor:
    // the walk is local and immediate because it must never wait on a round trip, and the server hears about
    // it afterwards so the other people in the room see you move.
    useEffect(() => {
        const id = setInterval(async () => {
            const r = await POST({ action: "vip_move", x: xRef.current, y: 72, facing });
            if (r?.ok === false) return;
            const s = await POST({ action: "vip_state" });
            if (s?.open) setSt(s);
        }, 3000);
        return () => clearInterval(id);
    }, [facing]);

    const walkTo = useCallback((pct) => {
        const to = Math.max(6, Math.min(94, pct));
        setFacing(to < xRef.current ? -1 : 1);
        setX(to);
        Cas.chips?.();
    }, []);

    // Who is within reach, which decides what the button at the bottom offers. Derived rather than stored so
    // it can never disagree with where you are actually standing.
    const near = useMemo(() => {
        if (Math.abs(x - BARTENDER_X) <= REACH) return "bartender";
        if (Math.abs(x - VENDOR_X) <= REACH) return "vendor";
        return null;
    }, [x]);

    // Walking away closes whoever you were talking to — the same rule the floor uses for a cabinet, and the
    // one that stops a panel hanging over a room you have left.
    //
    // DERIVED, not an effect that clears `open` when `near` changes. That version worked and was wrong for a
    // reason worth keeping: it made the panel a second piece of state that has to be kept in step with where
    // you are standing, and there is exactly one frame after you walk away in which the two disagree. Asking
    // "is the person I opened still the person I am next to" cannot have that frame.
    const talking = open && open === near ? open : null;

    const talk = useCallback(async () => {
        unlock();
        setOpen(near);
        if (near === "bartender") {
            Cas.chips?.(); Haptic.hit(0.3);
            const s = await POST({ action: "vip_state" });
            if (s?.open) { setSt(s); setSaying(s.bartender?.text || null); }
        }
    }, [near]);

    const pinNote = useCallback(async () => {
        if (busy || !note.trim()) return;
        setBusy(true);
        const r = await POST({ action: "vip_note", body: note });
        setBusy(false);
        if (r?.ok) { setNote(""); setSt((p) => ({ ...p, notes: r.notes })); Cas.chips?.(); Haptic.hit(0.4); }
        else setSaying(r?.reason || "That didn't go up.");
    }, [busy, note]);

    const clearNote = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        const r = await POST({ action: "vip_note_clear" });
        setBusy(false);
        if (r?.ok) setSt((p) => ({ ...p, notes: r.notes }));
    }, [busy]);

    const shelf = useCallback(() => POST({ action: "chip_shelf", vip: true }), []);
    const buy = useCallback(async (item) => {
        const r = await POST({ action: "chip_buy", item });
        if (r?.ok && typeof r.balance === "number") onChips?.(r.balance);
        return r;
    }, [onChips]);

    const mine = (st?.notes || []).find((n) => n.mine) || null;

    return (
        <div className="vip">
            <header className="vip-top">
                <button type="button" className="vip-out" onClick={onClose}>← The floor</button>
                <b>The Lounge</b>
                <span className="vip-purse">{Number(chips || 0).toLocaleString()}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/casino/hud-chip.webp" alt="chips" width={14} height={14} />
                </span>
            </header>

            {/* ── THE ROOM ────────────────────────────────────────────────────────────────────────────
                One painting, scrolled. `--vx` is where the camera is, driven off where you are standing, so
                the room follows you rather than you sliding around inside a fixed picture. */}
            <div className="vip-roomwrap">
                <div className="vip-room" ref={roomRef}
                    style={{ "--vx": `${x}%` }}
                    onClick={(e) => {
                        if (e.target !== e.currentTarget) return;
                        const b = e.currentTarget.getBoundingClientRect();
                        walkTo(((e.clientX - b.left) / b.width) * 100);
                    }}>
                    <div className="vip-world">
                        {/* The two you can talk to, painted over the room at the positions the bar is at.
                            Buttons rather than decoration, because everything you can interact with on this
                            floor is a button with a hit area and a hover state. */}
                        <button type="button"
                            className={`vip-npc is-bartender${near === "bartender" ? " is-near" : ""}`}
                            style={{ left: `${BARTENDER_X}%` }}
                            aria-label="The bartender"
                            onClick={() => { walkTo(BARTENDER_X); }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/casino/vip-bartender.webp" alt="" draggable="false" />
                            <b>Rolf</b>
                        </button>
                        <button type="button"
                            className={`vip-npc is-vendor${near === "vendor" ? " is-near" : ""}`}
                            style={{ left: `${VENDOR_X}%` }}
                            aria-label="The vendor"
                            onClick={() => { walkTo(VENDOR_X); }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/casino/vip-vendor.webp" alt="" draggable="false" />
                            <b>Sable</b>
                        </button>

                        {/* Everybody else, really here. Behind you, so your own hero is never hidden. */}
                        {(st?.others || []).map((o) => (
                            <div key={o.id} className="vip-other" style={{ left: `${o.x}%` }} title={o.name}>
                                {o.sprite
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={o.sprite} alt="" draggable="false" />
                                    : <i aria-hidden="true" />}
                                <em>{o.name}</em>
                            </div>
                        ))}

                        {/* You, drawn with your own avatar exactly as the floor draws you — walking out of
                            one room and into the next should not change what you look like. */}
                        <div className={`vip-me${facing === -1 ? " is-left" : ""}`} style={{ left: `${x}%` }}>
                            {me?.sprite
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={me.sprite} alt="" draggable="false" />
                                : <i aria-hidden="true" />}
                        </div>
                    </div>
                </div>
            </div>

            {/* What is within reach. One button, in the same place, whatever you are standing at. */}
            <div className="vip-act">
                {near ? (
                    <button type="button" className="vip-talk" onClick={talk}>
                        {near === "bartender" ? "Talk to Rolf" : "See what Sable has"}
                    </button>
                ) : <span>Walk over to the bar</span>}
            </div>

            {/* ── THE BARTENDER ───────────────────────────────────────────────────────────────────────
                One true thing about how the game works, and the noticeboard he is holding for the room. */}
            {talking === "bartender" ? (
                <div className="vip-panel">
                    <h4>Rolf leans in</h4>
                    <p className="vip-said">{saying || st?.bartender?.text || "…"}</p>

                    <div className="vip-board">
                        <h5>Pinned behind the bar</h5>
                        {(st?.notes || []).length ? (
                            <ul className="vip-notes">
                                {st.notes.map((n) => (
                                    <li key={n.id} className={n.mine ? "is-mine" : ""}>
                                        <b>{n.who}</b>
                                        <span>{n.body}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="vip-empty">Nobody has left anything yet.</p>}

                        {/* One live note each. Writing a second REPLACES the first rather than being refused —
                            being told "you already have a note up" is a worse answer than simply changing what
                            your note says, and it is the same gesture either way. */}
                        <div className="vip-write">
                            <input type="text" value={note} maxLength={st?.noteMax || 220}
                                placeholder={mine ? "Change your note…" : "Leave a note for the others…"}
                                onChange={(e) => setNote(e.target.value)} />
                            <button type="button" disabled={busy || !note.trim()} onClick={pinNote}>
                                {mine ? "Replace" : "Pin it"}
                            </button>
                        </div>
                        {mine ? (
                            <button type="button" className="vip-take" disabled={busy} onClick={clearNote}>
                                Take mine down
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {/* ── THE VENDOR ──────────────────────────────────────────────────────────────────────────
                The Counter's own component, handed the VIP list instead. Not a second shop screen: the
                buying, the affording, the inspect card and the receipt are all solved once, over there. */}
            {talking === "vendor" ? (
                <div className="vip-panel">
                    <h4>Sable opens the case</h4>
                    <p className="vip-said">Three of them. Nobody out on the floor can have these.</p>
                    <ChipStore chips={chips} onBuy={buy} onRefresh={shelf} />
                </div>
            ) : null}

            {/* ── THE VIP CHAT ────────────────────────────────────────────────────────────────────────
                The channel that already existed, shown in the room it belongs to. Pointing the lounge at a
                NEW channel would have split the VIP conversation across two places and left neither worth
                reading — and this one already has the join window that stops a new VIP walking into a wall
                of other people's backlog. */}
            <div className="vip-chat">
                <GlobalChatTab open channel="vip" />
            </div>
        </div>
    );
}
