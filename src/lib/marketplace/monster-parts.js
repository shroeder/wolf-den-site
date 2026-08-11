// ── A MONSTER IS NOT A SHIP ──────────────────────────────────────────────────────────────────────────────────
// Pure and client-safe, like ship-zones.js. The scene draws its targets from here and the server re-reads the
// same table, so it never trusts what the client claims it aimed at.
//
// ── WHAT WAS ALREADY TRUE ────────────────────────────────────────────────────────────────────────────────────
// The engine has always given a foe ONE ATTACK PER LIVE GUN (foeAims returns one order per live barrel). So a
// kraken with four "guns" already lashed four times a turn, and killing one already took an attack off it
// forever. The mechanic Luke asked for was there the whole time — wearing artillery.
//
// What was missing is that you could not TOUCH them. Gun ports are measured off ship hulls (gun-ports.js), a
// monster has no hull in that table, so encounters shipped with `ports: []` — the limbs existed, they attacked
// you every round, and there was no way to aim at one. All you could do was hit the body and wait.
//
// So this file does two things: it names the parts, and it places them.
//
// ── SEVERING IS THE WHOLE FIGHT ──────────────────────────────────────────────────────────────────────────────
// A monster's arms are its broadside. Take one and it hits you less, every round, for the rest of the fight —
// the same trade a ship's gun deck offers, but on a creature it reads as what it actually is. That gives a
// monster fight its own shape: against a ship you weigh canvas against timber, against a kraken you weigh
// "stop it hurting me" against "kill it faster", which is a different question with the same buttons.

/** What a given creature's limbs are called. Falls back to arms, which reads acceptably on almost anything. */
const LIMB_NAMES = {
    kraken: { one: "Arm", many: "arms", verb: "lashes" },
    tentacle: { one: "Tentacle", many: "tentacles", verb: "lashes" },
    serpent: { one: "Coil", many: "coils", verb: "strikes" },
    hydra: { one: "Head", many: "heads", verb: "bites" },
    swarm: { one: "Swarm", many: "swarms", verb: "swarms" },
    crab: { one: "Claw", many: "claws", verb: "snaps" },
    jaws: { one: "Jaw", many: "jaws", verb: "bites" },
    default: { one: "Arm", many: "arms", verb: "lashes" },
};

export const limbWords = (key) => LIMB_NAMES[String(key || "default")] || LIMB_NAMES.default;

// ── THE TWO THINGS YOU CAN HIT ON A LIVING FOE ───────────────────────────────────────────────────────────────
// Deliberately two, not five. The ship has three and that is already the most a player will hold in their head
// mid-fight; a creature with an eye, a maw, a heart and six arms is a menu, not a decision.
export const MONSTER_ZONES = {
    // Its arms. Small and quick, so harder to hit — and the only thing that reduces what it does to you.
    limb: {
        id: "limb", name: "Arm", char: "l", icon: "GiTentacle", tint: "#c07ae0",
        effect: "Sever it and that is one less attack, every round.",
        blurb: "It hits you once per limb. Every one you take off is damage it never deals again.",
        aim: 0.82, dmg: 0.5, sys: "guns",
    },
    // Its body. Everything else.
    body: {
        id: "body", name: "Body", char: "b", icon: "GiMonsterGrasp", tint: "#e0a552",
        effect: "Straight damage. Nothing clever.",
        blurb: "The mass of the thing. Full damage and no side effect — the shot you take when you are ahead.",
        aim: 1, dmg: 1, sys: null,
    },
};

/**
 * Where a creature's limbs sit, as fractions of the stage box.
 *
 * MEASURED IS NOT AN OPTION HERE. Gun ports are read off each hull's pixels by a scanner, because a ship's rail
 * is a real line in the art. A creature's arms are wherever the artist put them and differ on all 30-odd
 * sprites, and hand-placing them would be a table nobody maintains and that silently rots the first time a
 * sprite is redrawn.
 *
 * So they are ARRANGED: spread evenly across the lower two-thirds of the body in an arc, which is where limbs
 * are on essentially every sea-monster silhouette we have. The markers do not need to sit exactly on a painted
 * tentacle — they need to be countable, tappable, and stable between rounds, and an arc delivers all three on
 * art nobody has measured.
 */
export function limbPoints(n) {
    const count = Math.max(0, Math.min(8, Math.floor(n) || 0));
    if (!count) return [];
    if (count === 1) return [{ x: 0.5, y: 0.62 }];
    const out = [];
    const span = Math.min(0.66, 0.26 + count * 0.07);
    for (let i = 0; i < count; i += 1) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const x = 0.5 - span / 2 + span * t;
        // A shallow arc: the outer limbs ride higher than the middle ones, which reads as reaching rather than
        // as a row of buttons under the animal.
        const lift = Math.abs(t - 0.5) * 2;
        out.push({ x, y: 0.58 + lift * 0.12 });
    }
    return out;
}
