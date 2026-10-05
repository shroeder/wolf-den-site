"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Haptic } from "@/components/arena/arena-audio.js";
import { Cas } from "@/components/casino/casino-audio.js";

// ── THE COUNTER IS A LADDER ──────────────────────────────────────────────────────────────────────────────
// Luke: "Unlocking things in the casino and vip is going to be based on total amount of gold won lifetime at
// the casino... they are just claimable noe if youve reached milestones."
//
// So this is not a shop and it must not look like one. A shop asks "what can you afford"; a ladder answers
// "what is next", and the whole screen is built around one number going up — lifetime gold won, which only
// ever rises and which nothing can spend down.
//
// ⚠️ THE NEXT RUNG IS THE HEADLINE, NOT THE BALANCE. A shelf of fifteen prices tells you fifteen things and
// therefore nothing. The bar at the top says how far you are from the single nearest thing you have not got,
// and everything below it is in reach order — so the screen always has an answer to the only question
// somebody standing at a counter is actually asking.

const GROUPS = [
    { kind: "pet", title: "The Floor's Own", note: "Each one makes the machines a little kinder." },
    { kind: "unlock", title: "Doors", note: "One-time, and they open things outside this room." },
    { kind: "stat", title: "The Permanent Tracks", note: "Every so many won, for ever." },
    { kind: "chest", title: "The Boxes", note: "Every so many won, for ever." },
    { kind: "vip_pet", title: "Behind the Rope", note: "Trophies. They do nothing, which is the point." },
    { kind: "gem", title: "Sable's Stones", note: null },
    { kind: "recipe", title: "Sable's Pages", note: null },
];

const n = (v) => Number(v || 0).toLocaleString();

