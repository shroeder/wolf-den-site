"use client";

import { useEffect } from "react";

import { toolArt, recipeArt } from "@/lib/marketplace/grove-catalog.js";
import { TOOL_SLOTS, toolBonusPct } from "@/lib/marketplace/grove-recipes.js";
import { QUALITY_BANDS, bandTint, charmValue, CHARM_STAT_LABEL } from "@/lib/marketplace/grove-forge.js";

// ── WHAT AM I ABOUT TO MAKE, AND HOW WELL COULD IT COME OUT ─────────────────────────────────────────────────
// Luke: "I need to be able to click things before I make them to inspect what they actually do in game and
// see the possible stat rolls."
//
// Two questions, and the bench row could answer neither properly. Its payoff line is one line because it is
// one of 117 rows — "Shovel tier 1 · dig depth 0% → 3%" tells you the number but not the SYSTEM it moves,
// and nothing anywhere said that the same craft can land anywhere between Rough and Masterwork, or what the
// spread is worth, or what your odds of each are.
//
// ⚠️ THE ODDS ARE THE SERVER'S OWN, NOT A TABLE WRITTEN HERE. st.craft.odds is computed from the same curve
// the roll runs against (see qualityOdds: "DERIVED FROM THE CURVE, NEVER TABULATED... a hand-written table
// beside a live formula is two numbers that disagree the moment either is tuned"). A screen that invents its
// own odds is the worst possible version of transparency.
//
// ⚠️ IT DOES NOT CRAFT. The row behind it has the Craft button, priced and gated by rules that already
// exist; a second one here would be a second answer to "can I make this". Same call as the tool sheet.

const PCT = (n) => `${Math.round(n * 100)}%`;

export default function GroveRecipeSheet({ recipe, st, odds = [], partName, PartIcon, onClose = () => {} }) {
    useEffect(() => {
        const k = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", k);
        return () => window.removeEventListener("keydown", k);
    }, [onClose]);

    if (!recipe) return null;
    const r = recipe;
    const slot = r.kind === "tool" ? TOOL_SLOTS.find((t) => t.slot === r.slot) : null;
    const art = r.kind === "tool" ? toolArt(r.slot, r.tier) : recipeArt(r);
    const share = Object.fromEntries((odds || []).map((o) => [o.id, o.share]));

    // ── WHAT EACH BAND WOULD ACTUALLY PAY ───────────────────────────────────────────────────────────
    // ⚠️ COMPUTED FROM THE BAND'S OWN MULTIPLIER, so it cannot drift from what the forge applies. A tool
    // pays its tier's share times the band; a charm carries its own curve and charmValue already answers
    // both ends of it. Food has no roll at all — it heals what it heals — and saying so is better than
    // printing a ladder of identical numbers.
    const rollsFor = () => {
        if (r.kind === "tool") {
            const base = toolBonusPct(r.tier);
            return QUALITY_BANDS.map((b) => ({ b, says: `${(base * b.mult).toFixed(1)}% ${slot?.bonus || "bonus"}` }));
        }
        if (r.kind === "charm") {
            // ⚠️ charmValue TAKES A BAND ID, NOT A 0..100 ROLL. charmValueOf is the one that takes a
            // score; passing b.at here would have quietly asked for the value of band "98".
            return QUALITY_BANDS.map((b) => ({
                b, says: `+${charmValue(r.id, b.id)}% ${CHARM_STAT_LABEL[r.stat] || "bonus"}`,
            }));
        }
        return null;
    };
    const rolls = rollsFor();

    const costs = Object.entries(r.parts || {}).map(([part, need]) => {
        const have = Number(st.pack?.[part] || 0);
        return { part, need, have, short: Math.max(0, need - have) };
    });

    return (
        <div className="gv-pv" role="dialog" aria-label={r.name} onClick={onClose}>
            <div className="gv-pv-card" onClick={(e) => e.stopPropagation()}>
                <div className="gv-pv-head">
                    <span className="gv-pv-face">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {art ? <img src={art} alt="" width={54} height={54} /> : null}
                    </span>
                    <div>
                        <b>{r.name}</b>
                        <i>{slot ? `${slot.name} · tier ${r.tier}` : r.kind === "food" ? "Food" : r.kind === "charm" ? "Charm" : r.kind}</i>
                    </div>
                    <button type="button" className="gv-pv-x" onClick={onClose} aria-label="Close">×</button>
                </div>

                {/* ── WHAT IT DOES IN THE GAME ────────────────────────────────────────────────────
                    Naming the SYSTEM is the half the bench row has never had room for. "dig depth"
                    is a stat; "every dig you make, everywhere in the game" is the reason to want it. */}
                <section className="gv-pv-sec">
                    <h5>What it does</h5>
                    {slot ? (
                        <p className="gv-pv-where">
                            Raises <b>{slot.bonus}</b> for <b>{slot.system}</b> — everywhere in the game,
                            for as long as you carry it. It is not spent.
                        </p>
                    ) : r.kind === "food" ? (
                        <p className="gv-pv-where">Goes on your belt and is eaten automatically when you drop low. Each one is used up.</p>
                    ) : r.kind === "charm" ? (
                        <p className="gv-pv-where">Carried into one run in the Grove and burned when you walk in. One run, then it is gone.</p>
                    ) : (
                        <p className="gv-pv-where">{r.blurb}</p>
                    )}
                    {r.blurb && slot ? <p className="gv-rs-flavour">{r.blurb}</p> : null}
                </section>

                {/* ── THE ROLL ────────────────────────────────────────────────────────────────────
                    ⚠️ THE CHANCES ARE THIS PLAYER'S, AT THIS CRAFTING LEVEL. A static ladder would say
                    the same thing to a level 1 and a level 25, and the whole point of the level is
                    that it moves these. Missing shares render as a dash rather than 0% — the payload
                    is older than this screen for anyone with the page already open. */}
                {rolls ? (
                    <section className="gv-pv-sec">
                        <h5>How it could roll</h5>
                        <ul className="gv-rs-rolls">
                            {rolls.map(({ b, says }) => (
                                <li key={b.id} style={{ "--band": bandTint(b.id) }}>
                                    <b>{b.name}</b>
                                    <span>{says}</span>
                                    <em>{share[b.id] == null ? "—" : PCT(share[b.id])}</em>
                                </li>
                            ))}
                        </ul>
                        <p className="gv-pv-where">Your chances at crafting level {st.craft?.level ?? 1}. Playing the forge well shifts them upward.</p>
                    </section>
                ) : (
                    <section className="gv-pv-sec">
                        <h5>How it could roll</h5>
                        <p className="gv-pv-where">This one does not roll — every batch comes out the same.</p>
                    </section>
                )}

                <section className="gv-pv-sec">
                    <h5>What it costs</h5>
                    <ul className="gv-ts-cost">
                        {costs.map((c) => (
                            <li key={c.part} className={c.short ? "is-short" : "is-have"}
                                title={`${partName(c.part)} — ${c.have} of ${c.need}`}>
                                <PartIcon id={c.part} size={17} />
                                <span>{Math.min(c.have, c.need)}/{c.need}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
        </div>
    );
}
