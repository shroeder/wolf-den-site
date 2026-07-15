import "server-only";

import { db } from "@/lib/db";
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
        firstName: row.first_name || null,
        lastName: row.last_name || null,
        fullName: fullName || null,
        alias: row.alias || null,
        avatarUrl: row.avatar_url || null,
        // A friendly label for UI: full name, else alias, else the email local-part.
        displayLabel: fullName || row.alias || row.display_name || (row.email ? String(row.email).split("@")[0] : "Member"),
        badges,
        level: levelForXp(row.xp || 0),
    };
}

// The signed-in user's own profile (includes email).
export async function getProfile(buyerId) {
    if (!buyerId) return null;
    const row = await db.queryOne(
        `SELECT id, email, display_name, first_name, last_name, alias, avatar_url, xp
           FROM mkt_buyer WHERE id = $1`,
        [buyerId]
    );
    if (!row) return null;
    return mapProfile(row, await getUserBadges(row.id));
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
    delete profile.email;
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
export async function updateProfile(buyerId, { firstName, lastName, alias } = {}) {
    if (!buyerId) throw new Error("Not signed in.");

    const sets = [];
    const params = [buyerId];
    const push = (frag, value) => {
        params.push(value);
        sets.push(`${frag} = $${params.length}`);
    };

    if (firstName !== undefined) push("first_name", firstName ? String(firstName).trim().slice(0, 80) : null);
    if (lastName !== undefined) push("last_name", lastName ? String(lastName).trim().slice(0, 80) : null);

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
