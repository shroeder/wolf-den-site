import "server-only";

import { db } from "@/lib/db";
import { discordConfig } from "@/lib/marketplace/discord.js";
import { awardXp, levelForXp } from "@/lib/marketplace/xp.js";

// First-class user profiles built on mkt_buyer (the unified account). Name, a unique public @handle
// (alias), an avatar, and admin-curated badges. Levels/XP arrive in a later phase.

const ALIAS_RE = /^[a-z0-9_]{3,20}$/;
const RESERVED_ALIASES = new Set([
    "admin", "administrator", "wolfden", "wolf_den", "thewolfden", "owner", "staff", "support",
    "moderator", "mod", "system", "api", "null", "undefined", "me", "you",
]);

export function normalizeAlias(alias) {
    return String(alias || "").trim().toLowerCase();
}

// Normalize a phone to E.164 when we can (US-friendly), else best-effort digits. Null for empty.
export function normalizePhone(input) {
    const raw = String(input || "").trim();
    if (!raw) return null;
    if (raw.startsWith("+")) {
        const d = raw.replace(/\D/g, "");
        return d ? `+${d}` : null;
    }
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return digits || null;
}

// Returns the reason it's invalid, or null if the format is acceptable (uniqueness checked separately).
export function aliasFormatError(alias) {
    const a = normalizeAlias(alias);
    if (!a) return "Pick a handle.";
    if (!ALIAS_RE.test(a)) return "Handles are 3–20 characters: letters, numbers, or underscores.";
    if (RESERVED_ALIASES.has(a)) return "That handle is reserved.";
    return null;
}

// True if the handle is free (optionally ignoring one account, for edits).
export async function isAliasAvailable(alias, exceptBuyerId = null) {
    const a = normalizeAlias(alias);
    if (aliasFormatError(a)) return false;
    const row = await db.queryOne(
        `SELECT id FROM mkt_buyer WHERE alias_normalized = $1 AND ($2::uuid IS NULL OR id <> $2) LIMIT 1`,
        [a, exceptBuyerId]
    );
    return !row;
}

