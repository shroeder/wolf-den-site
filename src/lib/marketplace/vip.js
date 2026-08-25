import "server-only";

import { db } from "@/lib/db";
import { standingFor } from "@/lib/marketplace/roles.js";
import { grantEventBadge } from "@/lib/marketplace/badges.js";
import { checkText } from "@/lib/marketplace/text-filter.js";

// ── THE VIP LOUNGE ───────────────────────────────────────────────────────────────────────────────────────────
// A room behind a rope at the near end of the casino floor. Luke described it in one long breath: a barrier
// over a door with a VIP sign, VIP silhouettes visible behind the drapes, a lounge you can only enter if you
// are a VIP, other VIPs walking around in it, the VIP chat, a bartender at the back who tells you things about
// the game nobody else is told and holds notes for other VIPs, and a vendor beside him selling pets for chips.
//
// ── WHAT THIS FILE IS NOT ────────────────────────────────────────────────────────────────────────────────────
// It is not a new membership system, a new chat, a new presence system or a new shop. Every one of those
// already exists and the lounge is wired into them rather than beside them, which is the difference between a
// room in the game and a second game in a room:
//
//   WHO GETS IN     `standingFor` (roles.js). VIP is derived from lifetime spend, and owners and staff are
//                   VIPs by default. Nothing about the lounge stores who is allowed in it, because a stored
//                   entitlement is a stale entitlement the day somebody stops qualifying.
//   THE CHAT        the `vip` channel from migration 402, which already has a join window so a new VIP does
//                   not walk in to a wall of backlog. Inventing a second VIP chat would split the room's
//                   conversation across two places and neither would be worth reading.
//   WALKING         `mkt_town_presence.zone`, exactly as the tavern and the casino floor do it.
//   THE VENDOR      the chip store. Its items carry a `vip` flag; the gate is HERE and the money is THERE.
//
// The only new table is the noticeboard, because nothing in the game is a message left for a group.

/** The presence zone. One value, used by the client, the occupant query and nothing else. */
export const VIP_ZONE = "casino_vip";

/**
 * May this member go in?
 *
 * ── AND IT IS ANSWERED ON EVERY REQUEST, NOT ONCE AT THE DOOR ────────────────────────────────────────────────
 * Every verb below calls this, including the ones that only read. A gate that runs on entry and then trusts a
 * flag is a gate somebody walks through once and stays behind forever — and this one guards a private chat, so
 * "forever" means reading other members' messages after losing the standing that let you in.
 */
export async function vipStanding(buyerId) {
    if (!buyerId) return { vip: false, roles: [], spentCents: 0 };
    const standing = await standingFor(buyerId).catch(() => null);
    const roles = standing?.roles || [];
    // The same three keys `channelsFor` opens the vip channel to, and deliberately the same list rather than a
    // second opinion about who counts: the room and its chat disagreeing about who belongs would be the worst
    // possible bug here — somebody standing in a room they cannot hear, or hearing a room they cannot enter.
    const vip = roles.some((r) => r.key === "vip" || r.key === "staff" || r.key === "owner");
    return { vip, roles, spentCents: standing?.spentCents || 0 };
}

