import { db } from "@/lib/db.js";
import { isOwner, isStaff } from "@/lib/marketplace/owner.js";
import { levelForXp } from "@/lib/marketplace/xp-curve.js";
import { RANKS, rankForLevel } from "@/lib/marketplace/ranks.js";

// ── ROLES ────────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "I'd like the ability to set my role in my profile — for example if I'm staff or an owner, I'd love to
// set that role so it shows up next to my name in chat, each role has its own colour. Roles are something you
// can earn: someone who has spent over 1000 in the store or online can have the VIP role. Otherwise people's
// role can default to their rank in levels, like Pack Leader or whatever they are currently at."
//
// TWO HALVES, AND KEEPING THEM APART IS THE WHOLE DESIGN.
//
//   WHAT YOU HAVE EARNED is decided here, on the server, from facts the server already holds: the owner list,
//   the staff list, lifetime spend, and your level. It is never sent up from the client and never trusted from
//   it. A role you can assert is a role that means nothing.
//
//   WHICH ONE YOU SHOW is yours to choose, out of the ones you have earned, and lives in mkt_buyer.role. An
//   owner who would rather wear their level rank can, and the day somebody stops qualifying for a role the
//   chip falls back on its own — see `roleFor`, which validates the stored choice against the live list every
//   time rather than trusting what was written months ago.
//
// The rank ladder is the floor under all of it: everybody has a role, always, because "no role" renders as a
// gap next to some names and a chip next to others, which reads as a bug rather than as a distinction.

// ── THE RANK LADDER ALREADY EXISTED ──────────────────────────────────────────────────────────────────────────
// I wrote a second one here — Cub to Fenrir already lives in ranks.js, twenty rungs, with rankForLevel beside
// it — and a second ladder is the exact failure the XP curve's own header warns about: two files quietly
// describing a different game. Luke: "there is a level rank ladder." There is, and this imports it.
//
// The only thing added was a COLOUR per rung, and that went on the ladder itself rather than into a lookup
// table here, so the rank a member wears in chat and the rank the level track shows them can never drift.

// ── THE EARNED ROLES ─────────────────────────────────────────────────────────────────────────────────────────
// Above the ladder. `rank` in the order below is a placeholder the caller fills in with the member's actual
// rung; everything else is fixed. Order matters — it is the order the chooser lists them in, and the first
// one a member qualifies for is what they get by default.
export const ROLES = {
    owner: { key: "owner", name: "Owner", tone: "#ffd75e", glow: true },
    staff: { key: "staff", name: "Staff", tone: "#ff6f7d", glow: true },
    vip: { key: "vip", name: "VIP", tone: "#b45aff", glow: true },
};

// A thousand dollars, across the counter and online together. Held here rather than inline so the number is
// one thing to change and so the copy on the profile can quote it without a second constant to drift.
export const VIP_CENTS = 100000;

/**
 * Everything the server knows about who somebody is. One call, three cheap reads, used by chat, the profile
 * and the channel gate — so those three can never disagree about whether you are a VIP.
 */
