"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
    GiAnvil, GiBackpack, GiCompass, GiFarmTractor, GiFishingPole,
    GiDigHole, GiHealthPotion, GiMineWagon, GiStoneCrafting, GiTreasureMap,
} from "react-icons/gi";

import { GROVE_RECIPES, TOOL_SLOTS, toolBonusPct } from "@/lib/marketplace/grove-recipes.js";

// ── THE WORKBENCH ───────────────────────────────────────────────────────────────────────────────────────────
// Luke: "Crafting is very ghetto, needs full pass of grove crafting dopamine thoughtfulness and
// accountability to user."
//
// What was here was a flat list of every known recipe, each a name, a blurb, a row of parts and a button that
// said "Not yet". Pressing it produced the words "Made Moss Poultice" in a corner. Three things were wrong
// with that and only one of them was the looks:
//
//   1. NO ACCOUNTABILITY. The screen never said what a craft would SPEND, never confirmed what it had spent,
//      and never said what the thing it made would DO. A system that quietly eats sixteen parts and reports
//      four words is one the player cannot audit, and a player who cannot audit a cost stops paying it.
//   2. NO ORDER. Everything craftable sat alphabetically beside everything impossible, so the one recipe you
//      could actually make was wherever it happened to fall. The screen never answered the only question
//      being asked of it: what can I make right now?
//   3. NO MOMENT. The payoff for a bag of parts gathered over twenty minutes was a toast.
//
// So: READY FIRST, then closest-to-ready, then done. Every card says what it costs, what is missing by how
// much, and what the result is actually worth in numbers. And a craft ends in a result card that shows the
// trade both ways -- what went in, what came out -- built from the server's own `spent` list rather than
// from what the client hoped would happen.

const KIND_ICON = {
    tool: GiStoneCrafting, food: GiHealthPotion, pack: GiBackpack,
    bank: GiAnvil, plot: GiFarmTractor, decor: GiTreasureMap,
};
const SLOT_ICON = {
    rod: GiFishingPole, pick: GiMineWagon, shovel: GiDigHole,
    hammer: GiAnvil, hoe: GiFarmTractor, sextant: GiCompass,
};

/** What the thing actually does, in numbers, so a recipe is never a name and a vibe. */
function payoff(r, st, built = false) {
    if (r.kind === "food") return `Makes ${r.makes || 1} · heals on the belt`;
    if (r.kind === "pack") return `+${r.adds} backpack slots (now ${st.packSlots || 16})`;
    if (r.kind === "bank") return `+${r.adds} vault slots (now ${st.bankSlots || 16})`;
    if (r.kind === "plot") return "+1 farm plot";
    if (r.kind === "tool") {
        const t = TOOL_SLOTS.find((x) => x.slot === r.slot);
        // ⚠️ st.tools IS AN OBJECT KEYED BY SLOT, NOT AN ARRAY -- groveState builds it with
        // Object.fromEntries. Treating it as a list threw on mount and took the whole panel into the
        // error boundary, which is why the workbench rendered as nothing at all.
        const now = toolBonusPct(Number(st.tools?.[r.slot]) || 0);
        const next = toolBonusPct(r.tier);
        // ⚠️ A BUILT TOOL HAS NO TRANSITION TO SHOW. Rendering the arrow regardless printed
        // "fishing luck 3% -> 3%" on every tool already owned, which is worse than silence: it is a
        // number that looks like it is telling you something and is not.
        if (built) return `${t?.name || "Tool"} tier ${r.tier} · ${t?.bonus || "bonus"} ${next}%`;
        return `${t?.name || "Tool"} tier ${r.tier} · ${t?.bonus || "bonus"} ${now}% → ${next}%`;
    }
    return r.blurb || "";
}

