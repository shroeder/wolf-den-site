import "server-only";

import { db } from "@/lib/db";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { syncEarnedBadges, grantEventBadge } from "@/lib/marketplace/badges.js";
import { sendWebPush } from "@/lib/push/web-push.js";

// ── SHARING A CREATION ───────────────────────────────────────────────────────────────────────────────────────
// A creation can be passed on exactly ONCE, and the copy can never be passed on again — so a piece reaches at
// most one other farm. Two ways in, one destination:
//
//   GIFT     the owner picks someone and offers it; the recipient accepts.
//   REQUEST  someone spots it on a farm they're visiting and asks; the OWNER accepts.
//
// The one-share guarantee lives entirely in a guarded UPDATE (… WHERE shared_at IS NULL). Everything else —
// pending-row uniqueness, "do you already have one" — is a nicety to keep the UI honest; that single statement is
// what makes a race impossible. Mirrors pet gifting deliberately, so the rules feel familiar.

const nameOf = (r) => r?.display_name || r?.alias || "A member";
const decoIdFor = (creationId) => `custom:${Number(creationId)}`;

// A creation with everything needed to decide whether it can still be shared.
async function loadCreation(creationId) {
    return db.queryOne(
        `SELECT c.id, c.buyer_id, c.name, c.chosen_url, c.status, c.shared_at, c.copy_of,
                COALESCE(NULLIF(b.display_name,''), b.alias) AS owner_name, b.alias AS owner_alias
           FROM mkt_custom_deco c LEFT JOIN mkt_buyer b ON b.id = c.buyer_id
          WHERE c.id = $1`,
        [Number(creationId)]
    ).catch(() => null);
}

// Why a creation can't be passed on right now (or null if it can). Shared by both entry points so the gift and
// ask paths can never disagree about the rules.
function shareBlocker(creation) {
    if (!creation) return "not_found";
    if (creation.status !== "final") return "not_finished";
    if (creation.copy_of) return "is_a_copy";      // copies are the end of the line
    if (creation.shared_at) return "already_shared";
    return null;
}

const alreadyHasCopy = async (buyerId, creationId) => Boolean(
    await db.queryOne(
        `SELECT 1 FROM mkt_custom_deco WHERE buyer_id = $1 AND copy_of = $2 AND status = 'final'`,
        [buyerId, Number(creationId)]
    ).catch(() => null)
);

// ── THE MINT ─────────────────────────────────────────────────────────────────────────────────────────────────
// Burn the creation's single share and hand the recipient their own copy: a fresh mkt_custom_deco row (so it
// shows on their farm exactly like one they made), its own sprite row under a new custom:<id>, and ownership.
async function mintCopy(share, creation) {
    // THE guard. Whoever lands this first is the only share that will ever happen for this creation.
    const burned = await db.queryOne(
        `UPDATE mkt_custom_deco SET shared_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND shared_at IS NULL AND copy_of IS NULL AND status = 'final' RETURNING id`,
        [Number(creation.id)]
    ).catch(() => null);
    if (!burned) return { ok: false, error: "already_shared" };

    const copy = await db.queryOne(
        `INSERT INTO mkt_custom_deco (buyer_id, name, prompt, status, chosen_url, copy_of, shared_at)
         SELECT $1, name, prompt, 'final', chosen_url, id, NOW() FROM mkt_custom_deco WHERE id = $2
         RETURNING id, name, chosen_url`,
        [share.to_buyer_id, Number(creation.id)]
    ).catch(() => null);
    // shared_at is pre-set on the copy as a belt-and-braces second line of defence: copy_of already blocks
    // sharing, and this makes a copy unshareable even if that check were ever missed.
    if (!copy) {
        // Roll the burn back so a failed mint doesn't silently consume the owner's one share.
        await db.query(`UPDATE mkt_custom_deco SET shared_at = NULL WHERE id = $1`, [Number(creation.id)]).catch(() => {});
        return { ok: false, error: "mint_failed" };
    }

    const newDecoId = decoIdFor(copy.id);
    await db.query(
        `INSERT INTO mkt_deco_sprite (deco_id, url, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (deco_id) DO UPDATE SET url = EXCLUDED.url, updated_at = NOW()`,
        [newDecoId, copy.chosen_url]
    ).catch(() => {});
    await db.query(
        `INSERT INTO mkt_deco_owned (buyer_id, deco_id, qty) VALUES ($1, $2, 1) ON CONFLICT (buyer_id, deco_id) DO NOTHING`,
        [share.to_buyer_id, newDecoId]
    ).catch(() => {});

    await db.query(
        `UPDATE mkt_creation_share SET status = 'accepted', resolved_at = NOW(), copy_id = $2 WHERE id = $1`,
        [share.id, copy.id]
    ).catch(() => {});
    // The share is spent, so every other outstanding offer/ask for this piece is now impossible — close them out
    // rather than leaving people waiting on something that can never happen.
    await db.query(
        `UPDATE mkt_creation_share SET status = 'declined', resolved_at = NOW()
          WHERE creation_id = $1 AND status = 'pending' AND id <> $2`,
        [Number(creation.id), share.id]
    ).catch(() => {});

    await trackActivity(share.from_buyer_id, "creation_shared", { creationId: Number(creation.id), to: share.to_buyer_id, kind: share.kind }).catch(() => {});
    await trackActivity(share.to_buyer_id, "creation_received", { creationId: Number(creation.id), copyId: copy.id }).catch(() => {});
    await syncEarnedBadges(share.from_buyer_id).catch(() => {});
    await syncEarnedBadges(share.to_buyer_id).catch(() => {});
    await checkShareBadges(share.from_buyer_id, share.to_buyer_id).catch(() => {});

    return { ok: true, copyId: copy.id, decoId: newDecoId, name: copy.name };
}

