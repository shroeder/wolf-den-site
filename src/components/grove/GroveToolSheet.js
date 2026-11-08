"use client";

import { useEffect } from "react";

import { toolArt } from "@/lib/marketplace/grove-catalog.js";
import { toolBonusPct, TOOL_TIER_CAP, toolNumeral } from "@/lib/marketplace/grove-recipes.js";
import { QUALITY_BANDS, qualityBand, toolBonusFor, bandTint } from "@/lib/marketplace/grove-forge.js";

// ── INSPECTING A TOOL ───────────────────────────────────────────────────────────────────────────────────────
// Luke: "you can't even like inspect the tools in your tools area. I feel like when you're in the inventory,
// like we just need to do a lot better job letting people inspect things... You need to do a full pass."
//
// The shelf answers what it IS — name, tier, band, what it pays. What it could never answer is the only
// question anybody actually opens a tools screen to ask: **is this one finished, and if not, what would it
// take.** That answer lived on the workbench, four taps away, in a list of 129 rows where you had to already
// know which one was yours.
//
// ⚠️ A TIER AND A BAND ARE TWO LADDERS AND THEY ARE NOT INTERCHANGEABLE. The tier is what the tool IS and it
// only ever goes up; the band is how well that one came out and a rework re-rolls it. Both multiply into the
// single percentage the shelf prints, which is exactly why that percentage on its own was unreadable: a
// Masterwork tier 4 and a Rough tier 6 can pay nearly the same and want completely different things from
// you. This sheet separates them and offers the door for each.
//
// ── ⚠️ IT NO LONGER OFFERS ANY DOORS, BECAUSE EVERY ONE OF THEM LED TO THE BENCH ──────────────────────────
// 2026-11-08. This sheet used to answer "is this one finished, and if not, what would it take" — the next
// rung priced against your bag, and a re-roll offer below the top band — and every route it offered ended
// on a row at the workbench, which was the one place a craft could start.
//
// What is left is the half that was always the biggest miss: `toolMeta` had carried `quality` since it was
// written and NO screen showed it, so the one thing the crafting act existed to decide was invisible on
// the thing it decided. A member who holds a tool can still read what it is and what it pays.
//
// ⚠️ THE TIER/BAND DISTINCTION STAYS AND IS STILL THE POINT. The tier is what the tool IS; the band is how
// well that one came out. Both multiply into the single percentage the shelf prints, which is why that
// percentage alone was unreadable — a Masterwork tier 4 and a Rough tier 6 pay nearly the same. Neither
// can be acted on at the moment, so the sheet states them instead of offering a button for each.

const bandName = (id) => QUALITY_BANDS.find((b) => b.id === id)?.name || id;
const topBandId = QUALITY_BANDS[0].id;

export default function GroveToolSheet({ tool, onClose = () => {} }) {
    useEffect(() => {
        const k = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", k);
        return () => window.removeEventListener("keydown", k);
    }, [onClose]);

    const tier = Number(tool?.tier) || 0;
    const band = tier ? qualityBand(tool.quality ?? 0) : null;

    // ✂️ `next`, `nextCosts` and `shortTotal` were here — the rung above the one you hold, priced part by
    // part against your bag off the same recipe the bench charged from, so the cost shown could not
    // disagree with the cost taken.
    // ⚠️ STILL COMPUTED, BUT ONLY TO CHOOSE A SENTENCE. A rework re-rolled the band and kept the better of
    // the two, so it was only ever offered below the top band; now the same test decides whether the tool
    // reads as "the best it rolls" or as one that simply came out this way.
    const belowTopBand = tier > 0 && band?.id !== topBandId;

    return (
        <div className="gv-pv" role="dialog" aria-label={tool?.name || "Tool"} onClick={onClose}>
            <div className="gv-pv-card" onClick={(e) => e.stopPropagation()}>
                <div className="gv-pv-head">
                    <span className="gv-pv-face">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {tier ? <img src={toolArt(tool.slot, tier)} alt="" width={54} height={54} /> : null}
                    </span>
                    <div>
                        <b>{tool?.name}</b>
                        <i>{tier ? `Tier ${toolNumeral(tier)} of ${toolNumeral(TOOL_TIER_CAP)}` : "You have not made one yet"}</i>
                    </div>
                    <button type="button" className="gv-pv-x" onClick={onClose} aria-label="Close">×</button>
                </div>

                {/* ── WHAT IT PAYS, AND WHICH LADDER EACH HALF CAME FROM ───────────────────────────
                    The shelf printed one number. Two numbers that multiply into it say which of the
                    two things you could do about it is worth doing. */}
                {tier ? (
                    <section className="gv-pv-sec">
                        <h5>What it gives</h5>
                        <p className="gv-ts-big" style={band ? { "--band": bandTint(band.id) } : undefined}>
                            +{toolBonusFor(tier, tool.quality ?? null)}% <span>{tool.bonus}</span>
                        </p>
                        <p className="gv-pv-where">
                            The tier is worth {toolBonusPct(tier)}%; it came out{" "}
                            <b style={band ? { color: bandTint(band.id) } : undefined}>{band?.name}</b>
                            {belowTopBand ? " — there is no way to re-roll it at the moment." : " — the best it rolls."}
                        </p>
                    </section>
                ) : null}

                {/* ── ✂️ THE NEXT RUNG AND THE RE-ROLL OFFER WERE BOTH HERE ────────────────────────
                    The rung above showed this tier's own share arrowing to the next one — tier to tier,
                    deliberately NOT what-you-have to tier, because the next rung rolls a fresh band of
                    its own and promising a Masterwork holder that tier 8 beats their tier 7 is a promise
                    the roll does not make. Under it sat the cost, part by part, and a count of how many
                    you were short.

                    Both were buttons into a bench row. Nothing replaces them here on purpose: a section
                    saying "there is a tier above this and no way to reach it" is a wall with a label on
                    it, and [[migrating-a-category-strands-its-drop-paths]] is the warning about exactly
                    that — a path that reads to the player as bad luck rather than as absent. The tier
                    cap is still stated above, which is the honest half. See item R. */}
            </div>
        </div>
    );
}
