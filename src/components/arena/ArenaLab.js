"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import ArenaClient from "@/components/ArenaClient";
import FxPreview from "@/components/arena/FxPreview";
import { BATTLE_ITEMS } from "@/lib/marketplace/arena-kit.js";
import { npcAbilities, npcFor } from "@/lib/marketplace/arena-npc.js";
import { boutLaurels, featsFor, vpFor } from "@/lib/marketplace/arena-rewards.js";
import { baseState, makeBout, SCENES, SCENE_KEYS } from "@/components/arena/arena-lab-fixtures.js";

// ── THE ARENA LAB ────────────────────────────────────────────────────────────────────────────────────────────
// DEV ONLY (the route 404s in production). Mounts the REAL ArenaClient — not a copy of it — against fixture
// state, with window.fetch stubbed so every action resolves locally.
//
// Why this exists: the arena is owner-gated, asynchronous, capped at ten challenges a day and backed by the
// live production database. Judging an animation by playing it therefore costs a real fight against a real
// member and mutates a real ladder, and the states worth judging hardest — a rank-up, a double-KO, a foe
// opening with a spell — are the ones you cannot summon on demand. Here every one of them is a URL.
//
// ?scene=<key> selects a scene. ?chrome=0 hides the lab's own furniture so a screenshot is only the feature.

import { pickIncoming } from "@/lib/marketplace/arena-ai.js";

const NEXT_ON_WIN = 0;   // the sim never advances the ladder; a win just ends the bout