// ── WHAT THE BARTENDER KNOWS ─────────────────────────────────────────────────────────────────────────────────
// Luke: "he tells you secret things that only VIPs get to know about, like mechanics of the game that people
// might know about."
//
// The hard part is that this must be TRUE. A bartender who invents flavour is a bartender nobody talks to
// twice, and worse, one who says something wrong about the odds is the house lying to its best customers. So
// every line below is a real, checkable fact about a system in this game, taken from the file that owns it,
// and each one names where it comes from so it can be re-checked when that system moves.
//
// They are things a careful player COULD work out and almost certainly has not: none of them is a secret in
// the sense of being hidden, and none of them is an exploit. That is the right register for a room you got
// into by spending money in a card shop — you are being told how the machine thinks, not handed an edge.
const BARTENDER = [
    // casino-slot5.js — DEEP.free, and the sweep in check:slot5.
    { id: "deep_pearls", text: "The Deep's pearls only ever land on the two outside reels, and only during the "
        + "free round. Four and a half of them a round, on average — so a round that ends on ×6 was a good one, "
        + "not a lucky one." },
    // casino-slot5.js — DEEP.strips: wolf is weighted 0 on reels 1 and 5.
    { id: "deep_wilds", text: "A kraken can never land on the first or the last reel of The Deep. That is what "
        + "makes five of them impossible and the top line worth what it is." },
    // bingo-kit.js — DRAGON_CHANCE and dragonFor.
    { id: "bingo_dragon", text: "The dragon comes to about one bingo card in eight, and it only ever burns "
        + "squares you did not already have. If it flies over a line you had four of, it is burning the one you "
        + "needed." },
    // bingo-kit.js — BINGO_PAYS[1] = 1.
    { id: "bingo_line", text: "One line on a bingo card pays exactly what the card cost. That is not a "
        + "consolation, it is the rule the whole paytable is built around — you got the line, you are level." },
    // casino.js — KENO_PAYS[2] = 1.
    { id: "keno_two", text: "Two of five on a keno ticket gets your ticket back now. It used to pay half, which "
        + "meant the commonest thing that happens to a winning ticket was still losing money." },
    // blackjack-kit.js — BLACKJACK_RAKE = 0, dealer stands on all 17.
    { id: "bj_rake", text: "The table takes no rake at all any more, and the dealer stands on every 17 "
        + "including a soft one. Played properly that is the best return on the floor." },
    // chips.js — CHIP_RATE, and the fact chips are minted on the STAKE.
    { id: "chip_rate", text: "Chips are minted on what you STAKE, not on what you lose. Which means a long "
        + "session at a machine that broke even still filled your pocket — the two numbers are not related." },
    // casino.js — PRIZE_SHELF / rollCasinoPrize, and the note that prizes sit on top of the return.
    { id: "prizes", text: "The prizes that fall off the floor are not counted in any machine's return. They sit "
        + "on top of it. Nobody balancing the odds has ever had to pay for them." },
    // collectibles.js — the casino five, casinoChance.
    { id: "pets", text: "Five pets exist that only the casino floor can drop, and the rarest is one play in "
        + "five and a half thousand. There is no way to hurry it. There is only turning up." },
    // casino-slot5.js — check:slot5's spread rule.
    { id: "no_smart_pick", text: "None of the machines out there is the smart pick. The build refuses to ship "
        + "if the best one pays more than eight points over the worst — what differs is how it FEELS, not what "
        + "it pays." },
];

/** One line, chosen by the clock rather than at random, so the bartender is not a slot machine of his own. */
export function bartenderLine(seed = Date.now()) {
    // Rotating on a slow clock means two VIPs standing at the bar at the same time hear the same thing, which
    // is what makes it a bartender rather than a fortune cookie: it is something you can turn to somebody else
    // and repeat. Twenty minutes is long enough to be a conversation and short enough to come back for.
    const slot = Math.floor(seed / (20 * 60 * 1000));
    return BARTENDER[slot % BARTENDER.length];
}

export const BARTENDER_COUNT = BARTENDER.length;

// ── THE NOTICEBOARD ──────────────────────────────────────────────────────────────────────────────────────────
// Luke: "you can also leave notes with him to give to other VIPs that they can look at."
//
// One live note each, deliberately. A board where one person can post ten is a board that is one person, and
// the interesting version of this is a wall of different voices. Writing a second note REPLACES your first
// rather than being refused — being told "you already have a note up" is a worse answer than simply changing
// what your note says, and it is the same gesture either way.
const NOTE_MAX = 220;

export async function vipNotes(buyerId, limit = 12) {
    const { vip } = await vipStanding(buyerId);
    if (!vip) return [];
    const rows = await db.query(
        `SELECT n.id, n.body, n.created_at, n.buyer_id, b.display_name, b.alias
           FROM mkt_vip_note n JOIN mkt_buyer b ON b.id = n.buyer_id
          WHERE n.hidden = FALSE
          ORDER BY n.created_at DESC
          LIMIT $1`,
        [Math.max(1, Math.min(30, limit))],
    ).catch(() => []);
    return rows.map((r) => ({
        id: String(r.id),
        body: r.body,
        who: r.alias || r.display_name || "A member",
        mine: String(r.buyer_id) === String(buyerId),
        at: r.created_at,
    }));
}

/** Pin a note behind the bar. Replaces this member's previous one. */
export async function leaveVipNote(buyerId, body) {
    const { vip } = await vipStanding(buyerId);
    if (!vip) return { ok: false, error: "not_vip" };

    // The same filter every other piece of member-authored public text goes through. A private room is MORE
    // reason to run it, not less: it is the room the owner is least likely to be reading. The filter's own
    // sentence is passed back rather than a generic refusal — being told WHY is the difference between
    // fixing a word and giving up.
    const text = String(body || "").trim().slice(0, NOTE_MAX);
    if (!text) return { ok: false, error: "empty" };
    const { clean, reason } = checkText(text);
    if (!clean) return { ok: false, error: "not_clean", reason };

    // Hide the old one and write the new one. Two statements rather than an upsert, because the unique index
    // is PARTIAL (`WHERE hidden = FALSE`) and an ON CONFLICT against a partial index has to restate the
    // predicate or Postgres cannot match it — at which point the upsert quietly becomes a plain insert that
    // violates the constraint and throws. Clearing first is the version that cannot be got wrong.
    await db.query(`UPDATE mkt_vip_note SET hidden = TRUE WHERE buyer_id = $1 AND hidden = FALSE`, [buyerId])
        .catch(() => null);
    const row = await db.queryOne(
        `INSERT INTO mkt_vip_note (buyer_id, body) VALUES ($1, $2) RETURNING id`,
        [buyerId, text],
    ).catch(() => null);
    if (!row) return { ok: false, error: "failed" };
    return { ok: true, notes: await vipNotes(buyerId) };
}

