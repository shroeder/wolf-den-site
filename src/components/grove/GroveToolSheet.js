"use client";

import { useEffect } from "react";

import { toolArt } from "@/lib/marketplace/grove-catalog.js";
import {
    GROVE_RECIPES, toolBonusPct, TOOL_TIER_CAP, toolNumeral,
} from "@/lib/marketplace/grove-recipes.js";
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
// ⚠️ IT OFFERS DOORS, IT DOES NOT CRAFT. Everything here is a route to a row on the bench, which is the one
// place a craft can start — see goToArea's third argument. A second Craft button, priced and gated
// separately from the real one, is two implementations of "can I make this".

const bandName = (id) => QUALITY_BANDS.find((b) => b.id === id)?.name || id;
const topBandId = QUALITY_BANDS[0].id;

export default function GroveToolSheet({
    tool, pack = {}, PartIcon, partName, onGoRecipe = () => {}, onClose = () => {},
}) {
    useEffect(() => {
        const k = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", k);
        return () => window.removeEventListener("keydown", k);
    }, [onClose]);

    const tier = Number(tool?.tier) || 0;
    const band = tier ? qualityBand(tool.quality ?? 0) : null;
    const atCap = tier >= TOOL_TIER_CAP;

    // The rung above the one you hold — or rung one, when the slot is empty. Same source the bench charges
    // from, so a cost shown here cannot disagree with the cost taken there.
    const next = GROVE_RECIPES.find(
        (r) => r.kind === "tool" && r.slot === tool?.slot && Number(r.tier) === tier + 1,
    );
    const nextCosts = next ? Object.entries(next.parts || {}).map(([part, need]) => {
        const have = Number(pack[part] || 0);
        return { part, need, have, short: Math.max(0, need - have) };
    }) : [];
    const shortTotal = nextCosts.reduce((a, c) => a + c.short, 0);

    // The one still on the table: a rework re-rolls the band and keeps the better of the two, so it is only
    // worth offering below the top band. Same rule the bench uses to decide whether to show the button.
    const canRework = tier > 0 && band?.id !== topBandId;

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
                            {canRework ? ", which a rework can still re-roll." : " — the best it rolls."}
                        </p>
                    </section>
                ) : null}

                {/* ── THE NEXT RUNG ────────────────────────────────────────────────────────────────
                    ⚠️ THE ARROW IS TIER TO TIER, NOT WHAT-YOU-HAVE TO TIER. The left number is this
                    tier's own share with no band in it, because the next one rolls a fresh band of
                    its own — promising a Masterwork holder that tier 8 pays more than their tier 7
                    would be a promise the roll does not make. */}
                {next ? (
                    <section className="gv-pv-sec">
                        <h5>{tier ? "The next rung" : "The first rung"}</h5>
                        <button type="button" className="gv-ts-next" onClick={() => onGoRecipe(next.id)}>
                            <b>{next.name}</b>
                            <em>{toolBonusPct(tier)}% <i aria-hidden="true">→</i> {toolBonusPct(next.tier)}%</em>
                        </button>
                        <ul className="gv-ts-cost">
                            {nextCosts.map((c) => (
                                <li key={c.part} className={c.short ? "is-short" : "is-have"}
                                    title={`${partName(c.part)} — ${c.have} of ${c.need}`}>
                                    <PartIcon id={c.part} size={17} />
                                    <span>{Math.min(c.have, c.need)}/{c.need}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="gv-pv-where">
                            {shortTotal === 0
                                ? "You have everything it needs."
                                : `${shortTotal} part${shortTotal === 1 ? "" : "s"} short.`}
                        </p>
                    </section>
                ) : atCap ? (
                    <section className="gv-pv-sec">
                        <h5>The next rung</h5>
                        <p className="gv-pv-where">
                            Tier {toolNumeral(TOOL_TIER_CAP)} is the last one. There is nothing above this.
                        </p>
                    </section>
                ) : (
                    // A rung that is designed but whose map is not built yet. Saying so is better than an
                    // empty section, and far better than pretending the ladder ends here.
                    <section className="gv-pv-sec">
                        <h5>The next rung</h5>
                        <p className="gv-pv-where">Forged from a map that is not open yet.</p>
                    </section>
                )}

                {canRework ? (
                    <button type="button" className="gv-pv-wish" onClick={() => onGoRecipe(`${tool.slot}_t${tier}`)}>
                        Re-roll its quality — it keeps the better of the two
                    </button>
                ) : null}
            </div>
        </div>
    );
}
