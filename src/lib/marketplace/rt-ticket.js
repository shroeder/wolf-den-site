import "server-only";

import { createPrivateKey, randomUUID, sign } from "node:crypto";

import { db } from "@/lib/db.js";

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE REALTIME TICKET — A SIGNED DATABASE READ
//
// The game server has no users, no passwords and no sessions. Next.js authenticates the member it already
// knows, reads their character, and signs the answer. The game server verifies with a public key: pure local
// crypto, no network call, sub-millisecond, and it holds nothing that could be stolen to mint an identity.
//
// ⚠️ Ed25519, AND THE ASYMMETRY IS THE WHOLE POINT. A shared HMAC secret would mean the game server could mint
//    any ticket it liked -- so compromising a box whose entire job is to run untrusted players' input would
//    hand an attacker every account on the site. Next.js holds the private key; the game server holds only the
//    public half, and the worst it can do with that is read.
//
// ⚠️ NO COMBAT STATS IN HERE YET, DELIBERATELY. Combat reads four separate stat sources -- equipment, badges,
//    pets, grove charms -- and the decision record's answer to keeping them fresh is a `combat_epoch` column
//    bumped by database triggers, feeding ONE shared derivation function. Putting a hand-rolled stat block in
//    this file would create a second derivation that silently disagrees with the first, which is the exact
//    failure the epoch design exists to prevent. The ticket carries WHO and WHAT THEY MAY ENTER; stats arrive
//    with the epoch work, from the one function that already owns them.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const TICKET_AUDIENCE = "gameserver";
// ⚠️ SIXTY SECONDS. Long enough to survive a slow page load and a clock a little out of true, short enough
// that a ticket captured out of a log is useless by the time anyone reads it. It is spent on connect, not
// held: the socket is bound to the buyer for its lifetime and the client can never assert identity again.
export const TICKET_TTL_SECONDS = 60;

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function privateKey() {
    const raw = process.env.RT_TICKET_PRIVATE_KEY;
    if (!raw) throw new Error("RT_TICKET_PRIVATE_KEY is not set");
    // Stored base64-of-PEM so the key survives env plumbing that mangles newlines.
    const pem = raw.includes("BEGIN") ? raw : Buffer.from(raw, "base64").toString("utf8");
    return createPrivateKey(pem);
}

/** The character the game server needs, read once, at the moment of signing. */
async function readCharacter(buyerId) {
    const row = await db.queryOne(
        `SELECT id, alias, display_name, avatar_sprite_url, COALESCE(xp, 0) AS xp
           FROM mkt_buyer WHERE id = $1`,
        [buyerId]
    );
    if (!row) throw new Error("no such buyer");
    return {
        sub: String(row.id),
        name: row.alias || row.display_name || "Adventurer",
        sprite: row.avatar_sprite_url || null,
        xp: Number(row.xp) || 0,
    };
}

/**
 * Sign a ticket for one buyer and one zone.
 *
 * The compact form is `<base64url payload>.<base64url signature>` -- not a JWT, because a JWT's header
 * carries the algorithm and an attacker who can choose the algorithm can choose "none". There is exactly one
 * algorithm here and it is not negotiable, so there is nothing to put in a header.
 */
export async function mintTicket(buyerId, { zone = "ashfall-1" } = {}) {
    const character = await readCharacter(buyerId);
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        ...character,
        zone,
        aud: TICKET_AUDIENCE,
        iat: now,
        exp: now + TICKET_TTL_SECONDS,
        // One-time. The game server keeps seen ids in memory until they expire, so a replayed ticket is
        // refused even inside its own window.
        jti: randomUUID(),
    };
    const body = b64url(JSON.stringify(payload));
    const signature = b64url(sign(null, Buffer.from(body), privateKey()));
    return { ticket: `${body}.${signature}`, expiresAt: payload.exp * 1000, zone };
}
