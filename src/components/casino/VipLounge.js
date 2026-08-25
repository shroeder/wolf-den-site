"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cas } from "@/components/casino/casino-audio.js";
import { Haptic, Sfx, unlock } from "@/components/arena/arena-audio.js";
import ChipStore from "@/components/casino/ChipStore.js";
import { GlobalChatTab } from "@/components/SocialHub";

// ── BEHIND THE ROPE ──────────────────────────────────────────────────────────────────────────────────────────
// The room a VIP walks into.
//
// ── AND IT IS A ROOM YOU WALK AROUND, WHICH IT WAS NOT ───────────────────────────────────────────────────────
// The first cut was one fixed screen you could not move in. Luke: "no idea what I'm looking at, but it doesn't
// match what I told you at all — dude's tiny, what's up with the wolf torsos, can't scroll left and right or
// walk around." Three mistakes, all mine:
//
//   IT DID NOT SCROLL. I made the lounge a single static view, reasoning that a painted interior has edges and
//   a panning camera can reach them. That constraint is real and the conclusion was wrong: what he asked for
//   was a room people walk around in, so the answer was to give the camera somewhere to GO, not to take the
//   camera away. It runs the casino floor's own machinery now — a world wider than the window, a scrollLeft
//   camera that follows you, drag to look, tap to walk.
//
//   THE HERO WAS TINY. Sized at 0.16 of the room where the floor draws the same sprite at 0.282. There was no
//   reason for the difference: I picked a number instead of reading the one already in use next door.
//
//   THE NPCs WERE FLOATING TORSOS. I prompted them "head and torso only, nothing below the bar" while
//   picturing them behind a bar, then placed them in a room whose bar is off to one side. Both are drawn full
//   length now, in the hero's own chibi build, standing on the floor he stands on.
//
// Everything else is still borrowed rather than rebuilt: the `vip` chat channel, `mkt_town_presence` for who
// else is here, and the Counter's own ChipStore for the vendor.

const POST = (body) => fetch("/api/marketplace/casino", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}).then((r) => r.json()).catch(() => null);

// Where the two you can talk to stand, across the world. The bar is at the right-hand end of the painting, so
// they stand at it and you walk the room to reach them.
const BARTENDER_X = 74;
const VENDOR_X = 87;
// Close enough to talk. The floor uses 5 against cabinets spaced 9; these two are 13 apart, so 6 keeps the
// same feel without their reaches touching.
const REACH = 6;

// The same walk the casino floor runs, at the same speed, so the two rooms move identically.
const WALK_PER_SEC = 26;
const WALK_TICK_MS = 62;