/** Take your own note down. Only your own — there is no moderation verb here on purpose; the owner has the DB. */
export async function clearVipNote(buyerId) {
    const { vip } = await vipStanding(buyerId);
    if (!vip) return { ok: false, error: "not_vip" };
    await db.query(`UPDATE mkt_vip_note SET hidden = TRUE WHERE buyer_id = $1 AND hidden = FALSE`, [buyerId])
        .catch(() => null);
    return { ok: true, notes: await vipNotes(buyerId) };
}

// ── WHO ELSE IS IN HERE ──────────────────────────────────────────────────────────────────────────────────────
// The same query the casino floor runs, against a different zone. Not shared with it as a helper on purpose:
// the two rooms have different liveness needs the day either changes, and a two-line query is a cheaper thing
// to have twice than a parameterised one is to have wrong once.
export async function vipOccupants(selfId) {
    const rows = await db.query(
        `SELECT p.buyer_id, p.x, p.y, p.facing, b.display_name, b.alias, b.avatar_sprite_url
           FROM mkt_town_presence p JOIN mkt_buyer b ON b.id = p.buyer_id
          WHERE p.zone = $1 AND p.updated_at > NOW() - INTERVAL '90 seconds'
            AND ($2::uuid IS NULL OR p.buyer_id <> $2)
          LIMIT 30`,
        [VIP_ZONE, selfId || null],
    ).catch(() => []);
    return rows.map((r) => ({
        id: r.buyer_id,
        name: r.alias || r.display_name || "A member",
        x: Number(r.x) || 50,
        y: Number(r.y) || 72,
        facing: Number(r.facing) === -1 ? -1 : 1,
        sprite: r.avatar_sprite_url || null,
    }));
}

// ── THE PEOPLE BEHIND THE DRAPES ──────────────────────────────────────────────────────
// Luke: "it shows VIPs walking around behind the drapes, the sprites are darkened and they look as if they're
// actually back behind the drapes." And, on the first cut: "the VIPs should be the actual hero sprites, not
// just some random black looking things."
//
// So it hands back the AVATAR, and that is a deliberate reversal. The first version returned positions only,
// on the reasoning that "who is in the VIP room right now" is not something the floor is entitled to know —
// which is a real concern and the wrong call here, because the whole point of the rope is that you can see
// who is on the other side of it. A room full of anonymous shapes is a screensaver; a room with three people
// you recognise in it is a room you want to be in. That is what the door is FOR.
//
// It is still the minimum: a sprite and an x. No names, no ids, no standing — you can see that somebody is in
// there and who, exactly as you could if you were stood at a real rope looking through a real doorway.
export async function vipShadows() {
    const rows = await db.query(
        `SELECT p.x, b.avatar_sprite_url
           FROM mkt_town_presence p JOIN mkt_buyer b ON b.id = p.buyer_id
          WHERE p.zone = $1 AND p.updated_at > NOW() - INTERVAL '90 seconds' LIMIT 6`,
        [VIP_ZONE],
    ).catch(() => []);
    return rows.map((r, i) => ({ i, x: Number(r.x) || 50, sprite: r.avatar_sprite_url || null }));
}

// ── GOING IN ─────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Open the rope. Grants the badge on the first successful entry.
 *
 * The badge is granted HERE rather than by an auto_rule because there is no metric to count: the qualifying
 * event is opening a door, and this function is the only thing that knows it happened. `grantEventBadge` is
 * idempotent, so calling it on every entry costs one conflicting insert and cannot double-award.
 */
export async function enterVipLounge(buyerId) {
    const { vip, spentCents } = await vipStanding(buyerId);
    if (!vip) return { ok: false, error: "not_vip", spentCents };
    await grantEventBadge(buyerId, "casino_vip_room").catch(() => {});
    return { ok: true, ...(await vipLoungeState(buyerId)) };
}

/** Everything the lounge needs to draw itself. */
export async function vipLoungeState(buyerId) {
    const { vip } = await vipStanding(buyerId);
    if (!vip) return { open: false };
    const [others, notes] = await Promise.all([vipOccupants(buyerId), vipNotes(buyerId)]);
    return {
        open: true,
        zone: VIP_ZONE,
        others,
        notes,
        bartender: bartenderLine(),
        noteMax: NOTE_MAX,
    };
}
