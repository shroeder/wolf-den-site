"use client";

import { ROMAN, craftableTimes
} from "@/lib/marketplace/grove-recipes.js";
import { toolArt, recipeArt } from "@/lib/marketplace/grove-catalog.js";

import { useWishlist } from "./useWishlist.js";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
    GiAnvil, GiBackpack, GiCompass, GiFarmTractor, GiFishingPole,
    GiDigHole, GiHealthPotion, GiMineWagon, GiStoneCrafting, GiTreasureMap,
    GiLaurelCrown,
} from "react-icons/gi";

import Area from "@/components/grove/GroveArea.js";
import GroveCraftAct from "@/components/grove/GroveCraftAct.js";
import { GROVE_RECIPES, TOOL_SLOTS, toolBonusPct, recipeRows, reachableRecipes, reworkCost, temperCost } from "@/lib/marketplace/grove-recipes.js";
import { QUALITY_BANDS, qualityBand, toolBonusFor, GROVE_CHESTS, GROVE_CHEST_ORDER, craftBonusLabel, charmValue, CHARM_STAT_LABEL, bandTint } from "@/lib/marketplace/grove-forge.js";

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
    bank: GiAnvil, plot: GiFarmTractor, decor: GiTreasureMap, charm: GiLaurelCrown,
};
const SLOT_ICON = {
    rod: GiFishingPole, pick: GiMineWagon, shovel: GiDigHole,
    hammer: GiAnvil, hoe: GiFarmTractor, sextant: GiCompass,
};

/** What the thing actually does, in numbers, so a recipe is never a name and a vibe. */
/**
 * What the thing does, in numbers.
 *
 * ⚠️ `got` IS THE SERVER'S ANSWER AND IT WINS OVER THE RECIPE. A Fine roll on a Moss Poultice puts SEVEN
 * in the bag, and this line printed "Makes 5" over the top of it — the authored number, on the one card
 * whose entire job is to say what just happened. The server already returns the totals (makes and adds
 * include the band bonus); the card simply was not reading them. Same class of defect as the tool card
 * that once announced "Rough to Fine" above an unchanged 3%, and it survived two passes over this file
 * because the recipe is right there and reading it looks correct.
 */
function payoff(r, st, built = false, got = null) {
    if (r.kind === "food") return `Makes ${got?.makes || r.makes || 1} · heals on the belt`;
    // ⚠️ THE RANGE, NOT A SINGLE NUMBER. A charm's worth is its base times the band it rolls, so quoting
    // only the base would understate the good half of the outcome — and the spread IS the reason to make
    // another one. Both ends come from charmValue so the card cannot drift from what the roll pays.
    if (r.kind === "charm") {
        return `${CHARM_STAT_LABEL[r.stat] || "Bonus"} +${charmValue(r.id, 0)}% to +${charmValue(r.id, 100)}% · one run`;
    }
    // pack / bank lines removed with the expansions themselves -- a bag has no ceiling to raise.
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

// ── ⚠️ WHAT YOU ALREADY HOLD OF THE THING THIS ROW MAKES ─────────────────────────────────
// Luke: "we also need to be able to have some linkage between crafting and items you've already crafted to
// see like what you currently possess and whether it's worth crafting that item again, what kind of quality
// you have on the existing item."
//
// A TOOL row has answered this for a while: it carries the band of the tool in that slot and offers a Rework
// priced against it. Foods and charms answered nothing at all, and a charm is the kind where the question
// bites hardest — charms are banded, you can hold several, and the ONLY reason to craft a second one is to
// beat the band you already have. Without this the row looked identical whether you held none or nine.
//
// ⚠️ COUNT AND BEST BAND, NOT A LIST. The Charms shelf is deliberately one row per potency, because a
// Rough and a Masterwork are different objects and choosing between them is the decision. That is the right
// shape for a shelf you are picking FROM; it is the wrong shape for a recipe, where the only question is
// "would another one beat what I have" — which is answered by the best one, not by all of them.
function holdingOf(r, st) {
    if (r.kind === "food") {
        const n = Number(st.food?.[r.id]) || 0;
        return n ? { n, band: null } : null;
    }
    if (r.kind === "charm") {
        const mine = (st.charms || []).filter((c) => c.id === r.id && Number(c.qty) > 0);
        if (!mine.length) return null;
        const n = mine.reduce((a, c) => a + (Number(c.qty) || 0), 0);
        // QUALITY_BANDS is best-first — the tool tag tests QUALITY_BANDS[0] for "already at the top", and
        // the Rework button hides itself there. Same order, so index 0 wins.
        const order = QUALITY_BANDS.map((b) => b.id);
        const best = [...mine].sort((a, b) => order.indexOf(a.band) - order.indexOf(b.band))[0];
        return { n, band: best?.band || null };
    }
    return null;
}

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
    // ⚠️ ITS OWN CHIP EVEN THOUGH THERE IS AT MOST ONE PER MAP. A charm is the only consumable here that
    // is not food and the only row a boss had to teach; burying it under "All" would hide the one thing
    // on this screen the player went and earned.
    { id: "charm", label: "Charms" },
    { id: "store", label: "Storage" },
    { id: "farm", label: "Farm" },
];

