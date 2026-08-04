"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── THE ARENA ────────────────────────────────────────────────────────────────────────────────────────────────
// Two screens. The LADDER — who is next, who is above them, and what beating them is worth — and the BOUT,
// which is two fighters facing each other and three buttons.
//
// The bout is stance-versus-stance, so every round is a read rather than a tap. The opponent's tell is printed
// on their card and is derived from their real build, so it is information, not flavour.
//
// Raw <img> everywhere: styled-jsx will not scope a rule aimed at a custom component (see check:styled-jsx).

const money = (n) => Number(n || 0).toLocaleString();

const STANCE_ART = {
    strike: "/images/arena/stance-strike.webp",
    guard: "/images/arena/stance-guard.webp",
    feint: "/images/arena/stance-feint.webp",
};
const STANCES = [
    { key: "strike", label: "Strike", hint: "Beats a feint. Loses to a guard." },
    { key: "guard", label: "Guard", hint: "Beats a strike. Loses to a feint." },
    { key: "feint", label: "Feint", hint: "Beats a guard. Loses to a strike." },
];

// A short tone per outcome — built inline, no assets.
function blip(kind) {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const a = new AC();
        const notes = kind === "win" ? [523, 659, 880] : kind === "hit" ? [420, 300] : kind === "hurt" ? [180, 120] : [330, 300];
        notes.forEach((f, i) => {
            const t = a.currentTime + i * 0.06;
            const o = a.createOscillator(), g = a.createGain();
            o.type = kind === "hurt" ? "sawtooth" : "triangle";
            o.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.15, t + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
            o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.22);
        });
    } catch { /* audio is a bonus */ }
}

// A fighter STANDING IN THE RING: plate above, the hero itself on the sand, breathing.
function Fighter({ f, hp, maxHp, mirrored, hurt, lunge, down }) {
    const frac = maxHp ? Math.max(0, hp / maxHp) : 0;
    return (
        <div className={`ar-fighter${mirrored ? " is-foe" : ""}${hurt ? " is-hurt" : ""}${lunge ? " is-lunge" : ""}${down ? " is-down" : ""}`}>
            <div className="ar-plate">
                <b className="ar-fname">{f?.name}</b>
                <span className="ar-hp"><i style={{ width: `${frac * 100}%` }} /></span>
                <em className="ar-hpnum">{Math.max(0, hp)} / {maxHp}</em>
            </div>
            {f?.sprite ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ar-hero" src={f.sprite} alt="" draggable="false" style={mirrored ? { transform: "scaleX(-1)" } : undefined} />
            ) : <span className="ar-hero ar-noface" aria-hidden="true" />}
        </div>
    );
}

