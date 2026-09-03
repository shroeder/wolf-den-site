import "server-only";

import { db } from "@/lib/db";
import { previewPurchaseXp, SPEND_XP_PER_DOLLAR } from "@/lib/marketplace/xp.js";

// ── THE SCREEN FACING THE CUSTOMER AT THE TILL ───────────────────────────────────────────────────────────────
// Luke: "we have a pc screen at the point of sale facing the customer."
//
// That is the answer to "there is no hook early enough". 600 of 687 receipt QRs were never scanned by anybody
// — the code was on a piece of paper going into a pocket. A screen at eye level, being looked at during the
// one minute a customer has nothing else to do, is a different proposition entirely: the pitch lands BEFORE
// the sale finishes, and then the same screen shows the QR for the sale that just happened, so the receipt is
// out of the loop altogether.
//
// ── WHY THIS NEEDS A KEY ─────────────────────────────────────────────────────────────────────────────────────
// The display has to be handed a LIVE, UNREDEEMED claim token — that is the entire trick. A token is a bearer
// credential: whoever holds it can bank somebody else's points. So an open endpoint that returns "the newest
// claim" would be a public feed of other people's rewards, refreshing every few seconds.
//
// POS_DISPLAY_KEY is a shared secret set once on the machine that runs the screen (it lives in the URL the
// browser is parked on). No key, no claim — and with no key set at all the endpoint is closed rather than
// open, so a missing env var fails safe.
const KEY_ENV = "POS_DISPLAY_KEY";

/** Is this request allowed to see live claim tokens? Closed when no key is configured. */
export function posDisplayKeyOk(key) {
    const want = String(process.env[KEY_ENV] || "").trim();
    if (!want) return false;
    const got = String(key || "").trim();
    // Length-independent compare is overkill for a kiosk key on a LAN, but the cost is one line.
    if (got.length !== want.length) return false;
    let diff = 0;
    for (let i = 0; i < want.length; i += 1) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
    return diff === 0;
}

export const posDisplayConfigured = () => Boolean(String(process.env[KEY_ENV] || "").trim());

// How recently a sale must have happened for the screen to still be showing its QR. Long enough to cover
// bagging up and a card terminal, short enough that the NEXT customer in the queue is never looking at the
// last one's points — which would be both a privacy leak and a way to steal them.
export const CLAIM_WINDOW_SECONDS = 150;

/**
 * The sale that just happened, if there is one.
 *
 * Deliberately only ever ONE row, only ever the newest, and only ever inside the window — the screen has no
 * business holding a list of unredeemed claims. Returns null the rest of the time, which is the idle state.
 */
export async function latestCounterClaim() {
    const row = await db.queryOne(
        `SELECT token, amount_cents, created_at,
                EXTRACT(EPOCH FROM (NOW() - created_at))::int AS age_seconds
           FROM mkt_loyalty_claim
          WHERE redeemed_at IS NULL
            AND expires_at > NOW()
            AND created_at > NOW() - ($1 || ' seconds')::interval
          ORDER BY created_at DESC
          LIMIT 1`,
        [String(CLAIM_WINDOW_SECONDS)],
    ).catch(() => null);
    if (!row) return null;

    // firstEver: true — the screen is pitching at somebody who is not a member yet, so it quotes what a new
    // member would get. A member who is already signed in scans and gets their own (larger, multiplied)
    // number on the claim page itself. See previewPurchaseXp: this is always the floor.
    const xp = previewPurchaseXp({ amountCents: row.amount_cents, firstEver: true });
    return {
        token: row.token,
        amountCents: Number(row.amount_cents) || 0,
        ageSeconds: Number(row.age_seconds) || 0,
        secondsLeft: Math.max(0, CLAIM_WINDOW_SECONDS - (Number(row.age_seconds) || 0)),
        points: xp.total,
        lines: [
            { label: `$${((Number(row.amount_cents) || 0) / 100).toFixed(2)} spent`, points: xp.spend },
            ...(xp.flat ? [{ label: "Purchase bonus", points: xp.flat }] : []),
            ...(xp.first ? [{ label: "First visit bonus", points: xp.first }] : []),
        ],
    };
}

// What the idle screen says. Kept here rather than in the component because the RATE is a fact about the
// game — if SPEND_XP_PER_DOLLAR moves, the line under the QR on the shop floor should move with it.
//
// The headline and the two supporting lines that used to live here went with the slideshow: the wheel makes
// the argument now, and prose the customer has to read was the thing that did not work.
export const POS_PITCH = {
    rate: SPEND_XP_PER_DOLLAR,
};
