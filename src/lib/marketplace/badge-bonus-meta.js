import { COIN_ICON } from "@/lib/coin-icon";
// EVERY STAT CARRIES ITS OWN DRAWN SPRITE. This panel was ~30 OS emoji in a grid, which renders differently on
// every device, carries none of the game's style, and reads as a settings screen rather than a character
// sheet. `art` is the sprite (scripts/gen-bonus-icons.mjs, one family, one ink weight); `icon` is kept for
// chat and log lines, where the operating system is already doing the drawing.
// Display metadata for badge bonuses — shared by the Badges page hero + the badge cards. Client-safe (pure
// data, no server-only imports). Mirrors the four bonus domains in badges.js (BADGE_BONUSES) and labels each
// stat the way its own system names it.
export const BONUS_DOMAINS = ["combat", "sea", "farm", "forge", "depth"];

import { statValue } from "@/lib/marketplace/items.js";

export const BONUS_META = {
    combat: {
        // The domain head reuses a representative sprite from the same family — one look, no extra art.
        art: "/images/bonus/might.png",
        label: "Combat", icon: "⚔️", accent: "#ff8a4c", blurb: "buffs your daily boss strike",
        stats: {
            might: { art: "/images/bonus/might.png", icon: "⚔️", label: "Might", suffix: "" },
            crit_chance: { art: "/images/bonus/crit_chance.png", icon: "🎯", label: "Crit Chance", suffix: "%" },
            crit_power: { art: "/images/bonus/crit_power.png", icon: "💥", label: "Crit Power", suffix: "%" },
            // ── FIVE STATS THE PAGE COULD NOT DRAW ───────────────────────────────────────────────────────
            // C() has paid vitality, tenacity, ferocity, fortune and pierce on every badge worth 3 or more
            // since the hard-badge rule was written, and this map knew about three combat stats — so
            // bonusChips silently dropped the rest and the Badges page under-reported every prestige badge
            // it drew. Living Legend showed "+7 Might" and said nothing about the four other columns it
            // moves. Same defect Luke reported on the Enshriner card, one screen over.
            //
            // Drawn into the same family as the other thirty (scripts/gen-bonus-icons.mjs) rather than
            // borrowing might.png: a heart in an iron band, a pauldron, a wolf's head, a pair of sixes, and
            // an arrowhead through a punched plate. Each is a DIFFERENT object from its neighbours, because
            // at 28px the silhouette is the whole of the reading — the first pierce draw was a thin spear
            // and disappeared entirely.
            vitality: { art: "/images/bonus/vitality.png", icon: "❤️", label: "Vitality", suffix: "" },
            tenacity: { art: "/images/bonus/tenacity.png", icon: "🛡️", label: "Tenacity", suffix: "" },
            ferocity: { art: "/images/bonus/ferocity.png", icon: "🔥", label: "Ferocity", suffix: "" },
            fortune: { art: "/images/bonus/fortune.png", icon: "🍀", label: "Fortune", suffix: "" },
            pierce: { art: "/images/bonus/pierce.png", icon: "🗡️", label: "Pierce", suffix: "" },
        },
    },
    sea: {
        // The domain head reuses a representative sprite from the same family — one look, no extra art.
        art: "/images/bonus/broadside.png",
        label: "Sailing", icon: "⚓", accent: "#55d3ff", blurb: "powers raids, digging & voyages",
        stats: {
            broadside: { art: "/images/bonus/broadside.png", icon: "💣", label: "Raid Damage", suffix: "" },
            ironclad: { art: "/images/bonus/ironclad.png", icon: "🛡️", label: "Ship Armor", suffix: "" },
            plunder: { art: "/images/bonus/plunder.png", icon: "🏴‍☠️", label: "Plunder", suffix: "" },
            bounty: { art: "/images/bonus/bounty.png", icon: COIN_ICON, label: "Sea Gold", suffix: "" },
            dredge: { art: "/images/bonus/dredge.png", icon: "⛏️", label: "Dig Luck", suffix: "" },
            trove: { art: "/images/bonus/trove.png", icon: "💎", label: "Fragments", suffix: "" },
            // Labelled by its EFFECT, not its name: "+3 Tailwind" reads as "three tailwinds a day" because a
            // tailwind is also a once-daily action you spend. It's actually −1% voyage time per point (cap −15%),
            // so the point value already IS the percentage — show that instead.
            tailwind: { art: "/images/bonus/tailwind.png", icon: "🌬️", label: "Voyage Speed", suffix: "%" },
            angling: { art: "/images/bonus/angling.png", icon: "🎣", label: "Angling", suffix: "" },
        },
    },
    farm: {
        // The domain head reuses a representative sprite from the same family — one look, no extra art.
        art: "/images/bonus/goldHarvest.png",
        label: "Farming", icon: "🌾", accent: "#7ed57e", blurb: "boosts your farm",
        stats: {
            growSpeed: { art: "/images/bonus/growSpeed.png", icon: "🌱", label: "Grow Speed", suffix: "%" },
            seedLuck: { art: "/images/bonus/seedLuck.png", icon: "🍀", label: "Seed Luck", suffix: "%" },
            harvestLuck: { art: "/images/bonus/harvestLuck.png", icon: "🎁", label: "Harvest Luck", suffix: "%" },
            petXp: { art: "/images/bonus/petXp.png", icon: "🐾", label: "Pet XP", suffix: "%" },
            fertPower: { art: "/images/bonus/fertPower.png", icon: "💧", label: "Fertilizer", suffix: "%" },
            goldHarvest: { art: "/images/bonus/goldHarvest.png", icon: COIN_ICON, label: "Farm Gold", suffix: "%" },
        },
    },
    depth: {
        // The domain head reuses a representative sprite from the same family — one look, no extra art.
        art: "/images/bonus/hew.png",
        label: "The Mine", icon: "⛏️", accent: "#ffb45e", blurb: "powers delving, mining & smelting",
        stats: {
            // Labelled by EFFECT, not by name — the same call sea affinity's tailwind entry made. "+4 Nerve"
            // means nothing at a glance; "Roof Safety" says what the points buy you.
            nerve: { art: "/images/bonus/nerve.png", icon: "🪨", label: "Roof Safety", suffix: "" },
            lodesense: { art: "/images/bonus/lodesense.png", icon: "🧭", label: "Seam Quality", suffix: "" },
            hew: { art: "/images/bonus/hew.png", icon: "⛏️", label: "Ore Yield", suffix: "" },
            prospect: { art: "/images/bonus/prospect.png", icon: "🔦", label: "Find Odds", suffix: "" },
            bellows: { art: "/images/bonus/bellows.png", icon: "🌬️", label: "Extra Parts", suffix: "" },
            crucible: { art: "/images/bonus/crucible.png", icon: "⚗️", label: "Slag Luck", suffix: "" },
        },
    },
    forge: {
        // The domain head reuses a representative sprite from the same family — one look, no extra art.
        art: "/images/bonus/efficient.png",
        label: "Forge", icon: "🔨", accent: "#ffb020", blurb: "improves your smithing odds",
        stats: {
            efficient: { art: "/images/bonus/efficient.png", icon: "🛠️", label: "Salvage", suffix: "%" },
            keen_eye: { art: "/images/bonus/keen_eye.png", icon: "👁️", label: "Bonus Part", suffix: "%" },
            masters_touch: { art: "/images/bonus/masters_touch.png", icon: "✨", label: "Double Forge", suffix: "%" },
            steady_hand: { art: "/images/bonus/steady_hand.png", icon: "🖐️", label: "Combo Save", suffix: "%" },
        },
    },
};

