import "server-only";

import { db } from "@/lib/db";
import { halloweenOn } from "@/lib/marketplace/owner.js";
import { CONSUMABLES, grantConsumable } from "@/lib/marketplace/consumables.js";
import { CHEST_TIERS, addChests } from "@/lib/marketplace/chests.js";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { ITEMS } from "@/lib/marketplace/items.js";
import { decorationById, GACHAPON_DECOS } from "@/lib/marketplace/decorations.js";
import { addCredit } from "@/lib/marketplace/store-credit.js";
import { grantItem } from "@/lib/marketplace/inventory.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { grantCandy } from "@/lib/marketplace/candy.js";

// ── THE HALLOWE'EN GACHAPON ──────────────────────────────────────────────────────────────────────────────
// Luke: "randomly get like a halloween ticket that you could use on like a gachapon machine. The tickets
// would be rare drops and the stuff you get would be exciting and fun. Maybe you could win store credit in
// the gachapon like 5 to 25 bucks... The pool would also have a bunch of other stuff to make the other stuff
// rare."
//
// One ticket, one capsule, one prize. The whole design of a gachapon is that the EXCITING thing is rare
// because the pool is mostly ordinary — so the filler here is not padding, it is the mechanism.
//
// ⚠️ THIS IS THE FIRST THING IN THE GAME THAT PAYS REAL MONEY. Every store credit grant in the ledger before
// today has reason `purchase` ($852 ever) or a single `adjust` ($10). A roll that mints dollars is a
// different kind of object from a roll that mints gold, and three things follow from that:
//
//   1. THE COST IS WRITTEN DOWN BELOW, IN DOLLARS A MONTH, and it is computed from the odds rather than
//      asserted. If somebody changes a weight, the arithmetic in CREDIT_NOTE stops being true — so
//      scripts/gachapon-odds.mjs recomputes it from this file and prints it. Run it before touching a weight.
//   2. CREDIT IS A SEPARATE DIAL FROM EVERYTHING ELSE. CREDIT_WEIGHT is one number and it is the only thing
//      that changes the bill. Nothing else in the pool costs Luke anything he cannot print.
//   3. EVERY CREDIT WIN IS LOGGED TWICE — the store-credit ledger (which is the money) and mkt_gacha_pull
//      (which is the game). They must agree, and the odds script checks that they do.

// ── THE TICKET ───────────────────────────────────────────────────────────────────────────────────────────
export const TICKET = "hw_ticket";

// Where tickets come from, and how often. A source names its own rate so the faucet is a written list rather
// than a hook on trackActivity — the same argument as CANDY_RATES, and for the same reason: anything hung off
// telemetry pays out for LOOKING at pages.
//
// ⚠️ SIZED AGAINST MEASURED ACTIVITY, NOT GUESSED, AND THEN AGAINST THE SIMULATION. Over three days the Den
// does ~310 harvests, ~259 chest opens, ~147 catches, ~136 boss strikes, ~136 cooks and ~111 arena wins a
// day. The first cut of these rates came out at 7.4 tickets a day across the WHOLE Den — which is one ticket
// every three days for an active member, and a machine you reach that rarely is a machine nobody learns the
// feel of. These are twice that: about 15 a day, ~450 pulls a month, one ticket every day or two if you are
// playing properly and none at all on a quiet day.
//
// Run scripts/gachapon-odds.mjs after touching any of them — it multiplies these by the measured action
// counts and prints the tickets-a-day and the dollar bill that follows.
export const TICKET_ODDS = {
    boss_strike: 1 / 45,      // ~3 a day across the Den — the single biggest faucet, because strikes are daily
    delve_clear: 1 / 6,       // a whole ten-floor run, so it can afford to be generous
    arena_win: 1 / 55,
    chest_open: 1 / 110,
    fish: 1 / 130,
    harvest: 1 / 160,
    mine: 1 / 150,
    cook: 1 / 90,
    raid: 1 / 30,
    // The plaza raid. The best single odds on the table: it happens a few times a week at most, the whole
    // Den is in it, and it is the one activity where a token feels like a trophy rather than a trickle.
    town_raid: 1 / 8,
    trick_or_treat_door: 1 / 75,
};