// Slugify a seed (display name / email local-part) into a valid handle base: a-z0-9_, 3–20 chars.
function aliasBase(seed) {
    let base = String(seed || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (base.length < 3) base = `${base}member`.slice(0, 8);
    return base.slice(0, 20);
}

// Ensure a buyer has a public @handle — assign a unique one derived from `seed` if they don't. Handles
// are mandatory (so everyone shows on the leaderboard); still user-editable afterward. Best-effort.
export async function ensureAlias(buyerId, seed) {
    if (!buyerId) return null;
    const existing = await db.queryOne(`SELECT alias FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (existing?.alias) return existing.alias;

    const base = aliasBase(seed);
    let candidate = base;
    let n = 1;
    while (!(await isAliasAvailable(candidate, buyerId))) {
        n += 1;
        const suffix = String(n);
        candidate = `${base.slice(0, 20 - suffix.length)}${suffix}`;
        if (n > 5000) return null; // give up rather than loop forever
    }
    await db
        .query(`UPDATE mkt_buyer SET alias = $2, alias_normalized = $2, updated_at = NOW() WHERE id = $1 AND alias IS NULL`, [buyerId, candidate])
        .catch(() => {});
    return candidate;
}

export async function getUserBadges(buyerId) {
    if (!buyerId) return [];
    return db.query(
        `SELECT b.slug, b.label, b.description, b.icon, b.color
           FROM mkt_user_badge ub
           JOIN mkt_badge b ON b.slug = ub.badge_slug
          WHERE ub.buyer_id = $1
          ORDER BY b.sort_order ASC, b.label ASC`,
        [buyerId]
    );
}

function mapProfile(row, badges = []) {
    if (!row) return null;
    const first = row.first_name || "";
    const last = row.last_name || "";
    const fullName = `${first} ${last}`.trim();
    return {
        id: row.id,
        email: row.email || null,
        phone: row.phone || null,
        firstName: row.first_name || null,
        lastName: row.last_name || null,
        fullName: fullName || null,
        alias: row.alias || null,
        avatarUrl: row.avatar_url || null,
        // PUBLIC identity — never the real first/last name (those are private). Prefer the chosen
        // display name, then the @handle. Real name only ever goes to the account owner (firstName/
        // lastName/fullName fields below), never into a cross-user label.
        displayLabel: row.display_name || row.alias || (row.email ? String(row.email).split("@")[0] : "Member"),
        badges,
        level: levelForXp(row.xp || 0),
        discordLinked: Boolean(row.discord_user_id),
    };
}

// The signed-in user's own profile (includes email).
export async function getProfile(buyerId) {
    if (!buyerId) return null;
    const row = await db.queryOne(
        `SELECT id, email, phone, display_name, first_name, last_name, alias, avatar_url, xp, discord_user_id
           FROM mkt_buyer WHERE id = $1`,
        [buyerId]
    );
    if (!row) return null;
    const profile = mapProfile(row, await getUserBadges(row.id));
    profile.discordEnabled = discordConfig().enabled;
    return profile;
}

// Public leaderboard: top members by lifetime XP. Only accounts with a public @handle appear (opting in
// via a handle), and only those who've earned something. Returns rank + display bits (no contact info).
export async function getLeaderboard(limit = 50) {
    const rows = await db
        .query(
            `SELECT id, alias, avatar_url, first_name, last_name, display_name, xp
               FROM mkt_buyer
              WHERE alias IS NOT NULL AND COALESCE(xp, 0) > 0
              ORDER BY xp DESC, updated_at ASC
              LIMIT $1`,
            [Math.max(1, Math.min(200, limit))]
        )
        .catch(() => []);
    return rows.map((row, i) => {
        const p = mapProfile(row, []);
        return { rank: i + 1, alias: p.alias, avatarUrl: p.avatarUrl, displayLabel: p.displayLabel, level: p.level, xp: row.xp || 0 };
    });
}

// A public profile by handle (no email exposed).
export async function getPublicProfileByAlias(alias) {
    const a = normalizeAlias(alias);
    if (!a) return null;
    const row = await db.queryOne(
        `SELECT id, display_name, first_name, last_name, alias, avatar_url, xp
           FROM mkt_buyer WHERE alias_normalized = $1`,
        [a]
    );
    if (!row) return null;
    const profile = mapProfile(row, await getUserBadges(row.id));
    // Public view: strip every private field. The @handle / display name is the only public identity.
    delete profile.email;
    delete profile.phone;
    delete profile.firstName;
    delete profile.lastName;
    delete profile.fullName;
    return profile;
}

// One-time +XP once a profile has a name, a handle, and an avatar. Best-effort; dedupe key = once ever.
async function maybeAwardProfileComplete(profile) {
    if (!profile) return;
    const complete = Boolean((profile.fullName || "").trim()) && Boolean(profile.alias) && Boolean(profile.avatarUrl);
    if (!complete) return;
    await awardXp(profile.id, "profile_complete", { dedupeKey: `profile_complete:${profile.id}` }).catch(() => {});
}

// Update name + handle. Throws a user-facing message on bad/taken handle. Any field may be omitted.
export async function updateProfile(buyerId, { firstName, lastName, alias, phone } = {}) {
    if (!buyerId) throw new Error("Not signed in.");

    const sets = [];
    const params = [buyerId];
    const push = (frag, value) => {
        params.push(value);
        sets.push(`${frag} = $${params.length}`);
    };

    if (firstName !== undefined) push("first_name", firstName ? String(firstName).trim().slice(0, 80) : null);
    if (lastName !== undefined) push("last_name", lastName ? String(lastName).trim().slice(0, 80) : null);
    if (phone !== undefined) push("phone", normalizePhone(phone));

    if (alias !== undefined) {
        if (alias === null || alias === "") {
            push("alias", null);
            push("alias_normalized", null);
        } else {
            const err = aliasFormatError(alias);
            if (err) throw new Error(err);
            const normalized = normalizeAlias(alias);
            if (!(await isAliasAvailable(normalized, buyerId))) throw new Error("That handle is taken.");
            push("alias", String(alias).trim());
            push("alias_normalized", normalized);
        }
    }

    if (sets.length === 0) return getProfile(buyerId);

    await db.query(`UPDATE mkt_buyer SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`, params);
    const updated = await getProfile(buyerId);
    await maybeAwardProfileComplete(updated);
    return updated;
}

export async function setAvatar(buyerId, url) {
    if (!buyerId) throw new Error("Not signed in.");
    await db.query(`UPDATE mkt_buyer SET avatar_url = $2, updated_at = NOW() WHERE id = $1`, [buyerId, url || null]);
    const updated = await getProfile(buyerId);
    await maybeAwardProfileComplete(updated);
    return updated;
}
