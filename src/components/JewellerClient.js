"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Gi from "react-icons/gi";

import ItemArt from "@/components/ItemArt";
// The house synth. It is named for the arena because that is where it was built, but there is nothing
// arena-shaped in it — one AudioContext, three buses, one mute switch — and a second copy for this bench
// would be a second context to leak and a second mute nobody can find.
import { Haptic, Sfx, unlock } from "@/components/arena/arena-audio.js";
import { MAX_SOCKETS } from "@/lib/marketplace/gems.js";

// ── THE JEWELCUTTER ──────────────────────────────────────────────────────────────────────────────────────────
// Two operations, and the screen is honest that it is only two: CUT a socket into a piece you intend to keep,
// then SET a gem into it. Everything else on here is there to make those two decisions legible — what a gem
// pays, what a socket costs on this particular piece, and what pulling one back out will cost you.
//
// Laid out gem-first rather than gear-first: you come here because something dropped, and the question in your
// head is "what do I put this in", not "which of my items has a hole".
const Icon = ({ name, className }) => {
    const C = Gi[name] || Gi.GiCutDiamond;
    return <C className={className} aria-hidden="true" />;
};

// A jewel, painted. Falls back to the glyph if the art is ever missing, so a sprite that failed to generate
// costs a picture rather than the whole card.
function GemArt({ gem, className = "" }) {
    const [broken, setBroken] = useState(false);
    if (!gem?.art || broken) return <Icon name="GiCutDiamond" className={className} />;
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={gem.art} alt="" draggable="false" onError={() => setBroken(true)} />;
}

const RARITY = { common: "#c9d1d9", rare: "#6bb8ff", epic: "#c98bff", legendary: "#ffb648", mythic: "#ff6b8a",
    ascendant: "#ff8ad8", eternal: "#ffce6b" };
import { STAT_SHORT as STAT, describeStats } from "@/lib/marketplace/items.js";
const money = (n) => (Number(n) || 0).toLocaleString();
const describe = (stats) => describeStats(stats);