// Which shelf of the bag panel a finished thing lands on. ⚠️ KINDS THAT LEAVE THE GROVE ARE ABSENT on
// purpose: a plot and a decoration go to the Farm, and sending somebody out of the feature from a craft
// card is a worse answer than letting the card stay quiet.
const MADE_HOME = { tool: "tools", food: "belt", charm: "charms" };

/** Asks the bench to clear its filter so a named row is definitely rendered. See goToArea's third argument. */
export const SHOW_RECIPE_EVENT = "grove:show-recipe";

export default function GroveBench({ st, known, partName, PartIcon, post, refresh, setNote, onGoTo }) {
    // The shopping list. Client-only on purpose — see useWishlist.
    const { wish, toggle, want } = useWishlist();
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(null);
    // ── ⚠️ TEMPERING IS PER ROW, NOT A MODE THE SCREEN IS IN ────────────────────────────────────────
    // A single "temper" switch at the top would be armed from one recipe and fire on the next one the
    // player pressed, spending a surplus of commons on a vault they only wanted one of. Holding the
    // recipe id means the choice belongs to the thing it was made about, and pressing Craft on any other
    // row is an ordinary craft.
    const [tempering, setTempering] = useState(null);
    // The craft being played out, or null. Holds the recipe and whether it was tempered, because
    // both are needed when the act finally posts and the row underneath may have re-sorted by then.
    const [acting, setActing] = useState(null);
    // ── ⚠️ HOW MANY THIS ROW WILL MAKE, AND ABSENT MEANS "ALL OF THEM" ──────────────────────────────
    // Luke: "they should be able to craft a selected amount up to the max quantity of ingredients that
    // they have." Keyed by recipe id and deliberately NOT seeded to the max for every row on mount: the
    // max moves every time a part is spent or picked up, so a stored copy would go stale and start
    // disagreeing with the parts actually in the bag. Undefined reads as the live maximum; a number only
    // exists once the player has touched the stepper, and it is clamped against the live max on render.
    const [qty, setQty] = useState({});
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
    // ⚠️ A JUMP INTO A FILTERED LIST LANDS ON NOTHING. The part sheet sends players at one specific
    // recipe, and a player who had narrowed the chips to Tools would be scrolled to a food row that is not
    // in the DOM — a button that silently does nothing, which is the failure mode this whole pass exists
    // to remove. Cooking solved it the same way ("the target may not be in the current filter, and a jump
    // that lands on nothing is worse"). An event rather than a prop because the sender is the BAG panel,
    // which is not an ancestor of this one.
    useEffect(() => {
        const show = () => setKind("all");
        window.addEventListener(SHOW_RECIPE_EVENT, show);
        return () => window.removeEventListener(SHOW_RECIPE_EVENT, show);
    }, []);
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
    // ── ⚠️ "FINE OR BETTER", NOT "MASTERWORK" ───────────────────────────────────────────────────────
    // Quoting the top band alone would advertise tempering with a number that moves from 2% to 4% and
    // read as buying nothing, when what it actually shifts is the whole distribution. The three best
    // bands together are the threshold a player feels, and the set is taken from QUALITY_BANDS by
    // position rather than by name, so adding a sixth band tomorrow does not quietly change what this
    // sentence means.
    const GOOD = new Set(QUALITY_BANDS.slice(0, 3).map((b) => b.id));
    const goodShare = (list) => (list || []).filter((b) => GOOD.has(b.id)).reduce((a, b) => a + (b.share || 0), 0);
    // ⚠️ "Fine+" WAS SHORTHAND FOR NOTHING THE PLAYER HAD EVER SEEN. The bench printed it beside two
    // bare percentages and Luke read the result as noise: "Wtf is temper and plus q1 parts". A `+` suffix
    // is a convention from spreadsheets, not from the game — nowhere else does the Grove say "Fine+".
    const topBandName = `${QUALITY_BANDS[2].name} or better`;
    const topOdds = goodShare(odds);
    const topOddsT = goodShare(lvl.oddsTempered);
    const recent = lvl.recent || [];
    const merits = Number(st.merits) || 0;

    // ── ⚠️ PRESSING CRAFT OPENS THE ACT; THE ACT DOES THE CRAFTING ──────────────────────────────────
    // Luke: "Let's make it fun." The button no longer spends anything — it starts three beats, and the
    // third of them posts. Nothing has left the bag until the hammer work is done, so backing out of the
    // overlay costs nothing and a player who opens it by accident is not charged for curiosity.
    const craft = (r) => { setActing({ recipe: r, temper: tempering === r.id, times: 1 }); };

    /** Called by the act once the skill beats are played. This is the only place a craft is posted. */
    const commitCraft = async (act, aim) => {
        const r = acting?.recipe;
        if (!r) return { ok: false };
        // ⚠️ ONE ACT, EITHER ONE ITEM OR THE WHOLE BATCH. The act does not know or care which; it plays
        // the beats and hands back a performance, and this decides what that performance buys. Keeping
        // the branch here rather than inside the act means there is still exactly ONE place a craft is
        // posted from, which is what the note on this function has always promised.
        const times = Math.max(1, Number(acting.times) || 1);
        if (times > 1) return await postBatch(r, times, act, aim);
        setBusy(r.id);
        const d = await post({ action: "craft", recipe: r.id, temper: Boolean(acting.temper), act, aim });
        setBusy(null);
        return d;
    };

    // ── ⚠️ CRAFT ALL POSTS DIRECTLY AND OPENS NOTHING ───────────────────────────────────────────────
    // Luke: "I also think you should be able to craft all if you're trying to make a bunch of something."
    //
    // The act is the ceremony and the batch is the relief from it, so there is no overlay here: one request,
    // one note saying what came out. It deliberately does NOT reuse the result card -- that card shows a
    // board, a landing and one band, and a batch has ten of each. Printing the last roll's card over ten
    // crafts would be the same class of lie as a card announcing `recipe.makes` after a Masterwork.
    // ⚠️ IT OPENS THE ACT NOW INSTEAD OF POSTING. Luke: "when people do craft 10, it just skips the entire
    // minigame... it should always do the minigame." One performance, then the whole batch is forged
    // against it -- see commitCraft, which is still the only place a craft is posted from.
    const craftAll = (r, times) => {
        if (!times) return;
        setActing({ recipe: r, temper: tempering === r.id, times });
    };

    // ⚠️ THIS MUST RETURN SOMETHING WITH `ok` ON IT, AND NOT RETURNING ONE WAS A SHIPPED BUG.
    // Luke: "Plinko mini game is broken, when you choose to drop it, the screen just closes."
    //
    // It was. GroveCraftAct's release() does `const d = await onCommit(...)` and then
    // `if (!d?.ok) { onClose(d); return; }`. This function was lifted out of the old void-returning
    // craftAll handler and kept returning undefined, so after a perfectly good batch the act read "no ok"
    // and shut itself — and finishCraft, seeing the same undefined, then wrote "That did not work."
    // The craft had already succeeded on the server. The player got the parts spent, the items made, the
    // screen closed and an error, which is about the worst possible combination of true and false.
    //
    // ⚠️ IT RETURNS `batched` SO THE ACT KNOWS NOT TO DEAL A CARD. The result card shows a board, a
    // landing and one band; a batch has ten of each, and printing the last roll's card over ten crafts
    // would be the same class of lie the original comment on craft-all warned about. The summary note
    // below is the batch's answer; the act just needs to close cleanly rather than look crashed.
    const postBatch = async (r, times, act, aim) => {
        setBusy(`all-${r.id}`);
        const d = await post({ action: "craftAll", recipe: r.id, temper: tempering === r.id, times, act, aim });
        setBusy(null);
        if (!d?.ok) {
            setNote(d?.error === "not_enough_parts" ? "Not enough parts for that."
                : d?.error === "not_repeatable" ? "That one is made once."
                : "That did not work.");
            return d || { ok: false };
        }
        // ⚠️ WHAT ACTUALLY LANDED, read off the server's totals. `makes` is the summed batch including every
        // band's bonus, so a run of good rolls reads as the bigger number it really was.
        const what = d.makes ? `${d.makes} × ${d.name}` : `${d.count} × ${d.name}`;
        const short = d.stopped === "not_enough_parts" && d.count < d.asked
            ? ` — parts ran out after ${d.count}` : "";
        setNote(`Made ${what}${short}.${d.levelled ? " Crafting levelled up." : ""}`);
        if (d.firstCraft) setNote(`Made ${what}. A Mossbound Cache went to your chests.`);
        await refresh();
        return { ...d, batched: times };
    };

    /** Called when the act closes — with the finished craft, or with an error it could not complete. */
    const finishCraft = async (d) => {
        const r = acting?.recipe;
        setActing(null);
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
        // ⚠️ CLEARED ON SUCCESS, so a tempered craft does not quietly temper the next one. The cost is
        // real and silently repeating it is the kind of charge a player only notices in the bag.
        setTempering(null);
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
            {/* ── ⚠️ THE BENCH OPENS ON THINGS YOU CAN MAKE ──────────────────────────────────────
                Luke showed this to his seven-year-old, who said it looked way too complicated, and he
                agreed: "The entire viewport is not actively crafting controls."

                Measured on a 390x920 phone, he was being generous. This header was 294px tall — a level
                tile, a sentence, an xp bar, FIVE odds tiles and a history expander — and the first
                recipe you could actually press started at y=472. Fifty-one percent of the screen was
                statistics before a single Craft button.

                It is one strip now: the level, a thin bar, the merits. The odds table went with it,
                because the craft act already shows the odds LIVE and per-aim — a static copy of the
                same numbers on the screen before it was the less useful of the two, printed in the
                place where it cost the most room. Both it and the history are one tap away under
                "Details" for anyone who wants them. */}
            <header className="gv-level">
                <span className="gv-level-no"><i>Lv</i><b>{lvl.level}</b></span>
                <span className="gv-level-bar">
                    <i style={{ width: `${Math.round((lvl.progress || 0) * 100)}%` }} />
                </span>
                {merits > 0 ? (
                    <span className="gv-merits" title="Won from bosses — spent on boss armour, under Emblems">
                        <GiLaurelCrown aria-hidden="true" focusable="false" />
                        <b>{merits}</b>
                    </span>
                ) : null}
                {odds.length || recent.length ? (
                    <details className="gv-level-more">
                        <summary aria-label="Crafting odds and recent crafts">Details</summary>
                        <div>
                            {odds.length ? (
                                <ul className="gv-odds">
                                    {odds.map((b) => (
                                        <li key={b.id} className={`is-${b.id}`} style={{ "--band": bandTint(b.id) }}>
                                            <b>{Math.round(b.share * 100)}%</b>
                                            <span>{b.name}</span>
                                            <em>×{b.mult.toFixed(2)}</em>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                            {recent.length ? (
                                <ul className="gv-recall-list">
                                    {recent.map((c, i) => (
                                        <li key={`${c.recipe}-${i}`}>
                                            <span>{recipeName(c.recipe)}</span>
                                            {c.band ? (
                                                <em className={`is-${c.band}`} style={{ "--band": bandTint(c.band) }}>
                                                    {bandName(c.band)}
                                                </em>
                                            ) : null}
                                            <b>+{c.xp}</b>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
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
                {rows.map(({ r, built, made, costs, missing, haveParts, ready }) => {
                    const Icon = (r.kind === "tool" && SLOT_ICON[r.slot]) || KIND_ICON[r.kind] || GiStoneCrafting;
                    // A tool recipe shows the rung it would make, not a generic slot icon — the whole point
                    // of drawing twelve of each was that tier VII is a different object, and a workbench that
                    // shows the same picture for all twelve hides exactly that.
                    const art = r.kind === "tool" ? toolArt(r.slot, r.tier) : recipeArt(r);
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
                    // ── WHAT TEMPERING THIS ROW WOULD COST AND BUY ───────────────────────────────
                    // ⚠️ OFFERED ONLY WHERE THERE IS A ROLL TO IMPROVE — so not on a row already built,
                    // and not on a rework (which is its own re-roll and is priced separately). Showing
                    // it on a finished vault would be a button that spends parts on nothing.
                    const canTemper = !built && !canRework;
                    // ⚠️ RECOMPUTED AGAINST THIS ROW'S TOGGLE rather than taken from the row's own `times`,
                    // which is the untempered count. Tempering adds parts, so turning it on must shrink the
                    // batch the button offers -- otherwise it offers ten and the seventh runs out.
                    const batch = craftableTimes(r, st.pack || {}, { temper: tempering === r.id });
                    // What this row would put on the wishlist, and whether it is all there already.
                    // ⚠️ SHORT PARTS ONLY. Wishing the ones you already hold would light creatures you have
                    // no reason to walk to, which is the wishlist telling you something false.
                    const shortParts = costs.filter((c) => c.short > 0).map((c) => c.part);
                    const allWished = shortParts.length > 0 && shortParts.every((pt) => wish.includes(pt));
                    const hold = holdingOf(r, st);
                    const temperOn = tempering === r.id;
                    const tmpCost = canTemper ? temperCost(r) : null;
                    const temperExtra = tmpCost ? Object.values(tmpCost).reduce((a, b) => a + b, 0) : 0;
                    return (
                        // ⚠️ A REAL id, NOT ONLY A key. React keys are not in the DOM, so a row
                        // nothing can address is a row nothing can scroll to — the same defect
                        // GroveArea had, where `id` became a className and the craft card's "Show
                        // me where it went" silently found nothing. The part sheet lands here.
                        <li key={r.id} id={`gv-rec-${r.id}`} className={`gv-rec${ready ? " is-ready" : ""}${built ? " is-built" : ""}${made && !built ? " is-made" : ""}`}>
                            {/* ⚠️ THE THREE COLUMNS LIVE IN THEIR OWN ROW. The temper strip used to be a
                                fourth child of this grid spanning 1 / -1, and a spanning item's
                                min-content is distributed into the tracks it crosses: measured live, the
                                auto column took 214px of it and the body column collapsed to EXACTLY 0px,
                                so every word of the recipe wrapped onto its own line. Wrapped like this
                                the strip is a sibling of the grid rather than a member of it, and cannot
                                size anything. */}
                            <div className="gv-rec-main">
                            {/* ⚠️ A SPRITE OR NOTHING. The glyph fallback is gone — a line pictogram beside
                                a painted poultice does not read as the same game, and every kind has art
                                now. An empty frame is a smaller fault than the wrong kind of picture. */}
                            <div className="gv-rec-face">
                                {art ? <img src={art} alt="" width={44} height={44} loading="lazy" /> : null}
                            </div>

                            <div className="gv-rec-body">
                                <div className="gv-rec-top">
                                    <b>{r.name}</b>
                                    {/* ── ⚠️ "YOU HAVE ONE OF THESE" IS NOT "YOU CANNOT MAKE ANOTHER" ──
                                        Luke: "if you already have a harvesting hoe, then you ... can make
                                        another one because it's random rolls, but we should definitely
                                        know that we already have one."

                                        `built` is the hard stop — a pack, a bank, a plot, a tool at that
                                        tier — and those rows already say so by going grey. This is the
                                        soft case the bench had no word for: finished before, freely
                                        repeatable, and worth re-rolling for a better band. Without it the
                                        only difference between a recipe you have never seen and one you
                                        have made nine times was nothing at all. */}
                                    {made && !built ? <em className="gv-tag is-made">made</em> : null}
                                    {/* Sits BEFORE the status tag, so the row reads "Moss Poultice ×35,
                                        Ready" — what you have, then what you could do about it. */}
                                    {hold ? (
                                        <em className={`gv-tag is-hold${hold.band ? ` is-${hold.band}` : ""}`}
                                            style={hold.band ? { "--band": bandTint(hold.band) } : undefined}
                                            title={hold.band
                                                ? `You already hold ${hold.n}; the best of them is ${bandName(hold.band)}`
                                                : `You already hold ${hold.n}`}>
                                            ×{hold.n}{hold.band ? ` ${bandName(hold.band)}` : ""}
                                        </em>
                                    ) : null}
                                    {built && r.kind === "tool" && st.toolQuality?.[r.slot] != null ? (
                                        // The thing the level BUYS, on the thing it was spent on.
                                        <em className={`gv-tag is-q is-${qualityBand(st.toolQuality[r.slot]).id}`}
                                            style={{ "--band": bandTint(qualityBand(st.toolQuality[r.slot]).id) }}>
                                            {qualityBand(st.toolQuality[r.slot]).name}
                                        </em>
                                    ) : built ? <em className="gv-tag is-done">Built</em>
                                        : ready ? <em className="gv-tag is-go">Ready</em>
                                            : <em className="gv-tag">{haveParts}/{costs.length} parts</em>}
                                    {/* ── ⚠️ THE RECIPE PUTS ITS OWN PARTS ON THE LIST ───────────────
                                        The chips below are already the wishlist control, and they are the
                                        right one when you are looking at a PART. They are the wrong one
                                        when you have looked at a recipe and decided to go and get it:
                                        that was three taps on three chips, and nothing anywhere said
                                        "this is the thing I am working on".

                                        ⚠️ AND IT IS THE WHOLE POINT OF THE WISHLIST, WHICH NOBODY REACHES.
                                        Wishing a part lights it over the creatures that drop it and pins
                                        the maps that hold it -- the one mechanism that already connects
                                        crafting to the zone where the session actually happens. It was
                                        reachable only by tapping individual ingredients on a bench you
                                        had to decide to open first, which is the wrong way round: the
                                        feature that would make you want the workbench was hidden inside
                                        the workbench.

                                        Only on rows with something still to find -- on a Ready or a Built
                                        row it would be a button that wishes nothing. */}
                                    {!built && !ready && shortParts.length ? (
                                        <button type="button"
                                            className={`gv-rec-want${allWished ? " is-on" : ""}`}
                                            aria-pressed={allWished}
                                            title={allWished
                                                ? "On your list - tap to take these off it"
                                                : "Put what this still needs on your list, so it lights up over the creatures that drop it"}
                                            onClick={() => want(shortParts)}>
                                            {allWished ? "Listed" : "Find"}
                                        </button>
                                    ) : null}
                                </div>
                                {/* ⚠️ WHAT IT DOES, IN NUMBERS, ON ONE LINE. The blurb used to sit under this
                                    and it cost two more lines on every one of 129 rows — Luke: "cards are
                                    too big and verbose". Flavour is worth having where a player has
                                    stopped to look at one thing; in a list it is what stops them finding
                                    anything. It still shows on the craft act and the result card. */}
                                <p className="gv-rec-pay">{payoff(r, st, built)}</p>

                                <ul className="gv-cost">
                                    {costs.map((c) => {
                                        // ⚠️ THE COST SHOWN IS THE COST CHARGED. With tempering armed the
                                        // row has to count the surcharge too, or the card says twelve and
                                        // the bag loses seventeen — the exact unaccountability this screen
                                        // was rebuilt to remove.
                                        const need = c.need + (temperOn ? (tmpCost?.[c.part] || 0) : 0);
                                        const short = Math.max(0, need - c.have);
                                        return (
                                            // ⚠️ THE NAME IS A TITLE, NOT A LINE. One chip per row meant a
                                            // three-part recipe was three lines of text; the sprite says
                                            // which part it is and the tooltip says it in words for anyone
                                            // who does not know the picture yet.
                                            // ⚠️ THE CHIP IS THE WISHLIST CONTROL, because it is already
                                            // the thing a player is looking at when they want one. Luke:
                                            // "You should be able to tap ingredients to add to wish list
                                            // ... and you can tap to remove similar to how yoi add." A
                                            // separate add-to-wishlist button beside it would be a second
                                            // control doing one job, on 129 rows.
                                            <li key={c.part} className={short ? "is-short" : "is-have"}>
                                                <button type="button"
                                                    className={wish.includes(c.part) ? "is-wished" : undefined}
                                                    aria-pressed={wish.includes(c.part)}
                                                    onClick={() => toggle(c.part)}
                                                    title={`${partName(c.part)} — ${c.have} of ${need}`
                                                        + (wish.includes(c.part) ? " · on your list, tap to remove"
                                                            : " · tap to find it")}>
                                                    <PartIcon id={c.part} size={17} />
                                                    <span className="gv-cost-n">{Math.min(c.have, need)}/{need}</span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                            </div>

                            {/* ── ⚠️ ONE ACTION BAR, ACROSS THE BOTTOM ───────────────────────────
                                Luke: "i hate the craft item rows and buttons."

                                These controls used to be a THIRD COLUMN of the card's grid, which cost
                                twice. It squeezed the body into about 250px, so the recipe's own name,
                                its tags and its part chips all wrapped against a wall while a tall thin
                                column of buttons sat beside them half empty; and because the grid was
                                centred, the Craft button floated at a different height on every row, so
                                scanning a list of them was scanning a staircase.

                                Everything you can DO to a recipe is on one line now, in the same place
                                on every card. The card above it is what the thing is; this is what you
                                can do about it. */}
                            <div className="gv-rec-bar">
                            {/* ⚠️ IT HAS TO SAY THE BARGAIN, NOT NAME IT. What stood here was a grey box
                                labelled TEMPER beside "34% → 44%  Fine+ · +4 parts", and Luke read it
                                cold and asked "Wtf is temper and plus q1 parts". Every piece of that was
                                jargon: a forge word for a noun, two percentages with no subject, a
                                spreadsheet `+` suffix, and a part count that never says which parts.

                                The bargain in English is: pay a share of the recipe again, before you
                                roll, and the roll bends upward. So the control says that — and the
                                numbers it is ASKED to justify only appear once it is armed, because
                                arming it is free and watching the odds move is a better explanation
                                than a sentence about them (teach-by-showing-not-telling). The part
                                chips above already restate their own cost with the surcharge in it, so
                                "which parts" is answered where the parts are. */}
                            {canTemper ? (
                                <button type="button"
                                    className={`gv-temper${temperOn ? " is-on" : ""}`}
                                    aria-pressed={temperOn}
                                    onClick={() => setTempering(temperOn ? null : r.id)}>
                                    <span className="gv-temper-box" aria-hidden="true" />
                                    <span className="gv-temper-say">
                                        {temperOn ? (
                                            <>Spending <b>{temperExtra} more parts</b> — {topBandName}{" "}
                                                <b>{Math.round(topOddsT * 100)}%</b>,
                                                was {Math.round(topOdds * 100)}%</>
                                        ) : (
                                            <>Spend <b>{temperExtra} more parts</b> for a better roll</>
                                        )}
                                    </span>
                                </button>
                            ) : null}

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
                                /* ⚠️ A FRAGMENT IS CORRECT *NOW*, AND WAS NOT BEFORE. While these
                                   lived in the third column of gv-rec-main, a fragment made the two
                                   buttons grid items four and five and the second wrapped under the
                                   artwork -- so they were given a wrapper box. The bar is a flex row
                                   that WANTS them as siblings, and keeping the wrapper would nest a
                                   second layout box inside it for nothing. */
                                <>
                                <button type="button" className="gv-rec-go"
                                    disabled={!ready || busy === r.id}
                                    onClick={() => craft(r)}>
                                    {busy === r.id ? "…" : built ? "Built" : ready ? "Craft" : `${missing} short`}
                                </button>
                                {/* ── ⚠️ ONLY WHERE THERE IS A SECOND ONE TO MAKE ─────────────────
                                    Shown on a repeatable recipe you can afford at least TWICE —
                                    offering "Craft all ×1" next to Craft is two buttons for one
                                    action, and offering it on a backpack is a button for a thing
                                    that cannot happen. `repeatable` is the shared rule, not a list
                                    of kinds restated here; see ONE_OFF_KINDS.

                                    ⚠️ IT NO LONGER SKIPS THE ACT. It used to say so in its own
                                    tooltip -- "without playing the hammer work, base odds on every
                                    one" -- which made never playing the minigame the fastest way to
                                    make anything. Luke: "it should always do the minigame." One
                                    performance now forges the whole batch. */}
                                {ready && batch >= 2 ? (() => {
                                    // Clamped against the LIVE max on every render, so spending parts
                                    // elsewhere can never leave this asking for more than the bag holds.
                                    const n = Math.max(2, Math.min(batch, Number(qty[r.id]) || batch));
                                    const set = (v) => setQty((q) => ({ ...q, [r.id]: Math.max(2, Math.min(batch, v)) }));
                                    return (
                                        <div className="gv-rec-qty">
                                            <button type="button" aria-label={`Fewer — make ${Math.max(2, n - 1)}`}
                                                disabled={n <= 2 || busy === `all-${r.id}`}
                                                onClick={() => set(n - 1)}>&minus;</button>
                                            <button type="button" className="gv-rec-all"
                                                disabled={busy === `all-${r.id}`}
                                                title={`Play the hammer work once and make ${n} against it`}
                                                onClick={() => craftAll(r, n)}>
                                                {busy === `all-${r.id}` ? "…" : `Make ${n}`}
                                            </button>
                                            <button type="button" aria-label={`More — make ${Math.min(batch, n + 1)}`}
                                                disabled={n >= batch || busy === `all-${r.id}`}
                                                onClick={() => set(n + 1)}>+</button>
                                            {/* The ceiling, said once, where the decision is made. A
                                                stepper with no top is a stepper you have to probe. */}
                                            <em>of {batch}</em>
                                        </div>
                                    );
                                })() : null}
                                </>
                            )}
                            </div>
                            {/* ── ⚠️ THE ONE DECISION A CRAFT HAS EVER OFFERED ───────────────────
                                Luke: crafting lacked "engagement" — and pressing Craft took no input
                                at all. The parts were fixed and the roll was the game's, so the
                                player's whole contribution was picking a row.

                                ⚠️ IT SHOWS THE ODDS IT BUYS, BOTH WAYS, BEFORE THE SPEND. "Better
                                chance" with no number is a thing you are asked to believe; two
                                percentages are a decision. Both come from the server's own curve
                                (st.craft.odds / oddsTempered), so what is printed here is exactly
                                what the roll will be run against. */}
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

            {/* ── ⚠️ THE ACT, PORTALLED LIKE EVERY OTHER FULL-SCREEN LAYER HERE ──────────────────────
                Into the SAME host the result card uses. The Grove runs in native full screen, where
                document.body is the wrong parent and a layer rendered into the page tree paints under
                the scene no matter what its z-index says. */}
            {acting && host ? createPortal((
                <GroveCraftAct
                    recipe={acting.recipe}
                    level={lvl.level}
                    temper={acting.temper}
                    onCommit={commitCraft}
                    onClose={finishCraft}
                />
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
                        <p className="gv-made-pay">{payoff(result.recipe, st, true, result)}</p>

                        {/* ── ⚠️ WHERE IT WENT, AS A DOOR RATHER THAN A SENTENCE ─────────────────────
                            Luke: "we also need the ability to go see where to go look at the item,
                            because people have no idea where to go after they craft it. Like, it's just
                            completely like disappeared."

                            A tool, a food and a charm land in three different Areas of the bag panel,
                            and nothing on this card ever said which. Printing "it is in your Tools"
                            would be the lazy half; this takes them there and flashes the shelf on
                            arrival. Decorations and plots are deliberately absent -- those leave the
                            Grove for the Farm, and a button that navigated out of the feature mid-craft
                            would be a worse answer than none. */}
                        {MADE_HOME[result.kind] && onGoTo ? (
                            <button type="button" className="gv-made-goto"
                                onClick={() => { setResult(null); onGoTo("bag", MADE_HOME[result.kind]); }}>
                                Show me where it went
                            </button>
                        ) : null}

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
                                    <span className={`gv-made-q is-${result.qualityBand}`} style={{ "--band": bandTint(result.qualityBand) }}>
                                        Rolled {bandName(result.qualityBand)} · {result.quality}/100
                                        {result.tempered ? <i className="gv-made-tmp">tempered</i> : null}
                                    </span>
                                ) : null}
                                {/* ── ⚠️ WHAT THE BAND ACTUALLY BOUGHT, IN THE THING THE PLAYER MADE ──
                                    A word and a score out of a hundred is a number about the roll, not
                                    about the object: "Rolled Fine · 81/100" over a batch of poultices
                                    says nothing about how many poultices. This is the line that closes
                                    that — and it is absent at Rough rather than printing "+0", because a
                                    bad roll should read as a bad roll and not as a reward of nothing. */}
                                {craftBonusLabel(result.recipe, result.quality) ? (
                                    <span className={`gv-made-bonus is-${result.qualityBand}`} style={{ "--band": bandTint(result.qualityBand) }}>
                                        {craftBonusLabel(result.recipe, result.quality)}
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