export async function standingFor(buyerId) {
    if (!buyerId) return { level: 1, rank: RANKS[0], spentCents: 0, roles: [], chosen: null };
    const [row, store, online] = await Promise.all([
        // `role` arrives in migration 402. Between the new code serving and that migration landing, asking
        // for it throws — and a null row here would read as level 1 with no roles, which would take VIP and
        // Staff off the people who have them and shut them out of their own rooms for the length of a
        // deploy. Falls back to the column that has always existed.
        db.queryOne(`SELECT xp, role FROM mkt_buyer WHERE id = $1`, [buyerId])
            .catch(() => db.queryOne(`SELECT xp, NULL AS role FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null)),
        // In-store spend carries its amount in the XP event's meta — see xp.js, which stamps amountCents on
        // every purchase_spend. COALESCE because the earliest events predate the stamp and carry no amount;
        // those count as spend for the "have you ever" test and as zero for this one, which is the honest
        // reading of a row that does not say how much.
        db.queryOne(
            `SELECT COALESCE(SUM((meta->>'amountCents')::bigint), 0) AS c
               FROM mkt_xp_event WHERE buyer_id = $1 AND action = 'purchase_spend'`,
            [buyerId],
        ).catch(() => null),
        db.queryOne(
            `SELECT COALESCE(SUM(amount_cents), 0) AS c
               FROM mkt_credit_purchase WHERE buyer_id = $1 AND status = 'paid'`,
            [buyerId],
        ).catch(() => null),
    ]);

    const level = levelForXp(Number(row?.xp) || 0).level;
    const rank = rankForLevel(level);
    const spentCents = Number(store?.c || 0) + Number(online?.c || 0);

    const roles = [];
    if (isOwner(buyerId)) roles.push(ROLES.owner);
    if (isStaff(buyerId)) roles.push(ROLES.staff);
    if (spentCents >= VIP_CENTS) roles.push(ROLES.vip);
    // The ladder is last and always present: it is the floor, not a prize.
    roles.push({ key: `rank:${rank.title}`, name: rank.title, tone: rank.tone, glow: false, rank: true });

    // ── THE STORED CHOICE IS VALIDATED, NOT TRUSTED ──────────────────────────────────────────────────────
    // Somebody who set VIP and later fell below the threshold, or a staff member who left, keeps a row saying
    // so. Checking it against the live list every time is what makes the chip mean something — and it costs
    // nothing, because the list was just computed.
    const want = row?.role || null;
    const chosen = roles.find((r) => r.key === want) || roles[0];
    return { level, rank, spentCents, roles, chosen };
}

/** Store a display choice. Rejected unless it is one the member has actually earned. */
export async function setRole(buyerId, key) {
    const { roles } = await standingFor(buyerId);
    if (!roles.some((r) => r.key === key)) return { ok: false, error: "not_earned" };
    await db.query(`UPDATE mkt_buyer SET role = $2 WHERE id = $1`, [buyerId, key]);
    return { ok: true, role: key };
}

// ── THE CHANNELS ─────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "two new channels, one for VIPs and one for staff and owners. These only show up as tabs in social if
// you are in that group. Owners and staff are by default able to participate in VIP chat. The chats are
// exclusive so non-members can't see into them."
export const CHANNELS = {
    global: { key: "global", name: "Global" },
    vip: { key: "vip", name: "VIP" },
    staff: { key: "staff", name: "Staff" },
};

/** Which channels a member may read and write. Global is everybody, including signed-out readers. */
export function channelsFor(buyerId, roles = []) {
    const has = (k) => roles.some((r) => r.key === k);
    const out = ["global"];
    // Owners and staff are in the VIP room by default, on Luke's call — the room is a perk, and the people
    // running the shop being absent from it would make it a room the shop cannot hear.
    if (has("vip") || has("staff") || has("owner")) out.push("vip");
    if (has("staff") || has("owner")) out.push("staff");
    return out;
}

/**
 * When this member joined this channel, creating the row the first time they qualify.
 *
 * ── AND YOU ONLY SEE WHAT WAS SAID AFTER YOU ARRIVED ─────────────────────────────────────────────────────────
 * Luke: "once you join that chat, for example if you become a VIP, you are only able to see messages from
 * after your join date." Which is the right rule for a private room and not merely a privacy one: a room whose
 * whole back catalogue arrives the moment you walk in is a wall of other people's conversation, and the first
 * thing a new VIP would do is scroll it rather than talk. Joining should feel like opening a door, not like
 * being handed a transcript.
 */
export async function joinedAt(buyerId, channel) {
    if (!buyerId || channel === "global") return null;
    const row = await db.queryOne(
        `INSERT INTO mkt_channel_member (buyer_id, channel) VALUES ($1, $2)
              ON CONFLICT (buyer_id, channel) DO UPDATE SET channel = EXCLUDED.channel
           RETURNING joined_at`,
        [buyerId, channel],
    ).catch(() => null);
    return row?.joined_at || null;
}

// ── THE CHIP, FROM A ROW THE FEED ALREADY HAS ────────────────────────────────────────────────────────────────
// `standingFor` is three queries, which is right for one member on their own profile and wrong for forty
// messages in a chat feed. This resolves the same answer from the two columns the chat's join already carries.
//
// It cannot see spend, so a stored `vip` choice is taken at face value HERE — the only thing that can write
// that value is setRole, which does check, so the row is proof that the member qualified at the moment they
// chose it. Owner and staff are re-checked from the live lists because those change without anybody choosing
// anything, and a former staff member wearing a Staff chip is the case that actually matters.
export function chipFor(buyerId, stored, xpTotal) {
    const level = levelForXp(Number(xpTotal) || 0).level;
    const rank = rankForLevel(level);
    const fallback = { key: `rank:${rank.title}`, name: rank.title, tone: rank.tone, glow: false, rank: true };
    if (!stored) return isOwner(buyerId) ? ROLES.owner : isStaff(buyerId) ? ROLES.staff : fallback;
    if (stored === "owner") return isOwner(buyerId) ? ROLES.owner : fallback;
    if (stored === "staff") return isStaff(buyerId) ? ROLES.staff : fallback;
    if (stored === "vip") return ROLES.vip;
    if (stored.startsWith("rank:")) return fallback;
    return fallback;
}