// ── SHARING BADGES ───────────────────────────────────────────────────────────────────────────────────────────
// Both sides of a share get recognised, and the pair who traded art in BOTH directions get something neither
// could earn alone. Counted off accepted shares rather than a counter column, so the numbers can't drift.
// grantEventBadge is idempotent, so calling this on every mint is safe.
async function checkShareBadges(giverId, receiverId) {
    const count = async (sql, params) => Number((await db.queryOne(sql, params).catch(() => null))?.n) || 0;

    const given = await count(
        `SELECT COUNT(*)::int AS n FROM mkt_creation_share WHERE from_buyer_id = $1 AND status = 'accepted'`, [giverId]);
    if (given >= 1) await grantEventBadge(giverId, "share_generous").catch(() => {});
    if (given >= 3) await grantEventBadge(giverId, "share_patron").catch(() => {});
    if (given >= 10) await grantEventBadge(giverId, "share_legacy").catch(() => {});

    // Received = copies on their farm whose original belongs to somebody else (a copy always has copy_of set).
    const received = await count(
        `SELECT COUNT(*)::int AS n FROM mkt_custom_deco c
           JOIN mkt_custom_deco o ON o.id = c.copy_of
          WHERE c.buyer_id = $1 AND c.status = 'final' AND o.buyer_id <> $1`, [receiverId]);
    if (received >= 1) await grantEventBadge(receiverId, "share_collector").catch(() => {});
    if (received >= 5) await grantEventBadge(receiverId, "share_gallery").catch(() => {});

    // Kindred Spirits — art has flowed BOTH ways between these two. Awarded to both of them at the moment the
    // return share lands, which is the only point either one has actually completed the exchange.
    const mutual = await count(
        `SELECT COUNT(*)::int AS n FROM mkt_creation_share
          WHERE status = 'accepted' AND from_buyer_id = $2 AND to_buyer_id = $1`, [giverId, receiverId]);
    if (mutual >= 1) {
        await grantEventBadge(giverId, "share_mutual").catch(() => {});
        await grantEventBadge(receiverId, "share_mutual").catch(() => {});
    }
}

// ── OWNER OFFERS IT ──────────────────────────────────────────────────────────────────────────────────────────
export async function offerCreation(fromId, creationId, toAlias) {
    if (!fromId) return { ok: false, error: "not_signed_in" };
    const creation = await loadCreation(creationId);
    if (!creation || String(creation.buyer_id) !== String(fromId)) return { ok: false, error: "not_found" };
    const blocked = shareBlocker(creation);
    if (blocked) return { ok: false, error: blocked };

    const to = await db.queryOne(
        `SELECT id, display_name, alias FROM mkt_buyer WHERE LOWER(alias) = LOWER($1) OR LOWER(alias) = LOWER(REPLACE($1,'@',''))`,
        [String(toAlias || "").trim()]
    ).catch(() => null);
    if (!to) return { ok: false, error: "recipient_not_found" };
    if (String(to.id) === String(fromId)) return { ok: false, error: "cannot_share_self" };
    if (await alreadyHasCopy(to.id, creation.id)) return { ok: false, error: "recipient_has_copy" };

    const row = await db.queryOne(
        `INSERT INTO mkt_creation_share (creation_id, from_buyer_id, to_buyer_id, kind) VALUES ($1, $2, $3, 'gift')
         RETURNING id`,
        [Number(creation.id), fromId, to.id]
    ).catch(() => null);
    if (!row) return { ok: false, error: "already_pending" }; // the partial unique index caught a second offer

    const from = await db.queryOne(`SELECT display_name, alias FROM mkt_buyer WHERE id = $1`, [fromId]).catch(() => null);
    await sendWebPush(to.id, {
        kind: "creation",
        title: "🎨 Someone's sharing their art with you!",
        body: `${nameOf(from)} wants to give you a copy of "${creation.name}" for your farm.`,
        url: "/marketplace/farm",
        tag: "creation-share",
        data: { type: "creation_gift", creationId: Number(creation.id) },
    }).catch(() => {});

    return { ok: true, to: nameOf(to), shareId: Number(row.id) };
}

