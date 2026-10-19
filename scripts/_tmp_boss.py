import io

p = 'src/lib/marketplace/grove-maps.js'
s = io.open(p, encoding='utf-8').read()

old = '''/** Every boss of every generated map, in GROVE_BOSSES shape. */
export const MAP_BOSSES = Object.fromEntries(
    GROVE_MAPS.filter((m) => m.zones).flatMap((m) =>
        m.zones.map((z) => [z.bossId, {
            id: z.bossId, name: z.bossName, art: `/images/grove/boss-${z.bossId}.webp`, boss: true,
            // Bosses are priced off their zone's depth by scaledFoe like everything else; these are the
            // depth-1 baselines map one's bosses use, so the two sets sit on one curve.
            hp: 59000, dmg: [190, 260], map: m.n,
            emblem: m.emblem?.id || null, emblemChance: 0.09,
            loot: bossLoot(m, z),
        }])));'''

new = '''// ── A BOSS IS AUTHORED AT THE DEPTH IT STANDS AT ─────────────────────────────────────────────────────────────
// ⚠️ scaledFoe DOES NOT TOUCH A BOSS. grove-catalog.js says so in capitals: the climb that turns a zone-1
// Thornling into a zone-5 Thornling would compound on a number that was already written for zone 5. So a
// generated boss has to carry its FINAL hp, and the first cut of this file gave all 132 of them 59,000 —
// map one zone one's number. The Fallen, at the edge of the world, would have had exactly as much health as
// the first thing a newcomer kills, and nothing would have flagged it: it reads as a boss, it fights, it
// dies in four swings.
//
// Map one's twelve were authored by hand at 59,000 climbing to 180,000 — x1.0267 a zone, the same hp rate
// the wanderers climb at. Extending that line is what keeps map two's first boss harder than map one's last
// rather than resetting the game.
const BOSS_HP_AT_DEPTH_1 = 59000;
const BOSS_DMG_AT_DEPTH_1 = [190, 260];
const depthMult = (rate, depth) => (1 + rate) ** (Math.max(1, depth) - 1);

/**
 * The twelve attacks a boss uses, by how it fights. A boss with no attack list never swings — the scene
 * guards on `f.attacks?.length` — so this is not decoration: it is the difference between a fight and a
 * health bar standing still.
 */
const BOSS_ATTACKS = {
    // reach/telegraph/mult mirror the A table in grove-catalog.js; kept here as plain data so this file
    // stays pure and the scene reads the same three shapes it already knows.
    slam: { kind: "slam", reach: 5, telegraph: 620, mult: 1.45 },
    sweep: { kind: "sweep", reach: 10, telegraph: 1050, mult: 0.85 },
    volley: { kind: "volley", reach: 4, telegraph: 820, mult: 0.75, shots: 3, spread: 13 },
};
// Which pattern a boss gets is decided by the ground it rules: a boss in a narrow place closes and slams,
// one in the open sweeps, one in a lit hall throws. Three kinds, twelve zones, so no map is one fight.
const BIOME_ATTACKS = {
    burrow: ["slam", "sweep"], stone: ["slam", "volley"], moss: ["sweep", "volley"],
    field: ["sweep", "slam"], bramble: ["sweep", "slam"], char: ["volley", "slam"],
    plank: ["slam", "sweep"], glow: ["volley", "sweep"], wood: ["slam", "sweep"],
    heart: ["sweep", "volley", "slam"],
};

/** Every boss of every generated map, in GROVE_BOSSES shape. */
export const MAP_BOSSES = Object.fromEntries(
    GROVE_MAPS.filter((m) => m.zones).flatMap((m) =>
        m.zones.map((z, i) => {
            const depth = zoneDepth(m.n, i);
            const hpMult = depthMult(0.0267, depth);
            const dmgMult = depthMult(0.0133, depth);
            return [z.bossId, {
                id: z.bossId, name: z.bossName, art: `/images/grove/boss-${z.bossId}.webp`, boss: true,
                hp: Math.round(BOSS_HP_AT_DEPTH_1 * hpMult / 1000) * 1000,
                dmg: [Math.round(BOSS_DMG_AT_DEPTH_1[0] * dmgMult), Math.round(BOSS_DMG_AT_DEPTH_1[1] * dmgMult)],
                attacks: (BIOME_ATTACKS[z.biome] || ["slam", "sweep"]).map((k) => BOSS_ATTACKS[k]),
                map: m.n, depth,
                emblem: m.emblem?.id || null, emblemChance: 0.09,
                loot: bossLoot(m, z),
            }];
        })));'''

assert old in s, 'boss block not found'
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('bosses: real hp by depth, and they can actually attack')
