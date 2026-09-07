"use client";

// ── THE ROOM THAT IS WRITING ─────────────────────────────────────────────────────────────────────────────
// Their events are the reason a question mark is the room a player most wants to walk into, and the reason
// two runs through the same act are different stories rather than the same fights in a different order. The
// screen has one job that the fight and the shop do not: it has to be READ. So the writing is the object —
// large, centred, given room — and the choices are full-width plates under it with their price on them,
// because "what does this cost me" is the only question being asked and it should never need a second tap to
// answer.
//
// Built on the campfire's own screen (CardRoom): the same alcove behind it, the same sticky bar of health,
// embers and belt, the same ribbon out. A room that invented its own furniture would read as a different
// game, and the whole point of a question mark is that you did not know which room you were walking into.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cinzel } from "next/font/google";
import {
    GiAnvil, GiBrokenBone, GiCrackedGlass, GiDeathSkull, GiEgyptianBird, GiEyeOfHorus, GiFangs,
    GiFishCorpse, GiFlame, GiMushroomGills, GiSnakeTongue, GiStoneBlock, GiStoneSphere,
} from "react-icons/gi";

import CardFace, { CARD_FONT, Sprite } from "@/components/cards/CardFace";
import CardForge, { FORGE_MS } from "@/components/cards/CardForge";
import { cardById, canUpgrade, POTIONS } from "@/lib/marketplace/cards-kit.js";
import { CHOOSE, eventById } from "@/lib/marketplace/cards-events.js";

const panelFont = Cinzel({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });

// ── THE OBJECT IN THE ROOM ───────────────────────────────────────────────────────────────────────────────
// One glyph each, not a photograph. Fourteen painted rooms is a week of art and a megabyte of it; a heavy
// engraved mark on the alcove wall reads as a woodcut in a book, which is what these rooms are. No emoji —
// the site's rule everywhere, and doubly so on a screen whose whole business is being read.
const MARK = {
    fish: GiFishCorpse,
    splint: GiBrokenBone,
    corpse: GiDeathSkull,
    egg: GiEgyptianBird,
    goo: GiStoneSphere,
    anvil: GiAnvil,
    flame: GiFlame,
    snake: GiSnakeTongue,
    mushroom: GiMushroomGills,
    shrine: GiStoneBlock,
    ooze: GiCrackedGlass,
    wall: GiStoneBlock,
    eye: GiEyeOfHorus,
    fang: GiFangs,
};

