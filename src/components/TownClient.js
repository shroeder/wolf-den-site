"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Gi from "react-icons/gi";

import ArenaClient from "@/components/ArenaClient";
import TavernInterior from "@/components/TavernInterior";
import SceneMusic from "@/components/SceneMusic";
import CoinCta from "@/components/CoinCta";
import { bandLeftPct, bandPct, gradeKeyForDist } from "@/lib/marketplace/timing.js";
import { STAT_META, describeSea, describeFarm } from "@/lib/marketplace/items.js";
import { useVisiblePoll } from "@/lib/use-visible-poll.js";
import NoticeBody from "@/components/NoticeBody";

// ── THE WOLF DEN TOWN — side-scrolling social plaza ───────────────────────────────────────────────────────
// A wide cobblestone street you scroll along (camera follows your hero sprite). Other recently-active members
// walk it too, as their own hero sprites, with a live status. Buildings line the street and fast-travel into
// each system. A roster overlay lets you see who's doing what without walking. Movement is smooth via CSS
// transitions (poll + tween — no canvas / websockets). Positions are % of the WIDE world; y is a ground band.

const WORLD_W = 2900;   // px width of the whole street (x = 0..100 maps across this) — widened for 9 buildings
const GROUND = 72;      // % from top where building BASES sit (avatars walk in front, lower/foreground)
const spriteTransform = (flip, facing) => ((Boolean(flip) !== (facing === -1)) ? "scaleX(-1)" : "none");
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Mirror-tiled parallax rows: enough tiles to always span the full WORLD_W (2200px) even when the scene is short
// (tiles are sized by height, so a small phone viewport → narrow tiles → need more of them). Over-tiling is free —
// extras just overflow the world and are clipped by the scene.
const TILES = (n) => Array.from({ length: n }, (_, i) => i);
// Which town-art sprite each raid kind uses (falls back to the event emoji until the art is generated).
const EVENT_ART = { bandit_raid: "bandit", goblin_swarm: "goblin", treasure_golem: "golem" };
const CAT_LABEL = { civic: "🏛️ Civic", building: "🏚️ Buildings", service: "🧭 Services", unlock: "🌟 New buildings" };
// Pretty relative timestamp for the plaza chat log ("just now", "5m", "3h", then a date).
const relTime = (iso) => {
    const t = new Date(iso).getTime();
    if (!t) return "";
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 45) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 604800) return `${Math.floor(s / 86400)}d`;
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
// Town Development projects → their card sprite (replaces the emoji when the art exists). tavern reuses the
// plaza tavern building sprite; vault/festival reuse the same art that becomes their unlocked plaza building.
const PROJECT_ART = { prosperity: "prosperity", depth: "townscape", tavern: "tavern", market: "trading_post", garrison: "garrison", vault: "vault", festival: "festival" };
// A message that's just emoji (a reaction/emote) pops as a floating emote instead of a text bubble.
const isEmoteMsg = (s) => Boolean(s && [...s.trim()].length <= 4 && !/[a-z0-9]/i.test(s) && /\p{Extended_Pictographic}/u.test(s));
// Compact "time left" for the hangout buff pill (e.g. 5400 → "1h 30m", 240 → "4m").
const fmtLeft = (secs) => { const s = Math.max(0, Math.round(secs || 0)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${Math.max(1, m)}m`; };

// Rarity colors/labels for the gear-gamble reveal (Tier 1-4 = common/rare/epic/legendary).
const RARITY_META = {
    common: { label: "Common", color: "#c2c9d4", glow: "rgba(194,201,212,0.65)", stars: 1 },
    rare: { label: "Rare", color: "#4aa3ff", glow: "rgba(74,163,255,0.8)", stars: 2 },
    epic: { label: "Epic", color: "#b878ff", glow: "rgba(184,120,255,0.85)", stars: 3 },
    legendary: { label: "Legendary", color: "#ffcf3a", glow: "rgba(255,207,58,0.92)", stars: 4 },
};

// The item's real stat block for a reveal — combat stats as chips, its signature ability, elemental affinity,
// and any spin-off (sea/farm) affinities. So the win shows exactly what you got, not just a name.
function RevealStats({ item }) {
    if (!item) return null;
    const stats = Object.entries(item.stats || {}).filter(([k]) => STAT_META[k]);
    const els = item.elements || [];
    const sea = item.sea ? describeSea(item.sea) : "";
    const farm = item.farm ? describeFarm(item.farm) : "";
    return (
        <div className="tw-reveal-stats">
            {stats.length ? (
                <div className="tw-reveal-chips">
                    {stats.map(([k, v]) => (
                        <span key={k} className="tw-reveal-chip" title={STAT_META[k].desc || ""}>{STAT_META[k].icon} +{v}{STAT_META[k].suffix || ""} {STAT_META[k].label}</span>
                    ))}
                </div>
            ) : null}
            {els.length ? (
                <div className="tw-reveal-els">
                    {els.map((e) => <span key={e.key} className="tw-reveal-el" style={{ color: e.color, borderColor: e.color }}>{e.emoji} {e.label}</span>)}
                </div>
            ) : null}
            {item.signature ? <div className="tw-reveal-sig">★ {item.signature.label} — {item.signature.desc}</div> : null}
            {sea ? <div className="tw-reveal-aff">⚓ {sea}</div> : null}
            {farm ? <div className="tw-reveal-aff">🌱 {farm}</div> : null}
            {item.chargeReward ? <div className="tw-reveal-sig" style={{ color: "#ffd75e" }}>🎁 Real-world reward: {item.chargeReward}</div> : null}
        </div>
    );
}

// Full-screen gear-gamble reveal: a suspenseful dice tumble, then a rarity-colored burst that pops the won
// item in with light, sparks (epic+) and its tier/rarity. This is the dopamine moment.
function GambleReveal({ reveal, diceUrl, onClose }) {
    const rolling = reveal.phase === "rolling";
    const item = reveal.item;
    const rar = RARITY_META[item?.rarity] || RARITY_META.common;
    const legendary = item?.rarity === "legendary";
    const epicPlus = legendary || item?.rarity === "epic";
    const nSparks = legendary ? 20 : 12;
    return (
        <div className="tw-reveal" role="dialog" aria-modal="true" onClick={rolling ? undefined : onClose}>
            {rolling ? (
                <div className="tw-reveal-roll">
                    {diceUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="tw-reveal-dice" src={diceUrl} alt="" draggable={false} />
                    ) : <span className="tw-reveal-dice tw-reveal-dice-emoji" aria-hidden="true">🎲</span>}
                    <div className="tw-reveal-rolltext">Rolling the bones<span className="tw-reveal-dots"><span>.</span><span>.</span><span>.</span></span></div>
                </div>
            ) : reveal.dupeAll ? (
                <div className="tw-reveal-card" onClick={(e) => e.stopPropagation()} role="presentation">
                    <div className="tw-reveal-rarity">Full collection!</div>
                    <div className="tw-reveal-itemwrap"><span className="tw-reveal-item tw-reveal-item-emoji" aria-hidden="true">🪙</span></div>
                    <div className="tw-reveal-name">You already own every piece</div>
                    <div className="tw-reveal-slot">The merchant hands back {reveal.refund.toLocaleString()} gold.</div>
                    <button type="button" className="tw-reveal-btn" onClick={onClose}>Fair enough</button>
                </div>
            ) : (
                <div className={`tw-reveal-card${legendary ? " is-legendary" : ""}`} style={{ "--rar": rar.color, "--rar-glow": rar.glow }} onClick={(e) => e.stopPropagation()} role="presentation">
                    <div className={`tw-reveal-burst${epicPlus ? " is-big" : ""}`} aria-hidden="true" />
                    {epicPlus ? (
                        <div className="tw-reveal-sparks" aria-hidden="true">
                            {Array.from({ length: nSparks }).map((_, i) => (
                                <span key={i} style={{ "--a": `${(360 / nSparks) * i}deg`, "--dly": `${(i % 5) * 0.05}s` }} />
                            ))}
                        </div>
                    ) : null}
                    <div className="tw-reveal-rarity">{rar.label} <span className="tw-reveal-stars" aria-hidden="true">{"★".repeat(rar.stars)}</span></div>
                    <div className="tw-reveal-itemwrap">
                        {item?.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="tw-reveal-item" src={item.image} alt={item.name} draggable={false} />
                        ) : <span className="tw-reveal-item tw-reveal-item-emoji" aria-hidden="true">🛡️</span>}
                    </div>
                    <div className="tw-reveal-name">{item?.name}</div>
                    <div className="tw-reveal-slot">Tier {item?.tier} · {String(item?.slot || "").replace(/_/g, " ")}{item?.reqLevel ? ` · needs Lv ${item.reqLevel}` : ""}</div>
                    <RevealStats item={item} />
                    <button type="button" className="tw-reveal-btn" onClick={onClose}>Collect it →</button>
                </div>
            )}
        </div>
    );
}

function Avatar({ a, isYou, onTap, raiding }) {
    const dur = clamp((a.moveDist || 0) * 0.05, 0.4, 2.6);
    // The pet drifts around near you on its own little schedule, so it feels alive instead of glued to your side.
    const [petWander, setPetWander] = useState({ x: 0, y: 0 });
    useEffect(() => {
        if (!a.pet) return undefined;
        const tick = () => setPetWander({ x: (Math.random() - 0.5) * 26, y: (Math.random() - 0.5) * 10 });
        const t = setInterval(tick, 1600 + Math.random() * 1400);
        return () => clearInterval(t);
    }, [a.pet]);
    return (
        <div
            className={`tw-av${isYou ? " is-you" : ""}${a.friend ? " is-friend" : ""}${!isYou && a.inTown === false ? " is-around" : ""}`}
            // During a raid, avatars are click-through so the foes behind them are always tappable (your hero
            // stands in front and used to swallow the taps).
            style={{ left: `${a.x}%`, top: `${a.y}%`, zIndex: 300 + Math.round(a.y) + (isYou ? 100 : 0), transition: `left ${dur}s linear, top ${dur}s linear`, pointerEvents: raiding ? "none" : undefined }}
            onClick={onTap && !raiding ? (e) => { e.stopPropagation(); onTap(); } : undefined}
        >
            {a.chat ? (
                isEmoteMsg(a.chat) ? (
                    <div className="tw-emote-pop">{a.chat}</div>
                ) : (
                    <div className="tw-bubble tw-chat">{a.chat}</div>
                )
            ) : a.typing ? (
                <div className="tw-bubble tw-typing-bubble" aria-label="typing"><span /><span /><span /></div>
            ) : (
                <div className="tw-bubble">{a.status || (isYou ? "🐺 you" : "🐺 around town")}</div>
            )}
            <div className={`tw-sprite${a.moving ? " is-walking" : ""}`} style={{ animationDelay: `${((Math.round(a.x || 0) % 24) / 8).toFixed(2)}s` }}>
                {a.pet ? (
                    <span className="tw-pet-wrap" style={{ [a.facing === -1 ? "right" : "left"]: -52, [a.facing === -1 ? "left" : "right"]: "auto", transform: `translate(${petWander.x}px, ${petWander.y}px)` }}>
                        <span className={`tw-pet-bob${a.moving ? " is-walking" : ""}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="tw-pet" src={a.pet} alt="" draggable={false} style={{ transform: spriteTransform(a.petFlip, a.facing) }} />
                        </span>
                    </span>
                ) : null}
                {a.sprite ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.sprite} alt={a.name} draggable={false} style={{ transform: spriteTransform(a.flip, a.facing) }} />
                ) : (
                    <span className="tw-sprite-fallback" style={{ transform: spriteTransform(a.flip, a.facing) }}>🐺</span>
                )}
                {a.wave ? <span className="tw-wave">👋</span> : null}
            </div>
            <div className="tw-name">{isYou ? "You" : a.name}</div>
        </div>
    );
}