// ── THE STUB SERVER ──────────────────────────────────────────────────────────────────────────────────────────
// A deliberately simple mirror of fightRound: enough to exercise every visual branch (cooldowns ticking, shield
// soaking, surge doubling, telegraph consumed, KO on either side), and honest about being an approximation —
// the damage curve here is NOT the tuned one, so this can never be used to judge balance. It is a display rig.
function makeServer(initial) {
    let st = JSON.parse(JSON.stringify(initial));
    const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

    // THE REAL POLICY, imported — not a copy. This was a copy, and it had already drifted: it was still the
    // old uniformly-random picker, so the lab would have shown last week's defender while claiming to show
    // this week's. A rig that lies about the thing it exists to display is worse than no rig.

    const cool = (b, n) => { for (const k of Object.keys(b.cd || {})) b.cd[k] = Math.max(0, (b.cd[k] || 0) - n); };

    function beat(opts) {
        const b = st.bout;
        if (!b || b.over) return { ok: false, error: "no_bout", ...st };
        const mine = b.turn === "you";
        const cmd = String(opts.command || (mine ? "attack" : "block"));

        if (!mine && cmd === "defend") {
            const w = (b.me.abilities || []).find((a) => a.id === opts.ability && a.defensive);
            if (!w || (b.cd[w.id] || 0) > 0) return { ok: false, error: "no_ability", ...st };
            b.cd[w.id] = w.cooldown || 0;
            const soak = Math.round(b.maxHp * 0.18);
            b.shield += soak;
            b.log.push({ beat: b.beat, who: "you", grade: "ward", damage: 0, soaked: soak, text: `${w.name} — braced for ${soak}.`, ability: w.name });
            return { ok: true, ...st };
        }

        if (mine && (cmd === "guard" || cmd === "item")) {
            if (cmd === "guard") {
                const soak = Math.round(b.maxHp * 0.30);
                b.shield += soak; cool(b, 1);
                b.log.push({ beat: b.beat, who: "you", grade: "guard", damage: 0, soaked: soak, text: `You set your guard — bracing ${soak}, and everything cools a turn faster.` });
            } else {
                const it = BATTLE_ITEMS.find((x) => x.id === opts.item);
                if (!it || (b.items[it.id] || 0) <= 0) return { ok: false, error: "no_item", ...st };
                b.items[it.id] -= 1;
                let text;
                let heal = 0;
                if (it.kind === "heal") {
                    const healed = Math.min(b.maxHp - b.hp, Math.round(b.maxHp * it.amount));
                    b.hp += healed;
                    text = healed > 0 ? `${it.name} — ${healed} health back.` : `${it.name} — already whole.`;
                    heal = healed;
                } else { b.cd = {}; text = `${it.name} — every skill is ready.`; }
                b.log.push({ beat: b.beat, who: "you", grade: "item", damage: 0, healed: heal, text, item: it.id });
            }
            b.turn = "them";
        } else if (mine) {
            const ab = cmd === "skill" && opts.ability ? (b.me.abilities || []).find((a) => a.id === opts.ability) : null;
            if (cmd === "skill" && (!ab || (b.cd[ab.id] || 0) > 0)) return { ok: false, error: "cooling", ...st };
            let power = 1, note = "";
            if (ab) {
                b.cd[ab.id] = ab.cooldown || 0;
                power = ab.power;
                if (ab.kind === "ward") { b.shield += Math.round(b.maxHp * 0.18); power = 0; note = " — braced"; }
                if (ab.kind === "surge") { b.surge = 2; power = 0; note = " — sharpened"; }
                if (ab.kind === "execute" && b.foeHp <= b.foeMaxHp * 0.35) { power *= 1.5; note = " — EXECUTE"; }
                if (ab.kind === "gamble") { power = Math.random() < 0.5 ? power * 2 : 0; note = power ? " — it pays" : " — nothing"; }
            }
            const surge = b.surge > 0 ? 1.35 : 1;
            if (b.surge > 0) b.surge -= 1;
            const crit = power > 0 && Math.random() < 0.3;
            const raw = power > 0 ? rnd(6, 9) * power * surge * (b.clash?.mult || 1) * (b.underdog || 1) * (crit ? 1.8 : 1) : 0;
            const dmg = raw > 0 ? Math.max(1, Math.round(raw * 0.7)) : 0;
            b.foeHp = Math.max(0, b.foeHp - dmg);
            b.log.push({
                beat: b.beat, who: "you", grade: ab ? "skill" : "hit", damage: dmg, crit,
                text: dmg > 0 ? `${ab ? ab.name : "You strike"}${note} — ${dmg}.` : `${ab ? ab.name : "You strike"}${note}.`,
                ability: ab?.name || null,
            });
            b.turn = "them";
        } else {
            const inc = b.incoming || pickIncoming(b);
            // A BRACE IS NOT A SWING. The rig has to honour it or the one behaviour worth watching — a
            // cornered defender covering up — would render here as an ordinary hit for zero.
            if (inc.brace) {
                b.foeShield = Math.round(b.foeMaxHp * 0.3);
                b.log.push({ beat: b.beat, who: "them", grade: "ward", damage: 0,
                    text: `${b.foe.name} braces — your next blow lands on a raised guard.`, ability: "Brace" });
                b.turn = "you"; b.incoming = null; b.beat += 1; cool(b, 1);
            } else {
            const raw = Math.max(1, Math.round(rnd(14, 22) * (inc.power || 1) / (b.clash?.mult || 1)));
            const blocked = Math.round(raw * 0.34);
            let through = Math.max(0, raw - blocked);
            let soaked = 0;
            if (b.shield > 0) { soaked = Math.min(b.shield, through); b.shield -= soaked; through -= soaked; }
            b.hp = Math.max(0, b.hp - through);
            b.log.push({
                beat: b.beat, who: "them", grade: "hit", damage: through, blocked, soaked,
                text: inc.isAbility
                    ? `${b.foe.name} casts ${inc.name} — you turn aside ${blocked}, ${through} lands.`
                    : `${b.foe.name} swings — you turn aside ${blocked}, ${through} lands.`,
                ability: inc.isAbility ? inc.name : null,
            });
            b.turn = "you"; b.incoming = null; b.beat += 1; cool(b, 1);
            }
        }

        if (b.turn === "them" && !b.incoming) b.incoming = pickIncoming(b);

        if (b.foeHp <= 0 || b.hp <= 0) {
            const won = b.foeHp <= 0 && b.hp > 0;
            b.over = true; b.won = won;
            const myPower = b.myPower || st.me.power;
            const theirPower = b.theirPower || 300;
            const { feats, laurels: fl, vp: fv } = featsFor(b);
            const vp = vpFor({ won, myPower, theirPower }) + (won ? fv : 0);
            const laurels = boutLaurels({ won, myPower, theirPower }) + fl;
            b.reward = { gold: won ? Math.round(40 + theirPower * 0.9) : 0, xp: won ? Math.round(18 + theirPower * 0.4) : 0, vp, laurels, feats };
            b.recap = {
                won, foe: b.foe, reward: b.reward, feats,
                vpGain: vp, vpFrom: st.vp, vpTo: st.vp + vp,
                rankTo: won ? 11 : 12, size: 84,
                npcTier: b.npcTier || null,
                npcUnlocked: Boolean(won && b.npcTier && b.npcTier > (st.stats?.npcBest || 0)),
                streak: won ? 4 : 0, bestStreak: 5, rounds: b.beat,
            };
            st.vp += vp;
            st.laurels += laurels;
            if (won && b.npcTier) st.stats = { ...st.stats, npcBest: Math.max(st.stats.npcBest || 0, b.npcTier) };
        }
        return { ok: true, ...st };
    }

    return async function handle(body) {
        const action = String(body?.action || "");
        if (action === "start") {
            // The same fork the real startBout takes: a member, or a tier out of the Gauntlet.
            const tier = typeof body.target === "string" && body.target.startsWith("npc:") ? Number(body.target.slice(4)) : 0;
            const base = SCENES.turn.state().bout.foe;
            let foe;
            let theirPower;
            if (tier > 0) {
                const n = npcFor(tier);
                foe = {
                    ...base, id: n.id, name: n.name, sprite: n.sprite, level: null, npc: true, tier,
                    element: n.element, abilities: npcAbilities(tier), might: n.might, gearPower: n.gearPower,
                    speed: n.speed, fortune: n.fortune, health: n.health,
                };
                theirPower = n.gearPower;
            } else {
                const t = st.targets.find((x) => x.id === body.target) || st.targets[0];
                foe = { ...base, id: t.id, name: t.name, sprite: t.sprite, level: t.level, health: t.health };
                theirPower = t.power;
            }
            st.bout = makeBout({
                beat: 1, turn: "you", hp: st.me.health, maxHp: st.me.health,
                foeHp: foe.health, foeMaxHp: foe.health,
                cd: {}, log: [], shield: 0, surge: 0, bleed: null, sunder: 0, riposte: 0,
                items: Object.fromEntries(BATTLE_ITEMS.map((i) => [i.id, i.count])),
                foe,
                // Computed, not hard-coded: the fixture used to announce "Their Water smothers your Fire"
                // over an Earth opponent, which makes the affinity system impossible to verify in here.
                myPower: st.me.power, theirPower, npcTier: tier,
            });
            st.bout.incoming = null;
            st.fightsLeft = Math.max(0, st.fightsLeft - 1);
            return { ok: true, ...st };
        }
        if (action === "beat") return beat(body);
        if (action === "dismiss") { st.bout = null; st.fightsLeft = Math.max(NEXT_ON_WIN, st.fightsLeft); return { ok: true, ...st }; }
        if (action === "seen") { st.away = null; return { ok: true, ...st }; }
        return { error: "bad_action" };
    };
}

