import "server-only";

import { db } from "@/lib/db";
import { NOTIFY_MODES, isNotifyMode } from "@/lib/marketplace/notify-prefs-meta.js";

// ── GRANULAR NOTIFICATION PREFERENCES ────────────────────────────────────────────────────────────────────────
// One catalog, used by three things: the profile settings UI, the push senders, and the win-back digest. If a
// notification kind isn't in here it can't be turned off — so anything a member might reasonably want to mute
// belongs in this list, and every entry must be genuinely enforced (a toggle that does nothing is worse than
// no toggle at all).
//
// Stored on mkt_buyer.notify_prefs as { "<channel>:<kind>": false }. Absent = ON, so we only ever persist
// explicit opt-outs and new kinds need no backfill.

export const NOTIFY_GROUPS = [
    { key: "waiting", label: "Waiting on you", note: "Someone is expecting an answer. These are the ones worth keeping on." },
    { key: "social", label: "Social" },
    { key: "progress", label: "Your progress" },
    { key: "reminders", label: "Reminders", note: "Nudges about things that are ready or about to expire." },
    { key: "events", label: "Den-wide events", note: "Sent to everyone when something big kicks off." },
    { key: "shop", label: "Shop & cards" },
];

// channels: which channels this kind can actually be delivered on (drives which switches the UI shows).
export const NOTIFY_KINDS = [
    { key: "gift", group: "waiting", label: "Pet gifts", desc: "Someone offers you a pet, or accepts the one you offered", channels: ["push"] },
    { key: "creation", group: "waiting", label: "Shared creations", desc: "Someone shares their custom art with you, or asks for a copy of yours", channels: ["push"] },
    { key: "trade", group: "waiting", label: "Trade offers", desc: "A new trade offer, and when yours is accepted or declined", channels: ["push"] },
    { key: "auction", group: "waiting", label: "Auction house", desc: "Your listing sells, or comes back unsold", channels: ["push"] },

    { key: "dm", group: "social", label: "Messages", desc: "Someone sends you a direct message", channels: ["push", "email"] },
    { key: "friend", group: "social", label: "Friend requests", desc: "New requests, and when yours is accepted", channels: ["push", "email"] },

    { key: "badge", group: "progress", label: "Badges", desc: "You earn a new badge", channels: ["push", "email"] },
    { key: "levelup", group: "progress", label: "Level ups", desc: "You level up or unlock a reward", channels: ["push"] },

    { key: "boss", group: "reminders", label: "Daily boss strike", desc: "Your free daily hit is still unused", channels: ["push"] },
    { key: "crops", group: "reminders", label: "Crops ready", desc: "Your farm has a harvest waiting", channels: ["push"] },
    { key: "sailing", group: "reminders", label: "Sailing", desc: "Your boat reaches an island or sits idle at the dock", channels: ["push"] },

    { key: "raid", group: "events", label: "Town raids", desc: "A raid hits the plaza, and how it ended", channels: ["push"] },
    { key: "bossevent", group: "events", label: "Weekly boss", desc: "The boss appears, or the pack brings it down", channels: ["push", "email"] },
    { key: "bounty", group: "events", label: "Bounties", desc: "A member posts a new bounty", channels: ["push"] },
    { key: "announce", group: "events", label: "Big announcements", desc: "New features and Den news", channels: ["push", "email"] },
    // ── DELIVERED IN CHAT, NOT BY PUSH ───────────────────────────────────────────────────────────────────
    // The Arbiter is one voice doing two jobs: hand-written triage posts, which people ask for, and automated
    // milestones — a line in the plaza every time somebody takes a rung nobody has taken. Sunflower Jinxx:
    // "Are we able to turn off the auto messages for the road rungs?" The announcements stay; this is the
    // switch. It mutes ONLY the automated ones (mkt_town_chat.kind = 'milestone', migration 388), so muting
    // it never costs you a post a person wrote.
    { key: "milestone", group: "events", label: "Milestone posts in chat", desc: "The Arbiter announcing a first-in-the-Den — a new Long Road rung, a chronicle entry", channels: ["chat"] },

    // Push only: the Looking-For *email* goes to standalone card-alert subscribers (their own confirmed list
    // with its own unsubscribe link), not to member records, so a member-level email switch wouldn't bite.
    { key: "stock", group: "shop", label: "Back in stock", desc: "Something on your Looking-For list arrives", channels: ["push"] },
    { key: "order", group: "shop", label: "Order updates", desc: "Your online order is confirmed or changes", channels: ["push"] },

    // The win-back recap. Email only by definition — it exists to reach people push cannot.
    { key: "digest", group: "shop", label: "Weekly recap email", desc: "An occasional summary of what you missed while you were away", channels: ["email"], hideGroup: true },
];