// Raid combat HUD: a shared HP bar (top) + a timed-strike meter and abilities (bottom). The marker sweeps; tap
// Strike when it's in the gold zone for a PERFECT slash, or fire the Power Slash on cooldown.
// Corner HUD for a live raid: time left, kills, and your damage. No timing meter — you just tap the foes.
function RaidHUD({ ev, kills, onExpire }) {
    const [left, setLeft] = useState("");
    const firedRef = useRef(false);
    useEffect(() => {
        firedRef.current = false;
        if (!ev?.endsAt) { setLeft(""); return undefined; }
        const tick = () => {
            const ms = new Date(ev.endsAt).getTime() - Date.now();
            if (ms <= 0) { setLeft("wrapping up…"); if (!firedRef.current) { firedRef.current = true; onExpire && onExpire(); } return; }
            const s = Math.floor(ms / 1000);
            setLeft(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
        };
        tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
    }, [ev?.endsAt, onExpire]);
    return (
        <div className="tw-raid-hud">
            <div className="tw-raid-hud-title">{ev.emoji} {ev.name}{ev.boss ? "" : ev.wave > 1 ? ` · wave ${ev.wave}` : ""}</div>
            <div className="tw-raid-hud-stats">
                {left ? <span title="Time left">⏱️ {left}</span> : null}
                {ev.boss ? <span title="Boss HP">💥 {ev.hpPct ?? 100}%</span> : <span title="Foes you've bested">☠️ {kills}</span>}
            </div>
        </div>
    );
}

// A duel: animate the back-and-forth exchange (two HP bars, damage ticks), then the win/lose + reward.
// The skirmish timing swing: a marker ping-pongs the banded bar, you tap, and how close to centre you land
// decides the blow. Identical bands to the golem's strike and the Forge anvil, so the skill transfers.
function SwingBar({ foe, onSwing, onCancel }) {
    const [marker, setMarker] = useState(0.5);
    const markerRef = useRef(0.5);
    const firedRef = useRef(false);
    const SWEEP_MS = 950; // a touch faster than the golem — skirmish foes are meant to feel scrappy

    useEffect(() => {
        let raf = 0;
        const t0 = performance.now();
        const loop = (t) => {
            const phase = ((t - t0) % (SWEEP_MS * 2)) / SWEEP_MS;
            const pos = phase <= 1 ? phase : 2 - phase;
            markerRef.current = pos; setMarker(pos);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    const fire = () => {
        if (firedRef.current) return;
        firedRef.current = true;
        onSwing(Math.abs(markerRef.current - 0.5));
    };

    return (
        <div className="tw-duel" role="presentation" onClick={onCancel}>
            <div className="tw-swing" onClick={(e) => e.stopPropagation()}>
                <div className="tw-swing-title" style={foe?.tint ? { color: foe.tint } : undefined}>
                    ⚔️ {foe?.label || "Time your strike"}
                </div>
                {foe?.hint ? <div className="tw-swing-hint">{foe.hint}</div> : null}
                <div className="tw-strike-bar" aria-hidden="true">
                    <span className="tw-strike-band is-good" />
                    <span className="tw-strike-band is-great" />
                    <span className="tw-strike-band is-perfect" />
                    <span className="tw-strike-marker" style={{ left: `${marker * 100}%` }} />
                </div>
                <button type="button" className="tw-strike-btn" onClick={fire}>Strike!</button>
                <button type="button" className="tw-swing-skip" onClick={onCancel}>Back off</button>
            </div>
        </div>
    );
}

function DuelModal({ duel, youSprite, youFlip, onClose }) {
    const events = duel.events || [];
    const [step, setStep] = useState(0);      // how many events have played
    const [pop, setPop] = useState(null);     // { side, dmg, crit, k }
    const done = step >= events.length;
    // HP after the last-played event (start both at 100).
    const last = step > 0 ? events[step - 1] : null;
    const meHp = last ? last.me : 100;
    const foeHp = last ? last.foe : 100;
    useEffect(() => {
        if (done) return undefined;
        const ev = events[step];
        const t = setTimeout(() => {
            setPop({ side: ev.side, dmg: ev.dmg, crit: ev.crit, k: step });
            setStep((s) => s + 1);
        }, step === 0 ? 350 : 620);
        return () => clearTimeout(t);
    }, [step, done, events]);
    const r = duel.reward || { xp: 0, coin: 0, loot: [] };
    return (
        <div className="tw-duel" role="dialog" aria-label="Duel">
            <div className="tw-duel-card" onClick={(e) => e.stopPropagation()}>
                <div className="tw-duel-title">⚔️ {duel.name}</div>
                {/* Acknowledge the swing — a timing game with no feedback on the timing is just a button. */}
                {duel.gradeLabel ? <div className={`tw-strike-grade is-${duel.grade}`}>{duel.gradeLabel}</div> : null}
                {/* Spoils exhausted for this raid: say so, rather than silently paying zero. */}
                {duel.capped ? <div className="tw-duel-capped">Spoils spent for this raid — kills still count for badges &amp; quests.</div> : null}
                <div className="tw-duel-arena">
                    <div className={`tw-duel-side${pop?.side === "foe" && !done ? " is-hit" : ""}`}>
                        {youSprite ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={youSprite} alt="You" style={{ transform: youFlip ? "scaleX(-1)" : "none" }} /> : <span className="tw-duel-emoji">🐺</span>}
                        <div className="tw-duel-name">You</div>
                        <div className="tw-duel-hp"><span style={{ width: `${meHp}%` }} /></div>
                        {pop?.side === "foe" ? <span key={pop.k} className={`tw-duel-dmg${pop.crit ? " is-crit" : ""}`}>-{pop.dmg}</span> : null}
                    </div>
                    <div className="tw-duel-vs">VS</div>
                    <div className={`tw-duel-side foe${pop?.side === "me" && !done ? " is-hit" : ""}`}>
                        {duel.foeArt ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={duel.foeArt} alt="Foe" /> : <span className="tw-duel-emoji">{duel.foeEmoji}</span>}
                        <div className="tw-duel-name">{duel.foeEmoji} Foe</div>
                        <div className="tw-duel-hp foe"><span style={{ width: `${foeHp}%` }} /></div>
                        {pop?.side === "me" ? <span key={pop.k} className={`tw-duel-dmg${pop.crit ? " is-crit" : ""}`}>-{pop.dmg}</span> : null}
                    </div>
                </div>
                {done ? (
                    <div className="tw-duel-result">
                        <div className={`tw-duel-verdict ${duel.win ? "win" : "lose"}`}>{duel.win ? "🏆 Victory!" : "💥 Driven back!"}</div>
                        <div className="tw-duel-rewards">
                            {r.xp ? <span className="tw-duel-chip xp">+{r.xp} XP</span> : null}
                            {r.coin ? <span className="tw-duel-chip gold">+{r.coin} 🪙</span> : null}
                            {(r.loot || []).map((l, i) => (
                                <span key={i} className={`tw-duel-chip loot${l.kind === "gear" ? " scrap" : ""}`}>
                                    {l.emoji} {l.label}{l.kind === "gear" ? <em> · scrap</em> : null}
                                </span>
                            ))}
                            {!r.xp && !r.coin && !(r.loot || []).length ? <span className="muted">No spoils this time.</span> : null}
                        </div>
                        <button type="button" className="tw-levelup-btn" onClick={onClose}>{duel.win ? "Huzzah! 🐺" : "Again! ⚔️"}</button>
                    </div>
                ) : (
                    <div className="tw-duel-fighting">⚔️ Locked in battle…</div>
                )}
            </div>
        </div>
    );
}

// BOSS RAID battle — the whole pack rallies on ONE shared boss (like the weekly boss fight). Your hero AUTO-
// attacks while you're here (engaging = being at the fight); everyone who's actively fighting shows as their real
// hero sprite lunging at the boss. Shared HP bar drains for the pack; killing it ends the raid.
// Cooldown is now EARNED, not fixed. These mirror STRIKE_COOLDOWN_MS in town-events.js — the server sends the
// real value back on every strike, so this table is only the optimistic guess used before the reply lands.
// Timing already decided how hard you hit; letting it decide how OFTEN you hit is what makes the bar a rhythm
// you can get better at instead of a damage roll you wait out.
const STRIKE_CD_BY_GRADE = { pixel: 1000, perfect: 1250, great: 1550, good: 1900, miss: 2400 };
const STRIKE_CD_MS = 2400; // worst case, and the pre-first-swing default
// Pure double-tap guard for the raid boss. MUST stay <= the fastest grade cooldown above (and <= the server's
// BOSS_STRIKE_THROTTLE_MS in town-events.js) — anything larger silently eats swings the bar says are ready.
const BOSS_STRIKE_MIN_GAP_MS = 750;

// A FULL ping-pong of the marker. The forge sweeps in 850–1700ms; this used to take 2600, which is why the
// same bands that feel tight at the anvil felt generous here — the bar was simply crawling. It also speeds up
// as the golem weakens, so the fight gets louder as it goes rather than becoming a formality.
const SWEEP_FULL_MS = 1150;   // at full health
const SWEEP_MIN_MS = 700;     // at death's door

function BossRaidModal({ ev, bossArt, you, onStrike, onClose }) {
    const [floats, setFloats] = useState([]); // { id, dmg, crit }
    const [localPct, setLocalPct] = useState(ev.hpPct ?? 100);
    const fidRef = useRef(0);
    const cdRef = useRef(false);
    // Keep the bar in sync with the server (others' hits) but let a local strike drop it instantly.
    useEffect(() => { setLocalPct((p) => Math.min(p, ev.hpPct ?? 100)); }, [ev.hpPct]);
    // ── TIMING STRIKE ────────────────────────────────────────────────────────────────────────────────────────
    // Same feel as the Forge's anvil: a marker sweeps the bar, you tap, and how close to the centre you land
    // decides the multiplier. This replaced a 1.3s auto-attack, which meant a raid was really "leave the tab
    // open and it swings for you" — no skill, and four players alone spiked Vercel to 17x invocations. Standing
    // in the square still does passive damage server-side, so a tap is a burst on top rather than an obligation.
    const [grade, setGrade] = useState(null); // { key, label, dmg } — last swing's result
    const [notice, setNotice] = useState(null); // why a swing didn't land, so a dead tap is never silent
    const [cooling, setCooling] = useState(false); // drives the button's look; the marker never re-renders
    const [combo, setCombo] = useState(0);        // consecutive good-or-better swings
    const [procFx, setProcFx] = useState(null);   // the loud one-off callout when a strike procs
    const markerRef = useRef(0.5);
    const cdUntilRef = useRef(0);
    const swingRef = useRef(false);
    // A full ping-pong is EXACTLY the strike cooldown. They used to be 2300ms and 2600ms — so every swing left
    // 300ms of dead air where the marker kept sweeping and the button did nothing, and the two drifted out of
    // phase, meaning the bar sat somewhere different every time it came back. That mismatch is what read as
    // "the timing is off". Now the button re-arms at the exact moment the marker returns to the left edge.
    const markerElRef = useRef(null);
    const cdElRef = useRef(null);
    // Read inside the animation loop so the tempo tracks the HP bar continuously — no re-render, no restart of
    // the sweep, and therefore no jump in the marker's position when the golem crosses a threshold.
    const hpPctRef = useRef(ev.hpPct ?? 100);
    const cdMsRef = useRef(STRIKE_CD_MS);
    // Mirrored into a ref via an effect rather than assigned during render, so the animation loop can read the
    // current HP every frame without the sweep restarting each time the bar moves.
    useEffect(() => { hpPctRef.current = localPct; }, [localPct]);

    useEffect(() => {
        let raf = 0;
        let last = performance.now();
        let phase = 0; // 0..2, own accumulator so a changing period never teleports the marker
        const loop = (t) => {
            const dt = t - last;
            last = t;
            // Faster as it weakens: full health sweeps in SWEEP_FULL_MS, a sliver in SWEEP_MIN_MS.
            const k = Math.max(0, Math.min(1, hpPctRef.current / 100));
            const full = SWEEP_MIN_MS + (SWEEP_FULL_MS - SWEEP_MIN_MS) * k;
            phase = (phase + (dt / (full / 2))) % 2;
            // Ping-pong 0→1→0 so both edges are reachable and the centre is hit twice a sweep.
            const pos = phase <= 1 ? phase : 2 - phase;
            markerRef.current = pos;
            // Written straight to the DOM rather than through setState. A state update per animation frame
            // re-rendered this whole modal 60x a second, so the marker you SAW lagged behind the markerRef the
            // server is scored against — you were aiming at a stale position and the hit felt like it missed.
            if (markerElRef.current) markerElRef.current.style.left = `${pos * 100}%`;
            // Cooldown sweep on the button, same frame, so "when can I swing again" is visible rather than felt.
            if (cdElRef.current) {
                const left = Math.max(0, cdUntilRef.current - Date.now());
                cdElRef.current.style.transform = `scaleX(${left / (cdMsRef.current || STRIKE_CD_MS)})`;
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    const strike = useCallback(async () => {
        if (cdRef.current || swingRef.current) return;
        swingRef.current = true;
        cdRef.current = true;
        // The marker position is sampled and the swing is JUDGED LOCALLY before anything is awaited, so what you
        // feel is what the bar showed when your finger landed. It used to wait on the round trip before any
        // haptic or grade appeared, which read as input lag on a game that is entirely about timing.
        const dist = Math.abs(markerRef.current - 0.5);
        const localKey = gradeKeyForDist(dist);
        const guessCd = STRIKE_CD_BY_GRADE[localKey] ?? STRIKE_CD_MS;
        cdMsRef.current = guessCd;
        cdUntilRef.current = Date.now() + guessCd;
        let cdTimer = setTimeout(() => { cdRef.current = false; setCooling(false); }, guessCd);
        setCooling(true);
        // Haptics fire NOW, off the local grade, strongest at the top. PIXEL PERFECT previously fell through
        // every branch of this chain and landed on the single weakest buzz — the best hit in the game felt like
        // the worst one.
        try {
            const pattern = localKey === "pixel" ? [30, 30, 30, 30, 60, 40, 110]
                : localKey === "perfect" ? [22, 34, 26, 34, 70]
                    : localKey === "great" ? [16, 30, 40]
                        : localKey === "good" ? [12, 26] : [8];
            navigator.vibrate?.(pattern);
        } catch { /* no haptics here */ }
        const r = await onStrike(dist);
        // The server is the authority on both grade and cooldown; reconcile once its answer lands.
        if (typeof r?.cooldownMs === "number" && r.cooldownMs !== guessCd) {
            clearTimeout(cdTimer);
            const remain = Math.max(0, r.cooldownMs - (guessCd - Math.max(0, cdUntilRef.current - Date.now())));
            cdMsRef.current = r.cooldownMs;
            cdUntilRef.current = Date.now() + remain;
            cdTimer = setTimeout(() => { cdRef.current = false; setCooling(false); }, remain);
        }
        swingRef.current = false;
        if (r?.ok) {
            const id = (fidRef.current += 1);
            setFloats((f) => [...f.slice(-6), { id, dmg: r.damage, crit: r.crit, grade: r.grade }]);
            setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 850);
            setGrade({ key: r.grade, label: r.gradeLabel, dmg: r.damage });
            setTimeout(() => setGrade(null), 1100);
            setCombo(Number(r.combo) || 0);
            if (r.strikeProc) {
                setProcFx({ ...r.strikeProc, k: Date.now() });
                setTimeout(() => setProcFx((p) => (p && p.k === r.strikeProc.k ? null : p)), 1600);
            }
            // The grade buzz already fired locally the instant you tapped. Only a PROC gets a second one — it is
            // the one thing the client cannot know in advance, and it deserves its own flourish.
            if (r.strikeProc) {
                try { navigator.vibrate?.([30, 40, 30, 40, 30, 40, 90]); } catch { /* no haptics here */ }
            }
            if (typeof r.hpPct === "number") setLocalPct(r.hpPct);
        } else {
            // The swing never landed (throttled, boss already dead, request failed). Previously this branch
            // didn't exist: the tap buzzed, started a cooldown, and then nothing appeared and nothing was said.
            // Don't charge a cooldown for a strike that never happened, and always give it a reason.
            clearTimeout(cdTimer);
            cdRef.current = false;
            cdUntilRef.current = 0;
            setCooling(false);
            setNotice(
                r?.error === "too_fast" ? "Easy — wait for the bar to refill"
                    : r?.error === "no_boss" ? "This foe is already down"
                        : "That swing didn't land — try again",
            );
            setTimeout(() => setNotice(null), 1500);
        }
    }, [onStrike]);
    // The fighters ACTUALLY engaged right now (server: struck in the last 90s) + always you.
    const server = ev.bossFighters || [];
    const roster = [{ id: "you", name: "You", sprite: you?.sprite, flip: you?.flip, isYou: true }, ...server.filter((f) => !you || String(f.id) !== String(you.id)).slice(0, 13)];
    return (
        <div className="tw-boss-modal" role="dialog" aria-label="Boss raid">
            <div className="tw-boss-panel" onClick={(e) => e.stopPropagation()}>
                <div className="tw-boss-top">
                    <div className="tw-boss-title">{ev.emoji} {ev.name}</div>
                    <button type="button" className="tw-boss-leave" onClick={onClose} aria-label="Leave the fight">✕ Leave</button>
                </div>
                <div className="tw-boss-stage">
                    {bossArt ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="tw-boss-big" src={bossArt} alt={ev.name} draggable={false} />
                    ) : <span className="tw-boss-bigemoji">{ev.emoji}</span>}
                    {floats.map((f) => <span key={f.id} className={`tw-boss-dmg${f.crit ? " is-crit" : ""}`} style={{ left: `${28 + (f.id * 23) % 44}%` }}>{f.crit ? "✦" : ""}{f.dmg}</span>)}
                </div>
                {/* The pack — every engaged fighter's hero sprite, lunging at the boss (staggered so it's a swarm). */}
                <div className="tw-boss-fighters">
                    {roster.map((r, i) => (
                        <span key={r.id} className={`tw-boss-hero${r.isYou ? " is-you" : ""}`} title={r.name} style={{ animationDelay: `${(i * 0.17) % 1.3}s` }}>
                            {r.sprite ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.sprite} alt="" style={{ transform: r.flip ? "scaleX(-1)" : "none" }} /> : <span className="tw-boss-herofallback">🐺</span>}
                            {r.isYou ? <span className="tw-boss-heroyou">you</span> : null}
                        </span>
                    ))}
                </div>
                <div className="tw-boss-hpwrap">
                    <div className="tw-boss-hpline">Boss HP <b>{Math.max(0, Math.round(localPct))}%</b> · ⚔️ {roster.length} fighting · you dealt {Number(ev.myDamage || 0).toLocaleString()}</div>
                    <div className="tw-boss-hpouter"><span style={{ width: `${Math.max(0, localPct)}%` }} /></div>
                </div>

                {/* The timing strike. Bands mirror the Forge so the skill transfers; the server grades the
                    swing from the distance we report, so this is presentation only. */}
                <div className="tw-strike">
                    <div className={`tw-strike-bar${grade ? " is-hit" : ""}`} aria-hidden="true">
                        <span className="tw-strike-band is-good" />
                        <span className="tw-strike-band is-great" />
                        <span className="tw-strike-band is-perfect" />
                        <span className="tw-strike-zone" style={{ left: "37%" }}>GOOD</span>
                        <span className="tw-strike-zone" style={{ left: "50%" }}>PERFECT</span>
                        <span className="tw-strike-zone" style={{ left: "63%" }}>GOOD</span>
                        <span className="tw-strike-marker" ref={markerElRef} style={{ left: "50%" }} />
                    </div>
                    {/* The button stays PRESSABLE the whole time. It used to just go dead for 2.6 seconds with
                        no indication of when it would come back, which reads as broken rather than as a
                        cooldown. Now a bar drains across it and the marker returns to the edge as it empties,
                        so the rhythm is visible: swing, watch it sweep back, swing again. */}
                    <button
                        type="button"
                        className={`tw-strike-btn${cooling ? " is-cooling" : ""}`}
                        // pointerdown, not click: a click waits for the finger to LIFT, which on a timing game
                        // means the bar has already moved past what you were aiming at.
                        onPointerDown={(e) => { e.preventDefault(); strike(); }}
                    >
                        <span className="tw-strike-cd" ref={cdElRef} aria-hidden="true" />
                        <span className="tw-strike-btn-label">⚔️ Strike</span>
                    </button>
                    {grade ? (
                        <div className={`tw-strike-grade is-${grade.key}`}>{grade.label} · {Number(grade.dmg).toLocaleString()}</div>
                    ) : null}
                    {!grade && notice ? <div className="tw-strike-notice">{notice}</div> : null}
                    {/* THE CHAIN. A run of clean swings is worth more than the same swings scattered — this is
                        the only place that's visible, so it has to read at a glance and climb loudly. */}
                    {combo >= 2 ? (
                        <div className={`tw-combo${combo >= 8 ? " is-hot" : combo >= 5 ? " is-warm" : ""}`} key={combo}>
                            <b>{combo}×</b> CHAIN
                        </div>
                    ) : null}
                </div>

                {procFx ? (
                    <div className="tw-bossproc" key={procFx.k}>
                        <b>{procFx.label}</b>
                        <span>{procFx.tell} ×{procFx.mult}</span>
                    </div>
                ) : null}

                <div className="tw-boss-hint">
                    ⚔️ Time your strike as the marker crosses the middle — the closer to centre, the bigger the hit.
                    {ev.siege ? <> Just standing in the square chips away too{ev.myPassive ? <> (<b>{Number(ev.myPassive).toLocaleString()}</b> so far)</> : null}.</> : null}
                </div>
            </div>
        </div>
    );
}

// A bounty's glyph. Game-Icons, not emoji: emoji are drawn by the operating system, so the same bounty is a
// different picture on an iPhone, an Android and a laptop, and none of the three match this game's art.
const QuestIcon = ({ name }) => {
    const C = Gi[name] || Gi.GiScrollUnfurled;
    return <span className="tw-quest-emoji" aria-hidden="true"><C /></span>;
};

export default function TownClient({ initial }) {
    const [state, setState] = useState(initial || null);
    const [me, setMe] = useState(() => ({ x: initial?.you?.x ?? 50, y: initial?.you?.y ?? 80, facing: initial?.you?.facing ?? 1, moving: false, moveDist: 0, wave: false }));
    const [others, setOthers] = useState({});
    const [viewportW, setViewportW] = useState(360);
    const [roster, setRoster] = useState(false);
    const [panExtra, setPanExtra] = useState(0); // manual drag-to-pan offset on top of the follow-camera
    // Remember where you were standing + looking, so hitting Back from a building drops you right where you left
    // off (not reset to spawn). Restored post-mount from sessionStorage; re-saved on every hero/camera change.
    useEffect(() => {
        try {
            const v = JSON.parse(sessionStorage.getItem("wolfden-town-view") || "null");
            if (v && Date.now() - (v.t || 0) < 1_800_000) { // within 30 min
                setMe((m) => ({ ...m, x: v.x ?? m.x, y: v.y ?? m.y, facing: v.facing ?? m.facing }));
                setPanExtra(v.pan || 0);
            }
        } catch { /* ok */ }
    }, []);
    useEffect(() => {
        try { sessionStorage.setItem("wolfden-town-view", JSON.stringify({ x: me.x, y: me.y, facing: me.facing, pan: panExtra, t: Date.now() })); } catch { /* ok */ }
    }, [me.x, me.y, me.facing, panExtra]);
    const [dragging, setDragging] = useState(false); // true mid-drag → camera follows the finger instantly (no ease)
    const [chatText, setChatText] = useState("");    // town chat composer
    const [myChat, setMyChat] = useState(null);      // my own speech bubble (optimistic, clears after a few s)
    const [menuFor, setMenuFor] = useState(null);    // tapped another player → action sheet
    const [boardOpen, setBoardOpen] = useState(false); // Town Hall (events + plaza fund) panel
    const [contribBusy, setContribBusy] = useState(false);
    const [levelUp, setLevelUp] = useState(null); // town-project level-up celebration { name, level, perk }
    const levelUpClear = useRef(null);
    const [wellFx, setWellFx] = useState(null); // Wishing Well "wish granted" popup { gold, xp }
    const [wishBusy, setWishBusy] = useState(false);
    const wellClear = useRef(null);
    const [inTavern, setInTavern] = useState(false);  // stepped inside the Tavern interior
    const [merchantOpen, setMerchantOpen] = useState(false);
    const [merchantBusy, setMerchantBusy] = useState(false);
    const [merchantFlash, setMerchantFlash] = useState(null);
    const [gambleReveal, setGambleReveal] = useState(null); // big gear-gamble reveal: { phase:"rolling"|"reveal", item, dupeAll, refund }
    const [crierMsg, setCrierMsg] = useState(0);      // which rotating announcement the crier is shouting
    const [questOpen, setQuestOpen] = useState(false);
    const [questBusy, setQuestBusy] = useState(false);
    const [questFlash, setQuestFlash] = useState(null);
    const [smithOpen, setSmithOpen] = useState(false);
    // THE STOCKADE — a plaza fixture holding whoever was last caught cheating. `stockade` is null when empty,
    // in which case nothing renders at all: an empty stockade standing in the square is just set dressing that
    // raises a question nobody can answer.
    const [stockOpen, setStockOpen] = useState(false);
    const [stockade, setStockade] = useState(null);
    const [stockBusy, setStockBusy] = useState(false);
    const [voteOpen, setVoteOpen] = useState(false);
    // WHO you are accusing is a MEMBER, not a string. It used to be a bare "Their @handle" box, which asked
    // you to already know how somebody spells their handle and answered a typo with "No member by that handle"
    // — the one question the server could have answered for you. Now it searches as you type and you pick a
    // hero card, so the target is chosen rather than recalled and cannot be wrong.
    const [nomPick, setNomPick] = useState(null);   // the chosen member row
    const [nomQuery, setNomQuery] = useState("");
    const [nomHits, setNomHits] = useState([]);
    const [nomSeeking, setNomSeeking] = useState(false);
    const [nomCrime, setNomCrime] = useState("");
    useEffect(() => {
        const q = nomQuery.trim();
        if (nomPick || q.length < 2) { setNomHits([]); return undefined; }
        let dead = false;
        setNomSeeking(true);
        // Debounced — a keystroke-per-request would hammer the directory for no benefit.
        const t = setTimeout(() => {
            fetch(`/api/marketplace/members?q=${encodeURIComponent(q)}`, { cache: "no-store" })
                .then((r) => r.json())
                .then((d) => { if (!dead) setNomHits((d?.members || []).slice(0, 6)); })
                .catch(() => { if (!dead) setNomHits([]); })
                .finally(() => { if (!dead) setNomSeeking(false); });
        }, 220);
        return () => { dead = true; clearTimeout(t); };
    }, [nomQuery, nomPick]);
    // Nominating and voting both come back with the refreshed election, so one handler covers the pair.
    const stockPost = async (body) => {
        setStockBusy(true);
        try {
            const r = await fetch("/api/marketplace/stockade", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
            const d = await r.json().catch(() => ({}));
            if (d?.phase) { setStockade((prev) => ({ ...(prev || {}), election: d })); setNomPick(null); setNomQuery(""); setNomCrime(""); }
            else if (d?.error) setStockFlash(d.error === "insufficient_gold" ? "Not enough gold — a nomination costs 250."
                : d.error === "already_nominated" ? "You have already put a name up this session."
                : d.error === "already_up" ? "They are already on the board."
                // The server hands back its own sentence for a rejected charge — it knows WHY it said no.
                : d.error === "bad_crime" ? (d.message || "Keep the charge clean.")
                : d.error === "no_such_member" ? "No member by that handle." : "That did not take.");
        } finally { setStockBusy(false); }
    };
    const [stockFlash, setStockFlash] = useState(null);
    useEffect(() => {
        let dead = false;
        // The whole payload, not just the occupied case. It used to drop everything when nobody was in the
        // stockade — which is exactly when the ELECTION is running and the plaza has the most to show.
        fetch("/api/marketplace/stockade").then((r) => r.json()).then((d) => { if (!dead) setStockade(d || null); }).catch(() => {});
        return () => { dead = true; };
    }, []);
    // Projectiles + the splats they leave. Fired OPTIMISTICALLY on tap, before the request resolves: a lobbed
    // tomato is the feedback, and waiting ~300ms for the server to agree makes the button feel broken. If the
    // request then fails we've shown a tomato for nothing, which costs nothing.
    const [flying, setFlying] = useState([]);
    const [splats, setSplats] = useState([]);
    const [hitFx, setHitFx] = useState(null); // "fruit" | "shame" — drives the recoil on the portrait
    const fxId = useRef(0);
    const lob = (kind) => {
        const id = ++fxId.current;
        if (kind === "fruit") {
            const n = 1 + Math.floor(Math.random() * 2); // one or two, so repeat taps don't look identical
            // PIXELS, not percentages. `translate()` resolves a % against the ELEMENT's own box, so a 30px
            // tomato offset by "-34%" travels about ten pixels and the lob looks like a twitch.
            const shots = Array.from({ length: n }, (_, i) => ({
                id: id * 10 + i,
                from: -120 + Math.random() * 240, // thrown from somewhere along the bottom edge
                to: -34 + Math.random() * 68,     // lands somewhere on him
                spin: Math.random() < 0.5 ? -520 : 520,
                delay: i * 90,
            }));
            setFlying((f) => [...f, ...shots]);
            shots.forEach((sh) => {
                setTimeout(() => {
                    setFlying((f) => f.filter((x) => x.id !== sh.id));
                    setSplats((sp) => [...sp, { id: sh.id, x: sh.to, y: -30 + Math.random() * 70 }]);
                    setHitFx("fruit");
                    setTimeout(() => setHitFx(null), 380);
                    setTimeout(() => setSplats((sp) => sp.filter((x) => x.id !== sh.id)), 2600);
                }, 520 + sh.delay);
            });
        } else {
            setHitFx("shame");
            setTimeout(() => setHitFx(null), 620);
        }
    };
    const stockAct = async (kind) => {
        if (stockBusy) return;
        // The key is a pardon, not a projectile — no throwing animation, and no daily-cap check, because it
        // is rationed by the week on the server rather than by a count this screen carries.
        if (kind !== "unlock" && (kind === "fruit" ? stockade?.fruit : stockade?.shame)?.used < (kind === "fruit" ? stockade?.fruit : stockade?.shame)?.max) lob(kind);
        setStockBusy(true);
        try {
            const r = await fetch("/api/marketplace/stockade", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) });
            const d = await r.json();
            if (d?.ok) {
                setStockade(d.occupant ? d : null);
                setStockFlash(kind === "unlock" ? `${d.freed} walks free.` : kind === "fruit" ? `SPLAT! +${d.xp} XP · +${d.gold} 🪙` : `+${d.xp} XP`);
                setTimeout(() => setStockFlash(null), kind === "unlock" ? 2600 : 1400);
            } else if (d?.error === "out_of_turns") {
                setStockFlash("That's your lot for today.");
                setTimeout(() => setStockFlash(null), 1600);
            }
        } catch { /* a failed tap just does nothing */ }
        setStockBusy(false);
    };
    const [raidEnemies, setRaidEnemies] = useState([]); // per-enemy {id,x,y,hp,hpMax,floats:[],dying}
    const [raidKills, setRaidKills] = useState(0);
    const [raidDamage, setRaidDamage] = useState(0);    // your total damage this raid (optimistic)
    const [raidProc, setRaidProc] = useState(null);     // weapon-skill callout {name,emoji,color,key}
    const [raidRecap, setRaidRecap] = useState(null);   // end-of-raid recap {gold,xp,kills,damage}
    const [duel, setDuel] = useState(null);             // active duel exchange { enemyId, foeArt, foeEmoji, name, win, events, reward }
    // The arena state for a raid bout being fought RIGHT HERE, over the street. Null the rest of the time, and
    // the mounted renderer draws nothing while it is.
    const [fight, setFight] = useState(null);
    const [bossOpen, setBossOpen] = useState(false);    // boss-raid battle modal open
    const [bossReward, setBossReward] = useState(null); // boss KILL completion reward { gold, xp, chest }
    const bossCdRef = useRef(false);
    const [shinyReward, setShinyReward] = useState(null); // claimed the hidden glint → { deco } | "gone"
    const shinyBusyRef = useRef(false);
    const [buffCele, setBuffCele] = useState(null); // hangout buff just earned → celebration { pct }
    const buffSeenRef = useRef(false);
    const [raidHaul, setRaidHaul] = useState({ xp: 0, gold: 0, drops: 0 }); // your running haul this skirmish raid (chests + scrap gear)
    const wasRaidingRef = useRef(false);
    const bossKillRef = useRef(false); // set when YOU land the killing blow, so the end-recap defers to bossReward
    const [raidCd, setRaidCd] = useState(false);        // duel cooldown
    const evIdRef = useRef(null);
    const raidWaveRef = useRef(1);
    const raidCdRef = useRef(false);
    const floatId = useRef(0);
    const sceneRef = useRef(null);
    const moveTimer = useRef(null);
    const chatClear = useRef(null);
    const lastTyping = useRef(0);
    const drag = useRef({ down: false, moved: false, startX: 0, startY: 0, lastX: 0, lastT: 0, vx: 0 });
    const momentumRef = useRef(0);

    // Measure the viewport so the camera can keep the player centered.
    useEffect(() => {
        const el = sceneRef.current; if (!el) return undefined;
        const set = () => setViewportW(el.clientWidth || 360);
        set();
        const ro = new ResizeObserver(set); ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Lock the page scroll while any Town overlay is open, so the background can't scroll underneath it.
    // `fight` counts as a modal: it is a full-screen layer, so the street beneath it must not scroll and the
    // scene's pointer handlers must not fire — else a tap aimed at Attack also walks your hero.
    const anyTownModal = roster || Boolean(menuFor) || boardOpen || merchantOpen || questOpen || smithOpen || stockOpen || Boolean(gambleReveal) || Boolean(fight);
    // …and stop the scene's own pointer handlers from firing while an overlay is up (else tapping a modal
    // button was walking the hero + scrolling the street behind the panel). Read via a ref so the [] -deps
    // pointer callbacks always see the live value.
    const modalOpenRef = useRef(false);
    modalOpenRef.current = anyTownModal;
    useEffect(() => {
        if (typeof document === "undefined" || !anyTownModal) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [anyTownModal]);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/town", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (!d) return;
        setState(d);
        setOthers((prev) => {
            const next = {};
            for (const p of d.players || []) {
                const cur = prev[p.id];
                const home = { x: p.x, y: p.y };
                if (p.walking) next[p.id] = { ...p, home, x: p.x, y: p.y, facing: p.facing, moving: cur ? dist(cur, p) > 1 : false, moveDist: cur ? dist(cur, p) : 0 };
                else if (cur) next[p.id] = { ...cur, ...p, home, x: cur.x, y: cur.y, facing: cur.facing };
                else next[p.id] = { ...p, home, moving: false, moveDist: 0 };
            }
            return next;
        });
    }, []);

    // Main town poll — the steady baseline cost, since every viewer runs it. Two things keep it honest:
    //   1. It only ticks while the tab is VISIBLE. It used to run forever, so a phone with the Town open and the
    //      screen off asked for the whole plaza every 4s all night. That was the bulk of ~944k invocations per
    //      billing period. Coming back to the tab refreshes instantly, so nothing feels stale.
    //   2. 4s while something is actually happening (a raid or boss is live), 8s when the plaza is idle.
    //      Avatars interpolate and wander client-side between updates, so idle at 8s looks identical.
    // 6s while something is happening, 15s when the plaza is idle. Avatars interpolate and wander client-side
    // between updates, so a slower tick looks the same — and this is the single highest-volume request in the
    // app, so the interval is the biggest lever on compute there is.
    // Nothing is polled while you are in a fight. The street underneath cannot be seen or touched, and a
    // reload landing mid-bout re-renders the whole scene behind the overlay for a picture nobody is looking
    // at. The way out of the fight reloads once, which is the only refresh that matters.
    const townPollMs = fight ? null : (state?.event ? 6000 : 15000);
    useVisiblePoll(load, townPollMs);

    // Ambient wander for idle players.
    useEffect(() => {
        const t = setInterval(() => {
            setOthers((prev) => {
                const next = { ...prev };
                for (const [id, p] of Object.entries(prev)) {
                    if (p.walking) continue;
                    if (Math.random() < 0.5) {
                        const nx = clamp((p.home?.x ?? p.x) + (Math.random() - 0.5) * 12, 3, 97);
                        const ny = clamp((p.home?.y ?? p.y) + (Math.random() - 0.5) * 6, 72, 86);
                        next[id] = { ...p, x: nx, y: ny, facing: nx < p.x ? -1 : 1, moving: true, moveDist: dist(p, { x: nx, y: ny }) };
                    } else if (p.moving) next[id] = { ...p, moving: false };
                }
                return next;
            });
        }, 2800);
        return () => clearInterval(t);
    }, []);

    // The foes come from the SERVER now (ev.swarm), so every client draws the same goblins in the same places and
    // can see who's locked onto each one. This used to be generated locally with Math.random() positions — which
    // is exactly why a raid felt like everyone fighting their own private copy of the swarm.
    useEffect(() => {
        const ev = state?.event;
        if (!ev || ev.defeated || ev.boss) {
            evIdRef.current = ev?.id ?? null;
            if (!ev || ev.boss) setRaidEnemies([]);
            return;
        }
        if (evIdRef.current !== ev.id) { evIdRef.current = ev.id; setRaidDamage(ev.myDamage || 0); }
        // ── THE KILL COUNT IS THE SERVER'S, NOT OURS ─────────────────────────────────────────────────
        // It used to be a local counter incremented by resolveSwing, which was the right place when a tap
        // WAS the kill. Tapping a raider opens a real bout now and the kill is booked by the arena engine,
        // so this counter was never touched again — the HUD read 0 all raid and the end-of-raid recap
        // announced "0 foes bested" to people who had cleared twenty. `myHits` is that same number kept
        // where it cannot drift: one row per member per event, written by duelRaidEnemy itself.
        setRaidKills(Number(ev.myHits) || 0);
        raidWaveRef.current = ev.swarm?.wave ?? 1;
        setRaidEnemies((prev) => (ev.swarm?.enemies || []).map((e) => {
            // Keep any in-flight death animation / damage floats for a foe we already know about.
            const was = prev.find((x) => String(x.id) === String(e.id));
            return { ...e, floats: was?.floats || [], dying: was?.dying || false };
        }));
    }, [state?.event]); // eslint-disable-line react-hooks/exhaustive-deps

    const walkToWorld = useCallback((worldXPct, worldYPct) => {
        setPanExtra(0); // walking re-centres the camera on you
        setMe((m) => {
            const x = clamp(worldXPct, 1, 99);
            const y = clamp(worldYPct ?? m.y, 74, 90);
            const facing = x < m.x ? -1 : 1;
            const d = dist(m, { x, y });
            clearTimeout(moveTimer.current);
            moveTimer.current = setTimeout(() => {
                fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ x, y, facing }) }).catch(() => {});
            }, 250);
            return { ...m, x, y, facing, moving: true, moveDist: d };
        });
    }, []);

    // Camera = follow you, plus any manual drag-to-pan, clamped to the world.
    const maxScroll = Math.max(0, WORLD_W - viewportW);
    const followCam = clamp((me.x / 100) * WORLD_W - viewportW / 2, 0, maxScroll);
    const cameraPx = clamp(followCam + panExtra, 0, maxScroll);

    // Pointer: a DRAG pans the street (free look, with flick momentum); a TAP walks you there.
    const onPointerDown = useCallback((e) => {
        if (modalOpenRef.current) return; // an overlay is up — don't let the street react behind it
        cancelAnimationFrame(momentumRef.current); // stop any glide
        drag.current = { down: true, moved: false, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastT: e.timeStamp || 0, vx: 0, captured: false, id: e.pointerId };
        // NOTE: capture is deliberately NOT taken here — see onPointerMove. Capturing on pointerdown retargets
        // the pointerup to the scene, and a MOUSE click is dispatched to the common ancestor of down and up, so
        // every button in Town stopped receiving click on desktop. Touch pointers are implicitly captured to
        // their own target already, which is why phones were unaffected and this hid for so long.
    }, []);
    const onPointerMove = useCallback((e) => {
        const d = drag.current; if (!d.down) return;
        const dx = e.clientX - d.lastX;
        // Treat as a horizontal pan as soon as it's mostly-horizontal (low threshold = less friction to start).
        if (!d.moved && Math.abs(e.clientX - d.startX) > 4 && Math.abs(e.clientX - d.startX) > Math.abs(e.clientY - d.startY) * 0.8) {
            d.moved = true; setDragging(true);
            // Only NOW take the pointer — once this is a pan there is no click to preserve, and capture is what
            // keeps the drag tracking when the cursor leaves the scene mid-flick.
            try { e.currentTarget.setPointerCapture(e.pointerId); d.captured = true; } catch { /* ok */ }
        }
        if (d.moved) {
            const t = e.timeStamp || 0;
            const dt = Math.max(1, t - d.lastT);
            d.vx = dx / dt; // px per ms — for the release flick
            d.lastX = e.clientX; d.lastT = t;
            setPanExtra((p) => clamp(followCam + p - dx, 0, maxScroll) - followCam);
        }
    }, [followCam, maxScroll]);
    const onPointerUp = useCallback((e) => {
        const d = drag.current; d.down = false;
        if (d.captured) { try { e.currentTarget.releasePointerCapture(d.id); } catch { /* ok */ } d.captured = false; }
        if (d.moved) {
            // Flick momentum: keep gliding (with the camera transition OFF the whole time, so it tracks the
            // finger 1:1 like a native scroll instead of easing every frame) until it decays out.
            let v = d.vx * 16; // ≈ px per frame
            const glide = () => {
                v *= 0.94;
                if (Math.abs(v) < 0.4) { setDragging(false); return; }
                setPanExtra((p) => clamp(followCam + p - v, 0, maxScroll) - followCam);
                momentumRef.current = requestAnimationFrame(glide);
            };
            if (Math.abs(v) > 0.8) { momentumRef.current = requestAnimationFrame(glide); } // keep dragging=true → no transition
            else setDragging(false);
            return; // was a pan, not a tap
        }
        setDragging(false);
        // Doors, avatars, NPCs, enemies and any button/link handle themselves — don't ALSO walk the hero there.
        if (e.target.closest("button, a, .tw-av")) return;
        const rect = sceneRef.current?.getBoundingClientRect(); if (!rect) return;
        const worldX = ((e.clientX - rect.left + cameraPx) / WORLD_W) * 100;
        const worldY = ((e.clientY - rect.top) / rect.height) * 100;
        walkToWorld(worldX, worldY);
    }, [cameraPx, followCam, maxScroll, walkToWorld]);

    const wave = useCallback(() => { setMe((m) => ({ ...m, wave: true })); setTimeout(() => setMe((m) => ({ ...m, wave: false })), 1600); }, []);

    // Fire-and-forget town action (chat / typing).
    const postAction = useCallback((payload) => {
        fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});
    }, []);
    // Pop my own speech bubble immediately (optimistic), auto-clearing so it matches the ~8s server window.
    const showMyChat = useCallback((text) => {
        setMyChat(text);
        clearTimeout(chatClear.current);
        chatClear.current = setTimeout(() => setMyChat(null), 7000);
    }, []);
    const sendChat = useCallback((e) => {
        if (e) e.preventDefault();
        const body = chatText.trim();
        if (!body) return;
        setChatText("");
        showMyChat(body.slice(0, 200));
        postAction({ action: "chat", body });
    }, [chatText, showMyChat, postAction]);
    const quickEmote = useCallback((emoji) => { showMyChat(emoji); postAction({ action: "chat", body: emoji }); }, [showMyChat, postAction]);
    const onChatChange = useCallback((e) => {
        setChatText(e.target.value);
        const now = Date.now();
        if (now - lastTyping.current > 2500) { lastTyping.current = now; postAction({ action: "typing" }); } // throttle typing pings
    }, [postAction]);
    // Contribute gold to a Town Development project, then refresh the coin HUD + town state.
    const contribute = useCallback(async (projectId, amount) => {
        const proj = (state?.projects || []).find((p) => p.id === projectId); // capture name + the perk it's leveling INTO
        setContribBusy(projectId);
        const r = await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "project_contribute", projectId, amount }) }).then((x) => x.json()).catch(() => null);
        setContribBusy(false);
        if (r?.ok) {
            try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ }
            if (r.leveledTo) { // it crossed a level — celebrate the shared upgrade so it doesn't happen silently
                setLevelUp({ name: proj?.name || "The town", level: r.leveledTo, perk: proj?.perkNext || null });
                clearTimeout(levelUpClear.current);
                levelUpClear.current = setTimeout(() => setLevelUp(null), 6000);
            }
            load();
        }
    }, [load, state?.projects]);
    // Wishing Well: toss a coin (once/day) at the plaza fountain to claim the town's daily blessing of gold.
    const claimWell = useCallback(async () => {
        if (wishBusy) return;
        setWishBusy(true);
        const r = await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "well_claim" }) }).then((x) => x.json()).catch(() => null);
        setWishBusy(false);
        if (r?.ok) {
            try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ }
            setWellFx({ gold: r.gold, xp: r.xp });
            clearTimeout(wellClear.current);
            wellClear.current = setTimeout(() => setWellFx(null), 4500);
            load();
        }
    }, [wishBusy, load]);
    // Tap a raid enemy: 1s cooldown, server computes your real (stat-based) damage + crit + weapon-skill proc.
    // Apply it to THAT enemy's HP bar with a floating number; kill it when its bar empties; recap on the win.
    // Click a foe → a back-and-forth DUEL (like the ship battles). The server resolves the exchange; we open the
    // duel modal to animate it, then reward. On a win the foe falls + the field resyncs (fresh foes keep coming).
    // Tapping a foe opens the TIMING swing; the duel only resolves once they've taken their shot, so a kill is
    // skill rather than a stat roll. Same bands as the Forge anvil and the golem, so the feel carries across.
    const [swing, setSwing] = useState(null); // { enemyId, foeArt } while the bar is up
    const [raidNote, setRaidNote] = useState(null);   // why a tap did nothing — said out loud, never swallowed
    const startDuel = useCallback(async (enemyId, foeArt) => {
        const ev = state?.event; if (!ev || raidCdRef.current || duel || swing) return;
        // Carry the archetype through so the swing screen can say what you've picked a fight with.
        const foe = (ev.swarm?.enemies || []).find((e) => String(e.id) === String(enemyId)) || null;
        // ── THE TIMING BAR IS GONE ───────────────────────────────────────────────────────────────────────
        // Tapping a raider used to open a one-swing accuracy game, graded on how close to the centre you
        // tapped — your class, your tree and your skills had nothing to do with it. It claims the foe and
        // opens a REAL bout now, on the same engine and the same screen the Arena uses, because a second
        // combat system is how two parts of a game end up disagreeing about what Might does.
        //
        // ONE BOUT UI, MOUNTED HERE. That was always the right half of the idea; the other half — sending the
        // player to /marketplace/arena to get it — was the mistake. A raid is a thing you do IN the plaza, and
        // walking them out of it lost them the wave, lost them the way back, and had at least one member
        // conclude a raid was a single fight because the Arena is where it left them.
        //
        // ArenaClient is mounted below in `boutOnly` mode: it is the same renderer, drawing the same bout off
        // the same row, as a fixed full-screen layer over the street. Nothing is copied and nothing navigates.
        setSwing({ enemyId, foeArt: foeArt || null, label: foe?.label || null, hint: foe?.hint || null, tint: foe?.tint || null, opening: true });
        const r = await fetch("/api/marketplace/town", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "engage", eventId: ev.id, enemyId }),
        }).then((x) => x.json()).catch(() => null);
        // `engage` hands back the whole arena state, which is what the fight renderer needs to draw YOUR
        // fighter and not just the foe.
        if (r?.ok) { setSwing(null); setFight(r); return; }
        setSwing(null);
        // ── WALKING BACK INTO A FIGHT YOU STEPPED OUT OF ─────────────────────────────────────────────────
        // The fight screen has an exit door, and out here it hands the street back with the bout still open
        // on your row. Tapping a raider then answers `bout_in_progress`, which used to be a dead end: the
        // message told you to finish a fight you had no way to reach. Fetch the live arena state and re-mount
        // it instead — it is the same bout, so this resumes rather than starting anything.
        if (r?.error === "bout_in_progress") {
            const st = await fetch("/api/marketplace/arena", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
            if (st?.bout && !st.bout.over) { setFight(st); return; }
        }
        // Somebody else got to it first, or a bout of yours is already open. Say which.
        setRaidNote(r?.error === "bout_in_progress"
            ? "Finish the fight you are already in first."
            : r?.who ? `${r.who} is already on that one.` : "That one is already taken.");
        setTimeout(() => setRaidNote(null), 2600);
    }, [state?.event, duel, swing]);

    // Resolve the duel with the swing's distance-from-centre; the server grades and clamps it.
    const resolveSwing = useCallback(async (enemyId, foeArt, dist) => {
        const ev = state?.event; if (!ev) return;
        setSwing(null);
        raidCdRef.current = true; setRaidCd(true);
        setTimeout(() => { raidCdRef.current = false; setRaidCd(false); }, 700);
        const r = await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "duel", eventId: ev.id, enemyId, dist }) }).then((x) => x.json()).catch(() => null);
        if (!r?.ok) return; // too_fast / no_event
        if (r.win && typeof r.wins === "number") setRaidKills(r.wins);
        if (r.win && r.reward) setRaidHaul((h) => ({ xp: h.xp + (r.reward.xp || 0), gold: h.gold + (r.reward.coin || 0), drops: h.drops + ((r.reward.loot || []).length || 0) }));
        setDuel({ enemyId, foeArt: foeArt || null, foeEmoji: r.foeEmoji || ev.emoji, name: ev.name, win: r.win, events: r.events || [], reward: r.reward || { xp: 0, coin: 0, loot: [] }, grade: r.grade || null, gradeLabel: r.gradeLabel || null, capped: Boolean(r.capped), cleared: r.cleared || null });
    }, [state?.event]);
    const closeDuel = useCallback(() => {
        const d = duel; setDuel(null);
        if (d?.win) {
            setRaidEnemies((prev) => prev.map((en) => (en.id === d.enemyId ? { ...en, dying: true } : en)));
            try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ }
        }
        setTimeout(() => load(), 350);
    }, [duel, load]);
    // BOSS RAID: strike the shared boss. Returns the server result so the modal can float damage + drain the bar.
    // `dist` is how far the timing marker was from centre when they swung; the server grades it.
    const bossStrike = useCallback(async (dist = null) => {
        const ev = state?.event;
        if (!ev) return { ok: false, error: "no_boss" };
        // Anti-spam ONLY — matched to the server's BOSS_STRIKE_THROTTLE_MS (750ms), never above it. This used to
        // be a flat 2500ms, which was stricter than EVERY grade cooldown the swing bar re-arms on (pixel 1000 …
        // miss 2400). So the bar would say "ready", the tap would buzz and start a fresh cooldown, and this
        // would silently drop the strike on the floor — worst on the best-timed hits, which had a 1.5s dead
        // window. Rejections are also now REPORTED rather than returned as a bare null.
        if (bossCdRef.current) return { ok: false, error: "too_fast" };
        bossCdRef.current = true; setTimeout(() => { bossCdRef.current = false; }, BOSS_STRIKE_MIN_GAP_MS);
        const r = await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "boss_strike", eventId: ev.id, dist }) }).then((x) => x.json()).catch(() => null);
        if (r?.ok) {
            try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ }
            if (r.killed) { bossKillRef.current = true; setBossOpen(false); setBossReward(r.reward || { gold: 0, xp: 0 }); setTimeout(() => load(), 500); }
        }
        return r;
    }, [state?.event, load]);
    // While the boss modal is open, poll faster so the shared HP bar reflects everyone's hits. 2s per viewer
    // was a big slice of the invocation spike; 4s still feels live because the bar animates between updates.
    useVisiblePoll(load, bossOpen ? 4000 : null, { leading: false });
    // If the boss dies (event clears) while the modal's open, close it.
    useEffect(() => { if (bossOpen && (!state?.event || state.event.defeated || !state.event.boss)) setBossOpen(false); }, [bossOpen, state?.event]);
    // RAID CONCLUSION — the dopamine moment. When a raid ENDS (event goes away), pop a recap so it never just
    // hangs at 0:00. A boss YOU felled shows its own reward modal, so skip the recap then.
    const wasBossRef = useRef(false);
    useEffect(() => {
        const active = Boolean(state?.event && !state.event.defeated);
        if (!wasRaidingRef.current && active) { setRaidHaul({ xp: 0, gold: 0, drops: 0 }); setRaidKills(0); } // new raid → reset
        if (active) wasBossRef.current = Boolean(state.event.boss);
        if (wasRaidingRef.current && !active) {
            if (!bossKillRef.current) setRaidRecap({ kills: raidKills, xp: raidHaul.xp, gold: raidHaul.gold, drops: raidHaul.drops, boss: wasBossRef.current });
            bossKillRef.current = false;
        }
        wasRaidingRef.current = active;
    }, [state?.event]); // eslint-disable-line react-hooks/exhaustive-deps

    // The SERVER-side itemised recap. The old client-accumulated one was skipped entirely on a boss kill, so
    // anyone who didn't land the final blow saw nothing — no damage, no rewards. This arrives in town state for
    // everyone who took part, so it also survives a refresh.
    const [bossRecap, setBossRecap] = useState(null);
    const seenRecapRef = useRef(null);
    // Closing the recap has to be recorded SERVER-side. seenRecapRef alone lives and dies with this component,
    // so a refresh (or walking back into the Town) inside the 10-minute recap window re-opened it every time
    // with no way to dismiss it for good.
    const dismissRecap = useCallback(() => {
        const id = bossRecap?.eventId;
        setBossRecap(null);
        if (id) {
            seenRecapRef.current = id;
            fetch("/api/marketplace/town", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "recap_seen", eventId: id }),
            }).catch(() => { /* the local ref still covers this session */ });
        }
    }, [bossRecap?.eventId]);
    useEffect(() => {
        const rc = state?.raidRecap;
        if (!rc) return;
        // Belt and braces on the payout race (the server now withholds the recap until rewards are settled):
        // if a recap somehow arrives with nothing itemised, don't burn the "seen" marker on it — let a later
        // poll replace it. Freezing on the first payload is what made an empty recap permanent.
        const settled = Boolean(rc.me?.rewarded || rc.me?.gold || rc.me?.xp || rc.me?.chest);
        if (seenRecapRef.current === rc.eventId && settled) return;
        if (settled) seenRecapRef.current = rc.eventId;
        setBossRecap(rc);
        setRaidRecap(null); // the server recap supersedes the thin client one
        // Felling a raid boss is the biggest thing that happens in the Town — make it land in the hand too,
        // longer for the podium. Best-effort; plenty of browsers have no vibrate.
        if (settled && rc.killed) {
            try {
                const podium = rc.me?.rank && rc.me.rank <= 3;
                navigator.vibrate?.(podium ? [40, 60, 40, 60, 90] : [30, 70, 55]);
            } catch { /* no haptics here */ }
        }
    }, [state?.raidRecap]);
    // Owner test control: spawn an event from inside the Town (real trigger is the admin app).
    const spawnEvent = useCallback(async (kind) => {
        await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "spawn_event", kind }) }).catch(() => {});
        load();
    }, [load]);
    // Owner test control: force-end the active raid (so you can spawn a fresh one without waiting the timer out).
    const endEvent = useCallback(async () => {
        setBossOpen(false);
        await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "end_event" }) }).catch(() => {});
        load();
    }, [load]);

    // Tap the hidden shiny glint → race everyone to claim it. First tap wins a source-exclusive decoration.
    const claimShiny = useCallback(async () => {
        if (shinyBusyRef.current || !state?.shiny) return;
        shinyBusyRef.current = true;
        const r = await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "claim_shiny", shinyId: state.shiny.id }) }).then((x) => x.json()).catch(() => null);
        shinyBusyRef.current = false;
        if (r?.ok) { setShinyReward({ deco: r.deco }); try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ } }
        else setShinyReward("gone");
        load();
    }, [state?.shiny, load]);

    // Hangout buff earned → celebrate ONCE (justGranted fires for a single poll; guard against re-showing).
    useEffect(() => {
        if (state?.hangout?.justGranted && !buffSeenRef.current) {
            buffSeenRef.current = true;
            setBuffCele({ pct: state.hangout.pct || 5 });
            setTimeout(() => setBuffCele(null), 6000);
        }
        if (!state?.hangout?.active) buffSeenRef.current = false; // reset so the NEXT earn can celebrate again
    }, [state?.hangout?.justGranted, state?.hangout?.active, state?.hangout?.pct]);

    const you = state?.you;
    const art = state?.art || {};
    const layered = Boolean(art.sky?.url && art.cobble?.url); // parallax sky + tiling cobble (reliable) vs legacy wide bg
    const buildings = state?.buildings || [];
    const projects = state?.projects || [];
    const townBonuses = state?.bonuses || {};
    const well = state?.well || null; // Wishing Well daily-claim state { gold, xp, claimedToday } | null until funded
    // The well is laid out WITH the buildings (server-side) so it can't be drawn on top of one — it used to be
    // pinned at a hardcoded 20%, which is exactly where an evenly-spaced row of ~11 buildings puts the third.
    const wellX = Number(state?.wellX) || 20;
    // Per-building counts of what's waiting, computed server-side so the pill in the nav and the pins on the
    // buildings can never disagree about how much there is to do.
    const todo = state?.todo || { total: 0, byBuilding: {} };
    const canWish = Boolean(well && !well.claimedToday);
    const raidActive = Boolean(state?.event && !state.event.defeated); // during a raid: hide NPCs + lock the buildings
    const marketDay = Boolean(state?.store?.open) && !raidActive; // physical shop open → the plaza celebrates "Market Day"
    const effDepth = 6; // every parallax skyline band is on by default now (no funding gate)
    const otherList = useMemo(() => Object.values(others), [others]);
    // The Town Crier's rotating live announcements (assembled from the current town state).
    const crierLines = useMemo(() => {
        const lines = [];
        if (state?.event) lines.push(`${state.event.name} in the plaza — to arms!`);
        if (state?.store?.open) lines.push(`The Den is OPEN til ${state.store.closesLabel} — come on down!`);
        else if (state?.store?.nextOpenLabel) lines.push(`Shop's closed — opens ${state.store.nextOpenLabel}!`);
        lines.push(`${state?.onlineCount ?? 1} wolves about the Den tonight!`);
        const nextProj = (state?.projects || []).find((p) => !p.maxed);
        if (nextProj) lines.push(`Chip in to grow the ${nextProj.name}!`);
        lines.push("The tavern's warm — pull up a stool!");
        lines.push("Hear ye! Fresh happenings on the board!");
        return lines;
    }, [state?.event, state?.onlineCount, state?.projects]);
    useEffect(() => { const t = setInterval(() => setCrierMsg((m) => m + 1), 4500); return () => clearInterval(t); }, []);
    // Buy a chest from the Traveling Merchant.
    const buyChest = useCallback(async (tier) => {
        setMerchantBusy(true);
        const r = await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "merchant_buy", tier }) }).then((x) => x.json()).catch(() => null);
        setMerchantBusy(false);
        if (r?.ok) { setMerchantFlash(`🎁 Bought a ${r.label}! Open it over in your Gear.`); try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ } load(); }
        else setMerchantFlash(r?.error === "insufficient_gold" ? "Not enough gold, friend." : r?.error === "daily_limit" ? "You've bought your fill of that chest today — come back tomorrow." : "Couldn't buy that.");
    }, [load]);
    // High-roller table: gamble 1,000 gold on a random piece of gear (rarely up to Tier 4). Drives a full-screen
    // suspense→reveal so the surprise actually LANDS: dice tumble ≥1.6s, then a rarity-colored burst reveal.
    const gambleGear = useCallback(async () => {
        if (merchantBusy) return;
        setMerchantBusy(true);
        setMerchantFlash(null);
        setGambleReveal({ phase: "rolling" });
        const started = (typeof performance !== "undefined" ? performance.now() : 0);
        const r = await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "merchant_gamble" }) }).then((x) => x.json()).catch(() => null);
        const wait = Math.max(0, 1650 - ((typeof performance !== "undefined" ? performance.now() : 0) - started)); // let the dice tumble a beat
        setTimeout(() => {
            setMerchantBusy(false);
            if (r?.ok) {
                setGambleReveal({ phase: "reveal", item: r.item || null, dupeAll: Boolean(r.dupeAll), refund: r.refund || 0 });
                try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ } load();
            } else {
                setGambleReveal(null);
                setMerchantFlash(r?.error === "insufficient_gold" ? "That table's 1,000 gold, friend." : "The dice wouldn't roll.");
            }
        }, wait);
    }, [load, merchantBusy]);
    // Claim a completed town bounty from the quest-giver.
    const claimQuest = useCallback(async (key) => {
        setQuestBusy(true);
        const r = await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "quest_claim", key }) }).then((x) => x.json()).catch(() => null);
        setQuestBusy(false);
        if (r?.ok) { setQuestFlash(`🪙 +${r.reward} gold — ${r.label} done!`); try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ } load(); }
        else setQuestFlash("That bounty isn't ready yet.");
    }, [load]);
    const questsClaimable = useMemo(() => (state?.quests || []).filter((q) => q.done && !q.claimed).length, [state?.quests]);
    // Owner: toggle the auto opening-events cron.
    const toggleEventsLive = useCallback(async () => {
        await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set_events_live", on: !state?.eventsLive }) }).catch(() => {});
        load();
    }, [state?.eventsLive, load]);
    // Owner: whether game announcements also ring the ledger app. Off by default — the owner's member account
    // already gets these in the browser, so leaving it on delivered every raid twice, into the app that carries
    // orders and customer messages.
    const toggleOwnerGamePush = useCallback(async () => {
        await fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set_owner_game_push", on: !state?.ownerGamePush }) }).catch(() => {});
        load();
    }, [state?.ownerGamePush, load]);
    const camDur = clamp((me.moveDist || 0) * 0.05, 0.4, 2.6);

    if (state && state.signedIn === false) {
        return <section className="card"><p className="muted" style={{ margin: 0 }}>🏘️ Sign in to enter the Wolf Den Town.</p></section>;
    }

    // Stepped inside the Tavern — swap the plaza for the cozy interior.
    if (inTavern) {
        return (
            <div className="stack reveal">
                <TavernInterior bgUrl={art.tavern_interior?.url} diceUrl={art.dice?.url} npcArt={{ barkeep: art.barkeep?.url, gambler: art.gambler?.url }} iconArt={{ pint: art.tavern_pint?.url, round: art.tavern_round?.url }} me={you ? { sprite: you.sprite, flip: you.flip } : null} onLeave={() => setInTavern(false)} />
            </div>
        );
    }

    return (
        <div className="stack reveal">
            <section className="tw-hdr">
                <div className="tw-hdr-top">
                    <h1 className="tw-hdr-title">🏘️ Wolf Den Town</h1>
                    {state?.store ? (
                        <span className={`tw-openchip${state.store.open ? " is-open" : ""}`} title="The physical shop's hours">
                            {state.store.open ? `Open til ${state.store.closesLabel}` : `Closed · opens ${state.store.nextOpenLabel}`}
                        </span>
                    ) : null}
                    {state?.hangout?.active ? (
                        <span className="tw-buffpill" title="Earned by hanging out in the plaza">✨ +{state.hangout.pct}% XP & gold · {fmtLeft(state.hangout.secsLeft)}</span>
                    ) : null}
                </div>
                <div className="tw-hdr-row">
                    <button type="button" className="tw-pop is-here" onClick={() => setRoster(true)} title="Members on this page right now">
                        <span className="tw-pop-dot" /> <b>{state?.inTownCount ?? 1}</b> in town
                    </button>
                    <button type="button" className="tw-pop is-around" onClick={() => setRoster(true)} title="Members online elsewhere on the site">
                        <span className="tw-pop-dot" /> <b>{state?.aroundCount ?? 0}</b> around
                    </button>
                    <button type="button" className="tw-hdr-btn" onClick={() => setRoster(true)}>👥 Who&apos;s here</button>
                    <button type="button" className="tw-hdr-btn" onClick={() => setBoardOpen(true)}>🏛️ Town Hall</button>
                </div>
                <p className="tw-hdr-sub">Tap the street to walk · tap a building to enter. <b>In town</b> = here now; <b>around</b> = online elsewhere.</p>
            </section>

            <div ref={sceneRef} className="tw-scene" style={anyTownModal ? { pointerEvents: "none" } : undefined} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current.down = false; setDragging(false); }} role="presentation">
                <SceneMusic vibe={raidActive ? "raid" : "town"} />
                {/* ONE status bubble, top-left: who's here AND whether the shop is open. These were two separate
                    absolutely-positioned pills and they overlapped each other the moment the Den was open —
                    the "1 in town" count sat underneath "Open until 9 PM". They're the same kind of
                    information (what's true right now), so they're one control. Tap = who's here. */}
                {!raidActive ? (
                    <button type="button" className="tw-online-badge" onClick={() => setRoster(true)} title="Members here right now">
                        <span className="tw-online-dot" />{state?.inTownCount ?? 1} in town
                        {marketDay ? (
                            <>
                                <span className="tw-online-sep">·</span>
                                <span className="tw-online-open">Open til {state.store.closesLabel}</span>
                                <span className="tw-online-xp">+10% XP</span>
                            </>
                        ) : null}
                    </button>
                ) : null}
                {/* The hidden shiny glint — barely visible, tucked up in the sky/rooftops. Tap to claim it. */}
                {/* Far parallax SKY layer (scrolls slower). Generic + mirror-tiled → seamless. */}
                {layered ? (
                    <div className="tw-far" aria-hidden="true" style={{ transform: `translateX(${-cameraPx * 0.3}px)`, transition: dragging ? "none" : `transform ${camDur}s linear` }}>
                        {TILES(11).map((k) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={k} src={art.sky.url} alt="" draggable={false} />
                        ))}
                    </div>
                ) : (!art.background ? <><div className="tw-sky" aria-hidden="true" /><div className="tw-ground" aria-hidden="true" /></> : null)}
                {/* "Grow the Plaza" DEPTH layers — each funded level stacks one more band FURTHER back (spires →
                    hills → distant castles). Farther layers scroll slower + sit hazier, so the town grows deeper
                    as it's invested in. Painted high-N-first so the nearest funded layer sits on top. */}
                {/* depth2 (the pale hills/mountains band) is intentionally skipped — it read as a washed-out white layer. */}
                {layered ? [6, 5, 4, 3, 1].filter((n) => effDepth >= n && art[`depth${n}`]?.url).map((n) => {
                    const factor = Math.max(0.3, 0.47 - (n - 1) * 0.03); // farther back → slower parallax
                    return (
                        <div key={n} className="tw-depth" aria-hidden="true" style={{ opacity: Math.max(0.5, 0.92 - (n - 1) * 0.08), transform: `translateX(${-cameraPx * factor}px)`, transition: dragging ? "none" : `transform ${camDur}s linear` }}>
                            {TILES(11).map((k) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={k} src={art[`depth${n}`].url} alt="" draggable={false} />
                            ))}
                        </div>
                    );
                }) : null}
                {/* MIDGROUND skyline band (parallax between the far sky and the street) — a nearer row of town
                    rooftops that sits on the horizon. Transparent-topped PNG, buildings along its bottom edge.
                    This is what "Grow the Plaza" deepens over time (future depth tiers swap richer art in). */}
                {layered && art.mid?.url ? (
                    <div className="tw-mid" aria-hidden="true" style={{ transform: `translateX(${-cameraPx * 0.55}px)`, transition: dragging ? "none" : `transform ${camDur}s linear` }}>
                        {TILES(13).map((k) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={k} src={art.mid.url} alt="" draggable={false} />
                        ))}
                    </div>
                ) : null}
                {/* The wide world that scrolls under a fixed camera */}
                <div className="tw-world" style={{ width: `${WORLD_W}px`, transform: `translateX(${-cameraPx}px)`, transition: dragging ? "none" : `transform ${camDur}s linear` }}>
                    {/* THE HIDDEN GLIMMER — lives INSIDE the world, so its x/y pin it to a real spot in the town
                        that you have to walk to and spot. It used to sit outside this container, which meant it
                        was positioned against the viewport and slid along with the screen: it could never be
                        "somewhere in the plaza", because it was always wherever you happened to be looking. */}
                    {!raidActive && state?.shiny ? (
                        <button type="button" className="tw-shiny" style={{ left: `${state.shiny.x}%`, top: `${state.shiny.y}%` }} onClick={claimShiny} aria-label="A faint glimmer…" title="…is something glinting up there?">
                            <span className="tw-shiny-core" />
                        </button>
                    ) : null}
                    {/* Ground: tiling cobblestone band (layered), else the legacy wide background image */}
                    {layered ? (
                        <div className="tw-cobble" aria-hidden="true">
                            {TILES(19).map((k) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={k} src={art.cobble.url} alt="" draggable={false} />
                            ))}
                        </div>
                    ) : art.background ? (
                        <div className="tw-bg" aria-hidden="true">
                            {[0, 1, 2, 3].map((k) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={k} src={art.background.url} alt="" draggable={false} />
                            ))}
                        </div>
                    ) : null}
                    {/* Foreground border wall — sits at the mid/street seam so the horizon line reads as a defined
                        plaza edge (buildings & avatars draw in front of it). Ground-locked (moves with the street). */}
                    {layered && art.fg?.url ? (
                        <div className="tw-fg" aria-hidden="true">
                            {TILES(24).map((k) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={k} src={art.fg.url} alt="" draggable={false} />
                            ))}
                        </div>
                    ) : null}
                    {/* Plaza centerpiece — the wolf fountain, which doubles as the Wishing Well once the town funds
                        it. Tap to claim the daily blessing; a coin badge + shimmer invites the wish when it's ready. */}
                    {art.centerpiece?.url ? (
                        well ? (
                            <button
                                type="button"
                                className={`tw-centerpiece tw-well${canWish ? " can-wish" : " is-spent"}`}
                                style={{ left: `${wellX}%`, top: `${GROUND}%` }}
                                onClick={(e) => { e.stopPropagation(); if (canWish) claimWell(); }}
                                disabled={!canWish || wishBusy}
                                aria-label={canWish ? `Make a wish — claim ${well.gold} gold` : "Wishing Well — already wished today"}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={art.centerpiece.url} alt="" draggable={false} />
                                {canWish ? <span className="tw-well-badge">🪙 Make a wish!</span> : <span className="tw-well-badge is-spent">✓ Wished today</span>}
                            </button>
                        ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="tw-centerpiece" src={art.centerpiece.url} alt="" draggable={false} style={{ left: `${wellX}%`, top: `${GROUND}%` }} />
                        )
                    ) : null}
                    {/* Buildings — locked (no entry) while a raid is on: defend the plaza first! */}
                    {buildings.map((b) => {
                        const bart = art[b.id];
                        const shopOpen = marketDay && b.id === "shop"; // the real store's building lights up when the shop is open
                        return (
                            <Link key={b.id} href={raidActive ? "#" : b.href} className={`tw-building${bart ? " has-art" : ""}${raidActive ? " is-locked" : ""}${shopOpen ? " is-openshop" : ""}`} style={{ left: `${b.x}%`, top: `${GROUND - 4}%`, zIndex: 100 + Math.round(b.x) }} onClick={raidActive ? (e) => { e.preventDefault(); e.stopPropagation(); } : b.id === "tavern" ? (e) => { e.preventDefault(); e.stopPropagation(); setInTavern(true); } : (e) => e.stopPropagation()} aria-disabled={raidActive || undefined}>
                                {shopOpen ? <span className="tw-openflag">OPEN</span> : null}
                                {/* The same number the Town pill shows in the nav, now pointing at the door it
                                    belongs to. Getting a badge and then hunting the plaza for what caused it is
                                    the failure this avoids: the count says "something is here", the pin says
                                    "it's behind THIS one". */}
                                {!raidActive && (todo.byBuilding?.[b.id] || 0) > 0 ? (
                                    <span className="tw-bld-todo" aria-hidden="true">{todo.byBuilding[b.id]}</span>
                                ) : null}
                                {bart ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="tw-building-art" src={bart.url} alt={b.label} draggable={false} style={bart.flip ? { transform: "translateX(-50%) scaleX(-1)" } : undefined} />
                                ) : (
                                    <span className="tw-building-card"><span className="tw-building-emoji">{b.emoji}</span></span>
                                )}
                                <span className="tw-building-label">{raidActive ? "🔒" : b.emoji} {b.label}</span>
                            </Link>
                        );
                    })}
                    {/* Plaza NPCs — they duck for cover during a raid (hidden while foes are about). */}
                    {!raidActive ? (
                      <>
                    {/* Blacksmith NPC by the Forge — tap for a tip + a shortcut in */}
                    <button type="button" className="tw-npc-btn" style={{ left: "31%", top: `${GROUND + 6}%` }} onClick={(e) => { e.stopPropagation(); setSmithOpen(true); }} aria-label="Blacksmith">
                        {art.smith?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={art.smith.url} alt="Blacksmith" draggable={false} />
                        ) : <span className="tw-npc-emoji">⚒️</span>}
                    </button>
                    {/* Town Crier — shouts rotating live news; tap to open the Town Hall */}
                    {/* The Stockade — only stands while someone is actually in it */}
                    {/* THE VOTING BOOTH. Jinxx's idea; the town decides who goes in the pillory.
                        IT STANDS WHETHER OR NOT A POLL IS OPEN. It used to appear only while one was — which is
                        exactly the three days nobody could see it, because a sentence runs for three — and the
                        first thing that happened was a player hunting the plaza for a booth that had silently
                        gone. A shut booth with a sign is a schedule; an absent booth is a bug. */}
                    {stockade?.election?.phase === "voting" ? (
                        <button type="button" className="tw-npc-btn tw-votebooth"
                            style={{ left: stockade?.occupant ? "89%" : "76%", top: `${GROUND + 6}%` }}
                            onClick={(e) => { e.stopPropagation(); setVoteOpen(true); }} aria-label="The voting booth">
                            <span className="tw-npc-bubble">🗳️ Who goes in the stockade?</span>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="tw-booth-art" src="/images/town/vote-booth.png" alt="" draggable="false" />
                        </button>
                    ) : null}
                    {stockade?.occupant ? (
                        <button type="button" className="tw-npc-btn tw-stockade" style={{ left: "76%", top: `${GROUND + 6}%` }} onClick={(e) => { e.stopPropagation(); setStockOpen(true); }} aria-label={`The Stockade — ${stockade.occupant.name}`}>
                            {/* THE CHARGE, not just the name. The plaque said who was in it and left the funniest
                                half of the feature — what they are accused of — hidden behind a tap. The crime is
                                the whole joke, so it goes on the sign. */}
                            <span className="tw-npc-bubble tw-stock-plate">
                                <b>⛓️ {stockade.occupant.name}</b>
                                {stockade.occupant.reason ? <em>&ldquo;{stockade.occupant.reason}&rdquo;</em> : null}
                            </span>
                            {stockade.occupant.artUrl ? (
                                // The combined picture: them drawn INTO the boards, one image.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={stockade.occupant.artUrl} alt={`${stockade.occupant.name} in the stockade`} draggable={false} />
                            ) : art.stockade?.url ? (
                                // Fallback while the combined draw is pending or if it failed: the empty prop.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={art.stockade.url} alt="The Stockade" draggable={false} />
                            ) : <span className="tw-npc-emoji">⛓️</span>}
                        </button>
                    ) : null}
                    <button type="button" className="tw-npc-btn" style={{ left: "9%", top: `${GROUND + 6}%` }} onClick={(e) => { e.stopPropagation(); setBoardOpen(true); }} aria-label="Town Crier">
                        {crierLines.length ? <span className="tw-npc-bubble">📣 {crierLines[crierMsg % crierLines.length]}</span> : null}
                        {art.crier?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={art.crier.url} alt="Town Crier" draggable={false} />
                        ) : <span className="tw-npc-emoji">📣</span>}
                    </button>
                    {/* Quest-Giver NPC — tap for town bounties; alert badge when a reward is claimable */}
                    <button type="button" className="tw-npc-btn" style={{ left: "64%", top: `${GROUND + 6}%` }} onClick={(e) => { e.stopPropagation(); setQuestFlash(null); setQuestOpen(true); load(); }} aria-label="Quest Giver">
                        <span className={`tw-quest-marker${questsClaimable > 0 ? " is-ready" : ""}`} aria-hidden="true">{questsClaimable > 0 ? "?" : "!"}</span>
                        {questsClaimable > 0 ? <span className="tw-npc-alert">{questsClaimable}</span> : null}
                        {art.questgiver?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={art.questgiver.url} alt="Quest Giver" draggable={false} />
                        ) : <span className="tw-npc-emoji">📜</span>}
                    </button>
                    {/* Traveling Merchant — tap to browse wares */}
                    <button type="button" className="tw-npc-btn" style={{ left: "53%", top: `${GROUND + 6}%` }} onClick={(e) => { e.stopPropagation(); setMerchantFlash(null); setMerchantOpen(true); }} aria-label="Traveling Merchant">
                        <span className="tw-npc-bubble">🧳 Wares for sale!</span>
                        {art.merchant?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={art.merchant.url} alt="Traveling Merchant" draggable={false} />
                        ) : <span className="tw-npc-emoji">🧳</span>}
                    </button>
                    {/* Auctioneer — links out to the Auction House */}
                    <Link href="/marketplace/auction" className="tw-npc-btn" style={{ left: "42%", top: `${GROUND + 6}%` }} onClick={(e) => e.stopPropagation()} aria-label="Auction House">
                        <span className="tw-npc-bubble">🔨 Auction House!</span>
                        {art.auctioneer?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={art.auctioneer.url} alt="Auctioneer" draggable={false} />
                        ) : <span className="tw-npc-emoji">🔨</span>}
                    </Link>
                      </>
                    ) : null}
                    {/* BOSS RAID: one huge shared boss — tap to join the pack battle (shared HP bar). */}
                    {state?.event && !state.event.defeated && state.event.boss ? (() => {
                        const ev = state.event;
                        const url = art[EVENT_ART[ev.kind]]?.url;
                        return (
                            <button type="button" className="tw-boss" style={{ left: "50%", top: `${GROUND + 9}%`, zIndex: 260 }} onClick={(e) => { e.stopPropagation(); setBossOpen(true); }} aria-label={`Join the boss fight — ${ev.name}`}>
                                <span className="tw-boss-hpbar"><span style={{ width: `${ev.hpPct ?? 100}%` }} /></span>
                                {url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="tw-boss-art" src={url} alt={ev.name} draggable={false} />
                                ) : <span className="tw-boss-emoji">{ev.emoji}</span>}
                                <span className="tw-boss-join">⚔️ Join the fight!</span>
                            </button>
                        );
                    })() : null}
                    {/* Skirmish raid: tap each foe directly → a 1v1 duel. */}
                    {state?.event && !state.event.defeated && !state.event.boss ? (() => {
                        const ev = state.event;
                        // Per-ARCHETYPE art, falling back to the faction's generic sprite. The archetypes have
                        // always fought differently — a shield-bearer shrugs off sloppy timing, an archer bites
                        // back — but they all shared one sprite with a CSS tint and a badge emoji, so none of
                        // that variety was visible. Each now has its own drawing.
                        const foeUrl = (en) => art[`foe_${en.art || EVENT_ART[ev.kind]}_${en.kind}`]?.url
                            || art[EVENT_ART[ev.kind]]?.url;
                        return raidEnemies.map((en, i) => (
                            <button
                                key={en.id} type="button"
                                className={`tw-enemy${en.dying ? " is-dying" : ""}${raidCd ? " is-cd" : ""}${en.takeable === false ? " is-taken" : ""}${en.mine ? " is-mine" : ""}`}
                                // Each foe roams on its OWN clock (per-enemy delay/duration/sway) so they move independently,
                                // sit low in the foreground, and draw above the buildings (z well over the ~192 building band).
                                style={{ left: `${en.x}%`, top: `${en.y}%`, zIndex: 240 + Math.round(en.y), animationDelay: `${((i * 0.83) % 2.6).toFixed(2)}s`, animationDuration: `${(3 + (i % 4) * 0.7).toFixed(2)}s`, "--sway": `${9 + (i % 3) * 6}px` }}
                                onClick={(e) => { e.stopPropagation(); if (!en.dying && en.takeable !== false) startDuel(en.id, foeUrl(en)); }}
                                aria-label={en.takeable === false ? `${en.engagedName} is fighting this one` : `Fight the ${en.label || ev.name}`}
                            >
                                {/* Who's locked onto this foe — the thing that makes the fight feel shared instead
                                    of everyone swinging at their own copy. Yours reads "you". */}
                                {en.engagedBy ? (
                                    <span className={`tw-enemy-lock${en.mine ? " is-mine" : ""}`}>
                                        {en.mine ? "⚔️ you" : `⚔️ ${en.engagedName}`}
                                    </span>
                                ) : <span className="tw-enemy-crossed" aria-hidden="true">⚔️</span>}
                                {/* Per-foe HP, straight from the server, so everyone sees the same damage. */}
                                <span className="tw-enemy-hp"><span style={{ width: `${en.hpPct ?? 100}%` }} /></span>
                                {/* Archetype identity. A foe that FIGHTS differently has to LOOK different or the
                                    variety is invisible — so each carries its own tint, size and badge, and the
                                    non-plain ones name themselves. */}
                                {en.badge ? (
                                    <span className="tw-enemy-badge" style={{ background: en.tint || "#6b7686" }}>{en.badge}</span>
                                ) : null}
                                {en.kind !== "scrapper" ? (
                                    <span className="tw-enemy-tag" style={{ background: en.tint || "#6b7686", color: en.chieftain ? "#fff" : "#16121b" }}>{en.label}</span>
                                ) : null}
                                {foeUrl(en) ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={foeUrl(en)} alt="" draggable={false}
                                        style={{
                                            transform: `scaleX(${en.flip ? -1 : 1}) scale(${en.scale ?? 1})`,
                                            // Tint the sprite toward its archetype colour so a wave reads as mixed
                                            // at a glance rather than a row of identical goblins.
                                            filter: en.tint
                                                ? `drop-shadow(0 0 7px ${en.tint}) drop-shadow(0 5px 7px rgba(0,0,0,0.55))`
                                                : undefined,
                                        }}
                                    />
                                ) : <span className="tw-enemy-emoji" style={{ transform: `scale(${en.scale ?? 1})`, display: "inline-block" }}>{en.emoji || ev.emoji}</span>}
                            </button>
                        ));
                    })() : null}
                    {/* Other players — only people ACTUALLY in town get a body in the world. Members who are
                        merely online elsewhere used to render as faded ghosts standing in the plaza, which reads
                        as a rendering bug rather than as "they're not here". They're still counted in the
                        "around" chip and listed in Who's here. */}
                    {otherList.filter((p) => p.inTown !== false).map((p) => <Avatar key={p.id} a={p} isYou={false} onTap={() => setMenuFor(p)} raiding={raidActive} />)}
                    {/* You */}
                    {you ? <Avatar a={{ ...me, name: "You", sprite: you.sprite, flip: you.flip, status: "🐺 you", chat: myChat, pet: you.pet, petFlip: you.petFlip }} isYou raiding={raidActive} /> : null}
                </div>

                {/* (The standalone Market Day ribbon lived here. It's folded into the status bubble above —
                    two pills pinned to the same corner of the same scene was always going to collide.) */}

                {/* Raid HUD (corner) + weapon-skill callout */}
                {state?.event && !state.event.defeated ? <RaidHUD ev={state.event} kills={raidKills} onExpire={load} /> : null}
                {raidProc ? (
                    <div className="tw-proc" style={{ "--pc": raidProc.color || "#ffb347" }} key={raidProc.key}>
                        <span className="tw-proc-emoji">{raidProc.emoji}</span> {raidProc.name}!
                    </div>
                ) : null}
                {state?.event && !state.event.defeated ? <div className="tw-raid-tip">Tap the foes to strike — your gear sets your damage.</div> : null}
            </div>

            <section className="card tw-chatbar">
                {(state?.chatLog || []).length ? (
                    <div className="tw-chatlog" aria-label="Plaza chat log">
                        {(state.chatLog).slice().reverse().map((m) => (
                            <div key={m.id} className={`tw-clog-row${m.mine ? " mine" : ""}`}>
                                <span className="tw-clog-hero" aria-hidden="true">
                                    {m.sprite ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={m.sprite} alt="" style={{ transform: m.flip ? "scaleX(-1)" : "none" }} />
                                    ) : <span className="tw-clog-fallback">{(m.name || "?").slice(0, 1).toUpperCase()}</span>}
                                </span>
                                <span className="tw-clog-main">
                                    <span className="tw-clog-top"><span className="tw-clog-name">{m.name}</span><span className="tw-clog-time">{relTime(m.at)}</span></span>
                                    {m.notice ? <NoticeBody body={m.body} className="tw-clog-body" /> : <span className="tw-clog-body">{m.body}</span>}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : null}
                <form onSubmit={sendChat} className="tw-chat-form">
                    <input value={chatText} onChange={onChatChange} placeholder="Say something to the plaza…" maxLength={200} aria-label="Town chat message" />
                    <button type="submit" className="tw-chat-send" disabled={!chatText.trim()} aria-label="Send">➤</button>
                </form>
                <div className="tw-emote-row">
                    <button type="button" onClick={wave} title="Wave">👋</button>
                    {["❤️", "😂", "🔥", "👍", "😮", "✨", "🐺"].map((em) => (
                        <button type="button" key={em} onClick={() => quickEmote(em)} aria-label={`Send ${em}`}>{em}</button>
                    ))}
                </div>
                {state?.raidAdmin && !state?.event ? (
                    <div className="tw-owner-spawn">
                        <span className="muted">🔒 Surprise drop — pushes the whole pack:</span>
                        {/* Driven by the server's raid catalog, not a typed-out list. Three factions shipped
                            with art, archetypes and push copy and had no button here, so the only way one could
                            ever appear was a random cron roll. */}
                        {(state?.raidKinds || []).map((k) => (
                            <button type="button" key={k.key} onClick={() => spawnEvent(k.key)}>
                                {k.emoji} {k.name}{k.boss ? " (boss)" : ""}
                            </button>
                        ))}
                    </div>
                ) : null}
                {state?.raidAdmin && state?.event ? (
                    <div className="tw-owner-spawn">
                        <span className="muted">🔒 Raid admin:</span>
                        <button type="button" onClick={endEvent} style={{ borderColor: "rgba(255,215,110,0.5)", background: "rgba(255,215,110,0.14)", color: "#ffe0a0" }}>⏹️ End raid now</button>
                    </div>
                ) : null}
            </section>

            {/* Roster overlay — see who's doing what without walking */}
            {roster ? (
                <div className="tw-roster" onClick={() => setRoster(false)} role="presentation">
                    <div className="tw-roster-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="tw-roster-head"><strong>👥 Around town — {otherList.length + 1}</strong><button type="button" onClick={() => setRoster(false)} aria-label="Close">✕</button></div>
                        <div className="tw-roster-list">
                            <div className="tw-roster-row is-you"><span className="tw-roster-name">You</span><span className="tw-roster-status">🐺 walking around</span></div>
                            {otherList.length === 0 ? <div className="muted" style={{ padding: "10px 4px", fontSize: "0.85rem" }}>Nobody else is around right now.</div> : null}
                            {otherList.map((p) => (
                                <div key={p.id} className="tw-roster-row">
                                    <span className="tw-roster-name">{p.name}</span>
                                    <span className="tw-roster-status">{p.status}</span>
                                    <button type="button" className="tw-roster-go" onClick={() => { walkToWorld(p.x + (p.x > me.x ? -3 : 3), p.y); setRoster(false); }}>Walk over →</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}

            {/* The Stockade — shame / pelt the occupant, three of each a day */}
            {/* THE BALLOT. Everyone gets one vote and may change it; putting a NAME up costs gold, which is the
                only thing keeping the board short and funny rather than everyone nominating everyone. */}
            {voteOpen && stockade?.election?.phase === "voting" ? (
                <div className="tw-roster" onClick={() => setVoteOpen(false)} role="presentation">
                    <div className="tw-roster-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="tw-roster-head"><strong>🗳️ The Stockade Ballot</strong><button type="button" onClick={() => setVoteOpen(false)} aria-label="Close">✕</button></div>
                        <p className="tw-stock-reason">
                            The town votes. Whoever leads when the poll closes spends {stockade.election.sentenceLabel || "a day"}
                            in the pillory — and the next poll opens the moment they go in.
                        </p>
                        {stockFlash ? <div className="tw-merchant-flash">{stockFlash}</div> : null}
                        <div className="tw-ballot">
                            {stockade.election.nominees?.length ? stockade.election.nominees.map((n) => (
                                <button key={n.id} type="button"
                                    className={`tw-ballot-row${stockade.election.myVote === n.id ? " is-mine" : ""}`}
                                    disabled={stockBusy} onClick={() => stockPost({ kind: "vote", target: n.id })}>
                                    {n.art ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={n.art} alt="" draggable="false" />
                                    ) : <span className="tw-ballot-blank" aria-hidden="true" />}
                                    <span className="tw-ballot-body">
                                        <b>{n.name}</b>
                                        <em>&ldquo;{n.crime}&rdquo;</em>
                                    </span>
                                    <span className="tw-ballot-votes">{n.votes}</span>
                                </button>
                            )) : <p className="muted" style={{ margin: 0 }}>Nobody has been accused yet. Someone has to start it.</p>}
                        </div>
                        {/* Put a name up. The crime is optional — leave it blank and the charge sheet picks one. */}
                        {!stockade.election.myNomination ? (
                            <div className="tw-nominate">
                                {nomPick ? (
                                    <div className="tw-nom-picked">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={nomPick.avatarUrl} alt="" draggable="false" />
                                        <span className="tw-nom-picked-body"><b>{nomPick.displayLabel}</b><em>@{nomPick.alias} · Lv {nomPick.level}</em></span>
                                        <button type="button" className="tw-nom-clear" aria-label="Pick someone else"
                                            onClick={() => { setNomPick(null); setNomQuery(""); }}>✕</button>
                                    </div>
                                ) : (
                                    <div className="tw-nom-search">
                                        <input value={nomQuery} onChange={(e) => setNomQuery(e.target.value)}
                                            placeholder="Search the Den for who did it…" aria-label="Who to nominate" autoComplete="off" />
                                        {nomQuery.trim().length >= 2 ? (
                                            <div className="tw-nom-hits">
                                                {nomHits.length ? nomHits.map((m) => (
                                                    <button key={m.id} type="button" className="tw-nom-hit" onClick={() => { setNomPick(m); setNomHits([]); }}>
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={m.avatarUrl} alt="" draggable="false" />
                                                        <span className="tw-nom-hit-body"><b>{m.displayLabel}</b><em>@{m.alias} · Lv {m.level}</em></span>
                                                    </button>
                                                )) : <span className="tw-nom-empty">{nomSeeking ? "Searching…" : "Nobody by that name."}</span>}
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                                <input value={nomCrime} onChange={(e) => setNomCrime(e.target.value)} placeholder="Their crime (optional)" aria-label="The crime" />
                                <button type="button" className="button primary" disabled={stockBusy || !nomPick}
                                    onClick={() => stockPost({ kind: "nominate", target: nomPick.id, crime: nomCrime.trim() || null })}>
                                    Accuse — 🪙 {stockade.election.nominateCost}
                                </button>
                            </div>
                        ) : <p className="muted" style={{ margin: "8px 0 0", fontSize: "0.8rem" }}>You have made your accusation this round.</p>}
                    </div>
                </div>
            ) : null}

            {stockOpen && stockade?.occupant ? (
                <div className="tw-roster" onClick={() => setStockOpen(false)} role="presentation">
                    <div className="tw-roster-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="tw-roster-head"><strong>⛓️ The Stockade</strong><button type="button" onClick={() => setStockOpen(false)} aria-label="Close">✕</button></div>
                        <p className="tw-stock-reason">&ldquo;{stockade.occupant.reason}&rdquo;</p>
                        {stockFlash ? <div className="tw-merchant-flash">{stockFlash}</div> : null}

                        {stockade.isOccupant ? (
                            <p className="tw-stock-self">
                                You&rsquo;re the one in the stockade. It costs you nothing — just stand there and take it.
                            </p>
                        ) : (
                            <div className="tw-stock-actions">
                                <button type="button" className="tw-stock-btn is-shame" disabled={stockBusy || stockade.shame.used >= stockade.shame.max} onClick={() => stockAct("shame")}>
                                    <span className="tw-stock-ico" aria-hidden="true">👉</span>
                                    <span className="tw-stock-lbl">Shame them</span>
                                    <span className="tw-stock-meta">+{stockade.shame.xp} XP</span>
                                    <span className="tw-stock-left">{Math.max(0, stockade.shame.max - stockade.shame.used)}/{stockade.shame.max}</span>
                                </button>
                                <button type="button" className="tw-stock-btn is-fruit" disabled={stockBusy || stockade.fruit.used >= stockade.fruit.max} onClick={() => stockAct("fruit")}>
                                    <span className="tw-stock-ico" aria-hidden="true">🍅</span>
                                    <span className="tw-stock-lbl">Throw rotten fruit</span>
                                    <span className="tw-stock-meta">+{stockade.fruit.xp} XP · +{stockade.fruit.coin} 🪙</span>
                                    <span className="tw-stock-left">{Math.max(0, stockade.fruit.max - stockade.fruit.used)}/{stockade.fruit.max}</span>
                                </button>
                                {/* THE WARDEN'S KEY. Drawn only for the member wearing the piece that grants
                                    it — the flag is false for everybody else, so nobody is shown a mercy they
                                    cannot extend. One a week, claimed server-side. */}
                                {stockade.wardensKey ? (
                                    <button type="button" className="tw-stock-btn is-key" disabled={stockBusy} onClick={() => stockAct("unlock")}>
                                        <span className="tw-stock-ico" aria-hidden="true">🗝️</span>
                                        <span className="tw-stock-lbl">Turn the warden&apos;s key</span>
                                        <span className="tw-stock-meta">Let them out</span>
                                        <span className="tw-stock-left">1/week</span>
                                    </button>
                                ) : null}
                            </div>
                        )}

                        <div className="tw-stock-stage">
                            <div className={`tw-stock-figure${hitFx ? ` is-${hitFx}` : ""}`}>
                                {stockade.occupant.artUrl || stockade.occupant.spriteUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={stockade.occupant.artUrl || stockade.occupant.spriteUrl} alt={`${stockade.occupant.name} in the stockade`} draggable={false} />
                                ) : <span style={{ fontSize: 64 }}>😔</span>}
                                {splats.map((sp) => (
                                    <span key={sp.id} className="tw-splat" style={{ left: `calc(50% + ${sp.x}px)`, top: `calc(50% + ${sp.y}px)` }} aria-hidden="true">🍅</span>
                                ))}
                                {flying.map((f) => (
                                    <span key={f.id} className="tw-fruit-fly" style={{ "--from": `${f.from}px`, "--to": `${f.to}px`, "--spin": `${f.spin}deg`, animationDelay: `${f.delay}ms` }} aria-hidden="true">🍅</span>
                                ))}
                                {/* THE CHARGE SHEET, nailed up beside them — and it reads the ACTUAL charge now.
                                    It was hardcoded to "EXPLOITATION & ABUSE / attempted to ruin the game for
                                    the wolf pack", which was right when the stockade only ever held a caught
                                    cheater. The town elects people into it now on joke charges, so a board
                                    that always says the same grave thing is both wrong and unfunny — the crime
                                    is the whole joke and the sign is where you read it. */}
                                <div className="tw-stock-sign">
                                    <div className="tw-stock-sign-title">BY ORDER<br />OF THE DEN</div>
                                    <div className="tw-stock-sign-body">{stockade.occupant.reason || "conduct unbecoming"}</div>
                                </div>
                            </div>
                            <div className="tw-stock-name">{stockade.occupant.name}</div>
                            <div className="tw-stock-tally">Shamed {stockade.occupant.shameCount}× · Pelted {stockade.occupant.fruitCount}×</div>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Quest-Giver — daily town bounties */}
            {questOpen ? (
                <div className="tw-roster" onClick={() => setQuestOpen(false)} role="presentation">
                    <div className="tw-roster-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="tw-roster-head"><strong>📜 Town Bounties</strong><button type="button" onClick={() => setQuestOpen(false)} aria-label="Close">✕</button></div>
                        <p className="muted" style={{ margin: "-2px 2px 8px", fontSize: "0.85rem", fontStyle: "italic" }}>&ldquo;Do the town a service, wolf, and there's gold in it for you.&rdquo;</p>
                        {questFlash ? <div className="tw-merchant-flash">{questFlash}</div> : null}
                        <div className="tw-quests">
                            {(state?.quests || []).map((q) => {
                                const pct = Math.max(0, Math.min(100, Math.round((q.progress / q.target) * 100)));
                                return (
                                    <div key={q.key} className={`tw-quest${q.claimed ? " is-claimed" : ""}`}>
                                        <QuestIcon name={q.icon} />
                                        <div className="tw-quest-body">
                                            <div className="tw-quest-top"><strong>{q.label}</strong><span className="tw-quest-reward"><img src="/images/ui/coin.png" alt="" className="tw-quest-coin" draggable="false" />{q.gold}</span></div>
                                            <div className="muted" style={{ fontSize: "0.76rem" }}>{q.desc}</div>
                                            <div className="tw-quest-bar"><span style={{ width: `${pct}%` }} /></div>
                                            <div className="tw-quest-prog muted">{q.progress}/{q.target}</div>
                                        </div>
                                        {q.claimed ? <span className="tw-quest-tag is-done" aria-label="Claimed"><Gi.GiCheckMark /></span>
                                            : q.done ? <button type="button" className="tw-quest-claim" disabled={questBusy} onClick={() => claimQuest(q.key)}>Claim</button>
                                                : null}
                                    </div>
                                );
                            })}
                        </div>
                        <p className="muted" style={{ fontSize: "0.76rem", margin: "10px 2px 0" }}>Bounties refresh daily. Progress ticks as you play in the plaza.</p>
                    </div>
                </div>
            ) : null}

            {/* Traveling Merchant wares */}
            {merchantOpen ? (
                <div className="tw-roster" onClick={() => setMerchantOpen(false)} role="presentation">
                    <div className="tw-roster-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="tw-roster-head" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {art.merchant?.url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={art.merchant.url} alt="" draggable={false} style={{ width: 34, height: 34, objectFit: "contain", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))" }} />
                            ) : <span aria-hidden="true">🧳</span>}
                            <strong style={{ flex: 1 }}>Traveling Merchant</strong>
                            <button type="button" onClick={() => setMerchantOpen(false)} aria-label="Close">✕</button>
                        </div>
                        <p className="muted" style={{ margin: "-2px 2px 8px", fontSize: "0.85rem", fontStyle: "italic" }}>&ldquo;Rare goods, fair prices! Fancy a chest, friend?&rdquo;</p>
                        {merchantFlash ? <div className="tw-merchant-flash">{merchantFlash}</div> : null}
        <div className="tw-wares">
                            {(state?.merchant || []).map((w) => {
                                const soldOut = w.remaining <= 0;
                                const afford = (you?.gold || 0) >= w.price;
                                return (
                                    <button key={w.tier} type="button" className={`tw-ware${soldOut ? " is-soldout" : ""}`} disabled={!afford || soldOut || merchantBusy} onClick={() => buyChest(w.tier)}>
                                        {w.discountPct ? <span className="tw-ware-deal">-{w.discountPct}%</span> : null}
                                        {w.image ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img className="tw-ware-img" src={w.image} alt="" draggable={false} />
                                        ) : <span className="tw-ware-emoji" aria-hidden="true">{w.emoji}</span>}
                                        <span className="tw-ware-label">{w.label}</span>
                                        <span className="tw-ware-price">
                                            {w.orig && w.orig !== w.price ? <span className="tw-ware-orig">🪙 {w.orig.toLocaleString()}</span> : null}
                                            <span className="tw-ware-now">🪙 {w.price.toLocaleString()}</span>
                                        </span>
                                        <span className={`tw-ware-left${soldOut ? " is-out" : ""}`}>{soldOut ? "back tomorrow" : `${w.remaining}/${w.capPerDay} today`}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {/* High-roller gear gamble */}
                        <button type="button" className="tw-gamble" disabled={(you?.gold || 0) < 1000 || merchantBusy} onClick={gambleGear}>
                            {art.dice?.url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className="tw-gamble-ico" src={art.dice.url} alt="" draggable={false} style={{ width: 38, height: 38, objectFit: "contain" }} />
                            ) : <span className="tw-gamble-ico" aria-hidden="true">🎲</span>}
                            <span className="tw-gamble-body">
                                <span className="tw-gamble-title">Gamble for gear</span>
                                <span className="tw-gamble-sub">A random piece — rarely up to Tier 4!</span>
                            </span>
                            <span className="tw-gamble-price">🪙 1,000</span>
                        </button>
                        <p className="muted" style={{ fontSize: "0.8rem", margin: "10px 2px 0" }}>🪙 You have {(you?.gold || 0).toLocaleString()} gold · chests & gear live in your Gear.</p>
                    </div>
                </div>
            ) : null}

            {/* Tap-a-player action sheet */}
            {menuFor ? (
                <div className="tw-roster" onClick={() => setMenuFor(null)} role="presentation">
                    <div className="tw-roster-panel tw-menu-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="tw-roster-head"><strong>{menuFor.friend ? "⭐ " : ""}{menuFor.name}</strong><button type="button" onClick={() => setMenuFor(null)} aria-label="Close">✕</button></div>
                        <div className="muted" style={{ fontSize: "0.82rem", margin: "-2px 2px 8px" }}>{menuFor.status}</div>
                        <div className="tw-menu-actions">
                            <button type="button" className="tw-menu-btn" onClick={() => { walkToWorld(menuFor.x + (menuFor.x > me.x ? -3 : 3), menuFor.y); setMenuFor(null); }}>🚶 Walk over</button>
                            <button type="button" className="tw-menu-btn" onClick={() => { quickEmote("👋"); setMenuFor(null); }}>👋 Wave</button>
                            {menuFor.alias ? <Link href={`/marketplace/u/${menuFor.alias}`} className="tw-menu-btn">👤 View profile</Link> : null}
                            {menuFor.alias ? <Link href={`/marketplace/farm?u=${encodeURIComponent(menuFor.alias)}`} className="tw-menu-btn">🏡 Visit farm</Link> : null}
                            {menuFor.alias ? <Link href={`/marketplace/trade/new?to=${encodeURIComponent(menuFor.alias)}`} className="tw-menu-btn">🤝 Trade</Link> : null}
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Town Hall — what's happening + collective plaza fund */}
            {boardOpen ? (
                <div className="tw-roster" onClick={() => setBoardOpen(false)} role="presentation">
                    <div className="tw-roster-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="tw-roster-head"><strong>🏛️ Town Hall</strong><button type="button" onClick={() => setBoardOpen(false)} aria-label="Close">✕</button></div>

                        <div className="tw-board-section">
                            <div className="tw-board-title">🟢 Who&apos;s online — {otherList.length + 1}</div>
                            <div className="tw-heroes">
                                {you ? (
                                    <div className="tw-hero is-you">
                                        <div className="tw-hero-card">
                                            {you.sprite ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={you.sprite} alt="You" draggable={false} style={you.flip ? { transform: "scaleX(-1)" } : undefined} />
                                            ) : <span className="tw-hero-fallback" aria-hidden="true">🐺</span>}
                                        </div>
                                        <div className="tw-hero-name">You</div>
                                        <div className="tw-hero-status">🐺 in the plaza</div>
                                    </div>
                                ) : null}
                                {otherList.map((p) => (
                                    <button key={p.id} type="button" className={`tw-hero${p.friend ? " is-friend" : ""}`} onClick={() => { setBoardOpen(false); setMenuFor(p); }}>
                                        <div className="tw-hero-card">
                                            {p.sprite ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={p.sprite} alt={p.name} draggable={false} style={p.flip ? { transform: "scaleX(-1)" } : undefined} />
                                            ) : <span className="tw-hero-fallback" aria-hidden="true">🐺</span>}
                                        </div>
                                        <div className="tw-hero-name">{p.friend ? "⭐ " : ""}{p.name}</div>
                                        <div className="tw-hero-status">{p.status}</div>
                                    </button>
                                ))}
                            </div>
                            {otherList.length === 0 ? <p className="muted" style={{ fontSize: "0.8rem", margin: "8px 2px 0" }}>Just you around the Den right now — the plaza fills up as members come online.</p> : null}
                        </div>

                        {projects.length ? (
                            <div className="tw-board-section">
                                <div className="tw-board-title">🏗️ Town Development<span className="tw-board-gold">🪙 {(you?.gold || 0).toLocaleString()}</span></div>
                                <p className="muted" style={{ fontSize: "0.8rem", margin: "0 2px 8px" }}>
                                    Everyone pools gold into the town we all share. Every level is a perk the WHOLE Den keeps — forever.
                                </p>
                                {(townBonuses.xpPct || townBonuses.goldPct) ? (
                                    <div className="tw-town-perks">
                                        {townBonuses.xpPct ? <span>✨ +{townBonuses.xpPct}% XP</span> : null}
                                        {townBonuses.goldPct ? <span>🪙 +{townBonuses.goldPct}% gold</span> : null}
                                        <span className="muted">town-wide, right now</span>
                                    </div>
                                ) : null}
                                {["civic", "building", "service", "unlock"].map((cat) => {
                                    const inCat = projects.filter((p) => p.category === cat);
                                    if (!inCat.length) return null;
                                    return (
                                        <div key={cat} className="tw-proj-group">
                                            <div className="tw-proj-cat">{CAT_LABEL[cat]}</div>
                                            {inCat.map((p) => (
                                                <div key={p.id} className={`tw-proj${p.maxed ? " is-maxed" : ""}`}>
                                                    <div className="tw-proj-head">
                                                        {PROJECT_ART[p.id] && art[PROJECT_ART[p.id]]?.url ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img className="tw-proj-sprite" src={art[PROJECT_ART[p.id]].url} alt="" draggable={false} />
                                                        ) : <span className="tw-proj-emoji" aria-hidden="true">{p.emoji}</span>}
                                                        <span className="tw-proj-name">{p.name}</span>
                                                        <span className="tw-proj-lvl">{p.maxed ? "MAX" : `Lv ${p.level}`}</span>
                                                    </div>
                                                    <p className="tw-proj-desc">{p.desc}</p>
                                                    {p.perkNow ? <p className="tw-proj-perk">Now: {p.perkNow}</p> : null}
                                                    {p.maxed ? null : (() => {
                                                        const myGold = you?.gold || 0;
                                                        const amounts = [100, 500, 2500];
                                                        const cheapest = amounts[0];
                                                        const canFundAny = myGold >= cheapest;
                                                        return (
                                                            <>
                                                                <div className="tw-fund-bar"><span style={{ width: `${p.progressPct}%` }} /></div>
                                                                <p className="tw-proj-cost">🪙 {p.goldIn.toLocaleString()} / {p.cost.toLocaleString()} → Lv {p.level + 1}{p.perkNext ? ` · ${p.perkNext}` : ""}</p>
                                                                <div className="tw-fund-btns">
                                                                    {amounts.map((amt) => (
                                                                        <button key={amt} type="button" disabled={contribBusy === p.id || myGold < amt} onClick={() => contribute(p.id, amt)}>+{amt.toLocaleString()}</button>
                                                                    ))}
                                                                </div>
                                                                {!canFundAny ? <CoinCta price={cheapest} have={myGold} label="Buy gold" className="tw-fund-cta" /> : null}
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}

                        {state?.raidAdmin ? (
                            <div className="tw-board-section">
                                <div className="tw-board-title">🔧 Owner tools</div>
                                <button type="button" className={`tw-live-toggle${state?.eventsLive ? " is-on" : ""}`} onClick={toggleEventsLive}>
                                    {state?.eventsLive ? "🟢 Auto opening-events: LIVE" : "⚪ Auto opening-events: off"}
                                    <span className="muted">tap to {state?.eventsLive ? "turn off" : "turn on"} — pushes members when the shop opens</span>
                                </button>
                                <button type="button" className={`tw-live-toggle${state?.ownerGamePush ? " is-on" : ""}`} onClick={toggleOwnerGamePush}>
                                    {state?.ownerGamePush ? "🟢 Game push to the ledger app: ON" : "⚪ Game push to the ledger app: off"}
                                    <span className="muted">tap to {state?.ownerGamePush ? "turn off" : "turn on"} — you already get these in the browser; this is the second copy</span>
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {/* Blacksmith dialogue */}
            {smithOpen ? (
                <div className="tw-roster" onClick={() => setSmithOpen(false)} role="presentation">
                    <div className="tw-roster-panel tw-menu-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="tw-roster-head"><strong>⚒️ The Blacksmith</strong><button type="button" onClick={() => setSmithOpen(false)} aria-label="Close">✕</button></div>
                        <p className="muted" style={{ margin: "-2px 2px 10px", fontSize: "0.85rem", fontStyle: "italic" }}>&ldquo;Bring me your old gear, wolf — I&apos;ll salvage it into parts, or we&apos;ll enhance what you&apos;ve got at the anvil.&rdquo;</p>
                        <div className="tw-menu-actions">
                            <Link href="/marketplace/blacksmith" className="tw-menu-btn">🔨 Visit the Forge →</Link>
                            <Link href="/marketplace/inventory" className="tw-menu-btn">🛡️ Your gear</Link>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* High-roller gear reveal — suspense roll → rarity burst */}
            {gambleReveal ? <GambleReveal reveal={gambleReveal} diceUrl={art.dice?.url} onClose={() => setGambleReveal(null)} /> : null}

            {/* Raid victory recap */}
            {/* The swing bar is only ever the "opening…" beat now — the fight itself happens on the arena
                screen. Kept as a component rather than deleted because a queued tap from an old tab can still
                resolve the old way (see the `duel` branch in the route). */}
            {swing?.opening ? (
                <div className="tw-raid-opening" role="status">
                    <b>{swing.label || "A raider"}</b>
                    <span>squaring up…</span>
                </div>
            ) : swing ? <SwingBar foe={swing} onSwing={(d) => resolveSwing(swing.enemyId, swing.foeArt, d)} onCancel={() => setSwing(null)} /> : null}
            {raidNote ? <div className="tw-raid-note" role="status">{raidNote}</div> : null}
            {duel ? <DuelModal duel={duel} youSprite={you?.sprite} youFlip={you?.flip} onClose={closeDuel} /> : null}

            {bossOpen && state?.event?.boss ? <BossRaidModal ev={state.event} bossArt={art[EVENT_ART[state.event.kind]]?.url} you={you} onStrike={bossStrike} onClose={() => setBossOpen(false)} /> : null}

            {/* Itemised raid wrap-up: what YOU dealt and earned, plus the full damage board. */}
            {bossRecap ? (
                <div className="tw-duel" role="presentation" onClick={dismissRecap}>
                    <div className="tw-recap" onClick={(e) => e.stopPropagation()}>
                        <div className="tw-recap-head">
                            <div className="tw-recap-emoji" aria-hidden="true">{bossRecap.killed ? "🏆" : "💨"}</div>
                            <h3 className="tw-recap-title">{bossRecap.killed ? `${bossRecap.name} FELLED!` : `${bossRecap.name} escaped`}</h3>
                            <p className="tw-recap-sub">
                                {bossRecap.fighters} {bossRecap.fighters === 1 ? "wolf" : "wolves"} fought · {Number(bossRecap.totalDamage).toLocaleString()} total damage
                            </p>
                        </div>

                        {/* YOUR PERFORMANCE — a medal for the podium, your share drawn as a bar, and the
                            damage split into what you swung for and what you earned by holding the square. */}
                        <div className="tw-recap-you">
                            <div className="tw-recap-perf">
                                <span className="tw-recap-medal" aria-hidden="true">
                                    {bossRecap.me.rank === 1 ? "🥇" : bossRecap.me.rank === 2 ? "🥈" : bossRecap.me.rank === 3 ? "🥉" : "⚔️"}
                                </span>
                                <span className="tw-recap-perfbody">
                                    <b>
                                        {bossRecap.me.rank ? `#${bossRecap.me.rank} of ${bossRecap.fighters}` : "You fought"}
                                        {/* Name the band you earned — the payout is tiered by contribution now, so
                                            "why did I get this much" has to be answerable from the recap itself. */}
                                        {bossRecap.me.tierLabel ? <span className={`tw-recap-tier is-${bossRecap.me.tier}`}>{bossRecap.me.tierLabel}</span> : null}
                                    </b>
                                    <em>{Number(bossRecap.me.damage).toLocaleString()} damage · {bossRecap.me.share}% of the pack&apos;s total</em>
                                </span>
                            </div>
                            <div className="tw-recap-sharebar" aria-hidden="true">
                                <span style={{ width: `${Math.max(2, Math.min(100, bossRecap.me.share))}%` }} />
                            </div>
                            <div className="tw-recap-yousub">
                                {bossRecap.me.hits ? `${bossRecap.me.hits} strike${bossRecap.me.hits === 1 ? "" : "s"}` : "no strikes"}
                                {bossRecap.me.passive ? ` · ${Number(bossRecap.me.passive).toLocaleString()} just for holding the square` : ""}
                            </div>
                        </div>

                        {/* THE HAUL — big cards, not chips. This is the payoff for the whole raid. */}
                        <div className="tw-recap-hauline">Your haul</div>
                        <div className="tw-recap-haul">
                            {bossRecap.me.gold ? (
                                <div className="tw-recap-prize is-gold" style={{ animationDelay: "0.05s" }}>
                                    <span className="tw-recap-prize-ico" aria-hidden="true">🪙</span>
                                    <b>+{Number(bossRecap.me.gold).toLocaleString()}</b><em>gold</em>
                                </div>
                            ) : null}
                            {bossRecap.me.xp ? (
                                <div className="tw-recap-prize is-xp" style={{ animationDelay: "0.16s" }}>
                                    <span className="tw-recap-prize-ico" aria-hidden="true">⭐</span>
                                    <b>+{Number(bossRecap.me.xp).toLocaleString()}</b><em>XP</em>
                                </div>
                            ) : null}
                            {bossRecap.me.chest ? (
                                <div className="tw-recap-prize is-chest" style={{ animationDelay: "0.27s" }}>
                                    <span className="tw-recap-prize-ico" aria-hidden="true">🧰</span>
                                    <b>{bossRecap.me.chest[0].toUpperCase() + bossRecap.me.chest.slice(1)}</b><em>chest</em>
                                </div>
                            ) : null}
                            {!bossRecap.me.gold && !bossRecap.me.xp && !bossRecap.me.chest ? (
                                <span className="muted" style={{ fontSize: "0.82rem" }}>Still counting the spoils — one moment.</span>
                            ) : null}
                        </div>
                        {bossRecap.me.chest ? <p className="tw-recap-chesthint">Open it from your Chests — that&apos;s where the gear is.</p> : null}

                        <div className="tw-recap-boardhead">Damage board</div>
                        <div className="tw-recap-board">
                            {bossRecap.board.map((r) => (
                                <div key={r.rank} className={`tw-recap-row${r.isYou ? " is-you" : ""}`}>
                                    <span className="tw-recap-rank">{r.rank}</span>
                                    <span className="tw-recap-hero" aria-hidden="true">
                                        {r.sprite ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.sprite} alt="" style={{ transform: r.flip ? "scaleX(-1)" : "none" }} /> : "🐺"}
                                    </span>
                                    <span className="tw-recap-name">{r.isYou ? "You" : r.name}</span>
                                    <span className="tw-recap-dmg">{Number(r.damage).toLocaleString()}</span>
                                </div>
                            ))}
                        </div>

                        <button type="button" className="tw-levelup-btn" onClick={dismissRecap}>
                            {bossRecap.killed ? "Nice work! 🐺" : "Next time"}
                        </button>
                    </div>
                </div>
            ) : null}
            {/* ── THE RAID FIGHT, FOUGHT HERE ──────────────────────────────────────────────────────────────
                The Arena's own renderer, mounted over the street. Not a copy of it — the same component, the
                same bout on the same row — so there is still exactly one fight UI to fix, which was the whole
                point of the arrangement this replaces. What changes is only that the plaza keeps the player.

                It draws nothing until `fight` is set, and it is `position: fixed; inset: 0` when it does, so
                it needs nothing from the layout here. On the way out we reload the town: the wave has moved
                while you were swinging at it, and possibly finished. */}
            {fight ? (
                // Keyed on the foe so a second raider mounts a FRESH fight. ArenaClient seeds its state from
                // `initial` once, on mount — handing the same instance a new bout would leave the previous
                // one on screen.
                <ArenaClient key={fight.bout?.foe?.id || "raid"} initial={fight} boutOnly
                    onLeave={(done) => {
                        // ── WHAT THAT FIGHT PAID ─────────────────────────────────────────────────────
                        // The raid's running haul used to be summed from the per-duel reward that came
                        // back from the tap. The tap is a bout now, so the only place that reward exists
                        // is on the bout's own recap — and nothing was reading it, which is why the raid
                        // recap showed a Laurels screen with no gold, no XP and no drops on it.
                        const r = done?.recap?.raid?.reward || null;
                        if (r) setRaidHaul((h) => ({
                            xp: h.xp + (Number(r.xp) || 0),
                            gold: h.gold + (Number(r.coin) || 0),
                            drops: h.drops + ((r.loot || []).length || 0),
                        }));
                        const w = Number(done?.recap?.raid?.wins);
                        if (Number.isFinite(w)) setRaidKills(w);
                        setFight(null); load();
                    }} />
            ) : null}
            {bossReward ? (
                <div className="tw-duel" role="presentation" onClick={() => setBossReward(null)}>
                    <div className="tw-duel-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
                        <div className="tw-duel-verdict win" style={{ fontSize: "1.5rem" }}>🏆 BOSS FELLED!</div>
                        <div className="muted" style={{ margin: "4px 0 10px" }}>The pack brought it down together.</div>
                        <div className="tw-duel-rewards" style={{ justifyContent: "center" }}>
                            {bossReward.xp ? <span className="tw-duel-chip xp">+{bossReward.xp} XP</span> : null}
                            {bossReward.gold ? <span className="tw-duel-chip gold">+{bossReward.gold} 🪙</span> : null}
                            {bossReward.chest ? <span className="tw-duel-chip loot">🧰 {bossReward.chest[0].toUpperCase() + bossReward.chest.slice(1)} Chest</span> : null}
                        </div>
                        <button type="button" className="tw-levelup-btn" style={{ marginTop: 12 }} onClick={() => setBossReward(null)}>Huzzah! 🐺</button>
                    </div>
                </div>
            ) : null}

            {/* Claimed the hidden glint → the source-exclusive decoration reveal (or "someone beat you to it"). */}
            {shinyReward ? (
                <div className="tw-duel" role="presentation" onClick={() => setShinyReward(null)}>
                    <div className="tw-duel-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center", position: "relative", overflow: "hidden" }}>
                        {shinyReward === "gone" ? (
                            <>
                                <div style={{ fontSize: "2.4rem" }}>💨</div>
                                <div className="tw-duel-verdict" style={{ fontSize: "1.15rem" }}>Just missed it!</div>
                                <div className="muted" style={{ margin: "4px 0 10px" }}>Someone spotted that glimmer first. Keep your eyes peeled…</div>
                            </>
                        ) : (
                            <>
                                <div className="tw-shiny-burst" aria-hidden="true">{Array.from({ length: 14 }).map((_, i) => <span key={i} style={{ "--i": i }} />)}</div>
                                <div style={{ fontSize: "2.8rem", position: "relative", zIndex: 2 }}>{shinyReward.deco?.emoji || "✨"}</div>
                                <div className="tw-duel-verdict win" style={{ fontSize: "1.25rem", position: "relative", zIndex: 2 }}>✨ You caught the glimmer!</div>
                                <div style={{ fontWeight: 900, fontSize: "1.05rem", margin: "2px 0", position: "relative", zIndex: 2 }}>{shinyReward.deco?.name || "A rare decoration"}</div>
                                <div className="muted" style={{ margin: "2px 0 8px", fontSize: "0.82rem", position: "relative", zIndex: 2 }}>A {shinyReward.deco?.rarity || "rare"} decoration only ever found this way — it&apos;s in your Farm decorations.</div>
                                {/* The glimmer pays real spoils too — show them, or the prize reads as thin for
                                    anyone who doesn't care about farm decorations. */}
                                <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", margin: "0 0 10px", position: "relative", zIndex: 2 }}>
                                    {shinyReward.gold ? <span className="tw-recap-chip">🪙 +{Number(shinyReward.gold).toLocaleString()}</span> : null}
                                    {shinyReward.xp ? <span className="tw-recap-chip">⭐ +{Number(shinyReward.xp).toLocaleString()} XP</span> : null}
                                    {shinyReward.chest ? <span className="tw-recap-chip">🎁 {shinyReward.chest} chest</span> : null}
                                </div>
                            </>
                        )}
                        <button type="button" className="tw-levelup-btn" onClick={() => setShinyReward(null)}>{shinyReward === "gone" ? "Aw, next time" : "Sweet! ✨"}</button>
                    </div>
                </div>
            ) : null}

            {/* Hangout buff earned — the one-shot celebration (not advertised anywhere until this moment). */}
            {buffCele ? (
                <div className="tw-buffcele" role="status" onClick={() => setBuffCele(null)}>
                    <div className="tw-buffcele-card" onClick={(e) => e.stopPropagation()}>
                        <div className="tw-buffcele-spark" aria-hidden="true">✨</div>
                        <div className="tw-buffcele-title">Hangout Bonus!</div>
                        <div className="tw-buffcele-big">+{buffCele.pct}% XP &amp; Gold</div>
                        <div className="tw-buffcele-sub">for the next 2 hours — thanks for hanging around the Den. 🐺</div>
                        <button type="button" className="tw-levelup-btn" style={{ marginTop: 12 }} onClick={() => setBuffCele(null)}>Nice!</button>
                    </div>
                </div>
            ) : null}

            {raidRecap ? (
                <div className="tw-levelup" onClick={() => setRaidRecap(null)} role="presentation">
                    <div className="tw-levelup-confetti" aria-hidden="true">
                        {Array.from({ length: 24 }).map((_, i) => (
                            <span key={i} style={{ left: `${(i * 4.3) % 100}%`, "--h": `${(i * 47) % 360}`, animationDelay: `${(i % 6) * 0.12}s`, animationDuration: `${1.6 + (i % 5) * 0.18}s` }} />
                        ))}
                    </div>
                    <div className="tw-levelup-card" onClick={(e) => e.stopPropagation()} role="presentation">
                        <div className="tw-levelup-badge">{raidRecap.boss ? "🏆 BOSS FELLED!" : "🏆 RAID REPELLED!"}</div>
                        {raidRecap.boss ? (
                            <>
                                <div className="tw-reveal-rarity" style={{ color: "#ffd75e", marginTop: 4 }}>The pack brought it down!</div>
                                <div className="muted" style={{ fontSize: "0.86rem", marginTop: 8 }}>Your completion reward has been added to your account. 🎉</div>
                            </>
                        ) : (
                            <>
                                <div className="tw-reveal-rarity" style={{ color: "#ffd75e", marginTop: 4 }}>Your spoils</div>
                                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", margin: "8px 0" }}>
                                    {raidRecap.gold ? <span style={{ padding: "6px 12px", borderRadius: 999, fontWeight: 900, fontSize: 15, color: "#2a1a06", background: "linear-gradient(180deg,#ffe488,#f3b23a)" }}>+{raidRecap.gold.toLocaleString()} 🪙</span> : null}
                                    {raidRecap.xp ? <span style={{ padding: "6px 12px", borderRadius: 999, fontWeight: 900, fontSize: 15, color: "#0a2e1c", background: "linear-gradient(180deg,#8fe39a,#3ec06a)" }}>+{raidRecap.xp.toLocaleString()} ✨ XP</span> : null}
                                    {raidRecap.drops ? <span style={{ padding: "6px 12px", borderRadius: 999, fontWeight: 900, fontSize: 15, color: "#e0c8ff", background: "rgba(150,90,255,0.2)" }}>🎁 {raidRecap.drops} drop{raidRecap.drops === 1 ? "" : "s"}</span> : null}
                                </div>
                                <div className="muted" style={{ fontSize: "0.86rem" }}>☠️ {raidRecap.kills} {raidRecap.kills === 1 ? "foe" : "foes"} bested</div>
                            </>
                        )}
                        <button type="button" className="tw-levelup-btn" onClick={() => setRaidRecap(null)}>Huzzah! 🐺</button>
                    </div>
                </div>
            ) : null}

            {/* Wishing Well — "wish granted" popup after tossing a coin */}
            {wellFx ? (
                <div className="tw-wellfx" onClick={() => setWellFx(null)} role="presentation">
                    <div className="tw-wellfx-card" onClick={(e) => e.stopPropagation()} role="presentation">
                        <div className="tw-wellfx-coin" aria-hidden="true">🪙</div>
                        <div className="tw-wellfx-title">Your wish is granted!</div>
                        <div className="tw-wellfx-rewards">
                            <span style={{ padding: "6px 14px", borderRadius: 999, fontWeight: 900, fontSize: 16, color: "#2a1a06", background: "linear-gradient(180deg,#ffe488,#f3b23a)" }}>+{Number(wellFx.gold || 0).toLocaleString()} 🪙</span>
                            {wellFx.xp ? <span style={{ padding: "6px 14px", borderRadius: 999, fontWeight: 900, fontSize: 16, color: "#0a2e1c", background: "linear-gradient(180deg,#8fe39a,#3ec06a)" }}>+{Number(wellFx.xp).toLocaleString()} ✨ XP</span> : null}
                        </div>
                        <div className="muted" style={{ fontSize: "0.8rem" }}>Come back tomorrow for another wish.</div>
                        <button type="button" className="tw-levelup-btn" onClick={() => setWellFx(null)}>Huzzah! 🐺</button>
                    </div>
                </div>
            ) : null}

            {/* Town Development level-up celebration — the "something changed!" moment */}
            {levelUp ? (
                <div className="tw-levelup" onClick={() => setLevelUp(null)} role="presentation">
                    <div className="tw-levelup-confetti" aria-hidden="true">
                        {Array.from({ length: 24 }).map((_, i) => (
                            <span key={i} style={{ left: `${(i * 4.3) % 100}%`, "--h": `${(i * 47) % 360}`, animationDelay: `${(i % 6) * 0.12}s`, animationDuration: `${1.6 + (i % 5) * 0.18}s` }} />
                        ))}
                    </div>
                    <div className="tw-levelup-card" onClick={(e) => e.stopPropagation()} role="presentation">
                        <div className="tw-levelup-badge">🏗️ TOWN UPGRADED!</div>
                        <div className="tw-levelup-name">{levelUp.name} <span>Lv {levelUp.level}</span></div>
                        {levelUp.perk ? <div className="tw-levelup-perk">✨ {levelUp.perk}<span className="muted"> — now active for the whole Den, forever</span></div> : null}
                        <button type="button" className="tw-levelup-btn" onClick={() => setLevelUp(null)}>Huzzah! 🐺</button>
                    </div>
                </div>
            ) : null}

            <style>{TOWN_CSS}</style>
        </div>
    );
}

// Exported ONLY so the powers lab can inject it — the stockade row lives in here, and a fixture without
// these rules renders an unstyled stack that tells you nothing.
export const TOWN_CSS = `
.tw-scene { position: relative; width: 100%; height: min(66vh, 540px); border-radius: 18px; overflow: hidden; cursor: grab; touch-action: pan-y;
    box-shadow: inset 0 -30px 60px rgba(0,0,0,0.28), 0 10px 30px rgba(0,0,0,0.35); user-select: none; -webkit-user-select: none; background: #1a1330; }
.tw-scene:active { cursor: grabbing; }
.tw-world { position: absolute; top: 0; left: 0; height: 100%; will-change: transform; }
.tw-bg { position: absolute; inset: 0; display: flex; height: 100%; }
.tw-bg img { height: 100%; width: auto; display: block; flex: 0 0 auto; margin-right: -1px; }
.tw-bg img:nth-child(even) { transform: scaleX(-1); }
/* Layered parallax: far sky (slow) behind the world + a tiling cobble ground band inside it. */
/* Sky: atmospheric dusk backdrop at a normal scale (its distant silhouette is small + faint = FAR), sitting
   behind the nearer layers. Not scaled up — that made its "far" buildings read bigger than the near ones. */
.tw-far { position: absolute; top: 0; left: 0; height: 66%; display: flex; z-index: 0; }
.tw-far img { height: 100%; width: auto; display: block; flex: 0 0 auto; margin-right: -1px; }
.tw-far img:nth-child(even) { transform: scaleX(-1); }
/* Depth layers ("Grow the Plaza") — far spires sitting BEHIND the mid rooftops, kept SMALLER than mid so they
   read as farther (only the tips peek above the nearer roofline). */
/* Base lowered (56%→47%) + height grown to keep the spire TIPS at the same height while the band extends DOWN
   behind the mid rooftops — closes the blue sky sliver that showed between the skyline and the roofline. */
.tw-depth { position: absolute; left: 0; bottom: 47%; height: 33%; display: flex; align-items: flex-end; z-index: 0; pointer-events: none; }
.tw-depth img { height: 100%; width: auto; display: block; flex: 0 0 auto; margin-right: -1px; }
.tw-depth img:nth-child(even) { transform: scaleX(-1); }
/* Midground skyline band — the NEAREST backdrop, so it's the LARGEST (biggest buildings), sitting just above
   the plaza wall. Faster parallax than the far layers. This is the warm rooftop layer. */
.tw-mid { position: absolute; left: 0; bottom: 44%; height: 40%; display: flex; align-items: flex-end; z-index: 0; pointer-events: none; }
.tw-mid img { height: 100%; width: auto; display: block; flex: 0 0 auto; margin-right: -1px; }
.tw-mid img:nth-child(even) { transform: scaleX(-1); }
/* Plaza centerpiece — the wolf fountain landmark standing in the square. */
.tw-centerpiece { position: absolute; transform: translate(-50%, -100%); height: 24%; width: auto; z-index: 200; pointer-events: none; filter: drop-shadow(0 8px 12px rgba(0,0,0,0.45)); }
/* Wishing Well — the fountain becomes tappable once the town funds it. */
button.tw-centerpiece.tw-well { pointer-events: auto; border: 0; background: none; padding: 0; cursor: pointer; display: flex; flex-direction: column; align-items: center; }
button.tw-centerpiece.tw-well img { height: 100%; width: auto; }
button.tw-centerpiece.tw-well.is-spent { cursor: default; }
button.tw-centerpiece.tw-well.can-wish { animation: twWellPulse 2.2s ease-in-out infinite; }
button.tw-centerpiece.tw-well.can-wish img { filter: drop-shadow(0 0 10px rgba(255,215,110,0.8)) drop-shadow(0 8px 12px rgba(0,0,0,0.45)); }
.tw-well-badge { position: absolute; top: -18px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 0.66rem; font-weight: 900; letter-spacing: 0.02em; padding: 3px 9px; border-radius: 999px; color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); box-shadow: 0 3px 8px rgba(0,0,0,0.4); animation: twWellBob 1.6s ease-in-out infinite; }
.tw-well-badge.is-spent { color: #cbb9e0; background: rgba(20,14,34,0.9); box-shadow: none; animation: none; }
@keyframes twWellPulse { 0%,100% { transform: translate(-50%, -100%) scale(1); } 50% { transform: translate(-50%, -100%) scale(1.035); } }
@keyframes twWellBob { 0%,100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(-3px); } }
/* Wishing Well "wish granted" popup */
.tw-wellfx { position: fixed; inset: 0; z-index: 620; display: grid; place-items: center; padding: 20px; cursor: pointer; background: radial-gradient(120% 120% at 50% 40%, rgba(44,34,10,0.5), rgba(4,2,10,0.8)); animation: twRevealIn .2s ease both; }
.tw-wellfx-card { display: flex; flex-direction: column; align-items: center; gap: 8px; width: min(320px, 88vw); padding: 22px; border-radius: 20px; cursor: default; text-align: center; background: linear-gradient(180deg, rgba(38,28,52,0.98), rgba(22,16,34,0.98)); border: 1px solid rgba(255,215,110,0.35); box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
.tw-wellfx-coin { font-size: 52px; animation: twWellCoin 1s ease both; }
.tw-wellfx-title { font-size: 1.15rem; font-weight: 900; color: #ffe0a0; }
.tw-wellfx-rewards { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin: 2px 0 4px; }
@keyframes twWellCoin { 0% { transform: translateY(-30px) rotate(-180deg); opacity: 0; } 60% { transform: translateY(4px) rotate(10deg); opacity: 1; } 100% { transform: translateY(0) rotate(0); } }
/* ── Town header (modern) ── */
.tw-hdr { padding: 12px 14px; border-radius: 18px; background: linear-gradient(160deg, rgba(38,28,54,0.96), rgba(20,15,30,0.96)); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 8px 24px rgba(0,0,0,0.35); display: flex; flex-direction: column; gap: 9px; }
.tw-hdr-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tw-hdr-title { margin: 0; font-size: 1.22rem; font-weight: 900; letter-spacing: -0.01em; }
.tw-buffpill { margin-left: auto; font-size: 0.72rem; font-weight: 900; color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); border-radius: 999px; padding: 4px 11px; box-shadow: 0 0 14px rgba(243,178,58,0.55); animation: twBuffGlow 2.2s ease-in-out infinite; white-space: nowrap; }
@keyframes twBuffGlow { 0%,100% { box-shadow: 0 0 10px rgba(243,178,58,0.4); } 50% { box-shadow: 0 0 18px rgba(243,178,58,0.75); } }
.tw-hdr-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tw-pop { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 700; border-radius: 999px; padding: 6px 12px; cursor: pointer; border: 1px solid; }
.tw-pop b { font-weight: 900; }
.tw-pop-dot { width: 8px; height: 8px; border-radius: 50%; }
.tw-pop.is-here { color: #d8ffe0; background: rgba(30,64,40,0.6); border-color: rgba(74,222,128,0.55); }
.tw-pop.is-here .tw-pop-dot { background: #4ade80; box-shadow: 0 0 8px #4ade80; animation: twOnlinePulse 2s ease-in-out infinite; }
.tw-pop.is-around { color: #b7c0cf; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.14); }
.tw-pop.is-around .tw-pop-dot { background: #7c8698; }
.tw-hdr-btn { display: inline-flex; align-items: center; gap: 5px; font-size: 0.8rem; font-weight: 800; color: #e8e2f0; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; padding: 6px 12px; cursor: pointer; }
.tw-hdr-btn:active { transform: translateY(1px); }
.tw-hdr-sub { margin: 0; font-size: 0.76rem; color: #a99fc0; }
.tw-hdr-sub b { color: #d7cdec; font-weight: 800; }
/* "Around" (online elsewhere) avatars read as faint, desaturated ghosts vs the full-colour in-town crowd. */
.tw-av.is-around { opacity: 0.42; filter: grayscale(0.55); }
.tw-av.is-around .tw-bubble { display: none; }
/* The hidden shiny glint — tiny + faint; a soft twinkle you'll only catch if you're looking. */
.tw-shiny { position: absolute; z-index: 200; width: 22px; height: 22px; transform: translate(-50%, -50%); background: none; border: none; padding: 0; cursor: pointer; }
.tw-shiny-core { position: absolute; inset: 0; margin: auto; width: 7px; height: 7px; border-radius: 50%; background: radial-gradient(circle, #ffffff 0%, #fff6c8 40%, rgba(255,246,200,0) 72%); box-shadow: 0 0 6px 2px rgba(255,255,255,0.5); opacity: 0.5; animation: twShinyTwinkle 3.4s ease-in-out infinite; }
@keyframes twShinyTwinkle { 0%,100% { opacity: 0.16; transform: scale(0.7) rotate(0deg); } 45% { opacity: 0.85; transform: scale(1.15) rotate(45deg); } 60% { opacity: 0.5; } }
.tw-shiny-burst { position: absolute; inset: 0; pointer-events: none; }
.tw-shiny-burst span { position: absolute; top: 50%; left: 50%; width: 7px; height: 7px; border-radius: 50%; background: #ffe488; box-shadow: 0 0 8px #ffe488; animation: twShinyBurst 0.9s ease-out forwards; animation-delay: calc(var(--i) * 0.02s); }
@keyframes twShinyBurst { 0% { transform: translate(-50%,-50%) rotate(calc(var(--i) * 25deg)) translateX(0) scale(1); opacity: 1; } 100% { transform: translate(-50%,-50%) rotate(calc(var(--i) * 25deg)) translateX(120px) scale(0); opacity: 0; } }
/* Hangout buff earned — the one-shot celebration overlay. */
.tw-buffcele { position: fixed; inset: 0; z-index: 1250; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.55); padding: 20px; }
.tw-buffcele-card { width: min(340px, 88vw); text-align: center; padding: 24px 20px; border-radius: 22px; background: linear-gradient(180deg, rgba(48,34,14,0.98), rgba(28,20,8,0.98)); border: 1px solid rgba(255,215,110,0.55); box-shadow: 0 24px 60px rgba(0,0,0,0.6), 0 0 40px rgba(243,178,58,0.3); animation: twUp 0.4s ease both; }
.tw-buffcele-spark { font-size: 44px; animation: twBuffGlow 1.6s ease-in-out infinite; }
.tw-buffcele-title { font-size: 0.9rem; font-weight: 800; color: #ffcf7a; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }
.tw-buffcele-big { font-size: 1.7rem; font-weight: 900; color: #ffe488; text-shadow: 0 2px 10px rgba(243,178,58,0.5); margin: 2px 0; }
.tw-buffcele-sub { font-size: 0.84rem; color: #e8d6b0; }
/* Foreground plaza border wall — ground-locked, sits over the sky/street seam. */
.tw-fg { position: absolute; left: 0; bottom: 37.5%; height: 34%; display: flex; z-index: 90; pointer-events: none; }
.tw-fg img { height: 100%; width: auto; display: block; flex: 0 0 auto; margin-right: -1px; }
.tw-fg img:nth-child(even) { transform: scaleX(-1); }
.tw-cobble { position: absolute; left: 0; bottom: 0; height: 44%; display: flex; overflow: hidden; z-index: 1; box-shadow: inset 0 12px 26px rgba(0,0,0,0.35); }
.tw-cobble img { height: 100%; width: auto; display: block; flex: 0 0 auto; margin-right: -1px; }
.tw-cobble img:nth-child(even) { transform: scaleX(-1); }
/* Softer, taller shadow where the street meets the buildings behind it — dissolves the seam. */
.tw-cobble::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 68px; background: linear-gradient(180deg, rgba(26,17,40,0.9), rgba(26,17,40,0.28) 55%, transparent); pointer-events: none; }
/* CSS fallback backdrop (before art is generated) */
.tw-sky { position: absolute; inset: 0 0 34% 0; background: linear-gradient(180deg, #2a2140 0%, #3b2d55 42%, #6b4d7a 80%, #a56b6b 100%); }
.tw-ground { position: absolute; inset: 66% 0 0 0; background: radial-gradient(120% 80% at 50% -10%, rgba(255,190,120,0.12), transparent 60%), repeating-linear-gradient(90deg, #55402c 0 38px, #5c4630 38px 76px), linear-gradient(180deg, #6a5138, #4a381f); box-shadow: inset 0 8px 24px rgba(0,0,0,0.35); }

.tw-online { font-size: 0.72rem; font-weight: 800; color: #8fe39a; background: rgba(143,227,154,0.12); border: 1px solid rgba(143,227,154,0.35); border-radius: 999px; padding: 2px 9px; }
/* Live online count — green bubble, top-left of the scene */
.tw-online-badge { position: absolute; top: 8px; left: 8px; z-index: 470; display: inline-flex; align-items: center; gap: 6px; font-size: 0.72rem; font-weight: 900; color: #d8ffe0; background: rgba(16,32,20,0.82); border: 1px solid rgba(143,227,154,0.5); border-radius: 999px; padding: 4px 10px; cursor: pointer; box-shadow: 0 3px 10px rgba(0,0,0,0.4); }
.tw-online-badge .tw-online-dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 8px #4ade80; animation: twOnlinePulse 2s ease-in-out infinite; }
@keyframes twOnlinePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
/* Enemy "fight me" crossed-swords hint */
.tw-enemy-crossed { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); font-size: 15px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.7)); pointer-events: none; opacity: 0.9; }
/* ── BOSS RAID — a huge shared boss in the plaza ── */
.tw-boss { position: absolute; transform: translate(-50%, -100%); background: none; border: none; padding: 0; cursor: pointer; display: flex; flex-direction: column; align-items: center; animation: twBossLoom 3s ease-in-out infinite; }
.tw-boss-art { height: 300px; width: auto; max-width: 92vw; filter: drop-shadow(0 12px 18px rgba(0,0,0,0.6)); }
.tw-boss-bigemoji { font-size: 180px; }
.tw-boss-hpbar { width: 220px; max-width: 60vw; height: 12px; border-radius: 999px; background: rgba(0,0,0,0.6); border: 1px solid rgba(0,0,0,0.5); overflow: hidden; margin-bottom: 6px; }
.tw-boss-hpbar span { display: block; height: 100%; background: linear-gradient(90deg,#e0433f,#ff7a3c); transition: width .4s ease; }
.tw-boss-join { margin-top: 6px; font-size: 0.78rem; font-weight: 900; color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); padding: 4px 14px; border-radius: 999px; box-shadow: 0 3px 10px rgba(0,0,0,0.45); animation: twWellBob 1.4s ease-in-out infinite; }
@keyframes twBossLoom { 0%,100% { transform: translate(-50%, -100%) scale(1); } 50% { transform: translate(-50%, -100%) scale(1.03); } }
/* Boss battle modal */
.tw-boss-modal { position: fixed; inset: 0; z-index: 640; display: grid; place-items: center; padding: 14px; background: radial-gradient(120% 120% at 50% 25%, rgba(60,16,10,0.82), rgba(4,2,1,0.94)); animation: twRevealIn .2s ease both; }
.tw-boss-panel { width: min(440px, 96vw); border-radius: 20px; padding: 14px; background: linear-gradient(180deg, rgba(28,16,12,0.99), rgba(14,8,6,0.99)); border: 1px solid rgba(224,120,74,0.55); box-shadow: 0 22px 60px rgba(0,0,0,0.72); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.tw-boss-top { display: flex; align-items: center; justify-content: space-between; width: 100%; }
.tw-boss-title { font-size: 1.05rem; font-weight: 900; color: #ffcaba; }
/* Was a fixed 30px circle holding the text "✕ Leave", so the label overflowed the button and ran off the
   right edge of the screen. It's a pill that sizes to its own content now. */
.tw-boss-leave { display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.16); color: #e8d6c0; width: auto; height: 30px; padding: 0 11px; border-radius: 999px; font-size: 13px; font-weight: 700; line-height: 1; white-space: nowrap; cursor: pointer; }
.tw-boss-leave:hover { background: rgba(255,255,255,0.16); }

/* ── Timing strike: bands mirror the Forge's anvil so the skill carries over ─────────────────────────────── */
/* width:100% is load-bearing — the parent centres its children, so without it this whole block shrink-wrapped
   to the width of the Strike button and the timing bar rendered as a ~200px sliver on a phone. */
.tw-strike { width: 100%; margin: 12px 0 2px; }
.tw-strike-bar { position: relative; width: 100%; height: 54px; border-radius: 14px; overflow: hidden;
    background: linear-gradient(180deg, rgba(0,0,0,0.62), rgba(0,0,0,0.44)); border: 2px solid rgba(255,255,255,0.18);
    box-shadow: inset 0 2px 10px rgba(0,0,0,0.6), 0 2px 14px rgba(0,0,0,0.4); display: flex; }
.tw-strike-band { position: absolute; top: 0; bottom: 0; }
/* Widths are COMPUTED from the server's grade bands (lib/marketplace/timing.js), not typed in — the zone you
   can see is the zone you are graded against, and it stays that way if the bands are ever retuned. */
.tw-strike-band.is-good { left: ${bandLeftPct("good")}%; width: ${bandPct("good")}%; background: linear-gradient(180deg, rgba(215,196,138,0.30), rgba(215,196,138,0.16)); }
.tw-strike-band.is-great { left: ${bandLeftPct("great")}%; width: ${bandPct("great")}%; background: linear-gradient(180deg, rgba(143,227,154,0.42), rgba(143,227,154,0.20)); }
.tw-strike-band.is-perfect { left: ${bandLeftPct("perfect")}%; width: ${bandPct("perfect")}%; background: linear-gradient(180deg, rgba(143,227,255,0.72), rgba(143,227,255,0.34));
    box-shadow: 0 0 18px rgba(143,227,255,0.5); animation: twPerfectPulse 1.1s ease-in-out infinite; }
@keyframes twPerfectPulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.45); } }
/* Names the zones — an unlabelled gradient told you nothing about where the payoff was. */
.tw-strike-zone { position: absolute; top: 4px; font-size: 0.5rem; font-weight: 900; letter-spacing: 0.09em; color: rgba(255,255,255,0.5); pointer-events: none; transform: translateX(-50%); }
.tw-strike-marker { position: absolute; top: -3px; bottom: -3px; width: 6px; margin-left: -3px; border-radius: 3px;
    background: linear-gradient(180deg, #fff, #ffe488); box-shadow: 0 0 16px rgba(255,255,255,0.95), 0 0 34px rgba(255,215,94,0.6); }
/* A soft trail behind the marker so the sweep reads as motion instead of a jumping tick. */
.tw-strike-marker::after { content: ""; position: absolute; top: 0; bottom: 0; right: 6px; width: 46px;
    background: linear-gradient(90deg, rgba(255,228,136,0) 0%, rgba(255,228,136,0.28) 100%); pointer-events: none; }
.tw-strike-bar.is-hit { animation: twStrikeFlash 0.3s ease-out; }
@keyframes twStrikeFlash { 0% { filter: brightness(2.4); transform: scale(1.03); } 100% { filter: brightness(1); transform: scale(1); } }
.tw-bld-todo { position: absolute; top: -6px; right: -6px; z-index: 3; min-width: 21px; height: 21px; padding: 0 5px;
    display: grid; place-items: center; border-radius: 999px; font-size: 0.72rem; font-weight: 900; color: #2a1c05;
    background: linear-gradient(180deg,#ffe488,#f3b23a); border: 2px solid #17121f;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5); animation: twTodoPulse 2.1s ease-in-out infinite; }
@keyframes twTodoPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.13); } }
.tw-strike-btn { position: relative; overflow: hidden; width: 100%; margin-top: 10px; padding: 17px; border: none; border-radius: 14px; font-weight: 900; font-size: 1.15rem; letter-spacing: 0.02em; color: #3a2c08; background: linear-gradient(180deg,#ffe488,#f3b23a); box-shadow: 0 4px 0 #b57f22, 0 6px 18px rgba(0,0,0,0.4); cursor: pointer; -webkit-tap-highlight-color: transparent; }
.tw-strike-btn-label { position: relative; z-index: 2; }
/* ── COMBO CHAIN ── the only place a run of clean swings is visible, so it climbs loudly. */
.tw-combo { text-align: center; margin-top: 6px; font-size: 0.9rem; font-weight: 900; letter-spacing: 0.08em;
    color: #8fe3ff; animation: twComboPop 0.34s cubic-bezier(.2,1.7,.4,1) both; }
.tw-combo b { font-size: 1.2rem; }
.tw-combo.is-warm { color: #ffd75e; text-shadow: 0 0 12px rgba(255,215,94,0.6); }
.tw-combo.is-hot { color: #ff9e6e; text-shadow: 0 0 16px rgba(255,120,60,0.85); }
@keyframes twComboPop { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.25); } 100% { transform: scale(1); opacity: 1; } }
/* ── STRIKE PROC ── the loud payoff for executing well. Deliberately covers the fight for a beat. */
.tw-bossproc { position: absolute; left: 50%; top: 34%; transform: translate(-50%, -50%); z-index: 620; pointer-events: none;
    display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; width: max-content; max-width: 92%;
    animation: twBossProc 1.6s cubic-bezier(.2,1.4,.3,1) both; }
.tw-bossproc b { font-size: 1.35rem; font-weight: 900; letter-spacing: 0.02em; color: #fff3c4;
    text-shadow: 0 0 18px rgba(255,200,80,0.95), 0 3px 10px rgba(0,0,0,0.8); }
.tw-bossproc span { font-size: 0.78rem; font-weight: 800; color: #ffe488; text-shadow: 0 2px 8px rgba(0,0,0,0.9); }
@keyframes twBossProc {
    0% { transform: translate(-50%,-50%) scale(0.4); opacity: 0; }
    18% { transform: translate(-50%,-50%) scale(1.18); opacity: 1; }
    30% { transform: translate(-50%,-50%) scale(1); }
    78% { opacity: 1; }
    100% { transform: translate(-50%,-90%) scale(1); opacity: 0; }
}
/* The cooldown drains left-to-right across the button. A dead button that comes back at an unannounced moment
   reads as broken; a visible drain reads as a rhythm you can play to. */
.tw-strike-cd { position: absolute; inset: 0; z-index: 1; transform-origin: right center; transform: scaleX(0);
    background: rgba(0,0,0,0.32); pointer-events: none; }
.tw-strike-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 #b57f22; }
.tw-strike-btn.is-cooling { opacity: 0.55; box-shadow: none; }
.tw-strike-grade { text-align: center; margin-top: 6px; font-weight: 900; font-size: 0.95rem; animation: twStrikePop 0.35s ease-out; }
.tw-strike-grade.is-pixel { color: #ffd75e; }
.tw-strike-grade.is-perfect { color: #8fe3ff; }
.tw-strike-grade.is-great { color: #8fe39a; }
.tw-strike-grade.is-good { color: #d7c48a; }
.tw-strike-grade.is-miss { color: #ff8f9a; }
/* Why a swing didn't land. Sits where the grade would, deliberately quieter than a real hit. */
.tw-strike-notice { text-align: center; margin-top: 6px; font-weight: 700; font-size: 0.82rem; color: #b9a98f; animation: twStrikePop 0.35s ease-out; }
@keyframes twStrikePop { from { transform: scale(0.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }

/* ── Itemised raid recap ─────────────────────────────────────────────────────────────────────────────────── */
.tw-recap { width: min(94vw, 420px); max-height: 86vh; overflow-y: auto; background: #14141b; border: 1px solid #2a2f37; border-radius: 16px; padding: 18px 16px; text-align: center; }
.tw-recap-head { margin-bottom: 12px; }
.tw-recap-emoji { font-size: 42px; line-height: 1; }
.tw-recap-title { margin: 6px 0 2px; font-size: 1.15rem; }
.tw-recap-sub { margin: 0; font-size: 0.82rem; color: #8b93a0; }
.tw-recap-you { background: rgba(255,215,94,0.1); border: 1px solid rgba(255,215,94,0.3); border-radius: 12px; padding: 10px 12px; margin-bottom: 10px; }
.tw-recap-yourow { display: flex; justify-content: space-between; align-items: baseline; font-size: 0.92rem; }
.tw-recap-yourow b { font-size: 1.35rem; color: #ffd75e; }
.tw-recap-yousub { margin-top: 3px; font-size: 0.75rem; color: #b7c0cf; text-align: left; line-height: 1.35; }
.tw-recap-rewards { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-bottom: 12px; }
.tw-recap-chip { font-size: 0.82rem; font-weight: 800; color: #e7dcc4; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 999px; padding: 5px 10px; }
/* ── Victory recap: your performance, then the haul ─────────────────────────────────────────────────────── */
.tw-recap-emoji { animation: twTrophyPop 0.7s cubic-bezier(.2,1.6,.4,1) both; }
@keyframes twTrophyPop { 0% { transform: scale(0.2) rotate(-22deg); opacity: 0; } 60% { transform: scale(1.25) rotate(6deg); } 100% { transform: scale(1) rotate(0); opacity: 1; } }
.tw-recap-perf { display: flex; align-items: center; gap: 11px; }
.tw-recap-medal { font-size: 30px; line-height: 1; flex: 0 0 auto; }
.tw-recap-perfbody { display: flex; flex-direction: column; gap: 1px; min-width: 0; text-align: left; }
.tw-recap-perfbody b { font-size: 1.02rem; color: #ffe488; }
/* The reward band earned, sat beside the rank. Coloured like the chest it pays. */
.tw-recap-tier { margin-left: 7px; padding: 1px 7px; border-radius: 999px; font-size: 0.66rem; font-weight: 900; letter-spacing: 0.04em; text-transform: uppercase; vertical-align: middle; border: 1px solid currentColor; }
.tw-recap-tier.is-champion { color: #ffd75e; background: rgba(255,215,94,0.14); }
.tw-recap-tier.is-veteran { color: #ffc06b; background: rgba(255,192,107,0.12); }
.tw-recap-tier.is-fighter { color: #b9c6d4; background: rgba(185,198,212,0.12); }
.tw-recap-tier.is-recruit { color: #b08a52; background: rgba(176,138,82,0.14); }
.tw-recap-perfbody em { font-style: normal; font-size: 0.78rem; color: #b7c0cf; }
.tw-recap-sharebar { height: 8px; border-radius: 999px; background: rgba(0,0,0,0.45); overflow: hidden; margin: 9px 0 5px; }
.tw-recap-sharebar span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg,#f3b23a,#ffe488); animation: twShareGrow 0.9s cubic-bezier(.2,1,.3,1) both; }
@keyframes twShareGrow { from { width: 0 !important; } }
.tw-recap-hauline { font-size: 0.64rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: #ffd75e; margin: 14px 0 7px; }
.tw-recap-haul { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 4px; }
/* Each prize lands separately — the stagger is the point, so three rewards read as three events. */
.tw-recap-prize { flex: 1 1 92px; max-width: 140px; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 12px 8px; border-radius: 14px;
    background: linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03)); border: 1px solid rgba(255,255,255,0.16);
    animation: twPrizeIn 0.5s cubic-bezier(.2,1.5,.4,1) both; }
@keyframes twPrizeIn { 0% { transform: translateY(14px) scale(0.8); opacity: 0; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
.tw-recap-prize.is-gold { border-color: rgba(255,215,94,0.5); box-shadow: 0 0 22px rgba(255,215,94,0.22); }
.tw-recap-prize.is-xp { border-color: rgba(143,227,255,0.45); box-shadow: 0 0 22px rgba(143,227,255,0.18); }
.tw-recap-prize.is-chest { border-color: rgba(201,162,255,0.5); box-shadow: 0 0 22px rgba(201,162,255,0.22); }
.tw-recap-prize-ico { font-size: 30px; line-height: 1; }
.tw-recap-prize b { font-size: 1.15rem; font-variant-numeric: tabular-nums; }
.tw-recap-prize em { font-style: normal; font-size: 0.66rem; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: #8b93a0; }
.tw-recap-chesthint { margin: 2px 0 10px; font-size: 0.73rem; color: #8b93a0; }
.tw-recap-boardhead { text-align: left; font-size: 0.66rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; color: #8b93a0; margin-bottom: 5px; }
.tw-recap-board { display: flex; flex-direction: column; gap: 3px; margin-bottom: 14px; }
.tw-recap-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 9px; background: rgba(255,255,255,0.03); }
.tw-recap-row.is-you { background: rgba(255,215,94,0.14); border: 1px solid rgba(255,215,94,0.3); }
.tw-recap-rank { width: 18px; font-size: 0.76rem; font-weight: 800; color: #8b93a0; }
.tw-recap-hero { width: 26px; height: 26px; display: flex; align-items: flex-end; justify-content: center; flex: 0 0 auto; }
.tw-recap-hero img { width: 100%; height: 100%; object-fit: contain; }
.tw-recap-name { flex: 1 1 auto; text-align: left; font-size: 0.85rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tw-recap-dmg { font-size: 0.85rem; font-weight: 800; color: #ffd75e; }
.tw-boss-stage { position: relative; width: 100%; display: grid; place-items: center; padding: 6px 0 2px; cursor: pointer; }
.tw-boss-big { height: 230px; width: auto; max-width: 100%; filter: drop-shadow(0 10px 16px rgba(0,0,0,0.6)); transition: transform .1s; }
.tw-boss-big.is-cd { filter: drop-shadow(0 10px 16px rgba(0,0,0,0.6)) brightness(1.25) saturate(1.2); }
.tw-boss-big:active { transform: scale(0.97); }
.tw-boss-bigemoji { font-size: 150px; }
.tw-boss-dmg { position: absolute; top: 20%; font-weight: 900; font-size: 22px; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.85); pointer-events: none; animation: twDmg .8s ease-out forwards; }
.tw-boss-dmg.is-crit { font-size: 30px; color: #ffe27a; }
.tw-boss-hpwrap { width: 100%; }
.tw-boss-hpline { font-size: 0.74rem; font-weight: 800; color: #ffd0c8; margin-bottom: 3px; }
.tw-boss-hpline b { color: #fff; }
.tw-boss-hpouter { width: 100%; height: 16px; border-radius: 999px; background: rgba(0,0,0,0.55); border: 1px solid rgba(0,0,0,0.5); overflow: hidden; }
.tw-boss-hpouter span { display: block; height: 100%; background: linear-gradient(90deg,#e0433f,#ff7a3c); transition: width .35s ease; }
/* The pack — engaged fighters' hero sprites lunging at the boss (each on its own stagger so it reads as a swarm). */
.tw-boss-fighters { display: flex; flex-wrap: wrap; gap: 2px; align-items: flex-end; justify-content: center; width: 100%; min-height: 56px; }
.tw-boss-hero { position: relative; width: 46px; height: 52px; display: grid; place-items: end center; animation: twBossHeroAttack 1.3s ease-in-out infinite; }
.tw-boss-hero img { width: 46px; height: 46px; object-fit: contain; filter: drop-shadow(0 3px 4px rgba(0,0,0,0.5)); }
.tw-boss-herofallback { font-size: 30px; }
.tw-boss-hero.is-you img { filter: drop-shadow(0 0 6px rgba(255,215,94,0.9)) drop-shadow(0 3px 4px rgba(0,0,0,0.5)); }
.tw-boss-heroyou { position: absolute; top: -4px; left: 50%; transform: translateX(-50%); font-size: 0.5rem; font-weight: 900; color: #2a1a06; background: #ffd75e; border-radius: 999px; padding: 0 4px; }
@keyframes twBossHeroAttack { 0%,100% { transform: translateY(0) rotate(0); } 45% { transform: translateY(-9px) rotate(-6deg); } 60% { transform: translateY(-2px) rotate(3deg); } }
.tw-boss-hint { font-size: 0.68rem; color: #cbb9a0; text-align: center; }
/* ── DUEL modal ── */
.tw-duel { position: fixed; inset: 0; z-index: 640; display: grid; place-items: center; padding: 18px; background: radial-gradient(120% 120% at 50% 30%, rgba(40,12,8,0.72), rgba(4,2,1,0.9)); animation: twRevealIn .2s ease both; }
.tw-duel-card { width: min(400px, 94vw); border-radius: 20px; padding: 18px; background: linear-gradient(180deg, rgba(30,18,14,0.99), rgba(16,10,8,0.99)); border: 1px solid rgba(224,120,74,0.5); box-shadow: 0 20px 55px rgba(0,0,0,0.7); }
.tw-duel-title { text-align: center; font-size: 1.05rem; font-weight: 900; color: #ffcaba; margin-bottom: 12px; }
.tw-duel-arena { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; }
.tw-duel-side { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; }
.tw-duel-side img { width: 84px; height: 84px; object-fit: contain; filter: drop-shadow(0 5px 8px rgba(0,0,0,0.5)); }
.tw-duel-emoji { font-size: 56px; }
.tw-duel-side.is-hit { animation: twDuelShake .3s ease; }
@keyframes twDuelShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
.tw-duel-name { font-size: 0.72rem; font-weight: 800; color: #e8d6c0; }
.tw-duel-hp { width: 92%; height: 8px; border-radius: 999px; background: rgba(0,0,0,0.5); overflow: hidden; }
.tw-duel-hp span { display: block; height: 100%; background: linear-gradient(90deg,#4ade80,#22c55e); transition: width .35s ease; }
.tw-duel-hp.foe span { background: linear-gradient(90deg,#e0433f,#ff7a3c); }
.tw-duel-vs { font-size: 0.9rem; font-weight: 900; color: #ffb08a; }
.tw-duel-dmg { position: absolute; top: 6px; left: 50%; transform: translateX(-50%); font-weight: 900; font-size: 18px; color: #fff; text-shadow: 0 2px 3px rgba(0,0,0,0.8); pointer-events: none; animation: twDmg .6s ease-out forwards; }
.tw-duel-dmg.is-crit { font-size: 24px; color: #ffe27a; }
.tw-duel-result { text-align: center; margin-top: 14px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.tw-duel-verdict { font-size: 1.3rem; font-weight: 900; }
.tw-duel-verdict.win { color: #8fe39a; text-shadow: 0 0 14px rgba(62,192,106,0.6); }
.tw-duel-verdict.lose { color: #ff9a8f; }
.tw-duel-rewards { display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; }
.tw-duel-chip { font-size: 0.86rem; font-weight: 900; padding: 5px 12px; border-radius: 999px; }
.tw-duel-chip.xp { color: #0a2e1c; background: linear-gradient(180deg,#8fe39a,#3ec06a); }
.tw-duel-chip.gold { color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); }
.tw-duel-chip.loot { color: #e0c8ff; background: rgba(150,90,255,0.18); border: 1px solid rgba(184,120,255,0.45); }
/* Junk gear reads as SCRAP, not treasure — dull steel, so a common drop never masquerades as a real find. */
.tw-duel-chip.loot.scrap { color: #cfd8e3; background: rgba(150,170,195,0.16); border: 1px solid rgba(170,190,215,0.4); }
.tw-duel-chip.loot.scrap em { font-style: normal; opacity: 0.65; font-weight: 700; }
.tw-duel-note { font-size: 0.76rem; font-weight: 800; color: #ffd9a0; }
.tw-duel-fighting { margin: 12px auto 0; text-align: center; font-weight: 900; font-size: 0.82rem; color: #ffb08a; letter-spacing: 0.03em; animation: twOnlinePulse 1.1s ease-in-out infinite; }
.tw-openchip { font-size: 0.7rem; font-weight: 800; border-radius: 999px; padding: 2px 9px; color: #e69a9a; background: rgba(224,67,63,0.1); border: 1px solid rgba(224,67,63,0.32); }
.tw-openchip.is-open { color: #8fe39a; background: rgba(143,227,154,0.12); border-color: rgba(143,227,154,0.35); }
.tw-roster-btn { font-size: 0.74rem; font-weight: 800; color: #ffe0b0; background: rgba(255,215,110,0.12); border: 1px solid rgba(255,215,110,0.4); border-radius: 999px; padding: 3px 11px; cursor: pointer; }

.tw-building { position: absolute; transform: translateX(-50%); bottom: auto; display: flex; flex-direction: column; align-items: center; gap: 3px; text-decoration: none; color: #ffe9b0; transition: transform .12s ease; }
.tw-building { transform: translate(-50%, -100%); }
.tw-building.is-locked { cursor: not-allowed; }
.tw-building.is-locked .tw-building-art, .tw-building.is-locked .tw-building-card { filter: brightness(0.62) saturate(0.7); }
/* Market Day — the General Store glows warm + flies an OPEN flag while the physical shop is open. */
.tw-building.is-openshop .tw-building-art, .tw-building.is-openshop .tw-building-card { filter: drop-shadow(0 0 14px rgba(255,201,92,0.85)) drop-shadow(0 6px 10px rgba(0,0,0,0.5)); animation: twShopGlow 2.4s ease-in-out infinite; }
@keyframes twShopGlow { 0%,100% { filter: drop-shadow(0 0 10px rgba(255,201,92,0.6)) drop-shadow(0 6px 10px rgba(0,0,0,0.5)); } 50% { filter: drop-shadow(0 0 20px rgba(255,220,120,0.95)) drop-shadow(0 6px 10px rgba(0,0,0,0.5)); } }
.tw-openflag { position: absolute; top: -6px; left: 50%; transform: translateX(-50%); z-index: 2; font-size: 0.6rem; font-weight: 900; letter-spacing: 0.08em; color: #2a1a06; background: linear-gradient(180deg,#8fe39a,#3ec06a); padding: 2px 8px; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.5); animation: twWellBob 1.5s ease-in-out infinite; }
/* "Open until 9 PM · +10% XP" — a statement about a real shop, so it's styled like a status, not a sale.
   Dark glass with a live green dot, matching the "Open til 9 PM" chip on the header rather than shouting over
   the artwork in gold. */
/* The single status bubble: who's here, and — when the shop is physically open — that it's open, with the XP
   bonus. One pill instead of two fighting for the same corner. */
.tw-online-sep { color: rgba(216,255,224,0.35); margin: 0 1px; }
.tw-online-open { color: #d8ffe0; font-weight: 700; }
.tw-online-xp { color: #ffe488; font-weight: 900; }
.tw-building:hover { transform: translate(-50%, -100%) translateY(-4px); }
/* contact shadow so the building reads as sitting ON the cobblestones */
.tw-building::after { content: ""; position: absolute; bottom: -7px; left: 50%; transform: translateX(-50%); width: 72%; height: 18px; border-radius: 50%; background: radial-gradient(ellipse, rgba(0,0,0,0.5), transparent 72%); z-index: -1; pointer-events: none; }
.tw-building-art { display: block; height: 176px; width: auto; max-width: 244px; object-fit: contain; filter: drop-shadow(0 10px 14px rgba(0,0,0,0.5)); }
.tw-building-art[style*="scaleX"] { transform-origin: bottom center; }
.tw-building-card { display: grid; place-items: center; width: 96px; height: 120px; border-radius: 12px; background: linear-gradient(180deg, rgba(40,28,58,0.94), rgba(26,18,40,0.96)); border: 1px solid rgba(255,215,110,0.4); box-shadow: 0 10px 22px rgba(0,0,0,0.5); }
.tw-building-emoji { font-size: 46px; filter: drop-shadow(0 3px 4px rgba(0,0,0,0.5)); }
.tw-building-label { position: absolute; bottom: -22px; font-size: 10.5px; font-weight: 800; white-space: nowrap; background: rgba(20,14,30,0.75); border-radius: 6px; padding: 1px 7px; }

.tw-av { position: absolute; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; cursor: pointer; }
.tw-sprite { position: relative; width: 60px; height: 60px; display: grid; place-items: center; transform-origin: 50% 100%; }
/* Idle "alive" breathing squash — a subtle neck squish so characters feel alive without wandering. */
.tw-sprite:not(.is-walking) { animation: twBreathe 2.8s ease-in-out infinite; }
@keyframes twBreathe { 0%,100% { transform: scaleY(1) scaleX(1); } 48% { transform: scaleY(0.955) scaleX(1.035); } }
.tw-sprite img { width: 60px; height: 60px; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.55)); }
.tw-npc-btn img { animation: twBreathe 3.1s ease-in-out infinite; transform-origin: 50% 100%; }
.tw-sprite-fallback { font-size: 42px; }
.tw-pet-wrap { position: absolute; bottom: -2px; z-index: -1; transition: transform 1.6s ease-in-out; }
.tw-pet-bob { display: block; }
.tw-pet-bob.is-walking { animation: twPetTrot .42s ease-in-out infinite; }
@keyframes twPetTrot { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.tw-pet { display: block; width: 30px; height: 30px; object-fit: contain; filter: drop-shadow(0 3px 4px rgba(0,0,0,0.5)); }
.tw-sprite.is-walking { animation: twBob .5s ease-in-out infinite; transform-origin: bottom center; }
@keyframes twBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.tw-av.is-you .tw-sprite::after { content: ""; position: absolute; bottom: -3px; left: 50%; transform: translateX(-50%); width: 42px; height: 9px; border-radius: 50%; background: radial-gradient(ellipse, rgba(255,215,110,0.55), transparent 70%); }
.tw-name { font-size: 10px; font-weight: 800; color: #f2ead9; background: rgba(20,14,30,0.72); border-radius: 6px; padding: 0 6px; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
.tw-av.is-you .tw-name { color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); }
.tw-bubble { font-size: 10px; font-weight: 700; color: #eadfff; background: rgba(30,20,48,0.85); border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; padding: 2px 8px; margin-bottom: 3px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
.tw-wave { position: absolute; top: -6px; right: -8px; font-size: 20px; animation: twWave .5s ease-in-out infinite; }
@keyframes twWave { 0%,100% { transform: rotate(-16deg); } 50% { transform: rotate(16deg); } }

/* Chat speech bubbles + typing dots above avatars, and the composer bar below the scene. */
.tw-chat { background: #fff; color: #1a1206; font-size: 11px; font-weight: 700; white-space: normal; max-width: 180px; text-align: center; border: 1px solid rgba(0,0,0,0.12); box-shadow: 0 3px 10px rgba(0,0,0,0.45); }
.tw-av.is-you .tw-chat { background: linear-gradient(180deg,#ffe488,#f3b23a); color: #2a1a06; }
.tw-typing-bubble { display: inline-flex; gap: 3px; align-items: center; padding: 5px 9px; }
.tw-typing-bubble span { width: 5px; height: 5px; border-radius: 50%; background: #cbb9e0; animation: twType 1.2s infinite; }
.tw-typing-bubble span:nth-child(2) { animation-delay: .2s; }
.tw-typing-bubble span:nth-child(3) { animation-delay: .4s; }
@keyframes twType { 0%,60%,100% { opacity: .3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
.tw-chatbar { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; }
/* Persistent plaza chat LOG under the scene — column-reverse so the newest sits at the bottom and it stays
   pinned there as messages arrive (fed newest-first). Each row shows the sender's HERO sprite + name + time. */
.tw-chatlog { display: flex; flex-direction: column-reverse; gap: 9px; max-height: 190px; overflow-y: auto; padding: 4px 2px 8px; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 2px; }
.tw-clog-row { display: flex; gap: 8px; align-items: flex-start; }
.tw-clog-row.mine { flex-direction: row-reverse; }
.tw-clog-hero { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 9px; overflow: hidden; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: flex-end; justify-content: center; }
.tw-clog-hero img { width: 100%; height: 100%; object-fit: contain; }
.tw-clog-fallback { align-self: center; font-weight: 800; font-size: 13px; opacity: 0.7; }
.tw-clog-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; max-width: 80%; }
.tw-clog-top { display: flex; gap: 6px; align-items: baseline; }
.tw-clog-row.mine .tw-clog-top { flex-direction: row-reverse; }
.tw-clog-name { font-weight: 800; font-size: 12px; color: #ffe0a0; }
.tw-clog-time { font-size: 10px; opacity: 0.45; white-space: nowrap; }
.tw-clog-body { font-size: 13.5px; line-height: 1.34; background: rgba(255,255,255,0.06); padding: 6px 10px; border-radius: 11px; color: #f2ead9; word-break: break-word; }
.tw-clog-row.mine .tw-clog-body { background: linear-gradient(180deg,#ffd75e,#f3b23a); color: #2a1a06; }
.tw-chat-form { display: flex; gap: 8px; }
.tw-chat-form input { flex: 1 1 auto; min-width: 0; padding: 10px 14px; border-radius: 999px; border: 1px solid rgba(255,215,110,0.35); background: rgba(255,255,255,0.05); color: #f2ead9; font-size: 14px; }
.tw-chat-form input::placeholder { color: #9a8fb0; }
.tw-chat-send { flex: 0 0 auto; width: 44px; border-radius: 999px; border: none; background: linear-gradient(180deg,#ffd75e,#f3b23a); color: #1c130a; font-weight: 900; font-size: 15px; cursor: pointer; }
.tw-chat-send:disabled { opacity: .5; cursor: default; }
.tw-emote-row { display: flex; gap: 6px; flex-wrap: wrap; }
.tw-emote-row button { flex: 0 0 auto; width: 38px; height: 38px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); font-size: 19px; line-height: 1; cursor: pointer; }
.tw-emote-row button:active { transform: translateY(1px); }


.tw-emote { padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(255,215,110,0.5); background: linear-gradient(180deg, rgba(44,34,64,0.96), rgba(28,22,42,0.96)); color: #ffe9b0; font-weight: 800; font-size: 13px; cursor: pointer; }
.tw-emote:active { transform: translateY(1px); }

.tw-roster { position: fixed; inset: 0; z-index: 400; display: flex; align-items: flex-end; justify-content: center; background: rgba(6,4,12,0.6); backdrop-filter: blur(3px); }
.tw-roster-panel { width: 100%; max-width: 480px; max-height: 70dvh; overflow-y: auto; background: linear-gradient(180deg, #1c1436, #120c22); border: 1px solid rgba(255,215,110,0.3); border-radius: 18px 18px 0 0; padding: 14px 14px 20px; box-shadow: 0 -16px 44px rgba(0,0,0,0.6); animation: twUp .26s cubic-bezier(.2,1,.3,1) both; }
@keyframes twUp { from { transform: translateY(30px); opacity: .5; } to { transform: none; opacity: 1; } }
.tw-roster-head { display: flex; align-items: center; margin-bottom: 8px; color: #ffe0b0; }
.tw-roster-head button { margin-left: auto; background: rgba(255,255,255,0.08); border: none; color: #e8e2d6; width: 28px; height: 28px; border-radius: 999px; font-size: 15px; cursor: pointer; }
.tw-roster-row { display: flex; align-items: center; gap: 8px; padding: 9px 4px; border-top: 1px solid rgba(255,255,255,0.06); }
.tw-roster-row.is-you .tw-roster-name { color: #ffe488; }
.tw-roster-name { font-weight: 800; font-size: 0.9rem; color: #f0ede6; min-width: 90px; }
.tw-roster-status { font-size: 0.82rem; color: #cbb9e0; flex: 1; }
.tw-roster-go { font-size: 0.76rem; font-weight: 800; color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); border: none; border-radius: 8px; padding: 5px 10px; cursor: pointer; white-space: nowrap; }

/* Emote pop (emoji-only chat) + friend highlight ring under the sprite */
.tw-emote-pop { font-size: 30px; line-height: 1; margin-bottom: 2px; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.5)); animation: twEmote 2.4s ease-out infinite; transform-origin: bottom center; }
@keyframes twEmote { 0% { transform: translateY(6px) scale(.4); opacity: 0; } 18% { transform: translateY(0) scale(1.15); opacity: 1; } 30% { transform: scale(1); } 85% { opacity: 1; } 100% { transform: translateY(-6px); opacity: .85; } }
.tw-av.is-friend .tw-sprite::before { content: ""; position: absolute; left: 0; right: 0; bottom: -4px; margin: 0 auto; width: 46px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 2px rgba(120,200,255,0.8), 0 0 10px rgba(120,200,255,0.7); }

/* Collective-upgrade decorations */
.tw-npc { position: absolute; transform: translate(-50%, -100%); height: 92px; width: auto; z-index: 97; pointer-events: none; filter: drop-shadow(0 6px 8px rgba(0,0,0,0.55)); }
/* Interactive plaza NPCs (crier / merchant) — a tappable button with a sprite + a speech bubble. */
.tw-npc-btn { position: absolute; transform: translate(-50%, -100%); background: none; border: none; padding: 0; cursor: pointer; z-index: 250; display: flex; flex-direction: column; align-items: center; }
/* THE STOCKADE — the occupant is DRAWN INTO the boards as one image (see renderOccupantArt), so there is no
   sprite to position here; it just stands a little taller than the NPCs. */
/* Panel: the ACTIONS sit above the occupant so they're the first thing your thumb reaches and can never end up
   under the floating chat button, and the portrait below them is the payoff rather than a thumbnail. */
.tw-stock-reason { margin: 2px 2px 10px; font-size: 0.88rem; font-style: italic; color: #c9b6b6; line-height: 1.35; }
.tw-stock-self { margin: 6px 2px 12px; font-size: 0.88rem; color: #e2b4b4; }
.tw-stock-actions { display: grid; gap: 9px; margin-bottom: 14px; }
.tw-stock-btn { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; width: 100%; padding: 12px 14px; border-radius: 14px; cursor: pointer; text-align: left; font: inherit; border: 1px solid rgba(255,255,255,0.16); background: linear-gradient(180deg, rgba(58,40,40,0.96), rgba(38,26,26,0.96)); color: #f2e6e6; box-shadow: 0 3px 12px rgba(0,0,0,0.45); transition: transform .06s ease, filter .12s ease; }
.tw-stock-btn:hover:not(:disabled) { filter: brightness(1.14); }
.tw-stock-btn:active:not(:disabled) { transform: translateY(1px) scale(0.995); }
.tw-stock-btn:disabled { opacity: 0.42; cursor: default; }
.tw-stock-btn.is-shame { border-color: rgba(255,205,120,0.42); background: linear-gradient(180deg, rgba(74,58,30,0.96), rgba(44,34,18,0.96)); }
.tw-stock-btn.is-fruit { border-color: rgba(255,120,110,0.45); background: linear-gradient(180deg, rgba(84,34,30,0.96), rgba(50,20,18,0.96)); }
/* The key is the one button in this row that HELPS the occupant, so it is the one that is not red or amber —
   without a colour of its own it fell back to the base grey and read as disabled next to its two neighbours. */
.tw-stock-btn.is-key { border-color: rgba(140,200,255,0.42); background: linear-gradient(180deg, rgba(28,48,66,0.96), rgba(16,28,40,0.96)); }
.tw-stock-ico { font-size: 22px; line-height: 1; grid-row: span 2; }
.tw-stock-lbl { font-weight: 800; font-size: 0.98rem; letter-spacing: 0.1px; }
.tw-stock-meta { grid-column: 2; font-size: 0.76rem; color: #c3b2a6; margin-top: 1px; }
.tw-stock-left { grid-row: span 2; font-weight: 800; font-size: 0.8rem; color: #ffd75e; background: rgba(0,0,0,0.32); border-radius: 999px; padding: 4px 9px; }
.tw-stock-stage { display: grid; justify-items: center; gap: 4px; padding: 12px 0 6px; border-top: 1px solid rgba(255,255,255,0.09); }
.tw-stock-figure { position: relative; display: grid; place-items: center; width: 100%; padding: 4px 0 2px; }
.tw-stock-figure img { width: 172px; height: 172px; object-fit: contain; filter: drop-shadow(0 6px 12px rgba(0,0,0,0.55)); }
/* Recoil. The fruit hit is a sharp jolt; the shame is a slower, more embarrassed wobble. */
.tw-stock-figure.is-fruit img { animation: stockJolt .38s cubic-bezier(.36,.07,.19,.97) both; }
.tw-stock-figure.is-shame img { animation: stockWobble .62s ease-in-out both; }
@keyframes stockJolt {
    0% { transform: translate(0,0) rotate(0); }
    18% { transform: translate(-7px,3px) rotate(-4deg); }
    38% { transform: translate(5px,1px) rotate(3deg); }
    62% { transform: translate(-3px,2px) rotate(-2deg); }
    100% { transform: translate(0,0) rotate(0); }
}
@keyframes stockWobble {
    0%,100% { transform: rotate(0); }
    25% { transform: rotate(-3.5deg); }
    60% { transform: rotate(3deg); }
    85% { transform: rotate(-1.5deg); }
}
/* The lob: rises, arcs over, drops onto him, spinning the whole way. Two animations on one element — the
   wrapper's translate carries it across and the emoji's own transform does the arc — so the path curves
   instead of travelling in a straight line. */
.tw-fruit-fly { position: absolute; left: 50%; bottom: 2%; margin-left: -15px; font-size: 30px; pointer-events: none; z-index: 4;
    animation: fruitFly .58s cubic-bezier(.3,.05,.6,1) forwards; will-change: transform, opacity; }
@keyframes fruitFly {
    0%   { transform: translate(var(--from), 34px) scale(.65) rotate(0deg); opacity: 0; }
    12%  { opacity: 1; }
    50%  { transform: translate(calc((var(--from) + var(--to)) / 2), -96px) scale(1.15) rotate(calc(var(--spin) / 2)); opacity: 1; }
    100% { transform: translate(var(--to), -10px) scale(.9) rotate(var(--spin)); opacity: 1; }
}
/* What it leaves behind: squashed, stuck to him, then fading. */
.tw-splat { position: absolute; font-size: 26px; pointer-events: none; z-index: 3; transform: translate(-50%,-50%) scaleY(.52) scaleX(1.28) rotate(8deg);
    filter: saturate(1.25) brightness(.82) drop-shadow(0 1px 1px rgba(0,0,0,.5)); animation: splatIn 2.6s ease-out forwards; }
@keyframes splatIn {
    0%   { opacity: 0; transform: translate(-50%,-50%) scaleY(.9) scaleX(.9) rotate(8deg); }
    10%  { opacity: 1; transform: translate(-50%,-50%) scaleY(.44) scaleX(1.42) rotate(8deg); }
    72%  { opacity: 1; }
    100% { opacity: 0; transform: translate(-50%,-40%) scaleY(.5) scaleX(1.3) rotate(8deg); }
}
/* The charge sheet, nailed up beside him on its own little post. */
.tw-stock-sign { position: absolute; right: 2%; bottom: 4%; width: 118px; padding: 9px 8px 10px; text-align: center;
    background: linear-gradient(176deg, #b9834a, #8d5f31 62%, #7a5029);
    border: 2px solid #4a2f18; border-radius: 4px; transform: rotate(-4deg);
    box-shadow: 0 4px 10px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,224,180,.35); z-index: 5; }
.tw-stock-sign::after { content: ""; position: absolute; left: 50%; top: 100%; width: 9px; height: 26px; margin-left: -4px;
    background: linear-gradient(90deg, #6f4826, #8d5f31 40%, #5c3a1d); border: 2px solid #4a2f18; border-top: none; border-radius: 0 0 2px 2px; }
.tw-stock-sign-title { font-weight: 900; font-size: 0.72rem; line-height: 1.08; letter-spacing: .4px; color: #3a1f0e; text-shadow: 0 1px 0 rgba(255,220,170,.35); }
.tw-stock-sign-body { margin-top: 5px; font-size: 0.6rem; line-height: 1.2; font-style: italic; color: #4a2c15; }
.tw-stock-name { font-weight: 800; font-size: 1.06rem; }
.tw-stock-tally { font-size: 0.78rem; color: #9aa0a6; }
.tw-stockade img:first-of-type { height: 92px; }
.tw-stockade .tw-npc-bubble { background: rgba(120,32,32,0.92); border-color: rgba(255,140,140,0.5); }
.tw-npc-btn img { height: 86px; width: auto; filter: drop-shadow(0 6px 8px rgba(0,0,0,0.55)); }
.tw-npc-emoji { font-size: 50px; line-height: 1; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5)); }
.tw-npc-btn:hover img, .tw-npc-btn:hover .tw-npc-emoji { filter: drop-shadow(0 0 8px rgba(255,215,110,0.8)); }
.tw-npc-bubble { max-width: 155px; font-size: 10px; font-weight: 800; line-height: 1.2; text-align: center; color: #241206; background: linear-gradient(180deg,#fff,#ffe9b0); border-radius: 9px; padding: 4px 9px; margin-bottom: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.45); }
.tw-merchant-flash { text-align: center; font-weight: 800; color: #ffe0b0; background: rgba(255,215,110,0.12); border: 1px solid rgba(255,215,110,0.35); border-radius: 10px; padding: 8px 12px; margin-bottom: 10px; }
.tw-wares { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
.tw-ware { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 12px 6px; border-radius: 14px; border: 1px solid rgba(255,215,110,0.3); background: rgba(255,255,255,0.05); color: #f2ead9; cursor: pointer; }
.tw-ware:hover:not(:disabled) { border-color: rgba(255,215,110,0.6); }
.tw-ware:disabled { opacity: .45; cursor: default; }
.tw-ware-emoji { font-size: 30px; line-height: 1; }
.tw-ware-label { font-size: 0.74rem; font-weight: 800; text-align: center; }
.tw-ware-price { font-size: 0.72rem; color: #ffd75e; font-weight: 800; }
.tw-ware-img { width: 46px; height: 46px; object-fit: contain; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5)); }
.tw-gamble { display: flex; align-items: center; gap: 11px; width: 100%; margin-top: 10px; padding: 12px 14px; border-radius: 14px; border: 1px solid rgba(190,120,255,0.5); background: linear-gradient(180deg, rgba(120,70,190,0.22), rgba(70,40,120,0.22)); color: #f2ead9; cursor: pointer; text-align: left; }
.tw-gamble:disabled { opacity: .5; cursor: default; }
.tw-gamble-ico { font-size: 26px; flex: 0 0 auto; }
.tw-gamble-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.tw-gamble-title { font-weight: 900; font-size: 0.92rem; color: #e9d5ff; }
.tw-gamble-sub { font-size: 0.72rem; color: #c3aee0; }
.tw-gamble-price { flex: 0 0 auto; font-size: 0.82rem; color: #ffd75e; font-weight: 900; white-space: nowrap; }
.tw-live-toggle { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; width: 100%; text-align: left; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: #f2ead9; font-weight: 800; font-size: 0.85rem; cursor: pointer; }
.tw-live-toggle.is-on { border-color: rgba(143,227,154,0.5); background: rgba(143,227,154,0.1); }
.tw-live-toggle .muted { font-size: 0.72rem; font-weight: 600; }
.tw-depth-preview { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; margin-bottom: 8px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); font-size: 0.8rem; font-weight: 700; color: #f2ead9; }
.tw-depth-preview b { color: #ffd75e; }
.tw-depth-steps { display: flex; gap: 6px; flex: 0 0 auto; }
.tw-depth-steps button { min-width: 32px; padding: 5px 8px; border-radius: 9px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.06); color: #f2ead9; font-weight: 800; cursor: pointer; }
.tw-unlockables { margin-top: 10px; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,0.12); }
.tw-unlockables-title { font-size: 0.74rem; font-weight: 800; letter-spacing: 0.03em; color: #cbb9e0; margin-bottom: 8px; }
.tw-unlockable { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); margin-bottom: 6px; }
.tw-unlockable-art { width: 42px; height: 42px; object-fit: contain; flex: 0 0 auto; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5)); }
.tw-unlockable-emoji { font-size: 30px; flex: 0 0 auto; width: 42px; text-align: center; }
.tw-unlockable-body { flex: 1 1 auto; min-width: 0; }
.tw-unlockable-name { font-weight: 800; font-size: 0.86rem; color: #f2ead9; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tw-unlockable-tag { font-size: 0.6rem; font-weight: 900; letter-spacing: 0.04em; padding: 1px 6px; border-radius: 999px; background: rgba(255,255,255,0.12); color: #cbb9e0; }
.tw-unlockable-tag.is-on { background: rgba(143,227,154,0.18); color: #8fe39a; }
.tw-unlockable-tag.is-warn { background: rgba(224,112,74,0.18); color: #ffb59a; }
.tw-unlockable-btn { flex: 0 0 auto; padding: 7px 12px; border-radius: 10px; border: 1px solid rgba(255,215,110,0.4); background: rgba(255,215,110,0.12); color: #ffe0b0; font-weight: 800; font-size: 0.76rem; cursor: pointer; }
.tw-unlockable-btn.is-on { color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); border-color: transparent; }
.tw-unlockable-live { flex: 0 0 auto; font-size: 0.7rem; font-weight: 800; color: #8fe39a; }
.tw-npc-alert { position: absolute; top: 0; right: 6px; z-index: 2; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: #e0433f; color: #fff; font-size: 11px; font-weight: 900; display: grid; place-items: center; box-shadow: 0 1px 4px rgba(0,0,0,0.5); }
/* Quest marker floating over the Quest-Giver's head — gold "!" = bounties available, green "?" = reward ready. */
.tw-quest-marker { position: absolute; top: -22px; left: 50%; z-index: 3; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-weight: 900; font-size: 16px; line-height: 1; color: #3a2a06; background: linear-gradient(180deg,#ffe27a,#f3b23a); border: 1.5px solid #fff3c4; box-shadow: 0 2px 6px rgba(0,0,0,0.5); pointer-events: none; animation: twQuestBob 1.5s ease-in-out infinite; }
.tw-quest-marker.is-ready { color: #06311f; background: linear-gradient(180deg,#8fe39a,#3ec06a); border-color: #d6ffe0; }
@keyframes twQuestBob { 0%,100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, -6px); } }
.tw-quests { display: flex; flex-direction: column; gap: 10px; }
.tw-quest { display: flex; gap: 10px; align-items: center; padding: 10px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
.tw-quest.is-claimed { opacity: 0.6; }
/* A drawn glyph, not an emoji — sized and coloured to the card instead of to whatever the OS ships. */
.tw-quest-emoji { display: grid; place-items: center; flex: 0 0 auto; width: 34px; height: 34px;
    font-size: 26px; color: #ffd28a; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); }
.tw-quest-coin { width: 15px; height: 15px; object-fit: contain; vertical-align: -2px; margin-right: 4px; }
.tw-quest-tag.is-done { display: grid; place-items: center; font-size: 22px; color: #8fe39a; }
.tw-quest-body { flex: 1 1 auto; min-width: 0; }
.tw-quest-top { display: flex; align-items: center; gap: 8px; }
.tw-quest-top strong { font-size: 0.9rem; color: #f2ead9; }
.tw-quest-reward { margin-left: auto; font-size: 0.78rem; font-weight: 800; color: #ffd75e; }
.tw-quest-bar { height: 7px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; margin: 5px 0 2px; }
.tw-quest-bar span { display: block; height: 100%; background: linear-gradient(90deg,#ffd75e,#f3b23a); border-radius: 999px; transition: width .3s ease; }
.tw-quest-prog { font-size: 0.72rem; }
.tw-quest-claim { flex: 0 0 auto; padding: 8px 14px; border-radius: 10px; border: none; cursor: pointer; font-weight: 800; font-size: 0.82rem; color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); }
.tw-quest-claim:disabled { opacity: .5; cursor: default; }
.tw-quest-tag.is-done { font-size: 20px; flex: 0 0 auto; }

/* Tap-a-player menu + Town Hall panel */
.tw-menu-panel { max-width: 360px; }
.tw-menu-actions { display: flex; flex-direction: column; gap: 8px; }
.tw-menu-btn { display: block; text-align: left; text-decoration: none; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #f2ead9; font-weight: 700; font-size: 0.9rem; cursor: pointer; }
.tw-menu-btn:hover { border-color: rgba(255,215,110,0.5); }
.tw-board-section { margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; }
.tw-board-section:first-of-type { border-top: none; padding-top: 0; }
.tw-board-title { font-size: 0.8rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #9fb0c0; margin-bottom: 8px; }
.tw-board-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.tw-board-tile { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 12px 4px; border-radius: 12px; text-decoration: none; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); color: #eef2f7; font-size: 0.75rem; font-weight: 700; }
.tw-board-tile span { font-size: 22px; }
.tw-board-tile:hover { border-color: rgba(255,215,110,0.5); }
.tw-fund-bar { height: 12px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
.tw-fund-bar span { display: block; height: 100%; background: linear-gradient(90deg,#ffd75e,#f3b23a); border-radius: 999px; transition: width .4s ease; }
.tw-fund-btns { display: flex; gap: 8px; margin: 8px 0; }
.tw-fund-btns button { flex: 1 1 auto; padding: 9px 4px; border-radius: 10px; border: none; background: linear-gradient(180deg,#ffd75e,#f3b23a); color: #1c130a; font-weight: 800; font-size: 0.85rem; cursor: pointer; }
.tw-fund-btns button:disabled { opacity: .5; cursor: default; }
.tw-fund-cta { margin-top: 2px; }
.tw-board-gold { float: right; color: #ffd75e; font-weight: 900; letter-spacing: 0; text-transform: none; }
.tw-town-perks { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 0.8rem; font-weight: 800; color: #ffe488; }
.tw-town-perks .muted { font-weight: 600; font-size: 0.72rem; }
.tw-proj-group { margin-bottom: 14px; }
.tw-proj-cat { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #8b7fb0; margin: 0 2px 6px; }
.tw-proj { padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); margin-bottom: 8px; }
.tw-proj.is-maxed { border-color: rgba(143,227,154,0.35); background: rgba(143,227,154,0.07); }
.tw-proj-head { display: flex; align-items: center; gap: 8px; }
.tw-proj-emoji { font-size: 20px; flex: 0 0 auto; }
.tw-proj-name { font-weight: 800; font-size: 0.9rem; color: #f2ead9; flex: 1 1 auto; min-width: 0; }
.tw-proj-lvl { flex: 0 0 auto; font-size: 0.72rem; font-weight: 900; color: #ffd75e; letter-spacing: 0.03em; }
.tw-proj.is-maxed .tw-proj-lvl { color: #8fe39a; }
.tw-proj-desc { font-size: 0.78rem; color: #c7bcd8; margin: 5px 2px 6px; line-height: 1.35; }
.tw-proj-perk { font-size: 0.74rem; font-weight: 700; color: #8fe39a; margin: 0 2px 6px; }
.tw-proj-cost { font-size: 0.72rem; color: #cbb9e0; margin: 6px 2px 0; }

/* Raid: tap each foe directly — it has its own HP bar, pops damage numbers, and dies when emptied */
.tw-enemy { position: absolute; transform: translate(-50%, -100%); background: none; border: none; padding: 0; cursor: pointer; animation: twEnemyRoam 3.4s ease-in-out infinite; }
.tw-enemy img { height: 76px; width: auto; filter: drop-shadow(0 5px 7px rgba(0,0,0,0.55)); transition: filter .08s; }
.tw-enemy-emoji { font-size: 48px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5)); }
.tw-enemy:active img, .tw-enemy:active .tw-enemy-emoji { filter: drop-shadow(0 0 10px rgba(255,120,80,0.95)) brightness(1.4); }
.tw-enemy.is-cd { cursor: default; }
.tw-enemy.is-cd img { filter: drop-shadow(0 5px 7px rgba(0,0,0,0.55)) grayscale(0.35) brightness(0.8); }
.tw-enemy.is-dying { animation: twEnemyDie .45s ease-out forwards; pointer-events: none; }
@keyframes twEnemyDie { 0% { transform: translate(-50%,-100%) scale(1) rotate(0); opacity: 1; } 100% { transform: translate(-50%,-70%) scale(.3) rotate(28deg); opacity: 0; } }
/* Roam: a flat side-to-side drift only — NO vertical bob, NO squish/scale. Each foe's own delay/duration/--sway
   (set inline per enemy) makes them wander independently rather than in lockstep. */
@keyframes twEnemyRoam { 0%,100% { transform: translate(calc(-50% - var(--sway, 10px)), -100%); } 50% { transform: translate(calc(-50% + var(--sway, 10px)), -100%); } }
.tw-enemy-hp { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); width: 52px; height: 6px; border-radius: 999px; background: rgba(0,0,0,0.55); border: 1px solid rgba(0,0,0,0.4); overflow: hidden; }
.tw-enemy-hp span { display: block; height: 100%; background: linear-gradient(90deg,#e0433f,#ff7a3c); transition: width .12s ease; }
.tw-dmg { position: absolute; top: -6px; left: 50%; font-weight: 900; font-size: 16px; color: #fff; text-shadow: 0 2px 3px rgba(0,0,0,0.8); pointer-events: none; animation: twDmg .75s ease-out forwards; white-space: nowrap; }
.tw-dmg.is-crit { font-size: 22px; color: #ffe27a; }
.tw-dmg.is-proc { color: #ff9a5a; }
@keyframes twDmg { 0% { transform: translate(-50%, 0) scale(.6); opacity: 0; } 20% { transform: translate(-50%, -10px) scale(1.15); opacity: 1; } 100% { transform: translate(-50%, -40px) scale(.9); opacity: 0; } }
/* Corner HUD */
.tw-raid-hud { position: absolute; top: 8px; left: 8px; z-index: 500; pointer-events: none; background: rgba(20,10,14,0.86); border: 1px solid rgba(224,67,63,0.55); border-radius: 12px; padding: 6px 11px; box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
.tw-raid-hud-title { font-size: 0.78rem; font-weight: 900; color: #ffd0c8; }
.tw-raid-hud-stats { display: flex; gap: 10px; margin-top: 3px; font-size: 0.74rem; font-weight: 800; color: #ffe0b0; }
.tw-raid-tip { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); z-index: 500; pointer-events: none; font-size: 0.72rem; font-weight: 700; color: #ffe0b0; background: rgba(20,14,30,0.78); padding: 4px 12px; border-radius: 999px; white-space: nowrap; }
/* Weapon-skill proc callout */
.tw-proc { position: absolute; top: 34%; left: 50%; transform: translateX(-50%); z-index: 510; pointer-events: none; font-weight: 900; font-size: 1.35rem; color: var(--pc,#ffb347); text-shadow: 0 2px 6px rgba(0,0,0,0.9), 0 0 18px var(--pc,#ffb347); animation: twProc 1.5s ease-out forwards; white-space: nowrap; }
.tw-proc-emoji { font-size: 1.5rem; }
@keyframes twProc { 0% { transform: translateX(-50%) scale(.5) rotate(-8deg); opacity: 0; } 18% { transform: translateX(-50%) scale(1.2) rotate(3deg); opacity: 1; } 70% { transform: translateX(-50%) scale(1) rotate(0); opacity: 1; } 100% { transform: translate(-50%, -30px) scale(1); opacity: 0; } }
.tw-owner-spawn { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 4px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.12); }
.tw-owner-spawn .muted { font-size: 0.72rem; }
.tw-owner-spawn button { flex: 0 0 auto; padding: 5px 10px; border-radius: 8px; border: 1px solid rgba(224,67,63,0.4); background: rgba(224,67,63,0.12); color: #ffcabf; font-size: 0.76rem; font-weight: 700; cursor: pointer; }

/* Merchant wares — discount badge, struck list price, per-day stock */
.tw-ware { position: relative; }
.tw-ware-deal { position: absolute; top: 6px; right: 6px; font-size: 0.58rem; font-weight: 900; color: #10240f; background: linear-gradient(180deg,#8fe39a,#4ec06a); border-radius: 6px; padding: 1px 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
.tw-ware-price { display: flex; flex-direction: column; align-items: center; line-height: 1.15; }
.tw-ware-orig { font-size: 0.62rem; color: #9a8fb0; text-decoration: line-through; font-weight: 700; }
.tw-ware-left { font-size: 0.62rem; color: #8fe39a; font-weight: 800; margin-top: 1px; }
.tw-ware-left.is-out { color: #e69a9a; }
.tw-ware.is-soldout { opacity: 0.5; }

/* Town Hall — online hero cards (real hero sprites) */
.tw-heroes { display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 10px; }
.tw-hero { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 4px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.04); cursor: pointer; font: inherit; }
.tw-hero:not(.is-you):hover { border-color: rgba(255,215,110,0.5); }
.tw-hero.is-friend { border-color: rgba(120,200,255,0.5); background: rgba(120,200,255,0.08); }
.tw-hero.is-you { border-color: rgba(255,215,110,0.5); background: rgba(255,215,110,0.08); cursor: default; }
.tw-hero-card { width: 66px; height: 66px; display: grid; place-items: center; border-radius: 12px; overflow: hidden; background: radial-gradient(120% 120% at 50% 18%, rgba(96,74,150,0.5), rgba(20,14,34,0.65)); }
.tw-hero-card img { width: 60px; height: 60px; object-fit: contain; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.55)); }
.tw-hero-fallback { font-size: 34px; }
.tw-hero-name { font-size: 0.72rem; font-weight: 800; color: #f2ead9; max-width: 86px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tw-hero.is-you .tw-hero-name { color: #ffe488; }
.tw-hero-status { font-size: 0.62rem; color: #c3aee0; line-height: 1.2; max-width: 86px; }
.tw-proj-sprite { width: 30px; height: 30px; object-fit: contain; flex: 0 0 auto; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5)); }

/* ── High-roller gear reveal (suspense → rarity burst) ── */
.tw-reveal { position: fixed; inset: 0; z-index: 600; display: grid; place-items: center; padding: 20px; cursor: pointer;
    background: radial-gradient(120% 120% at 50% 40%, rgba(24,12,44,0.72), rgba(4,2,10,0.93)); backdrop-filter: blur(4px); animation: twRevealIn .2s ease both; }
@keyframes twRevealIn { from { opacity: 0; } to { opacity: 1; } }
.tw-reveal-roll { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.tw-reveal-dice { width: 128px; height: 128px; object-fit: contain; filter: drop-shadow(0 10px 22px rgba(0,0,0,0.6)); animation: twDiceTumble .72s cubic-bezier(.5,.1,.5,.9) infinite; }
.tw-reveal-dice-emoji { font-size: 108px; line-height: 1; }
@keyframes twDiceTumble { 0% { transform: rotate(-18deg) translateY(0) scale(1); } 25% { transform: rotate(45deg) translateY(-24px) scale(1.07); } 50% { transform: rotate(180deg) translateY(0) scale(1); } 75% { transform: rotate(305deg) translateY(-15px) scale(1.04); } 100% { transform: rotate(342deg) translateY(0) scale(1); } }
.tw-reveal-rolltext { font-weight: 900; font-size: 1.06rem; color: #ffe0b0; letter-spacing: .02em; }
.tw-reveal-dots span { animation: twType 1.2s infinite; }
.tw-reveal-dots span:nth-child(2) { animation-delay: .2s; }
.tw-reveal-dots span:nth-child(3) { animation-delay: .4s; }
.tw-reveal-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; width: min(340px, 88vw); padding: 26px 22px 20px; border-radius: 22px; cursor: default; text-align: center;
    background: linear-gradient(180deg, rgba(30,22,50,0.97), rgba(16,11,28,0.98)); border: 1.5px solid var(--rar, #c2c9d4);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 20px 60px rgba(0,0,0,0.6), 0 0 60px -10px var(--rar-glow, transparent); animation: twCardPop .5s cubic-bezier(.2,1.3,.4,1) both; }
@keyframes twCardPop { 0% { transform: scale(.72); opacity: 0; } 60% { transform: scale(1.04); } 100% { transform: scale(1); opacity: 1; } }
.tw-reveal-card.is-legendary { animation: twCardPop .5s cubic-bezier(.2,1.3,.4,1) both, twLegendGlow 1.7s ease-in-out .5s infinite; }
@keyframes twLegendGlow { 0%,100% { box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 20px 60px rgba(0,0,0,0.6), 0 0 50px -12px var(--rar-glow); } 50% { box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 20px 60px rgba(0,0,0,0.6), 0 0 95px -4px var(--rar-glow); } }
.tw-reveal-burst { position: absolute; top: 44%; left: 50%; width: 260px; height: 260px; margin: -130px 0 0 -130px; border-radius: 50%; pointer-events: none; z-index: 0;
    background: radial-gradient(circle, var(--rar-glow) 0%, transparent 62%); opacity: 0; animation: twBurst .85s ease-out .05s both; }
.tw-reveal-burst.is-big { width: 340px; height: 340px; margin: -170px 0 0 -170px; }
@keyframes twBurst { 0% { transform: scale(.2); opacity: 0; } 30% { opacity: .95; } 100% { transform: scale(1.28); opacity: 0; } }
.tw-reveal-sparks { position: absolute; top: 42%; left: 50%; width: 0; height: 0; z-index: 1; pointer-events: none; }
.tw-reveal-sparks span { position: absolute; width: 7px; height: 7px; margin: -3.5px; border-radius: 50%; background: var(--rar, #fff); box-shadow: 0 0 8px var(--rar-glow); transform: rotate(var(--a)) translateY(0); animation: twSpark .85s ease-out var(--dly, 0s) both; }
@keyframes twSpark { 0% { transform: rotate(var(--a)) translateY(0) scale(1); opacity: 0; } 15% { opacity: 1; } 100% { transform: rotate(var(--a)) translateY(-125px) scale(.2); opacity: 0; } }
.tw-reveal-rarity { position: relative; z-index: 2; font-weight: 900; font-size: .82rem; letter-spacing: .1em; text-transform: uppercase; color: var(--rar, #c2c9d4); }
.tw-reveal-stars { letter-spacing: 1px; }
.tw-reveal-itemwrap { position: relative; z-index: 2; display: grid; place-items: center; width: 150px; height: 150px; margin: 4px 0; }
.tw-reveal-item { max-width: 150px; max-height: 150px; object-fit: contain; filter: drop-shadow(0 6px 14px rgba(0,0,0,0.6)) drop-shadow(0 0 16px var(--rar-glow)); animation: twItemPop .6s cubic-bezier(.2,1.4,.4,1) .12s both, twItemFloat 3s ease-in-out .82s infinite; }
.tw-reveal-item-emoji { font-size: 96px; line-height: 1; }
@keyframes twItemPop { 0% { transform: scale(0) rotate(-28deg); opacity: 0; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
@keyframes twItemFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
.tw-reveal-name { position: relative; z-index: 2; font-weight: 900; font-size: 1.12rem; color: #fff; text-wrap: balance; }
.tw-reveal-slot { position: relative; z-index: 2; font-size: .8rem; color: #c7bcd8; text-transform: capitalize; }
.tw-reveal-stats { position: relative; z-index: 2; display: flex; flex-direction: column; gap: 6px; align-items: center; margin-top: 10px; width: 100%; max-width: 320px; }
.tw-reveal-chips { display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; }
.tw-reveal-chip { font-size: .72rem; font-weight: 800; color: #f2ead9; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16); border-radius: 999px; padding: 3px 9px; }
.tw-reveal-els { display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; }
.tw-reveal-el { font-size: .68rem; font-weight: 900; border: 1px solid; border-radius: 999px; padding: 2px 8px; background: rgba(0,0,0,0.25); }
.tw-reveal-sig { font-size: .72rem; font-weight: 800; color: #e0c8ff; text-align: center; line-height: 1.3; text-wrap: balance; }
.tw-reveal-aff { font-size: .7rem; font-weight: 700; color: #bfe6c9; text-align: center; }
.tw-reveal-btn { position: relative; z-index: 2; margin-top: 12px; padding: 11px 26px; border-radius: 999px; border: none; cursor: pointer; font-weight: 900; font-size: .95rem; color: #1c130a; background: linear-gradient(180deg,#ffe488,#f3b23a); box-shadow: 0 5px 0 #b57f22; }
.tw-reveal-btn:active { transform: translateY(2px); box-shadow: 0 3px 0 #b57f22; }

/* ── Town Development level-up celebration ── */
.tw-levelup { position: fixed; inset: 0; z-index: 620; display: grid; place-items: center; padding: 20px; cursor: pointer; overflow: hidden; background: radial-gradient(120% 120% at 50% 40%, rgba(24,16,44,0.55), rgba(4,2,10,0.8)); animation: twRevealIn .2s ease both; }
.tw-levelup-confetti { position: absolute; inset: 0; pointer-events: none; }
.tw-levelup-confetti span { position: absolute; top: -14px; width: 9px; height: 14px; border-radius: 2px; background: hsl(var(--h,45), 90%, 58%); opacity: 0; animation: twConfetti linear infinite; }
@keyframes twConfetti { 0% { transform: translateY(-10px) rotate(0deg); opacity: 0; } 12% { opacity: 1; } 100% { transform: translateY(88vh) rotate(540deg); opacity: .9; } }
.tw-levelup-card { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 8px; width: min(340px, 88vw); padding: 24px 22px 20px; border-radius: 20px; cursor: default; text-align: center;
    background: linear-gradient(180deg, rgba(38,28,60,0.98), rgba(18,12,30,0.99)); border: 1.5px solid rgba(255,215,110,0.7); box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 20px 60px rgba(0,0,0,0.6), 0 0 60px -10px rgba(255,215,110,0.7);
    animation: twCardPop .5s cubic-bezier(.2,1.3,.4,1) both; }
.tw-levelup-badge { font-weight: 900; font-size: .82rem; letter-spacing: .1em; color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); border-radius: 999px; padding: 5px 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
.tw-levelup-name { font-weight: 900; font-size: 1.28rem; color: #fff; text-wrap: balance; }
.tw-levelup-name span { color: #ffd75e; }
.tw-levelup-perk { font-size: .9rem; font-weight: 800; color: #8fe39a; line-height: 1.35; }
.tw-levelup-perk .muted { display: block; font-weight: 600; font-size: .76rem; color: #b7ad9a; margin-top: 2px; }
.tw-levelup-btn { margin-top: 10px; padding: 11px 28px; border-radius: 999px; border: none; cursor: pointer; font-weight: 900; font-size: .95rem; color: #1c130a; background: linear-gradient(180deg,#ffe488,#f3b23a); box-shadow: 0 5px 0 #b57f22; }
.tw-levelup-btn:active { transform: translateY(2px); box-shadow: 0 3px 0 #b57f22; }
`;
