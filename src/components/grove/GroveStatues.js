"use client";

import { useState } from "react";

import {
    STATUE_RARITIES, rarityMeta, statueMeta, VENDOR_TIER_MAP,
} from "@/lib/marketplace/grove-statues.js";

/**
 * ── THE STATUE VENDOR ────────────────────────────────────────────────────────────────────────────────────────
 *
 * Luke: "they can turn them in to a statue vendor… you can turn them in by clicking the associated statue. It
 * fills a bar. Every time you achieve a new level it takes more statues. Rarer statues count for more. And
 * upon first turning one in, it permanently doubles the bonus and it changes color."
 *
 * One row per stat. The row IS the bar. The statues you are holding sit on the right of their own row, and
 * tapping one pours it in — which is the whole interaction, and the reason there is no confirm step: a statue
 * has exactly one use and nothing is lost by spending it on the line it belongs to.
 *
 * ⚠️ NO "TURN IN ALL". It would be the obvious convenience and it would spend the best moment in the system
 * inside a loop: the first crystal and the first prismatic each permanently double a line and recolour it, and
 * those have to be something you watched happen. See turnInStatue, which is one-at-a-time for the same reason.
 */
export default function GroveStatues({ statues, onTurnIn }) {
    const [busy, setBusy] = useState("");
    const [flash, setFlash] = useState(null);

    if (!statues) return null;
    const { tier, lines } = statues;

    // ⚠️ TIER 0 IS A REAL STATE, NOT AN EMPTY LIST. Statues do not drop until world 2, so a map-one player
    // opening this sees why it is empty rather than a shelf that looks broken.
    if (!tier) {
        return (
            <p className="gv-stat-locked">
                Statues start turning up in {" "}
                <b>The Undercave</b> — the vendor sets up once you have been there.
            </p>
        );
    }

    async function pour(stat, rarity) {
        const key = `${stat}:${rarity}`;
        if (busy) return;
        setBusy(key);
        try {
            const res = await onTurnIn?.(stat, rarity);
            // The two moments the whole system is built around. Everything else resolves silently into the bar.
            if (res?.firstPrismatic) setFlash({ stat, kind: "prismatic" });
            else if (res?.firstCrystal) setFlash({ stat, kind: "crystal" });
            else if (res?.levelledUp) setFlash({ stat, kind: "level", level: res.level });
        } finally {
            setBusy("");
        }
    }

    return (
        <div className="gv-stat">
            <p className="gv-stat-lede">
                Every statue you pour in raises its stat for good. A <b>crystal</b> is worth four, a{" "}
                <b>prismatic</b> sixteen — and the first of each you ever turn in <b>doubles that line
                permanently</b>.
            </p>

            {lines.map((l) => {
                const meta = statueMeta(l.stat);
                const held = STATUE_RARITIES.filter((r) => (l.held?.[r.id] || 0) > 0);
                const hit = flash?.stat === l.stat ? flash : null;
                return (
                    <section key={l.stat} className="gv-statline" style={{ "--line": l.colour }}>
                        <header>
                            <b>{meta?.name || l.stat}</b>
                            {/* The bonus, not the level — "+6 might" is the thing a player came here for.
                                The level is how it was earned and rides underneath. */}
                            <em>{l.bonus ? `+${l.bonus} ${l.stat.replace(/_/g, " ")}` : "nothing yet"}</em>
                        </header>

                        <div className="gv-statbar" title={`${l.into} / ${l.next} to level ${l.level + 1}`}>
                            <i style={{ width: `${l.pct}%` }} />
                        </div>
                        <small>
                            Level {l.level} · {l.into}/{l.next} to the next
                            {l.prismaticSeen ? " · ×4 forever" : l.crystalSeen ? " · ×2 forever" : ""}
                        </small>

                        {/* ⚠️ A STATUE YOU HOLD IS ALWAYS SPENDABLE, whatever tier the vendor is. A crystal
                            found before tier 2 cannot happen, but one already in hand must never be refused —
                            a bar that will not take a statue you are holding reads as broken. */}
                        <div className="gv-statheld">
                            {held.length ? held.map((r) => (
                                <button key={r.id} type="button"
                                    className={`gv-statue is-${r.id}`}
                                    style={{ "--r": r.colour }}
                                    disabled={Boolean(busy)}
                                    title={`${r.name} — worth ${r.worth}`}
                                    onClick={() => pour(l.stat, r.id)}>
                                    <span className="gv-statue-glyph" aria-hidden="true" />
                                    <span className="gv-statue-n">{l.held[r.id]}</span>
                                    <span className="gv-statue-w">+{r.worth}</span>
                                </button>
                            )) : <span className="gv-statnone">none held</span>}
                        </div>

                        {hit ? (
                            <p className={`gv-statflash is-${hit.kind}`}>
                                {hit.kind === "prismatic" ? "Prismatic. This line is doubled again — ×4, for good."
                                    : hit.kind === "crystal" ? "Crystal. This line is doubled, permanently."
                                        : `Level ${hit.level}.`}
                            </p>
                        ) : null}
                    </section>
                );
            })}

            {/* What the next vendor tier is actually for, said plainly, because "a better vendor" means
                nothing until you know it changes what can DROP. */}
            {tier < 3 ? (
                <p className="gv-stat-next">
                    {tier === 1
                        ? `Crystal statues start appearing once you reach world ${VENDOR_TIER_MAP[2]}.`
                        : `Prismatic statues start appearing once you reach world ${VENDOR_TIER_MAP[3]}.`}
                </p>
            ) : null}
        </div>
    );
}

export { rarityMeta };
