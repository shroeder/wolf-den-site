// ── THE PLAZA, HELD STILL ────────────────────────────────────────────────────────────────────────────────────
// Luke: "Show me what it looks like", then "dont make a real raid. but I need to see all the real art during
// the fights in town."
//
// The party boss only exists on wave 6 of a live raid. Standing one up to photograph it put a real raid in
// front of real members and — the last time — ended one two of them had joined. So the plaza gets what the
// arena, farm, pets, sailing and compendium already have: a fixture, rendered frozen, writing nothing.
//
// THE ART IS THE REAL ART. The first version passed `art: null` on every foe, so the plaza fell back to emoji
// and the screenshot showed 💀 and 👺 rather than the drawings — which is exactly the thing worth looking at.
// This reads mkt_town_art the same way the live page does, keyed foe_<faction>_<kind>, so every sprite here is
// the one a member actually meets. It is a SELECT and nothing else: no event, no enemies, no writes.
import { db } from "@/lib/db.js";
import TownClient from "@/components/TownClient.js";
import { GATED_BUILDINGS, TOWN_BUILDINGS, getTownArt, spaceOut } from "@/lib/marketplace/town.js";
import { DOORS } from "@/lib/marketplace/trick-or-treat.js";

export const dynamic = "force-dynamic";

// The whole roster in one shot, which is the point — five kinds side by side, and the three states a foe can
// be in: free, claimed by somebody else, and the shared boss wearing its party.
const ROSTER = [
    { kind: "scrapper", label: "Goblin Scrapper", x: 41, hpPct: 67, scale: 1, tint: null },
    { kind: "archer", label: "Goblin Archer", x: 46, hpPct: 55, scale: 1, tint: "#7ad7a0",
      engagedName: "Nynebreaker" },
    { kind: "chieftain", label: "Goblin Chieftain", x: 51, hpPct: 53, scale: 1.55, tint: "#e05b6a",
      badge: "💀", shared: true },
    { kind: "shieldbearer", label: "Goblin Shieldbearer", x: 56, hpPct: 88, scale: 1.15, tint: "#8fb4ff" },
    { kind: "elite", label: "Goblin Elite", x: 61, hpPct: 40, scale: 1.25, tint: "#ffcf6a", badge: "★" },
];

const PARTY = ["You", "JT", "GrayKitsune", "Eric D", "Kaishiern", "Sunflower Jinxx"]
    .map((name, i) => ({ id: String(i + 1), name, sprite: null, damage: 400 - i * 40, isYou: i === 0 }));