// ── VISITOR ASKS FOR ONE ─────────────────────────────────────────────────────────────────────────────────────
// Called when someone taps a creation on a farm they're visiting. decoId arrives as "custom:<id>".
export async function requestCreation(viewerId, decoId) {
    if (!viewerId) return { ok: false, error: "not_signed_in" };
    const creationId = Number(String(decoId || "").replace(/^custom:/, ""));
    if (!creationId) return { ok: false, error: "not_a_creation" };
    const creation = await loadCreation(creationId);
    if (!creation) return { ok: false, error: "not_found" };
    if (String(creation.buyer_id) === String(viewerId)) return { ok: false, error: "already_yours" };
    const blocked = shareBlocker(creation);
    if (blocked) return { ok: false, error: blocked };
    if (await alreadyHasCopy(viewerId, creation.id)) return { ok: false, error: "you_have_copy" };

    const row = await db.queryOne(
        `INSERT INTO mkt_creation_share (creation_id, from_buyer_id, to_buyer_id, kind) VALUES ($1, $2, $3, 'request')
         RETURNING id`,
        [Number(creation.id), creation.buyer_id, viewerId]
    ).catch(() => null);
    if (!row) return { ok: false, error: "already_asked" };

    const asker = await db.queryOne(`SELECT display_name, alias FROM mkt_buyer WHERE id = $1`, [viewerId]).catch(() => null);
    await sendWebPush(creation.buyer_id, {
        kind: "creation",
        title: "🎨 Someone loves your art",
        body: `${nameOf(asker)} is asking for a copy of "${creation.name}". You can share it once.`,
        url: "/marketplace/farm",
        tag: "creation-share",
        data: { type: "creation_request", creationId: Number(creation.id) },
    }).catch(() => {});

    return { ok: true, owner: creation.owner_name || "the artist", shareId: Number(row.id) };
}

// ── ACCEPT / DECLINE / CANCEL ────────────────────────────────────────────────────────────────────────────────
// Whoever is being ASKED gets to decide: the recipient for a gift, the owner for a request.
export async function respondCreationShare(userId, shareId, action) {
    if (!userId) return { ok: false, error: "not_signed_in" };
    const share = await db.queryOne(
        `SELECT id, creation_id, from_buyer_id, to_buyer_id, kind, status FROM mkt_creation_share WHERE id = $1`,
        [Number(shareId)]
    ).catch(() => null);
    if (!share || share.status !== "pending") return { ok: false, error: "not_pending" };

    const decider = share.kind === "gift" ? share.to_buyer_id : share.from_buyer_id;
    if (String(decider) !== String(userId)) return { ok: false, error: "not_yours" };

    if (action !== "accept") {
        const closed = action === "cancel" ? "cancelled" : "declined";
        await db.query(`UPDATE mkt_creation_share SET status = $2, resolved_at = NOW() WHERE id = $1 AND status = 'pending'`, [share.id, closed]).catch(() => {});
        return { ok: true, status: closed };
    }

    const creation = await loadCreation(share.creation_id);
    const blocked = shareBlocker(creation);
    if (blocked) {
        await db.query(`UPDATE mkt_creation_share SET status = 'declined', resolved_at = NOW() WHERE id = $1`, [share.id]).catch(() => {});
        return { ok: false, error: blocked };
    }

    const minted = await mintCopy(share, creation);
    if (!minted.ok) return minted;

    // Tell the other side it landed — whichever of them wasn't the one clicking.
    const otherId = String(decider) === String(share.to_buyer_id) ? share.from_buyer_id : share.to_buyer_id;
    const me = await db.queryOne(`SELECT display_name, alias FROM mkt_buyer WHERE id = $1`, [userId]).catch(() => null);
    await sendWebPush(otherId, {
        kind: "creation",
        title: "🎨 Creation shared!",
        body: String(decider) === String(share.to_buyer_id)
            ? `${nameOf(me)} accepted your "${minted.name}". It's on their farm now.`
            : `${nameOf(me)} shared "${minted.name}" with you — it's in your decorations.`,
        url: "/marketplace/farm",
        tag: "creation-share",
        data: { type: "creation_accepted", copyId: minted.copyId },
    }).catch(() => {});

    return { ok: true, status: "accepted", ...minted };
}

