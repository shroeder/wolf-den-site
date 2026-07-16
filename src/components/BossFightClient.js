"use client";

import { useEffect, useRef, useState } from "react";
import { GiDragonHead } from "react-icons/gi";

import AvatarStack from "@/components/AvatarStack";
import { AVATAR_FIELDS, avatarUrlFor } from "@/lib/marketplace/avatar-options.js";

// Token-style boss-fight PROTOTYPE (visual only, no backend). A crowd of member avatars auto-attacks a
// boss; the whole token lunges + a slash/damage number pops; the boss HP bar drains; on defeat we rank
// contributors and hand out raffle tickets. This is the "everyone's avatars gang up on the boss" idea.

const FILLER_NAMES = ["Fang", "Luna", "Rook", "Shadow", "Ember", "Kaia", "Bjorn", "Nyx", "Cass", "Draven", "Wren", "Juno", "Ash", "Vex"];

function randomConfig() {
    const c = {};
    for (const [field, vals] of Object.entries(AVATAR_FIELDS)) c[field] = vals[Math.floor(Math.random() * vals.length)];
    return c;
}

function buildRoster(members) {
    const roster = [];
    (members || []).slice(0, 10).forEach((m, i) => {
        roster.push({ id: `m${i}`, name: m.name || "Member", avatarUrl: m.avatarUrl || null });
    });
    let n = 0;
    while (roster.length < 12) {
        roster.push({ id: `f${n}`, name: FILLER_NAMES[n % FILLER_NAMES.length], avatarUrl: avatarUrlFor(randomConfig()) });
        n += 1;
    }
    return roster;
}

