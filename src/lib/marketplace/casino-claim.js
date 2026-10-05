import "server-only";

import { db } from "@/lib/db";
import { lifetimeWon } from "@/lib/marketplace/casino-bank.js";
import { entitlements, nextRung } from "@/lib/marketplace/casino-milestones.js";
import { grantCasinoPerk, getCasinoPerks } from "@/lib/marketplace/casino-perks.js";
import { addChests, CHEST_TIERS } from "@/lib/marketplace/chests.js";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { STAT_META } from "@/lib/marketplace/items.js";
import { vipStanding } from "@/lib/marketplace/vip.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// ── CLAIMING OFF THE LADDER ──────────────────────────────────────────────────────────────────────────────
// Nothing on this floor is bought any more. Every rung is a thing you have already earned by winning, and
// claiming it is picking it up.
//
// ⚠️ THE ENTITLEMENT IS RECOMPUTED FROM ONE STORED NUMBER, EVERY TIME. `entitlements(won)` is a pure function
// of lifetime gold won; this file reads that column, works out what has already been handed over, and grants
// the difference. There is nothing in a request body that can move it — the claim takes a rung's NAME and
// nothing else, so a stale tab, a replayed POST and a hand-rolled request all land on the same arithmetic.
//
// ⚠️ AND THE CLAIM ROW IS WRITTEN BEFORE THE THING IS GRANTED. Same rule as the trick-or-treat door and the
// gachapon token: a double-tap must lose the race rather than win a second chest. The insert is the lock.

// Rarity per collectible, so a rung can be framed in the same colour the pet is framed in everywhere else.
// Built once at module load from the one catalogue, rather than a second list that drifts from it.
const COLLECTIBLE_RARITY = Object.fromEntries(COLLECTIBLES.map((c) => [c.id, c.rarity]));

const LABEL = {
    stat: (ref) => STAT_META[ref]?.label || ref,
    pet: (ref) => COLLECTIBLES.find((c) => c.id === ref)?.name || ref,
    vip_pet: (ref) => COLLECTIBLES.find((c) => c.id === ref)?.name || ref,
    chest: (ref) => CHEST_TIERS[ref]?.label || `${ref} chest`,
    unlock: (ref) => ref,
    gem: () => "A Polished Stone",
    recipe: () => "A Page From The Back",
};

const UNLOCK_NAME = {
    wheel_gold: "The Golden Wheel",
    fish_deep: "The Deep Water Charts",
    recipe_master: "The Master's Book",
    road_long: "The Long Road",
    vip_pass: "A Pass Behind the Rope",
};

/** How many of each rung this member has already taken. */
async function taken(buyerId) {
    const rows = await db.query(
        `SELECT kind, ref, COALESCE(SUM(n), 0)::int AS n FROM mkt_casino_claim
          WHERE buyer_id = $1 GROUP BY kind, ref`, [buyerId],
    ).catch(() => []);
    const out = {};
    for (const r of rows) out[`${r.kind}:${r.ref}`] = Number(r.n) || 0;
    return out;
}

/**
 * The whole ladder as this member sees it: what they have won, what is claimable now, and what is next.
 *
 * ⚠️ A RUNG THEY ALREADY BOUGHT COUNTS AS TAKEN. Eleven members hold stat levels and three hold unlocks paid
 * for with chips before the rework. Without this the ladder would offer them a level they are already
 * standing on — and the claim would grant it, which is the same bug paying out twice.
 */
