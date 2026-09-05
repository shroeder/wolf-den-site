"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Cinzel } from "next/font/google";
import { GiFlame } from "react-icons/gi";

import CardFace, { CARD_FONT, Sprite } from "@/components/cards/CardFace";
import { POTIONS, canUpgrade, cardById } from "@/lib/marketplace/cards-kit.js";

// ── THE CAMPFIRE AND THE CHEST ───────────────────────────────────────────────────────────────────────────
// The two rooms on the map that were never rooms.
//
// Both of them resolved on ENTRY, in the run route: a rest healed 30% and cleared `at`, a chest paid its
// embers and cleared `at`, and either way the next thing you saw was the sheet you had just left with a
// number quietly different on the top bar. Luke, walking into a question mark that had turned into a chest:
// "I clicked the question mark encounter and it did nothing." It had paid him forty embers and a potion.
//
// ⚠️ THIS IS THE MERCHANT'S LESSON, TWICE MORE. That screen was a list about things until it became a stall
// with things in it; the map was glyphs until the marks were drawn. Two of the five rooms in this game were
// worse than either — they were not screens at all — and a fifth of the sheet is question marks that land on
// them. It is most of why an act reads as fights with gaps in it, and it is why the campfires felt missing at
// the exact Spire weight they are already generated at: you never SAW one.
//
// So: one screen, two rooms. The alcove behind them is the merchant's own (shop-room.png) because it was
// drawn as an empty lantern-lit room with nothing in the foreground, which is precisely what a fire or a
// chest wants to stand in. The object is the whole screen, the way the brazier is the whole of the purge.
const panelFont = Cinzel({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });

// What each room IS. Kept as data rather than as two components: they are the same screen — a backdrop, one
// object, one thing you may do to it and a way out — and the differences are a picture and three sentences.
const ROOM = {
    rest: {
        who: "The Campfire",
        art: "/images/cards/chrome/room-fire.png",
        say: "Sit a while, or put a card in the coals. Not both.",
        done: "Warmer. The dark can wait a minute longer.",
        // A fire that says the same thing whichever choice you made is a fire that did not notice.
        doneSmith: "Beaten thin and folded back. It'll bite harder now.",
        verb: "Sit and rest",
    },
    treasure: {
        who: "The Chest",
        art: "/images/cards/chrome/room-chest.png",
        artDone: "/images/cards/chrome/room-chest-open.png",
        say: "Somebody dragged this down here and never came back for it.",
        done: "Take it. They're past minding.",
        verb: "Open it",
    },
};

