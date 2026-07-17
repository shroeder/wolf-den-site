import "server-only";

import { db } from "@/lib/db";
import { discordConfig } from "@/lib/marketplace/discord.js";
import { backgroundById, isBackgroundUnlocked } from "@/lib/marketplace/backgrounds.js";
import { borderById, isBorderUnlocked } from "@/lib/marketplace/borders.js";
import { collectibleById, isCollectibleUnlocked } from "@/lib/marketplace/collectibles.js";
import { frameById, isFrameUnlocked } from "@/lib/marketplace/frames.js";
import { sanitizeGameInterests } from "@/lib/marketplace/games.js";
import { MAX_SHOWCASE, pickShowcaseBadges } from "@/lib/marketplace/badge-display.js";
import { DEFAULT_AVATAR_URL, sanitizeAvatarConfig } from "@/lib/marketplace/avatar-options.js";
import { avatarImageUrl, COSMETIC_SLOTS, cosmeticById, isCosmeticUnlocked, sanitizeCosmetics } from "@/lib/marketplace/avatar-cosmetics.js";
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
        // Built avatar (with any native hat cosmetic baked in) wins; else photo; else initials.
        avatarUrl: avatarImageUrl(row.avatar_config, row.avatar_cosmetics) || row.avatar_url || DEFAULT_AVATAR_URL,
        // The raw config so the avatar builder can load the member's current choices.
        avatarConfig: row.avatar_config || null,
        // Equipped avatar cosmetics per slot (aura/headwear/effect/pet) — layered onto the portrait.
        avatarCosmetics: sanitizeCosmetics(row.avatar_cosmetics),
        // PUBLIC identity — never the real first/last name (those are private). Prefer the chosen
        // display name, then the @handle. Real name only ever goes to the account owner (firstName/
        // lastName/fullName fields below), never into a cross-user label.
        displayLabel: row.display_name || row.alias || (row.email ? String(row.email).split("@")[0] : "Member"),
        badges,
        level: levelForXp(row.xp || 0),
        discordLinked: Boolean(row.discord_user_id),
        // Equipped cosmetic avatar border id ('none' when unset). Public — it's just a frame style.
        border: row.equipped_border || "none",
        // Equipped cosmetic profile background id ('none' when unset).
        background: row.equipped_background || "none",
        // Equipped cosmetic profile frame id ('none' when unset) — the inset textured card border.
        frame: row.equipped_frame || "none",
        // Badges shown ON the card: the member's showcase (up to 3), or their top few by default.
        displayBadges: pickShowcaseBadges(badges, row.showcase_badge_slugs || null),
        // The "folder tab" = the top-ranked of the showcased badges (silent; no explicit primary).
        featuredBadge: pickShowcaseBadges(badges, row.showcase_badge_slugs || null)[0] || null,
        // The RAW stored showcase (for the picker). Empty = default (top few).
        showcaseSlugs: row.showcase_badge_slugs || [],
        // The collectible the member features on their card / public profile (id, or null). Level only ever
        // rises, so an unlocked pick stays valid — the display components resolve the id to its icon.
        featuredCollectibleId: row.featured_collectible || null,
        // Games the member says they play (null = never answered → show the onboarding prompt). Drives
        // targeted CTAs like Friday Night Magic sign-up.
        gameInterests: row.game_interests || null,
        fnmDismissed: Boolean(row.fnm_cta_dismissed_at),
        // Email notification prefs (default on).
        notifyEmailDm: row.notify_email_dm !== false,
        notifyEmailFriend: row.notify_email_friend !== false,
    };
}

// The signed-in user's own profile (includes email).
export async function getProfile(buyerId) {
    if (!buyerId) return null;
    const row = await db.queryOne(
        `SELECT id, email, phone, display_name, first_name, last_name, alias, avatar_url, avatar_config, avatar_cosmetics, xp, discord_user_id, equipped_border, equipped_background, equipped_frame, showcase_badge_slugs, featured_collectible, game_interests, fnm_cta_dismissed_at, notify_email_dm, notify_email_friend
           FROM mkt_buyer WHERE id = $1`,
        [buyerId]
    );
    if (!row) return null;
    const profile = mapProfile(row, await getUserBadges(row.id));
    profile.discordEnabled = discordConfig().enabled;
    return profile;
}