// ── ?scene=snatcher — THE DRESSED STREET, WITH A PAIL THAT IS KICKING ────────────────────────────────────
// The Candy Snatcher is a 0.3%-per-pail hash: on a real account you would wait about three weeks to look at
// him once, and there is no admin button that can make one happen (which is the point — see the note in
// trick-or-treat.js about why the roll is not a spawn). So the lab draws the real Hallowe'en street, with
// the real pails, and puts the legs in one of them.
//
// The knock itself still goes to the API, which answers 401 to a lab with no session — that is what
// `film.mjs --mock` is for. Mock the POST with { ok: true, snatcher: { candy: 1000 } } and the whole run
// plays exactly as it does on the street, because it IS the street: the only thing faked is the answer at
// the door. Nothing here writes.
async function snatcherScene() {
    const visible = [...TOWN_BUILDINGS, ...GATED_BUILDINGS.filter((b) => b.gate !== "owner")];
    const mid = Math.ceil(visible.length / 2);
    // Laid out through the real spaceOut, well included, exactly as getTownState does it — a street spaced
    // any other way would put the pails somewhere they never are.
    const laid = spaceOut([...visible.slice(0, mid), { id: "__well" }, ...visible.slice(mid)]);
    // ⚠️ AND THE HERO STANDS AT THAT DOOR, because the CAMERA FOLLOWS THE HERO and the street is ~4,841px
    // wide against a 390px phone. Parked at a hand-picked x the first film touched the kicking pail at
    // x = -428: it was a third of a screen off the left edge, the tap went nowhere, and the rig cheerfully
    // filmed 26 frames of a plaza with nothing happening in it.
    // ⚠️ NOT THE FORGE. Its porch is beside the Gourdfather, who is drawn at 150px and carries a 9.5% skirt,
    // so the placement scorer pushes that one pail 4.4% DOWN THE STREET — 200px, off the left of a phone
    // while its own building is centred. A real placement, and the wrong one to film through.
    const LEGS_DOOR = "docks";
    const initial = {
        signedIn: true,
        me: { id: "lab", name: "You", gold: 12345, sprite: null },
        // Standing five percent PAST the door, not on it, for two measured reasons. The camera follows the
        // hero and he runs to the RIGHT first, so a hero parked on the porch films a skeleton leaving the
        // frame on his opening dash (from the door itself the pail sits at x=349 of 390). And at +3 the
        // hero's own avatar stood ON the kicking pail and hid the thing being photographed.
        you: { id: "lab", name: "You", x: (laid.find((b) => b.id === LEGS_DOOR)?.x ?? 26) + 5.4, y: 80, facing: 1, inTown: true, gold: 12345 },
        art: await getTownArt().catch(() => ({})),
        buildings: laid.filter((b) => b.id !== "__well"),
        wellX: laid.find((b) => b.id === "__well")?.x ?? 20,
        players: [], others: {}, projects: [], chatLog: [],
        bonuses: {}, todo: { total: 0, byBuilding: {} },
    };
    const gourd = {
        idle: ["Mind the buckets."], greet: [], buy: [], broke: [], owned: [],
        doors: Object.entries(DOORS).map(([id, d]) => ({ id, label: d.label })),
        knocked: ["tavern", "shop"],   // a couple already done, so the three pail states are all in frame
        legs: [LEGS_DOOR],             // and this is the one with something in it
    };
    // ⚠️ frozen, like the raid scene. The plaza re-fetches itself every 15s and the lab has no session, so
    // without this the fixture is replaced by a signed-out payload a quarter of a minute in — long after the
    // rig has reported success and roughly when a long film would be getting to the interesting part.
    return <TownClient initial={initial} halloween gourd={gourd} frozen />;
}

