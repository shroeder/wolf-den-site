"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import MiningMinigame from "@/components/MiningMinigame";

// ── THE MINE (owner-gated) ───────────────────────────────────────────────────────────────────────────────────
// PROSPECT to surface a random seam, then swing at it on the same timing bar as the Forge anvil and the
// Treasure Golem. There is no walking: steering a hero across a cave to reach a rock was motion without
// meaning, and every tap it cost came out of the part that's actually a game — the timing.
//
// Ore smelts into forge parts, and the smelt is shown as a SEQUENCE rather than a toast, because "my ore
// became something the Forge wants" is the payoff the whole feature is built on.

const SWEEP_MS = 900;
const GRADE_CD = { pixel: 700, perfect: 850, great: 1050, good: 1300, miss: 1600 };
const CD_DEFAULT = 1600;

const money = (n) => Number(n || 0).toLocaleString();
// NO EMOJI. They are the OS's artwork, not ours, and they render differently on every device — in the middle
// of hand-painted game art they read as borrowed. Everything here is either a generated sprite or a Gi glyph.
// Every kind of thing the mine hands you has its own painted sprite. A found ITEM uses its own real art when
// we have it, so "a piece of gear" looks like the actual piece of gear.
const KIND_ART = {
    gold: "/images/mining/icon-coins.png",
    chest: "/images/mining/icon-chest.png",
    gear: "/images/mining/icon-gear.png",
    consumable: "/images/mining/icon-potion.png",
};
const KindIcon = ({ kind, art, className }) => <Img src={art || KIND_ART[kind] || KIND_ART.gold} className={className} fallback="" />;

const PART_NAME = { 1: "Cinder Scrap", 2: "Iron Filings", 3: "Tempered Steel", 4: "Mythril Dust", 5: "Emberheart Shard" };

let _ac = null;
const ac = () => { if (typeof window === "undefined") return null; try { _ac = _ac || new (window.AudioContext || window.webkitAudioContext)(); if (_ac.state === "suspended") _ac.resume(); return _ac; } catch { return null; } };
function clink(strength = 1) {
    const a = ac(); if (!a) return;
    try {
        const o = a.createOscillator(), g = a.createGain();
        o.type = "square"; o.frequency.setValueAtTime(220 + 520 * strength, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(90, a.currentTime + 0.16);
        g.gain.setValueAtTime(0.09 * strength + 0.03, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.2);
        o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.22);
    } catch { /* audio is a bonus */ }
}

const Img = ({ src, alt = "", className, fallback }) => {
    const [bad, setBad] = useState(false);
    if (bad || !src) return <span className={className} aria-hidden="true">{fallback}</span>;
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={src} alt={alt} draggable="false" onError={() => setBad(true)} />;
};