// A badge's bonus object → flat list of chips [{ domain, icon, label, text }]. Empty when the badge has none.
// ── ONE RENDERER FOR CRIT, EVERYWHERE ────────────────────────────────────────────────────────────────────────
// crit_chance is stored in POINTS — 1,000 of them is 100%, so a point is a tenth of a percent. Four separate
// surfaces each kept their own little table saying `suffix: "%"` and pasted it onto the raw number, so 10
// points of badge crit rendered as "+10% Crit Chance" when it is 1%. GrayKitsune, in the plaza: "on badges
// page it lists +10% crit chance.. is that +10 crit chance so 1% or actually +100 so correctly +10%?"
//
// He is right, and this is the same defect as the fight card printing 0.35 block as "0.35%" — a stat rendered
// by a hand-rolled string instead of by the one function that knows its unit. statValue in items.js is that
// function; every surface below now calls it.
export function bonusChips(bonus) {
    const out = [];
    if (!bonus) return out;
    for (const dom of BONUS_DOMAINS) {
        const block = bonus[dom];
        if (!block) continue;
        const meta = BONUS_META[dom];
        for (const [k, v] of Object.entries(block)) {
            const sm = meta.stats[k];
            if (!sm || !v) continue;
            out.push({ domain: dom, icon: sm.icon, label: sm.label, text: `+${statValue(k, v)} ${sm.label}` });
        }
    }
    return out;
}

