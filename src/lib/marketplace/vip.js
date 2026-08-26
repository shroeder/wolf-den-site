import "server-only";

import { db } from "@/lib/db";
import { standingFor } from "@/lib/marketplace/roles.js";
import { grantEventBadge } from "@/lib/marketplace/badges.js";
import { checkText } from "@/lib/marketplace/text-filter.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { hasUnlock } from "@/lib/marketplace/casino-perks.js";

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
    if (!buyerId) return { vip: false, byRole: false, byPass: false, roles: [], spentCents: 0 };
    const standing = await standingFor(buyerId).catch(() => null);
    const roles = standing?.roles || [];
    // The same three keys `channelsFor` opens the vip channel to, and deliberately the same list rather than a
    // second opinion about who counts: the room and its chat disagreeing about who belongs would be the worst
    // possible bug here — somebody standing in a room they cannot hear, or hearing a room they cannot enter.
    const byRole = roles.some((r) => r.key === "vip" || r.key === "staff" || r.key === "owner");
    // ── AND THE SECOND WAY IN ────────────────────────────────────────────────────────────────────────
    // A million chips at the Counter buys a pass. It opens the door and it is NOT the role: the role means
    // real money spent and nothing else, and selling it for chips would rewrite what every VIP badge in the
    // game stands for. `byRole` and `byPass` are kept apart so anything that wants to ask "is this a real
    // VIP" still can — the room only asks whether you may come in.
    const byPass = byRole ? false : await hasUnlock(buyerId, "vip_pass").catch(() => false);
    return { vip: byRole || byPass, byRole, byPass, roles, spentCents: standing?.spentCents || 0 };
}

// ── WHAT THE BARTENDER TALKS ABOUT ───────────────────────────────────────────────────────────────────────────
// Luke: "he tells you secret things that only VIPs get to know about, like mechanics of the game that people
// might know about."
//
// ── AND THEN: "THE BARTENDER IS LEAKING INTERNAL DETAILS" ────────────────────────────────────────────────────
// He was, badly, and it is worth writing down how because the first version was built on a rule that sounded
// right. That rule was: every line must be a TRUE, checkable fact about a real system, taken from the file
// that owns it. The reasoning was that a bartender who invents things is one nobody talks to twice.
//
// What it produced was a man reading out our own source code. The worst of them told VIPs that "the build
// refuses to ship if the best machine pays more than eight points over the worst" — which is check:slot5, a
// script, described to a customer as though it were a fact about the world. Others leaked development
// history: keno "used to pay half", the table takes no rake "any more". A member has no idea what the game
// used to do and should not be told; that is a changelog, and it is ours.
//
// THE RULE NOW IS THE OPPOSITE ONE. Rolf talks about the DEN — the building, the town, the people in it, the
// things he has watched happen over the bar. None of it is checkable because none of it is a claim about a
// system: there is no number in here to go stale, no odds to get wrong, and nothing that stops being true
// when somebody retunes a paytable. Flavour cannot rot.
//
// If a member wants to know what a machine pays, the machine says so on its own face — the keno ladder and
// the bingo pattern banner both print real chips at the real stake. That is where a number belongs: on the
// thing it describes, at the moment you are deciding. Not in a story.
//
// ── AND HE KNOWS WHOSE ROOM THIS IS ──────────────────────────────────────────────────────────────────────────
// Luke: "be very respectful of the VIP's status." Every line is written to somebody who belongs here. He is
// warm rather than deferential — a good bartender is not a servant — but nothing in here is ever a sales
// pitch, a nudge to play, or a hint that the rope was a close-run thing. Two of them say outright that
// nobody is checking anything at that door, because the nicest thing this room can do is stop being a test
// the moment you are inside it.
const BARTENDER = [
    { id: "rope", text: "That rope by the door is older than the floor it stands on. It came out of the first "
        + "shop, where it hung across a doorway to a stockroom — and people still asked what was behind it." },
    { id: "no_check", text: "You will have noticed nobody checks anything at that rope. Nobody needs to. The "
        + "floor knows who you are before you have finished crossing it, and so do I." },
    { id: "tab", text: "Your tab in here does not exist. I am told that is a very old joke and I am required "
        + "to keep making it. Order what you like." },
    { id: "glasses", text: "Every glass behind this bar is a different shape and not one of them was bought. "
        + "Members left them. Nobody has ever told me which is whose, and I have never once got it wrong." },
    { id: "lamps", text: "The lamps in here are set lower than the ones on the floor, and that is deliberate. "
        + "Out there the light is for the machines. In here it is for the company." },
    { id: "sable", text: "Sable will tell you she keeps the good case shut because of the draught. She keeps "
        + "it shut because she likes the moment it opens." },
    { id: "wolves", text: "There were wolves in this valley a long time before there was a town, and the town "
        + "is named for a den nobody has ever actually found. The Den keeps the name and lets the argument run." },
    { id: "arbiter", text: "The Arbiter does not sleep, does not blink, and has never once raised its voice. I "
        + "watched it settle a row over a trade in four words. I have been trying to learn that for years." },
    { id: "road", text: "Everyone who has been far up the Long Road says the same thing — the further you go, "
        + "the quieter the houses get. Nobody has told me what is at the end of it. I stopped asking." },
    { id: "sea", text: "The old sailors drink in here when the weather turns. They will not tell you where the "
        + "good water is, but they will happily tell you where it is not, which is nearly the same thing said "
        + "politely." },
    { id: "forge", text: "The Forge runs hot day and night and nobody has ever seen the smith eat. Somebody "
        + "once suggested the fire does it for him. Nobody has suggested it twice." },
    { id: "farm", text: "Half the members with a farm out there started with one animal they fully intended to "
        + "sell on. I have yet to meet one who did." },
    { id: "dragon", text: "The thing that comes over the bingo hall is not the shop's, and the shop has never "
        + "pretended otherwise. It arrives when it arrives. We keep the roof in good repair and we do not "
        + "discuss it." },
    { id: "stockade", text: "The stockade in the square stands empty most weeks and the Den would rather keep "
        + "it that way. It is not there to be used. It is there to be seen." },
    { id: "board", text: "The board behind me has had the same nail in it for years. It has held apologies, "
        + "directions, one proposal of marriage and a very great deal of nonsense. Yours is welcome among them." },
    { id: "trophies", text: "The trophy room is arranged by who won each thing rather than by what it is "
        + "worth. That caused an enormous argument at the time, and the member who suggested it was right." },
    { id: "quiet", text: "The best hour in here is the one after the shop shuts. The floor goes quiet, the "
        + "lamps stay on, and whoever is left stops playing and starts talking." },
    { id: "seat", text: "That seat you are in belonged to a member who came every Friday for six years and "
        + "never once played a machine. He came for the room. I have always thought he had the right of it." },
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
    await trackActivity(buyerId, "casino_vip_enter", { spentCents }).catch(() => {});
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