export default function CardRoom({ run, art = {} }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [said, setSaid] = useState(null);
    // The fire asks a question now (see the note by the buttons) and the answer is a card, so the
    // picker is the same shape the brazier in the shop already uses.
    const [picking, setPicking] = useState(false);

    const at = run.at || {};
    const room = ROOM[at.kind] || ROOM.rest;
    const isFire = at.kind === "rest";
    const done = isFire ? Boolean(at.rested) : Boolean(at.opened);

    const heal = Math.ceil((run.hpMax || 1) * 0.3);
    const whole = run.hp >= run.hpMax;
    const deck = run.deck || [];
    const sharpenable = deck.filter((id) => canUpgrade(id));
    const loot = at.opened || null;
    const gotPotion = loot?.potion ? POTIONS[loot.potion] : null;

    const post = useCallback(async (action, extra = {}) => {
        if (busy) return;
        setBusy(true);
        setSaid(null);
        const r = await fetch("/api/marketplace/cards/run", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }),
        }).then((x) => x.json()).catch(() => null);
        setBusy(false);
        // ⚠️ "YOU ALREADY DID THAT" IS NOT AN ERROR TO SHOW. The button disappears once the room is resolved,
        // but it is only resolved on the SERVER until `refresh` brings the new state back — and a second tap
        // inside that gap reaches a handler that has already paid out and correctly refuses. Reporting that
        // refusal put "Nothing happens." on a screen that had just healed 21, which reads as the bug the
        // player came from: a room that says nothing while quietly doing something.
        if (r?.error && r.error !== "already_rested" && r.error !== "already_open") {
            setSaid("It doesn't budge.");
            return;
        }
        setPicking(false);
        router.refresh();
    }, [busy, router]);

    return (
        <div className={`cr ${panelFont.className}`} style={{ "--cf-card-font": CARD_FONT.style.fontFamily }}>
            <div className="cr-room" aria-hidden="true" />

            {/* THE SAME BAR THE MAP AND THE SHOP WEAR. Health, embers and what is on your belt do not change
                meaning because of which room you walked into, so they do not change shape either. */}
            <div className="cr-bar">
                <span className="cr-who">{room.who}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="cr-ui" src="/images/cards/chrome/ui-heart.png" alt="" />
                <b className="cr-hp">{run.hp}/{run.hpMax}</b>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="cr-ui" src="/images/cards/chrome/ui-ember.png" alt="" />
                <b className="cr-em">{(run.embers || 0).toLocaleString()}</b>
                {(run.potions || []).map((id, i) => POTIONS[id] ? (
                    <span key={`${id}${i}`} title={`${POTIONS[id].name} — ${POTIONS[id].text}`}>
                        <Sprite className="cr-ui" src={`/images/cards/potions/${id}.png`} />
                    </span>
                ) : null)}
            </div>

            {/* ── THE OBJECT ── the whole screen, lit by itself. A chest that has been opened is a DIFFERENT
                drawing, not the same one with a filter on it: the lid is up and the light is coming out of
                it, which is the only way a still picture says the thing happened. */}
            <div className="cr-stage">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    className={`cr-art${isFire ? " is-fire" : ""}${done ? " is-done" : ""}`}
                    src={done && room.artDone ? room.artDone : room.art}
                    alt=""
                />
                <p className={`cr-say${done ? " is-done" : ""}`} role="status">
                    {said || (done ? ((isFire && at.smithed && room.doneSmith) || room.done) : room.say)}
                </p>

                {/* ── WHAT IT GAVE YOU ── written out, in the room, before you leave it. The whole complaint
                    was a payout you could not see; a number that changes on a bar you are not looking at is
                    not a reward, it is an accounting entry. */}
                {done ? (
                    <div className="cr-got">
                        {/* ── WHAT CAME OUT OF THE COALS ─────────────────────────────────────────────
                            A sentence saying "Bite came out sharper" is the payout-you-cannot-see fault
                            this whole screen was built to fix, one size smaller: the thing that changed is
                            a CARD, and Spire shows you the upgraded card. So does this — the same face, with
                            its title green and its improved numbers lit, which is the only way "sharper"
                            means anything specific. */}
                        {isFire && at.smithedId && cardById(at.smithedId) ? (
                            <span className="cr-smithed">
                                <span className="cf-card">
                                    <CardFace card={cardById(at.smithedId)} art={art[cardById(at.smithedId).pet]} />
                                </span>
                                <b>Sharper.</b>
                            </span>
                        ) : isFire && at.smithed ? (
                            <span className="cr-gain">{at.smithed} came out sharper.</span>
                        ) : isFire ? (
                            <span className="cr-gain">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/images/cards/chrome/ui-heart.png" alt="" />
                                +{at.healed ?? heal} health
                            </span>
                        ) : (
                            <>
                                {loot?.embers ? (
                                    <span className="cr-gain"><GiFlame aria-hidden="true" />+{loot.embers} embers</span>
                                ) : null}
                                {gotPotion ? (
                                    <span className="cr-gain">
                                        <Sprite src={`/images/cards/potions/${gotPotion.id}.png`} />
                                        {gotPotion.name}
                                    </span>
                                ) : null}
                                {/* A FULL BELT IS SAID OUT LOUD. It used to drop the potion on the floor in
                                    silence, which is the same class of bug as the payout nobody saw. */}
                                {loot?.spilled ? <span className="cr-gain is-lost">A potion — and no room on your belt for it.</span> : null}
                            </>
                        )}
                    </div>
                ) : null}

                {/* ── ONE OR THE OTHER ──────────────────────────────────────────
                    Their campfire is Rest or Smith and you may only do one, which is the whole reason a fire is
                    a decision rather than a free stop: the health you need now against a deck that is
                    permanently better. Ours only ever healed, and the sim is blunt about what that cost — a
                    deck that GROWS and never improves was putting out 13 damage a turn at row 8 against 10.7
                    at row 1, which is why the act was unfinishable at any monster size. */}
                {!done ? (
                    <div className="cr-choices">
                        <button
                            type="button"
                            className="cr-do"
                            disabled={busy || (isFire && whole)}
                            onClick={() => post(isFire ? "rest" : "open")}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="cr-plate" src="/images/cards/chrome/button-plate.png" alt="" />
                            <span className="cr-do-label">
                                {busy ? "…" : isFire ? (whole ? "Nothing to mend" : `${room.verb} — heal ${heal}`) : room.verb}
                            </span>
                        </button>
                        {isFire ? (
                            <button
                                type="button"
                                className="cr-do"
                                disabled={busy || !sharpenable.length}
                                onClick={() => { setSaid(null); setPicking((v) => !v); }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img className="cr-plate" src="/images/cards/chrome/button-plate.png" alt="" />
                                <span className="cr-do-label">
                                    {picking ? "Never mind" : sharpenable.length ? "Sharpen a card" : "Nothing left to sharpen"}
                                </span>
                            </button>
                        ) : null}
                    </div>
                ) : null}

                {/* ── THE DECK, OVER THE ROOM ────────────────────────────────────────────────────────
                    Real cards, for the same reason the burn picker draws them: choosing which copy of Bite
                    becomes the good one off a list of names is choosing blind.

                    ⚠️ A MODAL, NOT A PANEL IN THE FLOW. Luke, on a phone with the picker open: "this should
                    be a modal on top." It was appended to the stage, so opening it pushed the fire off the
                    top of the screen and put a twelve-card grid under the buttons — you scrolled a room to
                    read your own deck, and the bottom row was cut by the fold. Every other "choose one of
                    these" in this game is over the room: the shop's look, the map's deck, the fight's piles.
                    Tapping the scrim closes it, which is the gesture all of those already answer to. */}
                {picking && !done ? (
                    <div className="cr-pick-over" onClick={() => setPicking(false)} role="presentation">
                    <div className="cr-pick" role="dialog" aria-label="Choose a card to sharpen"
                        onClick={(e) => e.stopPropagation()}>
                        {/* ⚠️ THE WAY OUT STAYS ON SCREEN. A twelve-card deck fills the panel and the panel
                            scrolls, so a close button at the BOTTOM is a button you have to go looking for —
                            the scrim closes it too, but a scrim is not a thing anybody is told about. */}
                        <div className="cr-pick-bar">
                            <p className="cr-pick-head">Hold one in the fire.</p>
                            <button type="button" className="cr-pick-close" onClick={() => setPicking(false)}>
                                Never mind
                            </button>
                        </div>
                        <div className="cr-pick-deck">
                            {deck.map((id, i) => {
                                const c = cardById(id);
                                if (!c) return null;
                                const can = canUpgrade(id);
                                return (
                                    <button key={`${id}-${i}`} type="button"
                                        className={`cr-card${can ? "" : " is-done"}`} disabled={busy || !can}
                                        aria-label={can ? `Sharpen ${c.name}` : `${c.name}, already sharpened`}
                                        onClick={() => post("smith", { index: i })}>
                                        <span className="cf-card"><CardFace card={c} art={art[c.pet]} /></span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    </div>
                ) : null}
            </div>

            {/* The map's ribbon, so leaving looks the same wherever you are leaving from. */}
            <div className="cr-foot">
                <button type="button" className="cr-leave" disabled={busy} onClick={() => post("leave")}>
                    Move on
                </button>
            </div>

            {/* Global for the same reason the shop's is: every selector is under `.cr`, which is this screen
                and nothing else on the site. */}
            <style jsx global>{`
                .cr { position: fixed; inset: 0; z-index: 4000; overflow-y: auto; overscroll-behavior: contain;
                    display: flex; flex-direction: column; align-items: center;
                    padding: 0 10px 18px; background: #0a0b0f; color: #efe3cd; }
                /* ⚠️ THE SAME LANTERN THE MERCHANT WAS STANDING IN. This is the shop's alcove and it has one
                   hanging lamp at dead centre; on a phone a cover-sized background shows the art's whole
                   height and only its middle third, so the lamp sits directly behind whatever object this
                   room is — a faint golden box hanging in the campfire's smoke. The crop moves to the plain
                   stonework at the left of the painting, exactly as the shop's does, and comes back to centre
                   on a wide screen where there is room for both. */
                .cr-room { position: fixed; inset: 0; z-index: -1;
                    background: #0a0b0f url(/images/cards/chrome/shop-room.png) left center/cover no-repeat; }
                .cr-room::after { content: ""; position: absolute; inset: 0;
                    background: radial-gradient(ellipse at 50% 46%, rgba(10,11,15,0.05), rgba(6,7,10,0.9) 76%); }

                .cr-bar { position: sticky; top: 0; z-index: 6; align-self: stretch;
                    display: flex; align-items: center; gap: 7px; padding: 7px 12px; margin: 0 -10px;
                    background: #3d4550; border-bottom: 1px solid rgba(0,0,0,0.35); }
                .cr-who { font-size: 13px; letter-spacing: 0.06em; opacity: 0.85; margin-right: auto; }
                .cr-ui { width: 20px; height: 20px; object-fit: contain; }
                .cr-hp { font-size: 13px; color: #ff8f7a; font-variant-numeric: tabular-nums; }
                .cr-em { font-size: 13px; color: #ffb45e; font-variant-numeric: tabular-nums; }

                .cr-stage { flex: 1; width: min(680px, 100%); display: flex; flex-direction: column;
                    align-items: center; justify-content: center; gap: 10px; padding: 10px 0 4px; }
                /* IT THROWS ITS OWN LIGHT. A fire drawn on a dark wall with no glow under it is a sticker;
                   the drop-shadow in its own colour is what puts it in the room. */
                .cr-art { width: min(300px, 74vw); height: auto; object-fit: contain;
                    filter: drop-shadow(0 10px 18px rgba(0,0,0,0.8)); }
                .cr-art.is-fire { filter: drop-shadow(0 0 34px rgba(255,140,40,0.45))
                    drop-shadow(0 10px 18px rgba(0,0,0,0.8)); animation: cr-flicker 2.6s ease-in-out infinite; }
                .cr-art.is-done { filter: drop-shadow(0 0 40px rgba(255,190,90,0.5))
                    drop-shadow(0 10px 18px rgba(0,0,0,0.8)); }
                /* The fire is never still. Deliberately ignores prefers-reduced-motion, like the rest of the
                   game's ambient art — a campfire that does not move is a photograph of one. */
                @keyframes cr-flicker {
                    0%, 100% { filter: drop-shadow(0 0 30px rgba(255,140,40,0.38)) drop-shadow(0 10px 18px rgba(0,0,0,0.8)); }
                    45% { filter: drop-shadow(0 0 44px rgba(255,160,50,0.55)) drop-shadow(0 10px 18px rgba(0,0,0,0.8)); }
                }

                .cr-say { margin: 0; max-width: 320px; text-align: center; font-size: 13px; line-height: 1.4;
                    color: #c3b49c; font-style: italic; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
                .cr-say.is-done { color: #ffcf9a; font-style: normal; }

                .cr-got { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 16px; margin-top: 2px; }
                .cr-gain { display: inline-flex; align-items: center; gap: 5px;
                    font-family: var(--cf-card-font); font-size: 15px; font-weight: 700; color: #ffd9a6;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
                .cr-gain img { width: 22px; height: 22px; object-fit: contain; }
                .cr-gain.is-lost { font-size: 12.5px; font-weight: 400; color: #a8977f; }
                .cr-smithed { display: flex; flex-direction: column; align-items: center; gap: 4px;
                    animation: cr-sharp 0.5s cubic-bezier(.2,1.3,.35,1) both; }
                .cr-smithed b { font-family: var(--cf-card-font); font-size: 14px; color: #9be08a;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
                /* It arrives out of the fire rather than appearing: a card that pops into place reads as the
                   thing that just happened, which is the whole point of showing it. */
                @keyframes cr-sharp {
                    0% { opacity: 0; transform: translateY(14px) scale(0.86); }
                    100% { opacity: 1; transform: none; }
                }

                .cr-do { position: relative; width: 210px; height: 50px; margin-top: 6px; padding: 0; border: 0;
                    background: none; cursor: pointer; display: grid; place-items: center; }
                .cr-plate { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill;
                    filter: drop-shadow(0 3px 6px rgba(0,0,0,0.7)); }
                .cr-do-label { position: relative; font-family: var(--cf-card-font); font-size: 15px;
                    font-weight: 700; letter-spacing: 0.02em; color: #ffe6d2;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
                .cr-do:disabled { cursor: default; }
                .cr-do:disabled .cr-plate { filter: grayscale(0.7) brightness(0.62); }
                .cr-do:disabled .cr-do-label { color: #b0806f; }

                .cr-choices { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
                /* ── WHICH CARD GOES IN THE COALS ── */
                .cr-pick-over { position: fixed; inset: 0; z-index: 4100; display: grid; place-items: center;
                    padding: 14px; background: rgba(4,5,8,0.88); }
                .cr-pick { width: min(560px, 100%); max-height: 84dvh; overflow-y: auto; padding: 14px;
                    display: grid; gap: 10px; justify-items: center; border-radius: 12px;
                    background: rgba(12,15,21,0.97); border: 1px solid rgba(201,162,83,0.35);
                    box-shadow: 0 18px 50px rgba(0,0,0,0.7); }
                .cr-pick-bar { position: sticky; top: -14px; z-index: 2; align-self: stretch;
                    display: flex; align-items: center; justify-content: space-between; gap: 10px;
                    margin: -14px -14px 0; padding: 12px 14px;
                    background: rgba(12,15,21,0.98); border-bottom: 1px solid rgba(201,162,83,0.22); }
                .cr-pick-close { padding: 6px 14px; border-radius: 999px; cursor: pointer;
                    border: 2px solid #c9a253; background: rgba(18,22,30,0.92); color: #f2e2bd;
                    font: inherit; font-size: 12.5px; font-weight: 700; white-space: nowrap; }
                .cr-pick-head { margin: 0; text-align: left; font-size: 14px; color: #ffcf9a; }
                /* The panel scrolls, not the grid inside it — a scroller inside a scroller on a phone is
                   two things that both eat the same drag. */
                .cr-pick-deck { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
                .cr-card { padding: 0; border: 0; background: none; cursor: pointer; }
                .cr-card:disabled { cursor: default; }
                /* A copy that has already been to the fire is still SHOWN — a deck with its upgrades hidden is
                   a deck you cannot plan with — it simply cannot be chosen again. */
                .cr-card.is-done { opacity: 0.45; filter: grayscale(0.55); }
                .cr .cf-card { position: relative; width: 96px; height: 138px; padding: 0 0 8px;
                    display: flex; flex-direction: column; align-items: center;
                    background: none; border: 0; border-radius: 9px;
                    filter: drop-shadow(0 4px 7px rgba(0,0,0,0.6)); }
                .cr .cf-card::after { content: ""; position: absolute; inset: -1px; z-index: 2;
                    pointer-events: none; background-image: url(/images/cards/chrome/frame.png);
                    background-repeat: no-repeat; background-size: 100% 100%; }

                .cr-foot { width: min(680px, 100%); display: flex; padding-bottom: 4px; }
                .cr-leave { width: 132px; height: 46px; padding: 0 0 3px 8px; border: 0;
                    background: transparent url(/images/cards/chrome/return-ribbon.png) center/100% 100% no-repeat;
                    color: #ffe6d2; font: inherit; font-size: 14px; letter-spacing: 0.04em; cursor: pointer;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.8); filter: drop-shadow(0 3px 5px rgba(0,0,0,0.6)); }
                .cr-leave:disabled { opacity: 0.5; cursor: default; }

                @media (min-width: 760px) {
                    .cr-room { background-position: center; }
                    .cr-art { width: min(360px, 40vw); }
                    .cr-say { font-size: 14px; max-width: 420px; }
                }
                /* ⚠️ BOTH ANSWERS HAVE TO BE ON THE SCREEN. A phone leaves 441px once the browser's chrome is
                   off it, and a 300px fire plus a line of flavour pushed "Sharpen a card" under the fold — so
                   the half of the campfire that is new was invisible unless you thought to scroll. Exactly the
                   trap the shop's Move on ribbon sprang. The fire is the room, not the decision. */
                @media (max-height: 560px) {
                    .cr-art { width: min(190px, 46vw); }
                    .cr-say { font-size: 12px; }
                    .cr-stage { gap: 6px; padding-top: 4px; }
                    .cr-do { height: 44px; width: 190px; }
                    .cr-do-label { font-size: 13.5px; }
                }
            `}</style>
        </div>
    );
}