// ── ?town=1..7 — ONE OF THE SEVEN BIOME TOWNS, WITH NOBODY GATED ─────────────────────────────────────────────
// The towns only exist for an account carrying `gated_at`, and nothing stamps that until GATING_LIVE goes on
// (see the long warning in towns.js). So the only way to look at Fenhollow was to gate a real member — which
// is how six of the seven shipped as VOIDS and stayed that way until somebody happened to look: the per-layer
// art fallback was missing and no screen in the project could show it.
//
// ⚠️ IT BUILDS THE STATE THE REAL PAGE BUILDS, from the same functions. A lab that assembles a plausible town
// by hand proves the renderer and nothing else; the fault that got shipped lived in townLayers, so the lab
// has to call townLayers. Anything hand-written here is a thing this rig cannot catch.
async function townScene(n, at) {
    const { TOWNS } = await import("@/lib/marketplace/towns.js");
    const { townStreet, getTownArt } = await import("@/lib/marketplace/town.js");
    const fsSync = await import("node:fs");
    const path = await import("node:path");

    const town = TOWNS.find((t) => t.n === n) || TOWNS[0];
    const has = (suffix) => {
        try {
            return fsSync.existsSync(path.join(process.cwd(), "public", "images", "town", "ground", `${town.id}${suffix}.webp`));
        } catch { return false; }
    };
    const layers = { id: town.id, sky: has("-sky"), fg: has("-fg"), ground: has("") };
    const art = await getTownArt().catch(() => ({}));
    // ⚠️ LAID OUT THE WAY THE SERVER LAYS IT OUT, INCLUDING THE WELL. The first cut spread the buildings by
    // hand and hardcoded wellX: 50 — which put the centrepiece straight through the Arena and had me reading
    // a collision the real game never produces. A lab that invents its own layout proves the renderer and
    // lies about the wiring; see [[declared-but-never-mounted]]. This is the same spaceOut() call, with the
    // well inserted mid-list exactly as town.js does it.
    const { spaceOut } = await import("@/lib/marketplace/town.js");
    const visible = townStreet(town.n);
    const mid = Math.ceil(visible.length / 2);
    const laid = spaceOut([...visible.slice(0, mid), { id: "__well" }, ...visible.slice(mid)]);
    const spread = laid.filter((b) => b.id !== "__well");
    const wellX = laid.find((b) => b.id === "__well")?.x ?? 50;

    // ⚠️ THE CAMERA HAS TO BE PARKED SOMEWHERE ON PURPOSE. The street is ~4,800px and the viewport shows a
    // slice; a lab that does not say where you are standing photographs whatever the default happens to be,
    // which for the first seven sheets was a stretch of empty wall. `?at=` is a percentage along the street.
    const standAt = Number.isFinite(at) ? at : (spread[0]?.x ?? 20);

    const initial = {
        me: { id: "lab", name: "You", gold: 12345, sprite: null },
        you: { x: standAt, y: 80, facing: 1 },
        art,
        buildings: spread,
        wellX,
        others: {},
        town: { ...town, layers, reached: TOWNS.filter((t) => t.n <= town.n).map((t) => ({ n: t.n, id: t.id, name: t.name, biome: t.biome })) },
    };
    return <TownClient initial={initial} frozen />;
}

export default async function TownLabPage({ searchParams }) {
    if ((await searchParams)?.scene === "snatcher") return snatcherScene();
    // ?town=3 opens Fenhollow, and so on. Numbered rather than named because the number is what every other
    // part of this feature keys on — towns.js, the gate, the act board — and a second vocabulary for the same
    // seven places is a second thing to keep in step.
    const townN = Number((await searchParams)?.town) || 0;
    if (townN >= 1 && townN <= 7) return townScene(townN, Number((await searchParams)?.at));
    const rows = await db.query(`SELECT art_key, url FROM mkt_town_art WHERE art_key LIKE 'foe_goblin_%' OR art_key = 'goblin'`)
        .catch(() => []);
    const art = Object.fromEntries((rows || []).map((r) => [r.art_key, { url: r.url }]));

    const enemies = ROSTER.map((f, i) => ({
        id: 900 + i, kind: f.kind, label: f.label, emoji: "👺", art: null,
        tint: f.tint, scale: f.scale, badge: f.badge || null, hint: null,
        hp: 100, hpMax: 100, hpPct: f.hpPct,
        x: f.x, y: 76 + (i % 2) * 2, flip: i % 2 === 1,
        elite: f.kind === "elite", chieftain: f.kind === "chieftain",
        engagedBy: f.engagedName ? "someone-else" : null,
        engagedName: f.engagedName || null, engagedSprite: null, mine: false,
        takeable: !f.engagedName, shared: Boolean(f.shared),
    }));

    const initial = {
        me: { id: "lab", name: "You", gold: 12345, sprite: null },
        art, buildings: [], others: {},
        event: {
            id: 999, kind: "goblin_swarm", name: "Goblin Swarm", emoji: "👺",
            hp: 620, hpMax: 1170, hpPct: 53, boss: false, wave: 6, totalWaves: 5,
            endsInMs: 8 * 60 * 1000, myDamage: 380, myHits: 4, fighters: PARTY.length, party: PARTY,
            swarm: { wave: 6, totalWaves: 5, remaining: enemies.length, enemies },
        },
    };
    return <TownClient initial={initial} frozen />;
}