export default function MiningClient({ initial }) {
    const [state, setState] = useState(initial);
    const [msg, setMsg] = useState(null);
    const [crack, setCrack] = useState(null);
    const [smelting, setSmelting] = useState(null); // { stage, ore, parts, partTier, oreArt }
    const [busy, setBusy] = useState(false);
    const [floats, setFloats] = useState([]);
    const [shake, setShake] = useState(0);
    const [tab, setTab] = useState("survey");
    const [breaking, setBreaking] = useState(false); // the swing minigame is up
    const [reveal, setReveal] = useState(null); // the whole face, shown after you commit // mine | smelt — two halves of the feature, like the other systems
    const floatId = useRef(0);

    const post = useCallback(async (body) => {
        const r = await fetch("/api/marketplace/mining", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).catch(() => null);
        return r ? await r.json().catch(() => null) : null;
    }, []);
    const say = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2400); };

    // ── THE DESCENT ── push-your-luck. Start a trip, keep going, or climb out with what you have.
    const [card, setCard] = useState(null);      // the last thing the tunnel turned up
    const [wrap, setWrap] = useState(null);      // surfaced / collapsed summary

    const startTrip = async () => {
        if (busy) return;
        setBusy(true); setCard(null); setWrap(null);
        const r = await post({ action: "trip" });
        setBusy(false);
        if (r?.unlocked && r?.ok !== false) setState(r);
        else say(r?.error === "no_trips" ? "No trips left today — three a day." : r?.error === "run_in_progress" ? "You're already down there." : "Couldn't start.");
    };

    const goDeeper = async () => {
        if (busy) return;
        setBusy(true);
        const r = await post({ action: "descend" });
        setBusy(false);
        if (!r?.ok) { say("Couldn't go deeper."); return; }
        setState(r);
        if (r.collapsed) {
            setCard(null);
            setWrap({ collapsed: true, depth: r.depth, lost: r.lost, seam: r.seam });
            clink(0.2);
            try { navigator.vibrate?.([40, 60, 40, 60, 120]); } catch { /* no haptics */ }
        } else {
            setCard({ ...r.found, label: r.card?.label, depth: r.depth, k: Date.now() });
            clink(r.found?.kind === "gear" || r.found?.kind === "chest" ? 1 : r.found?.kind === "nothing" ? 0.2 : 0.6);
        }
    };

    const surface = async () => {
        if (busy) return;
        setBusy(true);
        const r = await post({ action: "surface" });
        setBusy(false);
        if (!r?.ok) { say("Couldn't climb out."); return; }
        setState(r);
        setCard(null);
        setWrap({ collapsed: false, paid: r.paid || [], seam: r.seam });
        clink(1);
    };

    const onSwing = useCallback(async (d) => {
        const r = await post({ action: "swing", nodeId: state.node?.id, dist: d });
        if (!r?.ok) {
            if (r?.error === "out_of_swings") say("You're out of swings for today.");
            else if (r?.error === "node_gone") { say("That seam collapsed — find another."); prospect(); }
            else if (r?.error !== "too_fast") say("That swing didn't land.");
            return r;
        }
        clink(r.grade === "pixel" ? 1 : r.grade === "perfect" ? 0.8 : r.grade === "great" ? 0.6 : 0.35);
        setShake((n) => n + 1);
        const id = (floatId.current += 1);
        setFloats((f) => [...f.slice(-5), { id, dmg: r.damage, grade: r.grade }]);
        setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 900);
        setState((s) => ({
            ...s,
            swings: { ...s.swings, left: r.swingsLeft, used: (s.swings?.allowance ?? 0) - r.swingsLeft },
            node: s.node ? { ...s.node, hp: r.hp, pct: r.pct } : null,
        }));
        if (r.cracked) {
            setCrack(r.cracked);
            try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* no window */ }
            const fresh = await fetch("/api/marketplace/mining", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
            if (fresh?.unlocked) setState((s) => ({ ...fresh, node: s.node ? { ...s.node, hp: 0, pct: 0 } : null }));
        }
        return r;
    }, [post, state.node?.id]);

    // SMELTING is played, not pressed. Opening the furnace starts the heat climbing; the pour is yours to time.
    const [forge, setForge] = useState(null); // { tier, stack } while the heat game is up
    const smelt = (tier) => {
        const stack = (state.ore || []).find((o) => o.tier === tier);
        if (!stack?.canSmelt || smelting || forge) return;
        setForge({ tier, stack });
    };

    // The pour landed. Send the heat we read and play the result back.
    const pour = async (heat, stack) => {
        setForge(null);
        setSmelting({ stage: "load", oreArt: stack.art, oreName: stack.name, color: stack.color, partTier: stack.partTier, parts: stack.canSmelt, ore: stack.canSmelt * stack.smeltCost });
        const r = await post({ action: "smelt", tier: stack.tier, batches: stack.canSmelt, heat });
        setTimeout(() => setSmelting((v) => (v ? { ...v, stage: "burn" } : v)), 420);
        setTimeout(() => {
            if (r?.unlocked && r?.ok !== false) {
                setState(r);
                setSmelting((v) => (v ? { ...v, stage: "done", result: r.smelted } : v));
                clink(r.smelted?.band === "perfect" ? 1 : r.smelted?.band === "hot" ? 0.7 : 0.35);
                try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* no window */ }
            } else { setSmelting(null); say(r?.error === "not_enough_ore" ? "Not enough ore." : "Couldn't smelt that."); }
        }, 1400);
    };

    const upgrade = async (track) => {
        if (busy) return;
        setBusy(true);
        const r = await post({ action: "upgrade", track });
        setBusy(false);
        if (r?.unlocked) setState(r);
        else say(r?.error === "not_enough_gold" ? "Not enough gold." : r?.error === "maxed" ? "Already at max." : "Couldn't upgrade.");
    };

    const s = state;
    const node = s.node;
    const swingsLeft = 1; // swings are unmetered now; the TRIP is the budget
    // Nothing to swing at, no wall read, and swings to spend — i.e. the player can act but has no seam. This is
    // the "why can't I mine?" state, and it's what the Survey nudges key off.
    const needsSurvey = !s.run && !(node && node.pct > 0) && (s.trips?.left ?? 0) > 0;
    const lvls = s.stats?.upgradeLevels ?? 0;

    return (
        <section className="card mine-wrap">
            <div className="mine-top">
                <span className="mine-title"><Img src="/images/mining/pick-iron.png" className="mine-title-ico" fallback="" /> The Mine</span>
                <span className="mine-sub">owner preview · {s.trips?.left ?? 0}/{s.trips?.max ?? 3} trips today</span>
                {needsSurvey && tab === "mine" ? (
                    <button type="button" className="mine-nudge" onClick={() => { setTab("survey"); startTrip(); }}>
                        No seam yet — head down →
                    </button>
                ) : null}
            </div>

            {/* Two halves, two tabs — the same shape fishing and the forge use. */}
            <div className="mine-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "survey"} className={tab === "survey" ? "is-on" : ""} onClick={() => setTab("survey")}>
                    <Img src={s.lantern?.sprite} className="mine-tab-ico" fallback="" /> <span>Descend</span>
                    {/* Badge the strikes you can still spend — or a plain "!" when there's nothing to mine and
                        no face read, because that's the state where a player is stuck without knowing why. */}
                    {s.run ? <span className="mine-tab-badge">{s.run.depth}</span> : s.trips?.left ? <span className="mine-tab-badge">{s.trips.left}</span> : null}
                </button>
                <button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "is-on" : ""} onClick={() => setTab("mine")}>
                    <Img src={s.pick?.sprite} className="mine-tab-ico" fallback="" /> <span>Mine</span>
                </button>
                <button type="button" role="tab" aria-selected={tab === "smelt"} className={tab === "smelt" ? "is-on" : ""} onClick={() => setTab("smelt")}>
                    <Img src={s.furnace?.sprite} className="mine-tab-ico" fallback="" /> <span>Smelt</span>
                    {s.oreTotal ? <span className="mine-tab-badge">{s.oreTotal}</span> : null}
                </button>
            </div>

            {tab === "survey" ? (
            <>
            <div className="mine-face is-survey">
                <div className="mine-face-bg is-survey" aria-hidden="true" />
                {s.run ? (
                    <>
                        <div className="mine-depth">DEPTH {s.run.depth}</div>
                        {card ? (
                            <div className="mine-card" key={card.k}>
                                <span className="mine-card-lab">{card.label}</span>
                                {card.kind === "encounter" ? (
                                    <><b style={{ color: "#ff9a8a" }}>{card.title}</b><em>{card.body}</em></>
                                ) : card.kind === "nothing" ? (
                                    <><b className="muted">Nothing</b><em>Just rock.</em></>
                                ) : card.kind === "gold" ? (
                                    <><b style={{ color: "#ffd75e" }}>{money(card.n)} gold</b><em>Into the bag.</em></>
                                ) : card.kind === "ore" ? (
                                    <><Img src={card.art} className="mine-card-art" fallback="◆" /><b style={{ color: card.color }}>{card.name} ×{card.n}</b></>
                                ) : card.kind === "seam" ? (
                                    <><Img src={card.art} className="mine-card-art" fallback="◆" /><b style={{ color: card.color }}>{card.name}</b><em>The seam you'll work gets better.</em></>
                                ) : card.kind === "gear" ? (
                                    <><b style={{ color: "#b061ff" }}>Something buried</b><em>You won't know what until you're out.</em></>
                                ) : card.kind === "chest" ? (
                                    <><b style={{ color: "#ffd75e" }}>A strongbox</b><em>Sealed. Carry it up.</em></>
                                ) : (
                                    <><b>An old cache</b><em>Supplies, by the feel of it.</em></>
                                )}
                            </div>
                        ) : <div className="mine-card is-idle"><em>The tunnel goes on.</em></div>}
                        <div className="mine-survey-hud">
                            carrying <b>{s.run.haul.length}</b> · next step <b style={{ color: s.run.risk >= 35 ? "#ff8f9a" : s.run.risk >= 18 ? "#ffcf6a" : "#8fe39a" }}>{s.run.risk}%</b> collapse
                        </div>
                    </>
                ) : (
                    <div className="mine-face-cta">
                        <Img src={s.lantern?.sprite} className="mine-empty-pick" fallback="" />
                        <p>{(s.trips?.left ?? 0) > 0 ? "The tunnel mouth." : "No trips left today."}</p>
                        <span className="muted">{(s.trips?.left ?? 0) > 0
                            ? "Go as deep as you dare. Everything you find is only yours once you climb out."
                            : "Three descents a day. Back tomorrow."}</span>
                    </div>
                )}
                {msg ? <div className="mine-msg">{msg}</div> : null}
            </div>

            {!s.run ? (
                <button type="button" className="mine-prospect is-big" onClick={startTrip} disabled={busy || (s.trips?.left ?? 0) <= 0}>
                    {(s.trips?.left ?? 0) > 0 ? <><Img src="/images/mining/lantern-2.png" className="mine-btn-ico" fallback="" /> Head down the tunnel <em>{s.trips.left} of {s.trips.max} trips left today</em></> : "No trips left today"}
                </button>
            ) : null}

            {s.run ? (
                <>
                    <div className="mine-haul">
                        {s.run.haul.length ? s.run.haul.map((h, i) => (
                            <span key={i} className="mine-haul-chip" title={h.name || h.kind}>
                                {h.art ? <Img src={h.art} className="mine-haul-art" fallback="◆" /> : <KindIcon kind={h.kind} art={h.art} className="mine-haul-art" />}
                                {h.n ? <em>×{h.n}</em> : null}
                            </span>
                        )) : <span className="muted" style={{ fontSize: 12 }}>Bag empty. Everything is still down here.</span>}
                    </div>
                    <div className="mine-choice">
                        <button type="button" className="mine-prospect" onClick={goDeeper} disabled={busy}><Img src="/images/mining/pick-iron.png" className="mine-btn-ico" fallback="" /> Deeper <em>{s.run.risk}% risk</em></button>
                        <button type="button" className="mine-prospect is-ghost" onClick={surface} disabled={busy}><Img src="/images/mining/lantern-2.png" className="mine-btn-ico" fallback="" /> Climb out with {s.run.haul.length}</button>
                    </div>
                    <p className="mine-hint">Deeper rock hides better things — and the roof gets worse. Climb out and the bag is yours; push too far and it isn&rsquo;t.</p>
                </>
            ) : null}

            {/* THE LANTERN — the surveying tool, then the levers that improve it. */}
            <div className="mine-panel">
                <div className="mine-pickhead">
                    <div className="mine-pickart is-lantern"><Img src={s.lantern?.sprite} className="mine-pickart-img" fallback="" /></div>
                    <div className="mine-pickbody">
                        <b>{s.lantern?.name}</b>
                        {s.lantern?.nextName
                            ? <em>{s.lantern.nextName} at {s.lantern.nextAt} upgrades · you have {s.surveyLevels ?? 0}</em>
                            : <em>Fully lit — every descent upgrade bought.</em>}
                        {s.lantern?.nextAt ? (
                            <span className="mine-pickbar"><span style={{ width: `${Math.min(100, ((s.surveyLevels ?? 0) / s.lantern.nextAt) * 100)}%` }} /></span>
                        ) : null}
                    </div>
                </div>
                <div className="sail-upgrades is-boat" style={{ marginTop: 12 }}>
                    {(s.surveyTracks || []).map((t) => <UpgCard key={t.key} t={t} gold={s.gold} busy={busy} onBuy={() => upgrade(t.key)} />)}
                </div>
            </div>
            </>
            ) : tab === "mine" ? (
            <>
            {/* ── THE SEAM ── the whole screen is the rock you're working. */}
            <div className={`mine-face${node ? "" : " is-empty"}`} key={node?.id || "none"}>
                <div className="mine-face-bg" aria-hidden="true" />
                {node ? (
                    <>
                        <div className="mine-rock" style={{ "--ore": node.color, animation: shake ? "mineHit .18s ease" : undefined }} key={shake}>
                            <Img src={node.art} className="mine-rock-img" fallback="" />
                        </div>
                        <div className="mine-seam-head">
                            <b style={{ color: node.color }}>{node.name}</b>
                            <span className="muted">smelts to {PART_NAME[node.partTier]}</span>
                        </div>
                        <div className="mine-hpbar"><span style={{ width: `${node.pct}%`, background: node.color }} /></div>
                        <div className="mine-hpnum">{node.pct}% left{node.mySwings ? ` · ${node.mySwings} swing${node.mySwings === 1 ? "" : "s"} in` : ""}</div>
                        {floats.map((f) => <span key={f.id} className={`mine-float is-${f.grade}`}>{f.dmg}</span>)}
                    </>
                ) : (
                    // NO SEAM. This is the one place a miner gets stuck — they came to swing, there's nothing
                    // to swing at, and nothing here used to explain that a seam comes from the Survey tab.
                    // So: say what's missing, say where it comes from, and put the door right here.
                    <div className="mine-empty">
                        <Img src={s.lantern?.sprite} className="mine-empty-pick" fallback="" />
                        {s.run ? (
                            <>
                                <p>You&rsquo;re still down the tunnel.</p>
                                <span className="muted">Climb out and the seam you found comes back here with you.</span>
                                <button type="button" className="mine-prospect" onClick={() => setTab("survey")}>
                                    <Img src="/images/mining/lantern-2.png" className="mine-btn-ico" fallback="" /> Back to the tunnel
                                </button>
                            </>
                        ) : swingsLeft <= 0 ? (
                            <>
                                <p>No trips left today.</p>
                                <span className="muted">Three descents a day. They come back tomorrow.</span>
                            </>
                        ) : (
                            <>
                                <p>Nothing to swing at yet.</p>
                                <span className="muted">Seams come from the tunnel: descend, climb out, and whatever you found is waiting here.</span>
                                <button type="button" className="mine-prospect" onClick={() => { setTab("survey"); if (!s.run) startTrip(); }}>
                                    <Img src="/images/mining/lantern-2.png" className="mine-btn-ico" fallback="" /> Head down the tunnel
                                </button>
                            </>
                        )}
                    </div>
                )}
                {msg ? <div className="mine-msg">{msg}</div> : null}
            </div>

            {/* THE LADDER — what this seam pays, shown BEFORE you swing. Straight from the Kitchen: the reward
                isn't a surprise, how well you dig is. */}
            {node && node.pct > 0 ? (
                <div className="mine-ladder">
                    <p className="mine-ladder-intro">
                        <b>How well you swing decides what comes out.</b> Your average timing across this seam picks the rung.
                        {node.quality != null ? <> Right now you&rsquo;re digging at <b>{node.quality}%</b>.</> : null}
                    </p>
                    {[...(node.ladder || [])].reverse().map((r) => (
                        <div key={r.rung} className={`mine-rung is-${r.key}${node.currentRung === r.rung ? " is-here" : ""}`}>
                            <span className="mine-rung-n">{r.rung}</span>
                            <span className="mine-rung-copy"><b>{r.label}</b><em>{r.blurb}</em></span>
                            <span className="mine-rung-pay">
                                <Img src={node.art} className="mine-rung-ore" fallback="" />
                                <b>×{r.ore}</b>
                            </span>
                        </div>
                    ))}
                    <p className="mine-ladder-foot">Plus <b>{money(node.gold)}</b> gold and <b>{money(node.xp)}</b> XP on the crack, whatever the rung.</p>
                </div>
            ) : null}

            {node && node.pct > 0 ? (
                <button type="button" className="mine-prospect" onClick={() => setBreaking(true)} disabled={busy}>
                    <Img src="/images/mining/pick-iron.png" className="mine-btn-ico" fallback="" /> Break the seam
                </button>
            ) : null}

            {/* ── THE PICKAXE ── the tool you've earned, then the levers that improve it. */}
            <div className="mine-panel">
                <div className="mine-pickhead">
                    <div className="mine-pickart"><Img src={s.pick?.sprite} className="mine-pickart-img" fallback="" /></div>
                    <div className="mine-pickbody">
                        <b>{s.pick?.name}</b>
                        {s.pick?.nextName
                            ? <em>{s.pick.nextName} at {s.pick.nextAt} upgrades · you have {lvls}</em>
                            : <em>Fully forged — every upgrade bought.</em>}
                        {s.pick?.nextAt ? (
                            <span className="mine-pickbar"><span style={{ width: `${Math.min(100, (lvls / s.pick.nextAt) * 100)}%` }} /></span>
                        ) : null}
                    </div>
                </div>
                {/* The same card the boat and the forge use — accent stripe, level bar, now → next. */}
                <div className="sail-upgrades is-dig" style={{ marginTop: 12 }}>
                    {(s.tracks || []).map((t) => <UpgCard key={t.key} t={t} gold={s.gold} busy={busy} onBuy={() => upgrade(t.key)} />)}
                </div>
            </div>

            <p className="mine-hint">Find a seam, then time the marker to the middle — same bands as the anvil and the golem. Clean hits chain for more damage.</p>
            </>
            ) : (
            <>
            {/* ── THE SMELTERY ── your actual furnace, standing in the room. */}
            <div className="mine-face is-smelt">
                <div className="mine-face-bg is-smelt" aria-hidden="true" />
                <div className="mine-forge">
                    <Img src={s.furnace?.sprite} className="mine-forge-img" fallback="" />
                    <span className="mine-forge-glow" aria-hidden="true" />
                </div>
                <div className="mine-survey-hud">
                    <b>{s.furnace?.name}</b>{s.oreTotal ? <> · {s.oreTotal} ore waiting</> : <> · nothing to melt</>}
                </div>
                {msg ? <div className="mine-msg">{msg}</div> : null}
            </div>

            <div className="mine-panel">
                <div className="mine-pickhead">
                    <div className="mine-pickart is-furnace"><Img src={s.furnace?.sprite} className="mine-pickart-img" fallback="" /></div>
                    <div className="mine-pickbody">
                        <b>{s.furnace?.name}</b>
                        {s.furnace?.nextName
                            ? <em>{s.furnace.nextName} at {s.furnace.nextAt} upgrades · you have {s.smeltLevels ?? 0}</em>
                            : <em>Fully built — every smelting upgrade bought.</em>}
                        {s.furnace?.nextAt ? (
                            <span className="mine-pickbar"><span style={{ width: `${Math.min(100, ((s.smeltLevels ?? 0) / s.furnace.nextAt) * 100)}%` }} /></span>
                        ) : null}
                    </div>
                </div>
                <div className="sail-upgrades is-forge" style={{ marginTop: 12 }}>
                    {(s.smeltTracks || []).map((t) => <UpgCard key={t.key} t={t} gold={s.gold} busy={busy} onBuy={() => upgrade(t.key)} />)}
                </div>
            </div>

            <div className="mine-panel">
                <div className="mine-panel-head">Ore in your pack <span className="muted">· smelts into forge parts</span></div>
                {(s.ore || []).length ? (
                    <div className="mine-stash-rows">
                        {s.ore.map((o) => (
                            <div className="mine-stash-row" key={o.tier}>
                                <Img src={o.art} className="mine-stash-img" fallback="" />
                                <span className="mine-stash-name">
                                    <b style={{ color: o.color }}>{o.name}</b>
                                    <em>{o.smeltCost} ore → 1 {PART_NAME[o.partTier]}</em>
                                </span>
                                <b className="mine-stash-qty">×{o.qty}</b>
                                <button type="button" className="mine-smelt" disabled={!o.canSmelt || Boolean(smelting)} onClick={() => smelt(o.tier)}>
                                    <Img src="/images/mining/track-crucible.png" className="mine-btn-ico" fallback="" /> Smelt {o.canSmelt || ""}
                                </button>
                            </div>
                        ))}
                    </div>
                ) : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nothing yet — crack a seam on the Mine tab and it lands here.</p>}
            </div>

            <p className="mine-hint">Ore of a tier melts into that tier&rsquo;s forge part. The Crucible lowers what each part costs you, the Bellows sometimes throws in an extra, and Flux sometimes lifts one a whole tier.</p>
            </>
            )}

            {/* THE SWING — its own modal, its own juice. */}
            {breaking && node && node.pct > 0 ? (
                <MiningMinigame
                    node={node}
                    pick={s.pick}
                    onSwing={onSwing}
                    onDone={(res) => { setBreaking(false); setCrack(res); }}
                />
            ) : null}

            {/* HOW THE DESCENT ENDED — everything you carried out, or everything the roof took. */}
            {wrap ? (
                <div className="mine-modal" role="presentation" onClick={() => { setWrap(null); if (!wrap.collapsed) setTab("mine"); }}>
                    <div className="mine-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ color: wrap.collapsed ? "#ff8f9a" : "#ffd75e" }}>
                            {wrap.collapsed ? "The roof came in" : "You climbed out"}
                        </h3>
                        <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
                            {wrap.collapsed
                                ? `Depth ${wrap.depth}. ${wrap.lost ? `You were carrying ${wrap.lost} thing${wrap.lost === 1 ? "" : "s"}. Not any more.` : "You were carrying nothing, at least."}`
                                : `${(wrap.paid || []).length} thing${(wrap.paid || []).length === 1 ? "" : "s"} out of the dark.`}
                        </p>
                        {!wrap.collapsed && (wrap.paid || []).length ? (
                            <div className="mine-reveal-row">
                                {wrap.paid.map((h, i) => (
                                    <span key={i} className="mine-reveal-spot">
                                        {h.art ? <Img src={h.art} className="mine-reveal-ore" fallback="◆" />
                                            : <KindIcon kind={h.kind} art={h.art} className="mine-reveal-ore" />}
                                        {/* FULL name. Truncating to the first word turned "Fanged Helm" into
                                            "Fanged" and "War Cape" into "War", which mean nothing. */}
                                        <em style={{ color: h.color || "#cdd3d8" }}>
                                            {h.kind === "gold" ? `${money(h.n)} gold` : h.name || h.kind}
                                        </em>
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        {wrap.seam ? (
                            <div className="mine-rung-won is-flawless" style={{ marginTop: 12 }}>
                                <b>{wrap.seam.name} waiting at the face</b>
                                <em>{wrap.collapsed ? "You got out with the seam, at least." : "Go break it open."}</em>
                            </div>
                        ) : null}
                        {/* A collapse ends with nothing at the face, so the way out is another trip — not a
                            walk to an empty room. */}
                        {wrap.collapsed ? (
                            <button type="button" className="mine-buy" style={{ marginTop: 14 }}
                                onClick={() => { setWrap(null); if ((s.trips?.left ?? 0) > 0) startTrip(); }}>
                                {(s.trips?.left ?? 0) > 0
                                    ? <><Img src="/images/mining/lantern-2.png" className="mine-btn-ico" fallback="" /> Head back down ({s.trips.left} left)</>
                                    : <>Out of trips today</>}
                            </button>
                        ) : (
                            <button type="button" className="mine-buy" style={{ marginTop: 14 }} onClick={() => { setWrap(null); setTab("mine"); }}>
                                <Img src="/images/mining/pick-iron.png" className="mine-btn-ico" fallback="" /> To the rock face
                            </button>
                        )}
                    </div>
                </div>
            ) : null}

            {/* THE FACE REVEALED — what every spot actually was, and how your read scored. */}
            {reveal ? (
                <div className="mine-modal" role="presentation" onClick={() => { setReveal(null); setTab("mine"); }}>
                    <div className="mine-modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ color: reveal.bestRead ? "#ffd75e" : "#e7dcc8" }}>
                            {reveal.bestRead ? "Best read on the wall" : `You took the ${reveal.rank}${reveal.rank === 2 ? "nd" : reveal.rank === 3 ? "rd" : reveal.rank === 1 ? "st" : "th"} richest of ${reveal.total}`}
                        </h3>
                        <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
                            {reveal.bestRead ? "Nothing better was hiding on that face." : "Here's what the rest of the rock was holding."}
                        </p>
                        <div className="mine-reveal-row">
                            {reveal.spots.map((sp) => (
                                <span key={sp.index} className={`mine-reveal-spot${sp.picked ? " is-picked" : ""}`} title={sp.name}>
                                    <Img src={sp.art} className="mine-reveal-ore" fallback="◆" />
                                    <em style={{ color: sp.color }}>{sp.name.split(" ")[0]}</em>
                                    {sp.picked ? <b>yours</b> : null}
                                </span>
                            ))}
                        </div>
                        {reveal.bonus ? (
                            <div className="mine-rung-won is-flawless" style={{ marginTop: 12 }}>
                                <b>Best-read bonus{reveal.bonus.streak >= 2 ? ` · ${reveal.bonus.streak} in a row (x${reveal.bonus.streakMult})` : ""}</b>
                                <em>+{money(reveal.bonus.gold)} gold · +{money(reveal.bonus.xp)} XP for reading the rock right.</em>
                            </div>
                        ) : null}
                        {reveal.streakBroken ? (
                            <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Streak of {reveal.brokeAt} ends here. Next wall starts a new one.</p>
                        ) : null}
                        <button type="button" className="mine-buy" style={{ marginTop: 14 }} onClick={() => { setReveal(null); setTab("mine"); }}>
                            <Img src="/images/mining/pick-iron.png" className="mine-btn-ico" fallback="" /> Start swinging
                        </button>
                    </div>
                </div>
            ) : null}

            {/* Cracked-it reveal */}
            {crack ? (
                <div className="mine-modal" role="presentation" onClick={() => setCrack(null)}>
                    <div className="mine-modal-card" onClick={(e) => e.stopPropagation()}>
                        <Img src={crack.art} className="mine-modal-img" fallback="" />
                        <h3 style={{ color: crack.color }}>{crack.name} cracked!</h3>
                        {crack.rungLabel ? (
                            <div className={`mine-rung-won is-${crack.rungKey}`}>
                                <b>{crack.rungLabel}</b>
                                <em>{crack.rungBlurb} · {crack.quality}% average over {crack.swings} swing{crack.swings === 1 ? "" : "s"}</em>
                            </div>
                        ) : null}
                        <div className="mine-modal-rows">
                            <span>Ore<b>+{crack.ore}</b></span>
                            <span>Gold<b>+{money(crack.gold)}</b></span>
                            <span>XP<b>+{money(crack.xp)}</b></span>
                        </div>
                        <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>Smelts into {PART_NAME[crack.partTier]}.</p>
                        <button type="button" className="mine-buy" style={{ marginTop: 12 }} onClick={() => { setCrack(null); prospect(); }}>Find another seam</button>
                    </div>
                </div>
            ) : null}

            {/* THE POUR — the heat climbs, you decide when to tip the crucible. */}
            {forge ? <HeatGame stack={forge.stack} furnace={s.furnace} onPour={(h) => pour(h, forge.stack)} onCancel={() => setForge(null)} /> : null}

            {/* Smelting sequence */}
            {smelting ? (
                <div className="mine-modal" role="presentation" onClick={() => smelting.stage === "done" && setSmelting(null)}>
                    <div className="mine-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className={`mine-smelt-stage is-${smelting.stage}`}>
                            <Img src={smelting.oreArt} className="mine-smelt-ore" fallback="" />
                            <Img src="/images/mining/furnace.png" className="mine-smelt-furnace" fallback="" />
                            <span className="mine-smelt-glow" aria-hidden="true" />
                        </div>
                        {smelting.stage === "done" ? (
                            <>
                                <div className={`mine-band is-${smelting.result?.band || "warm"}`}>
                                    {smelting.result?.bandLabel || "Poured"} <em>{smelting.result?.bandBlurb || ""}</em>
                                </div>
                                <h3 style={{ color: "#ffd08a" }}>{smelting.result?.parts ?? smelting.parts} parts</h3>
                                <div className="mine-reveal-row">
                                    {(smelting.result?.byTier || []).map((b) => (
                                        <span key={b.partTier} className={`mine-reveal-spot${b.lifted ? " is-picked" : ""}`}>
                                            <b style={{ fontSize: 18 }}>{b.count}×</b>
                                            <em style={{ color: b.lifted ? "#7cffb2" : "#cdd3d8" }}>{PART_NAME[b.partTier]}</em>
                                            {b.lifted ? <b style={{ fontSize: 9 }}>TIER UP</b> : null}
                                        </span>
                                    ))}
                                </div>
                                {(smelting.result?.bonus || []).length ? (
                                    <div className="mine-rung-won is-flawless" style={{ marginTop: 12 }}>
                                        <b>Out of the slag</b>
                                        <em>{smelting.result.bonus.map((x) => x.name || (x.kind === "chest" ? `${x.tier} chest` : x.kind)).join(" · ")}</em>
                                    </div>
                                ) : null}
                                <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
                                    {smelting.ore} {smelting.oreName} went in. The parts are waiting in the Forge.
                                </p>
                                <button type="button" className="mine-buy" style={{ marginTop: 14 }} onClick={() => setSmelting(null)}>Back to the rock</button>
                            </>
                        ) : (
                            <h3 style={{ color: "#ffd08a" }}>{smelting.stage === "load" ? "Into the furnace…" : "Smelting…"}</h3>
                        )}
                    </div>
                </div>
            ) : null}

            <style jsx global>{`
                .mine-top { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
                .mine-title { font-size: 1.15rem; font-weight: 900; color: #ffe28a; }
                .mine-sub { font-size: 0.78rem; color: #9aa2ab; }

                .mine-face { position: relative; width: 100%; aspect-ratio: 3 / 2; border-radius: 16px; overflow: hidden;
                    border: 1px solid rgba(255,215,94,0.22); display: grid; place-items: center; }
                .mine-face-bg { position: absolute; inset: 0; background: #150f0a center/cover no-repeat url("/images/mining/cave-bg.png"); }
                .mine-face-bg::after { content: ""; position: absolute; inset: 0; background: radial-gradient(60% 55% at 50% 45%, transparent, rgba(0,0,0,0.62)); }
                .mine-rock { position: relative; width: 42%; max-width: 190px; aspect-ratio: 1; display: grid; place-items: center;
                    filter: drop-shadow(0 0 26px var(--ore)); }
                .mine-rock-img { width: 100%; height: 100%; object-fit: contain; }
                @keyframes mineHit { 0% { transform: none; } 40% { transform: translate(-3px, 2px) scale(0.97); } 100% { transform: none; } }
                .mine-seam-head { position: absolute; top: 10px; left: 0; right: 0; text-align: center; font-size: 0.92rem; text-shadow: 0 2px 6px #000; }
                .mine-seam-head .muted { display: block; font-size: 11px; }
                .mine-hpbar { position: absolute; left: 12%; right: 12%; bottom: 30px; height: 8px; border-radius: 999px; background: rgba(0,0,0,0.65); overflow: hidden; }
                .mine-hpbar > span { display: block; height: 100%; transition: width .2s ease; }
                .mine-hpnum { position: absolute; left: 0; right: 0; bottom: 10px; text-align: center; font-size: 11.5px; color: #cdd3d8; text-shadow: 0 2px 6px #000; }
                .mine-float { position: absolute; left: 50%; top: 38%; transform: translate(-50%,-50%); font-weight: 900; pointer-events: none;
                    animation: mineFloat .9s ease-out forwards; color: #ffe28a; text-shadow: 0 2px 8px #000; }
                .mine-float.is-pixel { color: #ffd75e; font-size: 1.7rem; } .mine-float.is-perfect { color: #8fe3ff; font-size: 1.45rem; }
                .mine-float.is-great { color: #8fe39a; font-size: 1.25rem; } .mine-float.is-miss { color: #9aa2ab; font-size: 1rem; }
                @keyframes mineFloat { to { transform: translate(-50%,-190%); opacity: 0; } }
                .mine-empty { position: relative; text-align: center; padding: 18px; }
                .mine-empty-pick { width: 88px; height: 88px; object-fit: contain; opacity: 0.9; }
                .mine-empty p { margin: 8px 0 2px; font-weight: 700; color: #e7dcc8; text-shadow: 0 2px 6px #000; }
                .mine-empty .muted { font-size: 12px; text-shadow: 0 2px 6px #000; }
                .mine-msg { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); background: rgba(0,0,0,0.78); color: #ffcf6a;
                    font-size: 12px; font-weight: 700; padding: 5px 12px; border-radius: 999px; }

                .mine-prospect { width: 100%; margin-top: 12px; padding: 14px; border-radius: 13px; border: none; font-weight: 900; font-size: 1.06rem;
                    color: #2a1400; cursor: pointer; background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 3px 0 #b47a12; }
                .mine-prospect:disabled { filter: saturate(0.7) brightness(0.9); cursor: default; }
                .mine-prospect.is-ghost { margin-top: 8px; padding: 9px; font-size: 0.84rem; font-weight: 700; color: #cdb894;
                    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14); box-shadow: none; }

                .mine-tabs { display: flex; gap: 6px; margin-bottom: 12px; }
                /* min-width:0 is load-bearing. Flex items default to min-width:auto, so these buttons refused to
                   shrink below their own content (icon + label + badge) and the third one ran off the card.
                   The badge is positioned OUT of the flow for the same reason — it must never add width. */
                .mine-tabs button { position: relative; flex: 1 1 0; min-width: 0; display: inline-flex; align-items: center;
                    justify-content: center; gap: 6px; padding: 10px 8px; border-radius: 12px; font-weight: 800;
                    font-size: 0.92rem; cursor: pointer; color: #cdd3d8; overflow: hidden;
                    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); }
                .mine-tabs button > span:not(.mine-tab-badge) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .mine-tabs button.is-on { color: #2a1400; background: linear-gradient(180deg, #ffe08a, #ffb020); border-color: transparent; box-shadow: 0 3px 0 #b47a12; }
                .mine-tab-ico { width: 22px; height: 22px; object-fit: contain; flex: 0 0 auto; }
                .mine-tab-badge { position: absolute; top: 3px; right: 4px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 999px;
                    background: #e0483d; color: #fff; font-size: 10px; font-weight: 900; display: grid; place-items: center;
                    box-shadow: 0 0 0 2px rgba(20,14,8,0.85); }
                .mine-pickart.is-lantern { background: radial-gradient(circle at 50% 35%, rgba(111,208,255,0.2), rgba(111,208,255,0.04)); border-color: rgba(111,208,255,0.4); }
                .mine-pickart.is-furnace { background: radial-gradient(circle at 50% 35%, rgba(255,120,32,0.24), rgba(255,120,32,0.05)); border-color: rgba(255,120,32,0.4); }
                .mine-face.is-survey, .mine-face.is-smelt { aspect-ratio: 3 / 2; }
                .mine-face-bg.is-survey { background-image: url("/images/mining/survey-bg.png"); }
                .mine-face-bg.is-smelt { background-image: url("/images/mining/smelt-bg.png"); }
                /* Survey marks — chalk rings on the wall, coloured once you've sounded them. */
                .mine-mark { position: absolute; transform: translate(-50%,-50%); width: 54px; height: 54px; padding: 0; cursor: pointer;
                    border-radius: 50%; display: grid; place-items: center;
                    border: 2px dashed rgba(255,255,255,0.45); background: rgba(0,0,0,0.42); color: #e7dcc8;
                    transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
                @media (hover: hover) { .mine-mark:hover { transform: translate(-50%,-50%) scale(1.08); } }
                .mine-mark.is-read { border-style: solid; border-color: var(--sig, #ffd75e); background: rgba(0,0,0,0.55);
                    box-shadow: 0 0 16px -2px var(--sig, #ffd75e); }
                .mine-mark.is-sel { box-shadow: 0 0 0 3px var(--sig, #ffd75e), 0 0 22px -2px var(--sig, #ffd75e); }
                /* THE TEST-STRIKE. The mark kicks, a shockwave rings out, and the reading lands after it —
                   the same "something happened" beat the Kitchen's minigame gives a cook. */
                .mine-mark.is-sounding { animation: mineKnock .28s ease-out 2; border-color: #ffe28a; }
                .mine-mark.is-sounding::after { content: ""; position: absolute; inset: -6px; border-radius: 50%;
                    border: 2px solid rgba(255,226,138,0.85); animation: mineEcho .62s ease-out forwards; pointer-events: none; }
                @keyframes mineKnock { 0% { transform: translate(-50%,-50%) scale(1); } 45% { transform: translate(-50%,-50%) scale(0.9); } 100% { transform: translate(-50%,-50%) scale(1); } }
                @keyframes mineEcho { from { transform: scale(0.7); opacity: 0.95; } to { transform: scale(2.6); opacity: 0; } }
                .mine-pips-strike { display: inline-flex; gap: 3px; }
                .mine-pips-strike i { font-style: normal; font-size: 13px; opacity: 0.22; filter: grayscale(1); }
                .mine-pips-strike i.on { opacity: 1; filter: none; }
                .mine-survey-hud { display: flex; align-items: center; justify-content: center; gap: 8px; }
                .mine-manifest { margin-bottom: 10px; padding: 10px 12px; border-radius: 12px;
                    background: rgba(255,215,94,0.07); border: 1px solid rgba(255,215,94,0.28); }
                .mine-manifest-lab { display: block; font-size: 0.68rem; font-weight: 800; letter-spacing: 0.06em;
                    text-transform: uppercase; color: #ffd75e; margin-bottom: 7px; }
                .mine-manifest-list { display: flex; gap: 7px; flex-wrap: wrap; }
                .mine-manifest-item { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 999px;
                    background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.1); font-size: 12px; }
                .mine-manifest-ore { width: 20px; height: 20px; object-fit: contain; }
                .mine-manifest-item em { font-style: normal; color: #cdd3d8; font-weight: 800; }
                .mine-manifest-item.is-unknown { border-color: rgba(255,215,94,0.65); background: rgba(255,215,94,0.14); animation: mineBurn 1.6s ease-in-out infinite alternate; }
                .mine-manifest-q { width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%;
                    background: rgba(255,215,94,0.25); color: #ffe28a; font-weight: 900; font-size: 12px; }
                .mine-motherlode-tag { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 2;
                    padding: 4px 12px; border-radius: 999px; font-size: 11.5px; font-weight: 900; color: #2a1400;
                    background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 0 18px rgba(255,190,60,0.7); }
                .mine-face.is-motherlode { border-color: rgba(255,215,94,0.7); box-shadow: inset 0 0 60px -10px rgba(255,180,40,0.5); }
                .mine-streak { color: #ffb020; font-weight: 800; }
                .mine-manifest-note { display: block; margin-top: 7px; font-size: 11px; color: #9aa2ab; }
                .mine-legend { display: flex; gap: 6px; margin-top: 10px; }
                .mine-legend-item { flex: 1; display: flex; flex-direction: column; gap: 1px; padding: 7px 8px; border-radius: 10px;
                    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); min-width: 0; }
                .mine-legend-item i { width: 100%; height: 3px; border-radius: 999px; }
                .mine-legend-item b { font-size: 11.5px; margin-top: 3px; }
                .mine-legend-item em { font-size: 10.5px; font-style: normal; color: #9aa2ab; }
                .mine-reveal-row { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
                .mine-reveal-spot { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 7px 6px; border-radius: 10px;
                    background: rgba(255,255,255,0.04); border: 1px solid transparent; min-width: 58px; }
                .mine-reveal-spot.is-picked { border-color: #ffd75e; background: rgba(255,215,94,0.14); }
                .mine-reveal-ore { width: 32px; height: 32px; object-fit: contain; }
                .mine-reveal-spot em { font-size: 10.5px; font-style: normal; }
                .mine-reveal-spot b { font-size: 9.5px; color: #ffd75e; text-transform: uppercase; letter-spacing: 0.04em; }
                .mine-nudge { flex-basis: 100%; margin-top: 6px; padding: 8px 12px; border-radius: 10px; cursor: pointer;
                    font-size: 12.5px; font-weight: 800; text-align: left; color: #ffe28a;
                    background: rgba(255,215,94,0.12); border: 1px solid rgba(255,215,94,0.45); }
                .mine-empty .mine-prospect { width: auto; padding: 11px 20px; margin-top: 12px; }
                .mine-depth { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 2;
                    font-size: 11px; font-weight: 900; letter-spacing: .12em; color: #ffe28a; text-shadow: 0 2px 6px #000; }
                .mine-card { position: relative; z-index: 2; width: 78%; max-width: 300px; text-align: center; padding: 14px;
                    border-radius: 14px; background: rgba(8,5,3,0.82); border: 1px solid rgba(255,215,94,0.4);
                    animation: minePop .3s cubic-bezier(.2,1.3,.4,1) both; }
                .mine-card.is-idle { border-style: dashed; border-color: rgba(255,255,255,0.16); background: rgba(8,5,3,0.5); }
                @keyframes minePop { from { opacity: 0; transform: translateY(10px) scale(.94); } to { opacity: 1; transform: none; } }
                .mine-card-lab { display: block; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #9aa2ab; margin-bottom: 5px; }
                .mine-card b { display: block; font-size: 1.02rem; }
                .mine-card em { display: block; font-style: normal; font-size: 11.5px; color: #b9a98f; margin-top: 3px; }
                .mine-card-art { width: 54px; height: 54px; object-fit: contain; margin: 0 auto 4px; display: block; }
                .mine-haul { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 10px; padding: 9px 11px;
                    border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); min-height: 46px; }
                .mine-haul-chip { display: inline-flex; align-items: center; gap: 3px; padding: 3px 7px; border-radius: 999px;
                    background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.12); font-size: 12px; }
                .mine-haul-art { width: 20px; height: 20px; object-fit: contain; }
                .mine-haul-chip em { font-style: normal; color: #cdd3d8; font-weight: 800; }
                .mine-choice { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
                .mine-choice .mine-prospect { margin-top: 0; }
                .mine-choice .mine-prospect em { display: block; font-style: normal; font-size: 10.5px; font-weight: 700; opacity: .8; }
                .mine-prospect.is-big { padding: 16px; font-size: 1.1rem; }
                .mine-prospect.is-big em { display: block; font-style: normal; font-size: 11px; font-weight: 700; opacity: .78; margin-top: 2px; }
                .mine-upg-ico { width: 22px; height: 22px; object-fit: contain; }
                .mine-btn-ico { width: 22px; height: 22px; object-fit: contain; vertical-align: -5px; margin-right: 5px; }
                .mine-title-ico { width: 24px; height: 24px; object-fit: contain; vertical-align: -4px; margin-right: 4px; }
                .mine-reveal-spot em { line-height: 1.25; }
                .mine-face-cta { position: relative; text-align: center; padding: 16px; }
                .mine-face-cta p { margin: 8px 0 12px; font-weight: 700; color: #e7dcc8; text-shadow: 0 2px 6px #000; }
                .mine-face-cta .mine-prospect { margin-top: 0; width: auto; padding: 12px 22px; }
                .mine-mark-q { font-size: 22px; font-weight: 900; opacity: 0.8; }
                .mine-mark-ore { width: 34px; height: 34px; object-fit: contain; }
                .mine-mark-n { position: absolute; right: -3px; bottom: -3px; width: 18px; height: 18px; border-radius: 50%;
                    display: grid; place-items: center; font-size: 10px; font-weight: 900; color: #2a1400; background: #ffd75e; }
                .mine-survey-hud { position: absolute; left: 0; right: 0; bottom: 8px; text-align: center; font-size: 12px;
                    color: #e7dcc8; text-shadow: 0 2px 6px #000; }
                .mine-survey-hud b { color: #ffe28a; }
                .mine-readout { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 10px 12px; border-radius: 12px;
                    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); }
                .mine-readout-body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
                .mine-readout-body em { font-size: 11.5px; font-style: normal; color: #9aa2ab; }
                /* The furnace, standing in its room. */
                .mine-forge { position: relative; width: 46%; max-width: 210px; aspect-ratio: 1; display: grid; place-items: center; }
                .mine-forge-img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 0 30px rgba(255,140,40,0.65)); }
                .mine-forge-glow { position: absolute; width: 70%; height: 70%; border-radius: 50%; pointer-events: none;
                    background: radial-gradient(circle, rgba(255,150,40,0.5), transparent 65%); animation: mineBurn 2.2s ease-in-out infinite alternate; }
                .mine-survey { margin-top: 12px; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,215,94,0.28); }
                .mine-survey-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
                .mine-survey-head b { font-size: 1rem; color: #ffe28a; }
                .mine-survey-head .muted { margin-left: auto; font-size: 11.5px; }
                .mine-survey-intro { margin: 0 0 10px; font-size: 12.5px; color: #cdd3d8; line-height: 1.5; }
                .mine-spots { display: grid; gap: 7px; }
                .mine-spot { display: flex; align-items: center; gap: 10px; padding: 8px 9px; border-radius: 10px;
                    background: rgba(255,255,255,0.04); border: 1px solid transparent; }
                .mine-spot.is-read { border-color: var(--sig); background: color-mix(in srgb, var(--sig) 12%, transparent); }
                .mine-spot-n { width: 24px; height: 24px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%;
                    background: rgba(255,255,255,0.1); font-size: 11px; font-weight: 900; }
                .mine-spot-read { display: flex; flex-direction: column; min-width: 0; flex: 1; }
                .mine-spot-read b { font-size: 0.86rem; }
                .mine-spot-read em { font-size: 11px; font-style: normal; color: #9aa2ab; }
                .mine-spot-acts { display: flex; gap: 6px; flex: 0 0 auto; }
                .mine-spot-probe, .mine-spot-dig { padding: 6px 10px; border-radius: 9px; font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap; }
                .mine-spot-probe { border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.06); color: #cdd3d8; }
                .mine-spot-dig { border: none; color: #2a1400; background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 2px 0 #b47a12; }
                .mine-spot-probe:disabled, .mine-spot-dig:disabled { opacity: 0.4; cursor: default; }
                .mine-panel { margin-top: 14px; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
                .mine-panel-head { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: #ffd75e; margin-bottom: 9px; }
                .mine-pickhead { display: flex; align-items: center; gap: 12px; padding-bottom: 11px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); }
                .mine-pickart { width: 66px; height: 66px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 14px;
                    background: radial-gradient(circle at 50% 35%, rgba(255,215,94,0.20), rgba(255,215,94,0.04)); border: 1px solid rgba(255,215,94,0.28); }
                .mine-pickart-img { width: 82%; height: 82%; object-fit: contain; }
                .mine-pickbody { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
                .mine-pickbody b { font-size: 1.02rem; color: #ffe28a; }
                .mine-pickbody em { font-size: 11.5px; font-style: normal; color: #9aa2ab; }
                .mine-pickbar { display: block; height: 6px; border-radius: 999px; background: rgba(255,255,255,0.09); overflow: hidden; margin-top: 3px; }
                .mine-pickbar > span { display: block; height: 100%; background: linear-gradient(90deg, #ffb020, #ffe08a); }
                .mine-track { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid rgba(255,255,255,0.06); }
                .mine-track-ico { font-size: 22px; }
                .mine-track-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
                .mine-track-body em { font-size: 11.5px; font-style: normal; color: #9aa2ab; }
                .mine-pips { display: flex; gap: 3px; margin-top: 3px; }
                .mine-pips i { width: 11px; height: 5px; border-radius: 2px; background: rgba(255,255,255,0.13); }
                .mine-pips i.on { background: linear-gradient(90deg, #ffb020, #ffe08a); }
                .mine-buy { padding: 8px 14px; border-radius: 10px; border: none; font-weight: 900; cursor: pointer; color: #2a1400;
                    background: linear-gradient(180deg, #ffe08a, #ffb020); box-shadow: 0 2px 0 #b47a12; }
                .mine-buy:disabled { filter: grayscale(0.7) brightness(0.8); cursor: default; }

                .mine-stash-rows { display: grid; gap: 7px; }
                .mine-stash-row { display: flex; align-items: center; gap: 10px; padding: 7px 9px; border-radius: 10px; background: rgba(255,255,255,0.04); }
                .mine-stash-img { width: 34px; height: 34px; object-fit: contain; flex: 0 0 auto; }
                .mine-stash-name { display: flex; flex-direction: column; min-width: 0; flex: 1; }
                .mine-stash-name em { font-size: 11px; font-style: normal; color: #9aa2ab; }
                .mine-stash-qty { font-variant-numeric: tabular-nums; }
                .mine-smelt { padding: 7px 12px; border-radius: 9px; border: 1px solid rgba(255,120,32,0.55); background: rgba(255,120,32,0.16);
                    color: #ffcf9a; font-weight: 800; font-size: 12px; cursor: pointer; white-space: nowrap; }
                .mine-smelt:disabled { opacity: 0.32; cursor: default; }
                .mine-ladder { margin-top: 12px; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
                .mine-ladder-intro { margin: 0 0 10px; font-size: 12.5px; color: #cdd3d8; line-height: 1.5; }
                .mine-rung { display: flex; align-items: center; gap: 10px; padding: 7px 9px; border-radius: 10px; margin-bottom: 6px;
                    background: rgba(255,255,255,0.04); border: 1px solid transparent; }
                .mine-rung.is-here { border-color: rgba(255,215,94,0.6); background: rgba(255,215,94,0.1); }
                .mine-rung-n { width: 22px; height: 22px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%;
                    background: rgba(255,255,255,0.1); font-size: 11px; font-weight: 900; }
                .mine-rung.is-flawless .mine-rung-n { background: #ffd75e; color: #2a1400; }
                .mine-rung.is-clean .mine-rung-n { background: #8fe3ff; color: #10222a; }
                .mine-rung.is-solid .mine-rung-n { background: #8fe39a; color: #12261a; }
                .mine-rung-copy { display: flex; flex-direction: column; min-width: 0; flex: 1; }
                .mine-rung-copy b { font-size: 0.9rem; }
                .mine-rung-copy em { font-size: 11px; font-style: normal; color: #9aa2ab; }
                .mine-rung-pay { display: flex; align-items: center; gap: 5px; font-variant-numeric: tabular-nums; }
                .mine-rung-ore { width: 24px; height: 24px; object-fit: contain; }
                .mine-ladder-foot { margin: 8px 0 0; font-size: 11.5px; color: #9aa2ab; }
                .mine-rung-won { margin: 0 0 10px; padding: 8px; border-radius: 10px; background: rgba(255,215,94,0.12); border: 1px solid rgba(255,215,94,0.4); }
                .mine-rung-won b { display: block; color: #ffe28a; }
                .mine-rung-won em { font-size: 11px; font-style: normal; color: #cdb894; }
                .mine-hint { font-size: 12px; color: #9aa2ab; margin: 10px 0 0; }

                .mine-modal { position: fixed; inset: 0; z-index: 300; display: flex; align-items: flex-start; justify-content: center; overflow-y: auto;
                    background: rgba(6,4,10,0.82); padding: max(16px, env(safe-area-inset-top)) 18px max(16px, env(safe-area-inset-bottom)); }
                .mine-modal > * { margin: auto; }
                .mine-modal-card { width: 100%; max-width: 340px; text-align: center; padding: 22px; border-radius: 18px;
                    background: linear-gradient(180deg, #241a06, #120c03); border: 1px solid rgba(255,215,94,0.5); }
                .mine-modal-img { width: 96px; height: 96px; object-fit: contain; }
                .mine-modal-card h3 { margin: 8px 0 10px; }
                .mine-modal-rows { display: flex; justify-content: center; gap: 16px; }
                .mine-modal-rows span { display: flex; flex-direction: column; font-size: 11px; color: #9aa2ab; }
                .mine-modal-rows b { font-size: 1.08rem; color: #ffe28a; }

                /* The smelt: ore slides into the furnace mouth, the furnace flares, the parts are announced. */
                .mine-heat-stage { position: relative; height: 130px; display: grid; place-items: center; margin: 6px 0 10px; }
                .mine-heat-furnace { width: 116px; height: 116px; object-fit: contain; }
                .mine-heat-glow { position: absolute; width: 130px; height: 130px; border-radius: 50%; pointer-events: none;
                    background: radial-gradient(circle, rgba(255,150,40,0.9), transparent 62%); }
                .mine-heat-bar { position: relative; height: 22px; border-radius: 999px; overflow: hidden;
                    background: linear-gradient(90deg, #2b3550, #3a4150); }
                .mine-heat-zone { position: absolute; top: 0; bottom: 0; }
                .mine-heat-zone.is-hot { left: 56.7%; width: 16.6%; background: rgba(255,176,32,0.35); }
                .mine-heat-zone.is-perfect { left: 73.3%; width: 10%; background: rgba(124,255,178,0.5); }
                .mine-heat-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px;
                    background: linear-gradient(90deg, #6fb0e6, #ffd75e 55%, #ff5a2a); }
                .mine-heat-read { text-align: center; margin: 8px 0 10px; font-weight: 900; font-size: 1rem; }
                .mine-heat-read.is-cold { color: #6fb0e6; } .mine-heat-read.is-warm { color: #cdd3d8; }
                .mine-heat-read.is-hot { color: #ffb020; } .mine-heat-read.is-perfect { color: #7cffb2; }
                .mine-heat-read.is-burnt { color: #ff5a2a; animation: mineBurn .3s ease-in-out infinite alternate; }
                .mine-band { padding: 7px 10px; border-radius: 10px; font-weight: 900; font-size: 0.9rem; margin-bottom: 8px; }
                .mine-band em { display: block; font-style: normal; font-weight: 600; font-size: 11px; opacity: .85; }
                .mine-band.is-perfect { color: #7cffb2; background: rgba(124,255,178,0.14); }
                .mine-band.is-hot { color: #ffb020; background: rgba(255,176,32,0.14); }
                .mine-band.is-warm { color: #cdd3d8; background: rgba(255,255,255,0.06); }
                .mine-band.is-cold { color: #6fb0e6; background: rgba(111,176,230,0.14); }
                .mine-band.is-burnt { color: #ff5a2a; background: rgba(255,90,42,0.14); }
                .mine-smelt-stage { position: relative; height: 140px; display: grid; place-items: center; }
                .mine-smelt-furnace { width: 120px; height: 120px; object-fit: contain; }
                .mine-smelt-ore { position: absolute; width: 48px; height: 48px; object-fit: contain; left: 50%; top: 0;
                    transform: translate(-50%, 0); transition: transform .45s cubic-bezier(.4,0,.7,1), opacity .25s ease; }
                .mine-smelt-stage.is-burn .mine-smelt-ore, .mine-smelt-stage.is-done .mine-smelt-ore { transform: translate(-50%, 62px) scale(0.55); opacity: 0; }
                .mine-smelt-glow { position: absolute; width: 120px; height: 120px; border-radius: 50%; pointer-events: none; opacity: 0;
                    background: radial-gradient(circle, rgba(255,150,40,0.85), transparent 65%); transition: opacity .3s ease; }
                .mine-smelt-stage.is-burn .mine-smelt-glow { opacity: 1; animation: mineBurn .5s ease-in-out infinite alternate; }
                .mine-smelt-stage.is-done .mine-smelt-glow { opacity: 0.45; }
                @keyframes mineBurn { from { transform: scale(0.9); } to { transform: scale(1.15); } }
            `}</style>
        </section>
    );
}

// ── THE HEAT ── the smelting minigame.
//
// The furnace climbs from cold to burnt on its own. You tip the crucible when you like. The good band sits
// near the top, so the pour is a nerve game: hold for the perfect window and risk cooking the whole batch.
// Deliberately a DIFFERENT hand from the swing — that one is a moving marker, this one is a rising bar you
// have to let run.
function HeatGame({ stack, furnace, onPour, onCancel }) {
    const [heat, setHeat] = useState(0);
    const heatRef = useRef(0);
    const doneRef = useRef(false);
    const RISE_MS = 2600; // cold → burnt

    useEffect(() => {
        let raf = 0;
        const t0 = performance.now();
        const loop = (t) => {
            const h = (t - t0) / RISE_MS;
            heatRef.current = h;
            setHeat(h);
            if (h >= 1.2) { // let it run away and it's cooked — the pour still happens, just badly
                if (!doneRef.current) { doneRef.current = true; onPour(1.2); }
                return;
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [onPour]);

    const tip = () => { if (doneRef.current) return; doneRef.current = true; onPour(heatRef.current); };
    const pct = Math.min(100, (heat / 1.2) * 100);
    const band = heat <= 0.42 ? "cold" : heat <= 0.68 ? "warm" : heat <= 0.88 ? "hot" : heat <= 1.0 ? "perfect" : "burnt";

    return (
        <div className="mine-modal" role="dialog" aria-label="Working the heat">
            <div className="mine-modal-card" onClick={(e) => e.stopPropagation()}>
                <h3 style={{ color: "#ffd08a", marginTop: 0 }}>Work the heat</h3>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
                    {stack.canSmelt * stack.smeltCost} {stack.name} in the crucible. Pour when it&rsquo;s right — the
                    best window is just short of burning it.
                </p>
                <div className="mine-heat-stage">
                    <Img src={furnace?.sprite} className="mine-heat-furnace" fallback="" />
                    <span className="mine-heat-glow" style={{ opacity: Math.min(1, heat) }} aria-hidden="true" />
                </div>
                <div className="mine-heat-bar" aria-hidden="true">
                    <span className="mine-heat-zone is-hot" />
                    <span className="mine-heat-zone is-perfect" />
                    <span className="mine-heat-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className={`mine-heat-read is-${band}`}>
                    {band === "cold" ? "Too cold" : band === "warm" ? "Warm" : band === "hot" ? "Hot" : band === "perfect" ? "PERFECT" : "BURNING"}
                </div>
                <button type="button" className="mine-prospect" onPointerDown={(e) => { e.preventDefault(); tip(); }}>
                    <Img src="/images/mining/track-crucible.png" className="mine-btn-ico" fallback="" /> Pour
                </button>
                <button type="button" className="mine-prospect is-ghost" onClick={onCancel}>Back off the fire</button>
            </div>
        </div>
    );
}

// One upgrade card, in the house style the boat and the forge already use — accent stripe, level bar, and a
// "what it does now → next" row. Mining had a plainer bespoke row, which is why it looked cheaper than
// everything around it for no reason other than that nobody had reused this.
function UpgCard({ t, gold, busy, onBuy }) {
    return (
        <div className={`sail-upg${t.maxed ? " is-maxed" : ""}`}>
            <div className="sail-upg-top">
                <span className="sail-upg-title"><span className="sail-upg-ico"><Img src={t.icon} className="mine-upg-ico" fallback="" /></span>{t.name}</span>
                <span className="muted sail-upg-lv">Lv {t.level}/{t.max}</span>
            </div>
            <div className="sail-upg-bar" aria-hidden="true"><span style={{ width: `${t.max ? Math.min(100, (t.level / t.max) * 100) : 0}%` }} /></div>
            <p className="muted sail-upg-desc">{t.desc}</p>
            <div className="sail-upg-effect">
                <span>{t.effect || "Effect"}</span>
                <b>{t.now}{t.maxed ? "" : <> → <span className="sail-upg-next">{t.next}</span></>}</b>
            </div>
            {t.maxed
                ? <button className="pill" disabled>Maxed</button>
                : <button className="btn-ghost sail-upg-buy" disabled={busy || (gold ?? 0) < t.cost} onClick={onBuy}><Img src="/images/mining/icon-coins.png" className="mine-btn-ico" fallback="" /> {Number(t.cost).toLocaleString()}</button>}
        </div>
    );
}