export default function ArenaLab() {
    const [scene, setScene] = useState("ladder");
    const [chrome, setChrome] = useState(true);
    const [nonce, setNonce] = useState(0);
    const [fxBench, setFxBench] = useState(false);
    const handlerRef = useRef(null);

    // The scene chosen by the URL, so a screenshot run is just a list of addresses.
    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        const s = q.get("scene");
        if (s && SCENES[s]) setScene(s);
        if (q.get("chrome") === "0") setChrome(false);
        if (q.get("fx") === "1") setFxBench(true);
    }, []);

    const initial = useMemo(() => {
        const s = SCENES[scene] || SCENES.ladder;
        return s.state();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scene, nonce]);

    // ── THE STUB ── window.fetch is patched for exactly one path and passes everything else through, so the
    // avatar renders, fonts load and Next's own traffic is untouched.
    useEffect(() => {
        handlerRef.current = makeServer(initial);
        const real = window.fetch;
        window.fetch = async (url, opts) => {
            const href = typeof url === "string" ? url : url?.url || "";
            if (!href.includes("/api/marketplace/arena")) return real(url, opts);
            const body = opts?.body ? JSON.parse(opts.body) : {};
            const out = await handlerRef.current(body);
            // A touch of latency, so the busy states and disabled buttons are real rather than theoretical.
            await new Promise((r) => setTimeout(r, 90));
            return { ok: true, json: async () => out };
        };
        return () => { window.fetch = real; };
    }, [initial]);

    // ── THE CONTRACT CHECK ── these fixtures are mirrored by hand from arena.js. If a required key goes
    // missing the lab says so loudly rather than rendering a subtly wrong screen and being trusted.
    const missing = useMemo(() => {
        const need = ["unlocked", "me", "position", "size", "rank", "fightsLeft", "stats", "targets", "board"];
        const gaps = need.filter((k) => initial[k] === undefined);
        if (initial.bout) {
            const nb = ["foe", "beat", "turn", "hp", "maxHp", "foeHp", "foeMaxHp", "cd", "clash", "me", "items", "log"];
            gaps.push(...nb.filter((k) => initial.bout[k] === undefined).map((k) => `bout.${k}`));
        }
        return gaps;
    }, [initial]);

    // ?fx=1 — the VFX bench. Every effect at playback size over the real plate, side by side.
    if (fxBench) return <FxPreview />;

    return (
        <div className="lab">
            {chrome ? (
                <div className="lab-bar">
                    <b className="lab-title">Arena Lab</b>
                    <div className="lab-scenes">
                        {SCENE_KEYS.map((k) => (
                            <button key={k} type="button"
                                className={`lab-chip${k === scene ? " is-on" : ""}`}
                                onClick={() => { setScene(k); setNonce((n) => n + 1); }}>
                                {SCENES[k].label}
                            </button>
                        ))}
                    </div>
                    <div className="lab-meta">
                        <em>{SCENES[scene]?.note}</em>
                        <button type="button" className="lab-chip" onClick={() => setNonce((n) => n + 1)}>Replay scene</button>
                    </div>
                    {missing.length ? (
                        <p className="lab-warn">Fixture drift — missing {missing.join(", ")}. These fixtures mirror arena.js by hand; the server contract has moved.</p>
                    ) : null}
                </div>
            ) : null}

            <div className="stack reveal lab-stage">
                {/* key remounts ArenaClient so a scene switch starts clean rather than inheriting the last one's
                    animation state — the exact bug that makes a screenshot lie. */}
                <ArenaClient key={`${scene}-${nonce}`} initial={initial} />
            </div>

            <style jsx global>{`
                .lab { padding: 12px; }
                .lab-bar { position: sticky; top: 0; z-index: 90; margin-bottom: 14px; padding: 11px 13px;
                    border-radius: 14px; background: rgba(12,10,18,0.96); border: 1px solid rgba(255,255,255,0.14);
                    backdrop-filter: blur(6px); }
                .lab-title { display: block; font-size: 11px; font-weight: 900; letter-spacing: .2em;
                    text-transform: uppercase; color: #8a939d; margin-bottom: 8px; }
                .lab-scenes { display: flex; flex-wrap: wrap; gap: 5px; }
                .lab-chip { padding: 5px 11px; border-radius: 999px; cursor: pointer; font-size: 11px;
                    font-weight: 800; color: #cbd3dc; background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.16); }
                .lab-chip.is-on { color: #12101a; background: #ffd75e; border-color: #ffd75e; }
                .lab-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px;
                    margin-top: 8px; }
                .lab-meta em { font-style: normal; font-size: 11px; color: #7f8790; }
                .lab-warn { margin: 9px 0 0; padding: 8px 11px; border-radius: 9px; font-size: 11.5px;
                    font-weight: 800; color: #ffd0a0; background: rgba(255,160,80,0.14);
                    border: 1px solid rgba(255,160,80,0.45); }
                .lab-stage { max-width: 720px; margin: 0 auto; }
            `}</style>
        </div>
    );
}