export async function ladder(buyerId) {
    if (!buyerId) return { won: 0, rungs: [], next: null, vip: false };
    const [won, got, perks, standing] = await Promise.all([
        lifetimeWon(buyerId),
        taken(buyerId),
        getCasinoPerks(buyerId).catch(() => ({})),
        vipStanding(buyerId).catch(() => ({ vip: false })),
    ]);

    // ── THE ART, FOR EVERY RUNG THAT HAS ANY ───────────────────────────────────────────────────────────
    // Luke, looking at the Counter: "Absolutely horrendous, you lost all the amazing sprites and beauty."
    //
    // He is right, and it was not today's rename — it was the rework. The Counter used to be a SHELF, and
    // the shelf drew every pet as the card the rest of the game draws, with its real sprite on it. The
    // ladder that replaced it kept the prices and the progress and threw the pictures away, so a screen
    // whose entire job is to make you want the next thing became a column of identical yellow buttons.
    //
    // ⚠️ TWO QUERIES FOR THE WHOLE SCREEN, NOT ONE PER RUNG. The shelf resolved art inside a per-item
    // detailFor(), which is fine for a list you page through and is 20+ round trips for a ladder that shows
    // everything at once — and round trips are Active CPU, which is the meter that actually bills. The pet
    // ids are collected first and fetched in a single ANY($1); chests and stones carry their art in code.
    const petIds = [...new Set(entitlements(won)
        .filter((e) => e.kind === "pet" || e.kind === "vip_pet").map((e) => e.ref))];
    const petArt = petIds.length
        ? await db.query(`SELECT pet_id, url FROM mkt_pet_sprite WHERE pet_id = ANY($1) AND url IS NOT NULL`, [petIds])
            .then((rows) => Object.fromEntries(rows.map((r) => [r.pet_id, r.url]))).catch(() => ({}))
        : {};

    const artFor = (kind, ref) => {
        if (kind === "pet" || kind === "vip_pet") return petArt[ref] || null;
        if (kind === "chest") return CHEST_TIERS[ref]?.art || null;
        return null;
    };

    const rungs = entitlements(won).map((e) => {
        const key = `${e.kind}:${e.ref}`;
        // Stat levels and the one-time unlocks can both have been BOUGHT before today; everything else has
        // only ever come from this ladder, so the claim table is the whole story for them.
        const already = (e.kind === "stat" || e.kind === "unlock")
            ? Math.max(got[key] || 0, Number(perks?.[e.ref]) || 0)
            : (got[key] || 0);
        const ready = Math.max(0, e.n - already);
        return {
            kind: e.kind,
            ref: e.ref,
            name: e.kind === "unlock" ? (UNLOCK_NAME[e.ref] || e.ref) : (LABEL[e.kind]?.(e.ref) || e.ref),
            every: e.every || null,
            at: e.at || null,
            vip: Boolean(e.vip),
            held: already,
            ready,
            next: e.next,
            toGo: Math.max(0, e.next - won),
            // Null for a stat track or a door, which have no object to show — the client draws its own
            // glyph for those rather than a broken frame. See the note on img onError: an SSR 404 beats
            // React to the event, so a missing sprite must never be rendered as an <img> at all.
            art: artFor(e.kind, e.ref),
            rarity: e.kind === "pet" || e.kind === "vip_pet" ? (COLLECTIBLE_RARITY[e.ref] || null) : null,
            // A VIP rung a non-VIP has earned is shown, and locked. Hiding it would make the rope invisible
            // rather than exclusive, and the whole point of a rope is that you can see past it.
            locked: Boolean(e.vip) && !standing.vip,
        };
    });

    return { won, rungs, next: nextRung(won), vip: Boolean(standing.vip) };
}

/**
 * Take one rung. `kind` and `ref` name it; nothing else is read from the caller.
 *
 * Grants ONE at a time on purpose — a member owed eight Mythic chests collects eight times. A single
 * "claim everything" button would hand over a day's worth of ladder in one unreadable flash, and the
 * collecting is the reward.
 */
