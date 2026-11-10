"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GroveAtlas from "@/components/grove/GroveAtlas";
import { TOWNS } from "@/lib/marketplace/towns.js";
import { groveSpot, stampGroveReturn } from "@/lib/marketplace/grove-return.js";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
    GiAnvil, GiBroom, GiBugleCall, GiButterflyKnife, GiCompass, GiCutDiamond, GiDigHole, GiFarmTractor, GiFishingPole, GiFlagObjective, GiLaurelCrown, GiMineWagon, GiOldLantern, GiPawPrint, GiStoneCrafting,
} from "react-icons/gi";

import GroveScene from "@/components/grove/GroveScene.js";
import {
    GROVE_EMBLEMS, GROVE_ZONES, groveArt, toolArt, zonesOfMap,
} from "@/lib/marketplace/grove-catalog.js";
// ── THE ORDER OF THE SHELF ────────────────────────────────────────────────────────────────────────
// Catalog order, which is the order you meet the creatures: map one's thirteen, then one per map going
// deeper. ⚠️ NOT sorted by what you own -- a shelf that reshuffles as you collect destroys the one thing
// a collection screen is for, which is knowing where a given card LIVES and seeing its hole.
// How many Monster Cards exist, for the panel's own heading. The SHELVING -- a row per map, bosses in
// with that map's wanderers -- lives in GroveCards.js now, because that is the thing that draws it; a
// second copy of the grouping here would be the same rule in two homes.
const CARD_TOTAL = Object.keys(GROVE_EMBLEMS).length;

import GroveCards from "@/components/grove/GroveCards.js";
import GroveStatues from "@/components/grove/GroveStatues.js";
import GroveMenu from "@/components/grove/GroveMenu.js";
import Area from "@/components/grove/GroveArea.js";
import dynamic from "next/dynamic";

import GroveToolSheet from "@/components/grove/GroveToolSheet.js";