/**
 * Roll a ticket for one action. Silently nothing while the event is down, so a caller never has to ask.
 * Returns true if one dropped, so the caller can tell the member.
 *
 * ⚠️ EVERY CALLER PASSES A SOURCE FROM TICKET_ODDS AND NOTHING ELSE. A rate passed in by the caller is how a
 * number ends up living in nine files and drifting; the source names the rate and this file owns it.
 */
export async function rollTicket(buyerId, source, times = 1) {
    if (!buyerId || !halloweenOn(buyerId)) return false;
    const p = TICKET_ODDS[source];
    if (!p || times <= 0) return false;
    // One roll per action rather than a binomial: two tickets from one harvest reads as a bug even when it is
    // arithmetically honest, and `times` here is only ever a small multiplier.
    let got = false;
    for (let i = 0; i < Math.min(10, times); i += 1) if (Math.random() < p) got = true;
    if (!got) return false;
    await grantConsumable(buyerId, TICKET, 1).catch(() => {});
    await trackActivity(buyerId, "gacha_ticket", { source }).catch(() => {});
    return true;
}

export async function ticketsHeld(buyerId) {
    if (!buyerId) return 0;
    const r = await db.queryOne(
        `SELECT COALESCE(count, 0)::int AS n FROM mkt_user_consumable WHERE buyer_id = $1 AND consumable_id = $2`,
        [buyerId, TICKET],
    ).catch(() => null);
    return Math.max(0, Number(r?.n) || 0);
}

// ── THE CAPSULE COLOURS ──────────────────────────────────────────────────────────────────────────────────
// A real machine tells you what you got before you open it, by the colour of the shell through the glass —
// and the whole pleasure of watching one drop is that you can see the colour coming down the chute. These
// are those shells, not a rarity label bolted on afterwards.
export const CAPSULES = {
    orange: { label: "Orange", tone: "#ff9a2e", rank: 1 },
    blue: { label: "Blue", tone: "#54a8ff", rank: 2 },
    purple: { label: "Purple", tone: "#b878ff", rank: 3 },
    gold: { label: "Gold", tone: "#ffcf3a", rank: 4 },
};

// ── THE POOL ─────────────────────────────────────────────────────────────────────────────────────────────
// `w` is a weight out of the total below. `once: true` means a member who already holds it cannot draw it
// again — the pet and decoration exclusives, which are own-once by nature — and the roll RE-PICKS rather than
// paying nothing, so a completionist's later pulls are not quietly worse than a new member's.
//
// ⚠️ A DUPLICATE OF AN OWN-ONCE PRIZE IS THE ONE FAILURE A GACHAPON CANNOT HAVE. Taking a rare ticket and
// handing back a second copy of a pet is the duplicate-trophy bug the wheel's bonus round already paid for
// once. `once` + the re-pick in `pull` is how that is closed, and the odds script asserts a member holding
// every exclusive can still pull a hundred times without an error.
const CREDIT_WEIGHT = { c500: 5, c1000: 3, c2500: 1 };

