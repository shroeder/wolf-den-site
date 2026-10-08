"use client";

import { useCallback, useEffect, useState, useRef } from "react";

// ── THE GOURDFATHER'S STALL ──────────────────────────────────────────────────────────────────────────────
// What he sells for candy, and nothing else.
//
// ⚠️ TRICK-OR-TREAT USED TO BE A TAB IN HERE AND IT IS NOT ANY MORE. Luke: "Trick or treating is an immersive
// thing, nothing in a modal. You go door to door at each buikding." A list of eighteen buttons behind a panel
// is a chore list; walking the street and knocking on the actual doors is the ritual. It lives in the town
// scene now — see the door markers in TownClient — and this panel went back to being a shop.
//
// ⚠️ AND THERE IS NO SCROLLER INSIDE THIS ONE. `.tw-roster-panel` is already a 70dvh scroll box, so an
// `overflow-y: auto` on the stock list underneath it meant two nested scrollers sharing one thumb-drag: on a
// phone the inner one swallows the gesture, you reach its end, and the sheet beneath refuses to move. One
// panel, one scroll — and the inspector below obeys the same rule.
//
// ⚠️ AND THE DIALOGUE AND THE DETAIL ARE PASSED IN, NOT IMPORTED. gourdfather.js is `server-only` — it reads
// the database, ITEMS, COLLECTIBLES and the decoration tables — so a client component that imported any of it
// would drag the whole catalogue into the browser bundle for sixteen rows. The page hands the lines down and
// the server builds the stat lines, which also means his mouth and his prices can never disagree about
// whether the event is on.

// His shelves, in the order a member reads them: the thing you can afford today, then the thing you are
// saving for. The headings are not decoration — each group is a different KIND of purchase (a sealed gamble,
// a wearable set bought a piece at a time, a one-off pet, a thing for the farm) and they are priced on
// different scales, so a flat list of sixteen rows reads as sixteen unrelated numbers.
const SHELVES = [
    { kind: "chest", title: "Gift Boxes", note: "Sealed. He insists he does not know." },
    { kind: "item", title: "Harvest's End", note: "Five pieces. 2,500 candy for the set." },
    { kind: "pet", title: "His Friends", note: "One each — they do not come twice." },
    { kind: "deco", title: "For the Farm", note: "Standing decorations." },
];

const RARITY_LABEL = { rare: "Rare", epic: "Epic", legendary: "Legendary", mythic: "Mythic" };

/**
 * The candy mark. Luke: "Lets have a strong iconic sprite for candy as well as show it wherever its referred
 * to." Every number in this panel that counts candy wears it, so the currency is recognised by its picture
 * before the word is read — which is the only thing that separates it from the gold, chips, doubloons and
 * laurels a member is already holding.
 */
function Candy({ src, size = 15 }) {
    if (!src) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="gf-candy-mark" src={src} alt="" draggable={false} style={{ width: size, height: size }} />;
}

