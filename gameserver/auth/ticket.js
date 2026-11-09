import { createPublicKey, verify } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────
// TICKET VERIFICATION — THE GAME SERVER'S ENTIRE AUTH SYSTEM
//
// No users, no passwords, no sessions, no database call. One public key and
// a signature check: sub-millisecond, and nothing here can mint an identity
// even if this whole box is taken.
//
// ⚠️ EVERY FIELD IS CHECKED, NOT JUST THE SIGNATURE. A valid signature only
//    says Next.js wrote this at some point. It does not say it was written
//    recently (exp), for this service (aud), or that it has not already been
//    used (jti). Skipping any of the three leaves a captured ticket usable:
//    the signature stays valid forever.
//
// ⚠️ AND THE TICKET ARRIVES AS THE FIRST MESSAGE ON THE SOCKET, NEVER IN THE
//    URL. Query strings land in access logs, proxy logs, and browser
//    history. The server refuses to accept one from anywhere else.
// ─────────────────────────────────────────────────────────────────────────

export const TICKET_AUDIENCE = "gameserver";

// How long a spent jti is remembered. It only has to outlive the ticket's
// own expiry -- after that the exp check refuses it anyway.
const REPLAY_WINDOW_MS = 120_000;

const seen = new Map();   // jti -> expiry ms

function publicKey() {
    const raw = process.env.RT_TICKET_PUBLIC_KEY;
    if (!raw) throw new Error("RT_TICKET_PUBLIC_KEY is not set");
    const pem = raw.includes("BEGIN") ? raw : Buffer.from(raw, "base64").toString("utf8");
    return createPublicKey(pem);
}

let cachedKey = null;
const key = () => (cachedKey ||= publicKey());

function sweep(now) {
    if (seen.size < 512) return;
    for (const [jti, until] of seen) if (until < now) seen.delete(jti);
}

/**
 * @returns {{ok: true, claims: object} | {ok: false, reason: string}}
 *
 * Every failure returns the same SHAPE and the reason is for our logs, not
 * for the client: telling a caller which check failed tells an attacker
 * which part of their forgery to work on next.
 */
export function verifyTicket(ticket, { now = Date.now() } = {}) {
    if (typeof ticket !== "string" || ticket.length > 4096) return { ok: false, reason: "malformed" };
    const dot = ticket.indexOf(".");
    if (dot <= 0 || ticket.indexOf(".", dot + 1) !== -1) return { ok: false, reason: "malformed" };

    const body = ticket.slice(0, dot);
    const sig = ticket.slice(dot + 1);

    let valid = false;
    try {
        valid = verify(null, Buffer.from(body), key(), Buffer.from(sig, "base64url"));
    } catch {
        return { ok: false, reason: "malformed" };
    }
    if (!valid) return { ok: false, reason: "bad_signature" };

    let claims;
    try {
        claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
        return { ok: false, reason: "malformed" };
    }

    if (claims.aud !== TICKET_AUDIENCE) return { ok: false, reason: "wrong_audience" };
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) return { ok: false, reason: "expired" };
    // A ticket from the future is a clock problem or a forgery; either way it
    // is not usable. One minute of slack for honest drift.
    if (typeof claims.iat !== "number" || claims.iat * 1000 > now + 60_000) return { ok: false, reason: "not_yet" };
    if (!claims.sub || !claims.jti) return { ok: false, reason: "malformed" };

    sweep(now);
    if (seen.has(claims.jti)) return { ok: false, reason: "replayed" };
    seen.set(claims.jti, now + REPLAY_WINDOW_MS);

    return { ok: true, claims };
}

/**
 * ⚠️ ORIGIN IS CHECKED ON THE UPGRADE, SEPARATELY FROM THE TICKET. A browser
 *    will happily open a WebSocket to another origin and attach nothing to
 *    stop it -- there is no same-origin policy on sockets and no preflight.
 *    Without this, any page on the internet could open a socket, and
 *    although it could not forge a ticket, it could burn a real one that a
 *    logged-in visitor's own browser fetched.
 */
export function originAllowed(origin, allowList) {
    if (!allowList.length) return true;          // unset = open, for local work
    if (!origin) return false;
    return allowList.includes(origin);
}

export function parseOrigins(raw) {
    return String(raw || "").split(",").map((s) => s.trim()).filter(Boolean);
}
