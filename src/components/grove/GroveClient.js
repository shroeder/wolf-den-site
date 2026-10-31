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
    GROVE_PARTS, GROVE_EMBLEMS, GROVE_FOODS, GROVE_ZONES, groveArt, toolArt, zoneHasParts,
} from "@/lib/marketplace/grove-catalog.js";
// ── THE ORDER OF THE SHELF ────────────────────────────────────────────────────────────────────────
// Catalog order, which is the order you meet the creatures: map one's thirteen, then one per map going
// deeper. ⚠️ NOT sorted by what you own -- a shelf that reshuffles as you collect destroys the one thing
// a collection screen is for, which is knowing where a given card LIVES and seeing its hole.
// How many Monster Cards exist, for the panel's own heading. The SHELVING -- a row per map, bosses in
// with that map's wanderers -- lives in GroveCards.js now, because that is the thing that draws it; a
// second copy of the grouping here would be the same rule in two homes.
const CARD_TOTAL = Object.keys(GROVE_EMBLEMS).length;

import { useWishlist } from "@/components/grove/useWishlist.js";
import GroveCards from "@/components/grove/GroveCards.js";
import GroveStatues from "@/components/grove/GroveStatues.js";
import GroveMenu from "@/components/grove/GroveMenu.js";
import GroveBench, { SHOW_RECIPE_EVENT } from "@/components/grove/GroveBench";
import { readyCount } from "@/lib/marketplace/grove-recipes.js";
import Area, { OPEN_AREA_EVENT } from "@/components/grove/GroveArea.js";
import dynamic from "next/dynamic";

import GrovePartSheet from "@/components/grove/GrovePartSheet.js";
import GroveToolSheet from "@/components/grove/GroveToolSheet.js";

