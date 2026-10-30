"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GroveAtlas from "@/components/grove/GroveAtlas";
import { TOWNS } from "@/lib/marketplace/towns.js";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
    GiAnvil, GiBroom, GiBugleCall, GiButterflyKnife, GiCompass, GiCutDiamond, GiDigHole, GiFarmTractor, GiFishingPole, GiFlagObjective, GiLaurelCrown, GiMineWagon, GiOldLantern, GiPawPrint, GiStoneCrafting,
} from "react-icons/gi";

import GroveScene from "@/components/grove/GroveScene.js";
import {
    GROVE_PARTS, GROVE_EMBLEMS, GROVE_FOODS, GROVE_ZONES, starLadder, emblemStars, emblemArt, emblemFace, groveArt, toolArt, zoneHasParts,
} from "@/lib/marketplace/grove-catalog.js";
// ── THE ORDER OF THE SHELF ────────────────────────────────────────────────────────────────────────
// Catalog order, which is the order you meet the creatures: map one's thirteen, then one per map going
// deeper. ⚠️ NOT sorted by what you own -- a shelf that reshuffles as you collect destroys the one thing
// a collection screen is for, which is knowing where a given card LIVES and seeing its hole.
// ── ⚠️ AND IT IS SECTIONED NOW, BECAUSE IT IS 103 CARDS ─────────────────────────────────────────
// It was nineteen in one grid, which is fine. Giving every boss its own card added eighty-four more, and a
// hundred-odd silhouettes in one undifferentiated run is not a collection, it is a wall -- you cannot tell
// where the thing you are hunting lives, and the map-one shelf you have nearly finished is buried under six
// maps you have not started.
//
// Split by where the card comes from and then by map, which is the order you meet them. The wanderers stay
// first: they are the cards that drop while you play, and the boss shelf is the deliberate chase.
const CARD_SHELVES = (() => {
    const all = Object.entries(GROVE_EMBLEMS);
    const wander = all.filter(([, e]) => !e.boss).map(([id]) => id);
    const byMap = new Map();
    for (const [id, e] of all) {
        if (!e.boss) continue;
        const m = Number(e.map) || 1;
        if (!byMap.has(m)) byMap.set(m, []);
        byMap.get(m).push(id);
    }
    return [
        { title: "Wanderers", ids: wander },
        ...[...byMap.keys()].sort((a, b) => a - b).map((m) => ({
            title: `Bosses · Map ${m}`, ids: byMap.get(m),
        })),
    ];
})();
const CARD_ORDER = CARD_SHELVES.flatMap((sh) => sh.ids);

import { useWishlist } from "@/components/grove/useWishlist.js";
import GroveMenu from "@/components/grove/GroveMenu.js";
import GroveBench from "@/components/grove/GroveBench";
import { readyCount } from "@/lib/marketplace/grove-recipes.js";
import Area from "@/components/grove/GroveArea.js";
import GroveArmoury from "@/components/grove/GroveArmoury.js";
import GroveGear from "@/components/grove/GroveGear.js";
import GroveQuests from "@/components/grove/GroveQuests";
import { useColiseum } from "@/components/grove/useColiseum";
import { GROVE_CHESTS, CHARM_STAT_LABEL, QUALITY_BANDS, bandTint } from "@/lib/marketplace/grove-forge.js";
import {
    GROVE_RECIPES, recipeById, canCraft, newlyReady, TOOL_SLOTS, toolBonusPct, TOOL_TIER_CAP, toolNumeral,
} from "@/lib/marketplace/grove-recipes.js";
import { GROVE_CSS } from "@/components/grove/grove-css.js";
import { MAP_LAYOUT, nodeArt, spotForDepth, trailForZones, trailPath } from "@/lib/marketplace/grove-map.js";
import { celebrateUnlock } from "@/components/grove/grove-sfx.js";
import { CLASSES } from "@/lib/marketplace/arena-classes.js";

// ── THE GROVE ────────────────────────────────────────────────────────────────────────────────────────────────
// Map, zone, bag, bank, workbench and emblems. The scene itself is GroveScene; this is everything around it.
//
// ⚠️ ONE FETCH ON MOUNT AND ONE PER ACTION. No polling. This screen has no other players on it and nothing
// changes behind your back, so a timer here would be pure Active CPU for nothing — the exact shape
// check:polls exists to catch.

const post = (body) => fetch("/api/marketplace/grove", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}).then((r) => r.json()).catch(() => ({ ok: false }));

const partName = (id) => GROVE_PARTS[id]?.name || id;