// Domain totals { combat, sea, farm, forge } → only the domains that actually have any nonzero stat.
export function activeDomains(totals) {
    if (!totals) return [];
    return BONUS_DOMAINS
        .map((dom) => {
            const block = totals[dom] || {};
            const stats = Object.entries(block).filter(([, v]) => v).map(([k, v]) => ({ key: k, value: v, ...BONUS_META[dom].stats[k] }));
            return stats.length ? { domain: dom, ...BONUS_META[dom], stats } : null;
        })
        .filter(Boolean);
}

// What a badge is worth splits evenly between MIGHT and VITALITY, with tenacity taking a smaller cut. Vitality
// is meant to be exactly as common as might across gear, pets and badges alike — a game where the permanent
// layer only ever made you hit harder is the reason fights collapsed as accounts aged.
let CARVE_FLIP = 0;
const C = (might = 0, crit_chance = 0, crit_power = 0) => {
    const o = {};
    // Most badges are worth 1-3 points, so a share-of-a-share rounds badly at that size and whichever stat is
    // written first takes every leftover. The odd point alternates instead; the object literal below is
    // evaluated once in source order, so a given badge always lands the same way.
    const odd = (CARVE_FLIP++ % 2) === 0;
    const tenacity = Math.floor(might * 0.25);
    const rest = might - tenacity;
    const mig = odd ? Math.ceil(rest / 2) : Math.floor(rest / 2);
    const vitality = rest - mig;
    if (mig) o.might = mig;
    if (vitality) o.vitality = vitality;
    if (tenacity) o.tenacity = tenacity;
    if (crit_chance) o.crit_chance = crit_chance;
    if (crit_power) o.crit_power = crit_power;
    // ── A HARD BADGE PAYS ACROSS EVERYTHING ──────────────────────────────────────────────────────────────
    // The first argument is what a badge is worth, and the big numbers are the ones nobody has — Living
    // Legend, Veteran, the founding and tournament badges. Those should not be "some Might"; they should be
    // felt in every column. At 4 and above a badge also carries ferocity and fortune, so the prestigious end
    // of the collection touches all six combat stats rather than three.
    if (might >= 4) { o.ferocity = Math.max(1, Math.round(might * 0.4)); o.fortune = Math.max(1, Math.round(might * 0.4)); }
    // Pierce only at the very top — the badges almost nobody has.
    if (might >= 5) o.pierce = Math.max(1, Math.round(might * 0.6));
    else if (might >= 3) { o.ferocity = 1; }
    return { combat: o };
};
const S = (sea) => ({ sea });
const F = (farm) => ({ farm });
const G = (forge) => ({ forge });
const D = (depth) => ({ depth });   // DEPTHS affinity — the mine (see items.js DEPTH_META)

