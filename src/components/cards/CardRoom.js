"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cinzel } from "next/font/google";
import { GiFlame } from "react-icons/gi";

import CardFace, { CARD_FONT, Sprite } from "@/components/cards/CardFace";
import CardFoot from "@/components/cards/CardFoot";
import CardForge, { FORGE_MS } from "@/components/cards/CardForge";
import useCardSound from "@/components/cards/useCardSound";
import { sfx } from "@/lib/marketplace/cards-sound.js";
import { KEYS, KEY_WHY, PERKS, POTIONS, canUpgrade, cardById, keyProgress, upgradedId } from "@/lib/marketplace/cards-kit.js";
import { DECK_GRID_CSS } from "@/components/cards/deck-grid.js";

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
    // ── THE CARD THAT IS IN THE FIRE RIGHT NOW ───────────────────────────────────────────────────────
    // `from` is the card you chose and `to` is what it becomes; `turned` flips at the flash, which is the
    // frame the face swaps on. Held on the client because the SERVER only ever reports the finished card —
    // and the whole point of this screen is the half-second where it is neither.
    const [forge, setForge] = useState(null);
    // ── WHAT THE FIRE WOULD DO, BEFORE IT DOES IT ────────────────────────────────────────────────────
    // The picker used to commit on the tap: one press on a 96px card and a permanent, once-a-fire decision
    // was spent, with nothing on screen saying what the card would become. Holds { id, index } while the
    // player is looking at the answer.
    const [preview, setPreview] = useState(null);
    const timers = useRef([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const at = run.at || {};
    const room = ROOM[at.kind] || ROOM.rest;
    const isFire = at.kind === "rest";
    const done = isFire ? Boolean(at.rested) : Boolean(at.opened);
    // ── THE KEY THIS ROOM COULD GIVE UP ──────────────────────────────────────────────────────────────
    // KEYS is the authority on which room pays which key, so the room does not carry a second copy of that
    // fact — and a key already held stops being offered rather than being offered and refused by the server.
    const keyHere = Object.values(KEYS).find((k) => k.from === at.kind && !run.keys?.[k.id]) || null;

    const heal = Math.ceil((run.hpMax || 1) * 0.3);
    const whole = run.hp >= run.hpMax;
    const deck = run.deck || [];
    // A fire hums; a chest room borrows the map's air.
    useCardSound(isFire ? "campfire" : "map");
    const sharpenable = deck.filter((id) => canUpgrade(id));
    const loot = at.opened || null;
    const gotPotion = loot?.potion ? POTIONS[loot.potion] : null;
    // The chest is a TRINKET room now (see grantForRoom), so the trinket is the thing on the screen and the
    // embers are the change. A payout the player cannot see is the oldest bug this game has.
    const gotPerk = loot?.perk ? PERKS[loot.perk] : null;

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

    // ── HOLDING IT IN THE COALS ──────────────────────────────────────────────────────────────────────
    // Theirs flies the chosen card to the middle of the screen, blows a white-gold flash through it and lets
    // you WATCH it become the upgraded card — the "+" arrives, the numbers go green — and it is a ceremony
    // on purpose, because a smith is the thing you gave up a heal for. Ours tapped a card, closed a modal
    // with no feedback at all, and then showed a DIFFERENT, already-upgraded card at 130px near the floor.
    // The information was right and the moment was missing, and worse: nothing tied the card you picked to
    // the card you got.
    //
    // The request goes out at the same instant the card starts moving, so the fire is not waiting on the
    // network — by the time the animation lands the server has long since answered.
    const forgeCard = useCallback(async (id, index) => {
        if (busy || forge) return;
        setBusy(true);
        setSaid(null);
        setPicking(false);
        setForge(id);
        const sent = fetch("/api/marketplace/cards/run", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "smith", index }),
        }).catch(() => null);
        await Promise.all([sent, new Promise((r) => { timers.current.push(setTimeout(r, FORGE_MS)); })]);
        setBusy(false);
        setForge(null);
        router.refresh();
    }, [busy, forge, router]);

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
                                {gotPerk ? (
                                    <span className="cr-gain is-perk">
                                        <Sprite src={`/images/cards/items/${gotPerk.id}.png`} />
                                        <b>{gotPerk.name}</b>
                                        <i>{gotPerk.text}</i>
                                    </span>
                                ) : null}
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
                            onClick={() => { sfx(isFire ? "rest" : "chest"); post(isFire ? "rest" : "open"); }}
                        >
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
                                <span className="cr-do-label">
                                    {picking ? "Never mind" : sharpenable.length ? "Sharpen a card" : "Nothing left to sharpen"}
                                </span>
                            </button>
                        ) : null}
                        {/* ── AND THE THIRD OPTION, WHICH IS TO TAKE NOTHING ─────────────────────
                            The key sits beside the reward rather than on a screen of its own, because the
                            cost IS the reward you can see next to it: this button is only ever worth
                            pressing while the one to its left is obviously better. It shows only when the
                            room can actually give a key and the run has not already got that one. */}
                        {keyHere ? (
                            <button
                                type="button"
                                className="cr-do is-key"
                                disabled={busy}
                                onClick={() => { sfx("key"); post("takekey", { key: keyHere.id }); }}
                            >
                                <span className="cr-do-label">
                                    {busy ? "…" : `Take ${keyHere.name} instead`}
                                </span>
                                <span className="cr-do-sub">{keyHere.says}</span>
                                {/* The price was the only thing this button ever said. See KEY_WHY. */}
                                <span className="cr-do-why">{KEY_WHY} {keyProgress(run)}</span>
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
                        <div className="cr-pick-deck cf-deck-grid">
                            {deck.map((id, i) => {
                                const c = cardById(id);
                                if (!c) return null;
                                const can = canUpgrade(id);
                                return (
                                    <button key={`${id}-${i}`} type="button"
                                        className={`cr-card${can ? "" : " is-done"}`} disabled={busy || !can}
                                        aria-label={can ? `Sharpen ${c.name}` : `${c.name}, already sharpened`}
                                        onClick={() => setPreview({ id, index: i })}>
                                        <span className="cf-card"><CardFace card={c} art={art[c.pet]} /></span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    </div>
                ) : null}
            </div>

            {/* ── THE ANSWER, BEFORE THE DECISION ─────────────────────────────────────────────────────────
                A fire sharpens ONE card and you get one fire, so this is among the most permanent choices
                the run offers — and it was made by tapping a small picture of a card whose upgraded numbers
                appear nowhere on this screen. Both faces, side by side, the same components the rest of the
                game draws cards with: what you have, and what it becomes. The upgraded one prints its
                improved numbers in green on its own (see upgradedFields), so the difference reads without
                anything here having to explain it. */}
            {preview ? (
                <div className="cr-prev-over" role="presentation"
                    onClick={() => setPreview(null)}>
                    <div className="cr-prev" role="dialog" aria-modal="true"
                        aria-label={`Sharpen ${cardById(preview.id)?.name || "this card"}?`}
                        onClick={(e) => e.stopPropagation()}>
                        <p className="cr-prev-head">Into the coals?</p>
                        <div className="cr-prev-pair">
                            <span className="cr-prev-one">
                                <span className="cf-card"><CardFace card={cardById(preview.id)} art={art[cardById(preview.id)?.pet]} /></span>
                                <i className="cr-prev-tag">now</i>
                            </span>
                            <span className="cr-prev-arrow" aria-hidden="true">→</span>
                            <span className="cr-prev-one">
                                <span className="cf-card"><CardFace card={cardById(upgradedId(preview.id))} art={art[cardById(preview.id)?.pet]} /></span>
                                <i className="cr-prev-tag">after</i>
                            </span>
                        </div>
                        <div className="cr-prev-do">
                            <button type="button" className="cr-do" disabled={busy}
                                onClick={() => { const p = preview; setPreview(null); forgeCard(p.id, p.index); }}>
                                <span className="cr-do-label">Sharpen it</span>
                            </button>
                            <button type="button" className="cr-prev-back" onClick={() => setPreview(null)}>
                                Choose another
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {forge ? <CardForge card={forge} art={art} /> : null}

            {/* The map's ribbon, so leaving looks the same wherever you are leaving from. */}
            <CardFoot label="Move on" busy={busy} onClick={() => post("leave")} />

            {/* Global for the same reason the shop's is: every selector is under `.cr`, which is this screen
                and nothing else on the site. */}
            <style jsx global>{`
                ${DECK_GRID_CSS}
                .cr { position: fixed; inset: 0; z-index: 4000; overflow-y: auto; overscroll-behavior: contain;
                    display: flex; flex-direction: column; align-items: center;
                    padding: 0 10px 76px; background: #0a0b0f; color: #efe3cd; }
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
                /* ── THE TRINKET IS THE CHEST NOW ────────────────────────────────────────────────────
                   A row rather than a pill, because a trinket has a name AND a rule and the rule is the
                   half that decides whether the room mattered. The embers underneath are the change. */
                .cr-gain.is-perk { display: flex; flex-direction: column; align-items: center; gap: 2px;
                    max-width: 260px; }
                .cr-gain.is-perk img { width: 44px; height: 44px; }
                .cr-gain.is-perk b { font-size: 15.5px; color: #ffe6b8; }
                .cr-gain.is-perk i { font-style: normal; font-size: 12.5px; font-weight: 400;
                    line-height: 1.35; text-align: center; color: #cdbfa6; }
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

                /* ── THE SAME DOOR THE WRITTEN ROOMS USE ──────────────────────────────────────────────
                   These were the same stretched grey bitmap the event choices were, and they are two taps
                   apart in a run — a campfire and then a question mark — so they have to be the same object.
                   See the long note in CardEvent for why the drawn plate went: it was the one cold thing on
                   a warm screen and a painted bevel does not survive being squashed to an arbitrary box.
                   Centred here rather than left-aligned, because a room offers two short verbs rather than a
                   label over a consequence. */
                .cr-do { position: relative; min-width: 210px; margin-top: 6px; cursor: pointer;
                    padding: 13px 22px; border-radius: 10px; text-align: center;
                    border: 1px solid rgba(201,162,83,0.30);
                    background: linear-gradient(180deg, rgba(38,30,22,0.96), rgba(24,19,15,0.96));
                    box-shadow: inset 0 1px 0 rgba(255,232,190,0.07), 0 2px 6px rgba(0,0,0,0.55);
                    transition: border-color 120ms ease-out, background 120ms ease-out; }
                .cr-do:hover:not(:disabled), .cr-do:focus-visible:not(:disabled) {
                    border-color: rgba(255,196,110,0.6);
                    background: linear-gradient(180deg, rgba(50,39,27,0.97), rgba(31,24,18,0.97)); }
                .cr-do:not(:disabled):active { transform: translateY(1px); }
                /* The key is a REFUSAL, so it is drawn quieter than the thing it refuses — outlined and
                   green rather than filled, the same green Dexterity uses for "a stat you chose to take". */
                .cr-do.is-key { background: transparent; border-color: #2c6e4a; }
                .cr-do.is-key .cr-do-label { color: #7fe0a8; }
                .cr-do-sub {
                    display: block; margin-top: 4px; font-size: 12px; line-height: 1.35;
                    color: #8a8f98; font-weight: 400;
                }
                /* The purpose, under the price. Quieter than the cost line above it and warmer than
                   the body text, because it is the only part of this button that is good news. */
                .cr-do-why { display: block; margin-top: 5px; font-size: 11px; line-height: 1.4;
                    color: #9be08a; opacity: 0.92; }
                .cr-do-label { position: relative; font-family: var(--cf-card-font); font-size: 15px;
                    font-weight: 700; letter-spacing: 0.02em; color: #ffe6d2; }
                .cr-do:disabled { cursor: default; opacity: 0.5; }
                .cr-do:disabled .cr-do-label { color: #c0a992; }

                .cr-choices { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
                /* ── WHICH CARD GOES IN THE COALS ── */
                /* The preview sits OVER the picker, so it is a step above it — same scrim treatment, one
                   z-index higher, and tapping the dark takes you back to the deck rather than out of the room. */
                .cr-prev-over { position: fixed; inset: 0; z-index: 4200; display: grid; place-items: center;
                    padding: 18px; background: rgba(4,6,10,0.82); backdrop-filter: blur(2px); }
                .cr-prev { align-self: center; justify-self: center;
                    display: flex; flex-direction: column; align-items: center; gap: 14px;
                    padding: 18px 16px; border-radius: 14px; background: #10141c;
                    border: 1px solid #2a3242; box-shadow: 0 18px 40px rgba(0,0,0,0.6); }
                .cr-prev-head { margin: 0; font-size: 15px; letter-spacing: 0.04em; color: #e7ecf4; }
                .cr-prev-pair { display: flex; align-items: center; gap: 10px; }
                .cr-prev-one { display: flex; flex-direction: column; align-items: center; gap: 6px; }
                /* ⚠️ THIS WAS a bare descendant selector AND IT REACHED INTO THE CARD. CardFace draws its sentence as
                   <i className="cf-line">, so a bare element selector on an ancestor styled the card's own
                   text: 11px, uppercase, 0.14em of letter-spacing and a grey it never asked for. Luke: "cant
                   read, also its not using the right font???" It WAS the right font — Kreon, tracked out and
                   capitalised until it read as somebody else's. The wider tracking then pushed the sentence
                   to an extra line and the bottom of it under the rail.
                   Same family as the .cf-key collision. A card is a component, not a place to put a
                   descendant selector. */
                .cr-prev-tag { font-style: normal; font-size: 11px; letter-spacing: 0.14em;
                    text-transform: uppercase; color: #7d8696; }
                .cr-prev-arrow { font-size: 20px; color: #7fe0a8; }
                .cr-prev-do { display: flex; flex-direction: column; align-items: stretch; gap: 8px; width: 100%; }
                .cr-prev-back { padding: 8px; border: 0; background: none; cursor: pointer;
                    font: inherit; font-size: 13px; color: #8a8f98; }
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
                /* The three-across grid it sits in is DECK_GRID_CSS at the top of this block — see deck-grid.js for
                   why the wrapping row it used to be came out two-wide on a 355px phone. */
                .cr-card { padding: 0; border: 0; background: none; cursor: pointer; }
                .cr-card:disabled { cursor: default; }
                /* A copy that has already been to the fire is still SHOWN — a deck with its upgrades hidden is
                   a deck you cannot plan with — it simply cannot be chosen again. */
                .cr-card.is-done { opacity: 0.45; filter: grayscale(0.55); }
                /* ⚠️ NO ROOT PREFIX — THE BLOCK ALREADY ADDS ONE. Written as ".cr .cf-card" this is served
                   as ".cr .cr .cf-card", which asks for two nested elements with that class; there is one, so
                   the rule never applied and the card was drawn with no box, taking its size from its own
                   text. Found in the shop, where three cards came out three different sizes and fell off the
                   shelf; the same line was in four files. */
                .cf-card { position: relative; width: var(--cf-w, 96px); height: var(--cf-h, 138px); padding: 0 0 8px;
                    display: flex; flex-direction: column; align-items: center;
                    background: none; border: 0; border-radius: 9px;
                    filter: drop-shadow(0 4px 7px rgba(0,0,0,0.6)); }
                .cf-card::after { content: ""; position: absolute; inset: -1px; z-index: 2;
                    pointer-events: none; background-image: url(/images/cards/chrome/frame.png);
                    background-repeat: no-repeat; background-size: 100% 100%; }

                .cr-foot { width: min(680px, 100%); display: flex; padding-bottom: 4px; }

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
                    .cr-do { min-width: 190px; padding: 11px 18px; }
                    .cr-do-label { font-size: 13.5px; }
                }
            `}</style>
        </div>
    );
}