export default function GourdfatherStall({ art, candyArt = null, lines, onClose }) {
    const [stall, setStall] = useState(null);
    const [busy, setBusy] = useState(null);
    // His current line. An INDEX rather than the string, so a re-render does not reshuffle his mouth
    // mid-sentence — the same reason the wheel keeps its own rotation in a ref.
    const [say, setSay] = useState({ bank: "greet", n: Math.floor(Math.random() * 1000) });
    const [flash, setFlash] = useState(null);
    // The ware being looked at properly. An ID rather than the row, so a refresh after a purchase updates
    // what the open inspector is showing instead of leaving a stale copy of it on screen.
    const [inspect, setInspect] = useState(null);

    const post = useCallback(async (body) => {
        const r = await fetch("/api/marketplace/town", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        }).catch(() => null);
        return r ? r.json().catch(() => null) : null;
    }, []);

    const load = useCallback(async () => {
        const s = await post({ action: "gourd_stall" });
        if (s?.ok) setStall(s);
    }, [post]);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount (setState is post-await)
    useEffect(() => { load(); }, [load]);

    const speak = (bank) => setSay({ bank, n: Math.floor(Math.random() * 1000) });

    // ── ⚠️ A TAP CANNOT SPEND CANDY ANY MORE; IT CAN ONLY ASK ───────────────────────────────
    // ValkyrieSylve: "I clicked on the gourdfather and it didnt load properly so I touched the screen then
    // instantly it loaded and spend candy on a chest I DID NOT WANT ... Can we also just get an are you sure."
    //
    // The tap that spent her candy was aimed at a panel that had not painted yet. It landed the instant the
    // row appeared underneath her finger, and one tap was the whole purchase - irreversible, against a
    // currency with a daily cap, so the loss is a day of play rather than a number.
    //
    // ⚠️ THE CONFIRM IS WHAT FIXES IT, not a check for whether the panel is ready. Nothing can tell a
    // deliberate tap from an early one; what matters is that the FIRST tap can never be the last word.
    const [confirming, setConfirming] = useState(null);

    const ask = useCallback((w) => {
        if (busy || w.owned || candyRef.current < w.candy) return;
        setConfirming(w);
    }, [busy]);

    const buy = useCallback(async (id) => {
        if (busy) return;
        setConfirming(null);
        setBusy(id);
        const d = await post({ action: "gourd_buy", id });
        setBusy(null);
        if (d?.ok) {
            speak("buy");
            setFlash(`${d.granted?.name} — yours.`);
            load();
            if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh"));
        } else {
            speak(d?.error === "already_owned" ? "owned" : "broke");
            setFlash(null);
        }
        setTimeout(() => setFlash(null), 3500);
    }, [busy, post, load]);

    // Read through a ref so `ask` does not have to be rebuilt every time the candy total ticks.
    const candyRef = useRef(0);
    const bank = lines?.[say.bank] || lines?.greet || [];
    const line = bank.length ? bank[say.n % bank.length] : "";
    const candy = stall?.candy ?? 0;
    candyRef.current = candy;
    const stock = stall?.stock || [];
    const looking = inspect ? stock.find((w) => w.id === inspect) || null : null;

    return (
        <div className="tw-roster" onClick={onClose} role="presentation">
            <div className="tw-roster-panel gf-panel" onClick={(e) => e.stopPropagation()}>
                <div className="tw-roster-head gf-head">
                    {art ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="gf-face" src={art} alt="" draggable={false} />
                    ) : null}
                    <strong className="gf-name">The Gourdfather</strong>
                    <span className="gf-candy"><Candy src={candyArt} size={16} />{candy.toLocaleString()}</span>
                    <button type="button" onClick={onClose} aria-label="Close">✕</button>
                </div>

                {/* His mouth. Always on screen, because he never stops. */}
                <p className="gf-say">{line}</p>

                {flash ? <div className="gf-flash">{flash}</div> : null}

                {stock.length === 0 ? <p className="gf-empty">He is still unpacking the cart…</p> : null}

                {SHELVES.map((shelf) => {
                    const rows = stock.filter((w) => w.kind === shelf.kind);
                    if (!rows.length) return null;
                    return (
                        <section key={shelf.kind} className="gf-shelf">
                            <h4 className="gf-shelf-head">{shelf.title}<i>{shelf.note}</i></h4>
                            <div className="gf-stock">
                                {rows.map((w) => {
                                    const afford = candy >= w.candy;
                                    return (
                                        // ⚠️ THE ROW IS THE BUTTON AND THE PRICE IS A BUTTON INSIDE IT, which is
                                        // not allowed — so the row is a <div> with a tap handler and its own
                                        // role, and the price keeps being a real <button>. Nesting them would
                                        // be invalid markup that behaves differently in every browser, and
                                        // "inspect" would fire every time somebody bought something.
                                        <div
                                            key={w.id}
                                            className={`gf-ware r-${w.rarity || "rare"}${w.owned ? " is-owned" : ""}`}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setInspect(w.id)}
                                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setInspect(w.id); } }}
                                            aria-label={`Look at ${w.name}`}
                                        >
                                            {/* ⚠️ A PICTURE, NOT A GLYPH. Every one of these sixteen already had a
                                                sprite drawn for it in its own table and this shop was listing
                                                them as lines of text. */}
                                            <span className="gf-pic">
                                                {w.sprite ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={w.sprite} alt="" draggable={false} />
                                                ) : null}
                                            </span>
                                            <div className="gf-ware-body">
                                                <b>{w.name}</b>
                                                {w.slot ? <i className="gf-slot">{String(w.slot).replace("_", " ")}</i> : null}
                                                {w.blurb ? <span className="gf-blurb">{w.blurb}</span> : null}
                                            </div>
                                            <button
                                                type="button"
                                                className="gf-buy"
                                                disabled={w.owned || !afford || busy === w.id}
                                                onClick={(e) => { e.stopPropagation(); ask(w); }}
                                            >
                                                {w.owned ? "Yours" : busy === w.id ? "…" : (
                                                    <><Candy src={candyArt} size={13} /><b>{w.candy.toLocaleString()}</b></>
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}
            </div>

            {/* ── THE LONG LOOK ───────────────────────────────────────────────────────────────────────
                Luke: "Also need to be able to click and havr an inspection modal". A row has space for a name
                and a price; a scythe has four stats, a slot, a rarity and a line of flavour, and buying 500
                candy of something you have only seen the name of is a purchase made blind.

                It sits OVER the stall rather than replacing it, so closing it puts you back exactly where you
                were in a list you may have scrolled a long way down. */}
            {looking ? (
                <div className="gf-look" onClick={(e) => { e.stopPropagation(); setInspect(null); }} role="presentation">
                    <div className={`gf-look-card r-${looking.rarity || "rare"}`} onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="gf-look-x" onClick={() => setInspect(null)} aria-label="Close">✕</button>
                        <span className="gf-look-pic">
                            {looking.sprite ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={looking.sprite} alt="" draggable={false} />
                            ) : null}
                        </span>
                        <h3>{looking.name}</h3>
                        <p className="gf-look-tags">
                            {looking.rarity ? <span className="gf-tag">{RARITY_LABEL[looking.rarity] || looking.rarity}</span> : null}
                            {looking.slot ? <span className="gf-tag">{String(looking.slot).replace("_", " ")}</span> : null}
                            {looking.owned ? <span className="gf-tag is-owned">Owned</span> : null}
                        </p>
                        {looking.stats?.length ? (
                            <dl className="gf-look-stats">
                                {looking.stats.map((st) => (
                                    <div key={st.key} title={st.desc || undefined}>
                                        <dt>{st.label}</dt>
                                        <dd>{st.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        ) : null}
                        {looking.blurb ? <p className="gf-look-flavor">{looking.blurb}</p> : null}
                        {looking.note ? <p className="gf-look-note">{looking.note}</p> : null}
                        <button
                            type="button"
                            className="gf-look-buy"
                            disabled={looking.owned || candy < looking.candy || busy === looking.id}
                            onClick={() => ask(looking)}
                        >
                            {looking.owned ? "Already yours"
                                : busy === looking.id ? "…"
                                    : candy < looking.candy
                                        ? <>Need <Candy src={candyArt} size={14} />{(looking.candy - candy).toLocaleString()} more</>
                                        : <>Buy for <Candy src={candyArt} size={14} />{looking.candy.toLocaleString()}</>}
                        </button>
                    </div>
                </div>
            ) : null}
            {confirming ? (
                <div className="gf-sure" onClick={() => setConfirming(null)} role="presentation">
                    <div className="gf-sure-card" onClick={(e) => e.stopPropagation()}>
                        <p className="gf-sure-q">Spend <Candy src={candyArt} size={15} />{confirming.candy.toLocaleString()} on</p>
                        <b className="gf-sure-name">{confirming.name}</b>
                        <p className="gf-sure-left">
                            You{"\u2019"}ll have <Candy src={candyArt} size={13} />{Math.max(0, candy - confirming.candy).toLocaleString()} left.
                        </p>
                        <div className="gf-sure-row">
                            <button type="button" className="gf-sure-no" onClick={() => setConfirming(null)}>Not yet</button>
                            <button type="button" className="gf-sure-yes" onClick={() => buy(confirming.id)}>Buy it</button>
                        </div>
                    </div>
                </div>
            ) : null}
            <style>{CSS}</style>
        </div>
    );
}

const CSS = `
.gf-panel { max-width: 540px; }
.gf-head { gap: 8px; align-items: center; }
.gf-face { width: 42px; height: 42px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6)); }
.gf-name { flex: 1; min-width: 0; }
.gf-candy-mark { object-fit: contain; flex: 0 0 auto; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.55)); }
.gf-candy { display: inline-flex; align-items: center; gap: 5px; font-weight: 900; font-size: 0.9rem;
    color: #ffcf6a; white-space: nowrap; font-variant-numeric: tabular-nums;
    background: rgba(255,170,60,0.14); border: 1px solid rgba(255,170,60,0.34); border-radius: 999px; padding: 3px 11px 3px 8px; }
/* His line sits in a bubble that is always the same height for one or two lines, so the panel does not jump
   every time he changes his mind. */
.gf-say { margin: -2px 2px 10px; padding: 9px 12px; border-radius: 12px; min-height: 2.9em; display: flex; align-items: center;
    background: linear-gradient(180deg, rgba(255,180,60,0.14), rgba(255,120,20,0.08));
    border: 1px solid rgba(255,170,60,0.3); color: #ffe6bd; font-style: italic; font-size: 0.9rem; line-height: 1.35; }
.gf-flash { margin: 0 2px 9px; padding: 9px 11px; border-radius: 10px; font-size: 0.85rem; line-height: 1.4;
    background: rgba(90,220,160,0.12); border: 1px solid rgba(90,220,160,0.32); color: #c9f5e2; }
.gf-empty { margin: 10px 2px; font-size: 0.86rem; color: #b6ab9a; font-style: italic; }
.gf-shelf { margin: 0 0 12px; }
.gf-shelf-head { display: flex; align-items: baseline; gap: 8px; margin: 0 2px 6px; font-size: 0.74rem;
    font-weight: 900; text-transform: uppercase; letter-spacing: .09em; color: #ffcf6a; }
.gf-shelf-head i { font-style: normal; font-weight: 600; text-transform: none; letter-spacing: 0;
    font-size: 0.72rem; color: #9b9080; }
/* ⚠️ NO max-height AND NO overflow HERE. The panel above is the scroller; a second one inside it eats the
   drag on a phone. See the note at the top of this file. */
.gf-stock { display: flex; flex-direction: column; gap: 7px; }
.gf-ware { display: flex; align-items: center; gap: 10px; padding: 8px 11px 8px 8px; border-radius: 11px;
    background: rgba(255,255,255,0.045); border: 1px solid var(--r, rgba(255,255,255,0.12)); cursor: pointer;
    transition: background .12s ease, transform .12s ease; }
.gf-ware:hover { background: rgba(255,255,255,0.08); transform: translateY(-1px); }
.gf-ware:focus-visible { outline: 2px solid #ffcf6a; outline-offset: 2px; }
.gf-ware.r-rare { --r: rgba(92,180,255,0.45); } .gf-ware.r-epic { --r: rgba(186,120,255,0.45); }
.gf-ware.r-legendary { --r: rgba(255,180,60,0.5); } .gf-ware.r-mythic { --r: rgba(92,224,192,0.5); }
.gf-ware.is-owned { opacity: 0.5; }
/* A fixed box whether the sprite loaded or not, so a missing picture leaves a gap rather than reflowing the
   row — the same reason the avatar tiles reserve their square. */
.gf-pic { flex: 0 0 auto; display: grid; place-items: center; width: 52px; height: 52px; border-radius: 9px;
    background: radial-gradient(circle at 50% 62%, rgba(255,170,60,0.14), rgba(0,0,0,0.22) 70%); }
.gf-pic img { max-width: 48px; max-height: 48px; object-fit: contain; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.55)); }
.gf-ware-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.gf-ware-body b { font-size: 0.92rem; color: #fff; }
.gf-slot { font-size: 0.7rem; text-transform: uppercase; letter-spacing: .06em; color: #9aa2ab; font-style: normal; }
.gf-blurb { font-size: 0.76rem; color: #b6ab9a; font-style: italic; line-height: 1.3; }
.gf-buy { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; gap: 4px;
    min-width: 72px; padding: 9px 12px 9px 10px; border-radius: 999px; cursor: pointer;
    background: linear-gradient(180deg, #ffcf6a, #e89a1c); border: none; color: #2a1403; white-space: nowrap;
    font-variant-numeric: tabular-nums; }
.gf-buy b { font-size: 0.9rem; font-weight: 900; }
.gf-buy:disabled { background: rgba(255,255,255,0.08); color: #8b93a0; cursor: default; }
/* ⚠️ DIMMED, NOT GREYED. A greyscaled 13px sweet is a grey blob -- filmed, it stopped being recognisable as
   the currency at exactly the moment the button is telling you that you cannot afford it, which is when
   knowing WHICH currency matters most. The button's own colour already says disabled. */
.gf-buy:disabled .gf-candy-mark { opacity: 0.62; }

/* ── THE INSPECTOR ────────────────────────────────────────────────────────────────────────────────────
   z 420 — above .tw-roster (400), because it opens FROM the stall and has to sit over it. */
.gf-look { position: fixed; inset: 0; z-index: 420; display: grid; place-items: center; padding: 18px;
    background: rgba(6,4,12,0.72); backdrop-filter: blur(4px); animation: gfLookIn .18s ease both; }
@keyframes gfLookIn { from { opacity: 0; } to { opacity: 1; } }
.gf-look-card { position: relative; width: 100%; max-width: 340px; max-height: 86dvh; overflow-y: auto;
    padding: 18px 18px 16px; border-radius: 20px; text-align: center;
    background: linear-gradient(180deg, #221842, #140d26);
    border: 1px solid var(--r, rgba(255,255,255,0.16)); box-shadow: 0 24px 60px rgba(0,0,0,0.7);
    animation: gfLookUp .24s cubic-bezier(.2,1,.3,1) both; }
@keyframes gfLookUp { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: none; } }
.gf-look-card.r-rare { --r: rgba(92,180,255,0.6); } .gf-look-card.r-epic { --r: rgba(186,120,255,0.6); }
.gf-look-card.r-legendary { --r: rgba(255,180,60,0.65); } .gf-look-card.r-mythic { --r: rgba(92,224,192,0.65); }
.gf-look-x { position: absolute; top: 10px; right: 10px; width: 30px; height: 30px; border-radius: 999px;
    background: rgba(255,255,255,0.08); border: none; color: #e8e2d6; font-size: 15px; cursor: pointer; }
/* The picture at a size worth looking at — the whole reason this panel exists. The glow behind it is the
   rarity, so the card says how good the thing is before you have read a word of it. */
.gf-look-pic { display: grid; place-items: center; width: 152px; height: 152px; margin: 4px auto 10px;
    border-radius: 20px; background: radial-gradient(circle at 50% 58%, var(--r, rgba(255,255,255,0.2)), rgba(0,0,0,0.3) 68%); }
.gf-look-pic img { max-width: 136px; max-height: 136px; object-fit: contain;
    filter: drop-shadow(0 8px 14px rgba(0,0,0,0.65)); }
.gf-look-card h3 { margin: 0 0 7px; font-size: 1.12rem; color: #fff; text-wrap: balance; }
.gf-look-tags { display: flex; justify-content: center; flex-wrap: wrap; gap: 5px; margin: 0 0 11px; }
.gf-tag { font-size: 0.66rem; font-weight: 900; text-transform: uppercase; letter-spacing: .08em;
    padding: 3px 9px; border-radius: 999px; color: #e6dcc9;
    background: rgba(255,255,255,0.07); border: 1px solid var(--r, rgba(255,255,255,0.18)); }
.gf-tag.is-owned { color: #9af5c6; border-color: rgba(90,220,160,0.5); }
.gf-look-stats { display: flex; flex-direction: column; gap: 1px; margin: 0 0 11px; text-align: left;
    border-radius: 11px; overflow: hidden; background: rgba(0,0,0,0.26); }
.gf-look-stats > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
    padding: 8px 12px; }
.gf-look-stats > div:nth-child(even) { background: rgba(255,255,255,0.035); }
.gf-look-stats dt { margin: 0; font-size: 0.8rem; color: #c3b9a8; text-transform: capitalize; }
.gf-look-stats dd { margin: 0; font-size: 0.92rem; font-weight: 900; color: #fff; font-variant-numeric: tabular-nums; }
.gf-look-flavor { margin: 0 0 8px; font-size: 0.84rem; font-style: italic; color: #d9cbb4; line-height: 1.42; }
.gf-look-note { margin: 0 0 12px; font-size: 0.79rem; color: #9b9080; line-height: 1.45; }
/* ⚠️ THE ARE-YOU-SURE. ValkyrieSylve lost candy to a tap that landed on a row the instant it
   painted. Deliberately a SHEET over the stall rather than an inline toggle on the button: a tap in
   flight cannot land on a control that is somewhere else entirely, and the buttons are far enough
   apart that a second stray tap cannot find Buy either.

   It also states what you will have LEFT, which is the number that actually decides it when the
   currency is capped per day. */
.gf-sure { position: absolute; inset: 0; z-index: 40; display: grid; place-items: center;
    background: rgba(8,5,2,0.78); padding: 20px; }
.gf-sure-card { max-width: 290px; width: 100%; text-align: center; padding: 22px 22px 18px;
    border-radius: 18px; background: linear-gradient(rgba(42,24,8,0.99), rgba(22,12,4,0.99));
    border: 2px solid rgba(240,160,50,0.6); box-shadow: 0 20px 50px rgba(0,0,0,0.8); }
.gf-sure-q { margin: 0; font-size: 0.86rem; color: #e8cfa6; display: flex; align-items: center;
    justify-content: center; gap: 4px; }
.gf-sure-name { display: block; margin: 7px 0 10px; font-size: 1.15rem; line-height: 1.2; color: #ffd98a; }
.gf-sure-left { margin: 0 0 16px; font-size: 0.78rem; color: #b6a184; display: flex; align-items: center;
    justify-content: center; gap: 4px; }
.gf-sure-row { display: flex; gap: 10px; }
.gf-sure-row button { flex: 1; padding: 11px 10px; border-radius: 999px; cursor: pointer; font: inherit;
    font-weight: 700; font-size: 0.88rem; border: 1px solid transparent; }
.gf-sure-no { background: rgba(255,255,255,0.08); color: #cfc0a8; border-color: rgba(255,255,255,0.16); }
.gf-sure-yes { background: linear-gradient(#f5b344, #d98a1e); color: #2a1703; }

.gf-look-buy { display: flex; align-items: center; justify-content: center; gap: 5px; width: 100%;
    padding: 12px; border-radius: 13px; font-size: 0.94rem; font-weight: 900; cursor: pointer;
    background: linear-gradient(180deg, #ffcf6a, #e89a1c); border: none; color: #2a1403;
    font-variant-numeric: tabular-nums; }
.gf-look-buy:disabled { background: rgba(255,255,255,0.07); color: #8b93a0; cursor: default; }
.gf-look-buy:disabled .gf-candy-mark { opacity: 0.62; }
`;
