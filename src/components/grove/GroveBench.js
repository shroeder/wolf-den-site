"use client";

import { ROMAN } from "@/lib/marketplace/grove-recipes.js";
import { toolArt } from "@/lib/marketplace/grove-catalog.js";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
    GiAnvil, GiBackpack, GiCompass, GiFarmTractor, GiFishingPole,
    GiDigHole, GiHealthPotion, GiMineWagon, GiStoneCrafting, GiTreasureMap,
    GiLaurelCrown,
} from "react-icons/gi";

import Area from "@/components/grove/GroveArea.js";
import { GROVE_RECIPES, TOOL_SLOTS, toolBonusPct, recipeRows, reachableRecipes, reworkCost } from "@/lib/marketplace/grove-recipes.js";
import { QUALITY_BANDS, qualityBand, toolBonusFor, GROVE_CHESTS, GROVE_CHEST_ORDER } from "@/lib/marketplace/grove-forge.js";

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
        // ⚠️ A BUILT TOOL SHOWS WHAT IT IS ACTUALLY WORTH, QUALITY INCLUDED. toolBonusPct is the TIER's
        // share and nothing else; the thing the player's tool really pays is tier x the quality band's
        // multiplier (toolBonusFor). Without this the rework -- whose entire purpose is to move that
        // multiplier -- announced "Rough to Fine" and then printed the same 3% underneath it, which is the
        // same lie as the "3% -> 3%" arrow the note above this line exists to have removed.
        if (built) {
            const q = st.toolQuality?.[r.slot] ?? 0;
            const worth = toolBonusFor(r.tier, q);
            const band = bandName(qualityBand(q)?.id);
            return `${t?.name || "Tool"} tier ${r.tier} · ${band} · ${t?.bonus || "bonus"} ${worth}%`;
        }
        return `${t?.name || "Tool"} tier ${r.tier} · ${t?.bonus || "bonus"} ${now}% → ${next}%`;
    }
    return r.blurb || "";
}

const RECIPE_NAME = Object.fromEntries(GROVE_RECIPES.map((r) => [r.id, r.name]));
const recipeName = (id) => RECIPE_NAME[id] || id;
const bandName = (id) => QUALITY_BANDS.find((b) => b.id === id)?.name || id;
// The band a raw 0-100 score falls in, named — what the Rework button shows you are trying to beat.
const bandNameOf = (score) => bandName(qualityBand(Number(score) || 0)?.id);

// ⚠️ "Storage" AND "Farm" GROUP TWO RECIPE KINDS EACH, on purpose. A player thinks "where do I put things"
// and "what about the farm" — they do not think "pack" and "bank" as separate questions, and six chips that
// each hide three rows is a worse list than four that hide nine.
// ⚠️ "All" MEANS "ALL YOU CAN REACH", NOT "ALL THAT EXIST" -- the filtering happens in recipeRows, which
// drops recipes belonging to maps that are not built. See the note there.
const FILTERS = [
    { id: "all", label: "All" },
    { id: "ready", label: "Ready" },
    { id: "tool", label: "Tools" },
    { id: "food", label: "Food" },
    { id: "store", label: "Storage" },
    { id: "farm", label: "Farm" },
];