export default function BossFightClient({ members = [] }) {
    const [roster, setRoster] = useState(() => buildRoster(members));
    const maxHp = roster.length * 130;
    const [hp, setHp] = useState(maxHp);
    const [attacking, setAttacking] = useState(() => new Set());
    const [floaters, setFloaters] = useState([]);
    const [hit, setHit] = useState(false);
    const [defeated, setDefeated] = useState(false);
    const [ranking, setRanking] = useState([]);

    const contrib = useRef({}); // id -> total damage
    const hpRef = useRef(maxHp);
    const floatId = useRef(0);

    // Pull in the signed-in member as "You" (front of the pack) once.
    useEffect(() => {
        let alive = true;
        (async () => {
            const r = await fetch("/api/marketplace/auth/me", { cache: "no-store" }).catch(() => null);
            const d = r && r.ok ? await r.json().catch(() => null) : null;
            const b = d?.buyer;
            if (alive && b) {
                setRoster((cur) => {
                    if (cur.some((f) => f.id === "you")) return cur;
                    return [{ id: "you", name: "You", avatarUrl: b.avatarUrl || null, you: true }, ...cur];
                });
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    function hitBoss(fighter, amount, crit) {
        contrib.current[fighter.id] = (contrib.current[fighter.id] || 0) + amount;
        setAttacking((s) => new Set(s).add(fighter.id));
        setTimeout(() => setAttacking((s) => { const n = new Set(s); n.delete(fighter.id); return n; }), 360);

        const fid = floatId.current++;
        setFloaters((f) => [...f, { fid, amount, crit, top: 20 + Math.random() * 50, left: 20 + Math.random() * 50 }]);
        setTimeout(() => setFloaters((f) => f.filter((x) => x.fid !== fid)), 850);

        setHit(true);
        setTimeout(() => setHit(false), 160);

        hpRef.current = Math.max(0, hpRef.current - amount);
        setHp(hpRef.current);
        if (hpRef.current <= 0) endFight();
    }

    const intervalRef = useRef(null);
    function endFight() {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        const rows = roster
            .map((f) => ({ ...f, dmg: Math.round(contrib.current[f.id] || 0) }))
            .filter((f) => f.dmg > 0)
            .sort((a, b) => b.dmg - a.dmg)
            .map((f) => ({ ...f, tickets: Math.max(1, Math.round(f.dmg / 40)) }));
        setRanking(rows);
        setDefeated(true);
    }

    // Auto-battle: a random fighter swings on each tick.
    useEffect(() => {
        if (defeated) return undefined;
        intervalRef.current = setInterval(() => {
            const f = roster[Math.floor(Math.random() * roster.length)];
            if (!f) return;
            const crit = Math.random() < 0.15;
            const base = 18 + Math.floor(Math.random() * 34);
            hitBoss(f, crit ? base * 2 : base, crit);
        }, 430);
        return () => intervalRef.current && clearInterval(intervalRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roster, defeated]);

    function playerAttack() {
        if (defeated) return;
        const you = roster.find((f) => f.you) || roster[0];
        const crit = Math.random() < 0.35;
        const base = 55 + Math.floor(Math.random() * 45);
        hitBoss(you, crit ? Math.round(base * 1.8) : base, crit);
    }

    function reset() {
        const fresh = buildRoster(members);
        const you = roster.find((f) => f.you);
        const next = you ? [you, ...fresh] : fresh;
        contrib.current = {};
        hpRef.current = next.length * 130;
        setRoster(next);
        setHp(next.length * 130);
        setFloaters([]);
        setRanking([]);
        setDefeated(false);
    }

    const pct = Math.max(0, Math.round((hp / maxHp) * 100));

    return (
        <div className="boss-wrap">
            <div className="boss-arena">
                <div className="boss-fighters">
                    {roster.map((f) => (
                        <div key={f.id} className={`boss-fighter${attacking.has(f.id) ? " is-attacking" : ""}${f.you ? " is-you" : ""}`}>
                            <AvatarStack avatarUrl={f.avatarUrl} initial={(f.name || "?").slice(0, 1).toUpperCase()} size={44} border={f.you ? "gold" : "none"} />
                            <span className="boss-fighter-name">{f.name}</span>
                        </div>
                    ))}
                </div>

                <div className="boss-enemy-side">
                    <div className="boss-hpbar"><span style={{ width: `${pct}%` }} /></div>
                    <div className="boss-hp-label">🐉 Ancient Wyrm — {hp.toLocaleString()} / {maxHp.toLocaleString()} HP</div>
                    <div className={`boss-enemy${hit ? " is-hit" : ""}${defeated ? " is-dead" : ""}`}>
                        <GiDragonHead aria-hidden="true" />
                    </div>
                    {floaters.map((fl) => (
                        <span key={fl.fid} className={`boss-floater${fl.crit ? " is-crit" : ""}`} style={{ top: `${fl.top}%`, left: `${fl.left}%` }}>
                            {fl.crit ? `${fl.amount}!` : fl.amount}
                        </span>
                    ))}
                </div>
            </div>

            <div className="boss-controls">
                {!defeated ? (
                    <button type="button" className="btn-gold boss-attack" onClick={playerAttack}>⚔️ Attack!</button>
                ) : (
                    <button type="button" className="btn-gold" onClick={reset}>↻ Fight again</button>
                )}
                <span className="muted">The pack auto-attacks — tap to pile on.</span>
            </div>

            {defeated ? (
                <div className="boss-victory">
                    <h3>🏆 Ancient Wyrm defeated!</h3>
                    <p className="muted">Everyone who landed a hit earns raffle tickets for this month&apos;s giveaway — more damage, more tickets.</p>
                    <ol className="boss-ranking">
                        {ranking.slice(0, 6).map((f, i) => (
                            <li key={f.id} className={f.you ? "is-you" : ""}>
                                <span className="boss-rank-n">{i + 1}</span>
                                <AvatarStack avatarUrl={f.avatarUrl} initial={(f.name || "?").slice(0, 1).toUpperCase()} size={34} />
                                <span className="boss-rank-name">{f.name}</span>
                                <span className="boss-rank-dmg">{f.dmg.toLocaleString()} dmg</span>
                                <span className="boss-rank-tix">🎟️ {f.tickets}</span>
                            </li>
                        ))}
                    </ol>
                </div>
            ) : null}
        </div>
    );
}
