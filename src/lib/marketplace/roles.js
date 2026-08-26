import { db } from "@/lib/db.js";
import { isOwner, isStaff } from "@/lib/marketplace/owner.js";
import { levelForXp } from "@/lib/marketplace/xp-curve.js";
import { SPEND_XP_PER_DOLLAR } from "@/lib/marketplace/xp.js";
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

// ── SEVEN HUNDRED DOLLARS, ACROSS THE COUNTER AND ONLINE TOGETHER ────────────────────────────────────────────
// Luke first said a thousand, then "maybe VIP is seven hundred dollars or more" once he saw where people
// actually sit. A thousand qualified exactly ONE member, which is not a room, it is somebody talking to
// themselves. Seven hundred qualifies four — dumbguy247 $1,053, JT $887, Sky $886, jim $802 — and it lands in
// a natural gap: the next member down is at $531, so nobody is agonisingly a few dollars short of it.
//
// BOTH SOURCES, WHOLE. Luke: "we have a QR code that people redeem to register if they bought something, and
// obviously we have online sales — my consideration was only for those two things." Exactly those two, and
// both now counted in full: the 48 counter redemptions from before 23 July that carry no stamped amount are
// reconstructed from their XP rather than counted as nothing.
export const VIP_CENTS = 70000;

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
        // ── IN-STORE SPEND, INCLUDING THE EVENTS THAT PREDATE THE STAMP ──────────────────────────────
        // The QR handshake at the counter writes a purchase_spend event; since 23 July it stamps the real
        // merchandise amount into the meta. The 48 events before that carry only the Square order id and the
        // XP — and XP is `dollars x SPEND_XP_PER_DOLLAR`, so the amount is recoverable by dividing it back
        // out. That is not a guess: awardXp documents the relationship and badges.js already falls back to
        // exactly this for the same rows. Counting them as zero, which is what this did first, quietly
        // understated everybody who was buying in the shop's first week.
        db.queryOne(
            `SELECT COALESCE(SUM(COALESCE((meta->>'amountCents')::numeric, points * 100.0 / ${SPEND_XP_PER_DOLLAR})), 0)::bigint AS c
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
    // ── ANNOUNCEMENTS ────────────────────────────────────────────────────────────────────────────────────
    // Luke: "let's make an announcements channel and have arena messages and arbiter messages go there."
    // Everybody can read it and nobody can write to it but the house — see sendTownChat, which refuses it
    // outright. It is a room in the same sense a noticeboard is a room.
    announce: { key: "announce", name: "News", readOnly: true },
    vip: { key: "vip", name: "VIP" },
    staff: { key: "staff", name: "Staff" },
};

/** Which channels a member may read and write. Global is everybody, including signed-out readers. */
export function channelsFor(buyerId, roles = []) {
    const has = (k) => roles.some((r) => r.key === k);
    // Announcements sit beside the plaza: no gate, no join window, and everybody has it.
    const out = ["global", "announce"];
    // Owners and staff are in the VIP room by default, on Luke's call — the room is a perk, and the people
    // running the shop being absent from it would make it a room the shop cannot hear.
    if (has("vip") || has("staff") || has("owner")) out.push("vip");
    if (has("staff") || has("owner")) out.push("staff");
    return out;
}

/**
 * Every member who BELONGS in a private room — whether or not they have ever opened it.
 *
 * ── QUALIFYING IS THE MEMBERSHIP; THE ROW IS ONLY A VISIT ────────────────────────────────────────────────────
 * Luke, of the VIP rail: "the list should also show everyone in that group not online."
 *
 * The rail was built from `mkt_channel_member`, and that table is written by `joinedAt` the first time somebody
 * OPENS the room. So it is a list of people who have been in, not a list of people who are in it — and on the
 * live site those differ badly: four members had cleared the VIP threshold in the shop and never tapped the
 * tab, so a room with six members drew two. Somebody looking at that rail would reasonably conclude the perk
 * they had paid seven hundred dollars for had nobody in it.
 *
 * So membership is COMPUTED, from the same three facts `standingFor` builds the roles out of — the owner list,
 * the staff list, and the spend threshold. `channelsFor` above is what decides who may open which door; this
 * has to agree with it exactly or the rail and the gate describe two different rooms.
 *
 * The OPEN rooms get null rather than a list: every member of the Den is in the plaza, and a rail of everybody
 * is a phone book, not a roster. channelRoster keeps its own rule for those — see the note there.
 */
export async function channelMemberIds(channel) {
    const chan = String(channel || "");
    if (chan !== "vip" && chan !== "staff") return null;
    const { houseBuyerIds } = await import("@/lib/marketplace/owner.js");
    const house = houseBuyerIds();
    // The back room is the two lists and nothing else — there is no way to spend your way into it.
    if (chan === "staff") return house;
    // ── AND VIP IS THE HOUSE PLUS EVERYBODY OVER THE LINE ────────────────────────────────────────────────
    // The same two sources standingFor adds up, in one pass over the membership instead of one query each:
    // the in-store purchase events (falling back to dividing the XP back out for the 48 rows that predate the
    // amount stamp — see the note in standingFor) and the paid online credit purchases.
    const rows = await db.query(
        `SELECT b.id
           FROM mkt_buyer b
           LEFT JOIN (SELECT buyer_id,
                             SUM(COALESCE((meta->>'amountCents')::numeric, points * 100.0 / ${SPEND_XP_PER_DOLLAR})) AS c
                        FROM mkt_xp_event WHERE action = 'purchase_spend' GROUP BY buyer_id) s ON s.buyer_id = b.id
           LEFT JOIN (SELECT buyer_id, SUM(amount_cents) AS c
                        FROM mkt_credit_purchase WHERE status = 'paid' GROUP BY buyer_id) o ON o.buyer_id = b.id
          WHERE COALESCE(s.c, 0) + COALESCE(o.c, 0) >= $1`,
        [VIP_CENTS],
    ).catch(() => []);
    return [...new Set([...house, ...(rows || []).map((r) => String(r.id))])];
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
    // The two OPEN rooms have no join window — their history is public and a member arriving today should
    // see what the house said last week. Only the private rooms hide what was said before you were in them.
    if (!buyerId || channel === "global" || channel === "announce") return null;
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