export default function GroveBench({ st, known, partName, PartIcon, post, refresh, setNote }) {
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(null);
    // ⚠️ ITS OWN CARD, NOT THE CRAFT RESULT. An open and a craft pay different things and the open can
    // CHAIN -- "open another" has to leave the card standing while the thing underneath it changes.
    const [opened, setOpened] = useState(null);

    // ── ⚠️ THE DROP WAS BEING BANKED IN SILENCE ─────────────────────────────────────────────────────
    // The boss has been paying chests and merits into the database since they were built, and no screen
    // in the game mentioned either one. The server even returns both from the kill with a comment saying
    // the card should show them. Luke, playing it: "I'm not seeing any of the new stuff we added around
    // crafting or any of the new loot. I don't see any of the dopamine."
    //
    // So a reward that exists only as a row is not a reward. The shelf sits at the TOP of the bench --
    // above the ladder, above every recipe -- because an unopened chest is the single most urgent thing
    // on this screen, and because what spills out of it is exactly what the rest of the screen spends.
    const chests = useMemo(() => GROVE_CHEST_ORDER
        .map((id) => ({ ...GROVE_CHESTS[id], have: Number(st.chests?.[id]) || 0 }))
        .filter((c) => c.have > 0), [st.chests]);

    const openChest = async (tier) => {
        setBusy(`chest:${tier}`);
        const d = await post({ action: "openChest", tier });
        setBusy(null);
        if (!d?.ok) {
            setNote(d?.error === "none_held" ? "You don't have one of those."
                : "That chest wouldn't open.");
            return;
        }
        setOpened(d);
        await refresh();
    };

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
    // ── THE FILTER ──────────────────────────────────────────────────────────────────────────────────
    // ⚠️ THE DEFAULT IS "ALL", AND THE SORT IS THE REAL ANSWER. 26 recipes is not a list that needs
    // filtering to be usable — it needs ORDERING, and the sort below already puts what you can make now
    // at the top and what you have already built at the bottom. The chips are for the other question, the
    // one a sort cannot answer: "show me only the tools", when you came here to finish the tool ladder.
    const [kind, setKind] = useState("all");
    // Two memos, deliberately: the chip COUNTS must describe the whole list, so they cannot be computed
    // from the filtered one. Picking "Tools" should not make every other chip read 0.
    // ⚠️ THE SHARED RULE, NOT A LOCAL COPY. This used to be twenty lines inline here, and the zone dock now
    // needs the same answer for its badge. Two implementations of "can I make this" is two answers to the
    // only question the workbench exists to answer. See recipeRows in grove-recipes.js.
    const allRows = useMemo(() => recipeRows(st), [st]);

    const rows = useMemo(() => {
        const picked = kind === "all" ? allRows
            : kind === "ready" ? allRows.filter((x) => x.ready)
            : kind === "store" ? allRows.filter((x) => x.r.kind === "pack" || x.r.kind === "bank")
            : kind === "farm" ? allRows.filter((x) => x.r.kind === "deco" || x.r.kind === "plot")
            : allRows.filter((x) => x.r.kind === kind);
        return [...picked].sort((a, b) => {
            if (a.built !== b.built) return a.built ? 1 : -1;
            if (a.ready !== b.ready) return a.ready ? -1 : 1;
            // Then CLOSEST FIRST. "Two roots away" is the row that sends somebody back out to the zone;
            // burying it under a recipe needing forty parts is what makes a crafting list feel like a wall.
            if (a.missing !== b.missing) return a.missing - b.missing;
            return a.unmet - b.unmet;
        });
    }, [kind, allRows]);

    const readyCount = allRows.filter((x) => x.ready).length;
    // ⚠️ DEFAULTED, BECAUSE THE SERVER THAT SENDS THESE IS NEWER THAN THE CLIENT THAT MAY BE OPEN. A
    // player with the page already loaded when this deploys gets a payload without them, and a panel
    // that throws on a missing field is a worse outcome than one that shows level 1 for a minute.
    const lvl = st.craft || { level: 1, progress: 0, intoLevel: 0, needForNext: null, capped: false };
    const odds = lvl.odds || [];
    const recent = lvl.recent || [];
    const merits = Number(st.merits) || 0;

    const craft = async (r) => {
        setBusy(r.id);
        const d = await post({ action: "craft", recipe: r.id });
        setBusy(null);
        if (!d?.ok) {
            setNote(d?.error === "not_enough_parts" ? "Not enough parts for that."
                : d?.error === "already_built" ? "You already have that one."
                // A rung is climbed from the one below it. Say which one is missing rather than refusing
                // flatly — "you cannot make this" with no reason reads as a bug in a crafting screen.
                : d?.error === "needs_previous_tier"
                    ? `Make tier ${ROMAN[(d.need || 1) - 1] || d.need} first — each tier is remade from the one below it.`
                : "Couldn't make that.");
            return;
        }
        // The moment. Built from the SERVER's spent list, so what is shown is what actually left the bag.
        setResult({ ...d, recipe: r });
        await refresh();
    };

    // ── ⚠️ REWORKING A BUILT TOOL ───────────────────────────────────────────────────────────────
    // The only thing on this screen you can press TWICE. Everything else is a one-time climb: a tier is
    // made once, a vault is built once. A tool whose quality came out Rough was Rough for ever, so once
    // a player had made the best tier their parts could reach the bench had nothing left to want from
    // them -- which is most of why the deepest player in the game has 93 Bound Straw and has never
    // crafted. See groveRework.
    const rework = async (r) => {
        setBusy(`rw-${r.id}`);
        const d = await post({ action: "rework", slot: r.slot });
        setBusy(null);
        if (!d?.ok) {
            setNote(d?.error === "not_enough_parts" ? "Not enough parts to rework that."
                : d?.error === "already_best" ? "That one is already Pristine — there is nothing better to roll."
                : d?.error === "no_tool" ? "Make it first."
                : "Couldn't rework that.");
            return;
        }
        // ⚠️ THE ROLL IS SHOWN EVEN WHEN IT LOSES. "You rolled Rough and kept your Fine" is a real
        // outcome and a better story than a screen that silently says Fine again -- the player paid for
        // that roll and is owed the sight of it.
        setResult({ ...d, recipe: r, isRework: true });
        await refresh();
    };

    return (
        <div className="gv-bench2">
            {/* ── ⚠️ THE LADDER, SHOWN RATHER THAN CLAIMED ────────────────────────────────────────
                Luke: "The crafting level needs dopamine massively and visibility transparency recall and
                awareness."

                Four things, and each answers a different question the old screen could not:

                  VISIBILITY    the level and its bar are the first thing on the panel, not a number
                                buried in a result card that is gone in two seconds.
                  TRANSPARENCY  the ODDS ARE PRINTED. "Higher levels improve your rolls" is a claim; the
                                real band shares at this exact level are a fact that can be checked
                                against what actually comes out. They are computed from the same curve
                                the server rolls on, in closed form, so the two cannot drift.
                  RECALL        the last twelve things made, with how each came out -- a ladder with no
                                history behind it is a number you are asked to take on faith.
                  AWARENESS     every tool on the bench wears its own band, so the thing the level BUYS
                                is visible on the thing it was spent on. */}
            {/* The heading wears the DEEPEST chest on the shelf rather than a generic one, so the panel
                itself says whether what is waiting is a Cache or a Reliquary. */}
            {chests.length ? (
                <Area id="chests" icon={`chest-${chests[chests.length - 1].id}`} title="Unopened"
                    count={`${chests.reduce((n, c) => n + c.have, 0)}`}>
                    <ul className="gv-shelf">
                        {chests.map((c) => (
                            <li key={c.id} className={`gv-chest is-${c.id}`}>
                                <button type="button" disabled={busy === `chest:${c.id}`}
                                    onClick={() => openChest(c.id)}>
                                    <span className="gv-chest-art">
                                        <img src={`/images/grove/chest-${c.id}.webp`} alt=""
                                            width={40} height={40} />
                                        {c.have > 1 ? <em>×{c.have}</em> : null}
                                    </span>
                                    <b>{c.name}</b>
                                    <span className="gv-chest-go">
                                        {busy === `chest:${c.id}` ? "Opening…" : "Open"}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </Area>
            ) : null}

            <Area id="bench" icon="ui-bench" title="Workbench"
                count={readyCount > 0 ? `${readyCount} ready` : null}>
            <header className="gv-level">
                <div className="gv-level-top">
                    <span className="gv-level-no">
                        <i>Crafting</i>
                        <b>{lvl.level}</b>
                    </span>
                    <span className="gv-level-meta">
                        <b>{readyCount > 0 ? `${readyCount} ready to make` : "Nothing ready yet"}</b>
                        <span>
                            {lvl.capped
                                ? "Top of the ladder."
                                : `${lvl.intoLevel} / ${lvl.needForNext} xp to ${lvl.level + 1}`}
                        </span>
                    </span>
                    {/* Merits have ONE faucet (bosses) and ONE sink (the sets), so they are a score the
                        player is saving up rather than a stat -- which makes a running total the whole of
                        what the screen owes them. It was a suffix on a sentence; it is a chip now. */}
                    {merits > 0 ? (
                        <span className="gv-merits" title="Won from bosses - spent on boss armour, under Emblems">
                            <GiLaurelCrown aria-hidden="true" focusable="false" />
                            <b>{merits}</b>
                        </span>
                    ) : null}
                </div>

                <div className="gv-level-bar">
                    <i style={{ width: `${Math.round((lvl.progress || 0) * 100)}%` }} />
                </div>

                {odds.length ? (
                    <>
                        <p className="gv-level-say">Every tool you make rolls a quality. At level {lvl.level}:</p>
                        <ul className="gv-odds">
                            {odds.map((b) => (
                                <li key={b.id} className={`is-${b.id}`}>
                                    <b>{Math.round(b.share * 100)}%</b>
                                    <span>{b.name}</span>
                                    <em>×{b.mult.toFixed(2)}</em>
                                </li>
                            ))}
                        </ul>
                    </>
                ) : null}

                {recent.length ? (
                    <details className="gv-recall">
                        <summary>Last {recent.length} crafted</summary>
                        <ul>
                            {recent.map((c, i) => (
                                <li key={`${c.recipe}-${i}`}>
                                    <span>{recipeName(c.recipe)}</span>
                                    {c.band ? <em className={`is-${c.band}`}>{bandName(c.band)}</em> : null}
                                    <b>+{c.xp}</b>
                                </li>
                            ))}
                        </ul>
                    </details>
                ) : null}
            </header>

            {/* Counts on the chips, because a filter you have to tap to discover is empty is a filter that
                wastes a tap. "Ready" carries the only number anybody is actually looking for. */}
            <div className="gv-recfilter" role="tablist" aria-label="Filter recipes">
                {FILTERS.map((f) => {
                    const n = f.id === "all" ? allRows.length
                        : f.id === "ready" ? allRows.filter((x) => x.ready).length
                        : f.id === "store" ? allRows.filter((x) => x.r.kind === "pack" || x.r.kind === "bank").length
                        : f.id === "farm" ? allRows.filter((x) => x.r.kind === "deco" || x.r.kind === "plot").length
                        : allRows.filter((x) => x.r.kind === f.id).length;
                    return (
                        <button
                            key={f.id}
                            type="button"
                            role="tab"
                            aria-selected={kind === f.id}
                            className={`gv-recchip${kind === f.id ? " is-on" : ""}`}
                            onClick={() => setKind(f.id)}
                        >
                            {f.label}<em>{n}</em>
                        </button>
                    );
                })}
            </div>

            {!rows.length ? (
                <p className="muted">
                    {kind === "ready"
                        ? "Nothing is ready to make yet — the list above shows what each one still needs."
                        : "Nothing in this group yet."}
                </p>
            ) : null}

            <ul className="gv-recs">
                {rows.map(({ r, built, costs, missing, haveParts, ready }) => {
                    const Icon = (r.kind === "tool" && SLOT_ICON[r.slot]) || KIND_ICON[r.kind] || GiStoneCrafting;
                    // A tool recipe shows the rung it would make, not a generic slot icon — the whole point
                    // of drawing twelve of each was that tier VII is a different object, and a workbench that
                    // shows the same picture for all twelve hides exactly that.
                    const art = r.kind === "food" ? `/images/grove/food-${r.id}.webp`
                        : r.kind === "tool" ? toolArt(r.slot, r.tier)
                        : null;
                    // ── ⚠️ WHAT A REWORK WOULD COST, PRICED OFF THIS RECIPE ──────────────────────
                    // Only ever offered on the tool actually sitting in the slot: a tier-III card for a
                    // slot now holding tier VII must not offer to re-roll tier VII at tier-III prices.
                    // ⚠️ A NULL QUALITY IS ROUGH, NOT "INELIGIBLE". Every tool that exists in the game
                    // today predates the quality roll and has quality null, which grove-forge.js already
                    // treats as Rough on purpose ("inventing a value would be making up history"). Gating
                    // the rework on a non-null quality would have hidden the button from literally every
                    // tool in the game -- and from exactly the players most likely to want it.
                    const toolQ = st.toolQuality?.[r.slot] ?? 0;
                    const inSlot = Number(st.tools?.[r.slot] || 0) === Number(r.tier);
                    const topBand = qualityBand(toolQ)?.id === QUALITY_BANDS[0].id;
                    const canRework = r.kind === "tool" && built && inSlot && !topBand;
                    const rwCost = canRework ? reworkCost(r) : null;
                    const rwShortList = rwCost
                        ? Object.entries(rwCost).map(([part, n]) => Math.max(0, n - Number((st.pack || {})[part] || 0)))
                        : [];
                    const reworkShort = rwShortList.reduce((a, b) => a + b, 0);
                    const reworkReady = canRework && reworkShort === 0;
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
                                    {built && r.kind === "tool" && st.toolQuality?.[r.slot] != null ? (
                                        // The thing the level BUYS, on the thing it was spent on.
                                        <em className={`gv-tag is-q is-${qualityBand(st.toolQuality[r.slot]).id}`}>
                                            {qualityBand(st.toolQuality[r.slot]).name}
                                        </em>
                                    ) : built ? <em className="gv-tag is-done">Built</em>
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

                            {/* ⚠️ "Built" WAS A DEAD END, AND IT IS THE ONLY STATE A FINISHED PLAYER EVER
                                SEES. A tool you own showed a disabled button saying so and nothing else --
                                the end of the line on the one screen that is supposed to keep wanting your
                                parts. If it can still be improved, it now offers that instead. */}
                            {built && canRework ? (
                                <button type="button" className="gv-rec-go is-rework"
                                    disabled={!reworkReady || busy === `rw-${r.id}`}
                                    title={`Re-roll the quality and keep the better of the two`}
                                    onClick={() => rework(r)}>
                                    {busy === `rw-${r.id}` ? "…"
                                        : reworkReady ? `Rework · ${bandNameOf(toolQ)}`
                                        : `Rework · ${reworkShort} short`}
                                </button>
                            ) : (
                                <button type="button" className="gv-rec-go"
                                    disabled={!ready || busy === r.id}
                                    onClick={() => craft(r)}>
                                    {busy === r.id ? "…" : built ? "Built" : ready ? "Craft" : `${missing} short`}
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
            </Area>

            {/* ── THE RESULT ──────────────────────────────────────────────────────────────────────────
                Both halves of the trade, because that is the accountability: the parts that left on the
                left, the thing that arrived on the right, and the numbers of what it changed. A toast
                could never show a cost. */}
            {/* ── THE OPENING ────────────────────────────────────────────────────────────────────────
                A chest that pays into the bag with a toast is a chest nobody walks a zone for. The lid
                bursts, the parts arrive STAGGERED rather than as a finished list -- the stagger IS the
                moment, because a list that is already complete when it appears was never revealed -- and
                the merits land last, on their own, because they are the thing the sets are bought with.

                ⚠️ "Open another" KEEPS THE CARD UP and re-keys it. The chain is the loop: three caches
                should be three openings, not one opening and two silent decrements. The key is what makes
                React tear the contents down and replay every animation; without it the second open paints
                new numbers into an already-finished card and nothing moves. */}
            {opened && host ? createPortal((
                <div className="gv-made gv-spill" role="dialog" aria-label={`Opened ${opened.name}`}
                    onClick={() => setOpened(null)}>
                    <div className="gv-made-card gv-spill-card" key={`${opened.tier}-${opened.left}`}
                        onClick={(e) => e.stopPropagation()}>
                        <i className="gv-made-kick">Opened</i>
                        <b className="gv-made-name">{opened.name}</b>

                        <div className="gv-spill-face">
                            <img src={`/images/grove/chest-${opened.tier}.webp`} alt=""
                                width={104} height={104} />
                            <span className="gv-spill-burst" aria-hidden="true" />
                        </div>

                        <ul className="gv-spill-loot">
                            {Object.entries(opened.parts || {}).map(([id, n], i) => (
                                <li key={id} style={{ animationDelay: `${140 + i * 110}ms` }}>
                                    <PartIcon id={id} size={30} />
                                    <b>{n}</b>
                                    <span>{partName(id)}</span>
                                    {opened.newlySeen?.includes(id)
                                        ? <em className="gv-tag is-new">New</em> : null}
                                </li>
                            ))}
                        </ul>

                        {opened.merits > 0 ? (
                            <div className="gv-spill-merits"
                                style={{ animationDelay: `${180 + Object.keys(opened.parts || {}).length * 110}ms` }}>
                                <GiLaurelCrown aria-hidden="true" focusable="false" />
                                <b>+{opened.merits}</b>
                                <span>merits</span>
                            </div>
                        ) : null}

                        {/* The bag can be full, and a reward that vanished into a full bag without saying
                            so is the worst possible version of a reward. storeParts already knows. */}
                        {Object.keys(opened.overflow || {}).length ? (
                            <p className="gv-spill-over">
                                No room for {Object.entries(opened.overflow).map(([k, n]) => `${n} ${partName(k)}`).join(" · ")}
                                {" "}— left in the grove.
                            </p>
                        ) : null}

                        {opened.left > 0 ? (
                            <button type="button" className="gv-spill-again"
                                disabled={busy === `chest:${opened.tier}`}
                                onClick={() => openChest(opened.tier)}>
                                Open another ({opened.left})
                            </button>
                        ) : null}
                        <button type="button" onClick={() => setOpened(null)}>Good</button>
                    </div>
                </div>
            ), host) : null}

            {result && host ? createPortal((
                <div className="gv-made" role="dialog" aria-label={`Made ${result.name}`}
                    onClick={() => setResult(null)}>
                    <div className="gv-made-card" onClick={(e) => e.stopPropagation()}>
                        <i className={`gv-made-kick${result.isRework && !result.improved ? " is-held" : ""}`}>
                            {result.isRework ? (result.improved ? "Reworked" : "Rolled") : "Crafted"}
                        </i>
                        <b className="gv-made-name">{result.name}</b>

                        {/* ⚠️ THE ROLL IS NAMED EVEN WHEN IT LOSES, and losing is the common case: the
                            rework keeps the better of the two, so most attempts end with the tool you
                            already had. A card that just said "Fine" again would read as a button that
                            did nothing. Saying "rolled Rough, kept Fine" is the difference between a
                            miss and a bug. */}
                        {result.isRework ? (
                            <p className="gv-made-roll">
                                {result.improved
                                    ? <>{bandName(result.bandBefore)} <span aria-hidden="true">→</span> <b>{bandName(result.bandAfter)}</b></>
                                    : <>Rolled {bandName(result.bandRolled)} — still <b>{bandName(result.bandAfter)}</b>. No better this time.</>}
                            </p>
                        ) : null}

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

                        {result.craft ? (
                            <div className={`gv-made-lv${result.craft.levelled ? " is-up" : ""}`}>
                                {/* The level-up is the LOUDEST thing on this card, because it is the rarest.
                                    The exact odds deliberately do NOT appear here. The curve is gentle on
                                    purpose -- one level moves Pristine by well under a point -- so printing
                                    the per-level delta on the celebration would be honest and demoralising
                                    at the same time. The feeling belongs here; the numbers belong on the
                                    banner, where they stand in front of the player on every visit. */}
                                {result.craft.levelled ? (
                                    <span className="gv-made-lv-up">
                                        <i>Level up</i>
                                        <b>
                                            <s>{result.craft.level - 1}</s>
                                            <u>{result.craft.level}</u>
                                        </b>
                                        <span>Better rolls on everything you make from here</span>
                                    </span>
                                ) : null}
                                <span className="gv-made-lv-top">
                                    {/* On a level-up the big number above has already said the level, so
                                        this row spends itself on the next rung instead of repeating it. */}
                                    <b>
                                        {result.craft.levelled && result.craft.needForNext
                                            ? `${result.craft.intoLevel} / ${result.craft.needForNext} to ${result.craft.level + 1}`
                                            : `Crafting ${result.craft.level}`}
                                    </b>
                                    <em>+{result.craft.xpGained} xp</em>
                                </span>
                                <span className="gv-made-lv-bar">
                                    <i style={{ width: `${Math.round((result.craft.progress || 0) * 100)}%` }} />
                                </span>
                                {result.quality != null ? (
                                    <span className={`gv-made-q is-${result.qualityBand}`}>
                                        Rolled {bandName(result.qualityBand)} · {result.quality}/100
                                    </span>
                                ) : null}
                            </div>
                        ) : null}
                        <button type="button" onClick={() => setResult(null)}>Good</button>
                    </div>
                </div>
            ), host) : null}
        </div>
    );
}
