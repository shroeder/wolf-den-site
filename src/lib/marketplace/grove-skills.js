// ── WHAT A SKILL DOES IN THE GROVE ───────────────────────────────────────────────────────────────────────────
// Luke: "it seems like you're really stuck on the description of the skills, but when it comes to the Grove, we
// have complete freedom to decide how the skills function. And honestly, like for the most part, what's going
// to be the most fun for people is having skills that do AoE ... I can see that when enemies die, they explode
// and do like AoE damage for like 60% of their health. That would be an example of like a fully leveled up
// bloodletting ... every class should have things that help them with the Grove, whether it's survivability or
// clear speed ... the most important thing for me is that the AoE and the being able to see the AoE happen."
//
// ⚠️ THE ARENA'S STAT IS NOT THE GROVE'S EFFECT, AND I WAS TREATING IT AS ONE. Every node in arena-classes.js
// is a passive percentage — Bloodletting is `lifestealBonus: 0.05` — and I kept reporting that the Grove
// "honours your class" because it fed that number into the swing. It did. It was also the least interesting
// possible reading of a node called Bloodletting. A zone is a crowd of thirty bodies on a side-scrolling
// stage; the arena is one duel on a turn bar. The same name should mean different things in those two places,
// and only one of them is a spreadsheet.
//
// So: the arena keeps the percentages, and this file says what the node does in a FOREST. The rank still comes
// from the same spent points, so nothing has to be re-earned and no second tree exists to drift.
//
// ── THE SIX PRIMITIVES ───────────────────────────────────────────────────────────────────────────────────────
// Thirty-six bespoke code paths in a 3,800-line scene is how a feature becomes unmaintainable, so every skill
// below is one of six shapes. The scene implements six things; this table composes them.
//
//   nova      damage every foe within `radius` of a point, for `share` of a reference number
//   corpse    on a kill, a nova centred on the BODY, scaled off what that body's health was
//   cleave    the blow also strikes the `n` nearest other foes for `share`
//   spread    copy a damage-over-time onto neighbours within `radius`
//   aura      a nova on a timer while a condition holds
//   self      a timed buff on the hero — speed, lifesteal, a shield
//
// `at` is when it fires: hit, crit, kill, hurt, block, guardBreak, swingN, killN, always.
// Every number is PER RANK and read at the rank the member actually has, so rank 1 is a hint of the thing and
// rank 5 is the thing. Luke: "we don't really have to worry so much about balance because it's just a fun PvE
// thing" — so these are tuned for spectacle first, with the one brake that matters kept in the scene: a nova
// cannot chain off its own kills (see novaDepth), or a dense zone is one tap and a white screen.

/** Shorthand. `s` is the per-rank share, `r` the per-rank radius in world units. */
const S = (id, name, at, kind, o) => ({ id, name, at, kind, ...o });

