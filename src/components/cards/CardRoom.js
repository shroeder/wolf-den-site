"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Cinzel } from "next/font/google";
import { GiFlame } from "react-icons/gi";

import { CARD_FONT } from "@/components/cards/CardFace";
import { POTIONS } from "@/lib/marketplace/cards-kit.js";

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
        say: "Nobody's tending it. It'll burn a while yet.",
        done: "Warmer. The dark can wait a minute longer.",
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

export default function CardRoom({ run }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [said, setSaid] = useState(null);

    const at = run.at || {};
    const room = ROOM[at.kind] || ROOM.rest;
    const isFire = at.kind === "rest";
    const done = isFire ? Boolean(at.rested) : Boolean(at.opened);

    const heal = Math.ceil((run.hpMax || 1) * 0.3);
    const whole = run.hp >= run.hpMax;
    const loot = at.opened || null;
    const gotPotion = loot?.potion ? POTIONS[loot.potion] : null;

    const post = useCallback(async (action) => {
        if (busy) return;
        setBusy(true);
        setSaid(null);
        const r = await fetch("/api/marketplace/cards/run", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
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
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={`${id}${i}`} className="cr-ui" src={`/images/cards/potions/${id}.png`}
                        alt={POTIONS[id].name} title={`${POTIONS[id].name} — ${POTIONS[id].text}`} />
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
                    {said || (done ? room.done : room.say)}
                </p>

                {/* ── WHAT IT GAVE YOU ── written out, in the room, before you leave it. The whole complaint
                    was a payout you could not see; a number that changes on a bar you are not looking at is
                    not a reward, it is an accounting entry. */}
                {done ? (
                    <div className="cr-got">
                        {isFire ? (
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
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={`/images/cards/potions/${gotPotion.id}.png`} alt="" />
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

                {!done ? (
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
                .cr-room { position: fixed; inset: 0; z-index: -1;
                    background: #0a0b0f url(/images/cards/chrome/shop-room.png) center/cover no-repeat; }
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

                .cr-foot { width: min(680px, 100%); display: flex; padding-bottom: 4px; }
                .cr-leave { width: 132px; height: 46px; padding: 0 0 3px 8px; border: 0;
                    background: transparent url(/images/cards/chrome/return-ribbon.png) center/100% 100% no-repeat;
                    color: #ffe6d2; font: inherit; font-size: 14px; letter-spacing: 0.04em; cursor: pointer;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.8); filter: drop-shadow(0 3px 5px rgba(0,0,0,0.6)); }
                .cr-leave:disabled { opacity: 0.5; cursor: default; }

                @media (min-width: 760px) {
                    .cr-art { width: min(360px, 40vw); }
                    .cr-say { font-size: 14px; max-width: 420px; }
                }
            `}</style>
        </div>
    );
}