export default function CardEvent({ run, art = {} }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [said, setSaid] = useState(null);
    // A shrine that sharpens a card is doing what a campfire does, so it looks like what a campfire does —
    // see CardForge. Burning a card is a different act and does not borrow the ceremony.
    const [forge, setForge] = useState(null);
    const [forgeMode, setForgeMode] = useState("sharpen");
    const timers = useRef([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const at = run.at || {};
    const ev = eventById(at.event);
    const Mark = MARK[ev?.icon] || GiStoneBlock;
    const pending = at.pending || null;
    const done = Boolean(at.spent);
    // A room you can stay in remembers which plates you have already pressed — see the note on `again` in
    // the resolver. They stay on screen, greyed, because "you already took that one" is the information the
    // next decision is made against.
    const used = at.used || [];
    // Every room has a painting now (gen-card-events.mjs); the glyph underneath is what a NEW room shows on
    // the day it is written and before it is drawn.
    const hasArt = true;
    const deck = run.deck || [];

    const post = useCallback(async (extra) => {
        if (busy) return;
        setBusy(true);
        setSaid(null);
        const r = await fetch("/api/marketplace/cards/run", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "choose", ...extra }),
        }).then((x) => x.json()).catch(() => null);
        setBusy(false);
        // The same reasoning as the campfire's: a refusal that arrives because the SERVER already resolved
        // the room is not news the player needs. Anything else is worth a line, because a choice that does
        // nothing and says nothing is the exact bug these screens exist to prevent.
        if (r?.error === "too_poor") { setSaid("Not enough embers."); return; }
        if (r?.error === "deck_too_small") { setSaid("Any fewer cards and there is no deck left."); return; }
        if (r?.error && r.error !== "already_chosen") { setSaid("Nothing comes of it."); return; }
        router.refresh();
    }, [busy, router]);

    // The same shape the campfire's smith uses: the request goes out as the card starts moving, so the fire
    // is never waiting on the network.
    const sharpen = useCallback(async (index, card, mode = "sharpen") => {
        if (busy || forge) return;
        setBusy(true);
        setSaid(null);
        setForgeMode(mode);
        setForge(card);
        const sent = fetch("/api/marketplace/cards/run", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "choose", index, card }),
        }).catch(() => null);
        await Promise.all([sent, new Promise((r) => { timers.current.push(setTimeout(r, FORGE_MS)); })]);
        setBusy(false);
        setForge(null);
        router.refresh();
    }, [busy, forge, router]);

    const leave = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        await fetch("/api/marketplace/cards/run", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "leave" }),
        }).catch(() => null);
        setBusy(false);
        router.refresh();
    }, [busy, router]);

    if (!ev) return null;

    return (
        <div className={`cv ${panelFont.className}`} style={{ "--cf-card-font": CARD_FONT.style.fontFamily }}>
            <div className="cv-room" aria-hidden="true" />

            {/* The map's and the shop's bar, unchanged — see CardRoom. */}
            <div className="cv-bar">
                <span className="cv-who">{ev.name}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="cv-ui" src="/images/cards/chrome/ui-heart.png" alt="" />
                <b className="cv-hp">{run.hp}/{run.hpMax}</b>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="cv-ui" src="/images/cards/chrome/ui-ember.png" alt="" />
                <b className="cv-em">{(run.embers || 0).toLocaleString()}</b>
                {(run.potions || []).map((id, i) => POTIONS[id] ? (
                    <span key={`${id}${i}`} title={`${POTIONS[id].name} — ${POTIONS[id].text}`}>
                        <Sprite className="cv-ui" src={`/images/cards/potions/${id}.png`} />
                    </span>
                ) : null)}
            </div>

            <div className={`cv-stage${hasArt ? " has-art" : ""}`}>
                {/* ── THE OBJECT ───────────────────────────────────────────────────────────────────────
                    A painted thing, like every other room in this game has. The glyph is still here and
                    still correct — it is what a room with no art yet falls back to — but it is the spare
                    tyre now rather than the wheel. Sprite handles the 404 without a flash of broken image. */}
                <Sprite className="cv-art" src={`/images/cards/events/${ev.id}.webp`}
                    fallback={null} />
                <span className="cv-mark" aria-hidden="true"><Mark /></span>
                <h1 className="cv-name">{ev.name}</h1>
                <p className="cv-say">{ev.say}</p>

                {/* ── WHAT IT DID ── in the room, in words, before you are allowed to leave it. The chest
                    taught this lesson once already: a payout you cannot see is not a payout. */}
                {done || used.length ? (
                    <div className="cv-got">
                        {(at.said || []).map((line, i) => <span key={i} className="cv-gain">{line}</span>)}
                        {!(at.said || []).length ? <span className="cv-gain is-quiet">You leave it alone.</span> : null}
                    </div>
                ) : null}

                {said ? <p className="cv-warn" role="status">{said}</p> : null}

                {/* ── THE CHOICES ─────────────────────────────────────────────────────────────────────
                    Full width, stacked, price on the plate. Theirs puts the consequence in the button text
                    and so does this: a player should never have to take a choice to find out what it was. */}
                {!done && !pending ? (
                    <div className="cv-choices">
                        {ev.choices.map((c, i) => {
                            const tooPoor = Boolean(c.cost) && (run.embers || 0) < c.cost;
                            const spent = used.includes(i);
                            return (
                                <button key={i} type="button" className={`cv-do${spent ? " is-spent" : ""}`}
                                    disabled={busy || tooPoor || spent}
                                    onClick={() => post({ index: i })}>
                                    <span className="cv-do-text">
                                        <b>{c.label}</b>
                                        <i>{spent ? "Already searched." : tooPoor ? `${c.detail} — you cannot afford it` : c.detail}</i>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ) : null}

                {/* ── AND THE TWO THAT ASK WHICH CARD ─────────────────────────────────────────────────
                    A modal over the room, the way every other "choose one of these" in this game works —
                    see the note on the campfire's picker, which learned it the hard way. */}
                {/* ── THE ROOM ASKS WHICH CARD ────────────────────────────────────────────────────
                    Four rooms ask now — burn, sharpen, copy, change — and what each one calls itself comes
                    from CHOOSE beside the rules rather than from ternaries here. This block used to read
                    "remove, or else sharpen" in four separate places, so the Duplicator would have opened a
                    dialog headed "Which one takes the edge" over buttons that said Sharpen and a fire
                    animation that burned the card you were trying to keep. */}
                {pending ? (() => {
                    const ask = CHOOSE[pending.need] || CHOOSE.remove;
                    return (
                    <div className="cv-pick-over" role="presentation">
                        <div className="cv-pick" role="dialog"
                            aria-label={`Choose a card to ${ask.verb.toLowerCase()}`}>
                            <div className="cv-pick-bar">
                                <p className="cv-pick-head">{ask.title}</p>
                            </div>
                            <div className="cv-pick-deck">
                                {deck.map((id, i) => {
                                    const c = cardById(id);
                                    if (!c) return null;
                                    const can = ask.can(id);
                                    return (
                                        <button key={`${id}-${i}`} type="button"
                                            className={`cv-card${can ? "" : " is-done"}`} disabled={busy || !can}
                                            aria-label={`${ask.verb} ${c.name}`}
                                            onClick={() => sharpen(pending.choice, id, ask.forge)}>
                                            <span className="cf-card"><CardFace card={c} art={art[c.pet]} /></span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    );
                })() : null}
            </div>

            {forge ? <CardForge card={forge} art={art} mode={forgeMode} /> : null}

            <div className="cv-foot">
                <button type="button" className="cv-leave" disabled={busy || (!done && !pending && false)} onClick={leave}>
                    {done ? "Move on" : "Walk away"}
                </button>
            </div>

            {/* Global for the same reason the campfire's is: every selector is under `.cv`. */}
            <style jsx global>{`
                .cv { position: fixed; inset: 0; z-index: 4000; overflow-y: auto; overscroll-behavior: contain;
                    display: flex; flex-direction: column; align-items: center;
                    padding: 0 10px 18px; background: #0a0b0f; color: #efe3cd; }
                .cv-room { position: fixed; inset: 0; z-index: -1;
                    background: #0a0b0f url(/images/cards/chrome/shop-room.png) left center/cover no-repeat; }
                .cv-room::after { content: ""; position: absolute; inset: 0;
                    background: radial-gradient(ellipse at 50% 42%, rgba(10,11,15,0.05), rgba(6,7,10,0.92) 74%); }

                .cv-bar { position: sticky; top: 0; z-index: 6; align-self: stretch;
                    display: flex; align-items: center; gap: 7px; padding: 7px 12px; margin: 0 -10px;
                    background: #3d4550; border-bottom: 1px solid rgba(0,0,0,0.35); }
                .cv-who { font-size: 13px; letter-spacing: 0.06em; opacity: 0.85; margin-right: auto; }
                .cv-ui { width: 20px; height: 20px; object-fit: contain; }
                .cv-hp { font-size: 13px; color: #ff8f7a; font-variant-numeric: tabular-nums; }
                .cv-em { font-size: 13px; color: #ffb45e; font-variant-numeric: tabular-nums; }

                /* ⚠️ IT WAS TOP-HEAVY AND FULL OF AIR. Photographed on a real phone: a small glyph floating
                   at 40% of the screen, then a gap, then the plates, then a third of the screen empty under
                   them. Centring a short column in a tall viewport does that — the content has nothing to
                   push against. The stage is pinned toward the bottom now with the object above it, which is
                   how the campfire and the merchant are already built: the thing you look at is high, the
                   things you press are within a thumb's reach of the bottom. */
                .cv-stage { flex: 1; width: min(560px, 100%); display: flex; flex-direction: column;
                    align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 0 4px; }

                /* The mark on the wall. Big, warm and lit from itself, so the room has an object in it
                   without fourteen paintings existing. */
                /* The painting. Sized off the viewport so a tall phone gives it room and a short one does
                   not lose the plates — the same reasoning the campfire's fire is sized by. It throws its own
                   light, because an object on a dark wall with no glow under it is a sticker. */
                .cv-art { width: min(210px, 46vw); height: auto; max-height: 34vh; object-fit: contain;
                    margin-bottom: -2px;
                    filter: drop-shadow(0 0 30px rgba(255,170,70,0.22)) drop-shadow(0 10px 18px rgba(0,0,0,0.85)); }
                /* The fallback, for a room written before it is drawn. */
                .cv-stage.has-art .cv-mark { display: none; }
                .cv-mark { display: grid; place-items: center; font-size: 70px; color: #e0b878;
                    filter: drop-shadow(0 0 26px rgba(255,170,70,0.32)) drop-shadow(0 8px 14px rgba(0,0,0,0.8)); }
                /* ── THE ROOM'S OWN TYPEFACE ───────────────────────────────────────────────────────────
                   ⚠️ THIS SCREEN DECLARED NO FONT AT ALL and every other one in the game does, so a written
                   room was the single place in the card game rendering in the SITE's sans while the campfire
                   two rooms earlier, the merchant's shelf and this room's own prose were all in the card
                   font. Photographed side by side it reads as a different game's screen — and it is the one
                   screen whose entire job is to be read. The site also styles h1 and button, so these have
                   to say it rather than inherit it. */
                .cv-name { margin: 0; font-family: var(--cf-card-font); font-size: 20px;
                    letter-spacing: 0.05em; font-weight: 700;
                    color: #f3e6cd; text-shadow: 0 2px 6px rgba(0,0,0,0.9); text-align: center; }
                .cv-say { margin: 0 0 2px; max-width: 330px; text-align: center; font-size: 13px; line-height: 1.45;
                    color: #c3b49c; font-style: italic; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
                .cv-warn { margin: 0; font-size: 12.5px; color: #f0c98a; }

                .cv-got { display: flex; flex-direction: column; align-items: center; gap: 4px; margin-top: 2px; }
                .cv-gain { font-family: var(--cf-card-font); font-size: 13px; color: #ffd79a;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
                .cv-gain.is-quiet { color: #9d9282; font-style: italic; }

                /* ── THE PLATES ── full width and stacked, because they are sentences rather than buttons and
                   a row of them on a phone would set the text at eight points. */
                .cv-choices { display: flex; flex-direction: column; gap: 6px; width: min(420px, 94%);
                    margin-top: 4px; }
                /* ── THE CHOICES ARE CUT INTO THE WALL, NOT LAID ON IT ────────────────────────────────
                   Luke, on a photograph of The Black Anvil: "hate these buttons."
                   They were a DRAWN PLATE — one bitmap of moulded grey metal with a rivet at each end —
                   stretched to whatever width the screen happened to be with object-fit: fill. Three things
                   were wrong with that and all three are visible in his photograph:

                     · IT WAS THE ONLY COLD THING ON A WARM SCREEN. The room is lit amber, the art is warm,
                       the title and the prose are cream — and then three slabs of neutral grey, which is the
                       one hue this game uses nowhere else. They read as a control panel bolted over the
                       painting rather than as part of the room.
                     · A DRAWN BEVEL DOES NOT STRETCH. The asset was painted at one shape and squashed to a
                       wide shallow one, so the moulding went soft and the rivets flattened into smears — the
                       plasticky look is a distorted bitmap, not a style choice.
                     · AND IT COST 34px OF PADDING A SIDE to clear those rivets, on a 375px phone. A third of
                       every plate was empty metal held open for two dots.

                   Drawn in CSS now, in the game's own palette: dark warm stone with a brass hairline and an
                   amber rail down the leading edge, which is the only part that needs to say "press me". The
                   rail is also the hierarchy the three grey slabs never had — it lights on hover and press.
                   Nothing is stretched, so it is the same object at every width. */
                .cv-do { position: relative; display: block; width: 100%; cursor: pointer;
                    padding: 11px 14px 11px 18px; text-align: left; border-radius: 10px;
                    border: 1px solid rgba(201,162,83,0.30);
                    background:
                        linear-gradient(90deg, rgba(255,183,92,0.16) 0 4px, rgba(255,183,92,0) 4px),
                        linear-gradient(180deg, rgba(38,30,22,0.96), rgba(24,19,15,0.96));
                    box-shadow: inset 0 1px 0 rgba(255,232,190,0.07), 0 2px 5px rgba(0,0,0,0.45);
                    transition: border-color 120ms ease-out, background 120ms ease-out; }
                /* The rail itself — a separate layer so it can light without moving the plate's fill. */
                .cv-do::before { content: ""; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px;
                    border-radius: 3px; background: linear-gradient(180deg, #ffcf8a, #b9782c);
                    box-shadow: 0 0 7px rgba(255,180,90,0.35); transition: box-shadow 120ms ease-out; }
                .cv-do:hover:not(:disabled), .cv-do:focus-visible:not(:disabled) {
                    border-color: rgba(255,196,110,0.6);
                    background:
                        linear-gradient(90deg, rgba(255,183,92,0.22) 0 4px, rgba(255,183,92,0) 4px),
                        linear-gradient(180deg, rgba(50,39,27,0.97), rgba(31,24,18,0.97)); }
                .cv-do:hover:not(:disabled)::before { box-shadow: 0 0 12px rgba(255,190,100,0.65); }
                .cv-do:not(:disabled):active { transform: translateY(1px); }
                .cv-do:disabled { cursor: default; opacity: 0.5; }
                /* A door already used keeps its words readable — it is the record of what you did in here. */
                .cv-do.is-spent { opacity: 0.45; }
                .cv-do.is-spent::before { background: linear-gradient(180deg, #6d6152, #443c33); box-shadow: none; }
                .cv-do-text { position: relative; display: flex; flex-direction: column; gap: 2px; }
                /* ⚠️ NOT INHERITED. The site sets a link colour on anything that looks like a control, which
                   has quietly turned button text blue on this game's screens before. */
                .cv-do-text b { font-family: var(--cf-card-font); font-size: 15px; color: #ffeed2;
                    letter-spacing: 0.02em; }
                /* Lifted off #cbbb9f: that was chosen against pale grey metal and this ground is dark, where
                   it read as a whisper. The detail line is the half that says what the choice COSTS. */
                .cv-do-text i { font-family: var(--cf-card-font); font-size: 12px; line-height: 1.35;
                    color: #c3b393; font-style: normal; }

                .cv-pick-over { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center;
                    padding: 12px; background: rgba(5,6,9,0.82); }
                .cv-pick { width: min(560px, 96vw); max-height: 82vh; overflow-y: auto;
                    background: #14161d; border: 1px solid rgba(226,199,143,0.28); border-radius: 12px;
                    padding: 10px; }
                .cv-pick-bar { position: sticky; top: -10px; background: #14161d; padding: 2px 2px 8px; }
                .cv-pick-head { margin: 0; font-family: var(--cf-card-font); font-size: 13px; color: #e8dcc6;
                    letter-spacing: 0.04em; }
                .cv-pick-deck { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
                    gap: 8px; }
                /* ⚠️ A CARD MUST BE GIVEN ITS SIZE, and this screen never gave it one. CardFace draws itself
                   out of ABSOLUTELY POSITIONED layers — the stock, the rim, the banner — so a .cf-card with
                   no width or height is a zero-size box whose pieces escape it and spread over whatever is
                   beside them. Every other screen in the game sizes it (.cr .cf-card, .cs .cf-card, and the
                   fight's own), and this one was written without it.
                   It LOOKED right, which is why it survived a screenshot: the cards drew in the right places.
                   What broke was the hit test. Measured in the browser, the point at the centre of a card's
                   own button belonged to the NEIGHBOURING card's stock layer, not to the button — so every tap
                   landed on a sibling and the picker could not be used at all. The bot sat in it for a
                   hundred and thirty steps saying "choosing a card" and never chose one. */
                .cv .cf-card { position: relative; width: var(--cf-w, 96px); height: var(--cf-h, 138px); padding: 0 0 8px;
                    display: flex; flex-direction: column; align-items: center;
                    background: none; border: 0; border-radius: 9px;
                    filter: drop-shadow(0 4px 7px rgba(0,0,0,0.6)); }
                /* The painted moulding, laid over the clipped picture — the same overlay every other screen
                   that draws a card puts on it. Sizing the box without this gives a card with no frame and
                   its pieces sitting where the flex column did not put them. */
                .cv .cf-card::after { content: ""; position: absolute; inset: -1px; z-index: 2;
                    pointer-events: none; background-image: url(/images/cards/chrome/frame.png);
                    background-repeat: no-repeat; background-size: 100% 100%; }
                .cv-card { padding: 0; border: 0; background: none; cursor: pointer; }
                .cv-card.is-done { opacity: 0.35; cursor: default; }

                .cv-foot { display: flex; justify-content: center; padding-top: 10px; }
                .cv-leave { padding: 8px 22px; border-radius: 999px; font-family: var(--cf-card-font);
                    font-size: 13px; letter-spacing: 0.05em;
                    color: #e8dcc6; background: rgba(20,16,12,0.72);
                    border: 1px solid rgba(226,199,143,0.3); cursor: pointer; }
                .cv-leave:disabled { opacity: 0.45; cursor: default; }

                @media (min-width: 720px) {
                    .cv-room { background-position: center center; }
                    .cv-mark { font-size: 86px; }
                    .cv-name { font-size: 25px; }
                }
            `}</style>
        </div>
    );
}