export default function JewellerClient({ initial }) {
    const [st, setSt] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [picked, setPicked] = useState(null);       // the gem in your hand
    const [msg, setMsg] = useState(null);
    const [confirm, setConfirm] = useState(null);     // { itemId, idx } — pulling one back out
    // ── THE BENCH RUNS WHILE YOU WORK ────────────────────────────────────────────────────────────────────
    // `working` drives the wheel: it spins up, throws sparks and settles. `reveal` is what the work produced.
    const [working, setWorking] = useState(null);     // "cut" | "set"
    const [reveal, setReveal] = useState(null);       // { piece, gem, before, after }
    const timers = useRef([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };

    async function act(body) {
        if (busy) return null;
        setBusy(true);
        setMsg(null);
        const r = await fetch("/api/marketplace/jeweller", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
        setBusy(false);
        if (!r) { setMsg("That did not go through — try again."); return null; }
        if (r.unlocked) setSt(r);
        if (r.error) {
            setMsg(r.error === "not_enough_gold" ? `Not enough gold — that socket costs ${money(r.cost)}.`
                : r.error === "already_socketed" ? "That piece already has its socket."
                : r.error === "socket_full" ? "Something is already set in there."
                : r.error === "no_gem" ? "You do not hold that gem."
                : "That did not go through — try again.");
        }
        return r;
    }

    if (!st?.unlocked) return <section className="card"><p className="muted">The bench is closed.</p></section>;

    const gems = st.gems || [];
    const pieces = st.pieces || [];

    return (
        <div className="stack jw">
            {/* ── THE BENCH ── the Forge has an anvil you hit; this has a wheel that turns. It idles slowly
                so the room is alive while you are deciding, and spins up with sparks off the stone whenever
                the bench is actually doing something. */}
            <section className={`card jw-head${working ? ` is-working is-${working}` : ""}`}>
                <div className="jw-bench" aria-hidden="true">
                    <span className="jw-wheel">
                        <i /><i /><i /><i /><i /><i />
                    </span>
                    <span className="jw-anvil" />
                    {working ? (
                        <span className="jw-sparks">
                            {Array.from({ length: 14 }).map((_, i) => (
                                <b key={i} style={{ "--a": `${-20 - i * 11}deg`, "--d": `${40 + (i % 5) * 26}px`,
                                    animationDelay: `${(i % 7) * 0.05}s` }} />
                            ))}
                        </span>
                    ) : null}
                </div>
                <h1>The Jewelcutter</h1>
                <p className="muted">
                    A socket is the reason to keep a piece you already like. Cut one — once, permanently, for a
                    price that scales with what the piece is worth — then set a jewel into it.
                </p>
                <span className="jw-gold">{money(st.gold)} gold</span>
            </section>

            {msg ? <p className="jw-msg">{msg}</p> : null}

            {/* ── YOUR JEWELS ── the reason you are here, so they are the first thing on the screen. */}
            <section className="card">
                <div className="jw-sec-head"><b>Your jewels</b><em>{gems.length ? "Pick one, then choose where it goes" : null}</em></div>
                {gems.length ? (
                    <div className="jw-gems">
                        {gems.map((g) => (
                            <div key={g.id} className="jw-gemwrap">
                            <button type="button"
                                className={`jw-gem${picked === g.id ? " is-on" : ""}${g.secret ? " is-secret" : ""}`}
                                style={{ "--c": g.color }}
                                onClick={() => setPicked((cur) => (cur === g.id ? null : g.id))}>
                                <span className="jw-gem-face" aria-hidden="true"><GemArt gem={g} /></span>
                                <b>{g.name}</b>
                                <em>{describe(g.stats)}</em>
                                {g.count > 1 ? <i className="jw-gem-n">×{g.count}</i> : null}
                            </button>
                            {/* ── FUSING ── three of a kind make one of the tier above, which is what stops the
                                bottom tiers being litter: a Chipped Ruby is not worth setting into anything by
                                the time you have real gear, but nine of them are a Polished one. Only offered
                                when you are actually holding three — a greyed-out button you can never press
                                is a worse explanation than no button. */}
                            {g.canFuse ? (
                                <button type="button" className="jw-fuse" disabled={busy}
                                    style={{ "--c": g.color }}
                                    onClick={async () => {
                                        unlock(); Sfx.cut(); Haptic.tap();
                                        setWorking("fuse");
                                        const r = await act({ action: "fuse", gemId: g.id });
                                        setWorking(null);
                                        if (r?.ok) { Sfx.gemSet(g.tier + 1); Haptic.gemSet(g.tier + 1); }
                                    }}>
                                    Fuse ×{g.fuseCount}<i>→ {g.fuseInto?.name}</i>
                                </button>
                            ) : g.fuseInto ? (
                                <span className="jw-fuse-hint">{g.fuseCount} make a {g.fuseInto.name}</span>
                            ) : null}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="muted">
                        None yet. They come out of the mine, and only out of the mine — the deeper you go, the
                        better the rock.
                    </p>
                )}
            </section>

            {/* ── YOUR GEAR ── sockets first, because a piece with a hole in it is the one you came to fill. */}
            <section className="card">
                <div className="jw-sec-head">
                    <b>Your gear</b>
                    <em>{MAX_SOCKETS === 1 ? "One socket per piece" : `Up to ${MAX_SOCKETS} sockets per piece`}</em>
                </div>
                <div className="jw-pieces">
                    {pieces.map((p) => {
                        const socket = p.sockets[0] || null;
                        const gem = socket?.gem || null;
                        return (
                            <div key={p.id} className="jw-piece" style={{ "--rar": RARITY[p.rarity] || "#c9d1d9" }}>
                                {/* The item's own painted art, through the same component every other gear grid
                                    in the game uses — so a piece looks the same here as it does in your bag. */}
                                <ItemArt id={p.id} icon={p.icon} className="jw-piece-ico" alt=""
                                    gem={gem} socket={Boolean(socket)} />
                                <div className="jw-piece-body">
                                    <b>{p.name}{p.enhanceLevel ? <i className="jw-enh">+{p.enhanceLevel}</i> : null}</b>
                                    <em>
                                        {p.slot.replace(/_/g, " ")} · {p.rarity}
                                        {p.equipped ? <b className="jw-worn">worn</b> : null}
                                    </em>
                                    {/* What the piece is worth AS IT FIGHTS — base plus anything the Forge has
                                        already put into it. Socketing is a decision about a specific item, and
                                        you cannot make it against a name and a rarity alone. */}
                                    {p.statLine ? <span className="jw-stats">{p.statLine}</span> : null}
                                    {gem ? <span className="jw-set" style={{ "--c": gem.color }}>{gem.name} — {describe(gem.stats)}</span> : null}
                                </div>
                                <div className="jw-piece-go">
                                    {!socket ? (
                                        <button type="button" className="jw-btn" disabled={busy || st.gold < p.cost}
                                            onClick={() => {
                                                unlock(); Sfx.cut(); Haptic.cut();
                                                setWorking("cut");
                                                later(() => setWorking(null), 900);
                                                act({ action: "cut", itemId: p.id });
                                            }}>
                                            Cut a socket<i>{money(p.cost)} gold</i>
                                        </button>
                                    ) : !gem ? (
                                        <button type="button" className="jw-btn is-set" disabled={busy || !picked}
                                            onClick={async () => {
                                                const chosen = gems.find((g) => g.id === picked) || null;
                                                const before = p.stats || {};
                                                unlock(); Sfx.cut(); Haptic.tap();
                                                setWorking("set");
                                                const r = await act({ action: "set", itemId: p.id, gemId: picked, idx: socket.idx });
                                                setWorking(null);
                                                if (r?.ok && chosen) {
                                                    // The sound lands with the CARD, not with the tap — the tap is
                                                    // the wheel, this is the stone going home.
                                                    Sfx.gemSet(chosen.tier); Haptic.gemSet(chosen.tier);
                                                    setPicked(null);
                                                    setReveal({ piece: p, gem: chosen, before });
                                                }
                                            }}>
                                            {picked ? "Set the jewel" : "Empty socket"}
                                            {picked ? null : <i>pick a jewel above</i>}
                                        </button>
                                    ) : confirm?.itemId === p.id ? (
                                        <div className="jw-confirm">
                                            {/* TWO WAYS OUT, and the difference is the decision. Both said before
                                                the press: pay and the jeweller cuts it free intact, or break it
                                                and it is gone. Setting a jewel has to cost something or a socket
                                                is a slot you shuffle per opponent. */}
                                            <p>Take the <b>{gem.name}</b> out?</p>
                                            <button type="button" className="jw-btn" disabled={busy || st.gold < (socket.extractCost || 0)}
                                                onClick={() => {
                                                    unlock(); Sfx.cut(); Haptic.cut();
                                                    setConfirm(null);
                                                    act({ action: "pull", itemId: p.id, idx: socket.idx, keep: true });
                                                }}>
                                                Cut it free<i>{money(socket.extractCost)} gold · you keep it</i>
                                            </button>
                                            <button type="button" className="jw-btn is-bad" disabled={busy}
                                                onClick={() => {
                                                    unlock(); Sfx.gemBreak(); Haptic.gemBreak();
                                                    setConfirm(null);
                                                    act({ action: "pull", itemId: p.id, idx: socket.idx });
                                                }}>
                                                Break it out<i>free · it shatters</i>
                                            </button>
                                            <button type="button" className="jw-btn is-quiet" onClick={() => setConfirm(null)}>Leave it</button>
                                        </div>
                                    ) : (
                                        <button type="button" className="jw-btn is-quiet" disabled={busy}
                                            onClick={() => setConfirm({ itemId: p.id, idx: socket.idx })}>
                                            Take it out
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {!pieces.length ? <p className="muted">Nothing to work on yet — find some gear first.</p> : null}
                </div>
            </section>

            {/* ── WHAT YOU JUST MADE ── the moment the stone goes home. The item is drawn at size with the
                jewel dropping into it, the room floods with the gem's own colour, and then the numbers arrive
                one line at a time: what the piece was, what the jewel gave it, what it is now. */}
            {reveal ? createPortal((
                <div className="jwr-scrim" role="dialog" aria-modal="true"
                    aria-label={`${reveal.gem.name} set into ${reveal.piece.name}`}
                    style={{ "--c": reveal.gem.color }}
                    onClick={() => setReveal(null)}>
                    <span className="jwr-rays" aria-hidden="true" />
                    <span className="jwr-flash" aria-hidden="true" />
                    <div className="jwr-card" onClick={(e) => e.stopPropagation()}>
                        <div className="jwr-kicker">Set</div>
                        <div className="jwr-stage" aria-hidden="true">
                            <ItemArt id={reveal.piece.id} icon={reveal.piece.icon} className="jwr-item" alt="" />
                            {/* The stone falls into the piece and seats with a ring. */}
                            <span className="jwr-gem"><GemArt gem={reveal.gem} /></span>
                            <span className="jwr-ring" />
                            <span className="jwr-ring is-two" />
                            <span className="jwr-shards">
                                {Array.from({ length: 12 }).map((_, i) => (
                                    <b key={i} style={{ "--a": `${i * 30}deg`, "--d": `${58 + (i % 4) * 22}px`,
                                        animationDelay: `${0.42 + (i % 5) * 0.03}s` }} />
                                ))}
                            </span>
                        </div>
                        <h2 className="jwr-name">{reveal.piece.name}</h2>
                        <p className="jwr-gemname">{reveal.gem.name}</p>
                        <div className="jwr-rows">
                            {Object.entries(reveal.gem.stats).map(([k, v], i) => {
                                const was = Number(reveal.before?.[k] || 0);
                                return (
                                    <p key={k} className="jwr-row" style={{ animationDelay: `${0.55 + i * 0.11}s` }}>
                                        <i>{STAT[k] || k}</i>
                                        <s>{was}</s>
                                        <em>→</em>
                                        <b>{was + v}</b>
                                        <u>+{v}</u>
                                    </p>
                                );
                            })}
                        </div>
                        <button type="button" className="jw-btn jwr-go" onClick={() => setReveal(null)}>Back to the bench</button>
                    </div>
                </div>
            ), document.body) : null}
        </div>
    );
}