export default function GroveBench({ st, known, partName, PartIcon, post, refresh, setNote }) {
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(null);

    // ── ⚠️ THE RESULT CARD IS PORTALLED, AND A z-index WAS NOT ENOUGH ───────────────────────────
    // Exactly the scar the zone sheet already carries. The card lives inside the panel, and an ancestor
    // of the panel makes a stacking context -- so z-index 1200 is a LOCAL number and the dock, at 65 in
    // the root context, painted straight through the middle of it. Four buttons punched through the one
    // moment the whole workbench exists to deliver.
    //
    // Portalled out it is a sibling of the dock, which is the only place the comparison the stylesheet
    // is written around actually holds. It targets document.fullscreenElement when there is one for the
    // same reason the sheet does: a browser in native full screen paints only that element's subtree, so
    // a card parented to body would never be drawn at all.
    //
    // ⚠️ READ AT RENDER, WITH NO EFFECT AND NO mounted FLAG, AND THAT IS SAFE HERE SPECIFICALLY.
    // `result` is null until somebody presses Craft, so this branch cannot run during the server render
    // or during hydration -- there is no mismatch to guard against. Reading it at the moment the card
    // opens is also MORE correct than caching it in state: it is right even if full screen was entered
    // before the workbench was.
    const host = typeof document === "undefined" ? null : (document.fullscreenElement || document.body);

    // ── ⚠️ SORTED BY WHAT THE PLAYER CAN DO, NOT BY WHAT THE FILE LISTS ─────────────────────────────
    // Ready first, then whatever is closest to ready, then the ones already built. "Closest" is counted in
    // PARTS STILL MISSING rather than in recipes-with-everything, because a recipe needing one more root is
    // a different prospect from one needing eleven and both would otherwise read as "Not yet".
    const rows = useMemo(() => {
        const pack = st.pack || {};
        const list = GROVE_RECIPES.filter((r) => known.has(r.id)).map((r) => {
            const built = (st.packsBuilt || []).includes(r.id)
                || (st.banksBuilt || []).includes(r.id)
                || (st.plotsBuilt || []).includes(r.id)
                || (r.kind === "tool" && Number(st.tools?.[r.slot] || 0) >= Number(r.tier));
            const costs = Object.entries(r.parts).map(([p, n]) => {
                const have = Number(pack[p] || 0);
                return { part: p, need: n, have, short: Math.max(0, n - have) };
            });
            const missing = costs.reduce((a, c) => a + c.short, 0);
            const haveParts = costs.filter((c) => c.short === 0).length;
            return { r, built, costs, missing, haveParts, ready: missing === 0 && !built };
        });
        return list.sort((a, b) => {
            if (a.built !== b.built) return a.built ? 1 : -1;
            if (a.ready !== b.ready) return a.ready ? -1 : 1;
            return a.missing - b.missing;
        });
    }, [known, st]);

    const readyCount = rows.filter((x) => x.ready).length;

    const craft = async (r) => {
        setBusy(r.id);
        const d = await post({ action: "craft", recipe: r.id });
        setBusy(null);
        if (!d?.ok) {
            setNote(d?.error === "not_enough_parts" ? "Not enough parts for that."
                : d?.error === "already_built" ? "You already have that one."
                : "Couldn't make that.");
            return;
        }
        // The moment. Built from the SERVER's spent list, so what is shown is what actually left the bag.
        setResult({ ...d, recipe: r });
        await refresh();
    };

    return (
        <div className="gv-bench2">
            <header className="gv-bh">
                <div>
                    <b>{readyCount > 0 ? `${readyCount} ready to make` : "Nothing ready yet"}</b>
                    <span>
                        {rows.length} recipe{rows.length === 1 ? "" : "s"} discovered ·
                        {" "}a recipe appears once you have found every part it needs, even if you dropped them
                    </span>
                </div>
            </header>

            {!rows.length ? <p className="muted">Nothing discovered yet. Kill things and keep what drops.</p> : null}

            <ul className="gv-recs">
                {rows.map(({ r, built, costs, missing, haveParts, ready }) => {
                    const Icon = (r.kind === "tool" && SLOT_ICON[r.slot]) || KIND_ICON[r.kind] || GiStoneCrafting;
                    const art = r.kind === "food" ? `/images/grove/food-${r.id}.webp` : null;
                    return (
                        <li key={r.id} className={`gv-rec${ready ? " is-ready" : ""}${built ? " is-built" : ""}`}>
                            <div className="gv-rec-face">
                                {art
                                    ? <img src={art} alt="" width={44} height={44} loading="lazy" />
                                    : <Icon aria-hidden="true" />}
                            </div>

                            <div className="gv-rec-body">
                                <div className="gv-rec-top">
                                    <b>{r.name}</b>
                                    {built ? <em className="gv-tag is-done">Built</em>
                                        : ready ? <em className="gv-tag is-go">Ready</em>
                                            : <em className="gv-tag">{haveParts}/{costs.length} parts</em>}
                                </div>
                                {/* ⚠️ WHAT IT DOES, IN NUMBERS. The blurb is flavour and was all there was. */}
                                <p className="gv-rec-pay">{payoff(r, st, built)}</p>
                                {r.blurb ? <p className="gv-rec-blurb">{r.blurb}</p> : null}

                                <ul className="gv-cost">
                                    {costs.map((c) => (
                                        <li key={c.part} className={c.short ? "is-short" : "is-have"}>
                                            <PartIcon id={c.part} size={18} />
                                            <span className="gv-cost-n">{Math.min(c.have, c.need)}/{c.need}</span>
                                            <span className="gv-cost-name">{partName(c.part)}</span>
                                            {c.short ? <em>need {c.short}</em> : null}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <button type="button" className="gv-rec-go"
                                disabled={!ready || busy === r.id}
                                onClick={() => craft(r)}>
                                {busy === r.id ? "…" : built ? "Built" : ready ? "Craft" : `${missing} short`}
                            </button>
                        </li>
                    );
                })}
            </ul>

            {/* ── THE RESULT ──────────────────────────────────────────────────────────────────────────
                Both halves of the trade, because that is the accountability: the parts that left on the
                left, the thing that arrived on the right, and the numbers of what it changed. A toast
                could never show a cost. */}
            {result && host ? createPortal((
                <div className="gv-made" role="dialog" aria-label={`Made ${result.name}`}
                    onClick={() => setResult(null)}>
                    <div className="gv-made-card" onClick={(e) => e.stopPropagation()}>
                        <i className="gv-made-kick">Crafted</i>
                        <b className="gv-made-name">{result.name}</b>

                        <div className="gv-made-face">
                            {result.kind === "food"
                                ? <img src={`/images/grove/food-${result.made}.webp`} alt="" width={96} height={96} />
                                : (() => {
                                    const I = (result.slot && SLOT_ICON[result.slot]) || KIND_ICON[result.kind] || GiStoneCrafting;
                                    return <I aria-hidden="true" />;
                                })()}
                        </div>

                        {/* ⚠️ `built` IS PASSED HERE DELIBERATELY. refresh() has already landed by the
                            time this renders, so the "before" value IS the after value and the arrow
                            printed "ore yield 3% -> 3%" on the very card celebrating the upgrade. What
                            the player wants from a result is what they NOW have. */}
                        <p className="gv-made-pay">{payoff(result.recipe, st, true)}</p>

                        {result.spent?.length ? (
                            <>
                                <i className="gv-made-kick gv-made-cost">It cost</i>
                                <ul className="gv-made-spent">
                                    {result.spent.map((sp) => (
                                        <li key={sp.part}>
                                            <PartIcon id={sp.part} size={20} />
                                            <span>{sp.n}</span>
                                            <em>{partName(sp.part)}</em>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : null}

                        <button type="button" onClick={() => setResult(null)}>Good</button>
                    </div>
                </div>
            ), host) : null}
        </div>
    );
}