export const POOL = [
    // ── GOLD ── the reason anybody pulls ──────────────────────────────────────────────────────────────
    { id: "credit_2500", capsule: "gold", kind: "credit", cents: 2500, w: CREDIT_WEIGHT.c2500,
        name: "$25 Store Credit", blurb: "Twenty-five real dollars on your account at the shop." },
    { id: "credit_1000", capsule: "gold", kind: "credit", cents: 1000, w: CREDIT_WEIGHT.c1000,
        name: "$10 Store Credit", blurb: "Ten real dollars on your account at the shop." },
    { id: "credit_500", capsule: "gold", kind: "credit", cents: 500, w: CREDIT_WEIGHT.c500,
        name: "$5 Store Credit", blurb: "Five real dollars on your account at the shop." },
    { id: "gx_capsule_imp", capsule: "gold", kind: "pet", ref: "gx_capsule_imp", w: 6, once: true },
    { id: "gx_lantern_moth", capsule: "gold", kind: "pet", ref: "gx_lantern_moth", w: 9, once: true },

    // ── PURPLE ── the exclusives you can actually plan for ────────────────────────────────────────────
    { id: "deco_gx_prize_pumpkin", capsule: "purple", kind: "deco", ref: "deco_gx_prize_pumpkin", w: 10, once: true },
    { id: "deco_gx_capsule_tree", capsule: "purple", kind: "deco", ref: "deco_gx_capsule_tree", w: 14, once: true },
    { id: "deco_gx_lucky_lantern", capsule: "purple", kind: "deco", ref: "deco_gx_lucky_lantern", w: 18, once: true },
    { id: "chest_hw_ghost", capsule: "purple", kind: "chest", ref: "hw_ghost", w: 22 },
    { id: "item_hw", capsule: "purple", kind: "hw_item", w: 20,
        name: "A Piece of Harvest's End", blurb: "One of the Gourdfather's five, drawn at random from the ones you are missing." },

    // ── BLUE ── a good pull ───────────────────────────────────────────────────────────────────────────
    { id: "chest_hw_skeleton", capsule: "blue", kind: "chest", ref: "hw_skeleton", w: 44 },
    { id: "chest_hw_pumpkin", capsule: "blue", kind: "chest", ref: "hw_pumpkin", w: 60 },
    { id: "con_hw_whetstone", capsule: "blue", kind: "consumable", ref: "hw_whetstone", n: 2, w: 48 },
    { id: "con_hw_almanac", capsule: "blue", kind: "consumable", ref: "hw_black_almanac", n: 1, w: 40 },
    { id: "candy_big", capsule: "blue", kind: "candy", n: 120, w: 50 },

    // ── ORANGE ── the mechanism ───────────────────────────────────────────────────────────────────────
    // ⚠️ THIS IS 62% OF THE POOL AND IT IS SUPPOSED TO BE. A gachapon where every capsule is a prize is a
    // shop with extra steps; the gold shell matters because most of what comes down the chute is sweets.
    // Nothing here is NOTHING, though — there is no blank capsule in this machine, because a rare ticket
    // that pays zero is the one outcome that makes people stop pulling.
    { id: "chest_hw_candycorn", capsule: "orange", kind: "chest", ref: "hw_candycorn", w: 90 },
    { id: "con_hw_soul_cake", capsule: "orange", kind: "consumable", ref: "hw_soul_cake", n: 2, w: 85 },
    { id: "candy_small", capsule: "orange", kind: "candy", n: 40, w: 120 },
    { id: "sweets", capsule: "orange", kind: "sweets", n: 3, w: 150 },
    { id: "candy_tiny", capsule: "orange", kind: "candy", n: 20, w: 125 },
];

export const POOL_WEIGHT = POOL.reduce((n, p) => n + p.w, 0);

// ── WHAT THE CREDIT ACTUALLY COSTS ───────────────────────────────────────────────────────────────────────
// Recomputed by scripts/gachapon-odds.mjs rather than trusted. At the weights above:
//
//   P(any credit)      = (5 + 3 + 1) / 920 = 0.98% a pull, about 1 in 102
//   average credit win = (5·$5 + 3·$10 + 1·$25) / 9 = $8.89
//   expected cost      ≈ $0.087 a pull
//
// Against ~15 tickets a day across the Den (≈450 pulls a month) that is about **$39 a month in face value**,
// or roughly four credit wins. Store credit is spent IN THE SHOP, so the real cost is the COGS on $39 of
// goods rather than $39. For comparison, the internet line Luke just added to break-even is $95 a month.
//
// ⚠️ IF YOU WANT IT CHEAPER, CHANGE CREDIT_WEIGHT AND NOTHING ELSE. Cutting the ticket faucet instead would
// make the whole event rarer to buy a saving on one line of it, which is the family-B mistake the cost note
// in CLAUDE.md is about: narrow the thing, never cut how often the player gets to play.
export const CREDIT_PER_PULL_CENTS = POOL
    .filter((p) => p.kind === "credit")
    .reduce((n, p) => n + (p.cents * p.w) / POOL_WEIGHT, 0);