// The VAPID keypair rotation date. Subscriptions created before it are signed for the old public key, so the
// push service rejects them (403) and broadcastWebPush never prunes them (it only prunes 404/410). Anything
// asking "can we actually reach this member by push?" has to discount them.
export const VAPID_ROTATED_AT = "2026-07-25";

// Every channel any kind can actually be delivered on. See the note in setNotifyPrefs for why this is
// derived rather than written down.
export const VALID_CHANNELS = new Set(NOTIFY_KINDS.flatMap((k) => k.channels));

// ── ALL, SOME OR NOTHING ─────────────────────────────────────────────────────────────────────────────────────
// Luke: "can we simplify notifications into like all, some, none."
//
// The granular matrix is thirty switches across six groups, and thirty switches is a screen people close. It
// is not wrong — every one of them is enforced and somebody eventually wants each — it is just the wrong
// FIRST question. The first question is how much you want to hear from us at all, and there are three honest
// answers to that.
//
// ── WHAT "SOME" MEANS, AND WHY IT IS NOT A HAND-TYPED LIST ───────────────────────────────────────────────────
// The catalog already sorts the kinds into groups by what they ARE, and the top group's note already says the
// thing: "Someone is expecting an answer. These are the ones worth keeping on." So Some is those groups, read
// off the catalog — which means a kind added to `waiting` later is in Some automatically, and a hand-kept
// second list cannot drift away from the grouping it was copied from.
export const SOME_GROUPS = new Set(["waiting", "social"]);

// ── THE ONE EXCEPTION ────────────────────────────────────────────────────────────────────────────────────────
// The weekly recap is in the `shop` group, so Some would switch it off — and that is the wrong call. It is not
// a notification you receive, it is the fallback that only fires when push CANNOT reach you and you have been
// gone six days, at most once a fortnight. Muting it for everybody who picks Some would quietly delete the one
// thing that brings a lapsed member back, in the name of sending them less while they are not here at all.
//
// None still turns it off, because None has to mean none.
const SOME_ALWAYS_ON = new Set(["digest"]);

// The three labels live in notify-prefs-meta.js so the settings SCREEN can read them — this module is
// server-only and a client component importing it pulls the database into the browser bundle. Imported here
// as well as re-exported: `export { X } from` binds nothing locally, and every server-side caller in the game
// imports these two from this file.
export { NOTIFY_MODES, isNotifyMode };

/** Should this (kind, channel) be on under `mode`? The single rule all three of the functions below read. */
const onUnderMode = (kind, mode) => {
    if (mode === "all") return true;
    if (mode === "none") return false;
    return SOME_GROUPS.has(kind.group) || SOME_ALWAYS_ON.has(kind.key);
};

/** The complete explicit map for a mode — every kind, every channel it can arrive on. */
export function prefsForMode(mode) {
    const out = {};
    for (const k of NOTIFY_KINDS) {
        for (const c of k.channels) out[prefKey(c, k.key)] = onUnderMode(k, mode);
    }
    return out;
}

/**
 * Which of the three this member is on — or "custom" when they have picked switches by hand.
 *
 * DERIVED from the switches rather than stored beside them. A `notify_mode` column would be a second copy of
 * a fact the map already holds, and the two would disagree the first time somebody flipped one switch — which
 * is the whole reason the granular list still exists. Read this way, choosing "Some" and then turning one
 * thing back on correctly reads as Custom, because that is what it is.
 */
export function notifyModeOf(prefs = {}) {
    let on = 0;
    let off = 0;
    let notSome = 0;
    for (const k of NOTIFY_KINDS) {
        for (const c of k.channels) {
            const isOn = allowsNotify(prefs, c, k.key);
            if (isOn) on += 1; else off += 1;
            if (isOn !== onUnderMode(k, "some")) notSome += 1;
        }
    }
    if (!off) return "all";
    if (!on) return "none";
    if (!notSome) return "some";
    return "custom";
}

/** Set every switch at once. Goes through setNotifyPrefs so the legacy column sync happens exactly once. */
export async function setNotifyMode(buyerId, mode) {
    if (!isNotifyMode(mode)) return await getNotifyPrefs(buyerId);
    return setNotifyPrefs(buyerId, prefsForMode(mode));
}

