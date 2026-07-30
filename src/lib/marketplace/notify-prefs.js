import "server-only";

import { db } from "@/lib/db";

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

    // Push only: the Looking-For *email* goes to standalone card-alert subscribers (their own confirmed list
    // with its own unsubscribe link), not to member records, so a member-level email switch wouldn't bite.
    { key: "stock", group: "shop", label: "Back in stock", desc: "Something on your Looking-For list arrives", channels: ["push"] },
    { key: "order", group: "shop", label: "Order updates", desc: "Your online order is confirmed or changes", channels: ["push"] },

    // The win-back recap. Email only by definition — it exists to reach people push cannot.
    { key: "digest", group: "shop", label: "Weekly recap email", desc: "An occasional summary of what you missed while you were away", channels: ["email"], hideGroup: true },
];

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
        if (!["push", "email"].includes(channel) || !isNotifyKind(kind)) continue;
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