// ⚠️ LOADED ONLY WHEN SOMEBODY WALKS TO IT. TownClient is 5,500 lines with its own camera, polling
// and stylesheet; statically imported it would ride in the Grove's bundle for every player who never
// leaves the forest. ssr:false because it is only ever reached by a tap, so there is no first paint to
// server-render, and its state arrives over fetch anyway.
const TownClient = dynamic(() => import("@/components/TownClient"), { ssr: false });
import SkillTree from "@/components/arena/SkillTree";
import SkillPanel from "@/components/arena/SkillPanel";
import { qualityBand } from "@/lib/marketplace/grove-forge.js";
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
// ── ⚠️ THE ROWS CARRY LIVE COUNTS, AND UNTIL NOW NONE OF THEM DID ───────────────────────────────────────────
// Luke, 2026-10-30: "when you get a bunch of items from enemies, it is not clear at all what you're supposed
// to do with them... it's also not clear that there's a menu on the left. So we need a ramp to teach people
// what the game loop is."
//
// GroveMenu has supported `r.badge` since it was written, and shows the SUM on the closed button so a shut
// menu can still say there is something inside — and nothing ever set one. The zone dock got its number
// (benchReady, below) and the hub got nothing, so standing in the hub holding ninety parts there was no
// signal anywhere that the Workbench was the answer.
//
// ⚠️ IT IS NOT A TUTORIAL AND MUST NOT BECOME ONE. [[teach-by-showing-not-telling]]: the ramp is the number
// MOVING. Kill something, a part drops, the closed menu grows a count, the Workbench row is the one lit —
// that teaches parts-make-things with no words at all, at the moment the question occurs.
//
// ⚠️ EVERY BADGE HERE MUST BE CLEARABLE. readyCount's own note is the scar: most of the book is repeatable,
// so "could make this now" is permanently true and a badge that cannot be completed teaches you to ignore
// every other badge. Luke: "you can like never get rid of the bubbles." So the Workbench counts only recipes
// never finished, Statues counts only ones still unspent, and the Backpack — which is never empty once you
// are playing — deliberately carries nothing.
const familiesFor = ({ benchFresh = 0, statuesHeld = 0 } = {}) => [
    {
        title: "Go", rows: [
            { k: "map", label: "Map", art: "/images/grove/ui-map.webp", note: "choose a zone" },
            // ⚠️ THE TRACKER NEEDS A DOOR OR IT IS NOT SHIPPED. ui-board.webp was drawn long ago and never
            // used by anything — the quest helper is what it was for. Three givers hidden across twelve
            // zones is a good surprise once and a search forever after, so the panel that names the zone
            // has to be one tap away.
            { k: "quests", label: "Quests", art: "/images/grove/ui-board.webp", note: "who wants what" },
            // ⚠️ TOWN IS A PLACE IN THE GROVE, NOT A WAY OUT OF IT. Luke: "if you go to town, you
            // completely get booted out of the Grove. Like, the whole experience is lost... when you're
            // in the town, it should be like you're in any other zone of the Grove with the menu on the
            // left and still in that experience."
            //
            // ⚠️ THE SPRITE IS THE NAV'S OWN TOWN ART, NOT A NEW ONE. It already exists, it is already
            // in the house style, and drawing a second town would cost money for a picture of a thing
            // that has a picture. [[no-icons-or-glyphs-in-the-game]] asks for a sprite, not for a NEW one.
            { k: "town", label: "Town", art: "/images/nav/town.png", note: "the street outside" },
        ],
    },
    {
        title: "Carry", rows: [
            { k: "bag", label: "Backpack", art: "/images/grove/ui-bag.webp" },
            { k: "gear", label: "Gear", art: "/images/grove/ui-gear.webp", note: "what you are wearing" },
            { k: "emblems", label: "Monster Cards", art: "/images/grove/ui-cards.webp" },
            // ⚠️ A SCREEN WITH NO DOOR IS NOT SHIPPED. The statue vendor is reachable from the menu the
            // moment it exists, not from a panel somebody has to already know about.
            { k: "statues", label: "Statues", art: "/images/grove/ui-emblems.webp", note: "raise a stat for good", badge: statuesHeld || 0 },
        ],
    },
    {
        // ⚠️ ITS OWN FAMILY, NOT A ROW UNDER "Carry". Luke: "I hate the fact that the you have class
        // specific details that are in the monster cards area. The whole class and skills, that shit,
        // that as a first class citizen, it should have a completely different area where that lives in
        // its own menu item." It sat as a sub-section of Monster Cards, which said it was a detail OF
        // the cards -- a different kind of thing filed under the wrong one, exactly like the Armoury
        // under the shelf. Go / Carry / Make / Train reads as four verbs, which is what they are.
        title: "Train", rows: [
            { k: "class", label: "Your Class", art: "/images/grove/ui-class.webp", note: "points, tree, what it does here" },
        ],
    },
    {
        title: "Make", rows: [
            { k: "bench", label: "Workbench", art: "/images/grove/ui-bench.webp?v=2", note: "spend parts", badge: benchFresh || 0 },
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
    // Which part's sheet is open, or null. See GrovePartSheet.
    const [partView, setPartView] = useState(null);
    // Which tool's sheet is open, or null. See GroveToolSheet.
    const [toolView, setToolView] = useState(null);
    const [st, setSt] = useState(initial);
    const [view, setView] = useState("map");     // map | zone | town | bag | bench | emblems

    // ── ⚠️ THE TOWN IS FETCHED WHEN IT IS OPENED, NEVER WITH THE GROVE ────────────────────
    // getTownState is described in TownClient's own notes as the highest-volume request in the app.
    // Computing it on the Grove's server render would bill it for every member who opens the forest and
    // never walks to the street — the exact family-A mistake CLAUDE.md opens with: reaching for the
    // convenient existing call instead of the narrow one. Null until asked for, once per visit.
    const [townState, setTownState] = useState(null);
    useEffect(() => {
        if (view !== "town" || townState) return undefined;
        let gone = false;
        fetch("/api/marketplace/town", { cache: "no-store" })
            .then((r) => r.json())
            .then((d) => { if (!gone && d && !d.error) setTownState(d); })
            .catch(() => {});
        return () => { gone = true; };
    }, [view, townState]);
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

    // ── ⚠️ "WHERE DID IT GO" IS A NAVIGATION PROBLEM, NOT A COPY PROBLEM ────────────────────────────
    // Luke: "we also need the ability to go see where to go look at the item, because people have no
    // idea where to go after they craft it. Like, it's just completely like disappeared."
    //
    // A tool, a food and a charm all land in three different Areas of the SAME panel, so telling someone
    // where their thing went is one view switch and a scroll. Saying it in words on the card would be the
    // lazy version -- the card can just take them there.
    //
    // ⚠️ THE SCROLL WAITS A FRAME. setView re-renders the panel, and the target Area does not exist in
    // the DOM until that paint lands -- scrolling in the same tick finds nothing and silently does
    // nothing, which looks exactly like a dead button.
    // elId: an optional element INSIDE the area to finish on — a single recipe row rather than the whole
    // workbench. The area still has to be opened and scrolled first, because the row does not exist in the
    // DOM at all while its shelf is collapsed.
    const goToArea = useCallback((view, areaId, elId = null) => {
        setView(view);
        if (!areaId) return;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            // ⚠️ OPEN IT BEFORE SCROLLING TO IT. A shelf the player collapsed earlier would otherwise
            // answer "where did it go" with a closed lid, which is worse than not offering the button.
            window.dispatchEvent(new CustomEvent(OPEN_AREA_EVENT, { detail: areaId }));
            const el = document.getElementById(`area-${areaId}`);
            if (!el) return;
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            // A flash on arrival, because a smooth scroll that lands on a wall of panels leaves the
            // player hunting for which one moved.
            el.classList.add("is-found");
            setTimeout(() => el.classList.remove("is-found"), 1800);
            if (!elId) return;
            // One more frame: the shelf was collapsed a moment ago and its children have only just
            // mounted, so the row is not addressable until after this paint.
            requestAnimationFrame(() => {
                const row = document.getElementById(elId);
                if (!row) return;
                row.scrollIntoView({ behavior: "smooth", block: "center" });
                row.classList.add("is-found");
                setTimeout(() => row.classList.remove("is-found"), 1800);
            });
        }));
    }, []);

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
    // ⚠️ THERE IS NO BAG ROOM ANY MORE, so there is nothing to warn about. This was a memo computed
    // solely to drive a "FULL" badge on the menu, which existed because loot you watched land could fail
    // to be granted. Capacity is gone (see storeParts) and the warning goes with it rather than being
    // left behind reporting Infinity.
    const bagRoom = null;

    // How many statues are sitting unspent, for the panel heading. A number on the door is the whole of
    // what makes somebody open it -- see the bench badge, which exists for the same reason.
    // ── ⚠️ THE CLASS ROOM TALKS TO THE ARENA, AND DOES NOT GROW ITS OWN COPY OF IT ──────────────────
    // Luke: "you should be able to make class selections and tree decisions from that same area in the
    // Grove... people don't understand what their class selection and their point class points are doing
    // when it comes to the Grove."
    //
    // Every one of those actions already exists, validated, on /api/marketplace/arena -- pick_class,
    // take_node, refund_node, take_skill, take_skill_node, refund_skill, respec. A skill point is worth
    // gold, so the server re-validates every one against the same pure catalogue the screen renders from.
    // A second set of those endpoints under the Grove would be a second place for that validation to
    // drift, for a feature that is the SAME tree seen from another room.
    //
    // ⚠️ FETCHED ON OPEN, NOT ON MOUNT. The Grove's own state is already a heavy read and most sessions
    // never open this room; paying for the arena's state on every entry to the forest would put a second
    // round trip on the hot path for a panel nobody asked for. Round trips are the meter that bills.
    const [arena, setArena] = useState(null);
    const [arenaBusy, setArenaBusy] = useState(false);
    useEffect(() => {
        if (view !== "class" || arena) return undefined;
        let gone = false;
        fetch("/api/marketplace/arena", { cache: "no-store" })
            .then((r) => r.json())
            .then((d) => { if (!gone) setArena(d || null); })
            .catch(() => {});
        return () => { gone = true; };
    }, [view, arena]);

    // The answer IS the new state -- every case on that route returns getArenaState after it validates,
    // so nothing here has to guess what changed.
    const arenaAct = useCallback(async (action, extra) => {
        setArenaBusy(true);
        try {
            const r = await fetch("/api/marketplace/arena", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, ...(extra || {}) }),
            });
            const d = await r.json().catch(() => null);
            if (d && !d.error) setArena(d);
            // ⚠️ THE GROVE HAS TO REFRESH TOO. grove-kit folds the class tree into the Grove fighter, so a
            // point spent here changes what the next dive hits for -- and the hero line on this very
            // screen is built from it. Not refreshing would show the tree update and the numbers it feeds
            // stay still, which reads as the point having done nothing.
            await refresh();
        } finally {
            setArenaBusy(false);
        }
    }, [refresh]);

    const statueCount = useMemo(() => (st?.statues?.lines || [])
        .reduce((a, l) => a + Object.values(l.held || {}).reduce((x, n) => x + n, 0), 0), [st?.statues]);

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
    // ── ⚠️ THE STREET, INSIDE THE FOREST ──────────────────────────────────────────
    // Luke: "when you're in the town, it should be like you're in any other zone of the Grove with the
    // menu on the left and still in that experience."
    //
    // TownClient takes plain props and paints itself, so it mounts here unchanged — the same decision as
    // the Arena's skill tree in the class room, and for the same reason: a Grove copy of the street would
    // be a second street to keep in step with the first.
    //
    // ⚠️ IT IS NOT IN gv-sheet. The sheet is a scrolling column of parchment panels; the town is a
    // camera on a street and has to be the whole area. It sits outside that column, under the menu handle
    // (fixed, z-index 1002), which is what makes it read as another room of the Grove rather than a page.
    const townNode = view === "town" ? (
        <div className="gv-town">
            {townState
                ? <TownClient initial={townState} />
                : <p className="gv-town-wait">Walking to town…</p>}
        </div>
    ) : null;

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
                        // ⚠️ A VIEW, NOT A NAVIGATION. This was window.location.href, which tore the
                        // whole Grove down and rebuilt the site around a town page with no way back.
                        onTown={() => setView("town")}
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
                        {/* ⚠️ A COUNT, NOT A CAPACITY. It said "6/20" when twenty was a ceiling you had
                            to craft your way past; now it says how many KINDS of thing you are carrying,
                            which is the only part of that number that was ever interesting. */}
                        <Area id="bag" icon="ui-bag" title="Backpack"
                            count={`${bagRows.length} kind${bagRows.length === 1 ? "" : "s"}`}>
                            {/* -- THE EMPTY SLOTS ARE DRAWN -------------------------------------
                                Luke: "a lot of void in the area where we show the items."

                                The grid only ever held what you were carrying, so six parts in a bag of
                                twenty left most of a painted board empty, and empty board reads as a
                                mistake. Every inventory in every game draws its capacity instead, which
                                turns the void into what it actually is: room. It also states 6/20 twice,
                                once as a number and once as a shape, and the shape is the half a counter
                                on its own can never tell you. */}
                            <div className="gv-inv">
                                {/* ⚠️ NOT BUTTONS ANY MORE. Their only job was tap-to-bank, and there is no
                                    bank to tap into. A control that looks pressable and does nothing is
                                    worse than a label. */}
                                {/* ⚠️ BUTTONS AGAIN, BECAUSE THERE IS FINALLY SOMETHING BEHIND THEM. They
                                    were demoted to inert spans when the bank went away and tap-to-bank
                                    went with it — correctly, at the time. A tap now opens the part's
                                    sheet: what drops it, where those live, and every recipe that wants
                                    it, each one a door back to its row at the bench. */}
                                {bagRows.map(([p, n]) => (
                                    <button key={p} type="button" className="gv-cell" title={`${partName(p)} — tap to see what it is for`}
                                        onClick={() => setPartView(p)}>
                                        <span className="gv-cell-face"><PartIcon id={p} size={46} /><i>{n}</i></span>
                                        <span className="gv-cell-name">{partName(p)}</span>
                                    </button>
                                ))}
                            </div>
                        </Area>
                        {/* ── ⚠️ THE BANK IS GONE ───────────────────────────────────────────────
                            Luke: "I think we get rid of the idea of a bank. And get rid of bag slot
                            limits. And get rid of bank and backpack expansions. Its just a lame mechanic
                            that is a meaningless tax on the player."

                            A bank only means something when a bag is full, and the bag no longer fills.
                            What stood here was a second grid, a second counter, a tap-to-bank on every
                            item and a tap-to-take on every item back — an entire screen of shuffling
                            that existed to service a limit nobody wanted. */}
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
                                    // ⚠️ A BUTTON, BECAUSE THE SHELF COULD NEVER ANSWER THE QUESTION
                                    // PEOPLE OPEN IT WITH. Luke: "you can't even like inspect the tools
                                    // in your tools area." It says what the tool IS; what it could not
                                    // say is whether it is finished and what the next rung would cost,
                                    // which lived four taps away in a list of 129 rows. Dim slots are
                                    // tappable too -- "I don't have one" is exactly when you want to
                                    // know what making one takes.
                                    <button key={t.slot} type="button"
                                        className={`gv-slot${t.tier ? "" : " is-dim"}`}
                                        onClick={() => setToolView(t)}>
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
                                        {/* ── ⚠️ THE QUALITY WAS IN THE PAYLOAD AND ON NO SCREEN ──────
                                            Luke: "you can't even like inspect the tools in your tools
                                            area... we need to do a lot better job letting people inspect
                                            things." And separately: "what kind of quality you have on the
                                            existing item."

                                            toolMeta has carried `quality` since it was written and this
                                            shelf never printed it. So the one thing the whole crafting
                                            minigame exists to decide — whether yours came out Rough or
                                            Masterwork — was invisible on the tool it decided, and the
                                            only way to find out was to open the bench and read the
                                            rework button. It is on the tool now, in its own band colour.

                                            ⚠️ THE BONUS ALREADY INCLUDES IT (see toolBonusFor), so this
                                            is the NAME of a multiplier the player was already being
                                            paid — not a second, separate number to reconcile. */}
                                        {t.tier && t.quality != null ? (() => {
                                            const band = qualityBand(t.quality);
                                            return <u className="gv-slot-band" style={{ "--band": band.tint }}>{band.name}</u>;
                                        })() : null}
                                        <em>{t.tier ? `+${t.pct}% ${t.bonus}` : t.bonus}</em>
                                    </button>
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
                        onGoTo={goToArea}
                    />
                ) : null}

                {/* ── EMBLEMS ──────────────────────────────────────────────────────────────────────── */}
                {panel === "statues" ? (
                    <Area id="statues" icon="ui-emblems" title="Statue Vendor"
                        count={statueCount ? `${statueCount} held` : undefined}>
                        <GroveStatues
                            statues={st.statues}
                            onTurnIn={async (stat, rarity) => {
                                const r = await post({ action: "statue", stat, rarity });
                                refresh();
                                return r;
                            }}
                        />
                    </Area>
                ) : null}

                {panel === "class" ? (
                    <>
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
                    <Area id="training" icon="ui-class" title="Your Class"
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

                    {/* ── ⚠️ THE REAL TREE, NOT A PICTURE OF ONE ──────────────────────────────────
                        Luke: "you should be able to make class selections and tree decisions from that
                        same area in the Grove... And it shouldn't just explain it in a text blob. It
                        should be very dopamine inducing."

                        The Area above is the READOUT -- what the tree is worth in this forest,
                        measured by grove-kit against the engine itself. It answers "is this doing
                        anything here", and it could not answer "change it".

                        These are the Arena's own SkillTree and SkillPanel, mounted here unchanged.
                        Not a Grove copy of them: they are already built, already tuned, already the
                        thing Luke means by dopamine, and a second implementation of a tree that spends
                        a currency would be a second place for the spending rules to drift. Picking a
                        class, taking a node, refunding one and respeccing all work from this room now.

                        ⚠️ THE GOLD IS THE GROVE'S OWN. SkillTree prices a respec in gold and takes the
                        balance as a prop; handing it the arena's stale copy would show one number here
                        and charge another at the till. */}
                    {arena?.progress ? (
                        <Area id="tree" icon="ui-class" title="The Tree"
                            count={arena.progress.points?.available
                                ? `${arena.progress.points.available} to spend` : undefined}>
                            <SkillTree progress={arena.progress} gold={st.gold ?? arena.gold ?? 0}
                                busy={arenaBusy} onAct={arenaAct} />
                        </Area>
                    ) : null}

                    {arena?.progress?.cls ? (
                        <Area id="skills" icon="ui-merit" title="Skills"
                            count={arena.progress.skillPoints?.available
                                ? `${arena.progress.skillPoints.available} to spend` : undefined}>
                            <SkillPanel progress={arena.progress} busy={arenaBusy} onAct={arenaAct} />
                        </Area>
                    ) : null}

                    {/* A room that is still loading has to say so, or it reads as a room with nothing
                        in it — which is exactly the complaint this whole panel exists to answer. */}
                    {!arena ? <p className="muted">Reading your tree…</p> : null}
                    </>
                ) : null}
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
                                Monster Cards<i>{(st.emblems || []).filter((e) => e.count > 0).length}/{CARD_TOTAL}</i>
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
                        {embTab === "cards" ? (
                        <Area id="emblems" icon="ui-cards" title="Monster Cards"
                            count={`${(st.emblems || []).filter((e) => e.count > 0).length}/${CARD_TOTAL} found`}>
                        {/* ⚠️ NO CAPTION HERE. It read "Three may be worn. Three more are sealed." —
                            above three slots, under a header already counting "1/3 worn", with the
                            sealed ones drawn sealed. Three statements of the same fact and only one of
                            them was a picture. Luke: "Dont use words to explain use proffesional
                            design." */
}
                        {/* ── ⚠️ THERE ARE NO SLOTS ANY MORE ──────────────────────────────────────
                            Three worn and three sealed stood here. Luke: "I think I want to do away with
                            equipping monster cards entirely. And just when you possess them, you get the
                            bonus for all... and the level it's at, that you get that bonus at all times."

                            A hundred and three collectibles of which a player could feel THREE meant
                            every card after the third was a number on a shelf, and the shelf was the
                            whole feature. Owning it is wearing it now, so the only thing this panel has
                            to do is show what you have — which is what the rows below already did. */}
                        {/* ── ⚠️ NO EXPLANATORY PARAGRAPH, AND NO "SPIRE" ────────────────────────
                            A paragraph stood here disambiguating these from the card game's cards, twice
                            over, and naming a game the Den does not have. Luke: "you spend way too much
                            time trying to say the difference between cards and cards... we should never
                            refer to the spire, as our Den Quest card game is not called the spire... you
                            can just delete that whole text blurb."

                            He is right on the design as well as the name: the card shows the creature and
                            the shelf is one row per map. If that does not say what these are, a sentence
                            under it will not either. See teach-by-showing-not-telling. */}
                        {!(st.emblems || []).some((e) => e.count > 0) ? <p className="muted">None yet. Roughly one kill in four hundred leaves one behind.</p> : null}
                        {/* ── ⚠️ ONE ROW PER MAP, SCROLLING SIDEWAYS ─────────────────────────────────
                            Was eight stacked sections of a vertical grid. Honest, and a wall: 103 cards
                            meant scrolling past roughly forty silhouettes to reach map three, with no way
                            to jump and no sense of which shelf you were working on.

                            Luke: "I kind of want it to be like the virtual horizontal scroll that we made
                            for a few other things recently, where the vertical skew would be different
                            maps, and the horizontal skew would be different enemies. And the bosses would
                            just be lumped in with enemies for that map."

                            It is the GroveAtlas rig, reused rather than rebuilt — same classes, same
                            snapping track, same computed centre. See the note at the top of GroveCards.js.
                            The whole set is still shown, found or not; the silhouettes did not go
                            anywhere, they just stopped being a single column of them. */}
                        <GroveCards
                            emblems={st.emblems || []}
                            onWear={async (id) => {
                                const free = [0, 1, 2].find((sl) => !(st.emblems || []).some((x) => x.slot === sl));
                                await post({ action: "emblem", emblemId: id, slot: free ?? 0 });
                                refresh();
                            }}
                        />
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
    // ── ⚠️ ONE SHEET, RENDERED IN BOTH RETURNS ─────────────────────────────────────────
    // This component has TWO returns — `if (view === "zone" && session)` below returns the whole forest and
    // never reaches the hub's JSX. The bag is openable from both (at the hub it is a view; in a zone it is
    // a zonePanel), so a sheet written into either return alone is a tap that does nothing in the other
    // half of the game. It was written into the zone's first, and the rig caught it refusing to shoot:
    // "`.gv-inv .gv-cell` never produced `.gv-pv-card`". Same defect as the minigame stylesheet, which
    // also went into this file beside things that live in the zone branch only.
    //
    // ⚠️ PORTALLED, because GroveScene portals its full-screen layer to the body — anything left in the
    // page tree paints UNDERNEATH the zone however high its z-index is set.
    const partSheet = partView && mounted ? createPortal((
        <GrovePartSheet
            part={partView} have={Number(st.pack?.[partView] || 0)}
            wished={wish.includes(partView)}
            partName={partName} PartIcon={PartIcon}
            onToggleWish={toggleWish}
            onClose={() => setPartView(null)}
            onGoRecipe={(recipeId) => {
                setPartView(null);
                // Clear the bench's chips first: a player narrowed to Tools would otherwise be scrolled
                // at a food row that is not in the DOM. See SHOW_RECIPE_EVENT.
                window.dispatchEvent(new CustomEvent(SHOW_RECIPE_EVENT, { detail: recipeId }));
                goToArea("bench", "bench", `gv-rec-${recipeId}`);
            }}
        />
    ), fsHost || document.body) : null;

    // Same two-returns rule as partSheet above, and the same portal target for the same reason.
    const toolSheet = toolView && mounted ? createPortal((
        <GroveToolSheet
            tool={toolView} pack={st.pack || {}}
            partName={partName} PartIcon={PartIcon}
            onClose={() => setToolView(null)}
            onGoRecipe={(recipeId) => {
                setToolView(null);
                window.dispatchEvent(new CustomEvent(SHOW_RECIPE_EVENT, { detail: recipeId }));
                goToArea("bench", "bench", `gv-rec-${recipeId}`);
            }}
        />
    ), fsHost || document.body) : null;

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
                    // Dying sends you to the street, as it always did — but the street is in here now,
                    // so losing a run no longer also loses the session.
                    onDeath={() => setView("town")}
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

                {partSheet}
                {toolSheet}
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
            {/* ⚠️ THE GAME'S HOME, NOT THE SITE'S. Luke: "when you click the leave button on the Grove,
                it should take you to the game homepage, not the whole website homepage, but the game
                homepage."

                This pushed /marketplace, which is the shop's landing page -- so leaving a dive dropped
                you out of the game entirely and into the storefront, several taps from anything you
                were doing. /marketplace/play is the room the game nav calls Home and the one every
                other game screen treats as the way back. */}
            <button type="button" className="gv-exit" aria-label="Leave the Grove"
                onClick={() => router.push("/marketplace/play")}>
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                    <path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.2"
                        strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            {popNode}
            {note ? <p className="gv-note">{note}</p> : null}

            {townNode}
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
                families={familiesFor({ benchFresh: st ? readyCount(st) : 0, statuesHeld: statueCount })}
                current={view}
                onPick={(k) => setView(k)}
            />

            {/* The other half of the sheet's two homes — see the note where partSheet is built. The bag
                is a view at the hub and a zonePanel inside a zone, so both returns have to render it. */}
            {partSheet}
            {toolSheet}

            <style>{GROVE_CSS}</style>
        </div>
    );
}