// ── THE SHELF, FOR THE MEMBER TO READ ────────────────────────────────────────────────────────────────────
// Luke: "It would be sweet if you could aee all the things in the halloween gachapon machine."
//
// ⚠️ ODDS ARE SHOWN, NOT HIDDEN. The machine is the first thing in the game that pays money, so the one
// thing it must not be is coy about how often. Every row carries its real percentage, computed from the same
// weights the roll uses — there is no second table to drift.
export function gachaIndex(ownedRefs = new Set()) {
    return POOL.map((p) => {
        const d = describe(p);
        return {
            id: p.id,
            capsule: p.capsule,
            tone: CAPSULES[p.capsule].tone,
            rank: CAPSULES[p.capsule].rank,
            name: d.name,
            blurb: d.blurb,
            sprite: null,          // filled in by gachaView, which has the art tables
            kind: p.kind,
            once: Boolean(p.once),
            owned: Boolean(p.once && p.ref && ownedRefs.has(p.ref)),
            chance: Math.round((p.w / POOL_WEIGHT) * 10000) / 100,
        };
    }).sort((a, z) => z.rank - a.rank || z.chance - a.chance);
}

function describe(p) {
    if (p.name) return { name: p.name, blurb: p.blurb || null };
    if (p.kind === "pet") {
        const c = COLLECTIBLES.find((x) => x.id === p.ref);
        return { name: c?.name || p.ref, blurb: c?.hint || null };
    }
    if (p.kind === "deco") {
        const d = decorationById(p.ref);
        return { name: d?.name || p.ref, blurb: "A decoration for your farm, and the machine is the only way to one." };
    }
    if (p.kind === "chest") {
        const c = CHEST_TIERS[p.ref];
        return { name: c?.label || p.ref, blurb: "A sealed Hallowe'en box." };
    }
    if (p.kind === "consumable") {
        const c = CONSUMABLES[p.ref];
        return { name: p.n > 1 ? `${p.n} × ${c?.name || p.ref}` : c?.name || p.ref, blurb: c?.desc || null };
    }
    if (p.kind === "candy") return { name: `${p.n} Candy`, blurb: "Spendable at the Gourdfather's stall." };
    if (p.kind === "sweets") return { name: `${p.n} Sweets`, blurb: "A handful of the wrapped ones." };
    return { name: p.id, blurb: null };
}

