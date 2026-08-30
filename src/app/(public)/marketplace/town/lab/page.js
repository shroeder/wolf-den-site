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

export default async function TownLabPage() {
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
