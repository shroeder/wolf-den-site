import "server-only";

import { db } from "@/lib/db.js";
import { townFromDepth, TOWNS } from "@/lib/marketplace/towns.js";

// ── READING THE GATE ─────────────────────────────────────────────────────────────────────────────────────────
// The pure rules live in towns.js; this is the one place that fetches what they need. Two columns off two
// rows, in ONE round trip — the gate must never become a reason the menu got slower, and CLAUDE.md is explicit
// that round trips ARE the bill.
//
// ⚠️ A LEFT JOIN, NOT TWO READS. A member who has never opened the Grove has no mkt_grove_player row at all,
// and an inner join would return nothing — which, read carelessly, looks exactly like "account is exempt" and
// would silently unlock the entire game for every new player. The join is LEFT and the default is depth 1.

/**
 * @returns {{gatedAt: Date|null, unlockedN: number, town: number, exempt: boolean}}
 */
// ⚠️ THIS SURVIVED THE UNLOCK LADDER BECAUSE IT IS NOT ONLY A GATE. It also answers how deep a
// member is in the Grove (unlockedN), which the hunts route and the town street both still read.
// `exempt` is now true for everybody, always, and `locked` is always empty — kept so the shapes
// the menu and the street already destructure do not have to change in the same commit.
export async function gateStateFor(buyerId) {
    if (!buyerId) return { gatedAt: null, unlockedN: 1, town: 1, exempt: true };
    const row = await db.queryOne(
        `SELECT b.gated_at, COALESCE(g.unlocked_n, 1) AS unlocked_n
           FROM mkt_buyer b
           LEFT JOIN mkt_grove_player g ON g.buyer_id = b.id
          WHERE b.id = $1`,
        [buyerId],
    ).catch(() => null);
    const gatedAt = row?.gated_at || null;
    const unlockedN = Number(row?.unlocked_n) || 1;
    return { gatedAt, unlockedN, town: townFromDepth(unlockedN), exempt: !gatedAt };
}

/**
 * The menu's view: what is shut, and which town opens each one.
 *
 * Returns an empty object for every account that predates gating, which is most of them — so the menu for an
 * existing member is byte-identical to what it renders today.
 */
export async function gateForMenu(buyerId) {
    const st = await gateStateFor(buyerId);
    return {
        town: st.town,
        exempt: st.exempt,
        locked: {},
        towns: TOWNS.map((t) => ({ n: t.n, id: t.id, name: t.name, biome: t.biome, opens: t.opens, blurb: t.blurb })),
    };
}

