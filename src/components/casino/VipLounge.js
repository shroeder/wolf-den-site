"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cas } from "@/components/casino/casino-audio.js";
import { Haptic, Sfx, unlock } from "@/components/arena/arena-audio.js";
import ChipStore from "@/components/casino/ChipStore.js";

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

// ── AND THE LOUNGE MAY NOT HANG EITHER ───────────────────────────────────────────────────────────────────────
// The same bare fetch the casino floor used to use, with the same missing timeout. I wrote a whole commit
// about that on the floor — a phone that walks behind a wall mid-request leaves a promise that never settles —
// and left this file on the old pattern, which is exactly how a class of bug survives being fixed.
//
// It matters more here than it looks. Sable’s shelf blanks itself while it loads, so an unsettled request
// leaves "Opening the case..." on screen for ever, and Rolf’s state call is what fills his dialog.
const VIP_TIMEOUT_MS = 15000;
const POST = async (body) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), VIP_TIMEOUT_MS);
    try {
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify(body), signal: ctl.signal,
        });
        return await r.json();
    } catch {
        return null;
    } finally {
        clearTimeout(t);
    }
};

// Where the two you can talk to stand, across the world. The bar is at the right-hand end of the painting, so
// they stand at it and you walk the room to reach them.
//
// PUSHED APART. They were 13 apart and their sprites overlapped at that distance — Sable's shoulder sat behind
// Rolf's arm, which reads as one two-headed person rather than two people at a bar. 20 clears them both, and
// Rolf slides left rather than Sable sliding right because the bar she is standing at is at the right-hand end
// of the painting and she belongs against it.
const BARTENDER_X = 67;
const VENDOR_X = 87;
// Close enough to talk. The floor uses 5 against cabinets spaced 9; these two are 20 apart now, so 8 keeps a
// generous reach without the two ranges touching (they would need to be 10 apart to overlap).
const REACH = 8;