// ── STATE FOR THE UI ─────────────────────────────────────────────────────────────────────────────────────────
// Everything the farm needs: which of my creations can still be shared, offers waiting on me, people asking for
// mine, and what I've got outstanding.
export async function creationShareState(buyerId) {
    if (!buyerId) return { mine: [], incomingGifts: [], incomingRequests: [], outgoing: [] };
    const [mine, incomingGifts, incomingRequests, outgoing] = await Promise.all([
        db.query(
            `SELECT id, name, chosen_url, shared_at IS NOT NULL AS shared, copy_of IS NOT NULL AS is_copy
               FROM mkt_custom_deco WHERE buyer_id = $1 AND status = 'final' ORDER BY id DESC`,
            [buyerId]
        ).catch(() => []),
        db.query(
            `SELECT s.id, s.creation_id, c.name, c.chosen_url,
                    COALESCE(NULLIF(b.display_name,''), b.alias) AS from_name
               FROM mkt_creation_share s
               JOIN mkt_custom_deco c ON c.id = s.creation_id
               LEFT JOIN mkt_buyer b ON b.id = s.from_buyer_id
              WHERE s.to_buyer_id = $1 AND s.kind = 'gift' AND s.status = 'pending' ORDER BY s.created_at DESC`,
            [buyerId]
        ).catch(() => []),
        db.query(
            `SELECT s.id, s.creation_id, c.name, c.chosen_url,
                    COALESCE(NULLIF(b.display_name,''), b.alias) AS asker_name, b.alias AS asker_alias
               FROM mkt_creation_share s
               JOIN mkt_custom_deco c ON c.id = s.creation_id
               LEFT JOIN mkt_buyer b ON b.id = s.to_buyer_id
              WHERE s.from_buyer_id = $1 AND s.kind = 'request' AND s.status = 'pending' ORDER BY s.created_at DESC`,
            [buyerId]
        ).catch(() => []),
        db.query(
            `SELECT s.id, s.creation_id, s.kind, c.name,
                    COALESCE(NULLIF(bt.display_name,''), bt.alias) AS to_name,
                    COALESCE(NULLIF(bf.display_name,''), bf.alias) AS from_name
               FROM mkt_creation_share s
               JOIN mkt_custom_deco c ON c.id = s.creation_id
               LEFT JOIN mkt_buyer bt ON bt.id = s.to_buyer_id
               LEFT JOIN mkt_buyer bf ON bf.id = s.from_buyer_id
              WHERE s.status = 'pending'
                AND ((s.kind = 'gift' AND s.from_buyer_id = $1) OR (s.kind = 'request' AND s.to_buyer_id = $1))
              ORDER BY s.created_at DESC`,
            [buyerId]
        ).catch(() => []),
    ]);
    return {
        mine: (mine || []).map((r) => ({
            id: Number(r.id), decoId: decoIdFor(r.id), name: r.name, url: r.chosen_url,
            isCopy: Boolean(r.is_copy),
            // Only an original that hasn't been passed on can still be shared.
            canShare: !r.is_copy && !r.shared,
            shared: Boolean(r.shared),
        })),
        incomingGifts: (incomingGifts || []).map((r) => ({ id: Number(r.id), creationId: Number(r.creation_id), name: r.name, url: r.chosen_url, from: r.from_name || "A member" })),
        incomingRequests: (incomingRequests || []).map((r) => ({ id: Number(r.id), creationId: Number(r.creation_id), name: r.name, url: r.chosen_url, asker: r.asker_name || "A member", askerAlias: r.asker_alias || null })),
        outgoing: (outgoing || []).map((r) => ({ id: Number(r.id), creationId: Number(r.creation_id), kind: r.kind, name: r.name, who: r.kind === "gift" ? (r.to_name || "a member") : (r.from_name || "the artist") })),
    };
}

// Can THIS viewer ask for a copy of this placed decoration? Drives the button on a farm you're visiting, so the
// UI never offers an ask that the server would only refuse.
export async function creationAskability(viewerId, decoId) {
    const creationId = Number(String(decoId || "").replace(/^custom:/, ""));
    if (!viewerId || !creationId) return { canAsk: false, reason: "not_a_creation" };
    const creation = await loadCreation(creationId);
    if (!creation) return { canAsk: false, reason: "not_found" };
    if (String(creation.buyer_id) === String(viewerId)) return { canAsk: false, reason: "already_yours" };
    const blocked = shareBlocker(creation);
    if (blocked) return { canAsk: false, reason: blocked, artist: creation.owner_name || null };
    if (await alreadyHasCopy(viewerId, creationId)) return { canAsk: false, reason: "you_have_copy" };
    const pending = await db.queryOne(
        `SELECT 1 FROM mkt_creation_share WHERE creation_id = $1 AND to_buyer_id = $2 AND status = 'pending'`,
        [creationId, viewerId]
    ).catch(() => null);
    if (pending) return { canAsk: false, reason: "already_asked", artist: creation.owner_name || null };
    return { canAsk: true, artist: creation.owner_name || null, name: creation.name };
}