export async function claim(buyerId, kind, ref) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const state = await ladder(buyerId);
    const rung = state.rungs.find((r) => r.kind === kind && r.ref === ref);
    if (!rung) return { ok: false, error: "no_such_rung" };
    if (rung.locked) return { ok: false, error: "vip_only" };
    if (rung.ready <= 0) return { ok: false, error: "not_earned" };

    // ⚠️ THE ROW FIRST. If two taps arrive together the second one re-reads `ladder` after the first has
    // written, sees ready drop to zero, and refuses. Granting first would hand over two.
    const row = await db.queryOne(
        `INSERT INTO mkt_casino_claim (buyer_id, kind, ref, n, at_won) VALUES ($1, $2, $3, 1, $4) RETURNING id`,
        [buyerId, kind, ref, state.won],
    ).catch(() => null);
    if (!row) return { ok: false, error: "claim_failed" };

    let gave = rung.name;
    if (kind === "stat" || kind === "unlock") {
        // grantCasinoPerk is the one writer for both — a stat track is a level and an unlock is a level of 1.
        await grantCasinoPerk(buyerId, ref, 1).catch(() => {});
        gave = kind === "stat" ? `${rung.name} +1` : rung.name;
    } else if (kind === "pet" || kind === "vip_pet") {
        await db.query(
            `INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2) ON CONFLICT DO NOTHING`,
            [buyerId, ref],
        ).catch(() => {});
    } else if (kind === "chest") {
        await addChests(buyerId, { [ref]: 1 }, { source: "casino_ladder" }).catch(() => {});
    } else if (kind === "gem") {
        // ⚠️ THE SAME INSERT THE OLD SHELF USED, not an invented one. Sable sold five Polished stones, one per
        // kind; the ladder hands over a stone of the member's own choosing would be a second screen, so it
        // rolls one of the five. Tier 3 is Polished — the middle rung of five, which is what she always sold.
        const { GEM_KINDS, gemId } = await import("@/lib/marketplace/gems.js");
        const k = GEM_KINDS[Math.floor(Math.random() * GEM_KINDS.length)];
        const gem = gemId(k.id, 3);
        await db.query(
            `INSERT INTO mkt_gem (buyer_id, gem_id, count) VALUES ($1, $2, 1)
             ON CONFLICT (buyer_id, gem_id) DO UPDATE SET count = mkt_gem.count + 1`,
            [buyerId, gem],
        ).catch(() => {});
        gave = `A Polished ${k.name}`;
    } else if (kind === "recipe") {
        // ⚠️ AND THE TILL REFUSED TO SELL A BOOK SOMEBODY HAD FINISHED. The ladder has to refuse too, or the
        // rung quietly pays nothing to the one member who has earned it most.
        const { grantRecipeReward, hasUnknownRecipe } = await import("@/lib/marketplace/cooking.js");
        const left = await hasUnknownRecipe(buyerId, "chest_high").catch(() => false);
        if (!left) {
            await db.query(`DELETE FROM mkt_casino_claim WHERE id = $1`, [row.id]).catch(() => {});
            return { ok: false, error: "nothing_left" };
        }
        await grantRecipeReward(buyerId, "chest_high").catch(() => {});
    }

    await trackActivity(buyerId, "casino_claim", { kind, ref, won: state.won }).catch(() => {});

    // ── WHAT TO SHOW THEM ───────────────────────────────────────────────────────────────────────────
    // Luke: "The claim is a huge disservice."
    //
    // Taking a mythic pet off this ladder used to return a STRING, and the screen printed it as a line of
    // small text for three seconds. That is a receipt for the best moment the room has — the thing a member
    // ground 250,000 gold for — so the picture goes back with the name, and the client makes a moment of it.
    //
    // Read off the freshly rebuilt ladder rather than resolved a second time: one source for the art means
    // the reveal and the shelf can never show two different pictures of the same animal.
    const next = await ladder(buyerId);
    const shown = next.rungs.find((r) => r.kind === kind && r.ref === ref) || null;
    return {
        ok: true,
        gave,
        got: { name: gave, kind, art: shown?.art || null, rarity: shown?.rarity || null },
        ...next,
    };
}