// Equip a cosmetic profile border. Validated against the member's level (can't wear a locked frame).
// Pass 'none' to clear. Returns the refreshed profile.
export async function equipBorder(buyerId, borderId) {
    if (!buyerId) throw new Error("Not signed in.");
    const border = borderById(borderId);
    const row = await db.queryOne(`SELECT xp FROM mkt_buyer WHERE id = $1`, [buyerId]);
    const level = levelForXp(row?.xp || 0).level;
    // Badges gate role borders; owner/site_admin/staff also get an "unlock all LEVEL borders" perk (but
    // NOT role borders — those still need the actual badge).
    const badgeRows = await db.query(`SELECT badge_slug FROM mkt_user_badge WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const badges = badgeRows.map((r) => r.badge_slug);
    const unlockAll = badges.some((s) => ["owner", "site_admin", "staff"].includes(s));
    if (border.id !== "none" && !isBorderUnlocked(border.id, level, { badges, unlockAll })) {
        throw new Error(border.requiresBadges ? `That frame is ${border.lockLabel || "role"}-exclusive.` : `That border unlocks at Level ${border.level}.`);
    }
    await db.query(`UPDATE mkt_buyer SET equipped_border = $2, updated_at = NOW() WHERE id = $1`, [buyerId, border.id === "none" ? null : border.id]);
    return getProfile(buyerId);
}

// Update email notification prefs. Only the keys provided are changed.
export async function updateNotifyPrefs(buyerId, { dm, friend } = {}) {
    if (!buyerId) throw new Error("Not signed in.");
    const sets = [];
    const params = [buyerId];
    if (dm !== undefined) { params.push(Boolean(dm)); sets.push(`notify_email_dm = $${params.length}`); }
    if (friend !== undefined) { params.push(Boolean(friend)); sets.push(`notify_email_friend = $${params.length}`); }
    if (sets.length) await db.query(`UPDATE mkt_buyer SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`, params).catch(() => {});
    return getProfile(buyerId);
}

// Equip a cosmetic profile background. Validated against level (staff bypass unlocks all). 'none' clears.
export async function equipBackground(buyerId, backgroundId) {
    if (!buyerId) throw new Error("Not signed in.");
    const bg = backgroundById(backgroundId);
    const row = await db.queryOne(`SELECT xp FROM mkt_buyer WHERE id = $1`, [buyerId]);
    const level = levelForXp(row?.xp || 0).level;
    const badgeRows = await db.query(`SELECT badge_slug FROM mkt_user_badge WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const unlockAll = badgeRows.map((r) => r.badge_slug).some((s) => ["owner", "site_admin", "staff"].includes(s));
    if (bg.id !== "none" && !isBackgroundUnlocked(bg.id, level, { unlockAll })) {
        throw new Error(`That background unlocks at Level ${bg.level}.`);
    }
    await db.query(`UPDATE mkt_buyer SET equipped_background = $2, updated_at = NOW() WHERE id = $1`, [buyerId, bg.id === "none" ? null : bg.id]);
    return getProfile(buyerId);
}

// Equip a cosmetic profile frame (the inset textured card border). Validated against level (staff
// bypass unlocks all). 'none' clears. Returns the refreshed profile.
export async function equipFrame(buyerId, frameId) {
    if (!buyerId) throw new Error("Not signed in.");
    const frame = frameById(frameId);
    const row = await db.queryOne(`SELECT xp FROM mkt_buyer WHERE id = $1`, [buyerId]);
    const level = levelForXp(row?.xp || 0).level;
    const badgeRows = await db.query(`SELECT badge_slug FROM mkt_user_badge WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const badges = badgeRows.map((r) => r.badge_slug);
    const unlockAll = badges.some((s) => ["owner", "site_admin", "staff"].includes(s));
    if (frame.id !== "none" && !isFrameUnlocked(frame.id, level, { badges, unlockAll })) {
        throw new Error(frame.requiresBadges ? `That frame is ${frame.lockLabel || "role"}-exclusive.` : `That frame unlocks at Level ${frame.level}.`);
    }
    await db.query(`UPDATE mkt_buyer SET equipped_frame = $2, updated_at = NOW() WHERE id = $1`, [buyerId, frame.id === "none" ? null : frame.id]);
    return getProfile(buyerId);
}

// Save the member's built avatar config (validated), or clear it (pass null) to revert to their photo.
export async function setAvatarConfig(buyerId, config) {
    if (!buyerId) throw new Error("Not signed in.");
    const clean = config ? sanitizeAvatarConfig(config) : null;
    // Bump avatar_updated_at only when they set/change a built avatar, so the sprite job knows to redraw it.
    await db.query(
        `UPDATE mkt_buyer
            SET avatar_config = $2::jsonb, updated_at = NOW(),
                avatar_updated_at = CASE WHEN $2 IS NULL THEN avatar_updated_at ELSE NOW() END
          WHERE id = $1`,
        [buyerId, clean ? JSON.stringify(clean) : null]
    );
    return getProfile(buyerId);
}

// Equip (or clear, id=null) an avatar cosmetic in a slot. Validates the cosmetic is unlocked for the
// member's level (staff bypass). Returns the refreshed profile.
export async function equipAvatarCosmetic(buyerId, slot, id) {
    if (!buyerId) throw new Error("Not signed in.");
    if (!COSMETIC_SLOTS.includes(slot)) throw new Error("Unknown slot.");
    const row = await db.queryOne(`SELECT xp, avatar_cosmetics FROM mkt_buyer WHERE id = $1`, [buyerId]);
    const current = sanitizeCosmetics(row?.avatar_cosmetics);
    if (id) {
        const cosmetic = cosmeticById(id);
        if (!cosmetic || cosmetic.slot !== slot) throw new Error("That cosmetic doesn't fit here.");
        const level = levelForXp(row?.xp || 0).level;
        const badgeRows = await db.query(`SELECT badge_slug FROM mkt_user_badge WHERE buyer_id = $1`, [buyerId]).catch(() => []);
        const unlockAll = badgeRows.map((r) => r.badge_slug).some((s) => ["owner", "site_admin", "staff"].includes(s));
        if (!isCosmeticUnlocked(cosmetic, level, { unlockAll })) throw new Error(`That unlocks at Level ${cosmetic.level}.`);
    }
    const next = { ...current, [slot]: id || null };
    await db.query(`UPDATE mkt_buyer SET avatar_cosmetics = $2::jsonb, updated_at = NOW() WHERE id = $1`, [buyerId, JSON.stringify(next)]);
    return getProfile(buyerId);
}

// Set the badges the member showcases on their card (up to MAX_SHOWCASE). Each must be a badge they
// hold; pass [] to clear (falls back to their top few). The top-ranked of the set becomes the tab.
export async function setShowcaseBadges(buyerId, slugs) {
    if (!buyerId) throw new Error("Not signed in.");
    let clean = Array.isArray(slugs) ? [...new Set(slugs.map((s) => String(s).trim()).filter(Boolean))].slice(0, MAX_SHOWCASE) : [];
    if (clean.length) {
        const held = await db.query(`SELECT badge_slug FROM mkt_user_badge WHERE buyer_id = $1 AND badge_slug = ANY($2)`, [buyerId, clean]).catch(() => []);
        const heldSet = new Set(held.map((r) => r.badge_slug));
        clean = clean.filter((s) => heldSet.has(s));
    }
    await db.query(`UPDATE mkt_buyer SET showcase_badge_slugs = $2, updated_at = NOW() WHERE id = $1`, [buyerId, clean.length ? clean : null]);
    return getProfile(buyerId);
}

// Feature one collectible on the member's card + public profile. Must be a real collectible they've
// unlocked at their current level; pass null/"" to clear. Returns the refreshed profile.
export async function setFeaturedCollectible(buyerId, id) {
    if (!buyerId) throw new Error("Not signed in.");
    const clean = String(id || "").trim();
    let toStore = null;
    if (clean) {
        const item = collectibleById(clean);
        if (!item) throw new Error("Unknown collectible.");
        const row = await db.queryOne(`SELECT xp FROM mkt_buyer WHERE id = $1`, [buyerId]);
        const level = levelForXp(row?.xp || 0).level;
        if (!isCollectibleUnlocked(item, level)) throw new Error(`Reach Level ${item.level} to feature ${item.name}.`);
        toStore = item.id;
    }
    await db.query(`UPDATE mkt_buyer SET featured_collectible = $2, updated_at = NOW() WHERE id = $1`, [buyerId, toStore]);
    return getProfile(buyerId);
}

// Record which games the member plays (onboarding "what do you play?"). Stores a sanitized array (never
// NULL once answered, so we stop prompting). Returns the refreshed profile.
export async function setGameInterests(buyerId, list) {
    if (!buyerId) throw new Error("Not signed in.");
    const clean = sanitizeGameInterests(list);
    await db.query(`UPDATE mkt_buyer SET game_interests = $2, updated_at = NOW() WHERE id = $1`, [buyerId, clean]);
    return getProfile(buyerId);
}

// Admin report: how many members play each game, plus the contactable roster (optionally filtered to one
// game — e.g. the Magic roster for FNM reminders). Includes email since this is admin-only.
export async function getGameInterestReport({ game = null } = {}) {
    const countRows = await db
        .query(`SELECT g AS game, COUNT(*)::int AS n FROM mkt_buyer, unnest(game_interests) AS g WHERE game_interests IS NOT NULL GROUP BY g`)
        .catch(() => []);
    const counts = Object.fromEntries(countRows.map((r) => [r.game, r.n]));

    const params = [];
    let where = `game_interests IS NOT NULL AND cardinality(game_interests) > 0`;
    if (game) { params.push(String(game)); where += ` AND $1 = ANY(game_interests)`; }
    const rows = await db
        .query(
            `SELECT id, display_name, first_name, last_name, alias, email, game_interests, COALESCE(xp, 0) AS xp
               FROM mkt_buyer WHERE ${where} ORDER BY display_name NULLS LAST, alias NULLS LAST`,
            params
        )
        .catch(() => []);
    const answered = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_buyer WHERE game_interests IS NOT NULL`).catch(() => null);

    return {
        counts,
        answered: answered?.n || 0,
        members: rows.map((m) => ({
            id: m.id,
            name: m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.alias || "Member",
            alias: m.alias || null,
            email: m.email || null,
            interests: m.game_interests || [],
        })),
    };
}

// Dismiss the Friday Night Magic sign-up CTA so it stops showing for this member.
export async function dismissFnmCta(buyerId) {
    if (!buyerId) throw new Error("Not signed in.");
    await db.query(`UPDATE mkt_buyer SET fnm_cta_dismissed_at = NOW(), updated_at = NOW() WHERE id = $1`, [buyerId]);
    return getProfile(buyerId);
}

// Public leaderboard: top members by lifetime XP. Only accounts with a public @handle appear (opting in
// via a handle), and only those who've earned something. Returns rank + display bits (no contact info).
export async function getLeaderboard(limit = 50) {
    const rows = await db
        .query(
            `SELECT id, alias, avatar_url, avatar_config, avatar_cosmetics, first_name, last_name, display_name, xp, equipped_border, equipped_frame
               FROM mkt_buyer
              WHERE alias IS NOT NULL AND COALESCE(xp, 0) > 0
              ORDER BY xp DESC, updated_at ASC
              LIMIT $1`,
            [Math.max(1, Math.min(200, limit))]
        )
        .catch(() => []);
    return rows.map((row, i) => {
        const p = mapProfile(row, []);
        return { rank: i + 1, alias: p.alias, avatarUrl: p.avatarUrl, displayLabel: p.displayLabel, level: p.level, xp: row.xp || 0, border: p.border, frame: p.frame, avatarCosmetics: p.avatarCosmetics };
    });
}

// A public profile by handle (no email exposed).
export async function getPublicProfileByAlias(alias) {
    const a = normalizeAlias(alias);
    if (!a) return null;
    const row = await db.queryOne(
        `SELECT id, display_name, first_name, last_name, alias, avatar_url, avatar_config, avatar_cosmetics, xp, equipped_border, equipped_background, equipped_frame, showcase_badge_slugs, featured_collectible
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