export const BADGE_BONUSES = {
    // ── Staff / identity / prestige (hand-assigned) → modest Might, a nod for the recognition ──
    owner: C(5), site_admin: C(2), secret: C(3), staff: C(2), event_coordinator: C(2), volunteer: C(1),
    judge: C(2), developer: C(2), loyal: C(2), helping_paw: C(2), mvp: C(3), opening_day: C(3), first_week: C(2),
    founding_member: C(3), tournament_champ: C(3, 2), draft_king: C(3, 2), commander: C(2), lore_master: C(2),
    featured_artist: C(2), trade_master: C(3), content_creator: C(2), og: C(3), birthday_star: C(1), generous: C(2),
    hype_master: C(2), rival: C(2, 2),
    // ── Level (prestige) → scaling power ──
    night_hunter: C(2), alpha: C(3), ascended: C(4, 3), veteran: C(5, 0, 3), living_legend: C(7, 4, 4),
    // ── Wealth / spend → power ──────────────────────────────────────────────────────────────────────────────
    // TWO different currencies live here and they were priced as if they were the same thing. Gold is FARMABLE
    // (raids, farm, voyages, dice — a patient member mints 500,000 eventually), while the spend ladder costs real
    // dollars at the counter. Before this, `whale` — $2,000 of actual money — paid +3 Might, identical to a
    // hand-assigned `og` badge, while `one_percent` (gold, grindable) paid the biggest bonus in the entire game at
    // +10/+6. So the game's own numbers said "don't bother spending money, just grind". Now the real-money ladder
    // sits ABOVE the gold ladder at every rung, and the gold ladder is compressed to match what it actually costs.
    big_spender: C(3), whale: C(5, 0, 2), high_roller_badge: C(7, 0, 4), legendary_spend: C(10, 3, 6),
    gold_hoarder: C(2), gilded: C(3), big_baller: C(4, 0, 2), one_percent: C(6, 0, 4),
    // ── The casino floor → power ──────────────────────────────────────────────────────────────────────────
    // These eight were the only badges in the game that paid nothing. They pay combat now, deliberately and
    // not chips: the floor is a sink and a badge that improved the odds would fight it. Scaled UNDER the gold
    // ladder because `casino_wagered` measures churn rather than wealth — the same purse cycled often enough
    // reaches two million without the member ever being rich.
    casino_first_pull: C(1), casino_regular: C(2),
    casino_high_roller: C(3), casino_whale: C(4, 0, 2),
    // The two secrets are luck, not grind, so they pay in crit rather than raw Might — a nod to the hit
    // rather than a wage for the hours.
    // There was a THIRD, `casino_called_it`, for naming a pocket on the wheel. It was added here because
    // check:rewards read migration 391 and found a badge paying nothing — correctly, except that the wheel
    // had been taken off the floor and its badge deleted with it, which the migrations had never recorded.
    // Migration 410 says so now, so the gate retires it the same way it retires every other one.
    casino_three_wolves: C(1, 3), casino_perfect: C(1, 0, 3),
    // The longest two on the floor: every exclusive pet, and the door behind the rope.
    casino_the_five: C(4, 2, 2), casino_vip_room: C(2),
    // ── Bounties → power ──
    bounty_poster: C(1), bounty_hunter: C(2), bounty_pro: C(3), bounty_legend: C(5, 3),
    // ── Trading → power / crit ──
    first_trade: C(1), trader: C(2), deal_maker: C(3), trader_cards_100: C(2), trader_cards_500: C(4),
    trade_value_500: C(2), trade_value_2k: C(3), trade_value_10k: C(6), high_roller: C(0, 3), whale_trader: C(0, 5),
    // ── Donations / generosity → power ──
    first_donation: C(1), generous_soul: C(2), benefactor: C(4), patron: C(2), gold_benefactor: C(3), philanthropist: C(5, 0, 3),
    // ── Events / tenure / activity / social → loyalty power ──
    event_regular: C(1), event_grinder: C(2), event_legend: C(3), event_god: C(5),
    one_year: C(2), two_year: C(4), on_a_roll: C(1), ever_present: C(3), always_here: C(4),
    well_connected: C(1), pack_leader: C(2), social_butterfly: C(3), chatterbox: C(1), town_crier: C(2),
    collector: C(1), curator: C(2), hoarder: C(3),
    // ── Wheel / mystery / credit / meta / lucky drops → power ──
    wheel_regular: C(1), wheel_devotee: C(3), jackpot: C(0, 3),
    mystery_first: C(1), mystery_big_hit: C(0, 4), mystery_20: C(3), mystery_100: C(6, 0, 4),
    // Store credit is real money out of pocket too — sits just under the direct-spend ladder (see Wealth above).
    credit_patron: C(2), credit_backer: C(4), credit_benefactor: C(6, 0, 3),
    well_rounded: C(3, 2), completionist: C(2), decorated: C(3),
    lucky_find: C(0, 3), treasure_hunter: C(4), boss_relic: C(3), mythic_find: C(0, 0, 6),
    // ── Referrals → power ──
    referral_recruiter: C(2), referral_packbuilder: C(3), referral_packleader: C(5),
    // ── Boss combat + gear tier → power ──
    boss_challenger: C(1), boss_raider: C(2), boss_slayer: C(3), boss_veteran: C(2), boss_warlord: C(4),
    boss_legend: C(6, 0, 4), boss_champion: C(0, 4), transcendent: C(5), ascendant_gear: C(3), eternal_bearer: C(8, 0, 6),
    // ── Cheer (boss-fight social) → power ──
    cheer_given_100: C(2), cheer_given_500: C(3, 2), cheer_given_1000: C(4, 3),
    cheer_recv_100: C(0, 2), cheer_recv_500: C(0, 3), cheer_recv_1000: C(0, 4, 3),

    // ── SAILING: voyages → tailwind, merchant/waves → sea gold, encounters → armor ──
    first_voyage: S({ tailwind: 1 }), sail_regular: S({ tailwind: 2 }), sail_voyager: S({ tailwind: 4 }),
    sail_leviathan: S({ tailwind: 3, bounty: 3 }), sail_admiral: S({ tailwind: 4, bounty: 4, broadside: 3 }),
    merchant_met: S({ bounty: 2 }), merchant_perfect: S({ bounty: 3 }),
    wave_friendly: S({ tailwind: 1 }), wave_ambassador: S({ tailwind: 2, bounty: 1 }), wave_beloved: S({ tailwind: 3, bounty: 2 }),
    sea_tested: S({ ironclad: 2 }), sea_veteran: S({ ironclad: 3 }),
    // ── SEA FIGHTS ── the chase badges pay in the affinity of the thing they ask for: you get better at
    // fighting by fighting, and the two hardest ones pay across the board.
    first_blood_sea: S({ broadside: 1 }), monster_hunter: S({ broadside: 3, ironclad: 2 }),
    leviathan_slayer: S({ broadside: 4, plunder: 3 }), sea_unscathed: S({ ironclad: 4 }),
    reckoning_kill: S({ broadside: 3 }),
    full_bestiary: S({ broadside: 5, ironclad: 5, plunder: 5, bounty: 4 }),
    // ── RAIDING → broadside / ironclad / plunder ──
    raid_marauder: S({ broadside: 3 }), raid_scourge: S({ broadside: 5, plunder: 3 }), raid_untouchable: S({ ironclad: 4 }),
    raid_plunderer: S({ plunder: 5 }), raid_defender: S({ ironclad: 3 }), raid_bastion: S({ ironclad: 5 }),
    // ── THE FLEET → broadside / ironclad, because that is what sinking one of them takes ──
    fleet_first_blood: S({ broadside: 2 }), fleet_meg: S({ broadside: 4 }), fleet_tithe: S({ broadside: 5, ironclad: 3 }),
    fleet_admiral: S({ broadside: 7, ironclad: 5 }), fleet_unscathed: S({ ironclad: 6 }),
    // ── DIGGING → dredge / trove ──
    dig_excavator: S({ trove: 4 }), dig_goldtouch: S({ trove: 3, dredge: 2 }), dig_cleansweep: S({ dredge: 4 }),
    // ── FISHING → Angling (its own stat: more casts a day, rarer fish on the line), so fishing badges make you
    // a better fisherman. The Whole Ocean is the completionist prize: every species means fishing at night, in a
    // storm, in fog, and sailing forty voyages to reach deep water.
    fish_first: S({ angling: 1 }), fish_angler: S({ angling: 3 }), fish_master: S({ angling: 6, bounty: 3 }),
    fish_naturalist: S({ angling: 4 }), fish_deepwater: S({ angling: 5, trove: 3 }),
    fish_trophy: S({ angling: 4, bounty: 2 }), fish_record_holder: S({ angling: 5, bounty: 3 }),
    fish_complete: S({ angling: 12, bounty: 6, trove: 4, tailwind: 4 }),
    // ── Upgrade mastery (ship + dig) ──
    sail_shipwright: S({ broadside: 2, dredge: 2 }), sail_sovereign: S({ broadside: 3, ironclad: 3, dredge: 3, trove: 3, tailwind: 3, bounty: 3 }),

    // ── FARMING → grow speed / harvest / gold / etc. ──
    farm_first: F({ growSpeed: 2 }), farm_hand: F({ growSpeed: 3 }), farm_master: F({ growSpeed: 5 }),
    green_thumb: F({ growSpeed: 6, harvestLuck: 4 }), master_gardener: F({ growSpeed: 8, harvestLuck: 6, goldHarvest: 6 }),
    botanist: F({ seedLuck: 6 }), decorator: F({ growSpeed: 2 }), landscaper: F({ growSpeed: 3, goldHarvest: 3 }),
    well_liked: F({ goldHarvest: 3 }), adored: F({ goldHarvest: 6 }), fertilizer_baron: F({ fertPower: 6 }),
    pig_whisperer: F({ harvestLuck: 3 }), pig_tycoon: F({ harvestLuck: 5, goldHarvest: 4 }),
    farm_cultivator: F({ growSpeed: 4, seedLuck: 4 }), farm_steward: F({ growSpeed: 8, seedLuck: 8, harvestLuck: 6, goldHarvest: 6, fertPower: 6 }),
    // ── PETS → pet XP (pasture leveling), the pet system's own currency ──
    pet_tamer: F({ petXp: 2 }), pet_keeper: F({ petXp: 3 }), pet_whisperer: F({ petXp: 5 }), pet_trained: F({ petXp: 1 }),
    pet_seasoned: F({ petXp: 3 }), beastmaster: F({ petXp: 6 }), pack_master: F({ petXp: 3 }), pet_devoted: F({ petXp: 5 }),
    pet_pal: F({ petXp: 2 }), farm_giver: F({ petXp: 4 }),
    // ── CREATIONS (art/decorations) → farm gold & growth ──
    creation_first: F({ goldHarvest: 2 }), creation_artisan: F({ goldHarvest: 3 }), creation_gallery: F({ goldHarvest: 5 }),
    creation_curator: F({ growSpeed: 2 }), creation_patron: F({ goldHarvest: 3 }),
    // ── SHARING CREATIONS → farm power, since that's where the art lives. Giving is the generous side of the
    // system and each share is spent forever, so the giver ladder pays better than the collector ladder.
    share_generous: F({ goldHarvest: 3 }), share_patron: F({ goldHarvest: 5, growSpeed: 3 }),
    share_legacy: F({ goldHarvest: 8, growSpeed: 5, harvestLuck: 4 }),
    share_collector: F({ harvestLuck: 2 }), share_gallery: F({ harvestLuck: 4, goldHarvest: 3 }),
    share_mutual: F({ petXp: 4, growSpeed: 2 }),
    // ── THE HIDDEN GLIMMER → farm power (its rewards are decorations), scaled to how absurdly rare it is: at most
    // two spawns a day and exactly ONE winner per spawn, den-wide. Five claims is a genuine feat; the full set is
    // the rarest thing in the game, so Constellation is the strongest farm badge there is.
    glimmer_spotter: F({ harvestLuck: 3 }), glimmer_keeper: F({ harvestLuck: 5, seedLuck: 3 }),
    glimmer_hoarder: F({ harvestLuck: 8, seedLuck: 5, goldHarvest: 4 }),
    glimmer_complete: F({ growSpeed: 10, seedLuck: 8, harvestLuck: 8, goldHarvest: 8, fertPower: 6 }),

    // ── FORGING → smithing odds ──
    forge_first: G({ efficient: 1 }), forge_smith: G({ masters_touch: 1 }), forge_master: G({ masters_touch: 3 }),
    forge_plus10: G({ steady_hand: 3 }), forge_pixel: G({ steady_hand: 2 }), forge_emberheart: G({ keen_eye: 3 }),
    forge_artisan: G({ efficient: 2, keen_eye: 2 }), forge_grandmaster: G({ efficient: 4, keen_eye: 4, masters_touch: 4, steady_hand: 4 }),

    // ── THE MINE → DEPTHS affinity. Every mining badge takes real time at the rock (50 seams, depth 12, 25
    // masterwork runs, 1,000 ore smelted), so each one pays back into the verb that earned it: the delving
    // badges harden the roof, the seam badges pay ore, the furnace badge feeds the furnace.
    mine_deep: D({ nerve: 3 }), mine_nerve: D({ nerve: 4, lodesense: 2 }),
    mine_masterwork: D({ hew: 3 }), mine_masterhand: D({ hew: 5, prospect: 3 }),
    mine_emberheart: D({ lodesense: 4, prospect: 3 }), mine_forgefed: D({ bellows: 4, crucible: 3 }),
    mine_tunnelrat: D({ nerve: 2 }), mine_deepwalker: D({ nerve: 5, lodesense: 4 }),
    mine_poursteady: D({ bellows: 2 }), mine_ladle: D({ bellows: 5, crucible: 4 }),
    mine_notadrop: D({ crucible: 6, bellows: 3 }),

    // ── TOWN & RAIDS → combat power (raids), scaling with difficulty ──
    town_raider: C(2), town_veteran: C(3), town_warlord: C(5, 0, 3),
    town_brawler: C(2), town_berserker: C(4, 2), town_juggernaut: C(4, 0, 3),
    golem_slayer: C(3), golem_bane: C(6, 0, 4), town_topdog: C(4, 3),
    tavern_regular: C(1), dice_devil: C(0, 3), dice_king: C(0, 5),
    town_patron: C(2), town_benefactor: C(5), well_wisher: C(1), fountain_faithful: C(3),
    high_stakes: C(2), merchant_jackpot: C(0, 4), town_taskmaster: C(2),

    // ── THE THIRTY-FIVE THAT PAID NOTHING ────────────────────────────────────────────────────────────────
    // Five whole subsystems had badges with no bonus at all: every cooking badge, every delve badge, the
    // auction ladder, three forge badges and the four enshrinement badges — 35 of 267, earning 120 XP and 120
    // gold and then nothing, while the other 232 were live numbers. Luke, on the Enshriner card: "this badge
    // doesnt show what bonus it gives", then "all missing badge bonuses need to be filled, depending on the
    // badge and its difficulty."
    //
    // TWO RULES held the whole set together:
    //
    //   1. A badge pays into the VERB THAT EARNED IT, which is what every domain badge above already does. So
    //      cooking pays farm stats (its inputs are crops and fish, its output feeds pets), delving pays Depths
    //      affinity — the stat line that literally says "powers delving" — and the forge badges pay forge.
    //      The auction ladder is the exception and pays combat, because that is where the trading badges
    //      beside it already pay (first_trade, trader, deal_maker, trade_value_10k).
    //
    //   2. SCALED BY WHAT IT ACTUALLY TOOK, read off how many members hold one rather than off the sentence.
    //      27 people have cooked a first dish and nobody has cooked 2,500; those two cannot pay the same.
    //
    // Only the five auction badges touch combat, and they add +10 Might across all five — against a full
    // collection already worth +356. The other thirty pay in their own subsystem's currency, so the thing this
    // does NOT do is quietly raise the arena's ceiling by a third.

    // COOKING → farm. The kitchen runs on what the farm and the sea produce, and its plates feed pets.
    cook_first: F({ petXp: 1 }), cook_chain: F({ harvestLuck: 1 }), cook_perfect: F({ harvestLuck: 2 }),
    cook_apprentice: F({ petXp: 3 }), cook_collector: F({ harvestLuck: 3 }),
    cook_every_tier: F({ petXp: 3, harvestLuck: 2 }), cook_legendary: F({ petXp: 4 }),
    cook_forager: F({ harvestLuck: 4, seedLuck: 3 }), cook_prep: F({ harvestLuck: 4, fertPower: 3 }),
    cook_chef: F({ petXp: 5, goldHarvest: 3 }), cook_grand: F({ petXp: 5, harvestLuck: 4 }),
    cook_thousand: F({ petXp: 6, goldHarvest: 4 }),
    cook_wolfs: F({ petXp: 6, harvestLuck: 5, goldHarvest: 4 }),
    // Every recipe in the book, and 2,500 plates — the two nobody has. Priced beside master_gardener.
    cook_librarian: F({ growSpeed: 6, seedLuck: 6, harvestLuck: 6, petXp: 6 }),
    cook_master: F({ petXp: 8, goldHarvest: 6, harvestLuck: 6 }),

    // THE DUNGEONS → Depths affinity, the stat family whose own blurb reads "powers delving, mining & smelting".
    // Nerve is roof safety, which is the delving equivalent of surviving the floor you are standing on.
    delve_first_boss: D({ nerve: 1 }), delve_floors_100: D({ nerve: 3 }), delve_no_potion: D({ nerve: 4 }),
    delve_flawless: D({ nerve: 4, lodesense: 2 }), delve_bosses_25: D({ hew: 3, nerve: 2 }),
    delve_floors_500: D({ nerve: 6, lodesense: 4, prospect: 3 }),
    delve_all_four: D({ nerve: 6, hew: 5, lodesense: 4, prospect: 4 }),

    // THE FORGE → forge odds, same as the eight forge badges above them.
    forge_attuned: G({ keen_eye: 2 }), forge_enchanter: G({ masters_touch: 2 }),
    forge_dual_affinity: G({ keen_eye: 3, masters_touch: 2 }),

    // ENSHRINEMENT → pet XP, the pet system's own currency. A stone is spent forever and the ability becomes
    // permanent, so this ladder is steep: Pantheon is ten of them and is the strongest pet badge there is.
    pet_enshrined: F({ petXp: 4 }), pet_reliquary: F({ petXp: 6 }),
    pet_both_stones: F({ petXp: 5, harvestLuck: 3 }),
    pet_pantheon: F({ petXp: 10, goldHarvest: 5, growSpeed: 4 }),

    // THE AUCTION HOUSE → combat, beside the trading badges. A single 5,000-gold sale is a lucky hit rather
    // than a grind, so it pays crit the way `jackpot` and `high_roller` do.
    auction_seller: C(1), auction_buyer: C(1), auction_windfall: C(0, 3),
    auction_magnate: C(3), auction_tycoon: C(5, 0, 3),

    // mark_of_shame is DELIBERATELY absent. It is a punishment — its own description is the penalty it
    // carries — and a bonus table is not the place to express one. See PENALTY_BADGES in badge-pop.js for what
    // its card says instead of the "no stat bonus" line every other bonus-less badge would have got.
};