// ── THE SAME WALK AS THE FLOOR, WHICH IS THE WRONG WALK FOR THIS ROOM ────────────────────────────────────────
// Matching the casino floor's speed was the obvious call and it reads badly here. The floor is seven rooms
// wide and you cross it at a stroll; the lounge is ONE room, thirteen percent between the two people in it,
// and at 26%/sec crossing it takes half a second per step and feels like wading. Luke: "he moves super slow
// as well." Same number, different room, different answer.
const WALK_PER_SEC = 46;
// And a tighter tick, because the step SIZE is speed x tick — at 62ms a faster walk just means bigger jumps,
// which is a sprite teleporting rather than a person moving.
const WALK_TICK_MS = 40;

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

    // ── THE CAMERA DOES NOT FOLLOW YOU ───────────────────────────────────────────────────────────────────
    // Luke: "inside the lounge the camera still snaps to the player like every time he moves a pixel — I'd
    // rather the camera didn't do that and I can just drag it around freely."
    //
    // It used to re-centre on every change to `x`, and `x` is ticked by the walk loop on a timer — so the
    // room scrolled on every step of every walk, and any drag you made was stomped on the next tick a few
    // milliseconds later. The camera was not following you so much as competing with you for it.
    //
    // Now it points at you ONCE, when you walk in, and after that the view is yours. That is safe here in a
    // way it would not be in a scrolling platformer, because in this room you move by TAPPING THE FLOOR you
    // want to stand on — the destination is something you picked out of what is already on screen, so
    // walking cannot take you anywhere you were not already looking. The only way to lose yourself is to
    // deliberately drag the room away from you, and undoing that is a drag back.
    //
    // A ref rather than state: centring must not itself cause a render, and it has to survive every one.
    const centred = useRef(false);
    useEffect(() => {
        if (centred.current) return undefined;
        const el = roomRef.current;
        if (!el) return undefined;
        // On the first pass the room may not have been laid out yet, in which case there is nothing to
        // scroll and scrollTo would silently do nothing. Try again after a frame rather than assuming.
        const aim = () => {
            const box = roomRef.current;
            if (!box || box.scrollWidth <= box.clientWidth) return false;
            box.scrollTo({ left: (box.scrollWidth * xRef.current) / 100 - box.clientWidth / 2, behavior: "auto" });
            centred.current = true;
            return true;
        };
        if (aim()) return undefined;
        const id = requestAnimationFrame(aim);
        return () => cancelAnimationFrame(id);
    }, []);

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
    // ── ⚠️ AND IT STOPS WHEN NOBODY IS LOOKING ───────────────────────────────────────────────────────────
    // This was TWO round trips every three seconds, forever, with no visibility check — 2,400 requests an
    // hour from one person standing in the lounge, and it kept running at exactly that rate on a tab they
    // had left behind hours ago. On a plan billed by invocation that is the single most expensive line of
    // code in the app, and nothing about it was visible from anywhere.
    //
    // Seven of the app's other nine polls already gate on `visibilityState`; this one and the casino floor's
    // were the two that never did. Five seconds rather than three as well: the silhouettes behind the rope
    // are ambience, and nobody has ever noticed a person arriving two seconds late.
    // The move half only fires when there IS a move — same rule as the floor. The room read stays on the
    // timer because other people move whether or not you do, but a still player has stopped sending two
    // requests every tick to say nothing has changed.
    const sentRef = useRef(null);
    useEffect(() => {
        const id = setInterval(async () => {
            if (document.visibilityState !== "visible") return;
            const at = Math.round(xRef.current);
            const key = `${at}:${facing}`;
            if (sentRef.current !== key) {
                sentRef.current = key;
                const r = await POST({ action: "vip_move", x: xRef.current, y: 72, facing });
                if (r?.ok === false) return;
            }
            const s = await POST({ action: "vip_state" });
            if (s?.open) setSt(s);
        }, 5000);
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

    // ── ARRIVING IS THE INTERACTION ──────────────────────────────────────────────────────────────────────
    // There was a full-width yellow button under the room that said "See what Sable has", and it was the only
    // way to open either of them. Luke: "should be push to interact, no yellow button to interact with the
    // npcs." He is right, and the button was worse than redundant — you had already tapped Sable to walk to
    // her, so the game made you tap the same intention twice, the second time somewhere else on the screen.
    //
    // Reaching somebody opens them. The guard is that it fires on ARRIVAL and not while you stand there:
    // without it, closing the modal while still in reach would reopen it on the next render and the X would
    // do nothing. `left` remembers who you have already been handed, and only clears once you walk off.
    const left = useRef(null);
    useEffect(() => {
        if (!near) { left.current = null; return; }
        if (left.current === near) return;
        left.current = near;
        talk();
        // talk is stable per `near`, and re-running this on a new identity of it would reopen the modal.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [near]);

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

    // ── TALKING TO SOMEBODY IS A MODAL, NOT MORE PAGE ────────────────────────────────────────────────────
    // Luke, of Rolf: "this is a scrolling nightmare. just make it show his face zoomed up in a modal with his
    // dialog" — and then of the vendor: "same with Sable, have it be a modal."
    //
    // Both panels used to be appended UNDER the room, so talking to somebody put what they said below the
    // fold: you tapped a button, nothing appeared to happen, and the answer was a scroll away past a lounge,
    // a button and a chat window. Sable was worse, because the thing she opens is a whole shop.
    //
    // A modal is the honest shape for it. A conversation is exclusive — you are talking to one of them, the
    // room is not going anywhere — and it costs no layout: the page does not grow, so nothing below moves and
    // there is nothing to scroll past to get back.
    const closeTalk = useCallback(() => { setOpen(null); }, []);
    useEffect(() => {
        if (!talking) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [talking]);

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
                            className={`vip-npc is-rolf${near === "bartender" ? " is-near" : ""}`}
                            style={{ left: `${BARTENDER_X}%` }}
                            aria-label="Rolf, the bartender"
                            onClick={() => { if (draggedJustNow()) return; walkTo(BARTENDER_X); }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/casino/vip-bartender.webp" alt="" draggable="false" />
                            <b>Rolf</b>
                        </button>
                        <button type="button"
                            className={`vip-npc is-sable${near === "vendor" ? " is-near" : ""}`}
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

                        {/* ── AND HE ACTUALLY WALKS ────────────────────────────────────────────────
                            The stride animation existed and was hung on .cas-you.is-walking, which is the
                            CASINO FLOOR's hero. This room has its own element and never carried the class,
                            so the sprite slid across the rug perfectly level the whole time — a hero on a
                            conveyor belt, which is the exact thing the animation was written to stop.
                            Luke: "no walking animation on the hero in the vip." */}
                        <div className={`vip-you${goal != null ? " is-walking" : ""}`} style={{ left: `${x}%`, "--face": facing }}>
                            {me?.sprite
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={me.sprite} alt="" draggable="false" />
                                : <span className="vip-blank" />}
                        </div>
                    </div>
                </div>
            </div>

            {/* Where the button was. It is a caption now: walking up to somebody is what opens them, so a
                control here would be a second way to do a thing you have already done. It still says who you
                are stood with, because a modal you can dismiss needs something to tell you it is reachable
                again without making you walk away and back. */}
            <div className="vip-act">
                <span>{near === "bartender" ? "Rolf is pouring · step away to leave the bar"
                    : near === "vendor" ? "Sable has the case open · step away to close it"
                        : "Tap the floor to walk · the bar is to your right"}</span>
            </div>

            {/* ── THE BARTENDER ───────────────────────────────────────────────────────────────────────
                One true thing about how the game works, and the noticeboard he is holding for the room.

                THE FACE IS THE HEADER. The same full-body sprite that stands at the bar, scaled up and
                cropped to the head by `--fz`/`--fy` — see .vip-face. Two numbers per character rather than a
                second set of portrait art: it is the same drawing, so a re-roll of the sprite carries. */}
            {talking === "bartender" ? (
                <div className="vip-scrim" role="dialog" aria-modal="true" aria-label="Rolf, the bartender"
                    onClick={closeTalk}>
                  <div className="vip-modal" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="vip-x" onClick={closeTalk} aria-label="Close">✕</button>
                    <div className="vip-face" style={{ "--fz": "360%", "--fy": "3%" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/images/casino/vip-bartender.webp" alt="" draggable="false" />
                    </div>
                    <div className="vip-modal-body">
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
                  </div>
                </div>
            ) : null}

            {/* ── THE VENDOR ──────────────────────────────────────────────────────────────────────────
                The Counter's own component, handed the VIP list. Not a second shop screen: the buying, the
                affording, the inspect card and the receipt are all solved once, over there. */}
            {talking === "vendor" ? (
                <div className="vip-scrim" role="dialog" aria-modal="true" aria-label="Sable, the vendor"
                    onClick={closeTalk}>
                  <div className="vip-modal is-shop" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="vip-x" onClick={closeTalk} aria-label="Close">✕</button>
                    <div className="vip-face" style={{ "--fz": "255%", "--fy": "-4%" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/images/casino/vip-vendor.webp" alt="" draggable="false" />
                    </div>
                    <div className="vip-modal-body">
                        <h4>Sable opens the case</h4>
                        <p className="vip-said">Three of them. Nobody out on the floor can have these.</p>
                        <ChipStore chips={chips} onBuy={buy} onRefresh={shelf} single />
                    </div>
                  </div>
                </div>
            ) : null}

            {/* ── AND THE CHAT IS NOT DOWN HERE ───────────────────────────────────────────────────────
                Luke: "remove the chat at the bottom, fix it so the camera doesnt snap to in here."

                Those are one bug, not two. The VIP channel was embedded under the room, and a chat feed
                scrolls itself to its newest message — which, for a feed that is not itself a scroll box,
                means scrollIntoView walking up to the PAGE and dragging the whole lounge down to the bottom
                every twelve seconds. You could not stand still in the room while it was on screen.

                Nothing is lost: it is the same VIP room in the Social hub, which is where members already
                read it, and a channel shown in two places was always going to be read in one of them. The
                scrollIntoView that did the dragging is fixed at its source too — see scrollToEndIfPinned. */}
        </div>
    );
}