export default function VipLounge({ state, chips, me, onClose, onChips }) {
    const [st, setSt] = useState(state || null);
    const [x, setX] = useState(24);
    const [facing, setFacing] = useState(1);
    const [goal, setGoal] = useState(null);
    const [open, setOpen] = useState(null);
    const [note, setNote] = useState("");
    const [saying, setSaying] = useState(null);
    const [busy, setBusy] = useState(false);
    const xRef = useRef(24);
    const roomRef = useRef(null);

    useEffect(() => { xRef.current = x; }, [x]);

    // ── WALKING ──────────────────────────────────────────────────────────────────────────────────────────
    // `goal` is where you are heading, or null when you are still. Tapping the floor and tapping a person both
    // set a goal and this loop does the walking — one mechanism rather than two, exactly as on the floor.
    useEffect(() => {
        if (goal == null) return undefined;
        const id = setInterval(() => {
            setX((p) => {
                const step = (WALK_PER_SEC * WALK_TICK_MS) / 1000;
                const d = goal - p;
                if (Math.abs(d) <= step) { setGoal(null); return goal; }
                return p + Math.sign(d) * step;
            });
        }, WALK_TICK_MS);
        return () => clearInterval(id);
    }, [goal]);

    // A footfall every fourth tick — one per tick is a machine gun, none is a conveyor belt.
    useEffect(() => {
        if (goal == null) return undefined;
        const id = setInterval(() => Sfx.step?.(0.3 + Math.random() * 0.35), WALK_TICK_MS * 4);
        return () => clearInterval(id);
    }, [goal]);

    // ── THE CAMERA FOLLOWS YOU ───────────────────────────────────────────────────────────────────────────
    // The world is wider than the window, so the window scrolls to keep you near the middle of it. scrollLeft
    // on the room rather than a transform on the world, because a transform fights the drag-to-look below.
    useEffect(() => {
        const el = roomRef.current;
        if (!el) return;
        el.scrollTo({ left: (el.scrollWidth * x) / 100 - el.clientWidth / 2, behavior: "auto" });
    }, [x]);

    // ── DRAG TO LOOK ─────────────────────────────────────────────────────────────────────────────────────
    // Touch gets this from the native scroller; a mouse does not, so it drives scrollLeft by hand. Capture is
    // taken only once the gesture IS a pan and never on pointerdown — capturing early retargets the pointerup
    // and every button in the scene stops receiving clicks on desktop. The town's camera carries that scar.
    const pan = useRef({ down: false, moved: false, startX: 0, startY: 0, lastX: 0, mouse: false, cap: null });
    const panDown = useCallback((e) => {
        pan.current = { down: true, moved: false, startX: e.clientX, startY: e.clientY, lastX: e.clientX,
            mouse: e.pointerType === "mouse", cap: null };
    }, []);
    const panMove = useCallback((e) => {
        const d = pan.current;
        if (!d.down) return;
        if (!d.moved && Math.abs(e.clientX - d.startX) > 4
            && Math.abs(e.clientX - d.startX) > Math.abs(e.clientY - d.startY) * 0.8) {
            d.moved = true;
            if (d.mouse) { try { e.currentTarget.setPointerCapture(e.pointerId); d.cap = e.pointerId; } catch { /* ok */ } }
        }
        if (!d.moved) return;
        if (d.mouse) e.currentTarget.scrollLeft -= e.clientX - d.lastX;
        d.lastX = e.clientX;
    }, []);
    const panUp = useCallback((e) => {
        const d = pan.current;
        d.down = false;
        if (d.cap != null) { try { e.currentTarget.releasePointerCapture(d.cap); } catch { /* ok */ } d.cap = null; }
    }, []);
    // True once, if the gesture that just finished was a drag — so a swipe that ends over somebody does not
    // also walk you to them.
    const draggedJustNow = useCallback(() => {
        if (!pan.current.moved) return false;
        pan.current.moved = false;
        return true;
    }, []);

    const walkTo = useCallback((pct) => {
        unlock();
        const to = Math.max(6, Math.min(94, pct));
        setFacing(to < xRef.current ? -1 : 1);
        setGoal(to);
    }, []);

    // ── YOU ARE HERE, AND SO IS EVERYBODY ELSE ───────────────────────────────────────────────────────────
    // Position pushed on a timer and the room re-read on the same one. The walk is local and immediate because
    // it must never wait on a round trip; the server hears about it afterwards so the room sees you move.
    useEffect(() => {
        const id = setInterval(async () => {
            const r = await POST({ action: "vip_move", x: xRef.current, y: 72, facing });
            if (r?.ok === false) return;
            const s = await POST({ action: "vip_state" });
            if (s?.open) setSt(s);
        }, 3000);
        return () => clearInterval(id);
    }, [facing]);

    // Who is within reach. Derived, so it can never disagree with where you are standing.
    const near = useMemo(() => {
        if (Math.abs(x - BARTENDER_X) <= REACH) return "bartender";
        if (Math.abs(x - VENDOR_X) <= REACH) return "vendor";
        return null;
    }, [x]);

    // Walking away closes whoever you were talking to. DERIVED rather than an effect that clears `open` when
    // `near` changes — that version has one frame in which the two disagree.
    const talking = open && open === near ? open : null;

    const talk = useCallback(async () => {
        unlock();
        Cas.chips?.();
        Haptic.hit(0.35);
        setOpen(near);
        if (near === "bartender") {
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
                A world wider than the window. Tap the floor to walk there, drag to look around — the same
                two gestures the casino floor uses, because it is the same building. */}
            <div className="vip-roomwrap">
                <div className="vip-room" ref={roomRef}
                    onPointerDown={panDown} onPointerMove={panMove}
                    onPointerUp={panUp} onPointerCancel={panUp}>
                    <div className="vip-world" onClick={(e) => {
                        if (draggedJustNow()) return;
                        if (e.target !== e.currentTarget && !e.target.classList?.contains("vip-floor")) return;
                        const b = e.currentTarget.getBoundingClientRect();
                        walkTo(((e.clientX - b.left) / b.width) * 100);
                    }}>
                        <div className="vip-floor" aria-hidden="true" />

                        {/* The two you can talk to, standing at the bar. Buttons, because everything you can
                            interact with in this building is a button with its own hit area. */}
                        <button type="button"
                            className={`vip-npc${near === "bartender" ? " is-near" : ""}`}
                            style={{ left: `${BARTENDER_X}%` }}
                            aria-label="Rolf, the bartender"
                            onClick={() => { if (draggedJustNow()) return; walkTo(BARTENDER_X); }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/casino/vip-bartender.webp" alt="" draggable="false" />
                            <b>Rolf</b>
                        </button>
                        <button type="button"
                            className={`vip-npc${near === "vendor" ? " is-near" : ""}`}
                            style={{ left: `${VENDOR_X}%` }}
                            aria-label="Sable, the vendor"
                            onClick={() => { if (draggedJustNow()) return; walkTo(VENDOR_X); }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/casino/vip-vendor.webp" alt="" draggable="false" />
                            <b>Sable</b>
                        </button>

                        {/* Everybody else, really here. Behind you and dimmer, which is the cheapest way of
                            saying who the camera is following. */}
                        {(st?.others || []).map((o) => (
                            <div key={o.id} className="vip-other" style={{ left: `${o.x}%` }} title={o.name}>
                                {o.sprite
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={o.sprite} alt="" draggable="false" />
                                    : <span className="vip-blank" />}
                                <em>{o.name}</em>
                            </div>
                        ))}

                        <div className="vip-you" style={{ left: `${x}%`, "--face": facing }}>
                            {me?.sprite
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={me.sprite} alt="" draggable="false" />
                                : <span className="vip-blank" />}
                        </div>
                    </div>
                </div>
            </div>

            {/* What is within reach. One button, in one place, whatever you are stood at. */}
            <div className="vip-act">
                {near ? (
                    <button type="button" className="vip-talk" onClick={talk}>
                        {near === "bartender" ? "Talk to Rolf" : "See what Sable has"}
                    </button>
                ) : <span>Tap the floor to walk · the bar is to your right</span>}
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

                        {/* One live note each. A second REPLACES the first rather than being refused — being
                            told "you already have a note up" is a worse answer than simply changing it. */}
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
                The Counter's own component, handed the VIP list. Not a second shop screen: the buying, the
                affording, the inspect card and the receipt are all solved once, over there. */}
            {talking === "vendor" ? (
                <div className="vip-panel">
                    <h4>Sable opens the case</h4>
                    <p className="vip-said">Three of them. Nobody out on the floor can have these.</p>
                    <ChipStore chips={chips} onBuy={buy} onRefresh={shelf} />
                </div>
            ) : null}

            {/* ── THE VIP CHAT ────────────────────────────────────────────────────────────────────────
                The channel that already existed, shown in the room it belongs to. A NEW channel would have
                split the VIP conversation across two places and left neither worth reading. */}
            <div className="vip-chat">
                <GlobalChatTab open channel="vip" />
            </div>
        </div>
    );
}