export default function Ladder({ onClose }) {
    const [st, setSt] = useState(null);
    const [busy, setBusy] = useState(null);
    const [flash, setFlash] = useState(null);

    const post = useCallback(async (body) => {
        const r = await fetch("/api/marketplace/casino", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        }).catch(() => null);
        return r ? r.json().catch(() => null) : null;
    }, []);

    const load = useCallback(async () => {
        const d = await post({ action: "ladder" });
        if (d?.ok) setSt(d);
    }, [post]);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount (setState is post-await)
    useEffect(() => { load(); }, [load]);

    // What was just taken, held until the player dismisses it. Null the rest of the time.
    const [got, setGot] = useState(null);

    const take = useCallback(async (kind, ref) => {
        if (busy) return;
        setBusy(`${kind}:${ref}`);
        const d = await post({ action: "ladder_claim", kind, ref });
        setBusy(null);
        if (d?.ok) {
            setSt(d);
            // ── THE MOMENT, NOT THE RECEIPT ──────────────────────────────────────────────────────────
            // Luke: "The claim is a huge disservice." Taking a mythic pet printed its name in small text
            // for three seconds and the row quietly vanished. This is the single best thing that happens
            // in the room — somebody won a quarter of a million gold to reach it — so it gets the screen.
            // ⚠️ NOT FOR PETS. The game already throws its own full "NEW PET!" celebration — confetti, the
            // rarity colour, a button through to the animal — fired off the hud-refresh below, and it is
            // better than anything local to this panel because it is the SAME moment the farm and the
            // chests use. A second overlay on top of it would be two celebrations fighting for one tap.
            //
            // (It did not fire for three of these five until today, because those pets were not in the
            // catalogue — the celebration looks up the collectible and silently did nothing. That is a
            // large part of why claiming felt like nothing happened.)
            //
            // Everything else — a chest, a stone, a stat point, a door — has no native moment, and those
            // are exactly the claims that used to print one line of text and vanish.
            const native = kind === "pet" || kind === "vip_pet";
            if (!native) setGot(d.got || { name: d.gave, kind, art: null, rarity: null });
            Cas.coins?.(0.75);
            Haptic.crit?.();
            if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh"));
        } else {
            setFlash(d?.error === "vip_only" ? "That one is behind the rope."
                : d?.error === "nothing_left" ? "You have already learned everything in that band."
                    : "Not yet.");
        }
        setTimeout(() => setFlash(null), 3200);
    }, [busy, post]);

    const won = st?.won ?? 0;
    // ⚠️ THE READY ONES FIRST, ALWAYS. A member owed eight things should not have to hunt for them among
    // thirty rows — and a member owed nothing should see what is closest, not what is cheapest.
    const ready = useMemo(() => (st?.rungs || []).filter((r) => r.ready > 0 && !r.locked), [st]);
    const next = st?.next ?? null;
    const toGo = next ? Math.max(0, next - won) : 0;
    // How far across the gap between the last rung and the next one. Shown as a bar because the number on
    // its own ("418,000 to go") is a wall, and a bar most of the way across is a reason to pull once more.
    const span = next && ready.length === 0 ? next : null;
    const pct = span ? Math.max(2, Math.min(100, Math.round((won / span) * 100))) : 100;

    return (
        <div className="lad" role="dialog" aria-label="The Counter">
            <div className="lad-head">
                <b>The Counter</b>
                <button type="button" className="lad-x" onClick={onClose} aria-label="Step away">✕</button>
            </div>

            <div className="lad-top">
                <span className="lad-lab">Won here, all time</span>
                <strong className="lad-won">{n(won)}</strong>
                {next ? (
                    <>
                        <div className="lad-bar"><span style={{ width: `${pct}%` }} /></div>
                        <span className="lad-next">{n(toGo)} more to the next thing</span>
                    </>
                ) : <span className="lad-next">You have everything this room has.</span>}
            </div>

            {flash ? <div className="lad-flash">{flash}</div> : null}

            {ready.length ? (
                <section className="lad-ready">
                    <h4>Waiting for you</h4>
                    {ready.map((r) => (
                        <button key={`${r.kind}:${r.ref}`} type="button" className="lad-take"
                            disabled={busy === `${r.kind}:${r.ref}`}
                            onClick={() => take(r.kind, r.ref)}>
                            {/* The thing you are about to take, shown on the button that takes it. Same
                                guard as the shelf below: no url, no <img>, because an element with no src
                                draws the broken-image glyph. */}
                            {r.art ? <img src={r.art} alt="" draggable={false} /> : null}
                            <span>{r.name}{r.ready > 1 ? ` ×${r.ready}` : ""}</span>
                            <i>{busy === `${r.kind}:${r.ref}` ? "…" : "Take it"}</i>
                        </button>
                    ))}
                </section>
            ) : null}

            {/* ⚠️ RENDERED BEFORE THE LIST AND POSITIONED OVER IT, so a claim that empties the "waiting
                for you" section cannot reflow the page out from under the celebration. */}
            {got ? (
                <div className={`lad-got${got.rarity ? ` is-${got.rarity}` : ""}`} role="dialog" aria-live="polite"
                    onClick={() => setGot(null)}>
                    <div className="lad-got-card">
                        <span className="lad-got-eyebrow">Added to your collection</span>
                        {got.art ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={got.art} alt="" draggable={false} />
                        ) : <span className="lad-got-glyph" aria-hidden="true" />}
                        <b>{got.name}</b>
                        <button type="button" className="lad-got-x" onClick={() => setGot(null)}>Good</button>
                    </div>
                </div>
            ) : null}

            {GROUPS.map((g) => {
                const rows = (st?.rungs || []).filter((r) => r.kind === g.kind);
                if (!rows.length) return null;
                return (
                    <section key={g.kind} className="lad-group">
                        <h4>{g.title}{g.note ? <i>{g.note}</i> : null}</h4>
                        {rows.map((r) => {
                            const done = r.ready === 0 && r.held > 0 && !r.every;
                            return (
                                <div key={`${r.kind}:${r.ref}`} className={`lad-row${r.ready > 0 ? " is-ready" : ""}${r.locked ? " is-locked" : ""}${done ? " is-done" : ""}`}>
                                    {/* ── THE THING ITSELF ────────────────────────────────────────────
                                        Luke: "Absolutely horrendous, you lost all the amazing sprites and
                                        beauty." The shelf this ladder replaced drew every pet with its real
                                        sprite; the ladder shipped as a column of identical buttons. A screen
                                        whose whole job is to make you want the next rung has to SHOW it.

                                        ⚠️ The <img> is only rendered when the server actually sent a url.
                                        An <img> with no src draws the broken-image glyph, and an SSR 404
                                        beats React to the onError — which is how every card in the game
                                        once ended up wearing one. No art, no element. */}
                                    <span className={`lad-art${r.rarity ? ` is-${r.rarity}` : ""}`}>
                                        {r.art ? <img src={r.art} alt="" draggable={false} loading="lazy" /> : <i aria-hidden="true" />}
                                    </span>
                                    <span className="lad-row-name">
                                        <b>{r.name}</b>
                                        {/* ── CLAIMED, CLAIMABLE, OR NOT YET. ─────────────────────────
                                            Luke: "Not clear if u unlocked or not." Every row used to read
                                            "yours · 0 to go" in the same grey whether you had taken it, were
                                            standing on it, or were nowhere near — three different states
                                            wearing one face. They are now a word each, in their own colour. */}
                                        {r.locked ? <em className="is-rope">behind the rope</em>
                                            : r.ready > 0 ? <em className="is-ready">ready to take{r.ready > 1 ? ` ×${r.ready}` : ""}</em>
                                                : r.held > 0 ? <em className="is-held">{r.every ? `${n(r.held)} taken` : "claimed"}</em>
                                                    : <em className="is-far">{n(r.toGo)} more to go</em>}
                                    </span>
                                    <span className="lad-row-at">
                                        {/* An `every X` rung says its interval; a one-time rung says its height.
                                            Those are different promises and the screen has to say which. */}
                                        {r.every ? `every ${n(r.every)}` : n(r.at)}
                                    </span>
                                </div>
                            );
                        })}
                    </section>
                );
            })}
            <style>{CSS}</style>
        </div>
    );
}