export const GROVE_SKILLS = {
    // ── REAVER: carnage that feeds itself. Clear speed comes from deaths causing deaths. ────────────────
    rv_rend: S("rv_rend", "Rend", "kill", "spread", {
        dot: "bleed", radius: 1.4, share: 0.18,
        grove: (n) => `A bleeding kill SPRAYS: every foe within ${(1.4 * n).toFixed(1)}u opens a wound of its own.`,
    }),
    rv_quick: S("rv_quick", "Quickblade", "swingN", "nova", {
        every: 6, radius: 5.0, share: 0.5, reach: true,
        grove: (n) => `Every ${Math.max(2, 6 - n)} swings becomes a WIDE ARC through everything in front of you for ${(50 + n * 10)}%.`,
    }),
    rv_edge: S("rv_edge", "Killing Edge", "crit", "cleave", {
        n: 1, share: 0.12,
        grove: (n) => `A crit CLEAVES through to the ${n} foe${n === 1 ? "" : "s"} behind it for ${(12 * n)}%.`,
    }),
    rv_deep: S("rv_deep", "Deep Cuts", "always", "self", {
        vuln: 0.05,
        grove: (n) => `Anything bleeding takes ${(5 * n)}% more from every source — yours, your pet's, another wound's.`,
    }),
    // ⚠️ LUKE'S OWN EXAMPLE, AND THE HEADLINE OF THE WHOLE SET.
    rv_letting: S("rv_letting", "Bloodletting", "kill", "corpse", {
        radius: 1.5, share: 0.12,
        grove: (n) => `The dead BURST. Every kill detonates for ${(12 * n)}% of that creature's own health within ${(1.5 * n).toFixed(1)}u.`,
    }),
    rv_savage: S("rv_savage", "Savagery", "kill", "corpse", {
        radius: 0.9, share: 0.1, onlyCrit: true,
        grove: (n) => `A crit that kills bursts ${(10 * n)}% harder and ${(0.9 * n).toFixed(1)}u wider.`,
    }),
    rv_riposte: S("rv_riposte", "Riposte", "hurt", "nova", {
        radius: 1.6, share: 0.22, chance: 0.12,
        grove: (n) => `Your counter becomes a RING — every foe pressed against you takes ${(22 * n)}%.`,
    }),
    rv_concuss: S("rv_concuss", "Concussive", "kill", "nova", {
        radius: 1.2, share: 0.0, stunMs: 180,
        grove: (n) => `A kill releases a concussion: everything within ${(1.2 * n).toFixed(1)}u is stopped for ${(0.18 * n).toFixed(1)}s.`,
    }),
    rv_frenzy: S("rv_frenzy", "Frenzy", "kill", "self", {
        tempo: 0.05, ms: 2600, stacks: 5,
        grove: (n) => `Each kill stacks +${(5 * n)}% swing speed for 2.6s, up to five deep.`,
    }),
    rv_scent: S("rv_scent", "Bloodscent", "hurt", "self", {
        below: 0.5, lifesteal: 0.05, tempo: 0.04,
        grove: (n) => `Below half health you turn: +${(5 * n)}% lifesteal and +${(4 * n)}% speed until you are safe.`,
    }),
    rv_exsang: S("rv_exsang", "Exsanguinate", "kill", "self", {
        healShare: 0.08,
        grove: (n) => `A bleeding thing dying pours the rest of its wound into you — ${(8 * n)}% of what was left.`,
    }),
    rv_harvest: S("rv_harvest", "Red Harvest", "killN", "nova", {
        every: 14, radius: 11, share: 1.3, atHero: true,
        grove: (n) => `Every ${Math.max(6, 15 - n * 2)} kills the forest answers: a BLOOD NOVA for ${(130 + n * 20)}% across ${11}u.`,
    }),

    // ── WARDEN: the line holds, and holding it hurts. Survivability that converts into AoE. ──────────────
    wd_bulwark: S("wd_bulwark", "Bulwark", "block", "nova", {
        radius: 1.3, share: 0.18,
        grove: (n) => `A block SHOVES: everything leaning on your shield takes ${(18 * n)}% and is pushed off.`,
    }),
    wd_ironhide: S("wd_ironhide", "Ironhide", "hurt", "nova", {
        radius: 1.1, share: 0.12,
        grove: (n) => `Blows strike SPARKS off you — ${(12 * n)}% to everything within ${(1.1 * n).toFixed(1)}u.`,
    }),
    wd_const: S("wd_const", "Constitution", "always", "self", {
        shieldPct: 0.04, everyMs: 11000,
        grove: (n) => `A plate of health regrows every 11s, worth ${(4 * n)}% of your maximum.`,
    }),
    wd_deflect: S("wd_deflect", "Deflection", "block", "cleave", {
        n: 2, share: 0.3,
        grove: (n) => `What you block comes BACK — ${(30 * n)}% of it, thrown at the ${Math.min(5, n + 1)} nearest.`,
    }),
    wd_retrib: S("wd_retrib", "Retribution", "hurt", "nova", {
        radius: 1.5, share: 0.25, chance: 0.14,
        grove: (n) => `Answer a blow and you answer the whole crowd: ${(25 * n)}% within ${(1.5 * n).toFixed(1)}u.`,
    }),
    wd_mend: S("wd_mend", "Mending", "always", "aura", {
        everyMs: 2400, radius: 0, healPct: 0.012,
        grove: (n) => `You knit as you walk — ${(1.2 * n).toFixed(1)}% of your health every 2.4s, in or out of a fight.`,
    }),
    // ⚠️ THE WARDEN'S HEADLINE. Absorb, then spend what you absorbed.
    wd_bastion: S("wd_bastion", "Bastion", "guardBreak", "nova", {
        radius: 2.2, share: 1.0,
        grove: (n) => `When your guard finally breaks it DETONATES, spending everything it absorbed across ${(2.2 * n).toFixed(1)}u.`,
    }),
    wd_grudge: S("wd_grudge", "Grudge", "hit", "nova", {
        radius: 2.0, share: 0.0, banked: true,
        grove: (n) => `Everything that got through is remembered and returned as a GROUND SLAM, ${(2.0 * n).toFixed(1)}u wide.`,
    }),
    wd_blood: S("wd_blood", "Bloodwarden", "hit", "self", {
        lifesteal: 0.02,
        grove: (n) => `+${(2 * n)}% of what you land comes back, and your companion drinks half of it too.`,
    }),
    wd_concuss: S("wd_concuss", "Concussion", "hit", "nova", {
        radius: 1.0, share: 0.0, stunMs: 150, chance: 0.08,
        grove: (n) => `A stunning blow rings out — one more foe within ${(1.0 * n).toFixed(1)}u is stopped with it.`,
    }),
    wd_thorns: S("wd_thorns", "Thornmail", "hurt", "nova", {
        radius: 1.8, share: 0.2,
        grove: (n) => `Steel answers EVERY attacker at once, not just the one that struck: ${(20 * n)}% within ${(1.8 * n).toFixed(1)}u.`,
    }),
    wd_unbreak: S("wd_unbreak", "Unbreakable", "guardBreak", "nova", {
        radius: 1.4, share: 0.0, knock: 1.0,
        grove: (n) => `Your guard breaking THROWS the crowd off you, ${(1.4 * n).toFixed(1)}u in every direction.`,
    }),

    // ── RUNECALLER: the element does the work, and the element travels. The AoE class. ──────────────────
    rc_kindle: S("rc_kindle", "Kindle", "kill", "spread", {
        dot: "burn", radius: 1.6, share: 0.2,
        grove: (n) => `A burning thing dies and the fire WALKS — everything within ${(1.6 * n).toFixed(1)}u catches.`,
    }),
    rc_ember: S("rc_ember", "Emberheart", "kill", "corpse", {
        radius: 1.3, share: 0.1, onlyBurn: true,
        grove: (n) => `A burning corpse goes off like a log in a hearth: ${(10 * n)}% of its health, ${(1.3 * n).toFixed(1)}u.`,
    }),
    rc_immolate: S("rc_immolate", "Immolate", "always", "self", {
        burnLeech: 0.03,
        grove: (n) => `Every fire burning ANYWHERE in the zone feeds you ${(3 * n)}% of its tick.`,
    }),
    rc_frost: S("rc_frost", "Frostbite", "kill", "corpse", {
        radius: 1.7, share: 0.14, onlyFrozen: true,
        grove: (n) => `A frozen thing does not fall, it SHATTERS — ${(14 * n)}% of its health as flying ice, ${(1.7 * n).toFixed(1)}u.`,
    }),
    rc_chill: S("rc_chill", "Chill", "hit", "spread", {
        dot: "chill", radius: 1.5, share: 0.5,
        grove: (n) => `The cold creeps: a chilled foe slows everything within ${(1.5 * n).toFixed(1)}u with it.`,
    }),
    rc_rime: S("rc_rime", "Rimeguard", "hurt", "nova", {
        radius: 1.9, share: 0.16, chillMs: 1200,
        grove: (n) => `Being struck sets off a FROST NOVA — ${(16 * n)}% and a hard slow across ${(1.9 * n).toFixed(1)}u.`,
    }),
    rc_ward: S("rc_ward", "Aether Ward", "guardBreak", "nova", {
        radius: 2.0, share: 0.8,
        grove: (n) => `Your ward does not fade, it BURSTS, paying out ${(80 * n)}% of what it held across ${(2.0 * n).toFixed(1)}u.`,
    }),
    rc_reservoir: S("rc_reservoir", "Runic Reservoir", "hit", "cleave", {
        n: 3, share: 0.14,
        grove: (n) => `Overflow arcs away as lightning, jumping to the ${Math.min(6, n + 2)} nearest for ${(14 * n)}%.`,
    }),
    rc_overflow: S("rc_overflow", "Runic Overflow", "swingN", "nova", {
        every: 8, radius: 4.5, share: 1.1, atTarget: true,
        grove: (n) => `Every ${Math.max(3, 9 - n)} swings drops a METEOR on your target — ${(110 + n * 15)}% across ${4.5}u.`,
    }),
    rc_might: S("rc_might", "Runic Might", "hit", "nova", {
        radius: 0.9, share: 0.1,
        grove: (n) => `Every blow carries a small blast — ${(10 * n)}% to anything standing with your target.`,
    }),
    rc_soulfire: S("rc_soulfire", "Soulfire", "hit", "cleave", {
        n: 3, share: 0.2, chance: 0.1,
        grove: (n) => `Soul-bolts peel off and SEEK the ${Math.min(6, n + 2)} nearest things for ${(20 * n)}%.`,
    }),
    // ⚠️ THE RUNECALLER'S HEADLINE AND THE BIGGEST THING IN THE FILE.
    rc_cata: S("rc_cata", "Cataclysm", "killN", "nova", {
        every: 18, radius: 16, share: 1.8, strikes: 5, atHero: true,
        grove: (n) => `Every ${Math.max(8, 19 - n * 2)} kills the sky opens: ${Math.min(9, 4 + n)} strikes walk the zone for ${(180 + n * 20)}% each.`,
    }),
};

/** Every skill a class can take, in tree order. */
export const skillsForClass = (classId) => Object.values(GROVE_SKILLS)
    .filter((s) => s.id.startsWith(classId === "reaver" ? "rv_" : classId === "warden" ? "wd_" : "rc_"));

/**
 * The live skill set for a member: every node they have ranks in, with its rank folded in.
 *
 * ⚠️ READS THE SAME SPENT POINTS THE ARENA DOES. There is no second tree and no second respec — a point
 * bought in the ring is the same point here, which is the whole reason this is a lookup table and not a
 * feature. Returns a flat array because the scene iterates it on every trigger and an object would cost a
 * Object.entries per swing.
 */
export function groveSkills(classId, taken = {}) {
    const out = [];
    for (const s of skillsForClass(classId)) {
        const rank = Math.max(0, Math.min(5, Math.floor(Number(taken?.[s.id]) || 0)));
        if (!rank) continue;
        out.push({ ...s, rank, text: s.grove(rank) });
    }
    return out;
}