const KIND_KEYS = new Set(NOTIFY_KINDS.map((k) => k.key));
export const isNotifyKind = (kind) => KIND_KEYS.has(String(kind || ""));
export const prefKey = (channel, kind) => `${channel}:${kind}`;

// Does this member allow `kind` on `channel`? Defaults to TRUE — for an unknown kind, a missing prefs object,
// or any error. Notifications failing OPEN is the right call: a dropped notification is invisible, while a
// wrongly-sent one is at worst mildly annoying and always has an off switch.
export function allowsNotify(prefs, channel, kind) {
    if (!kind) return true;
    const v = prefs && prefs[prefKey(channel, kind)];
    return v !== false;
}

export async function getNotifyPrefs(buyerId) {
    if (!buyerId) return {};
    const row = await db.queryOne(`SELECT notify_prefs FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const p = row?.notify_prefs;
    return p && typeof p === "object" ? p : {};
}

// Single-member check used by the push senders.
export async function memberAllows(buyerId, channel, kind) {
    if (!buyerId || !kind) return true;
    return allowsNotify(await getNotifyPrefs(buyerId), channel, kind);
}

// Merge a patch of { "push:dm": false, … } into the stored map. Unknown keys are dropped so a crafted request
// can't stuff arbitrary JSON onto the row.
export async function setNotifyPrefs(buyerId, patch) {
    if (!buyerId || !patch || typeof patch !== "object") return await getNotifyPrefs(buyerId);
    const clean = {};
    for (const [k, v] of Object.entries(patch)) {
        const [channel, kind] = String(k).split(":");
        // ── DERIVED FROM THE CATALOG, NOT TYPED OUT ──────────────────────────────────────────────────
        // This read `["push","email"].includes(channel)`, and the catalog has a third channel: `chat`, for
        // the Arbiter's automated milestone posts. So `chat:milestone` was dropped here on every save — the
        // switch rendered, town.js honoured it on read, and the write went in the bin. It has never worked,
        // which makes it exactly the thing the note at the top of this file forbids: a toggle that does
        // nothing. Sunflower Jinxx asked for that switch ("Are we able to turn off the auto messages for the
        // road rungs?") and has been unable to use it since the day it shipped.
        //
        // Deriving the set from NOTIFY_KINDS means a fourth channel can never be half-added again: the
        // per-kind `channels.includes(channel)` check below already does the narrow half of this job.
        if (!VALID_CHANNELS.has(channel) || !isNotifyKind(kind)) continue;
        const def = NOTIFY_KINDS.find((d) => d.key === kind);
        if (!def.channels.includes(channel)) continue;
        clean[prefKey(channel, kind)] = Boolean(v);
    }
    if (!Object.keys(clean).length) return await getNotifyPrefs(buyerId);
    const row = await db
        .queryOne(`UPDATE mkt_buyer SET notify_prefs = COALESCE(notify_prefs,'{}'::jsonb) || $2::jsonb, updated_at = NOW() WHERE id = $1 RETURNING notify_prefs`,
            [buyerId, JSON.stringify(clean)])
        .catch(() => null);
    // Keep the two legacy columns in step so any code still reading them stays correct.
    if ("email:dm" in clean || "email:friend" in clean) {
        const sets = [];
        const params = [buyerId];
        if ("email:dm" in clean) { params.push(clean["email:dm"]); sets.push(`notify_email_dm = $${params.length}`); }
        if ("email:friend" in clean) { params.push(clean["email:friend"]); sets.push(`notify_email_friend = $${params.length}`); }
        await db.query(`UPDATE mkt_buyer SET ${sets.join(", ")} WHERE id = $1`, params).catch(() => {});
    }
    return row?.notify_prefs && typeof row.notify_prefs === "object" ? row.notify_prefs : clean;
}

// The shape the settings UI renders: groups → kinds → the switches that apply to each.
export function notifyPrefCatalog(prefs = {}) {
    return NOTIFY_GROUPS.map((g) => ({
        ...g,
        kinds: NOTIFY_KINDS.filter((k) => k.group === g.key && !k.hideGroup).map((k) => ({
            key: k.key,
            label: k.label,
            desc: k.desc,
            channels: k.channels.map((c) => ({ channel: c, on: allowsNotify(prefs, c, k.key) })),
        })),
    })).filter((g) => g.kinds.length);
}