export default function ArenaClient({ initial }) {
    const [st, setSt] = useState(initial);
    const [rankUp, setRankUp] = useState(null);
    const [busy, setBusy] = useState(false);
    const [shake, setShake] = useState(0);
    const [clash, setClash] = useState(null);   // the two stances that just met
    const prev = useRef({ hp: null, foeHp: null, round: null });
    const logEnd = useRef(null);

    const act = useCallback(async (action, extra = {}) => {
        if (busy) return;
        setBusy(true);
        try {
            const r = await fetch("/api/marketplace/arena", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ action, ...extra }),
            }).then((x) => x.json()).catch(() => null);
            if (r?.unlocked) setSt(r);
            // Crossing a band is the biggest thing that happens in here, so it gets the whole screen — but
            // AFTER the blow that earned it. Firing it on the same frame as the reply threw the celebration
            // over the top of the swing that caused it.
            if (r?.finished?.rankUp) setTimeout(() => { setRankUp(r.finished.rankUp); blip("win"); }, 1700);
        } finally { setBusy(false); }
    }, [busy]);

    const bout = st?.bout || null;
    // Juice is derived by DIFFING the server's reply, never fired from the click — so a number can never float
    // for a hit the server did not deal.
    useEffect(() => {
        if (!bout) { prev.current = { hp: null, foeHp: null }; return; }
        const p = prev.current;
        if (p.hp != null && bout.hp < p.hp) { setShake(2); blip("hurt"); }
        else if (p.foeHp != null && bout.foeHp < p.foeHp) { setShake(1); blip("hit"); }
        // SHOW the exchange. Which two stances met is the only moment the read pays off, and it was buried in
        // a line of grey log text under the buttons.
        const last = bout.log?.length ? bout.log[bout.log.length - 1] : null;
        if (last && last.round !== p.round) setClash({ you: last.you, them: last.them });
        if (bout.over && bout.won) blip("win");
        prev.current = { hp: bout.hp, foeHp: bout.foeHp, round: last ? last.round : null };
        const t = setTimeout(() => setShake(0), 320);
        const t2 = setTimeout(() => setClash(null), 1150);
        return () => { clearTimeout(t); clearTimeout(t2); };
    }, [bout]);
    useEffect(() => { logEnd.current?.scrollIntoView?.({ block: "nearest" }); }, [bout?.log?.length]);

    if (!st?.unlocked) return null;

    // ── THE BOUT ──
    if (bout) {
        return (
            <section className="card ar">
                <div className={`ar-ring${shake ? ` is-shake-${shake}` : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="ar-ring-bg" src="/images/arena/arena-bg.webp" alt="" draggable="false" />
                    <span className="ar-ring-scrim" aria-hidden="true" />
                    <span className="ar-round">Round {bout.round}</span>
                    <div className="ar-floor">
                        <Fighter f={st.me} hp={bout.hp} maxHp={bout.maxHp} hurt={shake === 2} lunge={shake === 1}
                            down={bout.over && !bout.won} />
                        <Fighter f={bout.foe} hp={bout.foeHp} maxHp={bout.foeMaxHp} mirrored hurt={shake === 1} lunge={shake === 2}
                            down={bout.over && bout.won} />
                    </div>
                    {/* The moment it ends, called across the ring rather than dumped on a new screen. */}
                    {bout.over ? (
                        <div className={`ar-verdict ${bout.won ? "is-win" : "is-loss"}`}>
                            <b>{bout.won ? "Down" : "You fall"}</b>
                        </div>
                    ) : null}
                    {clash ? (
                        <div className="ar-clash" aria-hidden="true">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="ar-clash-icon is-you" src={STANCE_ART[clash.you]} alt="" />
                            <span className="ar-clash-spark" />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="ar-clash-icon is-them" src={STANCE_ART[clash.them]} alt="" />
                        </div>
                    ) : null}
                </div>
                {bout.log?.length ? <p className="ar-beat">{bout.log[bout.log.length - 1].text}</p> : null}
                <p className="ar-tell"><b>Their tell:</b> {bout.tell}</p>

                {bout.over ? (
                    <div className={`ar-result ${bout.won ? "is-win" : "is-loss"}`}>
                        {bout.won ? (
                            <div className="ar-rays" aria-hidden="true">
                                {Array.from({ length: 18 }).map((_, i) => <span key={i} style={{ "--a": `${i * 20}deg`, animationDelay: `${(i % 5) * 0.05}s` }} />)}
                            </div>
                        ) : null}
                        <b>{bout.won ? `You beat ${bout.foe.name}` : `${bout.foe.name} put you down`}</b>
                        {bout.won && bout.reward ? (
                            <p>+{money(bout.reward.gold)} gold · +{money(bout.reward.xp)} XP{bout.reward.chest ? ` · a ${bout.reward.chest} chest` : ""}</p>
                        ) : <p>The rung holds. Your attempts reset tomorrow.</p>}
                        <button type="button" className="ar-btn" disabled={busy} onClick={() => act("dismiss")}>Back to the ladder</button>
                    </div>
                ) : (
                    <div className="ar-stances">
                        {STANCES.map((s) => (
                            <button key={s.key} type="button" className={`ar-stance is-${s.key}`} disabled={busy}
                                onClick={() => act("stance", { stance: s.key })}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={STANCE_ART[s.key]} alt="" draggable="false" />
                                <b>{s.label}</b><em>{s.hint}</em>
                            </button>
                        ))}
                    </div>
                )}

                {bout.log?.length ? (
                    <div className="ar-log">
                        {bout.log.slice(-8).map((l, i) => (
                            <div key={i} className="ar-line"><b>R{l.round}</b> {l.text}</div>
                        ))}
                        <div ref={logEnd} />
                    </div>
                ) : null}
                <Styles />
            </section>
        );
    }

    // ── THE LADDER ──
    const next = st.next;
    return (
        <section className="card ar">
            {/* THE BADGE. "0 of 83" is a fact; a rank is something you tell people, and a band you can see
                yourself approaching is the reason to take the third fight of the day. */}
            <div className="ar-badge" style={{ "--rank": st.rank?.color || "#9aa0a6" }}>
                {st.rank?.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="ar-insignia" src={st.rank.icon} alt="" draggable="false" />
                ) : null}
                <div className="ar-badge-body">
                    <span className="ar-badge-kick">The Arena</span>
                    <b className="ar-rankname">{st.rank?.name}</b>
                    <span className="ar-standing">
                        {st.rung > 0
                            ? <>Above <b>{st.rung}</b> of the pack&rsquo;s {st.ladderSize}</>
                            : <>Unranked &mdash; {st.ladderSize} fighters above you</>}
                    </span>
                    {st.rank?.next ? (
                        <>
                            <span className="ar-tonext">
                                <i style={{ width: `${Math.min(100, (st.rank.into / st.rank.span) * 100)}%` }} />
                            </span>
                            <span className="ar-tonext-label">
                                {Math.max(0, st.rank.span - st.rank.into)} more to <b>{st.rank.next.name}</b>
                            </span>
                        </>
                    ) : <span className="ar-tonext-label">Top of the pack. There is no rank above this.</span>}
                </div>
            </div>

            <div className="ar-stats">
                <span><b>{st.stats.wins}</b> wins</span>
                <span><b>{st.stats.losses}</b> losses</span>
                <span><b>{st.stats.streak}</b> streak</span>
                <span><b>{st.fightsLeft}</b> fights left today</span>
            </div>

            {st.cleared ? (
                <div className="ar-cleared">
                    <b>You have beaten the whole pack.</b>
                    <p>There is nobody above you. Come back when somebody gears up.</p>
                </div>
            ) : next ? (
                <div className="ar-next">
                    <span className="ar-next-kicker">Rung {st.rung + 1} · next up</span>
                    <div className="ar-next-row">
                        <div className="ar-portrait is-big">
                            {next.sprite ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={next.sprite} alt="" draggable="false" style={{ transform: "scaleX(-1)" }} />
                            ) : <span className="ar-noface" aria-hidden="true" />}
                        </div>
                        <div className="ar-next-body">
                            <b>{next.name}</b>
                            <span className="ar-next-meta">Level {next.level} · {next.vigour} vigour · {next.might} per swing</span>
                            <span className="ar-next-tell">{next.tell}</span>
                        </div>
                    </div>
                    <div className="ar-next-foot">
                        <span className="ar-prize">+{money(next.reward.gold)} gold · +{money(next.reward.xp)} XP{next.reward.chest ? ` · ${next.reward.chest} chest` : ""}</span>
                        <button type="button" className="ar-btn" disabled={busy || st.fightsLeft <= 0} onClick={() => act("start")}>
                            {st.fightsLeft <= 0 ? "No fights left today" : "Step up"}
                        </button>
                    </div>
                </div>
            ) : null}

            {st.upcoming?.length > 1 ? (
                <div className="ar-up">
                    <span className="ar-up-head">Above them</span>
                    {st.upcoming.slice(1).map((o) => (
                        <div key={`${o.rung}-${o.name}`} className="ar-up-row">
                            <span className="ar-up-rung">{o.rung + 1}</span>
                            <div className="ar-portrait is-tiny">
                                {o.sprite ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={o.sprite} alt="" draggable="false" style={{ transform: "scaleX(-1)" }} />
                                ) : <span className="ar-noface" aria-hidden="true" />}
                            </div>
                            <span className="ar-up-name">{o.name}</span>
                            <span className="ar-up-lvl">Lv {o.level}</span>
                        </div>
                    ))}
                </div>
            ) : null}

            {rankUp ? (
                <div className="ar-rankup" role="dialog" aria-modal="true" onClick={() => setRankUp(null)} style={{ "--rank": rankUp.color }}>
                    <div className="ar-rankup-card" onClick={(e) => e.stopPropagation()}>
                        <div className="ar-rays" aria-hidden="true">
                            {Array.from({ length: 24 }).map((_, i) => <span key={i} style={{ "--a": `${i * 15}deg`, animationDelay: `${(i % 6) * 0.05}s` }} />)}
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="ar-rankup-art" src={rankUp.icon} alt="" draggable="false" />
                        <span className="ar-rankup-kick">Rank up</span>
                        <b className="ar-rankup-name">{rankUp.to}</b>
                        <p className="ar-rankup-from">You were {rankUp.from}. Not any more.</p>
                        <button type="button" className="ar-btn" onClick={() => setRankUp(null)}>Good</button>
                    </div>
                </div>
            ) : null}

            {st.board?.length ? (
                <div className="ar-board">
                    <span className="ar-up-head">Highest climbers</span>
                    {st.board.map((r) => (
                        <div key={r.place} className="ar-up-row">
                            <span className="ar-up-rung">{r.place}</span>
                            <span className="ar-up-name">{r.name}</span>
                            <span className="ar-up-lvl">rung {r.rung}</span>
                        </div>
                    ))}
                </div>
            ) : null}
            <Styles />
        </section>
    );
}

function Styles() {
    return (
        <style jsx global>{`
            /* ── the rank badge ── */
            .ar-badge { display: flex; align-items: center; gap: 15px; padding: 15px 16px; border-radius: 17px;
                background: linear-gradient(145deg, color-mix(in srgb, var(--rank) 24%, transparent), rgba(255,255,255,0.02) 66%), rgba(10,8,14,0.5);
                border: 1px solid color-mix(in srgb, var(--rank) 50%, transparent);
                box-shadow: 0 14px 34px -20px var(--rank); }
            .ar-insignia { flex: 0 0 auto; width: 78px; height: 78px; object-fit: contain;
                filter: drop-shadow(0 4px 14px color-mix(in srgb, var(--rank) 60%, transparent));
                animation: arBadgeIn .5s cubic-bezier(.2,1.4,.35,1) both; }
            @keyframes arBadgeIn { from { opacity: 0; transform: scale(.7) rotate(-8deg) } to { opacity: 1; transform: none } }
            .ar-badge-body { min-width: 0; flex: 1; }
            .ar-badge-kick { font-size: 9.5px; font-weight: 900; letter-spacing: .15em; text-transform: uppercase; color: #8a939d; }
            .ar-rankname { display: block; margin: 1px 0 3px; font-size: 1.5rem; font-weight: 900; line-height: 1.05;
                color: color-mix(in srgb, var(--rank) 72%, white); text-shadow: 0 0 26px color-mix(in srgb, var(--rank) 55%, transparent); }
            .ar-standing { display: block; font-size: 12px; color: #a4adb7; }
            .ar-standing b { color: #fff; font-variant-numeric: tabular-nums; }
            .ar-tonext { display: block; height: 6px; margin: 9px 0 5px; border-radius: 999px; overflow: hidden; background: rgba(0,0,0,0.45); }
            .ar-tonext > i { display: block; height: 100%; border-radius: 999px; background: var(--rank);
                box-shadow: 0 0 12px -2px var(--rank); transition: width .7s cubic-bezier(.2,.8,.3,1); }
            .ar-tonext-label { display: block; font-size: 11px; color: #8a939d; }
            .ar-tonext-label b { color: color-mix(in srgb, var(--rank) 70%, white); }

            /* ── the buttons ── */
            /* Their own, not .dlv-btn: that class lives inside DelveClient's scoped <style jsx>, so borrowing
               it here produced a bare browser-default button in the middle of the screen. */
            .ar-btn { padding: 12px 22px; border-radius: 12px; border: none; cursor: pointer;
                font-size: 0.95rem; font-weight: 900; color: #2a0d10;
                background: linear-gradient(180deg, #ffc4ca, #ff6f7d);
                box-shadow: 0 4px 0 #b3414f, 0 10px 26px -10px rgba(255,111,125,0.95);
                transition: transform .12s ease; }
            .ar-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 #b3414f; }
            .ar-btn:disabled { opacity: .5; box-shadow: none; }

            /* ── rank-up ── */
            .ar-rankup { position: fixed; inset: 0; z-index: 400; display: grid; place-items: center; padding: 20px;
                background: rgba(6,4,10,0.88); backdrop-filter: blur(4px); }
            .ar-rankup-card { position: relative; overflow: hidden; width: min(360px, 100%); padding: 26px 22px 20px;
                border-radius: 22px; text-align: center; background: linear-gradient(180deg, #221a26, #120e15);
                border: 2px solid var(--rank); box-shadow: 0 24px 70px rgba(0,0,0,0.8), 0 0 70px -10px var(--rank);
                animation: arPop .45s cubic-bezier(.2,1.5,.35,1) both; }
            @keyframes arPop { from { opacity: 0; transform: scale(.82) translateY(16px) } to { opacity: 1; transform: none } }
            .ar-rays { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
            .ar-rays span { position: absolute; width: 3px; height: 52px; border-radius: 2px; transform-origin: 50% 0;
                background: linear-gradient(var(--rank), transparent); animation: arRay 1.5s cubic-bezier(.15,.7,.3,1) both; }
            @keyframes arRay { from { opacity: 1; transform: rotate(var(--a)) translateY(0) scaleY(.4) }
                to { opacity: 0; transform: rotate(var(--a)) translateY(-190px) scaleY(1) } }
            .ar-rankup-art { position: relative; width: 116px; height: 116px; object-fit: contain;
                filter: drop-shadow(0 6px 20px color-mix(in srgb, var(--rank) 70%, transparent));
                animation: arRise .7s cubic-bezier(.2,1.35,.35,1) both; }
            @keyframes arRise { from { opacity: 0; transform: scale(.4) translateY(26px) rotate(-12deg) } to { opacity: 1; transform: none } }
            .ar-rankup-kick { display: block; margin-top: 8px; font-size: 10px; font-weight: 900; letter-spacing: .22em;
                text-transform: uppercase; color: #8a939d; }
            .ar-rankup-name { display: block; margin: 2px 0 6px; font-size: 2rem; font-weight: 900; line-height: 1.05;
                color: color-mix(in srgb, var(--rank) 74%, white); text-shadow: 0 0 34px color-mix(in srgb, var(--rank) 60%, transparent); }
            .ar-rankup-from { margin: 0 0 16px; font-size: 12.5px; color: #a99fc4; }
            .ar-stats { display: flex; flex-wrap: wrap; gap: 14px; margin: 12px 0 14px; font-size: 11.5px; color: #8a939d; }
            .ar-stats b { color: #ffd75e; font-variant-numeric: tabular-nums; }

            .ar-portrait { width: 74px; height: 74px; border-radius: 50%; display: grid; place-items: center; overflow: hidden;
                background: radial-gradient(circle at 38% 30%, rgba(255,255,255,0.12), rgba(8,6,12,0.92));
                border: 2px solid rgba(255,255,255,0.14); }
            .ar-portrait.is-big { width: 84px; height: 84px; flex: 0 0 auto; }
            .ar-portrait.is-tiny { width: 30px; height: 30px; border-width: 1px; flex: 0 0 auto; }
            .ar-portrait img { width: 100%; height: 100%; object-fit: contain; }
            .ar-noface { width: 60%; height: 60%; border-radius: 50%; background: rgba(255,255,255,0.1); }

            .ar-next { padding: 14px; border-radius: 15px; background: linear-gradient(150deg, rgba(255,111,125,0.16), rgba(255,255,255,0.02) 66%);
                border: 1px solid rgba(255,111,125,0.42); }
            .ar-next-kicker { font-size: 9.5px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase; color: #ffb0b8; }
            .ar-next-row { display: flex; align-items: center; gap: 13px; margin-top: 8px; }
            .ar-next-body b { display: block; font-size: 1.05rem; font-weight: 900; color: #fff; }
            .ar-next-meta { display: block; margin-top: 2px; font-size: 11.5px; color: #9aa2ab; }
            .ar-next-tell { display: block; margin-top: 5px; font-size: 12px; font-style: italic; color: #ffd0a0; }
            .ar-next-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 13px; }
            .ar-prize { font-size: 12px; font-weight: 900; color: #ffd75e; }
            .ar-cleared { padding: 16px; border-radius: 15px; text-align: center; background: rgba(255,215,94,0.09); border: 1px solid rgba(255,215,94,0.4); }
            .ar-cleared b { color: #ffe28a; }
            .ar-cleared p { margin: 6px 0 0; font-size: 12.5px; color: #c2cad3; }

            .ar-up, .ar-board { margin-top: 16px; display: grid; gap: 5px; }
            .ar-up-head { font-size: 10px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase; color: #7f8790; }
            .ar-up-row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 10px; background: rgba(255,255,255,0.035); }
            .ar-up-rung { min-width: 22px; font-size: 11px; font-weight: 900; color: #6f7883; font-variant-numeric: tabular-nums; }
            .ar-up-name { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 800; color: #d6dde4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ar-up-lvl { font-size: 11px; color: #8a939d; white-space: nowrap; }

            /* ── the ring ── */
            .ar-ring { position: relative; border-radius: 16px; overflow: hidden; aspect-ratio: 16 / 10;
                border: 1px solid rgba(255,190,110,0.3); }
            .ar-ring.is-shake-1 { animation: arShake .2s ease-out; }
            .ar-ring.is-shake-2 { animation: arShake .3s ease-out; }
            @keyframes arShake { 0%,100% { transform: translate(0,0) } 28% { transform: translate(-6px,3px) } 62% { transform: translate(6px,-3px) } }
            .ar-ring-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
            .ar-ring-scrim { position: absolute; inset: 0;
                background: radial-gradient(78% 62% at 50% 62%, transparent, rgba(10,6,4,0.72)); }
            .ar-round { position: absolute; top: 9px; left: 50%; transform: translateX(-50%); z-index: 3;
                font-size: 10px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; color: #ffe0b0;
                text-shadow: 0 2px 8px #000; }
            /* Both fighters stand on the same line of sand, facing each other. */
            .ar-floor { position: absolute; inset: 0; z-index: 2; display: grid; grid-template-columns: 1fr 1fr;
                align-items: end; padding: 0 4% 7%; }
            .ar-fighter { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; }
            .ar-hero { width: min(100%, 132px); max-height: 62%; object-fit: contain;
                filter: drop-shadow(0 8px 14px rgba(0,0,0,0.65));
                animation: arBreathe 2.8s ease-in-out infinite alternate; }
            @keyframes arBreathe { from { transform: translateY(0) } to { transform: translateY(-5px) } }
            .ar-fighter.is-foe .ar-hero { animation: arBreatheFoe 2.8s ease-in-out infinite alternate; }
            @keyframes arBreatheFoe { from { transform: scaleX(-1) translateY(0) } to { transform: scaleX(-1) translateY(-5px) } }
            /* Landing a blow leans you in; taking one rocks you back and flashes red. */
            .ar-fighter.is-lunge .ar-hero { animation: arLunge .3s ease-out; }
            @keyframes arLunge { 0%,100% { transform: translateX(0) } 50% { transform: translateX(14px) } }
            .ar-fighter.is-foe.is-lunge .ar-hero { animation: arLungeFoe .3s ease-out; }
            @keyframes arLungeFoe { 0%,100% { transform: scaleX(-1) translateX(0) } 50% { transform: scaleX(-1) translateX(14px) } }
            .ar-fighter.is-hurt .ar-hero { filter: drop-shadow(0 8px 14px rgba(0,0,0,0.65)) drop-shadow(0 0 16px #ff4d5e) brightness(1.5); }
            /* Shared with the ladder's 30px portraits, so it stays proportional; only the RING placeholder
               gets a fixed size. Sizing this in px broke the little rows above the fold. */
            .ar-noface { width: 60%; height: 60%; border-radius: 50%; background: rgba(255,255,255,0.12); }
            .ar-hero.ar-noface { width: 96px; height: 96px; }

            .ar-plate { width: min(100%, 150px); text-align: center; }
            .ar-fname { display: block; font-size: 12px; font-weight: 900; color: #fff; text-shadow: 0 2px 7px #000;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ar-hp { display: block; height: 8px; margin: 4px 0 2px; border-radius: 999px; overflow: hidden;
                background: rgba(0,0,0,0.62); border: 1px solid rgba(0,0,0,0.5); }
            .ar-hp > i { display: block; height: 100%; background: linear-gradient(90deg, #4ad07f, #7ce8a4); transition: width .35s ease; }
            .ar-fighter.is-foe .ar-hp > i { background: linear-gradient(90deg, #ff6f7d, #ffb0b8); }
            .ar-hpnum { font-size: 10px; font-style: normal; color: #e8dcc8; text-shadow: 0 1px 4px #000; font-variant-numeric: tabular-nums; }

            /* THE CLASH — the two stances that just met, thrown at each other with a spark between them. */
            .ar-clash { position: absolute; inset: 0; z-index: 4; display: grid; place-items: center; pointer-events: none; }
            .ar-clash-icon { position: absolute; width: 60px; height: 60px; object-fit: contain;
                filter: drop-shadow(0 3px 10px rgba(0,0,0,0.8)); }
            .ar-clash-icon.is-you { animation: arThrowL .95s cubic-bezier(.2,.9,.3,1) both; }
            .ar-clash-icon.is-them { animation: arThrowR .95s cubic-bezier(.2,.9,.3,1) both; transform: scaleX(-1); }
            @keyframes arThrowL { 0% { opacity: 0; transform: translateX(-90px) scale(.6) } 34% { opacity: 1; transform: translateX(-26px) scale(1.1) }
                72% { opacity: 1; transform: translateX(-26px) scale(1) } 100% { opacity: 0; transform: translateX(-26px) scale(.9) } }
            @keyframes arThrowR { 0% { opacity: 0; transform: scaleX(-1) translateX(-90px) scale(.6) } 34% { opacity: 1; transform: scaleX(-1) translateX(-26px) scale(1.1) }
                72% { opacity: 1; transform: scaleX(-1) translateX(-26px) scale(1) } 100% { opacity: 0; transform: scaleX(-1) translateX(-26px) scale(.9) } }
            .ar-clash-spark { position: absolute; width: 78px; height: 78px; border-radius: 50%;
                background: radial-gradient(circle, rgba(255,240,190,0.95), rgba(255,180,60,0.35) 45%, transparent 70%);
                animation: arSpark .5s ease-out .3s both; }
            @keyframes arSpark { 0% { opacity: 0; transform: scale(.3) } 40% { opacity: 1; transform: scale(1.15) } 100% { opacity: 0; transform: scale(1.5) } }

            /* A felled fighter drops to the sand and greys out — you SEE the blow land instead of being
               teleported to a summary. */
            .ar-fighter.is-down .ar-hero { animation: arDown .6s cubic-bezier(.4,0,.6,1) both; }
            @keyframes arDown { to { transform: translateY(16px) rotate(-16deg); opacity: .45; filter: grayscale(1) brightness(.6); } }
            .ar-fighter.is-foe.is-down .ar-hero { animation: arDownFoe .6s cubic-bezier(.4,0,.6,1) both; }
            @keyframes arDownFoe { to { transform: scaleX(-1) translateY(16px) rotate(16deg); opacity: .45; filter: grayscale(1) brightness(.6); } }
            .ar-verdict { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; pointer-events: none; }
            .ar-verdict b { font-size: 2.1rem; font-weight: 900; letter-spacing: .06em; text-transform: uppercase;
                animation: arVerdict .55s cubic-bezier(.2,1.5,.35,1) .25s both; }
            .ar-verdict.is-win b { color: #ffe28a; text-shadow: 0 3px 18px #000, 0 0 40px rgba(255,190,60,.9); }
            .ar-verdict.is-loss b { color: #ffb0b8; text-shadow: 0 3px 18px #000, 0 0 40px rgba(255,80,100,.8); }
            @keyframes arVerdict { from { opacity: 0; transform: scale(1.7) } to { opacity: 1; transform: scale(1) } }

            .ar-beat { margin: 10px 0 0; font-size: 12.5px; line-height: 1.5; color: #e4d9c6; text-align: center; }

            .ar-tell { margin: 10px 0 12px; font-size: 12px; color: #cbb; text-align: center; }
            .ar-tell b { color: #ffd0a0; }

            .ar-stances { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
            .ar-stance img { width: 34px; height: 34px; object-fit: contain; margin: 0 auto 4px; display: block; }
            .ar-stance { padding: 11px 8px 12px; border-radius: 13px; cursor: pointer; text-align: center;
                background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.13); }
            .ar-stance:disabled { opacity: .55; }
            .ar-stance b { display: block; font-size: 0.9rem; font-weight: 900; color: #fff; }
            .ar-stance em { display: block; margin-top: 3px; font-style: normal; font-size: 10px; line-height: 1.35; color: #8f98a3; }
            .ar-stance.is-strike { border-color: rgba(255,111,125,0.5); }
            .ar-stance.is-guard { border-color: rgba(111,208,255,0.5); }
            .ar-stance.is-feint { border-color: rgba(185,140,255,0.5); }

            .ar-result { position: relative; overflow: hidden; margin-top: 10px; padding: 15px; border-radius: 14px; text-align: center; }
            /* --rank is what .ar-rays colours itself from; the rays are shared with the rank-up card, which
               sets it per band. On a plain win there is no band, so it needs a default or the rays render
               transparent. */
            .ar-result.is-win { --rank: #ffd75e; background: rgba(255,215,94,0.1); border: 1px solid rgba(255,215,94,0.45); }
            .ar-result.is-loss { background: rgba(255,111,125,0.09); border: 1px solid rgba(255,111,125,0.4); }
            .ar-result b { font-size: 1.05rem; color: #fff; }
            .ar-result p { margin: 6px 0 12px; font-size: 12.5px; color: #cbd3dc; }

            .ar-log { margin-top: 13px; max-height: 150px; overflow-y: auto; display: grid; gap: 4px;
                padding: 9px 11px; border-radius: 11px; background: rgba(0,0,0,0.28); }
            .ar-line { font-size: 11.5px; line-height: 1.45; color: #9aa2ab; }
            .ar-line b { color: #6f6486; margin-right: 5px; }
        `}</style>
    );
}