// ⚠️ LOADED ONLY WHEN SOMEBODY WALKS TO IT. TownClient is 5,500 lines with its own camera, polling
// and stylesheet; statically imported it would ride in the Grove's bundle for every player who never
// leaves the forest. ssr:false because it is only ever reached by a tap, so there is no first paint to
// server-render, and its state arrives over fetch anyway.
const TownClient = dynamic(() => import("@/components/TownClient"), { ssr: false });
import SkillTree from "@/components/arena/SkillTree";
import SkillPanel from "@/components/arena/SkillPanel";
import { qualityBand } from "@/lib/marketplace/grove-forge.js";
import { useColiseum } from "@/components/grove/useColiseum";
import GroveMarshal from "@/components/grove/GroveMarshal";
import { CHARM_STAT_LABEL, QUALITY_BANDS, bandTint } from "@/lib/marketplace/grove-forge.js";
// ⚠️ THE TOOL VOCABULARY SURVIVES THE BENCH. A member who already holds a tool still has a slot, a tier
// and a numeral to show, and GroveToolSheet still reads all three — only the recipes that MADE them are
// gone. See item R in docs/grove-feedback-backlog.md.
import {
    TOOL_SLOTS, toolBonusPct, TOOL_TIER_CAP, toolNumeral,
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
// ── ⚠️ THE ROWS CARRY LIVE COUNTS ───────────────────────────────────────────────────────────────────────────
// Luke, 2026-10-30: "when you get a bunch of items from enemies, it is not clear at all what you're
// supposed to do with them... it's also not clear that there's a menu on the left. So we need a ramp to
// teach people what the game loop is."
//
// GroveMenu shows the SUM of every row's badge on the closed button, so a shut menu can still say there is
// something inside.
//
// ⚠️ THE RAMP THIS WAS BUILT FOR IS GONE, AND SO IS MOST OF THE BADGING. The ramp was "kill something, a
// part drops, the closed menu grows a count, the Workbench row is the one lit" — which taught
// parts-make-things with no words at all. Parts and the Workbench were both deleted on 2026-11-08, so
// Statues is the only row still carrying a number. If a new ramp is ever wanted it has to be built out of
// what the Grove still does, not restored from here.
//
// ⚠️ EVERY BADGE MUST STILL BE CLEARABLE. Luke: "you can like never get rid of the bubbles." Statues
// counts only ones still unspent; the Backpack, which is never empty once you are playing, deliberately
// carries nothing.
// ⚠️ NO SUBTITLES. Luke, looking at the open drawer: "we dont need descriptions for the menu items."
// GroveMenu still renders `note` when a row carries one; nothing does any more.
const familiesFor = ({ statuesHeld = 0 } = {}) => [
    {
        title: "Go", rows: [
            { k: "map", label: "Map", art: "/images/grove/ui-map.webp" },
            // ✂️ THE QUESTS ROW WAS HERE, between Map and Town, carrying a ready-to-hand-in badge.
            // ⚠️ TOWN IS A PLACE IN THE GROVE, NOT A WAY OUT OF IT. Luke: "if you go to town, you
            // completely get booted out of the Grove. Like, the whole experience is lost... when you're
            // in the town, it should be like you're in any other zone of the Grove with the menu on the
            // left and still in that experience."
            //
            // ⚠️ THE SPRITE IS THE NAV'S OWN TOWN ART, NOT A NEW ONE. It already exists, it is already
            // in the house style, and drawing a second town would cost money for a picture of a thing
            // that has a picture. [[no-icons-or-glyphs-in-the-game]] asks for a sprite, not for a NEW one.
            { k: "town", label: "Town", art: "/images/nav/town.png" },
        ],
    },
    {
        title: "Carry", rows: [
            // ✂️ BACKPACK AND GEAR WERE HERE, removed 2026-11-09 with the panels behind them.
            { k: "emblems", label: "Monster Cards", art: "/images/grove/ui-cards.webp" },
            // ⚠️ A SCREEN WITH NO DOOR IS NOT SHIPPED. The statue vendor is reachable from the menu the
            // moment it exists, not from a panel somebody has to already know about.
            { k: "statues", label: "Statues", art: "/images/grove/ui-emblems.webp", badge: statuesHeld || 0 },
        ],
    },
    // ── ✂️ THE "Train" FAMILY WENT WITH THE CLASS ROOM ───────────────────────────────────────────
    // It was given its own family rather than a row under "Carry" on Luke's instruction: "I hate the fact
    // that the you have class specific details that are in the monster cards area... it should have a
    // completely different area where that lives in its own menu item." Go / Carry / Train / Make was four
    // verbs; Make went with the workbench and Train has gone with the class. Two left.
    // ✂️ THE "Make" FAMILY WAS HERE, holding the Workbench. Go / Carry / Train is three verbs now.
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

// ✂️ `emptyCells` was here. It drew the Backpack's unused slots so the void read as room rather than
// as a mistake — "a lot of void in the area where we show the items." No grid, no capacity, no cells.

// Draws any Grove object by id -- groveArt resolves them all. It drew parts, then food; both are gone,
// and it is kept for the shelves that still name an object beside a sprite.
const PartIcon = ({ id, size = 34 }) => {
    const art = groveArt(id);
    if (!art) return null;
    return <img className="gv-ico" src={art} alt="" width={size} height={size} />;
};

// ── WHICH MAP THE PLAYER IS LOOKING AT ───────────────────────────────────────────────────────────────────
// Module level, and that is the point: it is needed ONCE near the top (the return note, which is a hook and
// so must sit above the closed-Grove early return) and again in the render far below. A second copy of this
// three-line rule in the effect is the pair that drifts — the deepest OPEN map, unless the atlas has been
// scrolled to another one.
function pickShownMap(zones, paperMap) {
    const zoneMaps = [...new Set((zones || []).map((z) => z.map || 1))].sort((a, b) => a - b);
    const openMaps = zoneMaps.filter((m) => (zones || []).some((z) => (z.map || 1) === m && z.unlocked));
    const deepestMap = openMaps.length ? openMaps[openMaps.length - 1] : 1;
    const shownMap = paperMap && zoneMaps.includes(paperMap) ? paperMap : deepestMap;
    return { zoneMaps, openMaps, shownMap };
}

// `initialView` / `initialTown` come off the URL the return door built — see grove-return.js. They are the
// other half of that door: without them it would land on the Grove's front step rather than in the room the
// note names, which is the behaviour being fixed.
export default function GroveClient({ initial, initialView = null, initialTown = null }) {
    // Which map the paper is showing. ⚠️ UP HERE WITH THE OTHER HOOKS, not beside the code that uses
    // it: that sits after the "not signed in" early return, and a hook called conditionally changes
    // the hook ORDER between renders, which React treats as a different component.
    const [paperMap, setPaperMap] = useState(null);
    // Which part's sheet is open, or null. See GrovePartSheet.
    // Which tool's sheet is open, or null. See GroveToolSheet.
    const [toolView, setToolView] = useState(null);
    const [st, setSt] = useState(initial);
    // map | zone | town | bag | bench | emblems
    // ⚠️ zone IS NOT RESTORABLE and is not accepted here — a run holds a live server session that a URL
    // cannot rebuild, so `view=zone` would open a Grove with no session and render nothing. grove-return.js
    // stamps a zone's MAP for the same reason; this is the second half of that rule, kept beside the first.
    const [view, setView] = useState(initialView === "town" ? "town" : "map");

    // ── ⚠️ THE TOWN IS FETCHED WHEN IT IS OPENED, NEVER WITH THE GROVE ────────────────────
    // getTownState is described in TownClient's own notes as the highest-volume request in the app.
    // Computing it on the Grove's server render would bill it for every member who opens the forest and
    // never walks to the street — the exact family-A mistake CLAUDE.md opens with: reaching for the
    // convenient existing call instead of the narrow one. Null until asked for, once per visit.
    //
    // ── ⚠️ AND IT IS FETCHED FOR A PARTICULAR TOWN ───────────────────────────────────────
    // Luke: "when I go to the deep delve camp, it apparently takes me back to the first town and not the
    // new town."
    //
    // It did. GroveAtlas hands `onTown` the town it drew the card for, and this component used to drop
    // that argument on the floor — so all seven cards opened one street, asked this route with no `?town=`,
    // and got `town: null` back. TownClient reads null as "an account from before gating" and paints its
    // original default cobbles, which ARE the first town as far as anybody looking at it is concerned. The
    // camp was never sending anyone anywhere; nothing had ever told the street which town to be.
    //
    // ⚠️ THE FETCHED TOWN IS PART OF THE STATE, not a second flag. The old guard was `|| townState` — once
    // ANY town had been loaded it never fetched again, so walking map 2 → map 3 would have shown Deepdelve
    // a second time even after the number was threaded through. `n` is what it was ASKED for rather than
    // what came back, because the server answers `null` for anyone the preview does not apply to and
    // comparing against that would refetch on a loop.
    const [townState, setTownState] = useState(null); // { n, data }
    const [townN, setTownN] = useState(Number(initialTown) || null);
    useEffect(() => {
        if (view !== "town" || townState?.n === townN) return undefined;
        let gone = false;
        const want = townN;
        fetch(`/api/marketplace/town${want ? `?town=${encodeURIComponent(want)}` : ""}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((d) => { if (!gone && d && !d.error) setTownState({ n: want, data: d }); })
            .catch(() => {});
        return () => { gone = true; };
    }, [view, townState, townN]);
    // ── ⚠️ THE GROVE WRITES DOWN WHERE IT IS, AND NOTHING ELSE HAS TO ───────────────────────
    // Luke: "if I go to the forge in act 2 town I want to easily go right back to where I was in
    // town. And this applies to every feature."
    //
    // This is the whole mechanism, and grove-return.js has the reasoning for why it is one effect
    // here instead of a parameter on every link out: the ways out are not a list anybody can hold —
    // fifteen buildings on the street, the nav bar, the menu handle, a sheet's deep link, the
    // Tavern, a push notification. Decorating them means finding them all, and the one that is
    // missed silently reverts to the old behaviour and looks identical to one nobody did yet.
    //
    // So the note is kept current as you move around in here, and whatever takes you out leaves it
    // behind. GroveReturnDoor, mounted once in the marketplace layout, is what reads it.
    //
    // ⚠️ UP HERE WITH THE OTHER HOOKS, for the reason the note on paperMap gives: everything below
    // the closed-Grove branch is after an early return, and a hook there is called conditionally.
    useEffect(() => {
        const { shownMap } = pickShownMap(st?.zones, paperMap);
        stampGroveReturn(groveSpot({
            view,
            townN,
            townName: TOWNS.find((t) => t.n === townN)?.name,
            mapName: (st?.zones || []).find((z) => (z.map || 1) === shownMap)?.mapName,
        }));
    }, [view, townN, st, paperMap]);

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
    // ── ⚠️ THE BAR'S TOOL CARD, AND WHY ONLY TOOLS GET ONE ──────────────────────────────────────
    // The bar pays two kinds of thing and they are not the same size of moment. A tool is one of twelve
    // for the whole map tier and it changes a number in another system — fishing, mining, the arena —
    // so it earns the full card. A chest is the repeatable reward every six minutes for ever after, and
    // it lands in the stash where chests already live; a card for that would be a card nobody reads by
    // the tenth one, which is how a game teaches you to tap through its celebrations. Chests take the
    // note instead. [[no-pity-progress-bars]] is the same judgement from the other end.
    // `{ phase: "shaking"|"open", art, won: [...] }` — the chest the bar paid, and what came out of it.
    const [toolWon, setToolWon] = useState(null);
    const [bossWon, setBossWon] = useState(null);
    // The charm armed for the next dive, or null. ⚠️ NOT PERSISTED AND DELIBERATELY SO — arming is a
    // choice about the run you are about to take, and a choice that survived a reload would be spent on
    // a dive the player had forgotten they armed it for.
    const [charmPick, setCharmPick] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
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

    // ── ✂️ THE QUEST MACHINERY WAS ALL HERE ─────────────────────────────────────────────────────────
    // Luke, 2026-11-08: "Remove all quest givers and quests." Five things went:
    //
    //   · `questTick`   — the toast over the zone when a step advanced mid-fight
    //   · `giverOpen`   — whether the person standing in this zone was being talked to
    //   · `refreshBoard` — a small GET that re-read the board after anything that could change it,
    //                      because `session` is written once by enter() and froze the giver otherwise
    //   · `claimStep` / `acceptStep` — both POSTs to the deleted /grove/quests route
    //
    // ⚠️ refreshBoard ALSO REFRESHED THE COLISEUM, which is why takeColiseumKey below had to change
    // rather than simply lose a line: it leaned on this function to get the new key count back.
    // Whether the marshal's card is open. Not a zonePanel: those replace the scene, and this is a thing
    // standing IN the scene that you are talking to without leaving it.
    const [marshalOpen, setMarshalOpen] = useState(false);

    // ⚠️ RETURNS WHETHER IT WORKED, so the card can say so. The silent version of this call is the bug the
    // card exists to fix; a claim that fails and also says nothing is the same bug wearing a hat.
    //
    // ⚠️ IT GOES THROUGH useColiseum NOW, not the deleted quests route. takeKey hands back this map's
    // fresh state, which is merged into the session here — without it `dailyReady` stays true and `keys`
    // stays 0 for the rest of the visit, so the button re-offers a key you already took and the card
    // still says you have none.
    const takeColiseumKey = useCallback(async (map) => {
        const j = await col.takeKey(map);
        if (j?.state) {
            setSession((prev) => (prev ? { ...prev, coliseum: { ...prev.coliseum, ...j.state } } : prev));
        }
        return Boolean(j?.ok);
    }, [col]);

    // ── ENTER A ZONE ────────────────────────────────────────────────────────────────────────────────
    const enter = useCallback(async (zone) => {
        // ⚠️ THE CHARM GOES WITH THE ENTER, so choosing one and burning it are a single request. The
        // server returns what it actually took — a charm already spent in another tab comes back null —
        // and the pick is cleared either way, because an armed charm that survived the dive would be
        // spent again on the next one without the player choosing to.
        const d = await post({ action: "enter", zone: zone.id, charm: charmPick || undefined });
        if (!d?.ok) { setNote(d?.error === "locked" ? "That one is still closed." : "Couldn't go in."); return; }
        setCharmPick(null);
        if (d.charm) setNote(`${d.charm.name} burning — ${CHARM_STAT_LABEL[d.charm.stat] || "bonus"} +${d.charm.value}%`);
        // ── ⚠️ THE SESSION IS THE ENTER RESPONSE, NOT FOUR FIELDS COPIED OUT OF IT ──────────────
        // This used to be { zone, seed, bonuses, charm } — hand-listed — while the scene below reads
        // session.npcHere, session.coliseum and session.gearArt. All three were dropped on the floor
        // here, so:
        //
        //   · THE THREE QUEST GIVERS PER MAP NEVER APPEARED IN A ZONE. 21 people, 71 chain steps,
        //     21 drawn portraits, authored zones, a whole dialogue system — and .gv-npc rendered
        //     zero times, because `session.npcHere` was always undefined. The server has been
        //     sending it correctly the entire time.
        //   · THE COLISEUM MARSHAL likewise, and with him the only non-daily source of a token.
        //   · gearArt, so the scene drew whatever its fallback is instead of the player's own gear.
        //
        // Nothing errored. The zone rendered perfectly, just empty of people, which is exactly what
        // an unvisited forest is supposed to look like — the failure had no symptom to notice.
        //
        // Spread, so a field the server starts sending arrives here without anybody remembering to
        // add its name to a list. The list was the bug.
        setSession({ ...d, charm: d.charm || null });
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
        const d = await post({ action: "settle", zone: session.zone.id, kills, eaten: eaten || {} });
        if (!d?.ok) return;
        await refresh();
        // ── ✂️ FOUR OTHER NOTES USED TO COMPETE FOR THIS LINE ───────────────────────────────────────
        // In priority order they were: a FULL BAG ("left Damp Moss behind, bank something"), a recipe
        // that just became craftable (newlyReady, comparing the two bags so the transition announced
        // itself once rather than on fifty consecutive kills), and a part seen for the first time.
        //
        // All three were about parts, and all three are gone with them — including the overflow line,
        // which is worth a word because it was the hardest-won of the four: the server had returned
        // `overflow` since it was written and no screen had ever read it, so a player with a full bag
        // watched loot pop, heard it collected, and never received it. There is no bag cap any more.
        //
        // Gear is the only thing a settle can now announce, which makes this simpler than it has ever
        // been: one kind of thing drops, and the note names it.
        // ── ⚠️ GEAR ON THE RECEIPT, NOT JUST IN THE BAG ───────────────────────────
        // settle grants it and now returns it; the scene already shouted the piece's name on the kill.
        // This is the half that survives the shout: the note names what you walked away with, and it
        // outranks a craft-ready nudge because a piece of gear is the rarer thing by two orders.
        const gearGot = Array.isArray(d.gear) ? d.gear : [];

        // ── ⚠️ THE BAR MOVES OFF THE SETTLE'S OWN RESPONSE, NOT A REFETCH ───────────────────────────
        // The server returns the new progress because it just computed it. Asking /api/marketplace/grove
        // for it instead would be a second round trip per settle for a number that was already in the
        // reply — the exact shape CLAUDE.md opens with. Merged into the session rather than replacing it,
        // so nothing else the session holds is lost.
        if (d.bar) setSession((prev) => (prev ? { ...prev, bar: { ...prev.bar, ...d.bar } } : prev));

        // ── ⚠️ EVERY BAR PAYOUT OPENS THE CHEST, WHATEVER IS IN IT ──────────────────────────────────
        // Luke: "it should show a chest, and when that chests bumps around and opens, it reveals what I
        // get."
        //
        // This used to fork: a tool took a card, a chest took a one-line note. That fork is the thing the
        // bar now promises against — the strip shows a closed chest for both, so BOTH have to open one.
        // A chest on the bar that resolves into a text note would be the screen going back on its word.
        //
        // One settle can cross several fills (see the loop in bumpBar), so the whole list goes in and the
        // reveal shows all of it. `chestArt` rides the bar for the shaking phase; d.bar is this settle's
        // copy and session.bar is the one already on screen, which covers the first fill of a visit.
        const paid = Array.isArray(d.bar?.paid) ? d.bar.paid : [];
        if (paid.length) {
            // ⚠️ NO SPRITE, NO SHAKE. Chest art is admin-generated and can simply be absent for a tier
            // (see chest-art.js), and a rattle phase with nothing in it is 1.2 seconds of blank screen
            // between the player and their reward — strictly worse than no anticipation at all. The
            // anticipation is a bonus; the reveal is the thing that must always happen.
            const chestArt = d.bar?.chestArt || session?.bar?.chestArt || null;
            setToolWon({
                phase: chestArt ? "shaking" : "open",
                art: chestArt,
                won: paid,
                key: `${Date.now()}`,
            });
        } else if (gearGot.length) {
            // ── ⚠️ GEAR ON THE RECEIPT, NOT JUST IN THE BAG ───────────────────────────
            // settle grants it and returns it; the scene already shouted the piece's name on the kill.
            // This is the half that survives the shout. It sits BELOW the bar's rewards because a bar
            // reward is the thing the player was deliberately working toward, and gear is luck.
            setNote(gearGot.length === 1
                ? `${gearGot[0].name} dropped — it is in your bag`
                : `${gearGot[0].name} and ${gearGot.length - 1} more dropped`);
        }
    }, [session, refresh]);

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
        await refresh();
        // ✂️ THE BOSS USED TO ANNOUNCE WHAT ITS HAUL FINISHED. It handed over the largest single pile
        // of parts in the feature, so it was the likeliest thing to complete a recipe. It pays no parts
        // and there are no recipes; the kill card owns the celebration on its own now.
    }, [session, refresh]);

    const leave = useCallback(() => { setSession(null); setView("map"); setBossWon(null); refresh(); }, [refresh]);

    // ── ✂️ `goToArea` WAS HERE ──────────────────────────────────────────────────────────────────────
    // Luke: "we also need the ability to go see where to go look at the item, because people have no idea
    // where to go after they craft it. Like, it's just completely like disappeared."
    //
    // It switched view, opened the target Area, scrolled to it and flashed it — and optionally scrolled on
    // to one row inside it. Every caller was a craft result or a tool sheet pointing at a bench row.
    //
    // ⚠️ TWO THINGS IT LEARNED THE HARD WAY, FOR WHOEVER NEEDS THIS AGAIN: the scroll has to wait a frame
    // (setView re-renders the panel, and the target does not exist in the DOM until that paint lands, so
    // scrolling in the same tick silently does nothing and looks like a dead button), and a collapsed
    // shelf has to be OPENED before being scrolled to, or "where did it go" is answered with a closed lid.

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
    // ── ✂️ `benchReady` WAS HERE ────────────────────────────────────────────────────────────────────
    // Luke: "little wolf not crafting, we should find a way to guide and condition him." The bench said
    // "5 READY" but only once opened, so the count came out onto the zone dock button — a number on a
    // door, which is how this game teaches everything. There is no door and nothing to count.

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
            // ✂️ `skills` and `groveVuln` went with the engine that read them.
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
    // ✂️ `arena` and `arenaBusy` went with the room they fed.
    // ✂️ THE ARENA FETCH WENT WITH THE CLASS ROOM. It was deliberately lazy — only on opening the panel,
    // never on the hot path — because a round trip is the meter that bills. Now it is never.

    // ✂️ arenaAct went with the class room — it posted node takes, refunds and respecs.

    const statueCount = useMemo(() => (st?.statues?.lines || [])
        .reduce((a, l) => a + Object.values(l.held || {}).reduce((x, n) => x + n, 0), 0), [st?.statues]);



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

    // ── ⚠️ THREE PHASES, BECAUSE ANTICIPATION HAS TO BUILD AND NOT JUST LAST ────────────────────────
    // Luke: "its a little too fast it should spend more time hyping uo thr chest opeming."
    //
    // The first pass was a flat 1.2s rattle borrowed from the loot opener. Two things were wrong with it.
    // It was short for what it is announcing — a loot chest is a tap, this is 250 kills — and a rattle at
    // ONE intensity for its whole life is a loop, not a build. A loop tells you nothing is coming; it is
    // the CHANGE in tempo that says something is about to give.
    //
    // So: 1.4s of ordinary rattle, then 1.1s of it visibly losing the fight — faster, brighter, straining
    // — and then it opens. 2.5s in total, about double, and the second half is the half that sells it.
    useEffect(() => {
        if (!toolWon) return undefined;
        if (toolWon.phase === "shaking") {
            const t = setTimeout(() => setToolWon((p) => (p ? { ...p, phase: "crescendo" } : p)), 1400);
            return () => clearTimeout(t);
        }
        if (toolWon.phase === "crescendo") {
            // ⚠️ THE SOUND FIRES ON THE OPEN, NOT ON THE SHAKE. Landing it at the start would spend the
            // payoff on the anticipation and leave the reveal silent, which is the wrong way round.
            const t = setTimeout(() => setToolWon((p) => (p ? { ...p, phase: "open" } : p)), 1100);
            return () => clearTimeout(t);
        }
        celebrateUnlock();
        const t = setTimeout(() => setToolWon(null), 6000);
        return () => clearTimeout(t);
    }, [toolWon]);

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

    // ⚠️ DECLARED HERE AND DROPPED INTO BOTH RETURNS, for exactly the reason popNode is. The bar fills
    // on a settle, and the settle that matters most is the one firing as you LEAVE a zone — which is the
    // moment the zone view unmounts. A card rendered only inside the zone would be destroyed by the
    // thing that triggered it.
    const toolNode = toolWon ? (
        /* ── ⚠️ THE GAME'S OWN CHEST SEQUENCE, NOT A SECOND ONE ──────────────────────────────────────
           .chest-stage / .chest-glowpad / .chest-shake / .chest-img-big are the classes the loot chest
           opener already uses, and they live in globals.css rather than in a component — so the Grove's
           chest rattles at exactly the rhythm, glow and scale the Den's chests do. A bespoke one here
           would be a second answer to "what does opening a chest look like", and the first thing to drift.

           ⚠️ NOT DISMISSIBLE WHILE IT SHAKES. A tap during the anticipation would skip the only beat that
           makes the reveal land, and a player tapping to get on with a fight would never see what they
           earned. It takes taps once it is open. */
        <div className="gv-pop" onClick={toolWon.phase === "open" ? () => setToolWon(null) : undefined}>
            {toolWon.phase !== "open" ? (
                <div className={`chest-stage${toolWon.phase === "crescendo" ? " is-crescendo" : ""}`}>
                    <div className="chest-glowpad" style={{ "--chest": "#ffd75e" }} />
                    <div className="chest-shake">
                        {toolWon.art ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img className="chest-img-big" src={toolWon.art} alt="" />
                        ) : null}
                    </div>
                    <p className="chest-opening">Opening…</p>
                </div>
            ) : (
                <div className="gv-pop-card">
                    <span className="gv-pop-rays" aria-hidden="true" />
                    <span className="gv-pop-kicker">
                        {toolWon.won.length > 1 ? `${toolWon.won.length} rewards` : "The chest held"}
                    </span>
                    {/* ⚠️ EVERY REWARD THE SETTLE PAID, NOT JUST THE BEST ONE. A long session can cross
                        several fills at once, and a card that showed one of four would be the summary
                        quietly under-reporting — the same rule the bulk chest reveal is built on. */}
                    {toolWon.won.map((w, i) => (
                        <span className="gv-pop-won" key={`${w.kind}-${w.slot || w.tier}-${i}`}>
                            {w.art ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img className="gv-pop-tool" src={w.art} alt="" width={88} height={88} />
                            ) : null}
                            <b className="gv-pop-name">
                                {w.kind === "tool" ? `${w.name} ${w.numeral || ""}`.trim() : (w.label || "A chest")}
                            </b>
                        </span>
                    ))}
                    <span className="gv-pop-go">Tap to continue</span>
                </div>
            )}
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
    // ⚠️ THE TRAIL STOPS WHERE YOU DID. Drawing the whole route in confident ink would tell a new player
    // the shape of a map they have not earned; drawing none of it loses the one thing the chart is for.
    // Faint for the whole journey, inked as far as you have actually walked.
    // ── WHICH MAP THE PAPER IS SHOWING ───────────────────────────────────────────────────────────────
    // Twelve zones to a map and twelve maps, so the chart shows ONE of them. It opens on the furthest map
    // you have reached rather than on map one, because the place you are working is the place you want to
    // look at; the arrows walk back through the ones you have opened.
    const { zoneMaps, openMaps, shownMap } = pickShownMap(st.zones, paperMap);
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
            {/* ⚠️ previewTown IS NOT BELT AND BRACES. TownClient re-polls the route on a timer and reads
                `?town=` off window.location to carry the preview through — which works on the town PAGE and
                cannot work here, because the URL is /marketplace/grove with no query. Without the prop the
                first paint would be Deepdelve and the next tick, six seconds later, would quietly put
                Rootwood back. */}
            {townState?.data
                ? (
                    <TownClient
                        initial={townState.data}
                        previewTown={townState.n}
                        /* ⚠️ THE FIRST ZONE OF THIS TOWN'S MAP, NOT ZONE 1 OF THE GROVE. Each town sits at
                           the head of its own map, so "the first area" means a different zone in each one —
                           sending every town to zone 1 would walk a player in Deepdelve back to Rootwood.
                           Resolved from the catalogue with zonesOfMap, the same source the map panel uses. */
                        onGrovePortal={() => {
                            const first = zonesOfMap(townState.n)[0];
                            if (first) travel(first.n);
                        }}
                    />
                )
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
                        //
                        // ⚠️ AND IT TAKES THE TOWN. The atlas has always passed it; ignoring it is what made
                        // every card in the column open the same street. See the fetch above.
                        onTown={(t) => { setTownN(Number(t?.n) || null); setView("town"); }}
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
                    {/* ── ✂️ THE WISHLIST PLATE WAS HERE ─────────────────────────────────────────────
                        A shopping list of PARTS, kept client-side, shared between the map, the bag
                        and the bench. Luke: "you can tap to remove similar to how yoi add. And an
                        abikity to clear your wishlist."

                        It only ever held parts, so it went with them. Two rules it was built on are
                        worth keeping in mind for whatever replaces it: the plate was rendered ONLY
                        when it had something in it, because a permanently docked empty strip spends a
                        row of the most cramped surface in the game on a feature most sessions never
                        use — and adding and removing were the SAME tap, because two gestures for one
                        idea is a thing the player has to learn instead of just doing. */}
                    </div>
                ) : null}

                {/* ── ✂️ THE GEAR PANEL WAS HERE ─────────────────────────────────────────────────
                    It answered "the grove is not doing a good job showing you your gear" by rendering
                    the game's own loadout inside the Grove -- the same endpoint and the same equip call
                    as the main screen, never a Grove-local copy.

                    ⚠️ SO REMOVING IT REMOVES A VIEW, NOT ANY GEAR. Everything it showed is on
                    /marketplace/inventory, which is where gear lives. What goes with it is the
                    convenience it was built for: a sword that drops in a zone is now equipped by
                    leaving the zone, and the note below is right that leaving is not a free action.
                    Eric's call, 2026-11-09; worth re-reading that original complaint if drops start
                    feeling like a chore. */}
                {/* ── ✂️ THE QUESTS PANEL WAS HERE ───────────────────────────────────────────────────
                    The board, the Coliseum card inside it, a hand-in shortcut that went through the
                    same claimStep the giver used so a menu hand-in could not pay differently from one
                    in the world, and a "Go to" that walked you to the zone rather than naming it.

                    ⚠️ THE COLISEUM IS STILL REACHABLE — it was a card INSIDE this panel, but it is
                    also a building standing in its own zone, which is how the marshal is reached.
                    That was checked before this came out. */}

                {/* ── ✂️ THE BACKPACK PANEL WAS HERE, AND WITH IT THE BELT, THE CHARMS AND THE TOOL SHELF ──
                    Eric, 2026-11-09: "we can remove the gear menu item and the backpack. And the moss
                    poultive and the idea of a belt woth potions".

                    The grid had already gone with parts on 2026-11-08, which left three shelves behind
                    one door, and they leave for three different reasons:

                      THE BELT    deleted outright. Nothing has been able to make a poultice since the
                                  bench went, so it could only ever run down -- four members held stock
                                  and a new member would have found an empty slot and no way to fill it.
                                  The auto-eat in GroveScene went with it, which means NOTHING HEALS
                                  mid-zone now. That is a real difficulty change, not a UI cut.

                      THE TOOLS   moved, not deleted. They are on the equipment screen under the
                                  Crafting Gear tab, which is the better home: their bonuses pay into
                                  fishing, mining, the farm and nine others, so a shelf inside the Grove
                                  was the one place they did NOT apply.

                      ⚠️ THE CHARMS  lost their only door, and this is the one to look at again. They are
                                  still spent at the mouth of a zone -- grove.js decrements
                                  mkt_grove_charm on entry -- but arming one happened HERE and nowhere
                                  else, so the thirteen charms two members still hold are now unreachable.
                                  They were already unobtainable (no faucet since the bench), so this
                                  does not strand a live loop; it finishes one that had already stopped.
                                  If charms come back they need a source AND a door, not just this panel.
                    */}

                {/* ✂️ THE WORKBENCH PANEL WAS HERE. 905 lines of GroveBench, deleted 2026-11-08. */}

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

                {/* ── ✂️ THE CLASS ROOM IS GONE FROM THE GROVE, 2026-11-08 ──────────────────────────
                    Luke: "Remove all skill effects skills and the class related screens from the grove."

                    ⚠️ THIS REVERSES ITEM B OF THE BACKLOG, which was built to the opposite brief: "the
                    whole class tree and everything, that all needs to also live in a menu in the Grove...
                    you should be able to make class selections and tree decisions from that same area in
                    the Grove." A deliberate reversal, logged, not a regression.

                    ⚠️ SkillTree AND SkillPanel ARE NOT DELETED. They are the ARENA's components and were
                    only MOUNTED here — the Arena still owns them and still uses them, which was the whole
                    argument for mounting rather than rebuilding: one place that spends gold and points.
                    Removing the mount costs the Arena nothing. */}
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
                        {/* ⚠️ THE TAB ROW IS GONE WITH THE SECOND TAB. It existed to split the shelf of
                            monster cards from the merit till; the till went with the merits, and one tab is
                            not a tablist. [[stale-css-rule-on-reshape]] applies to .gv-etabs if nothing else
                            claims it. */}
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
                        <GroveCards emblems={st.emblems || []} />
                        </Area>
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
    // ✂️ `partSheet` WAS HERE — the part's own sheet, which answered both directions of the loop:
    // backwards to which creatures carry it and which zones they live in, and forwards to every recipe
    // that wanted it. The forwards half had nowhere left to point.
    const partSheet = null;

    // Same two-returns rule as partSheet above, and the same portal target for the same reason.
    const toolSheet = toolView && mounted ? createPortal((
        <GroveToolSheet
            tool={toolView}
            onClose={() => setToolView(null)}
            // ✂️ `onGoRecipe` was here. The sheet priced the next rung against the bag and offered a
            // door straight to that row at the bench — "it came out Fine, which a rework can still
            // re-roll". Every route it offered ended on a bench row, so all of them are gone.
        />
    ), fsHost || document.body) : null;

    if (view === "zone" && session) {
        return (
            <div className="gv">
                <GroveScene
                    zone={session.zone} seed={session.seed} bonuses={session.bonuses} gearArt={session.gearArt}
                    // ✂️ npcHere, questsReady and questsActive were passed here — the figure the scene
                    // drew in a zone a giver stood in, and the two counts behind its badge.
                    // ── ⚠️ THE COLISEUM IS IN A ZONE, SO IT IS DRAWN IN THAT ZONE ───────────────
                    // coliseumState is keyed on MAP, which is why its card showed up identically in
                    // all twelve rooms and "Coliseum · zone 7" was a sentence about a place that did
                    // not exist. The gate and the marshal are drawn only where the data already said
                    // they were. Not during a run: the arena reuses this same scene.
                    coliseumHere={col.run || session.coliseum?.zone !== session.zone?.n
                        ? null
                        : session.coliseum}
                    // The BUILDING: straight in when you are holding a key, because walking up to the door
                    // with one is the decision. With no key it opens the marshal rather than doing nothing —
                    // a tap that silently fails is indistinguishable from a broken button.
                    onColiseum={() => {
                        const c = session.coliseum;
                        if (!c) return;
                        if (c.keys < 1) { setMarshalOpen(true); return; }
                        col.start(c.map);
                        setZonePanel(null);
                    }}
                    onMarshal={() => setMarshalOpen(true)}
                    // ✂️ `onTalk` was here — walking up to the giver opened his dialogue in the world
                    // rather than a menu. Luke: "Needs to feel like an mmo where you turn in next to them,
                    // not a panel ui form game." The marshal keeps that treatment; he is onMarshal above.
                    // ⚠️ THE ARENA REPLACES THE ZONE'S WORLD, it does not sit beside it. Handing both would
                    // put the zone's doors and its three-hundred-unit floor into a twenty-six unit room.
                    arena={col.run ? { ...col.run.plan.arena, runMs: col.run.plan.runMs } : null}
                    waves={col.run ? col.run.plan.waves : null}
                    onRunEnd={col.finish}
                    groundChests={col.chests}
                    // ⚠️ FROM THE SESSION, which groveEnter seeds and every settle updates. The scene
                    // never computes it — the server owns the bar because it owns what the bar pays.
                    bar={session.bar || null}
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
                    bagRoom={bagRoom}
                    onSettle={settle} onBoss={bossKill} onLeave={leave}
                    onTravel={travel}
                    // ⚠️ THE ZONE IS FROZEN WHILE A PANEL IS OPEN, AND IT HAS TO BE. Crafting in front of
                    // a live fight meant being eaten while reading a recipe. Both the bench and the belt
                    // are gone, so the food argument went with them — what is left is the honest one, and
                    // it was always the better half: the scene's own clock. Nothing ages, nothing
                    // respawns, and the fight you come back to is the fight you left.
                    // ⚠️ A CONVERSATION PAUSES THE ZONE TOO. The note on the giver explains it is not a
                    // zonePanel because it does not REPLACE the scene — but "does not replace" is not the
                    // same as "does not pause", and the zone has a clock: the note on this prop says an
                    // unpaused sheet "would quietly spend your food while you were not looking". Reading
                    // four lines of dialogue is exactly not looking.
                    paused={zonePanel !== null || marshalOpen}
                    onPanel={setZonePanel}
                    // Luke: "when you die it should send you back to town." ⚠️ router.push, NOT the
                    // leave handler — leaving drops you on the Grove map, which is the screen inviting you
                    // straight back into the zone that just killed you. Town is somewhere else.
                    // Dying sends you to the street, as it always did — but the street is in here now,
                    // so losing a run no longer also loses the session.
                    //
                    // ⚠️ AND IT NAMES ITS TOWN. `townN` persists across views, so a death that only set
                    // the view would drop you in whichever town you had last looked at from the atlas —
                    // die in the first forest after a glance at Deepdelve and you wake up in the cave.
                    // The town you come back to is the town for the map you died on, every time.
                    // A town sits BEFORE the map it is named for, so the town for map N simply IS town N —
                    // the same identity GroveAtlas pairs them on (`towns.find((t) => t.n === m)`).
                    onDeath={() => { setTownN(Number(session.zone.map) || 1); setView("town"); }}
                />
                {/* ⚠️ MOUNTED IN THE ZONE BRANCH, which is the one that early-returns — anything added at
                    the bottom of this file never renders here. [[groveclient-has-two-returns]]. It is also
                    not a zonePanel: a panel REPLACES the scene, and this is a person you are talking to
                    while standing in front of them. */}
                {/* ✂️ THE QUEST-PROGRESS TOAST WAS HERE — the bar that moved over the fight when a
                    step advanced, with a finished step outranking one that merely ticked. */}
                {/* ── ⚠️ PORTALLED, LIKE EVERY OTHER THING THAT COVERS THE ZONE ──────────────────────
                    Luke: "Clicking npc freezes."

                    These two were the last overlays in this branch still rendered into the PAGE TREE.
                    GroveScene portals its full-screen layer to the body (or to its own host in native
                    full screen), so anything left behind in the page tree is laid out inside a `.gv`
                    that has no content left in it — the scene having portalled itself away — and the
                    zone is painted over the top of it. Measured on a 412x915 phone: .qd-scrim, whose
                    rule is `position: fixed; inset: 0; z-index: 4200`, came out a 377x34 box at
                    (17,135); elementFromPoint over the middle of the conversation returned
                    `div.gv-world`, so every tap went to the forest instead. A real tap did not advance
                    the line, the walk-away button did not close it, and the dismiss did not either —
                    and `paused` is true the whole time the giver is open, so the scene behind it is
                    stopped as well. A dialogue that cannot be advanced or closed over a scene that is
                    not running IS the freeze that was reported.

                    The note on the sheet below already wrote down the cost of learning this once:
                    "the panel was there, the zone was paused, and the close button could not be
                    pressed, so the only way out was a reload." Same sentence, two components over.

                    ⚠️ AND THE TICK GOES WITH THEM. It is a status card over the zone and it had the
                    same fault — it just does not take taps, so it only ever looked misplaced.

                    ⚠️ fsHost || document.body, NOT document.body. A browser in native full screen
                    paints only the full-screen element's subtree, so a dialogue portalled to the body
                    is a SIBLING of the scene: in the DOM, correct in the stylesheet, and never drawn. */}
                {/* ✂️ THE GIVER'S DIALOGUE WAS HERE. He stood in the zone and you talked to him
                    without leaving it — problem, ask, work, payoff, QUEST RECEIVED. */}

                {/* ⚠️ PORTALLED, LIKE EVERY OTHER THING THAT COVERS THE ZONE. GroveScene portals its
                    full-screen layer to the body (or to its own host in native full screen), so anything
                    left in the page tree is laid out inside a `.gv` with no content in it and the zone is
                    painted over the top. Measured on a 412x915 phone, a card left behind came out a 377x34
                    box at (17,135) and elementFromPoint over the middle of it returned `div.gv-world` —
                    every tap went to the forest instead, which is what "Clicking npc freezes" was.

                    ⚠️ fsHost || document.body, NOT document.body. A browser in native full screen paints
                    only the full-screen element's subtree, so a card portalled to the body is a SIBLING of
                    the scene: in the DOM, correct in the stylesheet, and never drawn.

                    ⚠️ AND THIS IS THE COLISEUM'S ONLY DOOR NOW. The Quests panel used to hold a Coliseum
                    card as well; with that panel deleted, walking up to the marshal is the whole of the
                    way in. It was briefly cut along with the giver beside it — lint:undef caught it,
                    because takeColiseumKey was suddenly a handler nothing called. */}
                {marshalOpen && session.coliseum && mounted ? createPortal((
                    <GroveMarshal
                        coliseum={session.coliseum}
                        busy={col.busy || Boolean(col.run)}
                        onTakeKey={() => takeColiseumKey(session.coliseum.map)}
                        onEnter={() => { setMarshalOpen(false); col.start(session.coliseum.map); }}
                        onClose={() => setMarshalOpen(false)}
                    />
                ), fsHost || document.body) : null}

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
                {/* ⚠️ AND THE UNLOCK POP, same reason again. It is shared with the return below, where the
                    wrapper IS the full-screen layer and it needs no portal — so it is portalled HERE only,
                    in the branch where the zone has moved out from under it. */}
                {popNode && mounted ? createPortal(popNode, fsHost || document.body) : null}
                {/* ⚠️ PORTALLED LIKE EVERYTHING ELSE THAT COVERS THE ZONE, and to fsHost first: a
                    browser in native full screen paints only the full-screen element's subtree, so a
                    card sent to the body is a sibling of the scene and never drawn. */}
                {toolNode && mounted ? createPortal(toolNode, fsHost || document.body) : null}
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
            {toolNode}
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
                families={familiesFor({ statuesHeld: statueCount })}
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