// Which own-once prizes this member already holds — the set the roll re-picks around.
async function ownedExclusives(buyerId) {
    const [pets, decos] = await Promise.all([
        db.query(`SELECT ref AS id FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []),
        db.query(`SELECT deco_id AS id FROM mkt_deco_owned WHERE buyer_id = $1`, [buyerId]).catch(() => []),
    ]);
    return new Set([...pets, ...decos].map((r) => r.id));
}

/** What the machine looks like before you pull: your tickets, the whole shelf, and what you already hold. */
export async function gachaView(buyerId) {
    if (!halloweenOn(buyerId)) return { open: false, tickets: 0, prizes: [] };
    const owned = await ownedExclusives(buyerId);
    const prizes = gachaIndex(owned);

    // The pictures, from the four tables that hold them — the same four the Gourdfather's stall reads.
    const petIds = POOL.filter((p) => p.kind === "pet").map((p) => p.ref);
    const decoIds = POOL.filter((p) => p.kind === "deco").map((p) => p.ref);
    const conIds = POOL.filter((p) => p.kind === "consumable").map((p) => p.ref);
    const [petArt, decoArt, conArt, chestArt] = await Promise.all([
        db.query(`SELECT pet_id AS k, url FROM mkt_pet_sprite WHERE pet_id = ANY($1)`, [petIds]).catch(() => []),
        db.query(`SELECT deco_id AS k, url FROM mkt_deco_sprite WHERE deco_id = ANY($1)`, [decoIds]).catch(() => []),
        db.query(`SELECT consumable_id AS k, url FROM mkt_consumable_sprite WHERE consumable_id = ANY($1)`, [conIds]).catch(() => []),
        import("@/lib/marketplace/chest-art.js").then((m) => m.getChestArt()).catch(() => ({})),
    ]);
    const art = Object.fromEntries([...petArt, ...decoArt, ...conArt].map((r) => [r.k, r.url]));
    for (const p of prizes) {
        const row = POOL.find((x) => x.id === p.id);
        if (row?.ref) p.sprite = art[row.ref] || chestArt?.[row.ref] || null;
    }

    return { open: true, tickets: await ticketsHeld(buyerId), prizes, poolWeight: POOL_WEIGHT };
}

function draw(skip = new Set()) {
    const bag = POOL.filter((p) => !skip.has(p.id));
    const total = bag.reduce((n, p) => n + p.w, 0);
    let r = Math.random() * total;
    for (const p of bag) { r -= p.w; if (r <= 0) return p; }
    return bag[bag.length - 1];
}

/**
 * One pull.
 *
 * ⚠️ THE TICKET IS SPENT BY A CONDITIONAL UPDATE, BEFORE ANYTHING IS GRANTED. `count = count - 1 WHERE
 * count > 0 RETURNING` is the lock: two taps on a phone cannot both pass a "do you have a ticket" read and
 * then both pay out. Granting first and deducting second is how a machine hands out two capsules for one
 * token, and this one can hand out money.
 */
export async function pull(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    if (!halloweenOn(buyerId)) return { ok: false, error: "closed" };

    const spent = await db.queryOne(
        `UPDATE mkt_user_consumable SET count = count - 1
          WHERE buyer_id = $1 AND consumable_id = $2 AND count > 0 RETURNING count`,
        [buyerId, TICKET],
    ).catch(() => null);
    if (!spent) return { ok: false, error: "no_ticket" };

    // Re-pick around what they already hold. Bounded by the pool size rather than a while(true): a member who
    // somehow held every own-once prize would otherwise spin here forever holding their ticket.
    const owned = await ownedExclusives(buyerId);
    const skip = new Set();
    let prize = draw();
    for (let i = 0; i < POOL.length && prize?.once && prize.ref && owned.has(prize.ref); i += 1) {
        skip.add(prize.id);
        prize = draw(skip);
    }
    if (!prize) return { ok: false, error: "empty_pool" };

    const d = describe(prize);
    const won = { id: prize.id, capsule: prize.capsule, tone: CAPSULES[prize.capsule].tone, kind: prize.kind, name: d.name, blurb: d.blurb, sprite: null };

    if (prize.kind === "credit") {
        // ⚠️ REAL MONEY. addCredit is the only way in, and it writes the double-entry ledger itself. The
        // `reason` is its own string so this can never be confused with a purchase in the books.
        await addCredit(buyerId, prize.cents, "gachapon", null, { pull: prize.id }).catch(() => {});
        won.cents = prize.cents;
    } else if (prize.kind === "pet") {
        await db.query(
            `INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2) ON CONFLICT DO NOTHING`,
            [buyerId, prize.ref],
        ).catch(() => {});
        won.sprite = (await db.queryOne(`SELECT url FROM mkt_pet_sprite WHERE pet_id = $1`, [prize.ref]).catch(() => null))?.url || null;
    } else if (prize.kind === "deco") {
        await db.query(
            `INSERT INTO mkt_deco_owned (buyer_id, deco_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [buyerId, prize.ref],
        ).catch(() => {});
        won.sprite = (await db.queryOne(`SELECT url FROM mkt_deco_sprite WHERE deco_id = $1`, [prize.ref]).catch(() => null))?.url || null;
    } else if (prize.kind === "chest") {
        await addChests(buyerId, { [prize.ref]: 1 }, { source: "gachapon" }).catch(() => {});
        // ⚠️ THE PICTURE TOO. Filmed without this and a Skeleton Chest came out of the machine as a plain
        // blue ball with a caption — which is the one moment the whole simulation has been building to, and
        // the only one where the prize is allowed to be an abstraction. Chest art lives in a settings blob
        // rather than a sprite table, which is exactly why it got missed.
        won.sprite = (await import("@/lib/marketplace/chest-art.js")
            .then((m) => m.getChestArt()).catch(() => ({})))?.[prize.ref] || null;
    } else if (prize.kind === "consumable") {
        await grantConsumable(buyerId, prize.ref, prize.n || 1).catch(() => {});
        // The consumable sprites, same reason — a Whetstone should arrive as a whetstone.
        won.sprite = (await db.queryOne(`SELECT url FROM mkt_consumable_sprite WHERE consumable_id = $1`, [prize.ref]).catch(() => null))?.url || null;
    } else if (prize.kind === "candy") {
        // ⚠️ THROUGH grantCandy, SO THE DAILY CAP STILL APPLIES. A faucet outside the only ceiling the event
        // has is not a faucet, it is a leak — and this one would be the biggest in the game.
        won.paid = await grantCandy(buyerId, "gacha", prize.n).catch(() => 0);
        // ⚠️ A CAPSULE CAN PROMISE 120 CANDY AND PAY NOTHING, and until now it did so silently.
        // GrayKitsune: "The gachapon that gives candy for the pumpkin in town isnt giving anything." He was
        // at 250/250 for the day. The prize rolled, the label said 120 Candy, the cap trimmed it to zero and
        // the screen reported the label.
        won.capped = won.paid < prize.n;
    } else if (prize.kind === "sweets") {
        const sweets = Object.keys(CONSUMABLES).filter((id) => CONSUMABLES[id].kind === "candy");
        const picked = [];
        for (let i = 0; i < (prize.n || 1); i += 1) {
            const id = sweets[Math.floor(Math.random() * sweets.length)];
            await grantConsumable(buyerId, id, 1).catch(() => {});
            picked.push(CONSUMABLES[id].name);
        }
        won.blurb = picked.join(", ");
    } else if (prize.kind === "hw_item") {
        // One of the Gourdfather's five, drawn from the ones they are missing — and if they hold all five,
        // the capsule pays the best chest instead rather than nothing.
        const have = new Set((await db.query(`SELECT item_id AS id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => [])).map((r) => r.id));
        const missing = ITEMS.filter((i) => i.source === "gourdfather" && !have.has(i.id));
        if (missing.length) {
            const pick = missing[Math.floor(Math.random() * missing.length)];
            // ⚠️ grantItem's third argument is a STRING (`via`), not an options object — passing {source}
            // stores "[object Object]" as the provenance on a real item.
            await grantItem(buyerId, pick.id, "gachapon").catch(() => {});
            won.name = pick.name;
            won.blurb = pick.flavor || null;
            won.sprite = (await db.queryOne(`SELECT url FROM mkt_item_sprite WHERE item_id = $1`, [pick.id]).catch(() => null))?.url || null;
        } else {
            await addChests(buyerId, { hw_ghost: 1 }, { source: "gachapon" }).catch(() => {});
            won.name = CHEST_TIERS.hw_ghost?.label || "Ghost Chest";
            won.blurb = "You already hold all five, so the machine gave you the best box it had instead.";
        }
    }

    await db.query(
        `INSERT INTO mkt_gacha_pull (buyer_id, prize_id, capsule, kind, cents) VALUES ($1, $2, $3, $4, $5)`,
        [buyerId, prize.id, prize.capsule, prize.kind, prize.kind === "credit" ? prize.cents : 0],
    ).catch(() => {});
    await trackActivity(buyerId, "gacha_pull", { prize: prize.id, capsule: prize.capsule }).catch(() => {});

    return { ok: true, won, tickets: Math.max(0, Number(spent.count) || 0) };
}