const CSS = `
/* ── THE REVEAL ──────────────────────────────────────────────────────────────────────────────────
   Covers the panel, not the page: the ladder is already inside a dialog and a second full-screen layer
   over the top of it would trap the player behind two closes. */
.lad-got { position: absolute; inset: 0; z-index: 40; display: grid; place-items: center;
    background: rgba(8,6,12,0.86); backdrop-filter: blur(3px); animation: ladGotIn 240ms ease-out both;
    cursor: pointer; }
.lad-got-card { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 22px 26px;
    border-radius: 18px; background: linear-gradient(180deg, rgba(40,32,22,0.96), rgba(18,14,20,0.96));
    border: 1px solid var(--ring, rgba(255,215,94,0.5));
    box-shadow: 0 0 44px var(--glow, rgba(255,215,94,0.30)), inset 0 0 26px rgba(255,255,255,0.05);
    animation: ladGotPop 420ms cubic-bezier(.2,1.5,.4,1) both; }
.lad-got-eyebrow { font-size: 0.64rem; letter-spacing: .16em; text-transform: uppercase; color: #bdb0a0; }
.lad-got-card img { width: 160px; height: 160px; object-fit: contain; display: block;
    filter: drop-shadow(0 6px 16px rgba(0,0,0,0.5)); animation: ladGotFloat 3.2s ease-in-out infinite; }
.lad-got-glyph { width: 110px; height: 110px; border-radius: 999px;
    background: radial-gradient(circle at 40% 35%, rgba(255,215,94,0.5), rgba(255,215,94,0.05) 70%); }
.lad-got-card b { font-size: 1.15rem; color: #ffe7ad; text-align: center; text-wrap: balance; }
.lad-got-x { margin-top: 2px; padding: 8px 22px; border-radius: 999px; border: none; cursor: pointer;
    background: linear-gradient(180deg, #ffd980, #e8a93c); color: #30210a; font-weight: 800;
    letter-spacing: .04em; }
/* The ring takes the rarity, the same palette the shelf frames use. */
.lad-got.is-rare { --ring: rgba(90,170,255,0.6); --glow: rgba(90,170,255,0.30); }
.lad-got.is-epic { --ring: rgba(169,130,255,0.6); --glow: rgba(169,130,255,0.32); }
.lad-got.is-legendary { --ring: rgba(255,215,94,0.7); --glow: rgba(255,215,94,0.34); }
.lad-got.is-mythic { --ring: rgba(255,120,180,0.7); --glow: rgba(255,120,180,0.34); }
.lad-got.is-ascendant { --ring: rgba(120,255,220,0.7); --glow: rgba(120,255,220,0.34); }
@keyframes ladGotIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes ladGotPop { from { opacity: 0; transform: scale(0.82) translateY(10px); }
    to { opacity: 1; transform: none; } }
@keyframes ladGotFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }

.lad { display: flex; flex-direction: column; gap: 10px; color: #f0e6d6; position: relative; }
.lad-head { display: flex; align-items: center; gap: 8px; }
.lad-head b { flex: 1; font-size: 1rem; color: #ffd98a; }
.lad-x { width: 28px; height: 28px; border-radius: 999px; background: rgba(255,255,255,0.08); border: none;
    color: #e8e2d6; font-size: 14px; cursor: pointer; }
/* The one number the whole room is about. Big, because it is the only currency left in here. */
.lad-top { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 14px 12px;
    border-radius: 14px; background: linear-gradient(180deg, rgba(255,190,80,0.13), rgba(255,140,30,0.05));
    border: 1px solid rgba(255,190,80,0.28); }
.lad-lab { font-size: 0.68rem; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; color: #c9a86a; }
.lad-won { font-size: 1.9rem; font-weight: 900; color: #ffd98a; font-variant-numeric: tabular-nums; line-height: 1; }
.lad-bar { width: 100%; max-width: 280px; height: 7px; border-radius: 999px; overflow: hidden;
    background: rgba(0,0,0,0.4); margin-top: 3px; }
.lad-bar span { display: block; height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, #e8961c, #ffe4a0); }
.lad-next { font-size: 0.78rem; color: #c9bda9; font-variant-numeric: tabular-nums; }
.lad-flash { padding: 9px 11px; border-radius: 10px; font-size: 0.85rem; text-align: center;
    background: rgba(90,220,160,0.12); border: 1px solid rgba(90,220,160,0.32); color: #c9f5e2; }
.lad-ready { display: flex; flex-direction: column; gap: 6px; }
.lad-ready h4, .lad-group h4 { display: flex; align-items: baseline; gap: 8px; margin: 4px 2px 2px;
    font-size: 0.72rem; font-weight: 900; text-transform: uppercase; letter-spacing: .09em; color: #ffcf6a; }
.lad-group h4 i { font-style: normal; font-weight: 600; text-transform: none; letter-spacing: 0;
    font-size: 0.72rem; color: #9b9080; }
/* The claim button carries the prize's own picture — it was a row of identical yellow bars, which is the
   least appetising way to present the best moment this screen has. */
.lad-take img { width: 34px; height: 34px; flex: 0 0 34px; object-fit: contain; display: block;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35)); }
.lad-take { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;
    padding: 11px 13px; border-radius: 12px; cursor: pointer; font-size: 0.92rem; font-weight: 800;
    color: #2a1403; background: linear-gradient(180deg, #ffcf6a, #e89a1c); border: none; }
.lad-take i { font-style: normal; font-size: 0.76rem; font-weight: 900; text-transform: uppercase;
    letter-spacing: .07em; opacity: 0.72; }
.lad-group { display: flex; flex-direction: column; gap: 4px; }
/* ── THE ART TILE ────────────────────────────────────────────────────────────────────────────────
   Framed in the pet's own rarity colour, the way the pet is framed everywhere else in the game, so a
   mythic rung reads as a mythic from across the room before you have read a word of it. */
.lad-art { width: 46px; height: 46px; flex: 0 0 46px; border-radius: 10px; overflow: hidden;
    display: grid; place-items: center; background: rgba(255,255,255,0.045);
    border: 1px solid rgba(255,255,255,0.10); }
.lad-art img { width: 100%; height: 100%; object-fit: contain; display: block; }
/* The placeholder for a rung with no object — a track, a door. A dot, not a broken frame. */
.lad-art i { width: 9px; height: 9px; border-radius: 999px; background: rgba(255,255,255,0.18); }
.lad-art.is-rare { border-color: rgba(90,170,255,0.55); box-shadow: inset 0 0 12px rgba(90,170,255,0.18); }
.lad-art.is-epic { border-color: rgba(169,130,255,0.55); box-shadow: inset 0 0 12px rgba(169,130,255,0.20); }
.lad-art.is-legendary { border-color: rgba(255,215,94,0.60); box-shadow: inset 0 0 14px rgba(255,215,94,0.22); }
.lad-art.is-mythic { border-color: rgba(255,120,180,0.60); box-shadow: inset 0 0 14px rgba(255,120,180,0.22); }
.lad-art.is-ascendant { border-color: rgba(120,255,220,0.60); box-shadow: inset 0 0 14px rgba(120,255,220,0.22); }

.lad-row { display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 8px 11px; border-radius: 9px; background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.07); }
.lad-row.is-ready { border-color: rgba(255,207,106,0.55); background: rgba(255,207,106,0.08); }
/* Claimed rows stay legible. At 0.5 the row you had already earned was the HARDEST one on the screen to
   read, which is the opposite of what a trophy shelf is for — the tick is the reward. */
.lad-row.is-done { opacity: 0.82; }
.lad-row.is-locked { opacity: 0.55; border-style: dashed; }
.lad-row-name { font-size: 0.88rem; color: #f0e6d6; display: flex; flex-direction: column; gap: 2px;
    flex: 1 1 auto; min-width: 0; }
.lad-row-name b { font-weight: 600; }
/* One state, one colour. Green = you have it. Gold = go and take it. Grey = not yet. Violet = the rope. */
.lad-row-name em { font-style: normal; font-size: 0.68rem; letter-spacing: .02em; }
.lad-row-name em.is-held { color: #9af5c6; }
.lad-row-name em.is-ready { color: #ffcf6a; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
.lad-row-name em.is-far { color: #7f7667; }
.lad-row-name em.is-rope { color: #c6a6ff; }
.lad-row-at { display: flex; flex-direction: column; align-items: flex-end; gap: 1px;
    font-size: 0.72rem; color: #9b9080; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lad-row-at b { font-size: 0.72rem; color: #ffcf6a; text-transform: uppercase; letter-spacing: .06em; }
.lad-row-at i { font-style: normal; font-size: 0.7rem; color: #7f7667; }
`;