// ── HOW A GROVE STAT READS ──────────────────────────────────────────────────────────────────────────────────
// ⚠️ THE ORDER IS THE READING ORDER, not alphabetical: what you hit for, then how often it lands big, then
// speed, then the things that keep you alive. A player scanning this wants the headline first.
//
// ⚠️ AND THE UNITS ARE NOT UNIFORM, WHICH IS WHY EACH ONE CARRIES ITS OWN FORMATTER. critChance is a SHARE
// (0.17 is 17%), tempo is a MULTIPLE of the bare swing rate, haste and armour are raw POINTS fed through
// curves at the swing. Printing all of them one way is how a 0.06 becomes "+0.06 crit chance".
//
// ⚠️ ONE pct, NOT A SECOND IDENTICAL `mult`. A share and a multiplier delta mean different things and
// render identically, and the first cut gave them a function each -- two names for one operation, which
// is the thing that drifts the day somebody edits only the one they are looking at.
const pct = (v) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1).replace(/\.0$/, "")}%`;
const pts = (v) => `${v > 0 ? "+" : ""}${Math.round(v)}`;
const GROVE_STAT_READOUT = {
    damage: { label: "Damage a swing", fmt: pts },
    dmgPct: { label: "All damage", fmt: pct },
    might: { label: "Might", fmt: pts },
    critChance: { label: "Crit chance", fmt: pct },
    critMult: { label: "Crit damage", fmt: pct },
    tempo: { label: "Attack speed", fmt: pct },
    haste: { label: "Haste", fmt: pts },
    bleedChance: { label: "Bleed chance", fmt: pct },
    bleedDamage: { label: "Bleed damage", fmt: pct },
    bleedLeech: { label: "Bleed leech", fmt: pts },
    lifesteal: { label: "Lifesteal", fmt: pts },
    stun: { label: "Stun", fmt: pts },
    armor: { label: "Armour", fmt: pts },
    health: { label: "Health", fmt: pts },
};

// ── ⚠️ THE MAIN SCREEN IS THE MAP, AND EVERYTHING ELSE FLOATS ────────────────────────────────────────────────
// Luke: "The main screen for the grove. It should only have a map. The backpack and other stuff should be
// sprite buttons floating on top of content at the bottom right of the screen, and the entire grove feature
// is full screen."
//
// The tab row this replaces was four words in a scrolling strip above the map, which cost a line of a phone
// to say what four objects say without one. Bottom-right because that is where a right thumb already is, and
// because the zone's own full-screen lock already clears that corner of the site's chat bubbles — see
// gv-full-lock in grove-css.js, which exists because a thumb reaching into that corner was opening a chat
// panel instead of hitting things.
// ⚠️ THE SAME FAMILIES AS THE ZONE'S, so a player learns one menu rather than two arrangements of the
// same six doors. ZONE_FAMILIES in GroveScene.js carries the identical grouping minus Quests, which has
// no meaning while you are standing inside a zone.
const FAMILIES = [
    {
        title: "Go", rows: [
            { k: "map", label: "Map", art: "/images/grove/ui-map.webp", note: "choose a zone" },
            // ⚠️ THE TRACKER NEEDS A DOOR OR IT IS NOT SHIPPED. ui-board.webp was drawn long ago and never
            // used by anything — the quest helper is what it was for. Three givers hidden across twelve
            // zones is a good surprise once and a search forever after, so the panel that names the zone
            // has to be one tap away.
            { k: "quests", label: "Quests", art: "/images/grove/ui-board.webp", note: "who wants what" },
        ],
    },
    {
        title: "Carry", rows: [
            { k: "bag", label: "Backpack", art: "/images/grove/ui-bag.webp" },
            { k: "gear", label: "Gear", art: "/images/grove/ui-gear.webp", note: "what you are wearing" },
            { k: "emblems", label: "Monster Cards", art: "/images/grove/ui-emblems.webp" },
        ],
    },
    {
        title: "Make", rows: [
            { k: "bench", label: "Workbench", art: "/images/grove/ui-bench.webp", note: "spend parts" },
        ],
    },
];


// ── ⚠️ THE PARTS HAVE PICTURES AND THESE LISTS WERE NOT USING THEM ───────────────────────────────────────────
// Thirty-three painted items shipped for the floor of the zone, where a drop is on screen for a couple of
// seconds. The bag, the bank and the workbench — where a player spends far longer, deciding what to keep and
// what a recipe still needs — were rows of names. Reading "Gnawed Root, Damp Moss, Grub Fat" is work; seeing
// three objects is not, and it is the same art either way.
//
// Sized by role rather than one shared number: a slot is something you pick out of a grid at arm's length, a
// recipe cost is read inside a sentence. fail-silent on purpose — a part added later with no sprite yet gets
// its name and nothing else, which is a smaller fault than a broken-image glyph.
// The unfilled half of a bag. Keyed by index and inert: an empty slot is a hole in a grid, not a control.
// Same map the workbench uses for the same six slots. Kept beside it rather than imported because
// GroveBench owns a recipe-shaped version of it; if a seventh tool ever lands, both want editing.
const TOOL_GLYPH = {
    rod: GiFishingPole, pick: GiMineWagon, shovel: GiDigHole,
    hammer: GiAnvil, hoe: GiFarmTractor, sextant: GiCompass,
    // The six that feed the systems the Grove used to ignore.
    knife: GiButterflyKnife, collar: GiPawPrint, lantern: GiOldLantern,
    loupe: GiCutDiamond, banner: GiFlagObjective, horn: GiBugleCall,
};

// The band's own word, from the band table rather than a second copy of the five names.
const bandWord = (id) => QUALITY_BANDS.find((b) => b.id === id)?.name || "";

const emptyCells = (slots, held) => Array.from(
    { length: Math.max(0, (Number(slots) || 0) - held) },
    (_, i) => <span key={`e${i}`} className="gv-cell is-empty" aria-hidden="true" />,
);

const PartIcon = ({ id, size = 34 }) => {
    const art = groveArt(id);
    if (!art) return null;
    return <img className="gv-ico" src={art} alt="" width={size} height={size} />;
};

export default function GroveClient({ initial }) {
    // Which map the paper is showing. ⚠️ UP HERE WITH THE OTHER HOOKS, not beside the code that uses
    // it: that sits after the "not signed in" early return, and a hook called conditionally changes
    // the hook ORDER between renders, which React treats as a different component.
    const [paperMap, setPaperMap] = useState(null);
    // The shopping list, shared with the bench and the zone. Client-only — see useWishlist.
    const { wish, toggle: toggleWish, clear: clearWish } = useWishlist();
    const [st, setSt] = useState(initial);
    const [view, setView] = useState("map");     // map | zone | bag | bench | emblems
    // ⚠️ THE SAME BODY CLASS THE ZONE ALREADY USES, not a second mechanism. It stops the page behind
    // scrolling and hides the site's own fixed chat bubbles, which sit in exactly the corner the dock now
    // occupies. Added for the WHOLE feature rather than only the zone, because the whole feature is full
    // screen now — and removed on unmount, or leaving the Grove leaves the site with no chat.
    useEffect(() => {
        document.body.classList.add("gv-full-lock");
        return () => document.body.classList.remove("gv-full-lock");
    }, []);
    const [session, setSession] = useState(null);
    const [note, setNote] = useState(null);
    const [unlockedNow, setUnlockedNow] = useState(null);
    const [bossWon, setBossWon] = useState(null);
    // The charm armed for the next dive, or null. ⚠️ NOT PERSISTED AND DELIBERATELY SO — arming is a
    // choice about the run you are about to take, and a choice that survived a reload would be spent on
    // a dive the player had forgotten they armed it for.
    const [charmPick, setCharmPick] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    // Which half of the emblems panel is showing: the shelf of monster cards, or the merit till.
    // See the note where the tabs are rendered for why these stopped sharing one scroll.
    const [embTab, setEmbTab] = useState("cards");
    // Which panel is open OVER the zone, or null for none. Separate from `view`, which stays "zone" the
    // whole time you are in one — see the hoist note above the panels.
    const [zonePanel, setZonePanel] = useState(null);
    // ⚠️ THE SHEET IS PORTALLED, AND A z-index WAS NOT ENOUGH. GroveScene portals its full-screen layer to
    // document.body; the sheet was rendered inside the page tree, where ANY ancestor with a transform,
    // a filter or an opacity makes a stacking context and turns its z-index into a local number. It then
    // paints under the zone however high you set it — the panel was there, the zone was paused, and the
    // close button could not be pressed, so the only way out was a reload. elementFromPoint over that
    // button is what said so; the z-index looked right in the stylesheet the whole time.
    //
    // Portalled to body it is a sibling of the scene, which is the only place the 70-vs-80 comparison the
    // stylesheet is written around actually holds.
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // ── ⚠️ AND IN NATIVE FULL SCREEN, document.body IS THE WRONG PARENT ─────────────────────────
    // Luke: "when I click the buttons on the bottom when I'm running around in the grove, it doesn't
    // open up the interface as I'd expect it to. Even if you're full screen, it should pop up the
    // interface that you can craft and look at your backpack and look at the map."
    //
    // The note above is right that the sheet has to escape the page tree -- but it escaped one level
    // too far. GroveScene calls requestFullscreen on its own host, and a browser in native full screen
    // paints ONLY that element's subtree. The sheet, portalled to body, is its SIBLING: present in the
    // DOM, correct in the stylesheet, and never drawn. Nothing errors and nothing is logged; the button
    // simply does nothing, which is exactly what was reported.
    //
    // So the portal follows the full-screen element when there is one and falls back to body when there
    // is not. Tracked as state rather than read at render time because entering full screen does not
    // re-render this component on its own -- the value would be read once, while still null, and stay
    // wrong for the whole session.
    const [fsHost, setFsHost] = useState(null);
    useEffect(() => {
        const onChange = () => setFsHost(document.fullscreenElement || null);
        onChange();
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);
    const router = useRouter();
    const stripRef = useRef(null);

    // ⚠️ IT RETURNS THE STATE IT FETCHED, AND THAT IS NOT A CONVENIENCE. setSt is asynchronous, so a
    // caller that awaits refresh() and then reads `st` reads the bag from BEFORE the settle it just made.
    // Anything comparing the two sides of a change -- which recipe became craftable, which part arrived --
    // has to be handed the new one. See newlyReady.
    const refresh = useCallback(async () => {
        const d = await fetch("/api/marketplace/grove").then((r) => r.json()).catch(() => null);
        if (d?.ok) setSt(d);
        return d?.ok ? d : null;
    }, []);

    // ── THE COLISEUM RUN ────────────────────────────────────────────────────────────────────────────
    // ⚠️ UP HERE WITH THE OTHER HOOKS, like paperMap above and for the same reason: everything below is
    // past an early return, and a hook called conditionally changes the hook ORDER between renders.
    //
    // ⚠️ AND IT CRASHED THE GROVE BY BEING MISSING. The patch that was meant to add this line silently
    // matched nothing, and I "verified" it by checking the file contained the string useColiseum — which
    // it did, because the IMPORT had landed. Every use of `col` below then referenced an undefined
    // binding: "col is not defined", on the live Grove, for a real member. Checking that a name appears
    // is not checking that it is DEFINED; the build cannot catch it and neither did I.
    const col = useColiseum({ onChanged: refresh });

    // ── ENTER A ZONE ────────────────────────────────────────────────────────────────────────────────
    const enter = useCallback(async (zone) => {
        // ⚠️ THE CHARM GOES WITH THE ENTER, so choosing one and burning it are a single request. The
        // server returns what it actually took — a charm already spent in another tab comes back null —
        // and the pick is cleared either way, because an armed charm that survived the dive would be
        // spent again on the next one without the player choosing to.
        const d = await post({ action: "enter", zone: zone.id, charm: charmPick || undefined });
        if (!d?.ok) { setNote(d?.error === "locked" ? "That one is still closed." : "Couldn't go in."); return; }
        setCharmPick(null);
        // ⚠️ FOLDED INTO st, BECAUSE st IS OLDER THAN THE DOOR. The server arms an empty belt on entry
        // (armBeltIfEmpty) and this state was fetched before any of that happened, so without this line
        // the scene dives with belt=null and the HUD offers to go and find some food the player is in
        // fact already carrying. Merged rather than refetched: one request already answered this.
        if (d.belt) setSt((prev) => (prev && prev.belt !== d.belt ? { ...prev, belt: d.belt } : prev));
        if (d.charm) setNote(`${d.charm.name} burning — ${CHARM_STAT_LABEL[d.charm.stat] || "bonus"} +${d.charm.value}%`);
        setSession({ zone: d.zone, seed: d.seed, bonuses: d.bonuses, charm: d.charm || null });
        // ⚠️ AND THE LAST ZONE'S CARDS GO WITH IT. Both of these are click-to-dismiss overlays owned by
        // this component, which does not unmount between zones — so a boss kill card or an unlock pop left
        // standing was still standing in the next place. Cleared HERE rather than in the door handler
        // because the map panel enters a zone too (see the note below travel): a reset that lives on one
        // of the two ways in is a reset that is missing from the other.
        setBossWon(null);
        setUnlockedNow(null);
        // ⚠️ AND THE SHEET COMES DOWN WITH IT. The map is one of the panels openable from inside a zone,
        // so tapping a place on it is now a way to travel WITHOUT leaving — and leaving the panel up over
        // the zone you just walked into means arriving somewhere new behind a backpack.
        setZonePanel(null);
        setView("zone");
    }, [charmPick]);

    // ── THE DOORS ───────────────────────────────────────────────────────────────────────────────────
    // ⚠️ RESOLVED FROM THE CATALOGUE, NOT FROM st. A door is walked through immediately after a settle that
    // may have just unlocked the destination, and st is a snapshot taken before it. Reading the zone id from
    // the static list keeps this correct regardless of how stale the state is, and the server is the thing
    // that decides whether the door opens — enter() already reports "locked".
    const travel = useCallback(async (n) => {
        const z = GROVE_ZONES.find((x) => x.n === n);
        if (z) await enter(z);
    }, [enter]);

    // ── SETTLE ──────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ THE ONLY THING SENT IS WHAT WAS KILLED. The scene already rolled the loot locally to show it; the
    // server re-rolls from the same seed and grants what IT computes. See grove-roll.js.
    const settle = useCallback(async (kills, eaten) => {
        if (!kills?.length || !session) return;
        const before = st;
        const d = await post({ action: "settle", zone: session.zone.id, kills, eaten: eaten || {} });
        if (!d?.ok) return;
        const after = await refresh();
        // ── ⚠️ WHAT THE DROP FINISHED, NOT WHAT THE DROP WAS ───────────────────────────────────────
        // Luke: "The recipe unlock should be dopamine inducing and inspectsble with a call to action to
        // craft it." What this said instead was "Found Gnawed Root" -- the name of a twig, which tells a
        // player nothing about why the last twenty minutes were worth anything.
        //
        // newlyReady has been sitting in grove-recipes.js since it was written and was never called by
        // anything: the thing that knows a recipe just became craftable existed, and no screen asked it.
        // It compares the two bags rather than asking "is it ready now", so a fifth root on a recipe that
        // needed four does not announce the same rod on fifty consecutive kills -- the moment is the
        // TRANSITION, and it is the only one worth a line.
        //
        // Ordered: a thing you can now MAKE beats a thing you have now SEEN. Both still fire the found
        // line when nothing crossed, because first sight of a part is the other half of the tablet.
        // ── ⚠️ A FULL BAG OUTRANKS EVERY OTHER LINE ────────────────────────────────────────────────
        // The server has been returning `overflow` from the settle since it was written and no screen
        // has ever read it. A player with a full bag watches loot pop, hears it collected, and never
        // receives it -- which is the single most confusing thing this feature can do, and it does it
        // silently. It goes above the recipe line because it is the only one that is costing the player
        // something RIGHT NOW and the only one with an action attached: the Bank is the answer, and it
        // is the screen nobody opens.
        const lost = Object.keys(d.overflow || {});
        const made = before && after ? newlyReady(before, after) : [];
        if (lost.length) {
            setNote(`Bag full — left ${lost.map(partName).join(", ")} behind. Bank something.`);
        } else if (made.length) {
            setNote(made.length === 1
                ? `${made[0].name} is ready to craft`
                : `${made[0].name} and ${made.length - 1} more ready to craft`);
        } else if (d.newlySeen?.length) {
            setNote(`Found ${d.newlySeen.map(partName).join(", ")}`);
        }
    }, [session, refresh, st]);

    // ── THE BOSS ────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ ITS OWN REQUEST, NOT A LINE IN THE SETTLE BATCH. The server checks the zone was cleared and that
    // the cooldown elapsed, and neither of those can be held against a batch of two hundred claimed kills.
    // One request per boss death, at most one every thirty minutes per zone. See groveBoss.
    const bossKill = useCallback(async () => {
        if (!session) return;
        const d = await post({ action: "boss", zone: session.zone.id });
        if (!d?.ok) {
            setNote(d?.error === "on_cooldown" ? "That one is still lying where you left it."
                : d?.error === "not_cleared" ? "Clear the zone first."
                : "The kill did not land.");
            return;
        }
        setBossWon(d);
        // ⚠️ THE POP IS DRIVEN FROM HERE NOW, NOT FROM SETTLE. The boss kill is what moves unlocked_n
        // (see openTheWay in grove.js), so it is the only response that can carry the new zone.
        if (d.unlocked) setUnlockedNow(d.unlocked);
        const before = st;
        const after = await refresh();
        // ⚠️ AND IT ANNOUNCES WHAT IT UNLOCKED TOO. A boss hands over the largest single pile of parts in
        // the feature, so it is the likeliest thing to finish a recipe -- and the kill card lists what
        // dropped without ever saying what that now lets you make. The card owns the celebration; this is
        // the line that survives it, which is why it is not duplicated onto the card.
        const made = before && after ? newlyReady(before, after) : [];
        if (made.length) {
            setNote(made.length === 1
                ? `${made[0].name} is ready to craft`
                : `${made[0].name} and ${made.length - 1} more ready to craft`);
        }
    }, [session, refresh, st]);

    const leave = useCallback(() => { setSession(null); setView("map"); setBossWon(null); refresh(); }, [refresh]);

    // ── WHAT YOU BUILT, AND IT IS BUILT ON THE SERVER ───────────────────────────────────────────────
    // Luke: "Every stat should be important that you have on your gear, as well as all the passives that
    // you get, just like the arena... I do care about honoring all the players' commitments to their gear
    // and their passives and their pets and everything."
    //
    // ⚠️ THIS USED TO BE A HARDCODED `{ power: 12 }` PLUS EMBLEMS, and that one literal was the whole of
    // the hero. A level-30 member in best-in-slot, with a full badge set, an ascended pet and a maxed class
    // tree hit for exactly the same 12 as an account made this morning — forge, sets, jewels, compendium,
    // pets, badges and the casino tracks all worth precisely nothing in this zone.
    //
    // It is `st.hero` now: grove-kit.js builds it through the Arena's own combatStats + fighterFrom, with
    // the Grove's emblems folded into the SAME stat pool so an emblem's Might rides the same curve a
    // sword's does. Nothing is summed here any more — a second copy of the arithmetic is how the two would
    // drift. See grove-kit.js.
    // ── ⚠️ WHAT IS WAITING FOR YOU, ON THE BUTTON, IN THE ZONE ──────────────────────────────────────
    // Luke: "little wolf not crafting, we should find a way to guide and condition him."
    //
    // The workbench already says "5 READY" -- but only once you have opened it, and nothing ever gives a
    // player a reason to open it. A kid with 93 Bound Straw and twenty-five makeable recipes has no way of
    // knowing any of that from inside the fight, which is where he spends his whole session.
    //
    // So the number comes out to the button. It counts BOTH things that are waiting -- recipes you could
    // make now and chests you have not opened -- because from the player's side those are one question:
    // is there anything to go and do. No tutorial, no prompt, no modal: a number on a door, which is how
    // this game teaches everything else. See [[teach-by-showing-not-telling]].
    const benchReady = useMemo(() => {
        if (!st) return 0;
        const chests = Object.values(st.chests || {}).reduce((a, n) => a + (Number(n) || 0), 0);
        return readyCount(st) + chests;
    }, [st]);

    const stats = useMemo(() => {
        const h = st?.hero;
        // The neutral fighter, for a state that has not loaded yet. Deliberately NOT the old 12/120/8:
        // a placeholder that looks like a real build is one somebody tunes against.
        if (!h) return null;
        return {
            damage: h.damage, dmgPct: h.dmgPct,
            critChance: h.critChance, critMult: h.critMult,
            // Tempo is a RATE, and the scene turns it into a swing interval. See the cadence note there.
            tempo: h.tempo, haste: h.haste,
            lifesteal: h.lifesteal, stun: h.stun,
            bleedChance: h.bleedChance, bleedDamage: h.bleedDamage, bleedLeech: h.bleedLeech,
            armour: h.armor, maxHp: h.health, moveSpeed: h.moveSpeed || 0,
            // The names the member actually bought, keyed by the stat they feed — so a proc can announce
            // BLOODSCENT instead of HASTE. See procNames in grove-kit.js.
            procNames: h.procNames || {},
            // What the class DOES here, as opposed to what it adds. See grove-skills.js.
            skills: h.skills || [],
            groveVuln: h.groveVuln || 0,
        };
    }, [st?.hero]);

    // What the scene actually eats: the equipped food, its heal fraction, and how many are in the bag.
    // Resolved here rather than in the scene so the scene never has to know what a recipe is.
    // ── ⚠️ HOW MUCH ROOM IS LEFT, BECAUSE THE ZONE DID NOT KNOW THERE WAS A CEILING ────────────────
    // The bag holds a fixed number of DISTINCT parts (see storeParts). Past that, a part you do not
    // already carry is simply not granted -- the server works this out, returns it as `overflow`, and
    // until now the only screen that ever showed one was the chest opener. So in a zone: the drop pops,
    // the haul list names it, the pickup sound plays, and the part is then quietly never given to you.
    //
    // packSlots existed in exactly one place in this whole feature and it was inside the bag panel, so
    // the room the player was standing in had no idea the limit existed. This is the number that fixes
    // that, and it goes to the dock, where the badge idiom already means "there is something to know".
    const bagRoom = useMemo(() => {
        const slots = Number(st?.packSlots) || 0;
        if (!slots) return null;
        return Math.max(0, slots - Object.keys(st?.pack || {}).length);
    }, [st?.packSlots, st?.pack]);

    // ── WHAT THE CLASS IS, AND WHAT IT IS WORTH IN HERE ────────────────────────────────────────────
    // ⚠️ THE LABELS ARE THE GROVE'S OWN FOURTEEN, NOT THE TREE'S THIRTY. classGives arrives already in
    // this engine's vocabulary because grove-kit measured it against this engine, so the map below only
    // ever has to cover what a zone can actually do. A table of every stat the three trees grant would
    // be a second copy of arena-classes, forever one node behind it.
    const heroClass = useMemo(
        () => CLASSES.find((c) => c.id === st?.hero?.classId) || null,
        [st?.hero?.classId],
    );
    const classLines = useMemo(() => {
        const gives = st?.hero?.classGives || {};
        const out = [];
        for (const [key, meta] of Object.entries(GROVE_STAT_READOUT)) {
            const v = Number(gives[key]) || 0;
            if (!v) continue;
            out.push({ key, label: meta.label, value: meta.fmt(v) });
        }
        return out;
    }, [st?.hero?.classGives]);

    const beltNow = useMemo(() => {
        const id = st?.belt;
        if (!id || !GROVE_FOODS[id]) return null;
        return { id, ...GROVE_FOODS[id], count: Number(st?.food?.[id]) || 0 };
    }, [st?.belt, st?.food]);

    // ⚠️ OPENS WHERE YOU LEFT OFF, NOT AT ZONE ONE. Twelve panels is wider than any phone, so a
    // strip that always starts at the left shows a veteran the one place they finished weeks ago and
    // nothing they are actually doing. Instant rather than smooth: this is where the map IS, not a
    // journey the player should have to sit through every time they open it.
    useEffect(() => {
        const el = stripRef.current;
        if (view !== "map" || !el) return;
        const far = el.querySelector(`[data-n="${st?.unlockedN || 1}"]`);
        // ⚠️ CENTRED, NOT PINNED 24px FROM THE LEFT EDGE. That was right for a strip of cards whose
        // left edge was its start; a place on a chart has a trail arriving at it from behind, and shoving
        // it against the left wall throws away the half of the journey you have already walked. Centring
        // shows where you came from as well as where you are.
        if (far) el.scrollLeft = Math.max(0, far.offsetLeft + far.offsetWidth / 2 - el.clientWidth / 2);
    }, [view, st?.unlockedN]);

    // ── ⚠️ THE UNLOCK POP ─────────────────────────────────────────────────────────────────
    // Luke: "a dopamine pop middle of the screen for a duration letting you know you unlocked the next
    // area with vibration and a satisfying noise."
    //
    // Sound and buzz fire from HERE rather than from the settle handler, so they are tied to the panel
    // actually being on screen. Five seconds, then it clears itself — long enough to land, short
    // enough that nobody taps through it out of impatience. Tapping still dismisses it early.
    useEffect(() => {
        if (!unlockedNow) return undefined;
        celebrateUnlock();
        const t = setTimeout(() => setUnlockedNow(null), 5000);
        return () => clearTimeout(t);
    }, [unlockedNow]);

    useEffect(() => {
        if (!note) return undefined;
        const t = setTimeout(() => setNote(null), 3200);
        return () => clearTimeout(t);
    }, [note]);

    // ⚠️ RENDERED IN EVERY VIEW, NOT JUST INSIDE THE ZONE. The unlock usually arrives on the settle
    // that fires when you LEAVE a zone - which is the exact moment the zone view unmounts. Declared here and
    // dropped into both returns so the celebration cannot be destroyed by the thing that triggered it.
    const popNode = unlockedNow ? (
        <div className="gv-pop" onClick={() => setUnlockedNow(null)}>
            <div className="gv-pop-card">
                <span className="gv-pop-rays" aria-hidden="true" />
                <span className="gv-pop-kicker">New area unlocked</span>
                <b className="gv-pop-name">{unlockedNow.name}</b>
                <span className="gv-pop-art" style={{ backgroundImage: `url(${unlockedNow.bg})` }} />
                <span className="gv-pop-go">Tap to continue</span>
            </div>
        </div>
    ) : null;

    if (!st?.ok) {
        return <div className="gv"><p className="muted">The Grove is closed.</p><style>{GROVE_CSS}</style></div>;
    }
    // ── ⚠️ THE PANELS ARE BUILT BEFORE THE ZONE RETURNS, BECAUSE BOTH SCREENS NEED THEM ─────────
    // Luke: "The buttons to access crafting and backpack and map should be available when in a node
    // on the Grove."
    //
    // They used to live inside the hub return, below an early return for the zone, so there was no way
    // to put the backpack on screen without leaving the zone — and LEAVING IS NOT A FREE ACTION. The
    // scene would unmount and remount on the same seed, which rebuilds the world: full health, full
    // population, every creature you had already killed back on its feet. Opening your bag at 12 hit
    // points would have been a heal, which is the kind of exploit that arrives dressed as a convenience.
    //
    // So the panels are computed here, once, and rendered either as the hub body or as a sheet over a
    // PAUSED zone. `panel` is what decides which one shows: the dock view on the hub, and the zone's own
    // separate selection while in a node, because `view` is "zone" the whole time you are in one.
    const bagRows = Object.entries(st.pack || {});
    const bankRows = Object.entries(st.bank || {});
    const known = new Set(st.recipes || []);
    // ⚠️ THE TRAIL STOPS WHERE YOU DID. Drawing the whole route in confident ink would tell a new player
    // the shape of a map they have not earned; drawing none of it loses the one thing the chart is for.
    // Faint for the whole journey, inked as far as you have actually walked.
    // ── WHICH MAP THE PAPER IS SHOWING ───────────────────────────────────────────────────────────────
    // Twelve zones to a map and twelve maps, so the chart shows ONE of them. It opens on the furthest map
    // you have reached rather than on map one, because the place you are working is the place you want to
    // look at; the arrows walk back through the ones you have opened.
    const zoneMaps = [...new Set((st.zones || []).map((z) => z.map || 1))].sort((a, b) => a - b);
    const openMaps = zoneMaps.filter((m) => (st.zones || []).some((z) => (z.map || 1) === m && z.unlocked));
    const deepestMap = openMaps.length ? openMaps[openMaps.length - 1] : 1;
    const shownMap = paperMap && zoneMaps.includes(paperMap) ? paperMap : deepestMap;
    const shownZones = (st.zones || []).filter((z) => (z.map || 1) === shownMap);
    const shownName = shownZones[0]?.mapName || "The Grove";
    const mapIdx = openMaps.indexOf(shownMap);
    const walkedZones = shownZones.filter((z) => z.unlocked);

    // ── ⚠️ ONE PLACE TO GO NEXT, AND IT IS NOT THE SAME AS "A BOSS IS HERE" ─────────────────────────
    // Luke, looking at the chart: "Why are two selected". Nothing was — two zones had bosses standing
    // and both wore the same loud amber, so the map was shouting twice and pointing nowhere. On his own
    // save those two meant completely different things: Bramblewall is the deepest place he has opened
    // and its boss is alive, which is the frontier; Mossy Hollow is unfinished business four zones
    // BEHIND him. Identical styling for "go here next" and "you skipped this" is the whole confusion.
    //
    // The frontier is the deepest unlocked zone that is not finished. Exactly one, or none when every
    // open zone is cleared and the next is still locked behind a boss elsewhere.
    const zoneState = (z) => {
        const atQuota = z.kills >= z.toUnlock;
        return { atQuota, bossStands: atQuota && !z.bossDone, done: atQuota && z.bossDone };
    };
    const frontier = shownZones
        .filter((z) => z.unlocked && !zoneState(z).done)
        .sort((a, b) => b.n - a.n)[0] || null;
    // The whole chart in one strip, because a phone only ever shows about three places of twelve.
    const progress = shownZones.slice().sort((a, b) => a.n - b.n).map((z) => {
        const st2 = zoneState(z);
        if (!z.unlocked) return "locked";
        if (st2.done) return "done";
        if (st2.bossStands) return "boss";
        return "open";
    });
    const clearedCount = progress.filter((x) => x === "done").length;


    const panel = view === "zone" ? zonePanel : view;
    const sheetNode = (
                <div className="gv-sheet">

                {/* ── THE MAP ──────────────────────────────────────────────────────────────────────
                    Luke: "The map should be nodes on a paper map. The paper map should have color, as if a
                    skilled scribe actually drew the map, with families point of interest nodes on it ... If a
                    forest then leads to a cave or something, it should look like the trail leads from one
                    thing to another on the map. A forest should look like a grouping of trees on the map. A
                    cave should look like a cave."

                    ⚠️ THIS IS THE THIRD MAP AND THE FIRST TWO ARE WHY IT IS SHAPED LIKE THIS. The first was
                    one sepia parchment illustration standing in for twelve places, so none of them looked
                    like anywhere in particular. The second threw the paper away entirely and laid the twelve
                    zone BACKDROPS out as cards — which gave every place an identity and lost the thing a map
                    is for: where they are in relation to each other, and what leads to what. A chart with a
                    drawn symbol per place and a trail between them is both at once.

                    ⚠️ THE PLATE IS TERRAIN ONLY. The route and the twelve places are drawn here, over it, at
                    coordinates grove-map.js owns — a path painted into the art could never line up with nodes
                    positioned by code, and generated lettering is gibberish on inspection. */}
                {panel === "map" ? (
                    // ⚠️ THE CHROME SITS OUTSIDE THE SCROLLER. The map name and the progress pips were
                    // inside .gv-paper-in, which is a 2:1 plate several screens wide — so they were
                    // centred on the MAP rather than on the phone and slid off the edge the moment you
                    // scrolled anywhere. A readout that travels with the thing it describes is a readout
                    // nobody can read.
                    <div className="gv-paper-wrap">
                    {/* ── ⚠️ THE ATLAS REPLACED THE PAPER CHART ──────────────────────────────────
                        Luke: "we switched to this whole ancient map scroll looking, paper scroll looking
                        kind of design, which I just hate. So I want to go back to a vertical horizontal
                        scroll... each vertical layer is one of the maps and each horizontal layer is one
                        of the zones, and the town for each map would be the leftmost one."

                        The chart drew twelve symbols on parchment with an inked trail between them. The
                        atlas draws the PLACES: every zone already ships its own backdrop, 84 of them, made
                        when the maps were built and until now only ever seen once you were standing in it.

                        The carousel mechanics are lifted from the pack picker rather than reinvented; see
                        the notes in GroveAtlas and on .pk-pick-track. */}
                    <GroveAtlas
                        zones={st.zones || []}
                        towns={TOWNS}
                        zoneState={zoneState}
                        frontier={frontier}
                        onEnter={enter}
                        onTown={() => { window.location.href = "/marketplace/town"; }}
                    />
                    {/* ── ⚠️ ONE PLATE, NOT TWO ──────────────────────────────────────────────────
                        Luke: "Two things on top compete and seem redundant." They did, and they were:
                        a parchment pill reading "3/12 cleared" sitting directly on top of a second
                        parchment pill of twelve pips, both saying how far through the map you are, in
                        two different notations, as two separate floating objects. Two chips stacked
                        like that read as two controls — the eye has to work out which one it is meant
                        to be using.

                        They are one plate now: the name and the arrows on the first line, the twelve
                        places on the second. The pips are kept rather than the count because they say
                        strictly more — per zone, cleared or boss or locked, and which one is next —
                        and the count rides along as the quick version of the same fact. */}
                    {/* ⚠️ ONLY WHEN IT HAS SOMETHING IN IT. The plate used to hold the map name, the
                        arrows and the pips, so it always had content; with those gone it is just the
                        wishlist, and on a save with an empty wishlist it rendered as a bare parchment
                        dot floating over the first row — a control with nothing in it. */}
                    {wish.length ? (
                    <div className="gv-paper-chrome">
                        {/* ── ⚠️ THE PAPER HEAD AND PIPS CAME OUT WITH THE CHART ─────────────────
                            They were the map's name, two arrows to page between maps, and twelve pips
                            of progress — a floating plate that made sense when the chart showed ONE map
                            at a time. The atlas shows every map at once with its name and count on its
                            own row, so the plate was a second, disagreeing answer to the same question
                            (it counted CLEARED zones while the row counts UNLOCKED ones) parked on top
                            of the first row. One place says how far you are now. */}
                        {/* ── THE LIST ITSELF, AND THE ONE WAY OFF IT ──────────────────────────────
                            Luke: "you can tap to remove similar to how yoi add. And an abikity to clear
                            your wishlist."

                            ⚠️ IT IS ONLY HERE WHEN THERE IS ONE. A permanently docked empty strip saying
                            "wishlist" would spend a row of the map on a feature most sessions never use,
                            and the map is the surface Luke has already called out four times for being
                            cramped on a phone. No list, no bar.

                            ⚠️ AND THE SAME TAP TAKES IT OFF. Adding is a tap on a part; removing has to be
                            a tap on the same part, or the player has to learn two gestures for one idea.
                            Clear is a separate shape on the far side so it cannot be hit by aiming at the
                            last chip. */}
                        {wish.length ? (
                            <div className="gv-wishbar">
                                <ul>
                                    {wish.map((pt) => (
                                        <li key={pt}>
                                            <button type="button" onClick={() => toggleWish(pt)}
                                                title={`${partName(pt)} — tap to take off the list`}>
                                                <PartIcon id={pt} size={20} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                                <button type="button" className="gv-wish-clear" onClick={clearWish}
                                    aria-label="Clear the whole list"><GiBroom aria-hidden="true" /></button>
                            </div>
                        ) : null}
                    </div>
                    ) : null}
                    </div>
                ) : null}

                {/* ── BAG AND BANK ─────────────────────────────────────────────────────────────────── */}
                {/* ── YOUR GEAR ────────────────────────────────────────────────────────────────────
                    Luke: "the grove is not doing a good job showing you your gear." It showed none of it —
                    see the long note at the top of GroveGear for why that got worse the day creatures
                    started dropping it. `refresh` is passed because equipping recomputes st.hero on the
                    server, and st.hero is what the scene fights with. */}
                {panel === "gear" ? <GroveGear st={st} onChanged={refresh} /> : null}
                {panel === "quests"
                    ? (
                        <GroveQuests
                            quests={session?.quests || []}
                            coliseum={session?.coliseum || null}
                            onChanged={refresh}
                            busy={col.busy || Boolean(col.run)}
                            onEnter={(map) => { col.start(map); setZonePanel(null); }}
                        />
                    )
                    : null}

                {panel === "bag" ? (
                    <div className="gv-bag">
                        <Area id="bag" icon="ui-bag" title="Backpack"
                            count={`${bagRows.length}/${st.packSlots}`}>
                            {/* -- THE EMPTY SLOTS ARE DRAWN -------------------------------------
                                Luke: "a lot of void in the area where we show the items."

                                The grid only ever held what you were carrying, so six parts in a bag of
                                twenty left most of a painted board empty, and empty board reads as a
                                mistake. Every inventory in every game draws its capacity instead, which
                                turns the void into what it actually is: room. It also states 6/20 twice,
                                once as a number and once as a shape, and the shape is the half a counter
                                on its own can never tell you. */}
                            <div className="gv-inv">
                                {bagRows.map(([p, n]) => (
                                    <button key={p} type="button" className="gv-cell"
                                        title={partName(p) + " - tap to bank"}
                                        onClick={async () => { await post({ action: "move", partId: p, from: "pack", to: "bank", qty: n }); refresh(); }}>
                                        <span className="gv-cell-face"><PartIcon id={p} size={46} /><i>{n}</i></span>
                                        <span className="gv-cell-name">{partName(p)}</span>
                                    </button>
                                ))}
                                {emptyCells(st.packSlots, bagRows.length)}
                            </div>
                        </Area>
                        <Area id="bank" icon="ui-vault" title="Bank"
                            count={`${bankRows.length}/${st.bankSlots}`}>
                            <div className="gv-inv">
                                {bankRows.map(([p, n]) => (
                                    <button key={p} type="button" className="gv-cell"
                                        title={partName(p) + " - tap to take"}
                                        onClick={async () => { await post({ action: "move", partId: p, from: "bank", to: "pack", qty: n }); refresh(); }}>
                                        <span className="gv-cell-face"><PartIcon id={p} size={46} /><i>{n}</i></span>
                                        <span className="gv-cell-name">{partName(p)}</span>
                                    </button>
                                ))}
                                {emptyCells(st.bankSlots, bankRows.length)}
                            </div>
                        </Area>
                        {/* ── THE BELT ────────────────────────────────────────────────────────────────
                            Luke: "a way to equip food or potions that auto heal you if you get below 60
                            percent hp." One slot: choosing which is the decision. */}
                        <Area id="belt" icon="ui-belt" title="The Belt"
                            count={`eats below ${Math.round((st.healAt || 0.6) * 100)}%`}>
                            {/* The whole ladder, dim where you hold none. One poultice sitting in a row
                                built for four was most of the void on this panel, and a list that shows
                                only what you already have cannot show you what you are missing. */}
                            <div className="gv-slots">
                                {Object.entries(GROVE_FOODS).map(([id, f]) => {
                                    const n = Number(st.food?.[id]) || 0;
                                    const on = st.belt === id;
                                    return (
                                        <button key={id} type="button" disabled={!n}
                                            className={`gv-slot${on ? " is-on" : ""}${n ? "" : " is-dim"}`}
                                            onClick={async () => { await post({ action: "belt", food: on ? null : id }); refresh(); }}>
                                            <PartIcon id={id} />
                                            <b>{f?.name || id}</b>
                                            <span>{n || "0"}</span>
                                            <em>{on ? "on the belt" : `heals ${Math.round((f?.heals || 0) * 100)}%`}</em>
                                        </button>
                                    );
                                })}
                            </div>
                        </Area>

                        {/* ── THE CHARMS ──────────────────────────────────────────────────────────────
                            ⚠️ CHOSEN HERE, SPENT AT THE DOOR. Picking one does nothing but arm it; the
                            charm is taken by the server when you walk into a zone, on the same request,
                            so there is no state where a charm is "selected" and quietly lost. What you
                            pick survives until you go in or pick something else.

                            ⚠️ AND IT IS ONE ROW PER POTENCY, not per charm. A Rough and a Masterwork
                            Rootwood Seeking are different objects and choosing between them is the
                            decision — collapsing them into one row with a count would hide the only
                            thing crafting a second one ever buys. */}
                        <Area id="charms" icon="ui-emblems" title="Charms"
                            count={charmPick ? "armed" : `${(st.charms || []).reduce((a, c) => a + c.qty, 0) || "none"}`}>
                            {(st.charms || []).length ? (
                                <div className="gv-slots">
                                    {(st.charms || []).map((c) => {
                                        const on = charmPick?.id === c.id && charmPick?.band === c.band;
                                        return (
                                            <button key={`${c.id}-${c.band}`} type="button"
                                                className={`gv-slot is-${c.band}${on ? " is-on" : ""}`} style={{ "--band": bandTint(c.band) }}
                                                onClick={() => setCharmPick(on ? null : { id: c.id, band: c.band })}>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={`/images/grove/charm-${c.meta?.stat || "rarityFind"}.webp`}
                                                    alt="" width={34} height={34} className="gv-ico" />
                                                {/* ⚠️ THE BAND IS ON THE NAME, not hidden in the detail
                                                    line. Two rows of the same charm differ only by how
                                                    well they came out, so that word is the entire
                                                    difference between them. */}
                                                <b>{c.meta?.name || c.id} <i className={`gv-q is-${c.band}`} style={{ "--band": bandTint(c.band) }}>{bandWord(c.band)}</i></b>
                                                <span>{c.qty}</span>
                                                <em>{on ? "carried in next" : `${CHARM_STAT_LABEL[c.meta?.stat] || ""} +${c.value}%`}</em>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                // ⚠️ AN EMPTY SHELF HAS TO SAY WHERE THEY COME FROM. A panel that is blank
                                // because you have none reads identically to one that is blank because the
                                // feature is broken, and a charm recipe is the one thing on the bench a
                                // player cannot find by looking for it.
                                <p className="gv-empty">None yet. A map&apos;s last boss teaches its charm
                                    &mdash; beat one and the recipe appears at the workbench.</p>
                            )}
                        </Area>

                        {/* ── THE TOOLS ───────────────────────────────────────────────────────────────
                            A ladder, not six items: each map raises every tool by a tier. */}
                        <Area id="tools" icon="ui-tools" title="Tools"
                            count={`${(st.toolMeta || []).filter((t) => t.tier).length}/${(st.toolMeta || []).length}`}>
                            <div className="gv-slots">
                                {(st.toolMeta || []).map((t) => {
                                    const Glyph = TOOL_GLYPH[t.slot] || GiStoneCrafting;
                                    return (
                                    <span key={t.slot} className={`gv-slot${t.tier ? "" : " is-dim"}`}>
                                        {/* ── THE TOOL, DRAWN ─────────────────────────────────────────
                                            Every one of these was a react-icons glyph until the sprites
                                            existed: a generic pickaxe standing in for a pick knapped out
                                            of a stag's antler. The glyph stays as the fallback because a
                                            slot with a hole where its picture goes reads as broken, and
                                            a new tool added before its art is drawn would do exactly
                                            that. [[img-onerror-fires-before-hydration]] */}
                                        <span className="gv-glyph">
                                            <img
                                                src={toolArt(t.slot, t.tier)} alt="" draggable={false}
                                                onError={(e) => {
                                                    e.currentTarget.style.display = "none";
                                                    e.currentTarget.parentElement?.classList.add("is-noart");
                                                }}
                                            />
                                            <Glyph aria-hidden="true" focusable="false" />
                                        </span>
                                        <b>{t.name}</b>
                                        {/* Roman numerals, and the ceiling beside them: a tier means
                                            nothing without knowing how many there are. One per map. */}
                                        <span>{t.tier ? `Tier ${toolNumeral(t.tier)} of ${toolNumeral(TOOL_TIER_CAP)}` : "—"}</span>
                                        <em>{t.tier ? `+${t.pct}% ${t.bonus}` : t.bonus}</em>
                                    </span>
                                    );
                                })}
                            </div>
                        </Area>

                        {/* The stone tablet, which is a record of what the Grove has shown you. */}
                        <Area id="tablet" icon="ui-tablet" title="The Tablet"
                            count={`${st.tablet.seen}/${st.tablet.total}`}>
                            <p><b>{st.tablet.seen}</b> of <b>{st.tablet.total}</b> parts discovered</p>
                            <ul>{st.tablet.bonuses.map((b) => <li key={b.at}>{b.label} — +{b.value}{b.kind === "pct" ? "%" : ""} {b.stat.replace(/_/g, " ")}</li>)}</ul>
                        </Area>
                    </div>
                ) : null}

                {/* ── THE WORKBENCH ────────────────────────────────────────────────────────────────── */}
                {panel === "bench" ? (
                    <GroveBench
                        st={st} known={known} partName={partName} PartIcon={PartIcon}
                        post={post} refresh={refresh} setNote={setNote}
                    />
                ) : null}

                {/* ── EMBLEMS ──────────────────────────────────────────────────────────────────────── */}
                {panel === "emblems" ? (
                    <div className="gv-emblems">
                        {/* ── ⚠️ TWO THINGS LIVED IN ONE SCROLL AND READ AS ONE THING ──────────────
                            Luke: "it just feels like things are in the wrong place. Like, I'm looking at
                            the card equipment area and I'm getting confused with the merit area. And they
                            should be separate."

                            He is right and the old comment under the Armoury explains exactly how it
                            happened: "this panel is the answer to 'what am I wearing', so both live here".
                            True, and it put a COLLECTION of monster cards directly above a SHOP that
                            spends a currency, in matching painted planks, in one continuous scroll. Both
                            halves are about wearing something, which is precisely why they blur — the
                            distinction that matters to a player is that one is a shelf of things you have
                            earned and the other is a till.

                            Tabs rather than a sixth dock button: the dock is five controls wide already
                            and a 375px phone has no room for another, and these two genuinely are two
                            views of one subject rather than two destinations. */}
                        <div className="gv-etabs" role="tablist" aria-label="Emblems and armour">
                            <button type="button" role="tab" aria-selected={embTab === "cards"}
                                className={embTab === "cards" ? "is-on" : ""}
                                onClick={() => setEmbTab("cards")}>
                                Monster Cards<i>{(st.emblems || []).filter((e) => e.count > 0).length}/{CARD_ORDER.length}</i>
                            </button>
                            <button type="button" role="tab" aria-selected={embTab === "armour"}
                                className={embTab === "armour" ? "is-on" : ""}
                                onClick={() => setEmbTab("armour")}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/images/grove/ui-merit.webp" alt="" width={16} height={16}
                                    style={{ objectFit: "contain", verticalAlign: "-0.2em" }} />
                                Boss Armour<i>{Number(st.merits) || 0}</i>
                            </button>
                        </div>
                        {/* ── ⚠️ YOUR CLASS HAS BEEN COUNTING IN HERE ALL ALONG ────────────────────
                            grove-kit folds the class tree into the Grove fighter -- a Reaver's Rend and
                            a Warden's Bulwark genuinely change how a dive goes -- and nothing anywhere
                            in the feature mentioned a class existed. Points spent, numbers moved, and
                            the game silent about it, which is the same fault crafting had.

                            ⚠️ AND IT SHOWS WHAT THE GROVE ACTUALLY USES, NOT WHAT THE TREE GRANTS. The
                            three trees hand out about thirty stats and this engine reads fourteen, so a
                            list of the nodes you have taken would claim Thornmail is working here. These
                            numbers are measured by grove-kit against the engine itself -- the same
                            fighter built with and without the tree -- so the screen cannot promise
                            something the zone does not do. See classGives. */}
                        <Area id="training" icon="ui-emblems" title="Your Training"
                            count={heroClass ? heroClass.name : "no class"}>
                            {heroClass ? (
                                <div className="gv-train">
                                    <img className="gv-train-sigil" src={heroClass.emblem} alt=""
                                        width={46} height={46} />
                                    <div className="gv-train-body">
                                        <b style={{ color: heroClass.color }}>{heroClass.name}</b>
                                        <em>{heroClass.tag}</em>
                                        {classLines.length ? (
                                            <ul className="gv-train-list">
                                                {classLines.map((l) => (
                                                    <li key={l.key}><span>{l.label}</span><b>{l.value}</b></li>
                                                ))}
                                            </ul>
                                        ) : (
                                            // ⚠️ A CLASS WITH NO POINTS IN IT IS NOT A BROKEN READOUT.
                                            // Picking a class costs nothing; the tree is where the choice
                                            // actually happens, and an empty one is genuinely worth zero
                                            // here. Saying so beats an empty box the player reads as a bug.
                                            <p className="muted">No points spent yet — your tree is worth
                                                nothing in the Grove until it has some.</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <p className="muted">No class chosen. A class changes how you fight in
                                    here as much as it does in the Arena.</p>
                            )}
                        </Area>

                        {embTab === "cards" ? (
                        <Area id="emblems" icon="ui-emblems" title="Monster Cards"
                            count={`${(st.emblems || []).filter((e) => e.count > 0).length}/${CARD_ORDER.length} found`}>
                        {/* ⚠️ NO CAPTION HERE. It read "Three may be worn. Three more are sealed." —
                            above three slots, under a header already counting "1/3 worn", with the
                            sealed ones drawn sealed. Three statements of the same fact and only one of
                            them was a picture. Luke: "Dont use words to explain use proffesional
                            design." */
}
                        <div className="gv-eslots">
                            {[0, 1, 2].map((s) => {
                                const on = (st.emblems || []).find((e) => e.slot === s);
                                return (
                                    <div key={s} className="gv-eslot">
                                        {on ? (
                                            <button type="button" onClick={async () => { await post({ action: "emblem", emblemId: on.id, slot: null }); refresh(); }}>
                                                <b style={{ color: on.rung?.color }}>{"★".repeat(on.stars)}</b>
                                                <span>{GROVE_EMBLEMS[on.id]?.name}</span>
                                                <em>take off</em>
                                            </button>
                                        ) : <span className="gv-eempty">empty</span>}
                                    </div>
                                );
                            })}
                            {[3, 4, 5].map((s) => <div key={s} className="gv-eslot is-sealed"><span>sealed</span></div>)}
                        </div>
                        {/* -- ⚠️ THE CONCEPT, STATED. ------------------------------------------------------
                            Luke: "Im also worried it will make people think its for the card game.
                            Thats why I think we need to ensure people understand the concept of
                            these." He is right and the old copy made it worse: an empty panel that
                            said only "No emblems yet. They fall rarely" told a player nothing about
                            what the thing IS, so the only clue left was the word on the tab -- which
                            at the time was "Monster Cards", pointing straight at Spire.

                            ⚠️ AND THE FIX IS NOT TO RENAME THEM. I read the sprites -- carved amulets
                            on leather cords -- decided the art was the authority on what the object
                            was, and renamed the whole feature to Trophies. Luke: "its supposed to be a
                            card of the enemy you are collecting." The name was never the problem. The
                            CARD never showed a monster, which is what made it look like a stray Spire
                            card; it shows one now, and the amulet is its seal.

                            So the disambiguation is done by saying it, here and on the card itself,
                            rather than by giving the thing a different name than the one it has.

                            ⚠️ THE EXPLANATION SHOWS WHETHER OR NOT YOU HAVE ANY. The empty state is
                            the obvious place for it, but the player who most needs to be told these
                            are not Spire cards is the one who just got their first and is looking at
                            the panel to find out what they caught. */}
                        <p className="gv-mc-what">
                            One card for each kind of creature in the Grove, dealt by the creature
                            itself &mdash; roughly one kill in four hundred leaves one. Carry three at
                            a time and each one grants what that creature had.{" "}
                            <b>These are not Spire cards</b> and they are never played; the deck and
                            the collection have nothing to do with each other.
                        </p>
                        {!(st.emblems || []).some((e) => e.count > 0) ? <p className="muted">None yet. Roughly one kill in four hundred leaves one behind.</p> : null}
                        {/* ── ⚠️ THE WHOLE SET IS ON THE SHELF, OWNED OR NOT ──────────────────────────
                            This used to list only the cards you already had, as rows of text with a 46px
                            picture. Two things were wrong with that and they compound.

                            A collection you cannot see the SHAPE of is not a collection. With only your
                            own cards listed, a player with four of them has no idea whether that is four
                            of six or four of forty, which creature is still missing, or that there is
                            anything to complete at all. The empty slots are the thing that makes a set a
                            set -- so every card in the game has a place here from the first time you open
                            the panel, and the ones you have not found are black silhouettes.

                            ⚠️ A SILHOUETTE STILL TELLS YOU WHICH MONSTER IT IS. That is the point of using
                            the creature's own sprite at brightness(0) rather than a question mark: the
                            outline of the stag's antlers or the moth's wings is recognisable, so a missing
                            card is a specific animal you have not killed yet rather than an anonymous gap.
                            A "?" box would have been easier and would have taught nothing.

                            Luke: "the card display area needs to be gamified and way more endorphins with
                            colors ... they should be silhoiete black if not possessed."

                            The colour is not decoration either -- it is the rung. EMBLEM_STARS already
                            carries one hex per rung (Worn grey, Marked green, Etched blue, Sealed violet,
                            Crowned gold, Ascendant pink) and the panel was spending it on six characters
                            of star text in the corner. Now the rung owns the whole card: border, glow,
                            name, pips. Your shelf visibly changes colour as it levels, which is the only
                            reward a collection screen can actually pay. */}
                        {CARD_SHELVES.map((shelf) => {
                            const found = shelf.ids.filter((id) => (st.emblems || []).some((x) => x.id === id && x.count > 0)).length;
                            return (
                        <section key={shelf.title} className="gv-cshelf">
                            {/* The count is per shelf, so "2 / 12" on a map tells you how much of THAT
                                boss set is left -- which is the question a collection screen is for.
                                One running total across 103 cards answers nothing. */}
                            <h4>{shelf.title}<i>{found}/{shelf.ids.length}</i></h4>
                        <div className="gv-cgrid">
                            {shelf.ids.map((id) => {
                                const meta = GROVE_EMBLEMS[id];
                                const e = (st.emblems || []).find((x) => x.id === id) || null;
                                const count = e?.count || 0;
                                const stars = e?.stars || 0;
                                const rung = e?.rung || null;
                                const next = e?.next || null;
                                const have = count > 0;
                                const worn = e && e.slot !== null && e.slot !== undefined;
                                // ⚠️ THE BAR MEASURES THE RUNG YOU ARE IN, not the whole ladder. Against the
                                // ladder every bar below Crowned sits near empty and reads as no progress at
                                // all -- 22 of 250 is 9% when it is actually three-sixths of the way up.
                                // ⚠️ THE CARD'S OWN LADDER. EMBLEM_STARS is the wanderer one; a boss card
                                // maxes at sixteen, so measuring it against 250 would draw every boss bar
                                // as a sliver and report "3 / 22" on a card that was already two stars.
                                const ladder = starLadder(id);
                                const floor = stars ? ladder[stars - 1].at : 0;
                                const pct = next ? Math.max(4, Math.round(((count - floor) / (next.at - floor)) * 100)) : 100;
                                return (
                                    <div key={id}
                                        className={`gv-card${have ? "" : " is-locked"}${worn ? " is-worn" : ""}${stars >= 5 ? " is-high" : ""}`}
                                        style={{ "--rung": rung?.color || "#6a6355" }}>
                                        <span className="gv-card-win">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={emblemFace(id)} alt="" loading="lazy" />
                                            {have && emblemArt(id) ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img className="gv-card-seal" src={emblemArt(id)} alt="" loading="lazy" />
                                            ) : null}
                                            {worn ? <em className="gv-card-worn">Worn</em> : null}
                                        </span>
                                        {/* Six pips, always six, so the room left to grow is visible on a
                                            one-star card instead of only on a maxed one. */}
                                        <span className="gv-card-pips">
                                            {[1, 2, 3, 4, 5, 6].map((n) => (
                                                <i key={n} className={n <= stars ? "on" : ""}
                                                    style={n <= stars ? { color: ladder[n - 1].color } : undefined}>★</i>
                                            ))}
                                        </span>
                                        <b>{have ? meta?.name || id : "· · ·"}</b>
                                        {have && stars ? (
                                            <u>+{(meta?.per || 0) * stars}{meta?.kind === "pct" ? "%" : ""}{" "}
                                                {String(meta?.stat || "").replace(/_/g, " ")}</u>
                                        ) : (
                                            <u className="gv-card-none">
                                                {have ? `${(next?.at || 3) - count} more to wake it` : "not found"}
                                            </u>
                                        )}
                                        {have ? (
                                            <span className="gv-card-bar"><i style={{ width: `${pct}%` }} /></span>
                                        ) : <span className="gv-card-bar" />}
                                        <small>{have ? `${count}${next ? ` / ${next.at}` : " · maxed"}` : ""}</small>
                                        {have && !worn ? (
                                            <button type="button" onClick={async () => {
                                                const free = [0, 1, 2].find((sl) => !(st.emblems || []).some((x) => x.slot === sl));
                                                await post({ action: "emblem", emblemId: id, slot: free ?? 0 });
                                                refresh();
                                            }}>Wear</button>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                        </section>
                            );
                        })}
                        </Area>
                        ) : null}
                        {/* The till. Behind its own tab now — see the note at the top of this panel. */}
                        {embTab === "armour" ? (
                            <GroveArmoury st={st} partName={partName} PartIcon={PartIcon}
                                post={post} refresh={refresh} setNote={setNote} />
                        ) : null}
                    </div>
                ) : null}

                </div>
    );


    // ── THE ZONE ────────────────────────────────────────────────────────────────────────────────────
    if (view === "zone" && session) {
        return (
            <div className="gv">
                <GroveScene
                    zone={session.zone} seed={session.seed} bonuses={session.bonuses} gearArt={session.gearArt}
                    // Whoever is standing in THIS zone, if anyone. Most zones have nobody — three givers
                    // across twelve rooms — so the scene draws a figure only when this is non-null.
                    npcHere={col.run ? null : (session.npcHere || null)}
                    onTalk={() => setZonePanel("quests")}
                    // ⚠️ THE ARENA REPLACES THE ZONE'S WORLD, it does not sit beside it. Handing both would
                    // put the zone's doors and its three-hundred-unit floor into a twenty-six unit room.
                    arena={col.run ? { ...col.run.plan.arena, runMs: col.run.plan.runMs } : null}
                    waves={col.run ? col.run.plan.waves : null}
                    onRunEnd={col.finish}
                    groundChests={col.chests}
                    onOpenChest={col.open}
                    // ⚠️ THE DOOR'S GATE IS THE SERVER'S, NOT THE CLIENT'S KILL COUNT. groveEnter refuses
                    // any zone past unlocked_n, and the door used to decide for itself from local kills --
                    // so a count the server had not banked yet (the settle still in flight, or trimmed by
                    // the kill ceiling) painted an open portal that then answered "That one is still
                    // closed." Handing the scene the same number the server checks makes the picture and
                    // the rule the same thing. settle() calls refresh(), so this lands as soon as the
                    // kills are banked.
                    unlockedN={Number(st?.unlockedN) || 1}
                    stats={stats} heroArt={session.heroArt || st?.heroArt || null}
                    petArt={session.petArt || st?.petArt || null}
                    // ⚠️ THE SAME session-THEN-state FALLBACK AS THE ART, AND FOR THE SAME REASON:
                    // groveEnter returns the session, groveState returns the screen, and either may be
                    // the one that has arrived. Nullish rather than || so a genuine 0 -- no pet
                    // equipped -- is not mistaken for "not loaded yet" and replaced by the other
                    // source. Without this line the scene defaults petBite to 0 and the pet never
                    // bites in the actual game: the bench passes its own value, so every rig would
                    // still have shown it working. Declared but never mounted, in its purest form.
                    petBite={session.petBite ?? st?.petBite ?? 0}
                    benchReady={benchReady}
                    bagRoom={bagRoom}
                    belt={beltNow} onSettle={settle} onBoss={bossKill} onLeave={leave}
                    onTravel={travel}
                    // ⚠️ THE ZONE IS FROZEN WHILE A PANEL IS OPEN, AND IT HAS TO BE. Crafting in front of
                    // a live fight means being eaten while reading a recipe, and the belt auto-eats below
                    // 60% — so an unpaused sheet would quietly spend your food while you were not looking
                    // at the screen. It also makes the scene's own clock honest: nothing ages, nothing
                    // respawns, and the fight you come back to is the fight you left.
                    paused={zonePanel !== null}
                    onPanel={setZonePanel}
                    // Luke: "when you die it should send you back to town." ⚠️ router.push, NOT the
                    // leave handler — leaving drops you on the Grove map, which is the screen inviting you
                    // straight back into the zone that just killed you. Town is somewhere else.
                    onDeath={() => router.push("/marketplace/town")}
                />
                {bossWon ? (
                    <div className="gv-unlock gv-won" onClick={() => setBossWon(null)}>
                        <div>
                            <span>{bossWon.first ? "First kill" : `Kill ${bossWon.kills}`}</span>
                            <b>{bossWon.boss?.name}</b>
                            {bossWon.boss?.art ? <img src={bossWon.boss.art} alt="" /> : null}
                            <p className="gv-won-loot">
                                {Object.entries(bossWon.parts || {}).map(([k, n]) => `${n} ${partName(k)}`).join(" · ")}
                                {bossWon.emblem ? ` · ${GROVE_EMBLEMS[bossWon.emblem]?.name || "an emblem"}` : ""}
                            </p>
                            {/* The hyper-rare gets its own line and its own weight. It is roughly one boss in
                                forty-five at the deepest zone, so when it lands it must not be a word in a
                                list of roots. */}
                            {bossWon.hyper ? <strong className="gv-hyper">{bossWon.hyper.name}</strong> : null}
                            {/* ── ⚠️ THE CHEST AND THE MERITS, ANNOUNCED WHERE THEY ARE WON ──────────
                                Both have been returned by the kill since they were built -- the server's
                                own comment says "so the kill card can show them rather than the player
                                discovering a chest in their bag later and not knowing what dropped it" --
                                and the card showed neither. Luke, playing it: "I'm not seeing any of the
                                new loot. I don't see any of the dopamine."

                                The chest gets the louder line of the two: it is roughly one kill in two
                                and it is the only route to the deep crafting parts, so it is the reason
                                to come back. Merits are a running total, so they read as a score. */}
                            {bossWon.chest ? (
                                <strong className="gv-won-chest">
                                    <img src={`/images/grove/chest-${bossWon.chest}.webp`} alt=""
                                        width={34} height={34} />
                                    {GROVE_CHESTS[bossWon.chest]?.name || "A chest"}
                                    <em>open it at the workbench</em>
                                </strong>
                            ) : null}
                            {bossWon.merits > 0 ? (
                                <span className="gv-won-merits">
                                    <GiLaurelCrown aria-hidden="true" focusable="false" />
                                    +{bossWon.merits} merits
                                </span>
                            ) : null}
                            {/* ── ⚠️ THE RECIPE IT TAUGHT, AND IT GETS THE LOUDEST LINE ON THE CARD ──
                                This happens once per map, ever, and it is the only way a recipe reaches
                                the bench that is not simply being alive. A row quietly appearing in a
                                list of two hundred is a reward nobody notices they earned — see
                                [[reward-with-no-screen-is-not-shipped]], which is the same scar as the
                                chest line above it. */}
                            {bossWon.taught ? (
                                <strong className="gv-won-taught">
                                    <GiStoneCrafting aria-hidden="true" focusable="false" />
                                    It taught you {bossWon.taught.name}
                                    <em>a new recipe, at the workbench</em>
                                </strong>
                            ) : null}
                            <button type="button" onClick={() => setBossWon(null)}>Good</button>
                        </div>
                    </div>
                ) : null}
                {/* ── ⚠️ THE PANEL IS A SHEET OVER THE ZONE, NOT A SCREEN INSTEAD OF IT ────────────
                    Luke: "The buttons to access crafting and backpack and map should be available when in
                    a node on the Grove." The scene stays mounted underneath — see the hoist note for why
                    unmounting it would hand out a free full heal — and the dock that opens this lives in
                    GroveScene, because the scene owns the unsettled kill log and has to bank it before a
                    backpack is worth looking at. */}
                {/* ── ⚠️ THE NOTE HAD NO SCREEN IN THE ONE PLACE IT FIRES ───────────────────────────
                    setNote is called from the settle, from the boss and from the door -- all of which
                    happen while you are standing IN a zone -- and the zone branch rendered it nowhere.
                    The only .gv-note in this view was inside the panel sheet, so the line appeared if you
                    happened to open your backpack afterwards and never otherwise. "Found Gnawed Root" has
                    been firing into nothing since it was written, which is most of why crafting is
                    invisible from the zone: the game has been telling nobody.

                    ⚠️ PORTALLED, FOR THE SAME REASON THE SHEET IS. GroveScene portals its full-screen
                    layer to the body (or to its own host in native full screen), so anything rendered in
                    the page tree paints UNDERNEATH the zone however high its z-index is set -- see the
                    note on the sheet below, which cost a reload to discover. Sibling of the scene at 78:
                    above the zone at 70, below the sheet at 80, so opening a panel covers it. */}
                {note && mounted ? createPortal(
                    <p className="gv-note is-zone" onClick={() => setNote(null)}>{note}</p>,
                    fsHost || document.body,
                ) : null}
                {zonePanel && mounted ? createPortal((
                    <div className="gv-zsheet">
                        <button type="button" className="gv-zsheet-x" aria-label="Back to the zone"
                            onClick={() => setZonePanel(null)}>
                            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                                <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor"
                                    strokeWidth="2.2" strokeLinecap="round" />
                            </svg>
                        </button>
                        {note ? <p className="gv-note">{note}</p> : null}
                        {sheetNode}
                        <style>{GROVE_CSS}</style>
                    </div>
                ), fsHost || document.body) : null}
                {popNode}
                <style>{GROVE_CSS}</style>
            </div>
        );
    }

    return (
        <div className="gv is-full">
            {/* ⚠️ THE WAY OUT, BECAUSE THE SITE'S OWN NAV IS UNDERNEATH THIS. Covering the whole viewport
                without putting a door in it is how a player ends up using the browser's back button to
                escape a game screen. Top-left, which is where a back control is looked for. */}
            <button type="button" className="gv-exit" aria-label="Leave the Grove"
                onClick={() => router.push("/marketplace")}>
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                    <path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.2"
                        strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            {popNode}
            {note ? <p className="gv-note">{note}</p> : null}

            {sheetNode}

            {/* ── THE MENU ──────────────────────────────────────────────────────────────────────
                Was a row of six sprite circles floating over the bottom-right of the hub. See the long
                note in GroveMenu.js for why six peers with no room for a word is not navigation; the
                short version is that Map and Quests, Backpack and Gear and Cards, and the Workbench are
                three different kinds of thing and the dock said so nowhere.

                ⚠️ THE HUB KEEPS ITS CURRENT-PAGE MARK. In the zone the drawer opens a panel over a paused
                fight and there is no "where am I"; here the hub IS one of these views at all times, so
                `current` is passed and the row you are looking at stays lit. */}
            <GroveMenu
                open={menuOpen}
                onOpen={() => setMenuOpen(true)}
                onClose={() => setMenuOpen(false)}
                families={FAMILIES}
                current={view}
                onPick={(k) => setView(k)}
            />

            <style>{GROVE_CSS}</style>
        </div>
    );
}
