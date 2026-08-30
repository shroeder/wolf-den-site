// ── THE PLAZA, HELD STILL ────────────────────────────────────────────────────────────────────────────────────
// Luke: "Show me what it looks like." The party boss only exists on wave 6 of a live raid, and spawning one to
// photograph it would put a phantom raid in front of every member — so the plaza gets the same treatment the
// arena, farm, pets, sailing and compendium already have: a fixture, rendered frozen, writing nothing.
//
// TownClient polls itself every couple of seconds, so the fixture is handed in with `frozen` and the poll never
// runs. Nothing here touches the database.
import TownClient from "@/components/TownClient.js";

const member = (id, name, sprite) => ({ id, name, sprite, damage: 400 - id * 30, isYou: id === 1 });

const PARTY = [
    member(1, "You", null), member(2, "JT", null), member(3, "GrayKitsune", null),
    member(4, "Eric D", null), member(5, "Kaishiern", null), member(6, "Sunflower Jinxx", null),
];

// One shared chieftain, mid-fight, with the pack on it — plus two ordinary foes for contrast: one free, one
// already claimed by somebody else. Those three side by side are the whole point of the screenshot.
const ENEMIES = [
    { id: 901, kind: "chieftain", label: "Goblin Chieftain", emoji: "💀", art: null, tint: "#e05b6a", scale: 1.55,
      badge: "💀", hint: "The Chieftain. Drop it and the raid is won.", hp: 620, hpMax: 1170, hpPct: 53,
      x: 50, y: 74, flip: false, elite: false, chieftain: true,
      engagedBy: null, engagedName: null, engagedSprite: null, mine: false, takeable: true, shared: true },
    { id: 902, kind: "scrapper", label: "Goblin Scrapper", emoji: "👺", art: null, tint: null, scale: 1,
      badge: null, hint: null, hp: 40, hpMax: 60, hpPct: 67, x: 22, y: 78, flip: false,
      elite: false, chieftain: false, engagedBy: null, engagedName: null, engagedSprite: null,
      mine: false, takeable: true, shared: false },
    { id: 903, kind: "archer", label: "Goblin Archer", emoji: "🏹", art: null, tint: null, scale: 1,
      badge: null, hint: null, hp: 30, hpMax: 55, hpPct: 55, x: 78, y: 79, flip: true,
      elite: false, chieftain: false, engagedBy: "other", engagedName: "Nynebreaker", engagedSprite: null,
      mine: false, takeable: false, shared: false },
];

const INITIAL = {
    me: { id: "lab", name: "You", gold: 12345, sprite: null },
    buildings: [],
    others: {},
    event: {
        id: 999, kind: "goblin_swarm", name: "Goblin Swarm", emoji: "👺",
        hp: 620, hpMax: 1170, hpPct: 53, boss: false, wave: 6, totalWaves: 5,
        endsInMs: 8 * 60 * 1000, myDamage: 380, fighters: PARTY.length,
        party: PARTY,
        swarm: { wave: 6, totalWaves: 5, remaining: ENEMIES.length, enemies: ENEMIES },
    },
};

export default function TownLabPage() {
    return <TownClient initial={INITIAL} frozen />;
}
