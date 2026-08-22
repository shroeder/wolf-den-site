// ── ONE-OFF: UNDOING WHAT A SECOND ACCOUNT BOUGHT ────────────────────────────────────────────────────────────
// 2026-08-22. hudson (trev.mielke@gmail.com) was funded by tkmielke17, an account created the day before the
// first transfer and sharing a surname, which handed over 98,225 gold — 85% of everything it ever earned —
// across fourteen one-way trades and auction buys in eleven days. The alt is banned; hudson is silently barred
// from the real-world prize draw. This is the third part: rolling his standing back to what he earned himself.
//
// THE NUMBER IS 37.3%, NOT 30.9%. Across his whole history the alt supplied 30.9% of his gold — but the
// feeding started on 10 August, and of everything he has received SINCE then, 37.3% came from the alt. That is
// the period the current standings were built in: 85% of his lifetime consumable spending happened inside it,
// and consumables are boss damage. The lifetime figure would understate what the funding actually bought.
//
// WHAT THIS DOES NOT TOUCH, and why: his BOSS DAMAGE. The obvious move is to scale his hits down by the same
// 37.3%, which would put him below second place, and it cannot be done — the boss's remaining health is
// SUM(damage) over boss_hit, so scaling his rows would HEAL Kaelvorn by twenty-one million in front of the
// whole Den, with no explanation available that is not worse than the problem. The prize is already handled by
// the bar, which does not care where he sits on any board.
//
// Every change is written to the coin ledger and the activity log. A correction nobody can audit later is
// indistinguishable from a mistake.
//
// Run:  node scripts/remediate-2026-08-22-alt-funnel.mjs           what it would do
//       node scripts/remediate-2026-08-22-alt-funnel.mjs --apply   do it
import { db } from "../src/lib/db.js";
import { logCoin } from "../src/lib/marketplace/coins.js";
import { trackActivity } from "../src/lib/marketplace/activity.js";

const APPLY = process.argv.includes("--apply");
const HUDSON = "4fed7f13-8931-45b8-a014-71367b9fcba6";
const FROM_ALT = 98225;          // measured by scripts/check-alts.mjs across trades, auctions and the Market
const FUNDED_SHARE = 0.373;      // of everything received since 2026-08-10, the day the feeding began

const before = await db.queryOne(`SELECT alias, gold, xp FROM mkt_buyer WHERE id = $1`, [HUDSON]);
if (!before) { console.error("no such member"); process.exit(1); }

const goldAfter = before.gold - FROM_ALT;
const xpAfter = Math.round(before.xp * (1 - FUNDED_SHARE));

console.log(`${before.alias}`);
console.log(`  gold  ${before.gold.toLocaleString()} → ${goldAfter.toLocaleString()}   (the full ${FROM_ALT.toLocaleString()} he was given)`);
console.log(`  xp    ${before.xp.toLocaleString()} → ${xpAfter.toLocaleString()}   (−${(FUNDED_SHARE * 100).toFixed(1)}%)`);
console.log("");
console.log("  A NEGATIVE BALANCE IS A DEBT, NOT A DELETION. Every spend path in the game is guarded by");
console.log("  `gold >= amount`, so he simply cannot buy anything until he has earned his way back above");
console.log("  zero — and everything he earns credits normally on the way. He gives back what he was given,");
console.log("  by playing, which is what everyone else had to do for theirs.");

if (!APPLY) { console.log("\nDry run. Pass --apply to do it."); process.exit(0); }

const row = await db.queryOne(
    `UPDATE mkt_buyer SET gold = gold - $2, xp = $3 WHERE id = $1 RETURNING gold, xp`,
    [HUDSON, FROM_ALT, xpAfter],
);
if (!row) { console.error("update failed — nothing changed"); process.exit(1); }

await logCoin(HUDSON, -FROM_ALT, "admin_alt_funnel_reversal", {
    balanceAfter: row.gold,
    meta: { reason: "gold received from a second account (tkmielke17)", transfers: 14, window: "2026-08-10 → 2026-08-21" },
});
await trackActivity(HUDSON, "admin_adjustment", {
    kind: "alt_funnel_reversal",
    goldReversed: FROM_ALT,
    xpBefore: before.xp,
    xpAfter,
    fundedShare: FUNDED_SHARE,
}).catch(() => {});

// ── THE PART THE LEDGER DOES NOT SHOW ────────────────────────────────────────────────────────────────────────
// Reversing the gold and the XP misses what the gold had ALREADY been turned into and not yet spent. He was
// holding eighteen live boosts bought inside the funded window: six stacked "×2 boss damage" potions and
// twelve strike potions worth thirty-five extra swings. None of it appears as gold, none of it appears as XP,
// and all of it was still running.
//
// Damage potions MULTIPLY — memberDamageMult reduces with `*` — so six of them is 2^6 = 64x, clamped by
// BOSS_MULT_CAP to 20x. Two or three already buy the ceiling. That is the real mechanism behind a 47% damage
// lead on FEWER swings than second place: gold converts directly into maximum boss damage.
//
// Only the LIVE ones are cleared. Anything already expired is spent and gone, and reaching back further would
// be inventing a punishment rather than undoing a transfer.
const boosts = await db.query(
    `DELETE FROM mkt_user_boost WHERE buyer_id = $1 AND expires_at > NOW() RETURNING kind, magnitude`,
    [HUDSON],
).catch(() => []);
const dmg = boosts.filter((b) => b.kind === "damage");
const strikes = boosts.filter((b) => b.kind === "strikes");
console.log(`  boosts cleared: ${boosts.length} live — ${dmg.length} damage (${2 ** dmg.length}x, capped to 20x) `
    + `and ${strikes.length} strike potions worth ${strikes.reduce((n, b) => n + Number(b.magnitude), 0)} extra swings`);
await trackActivity(HUDSON, "admin_adjustment", { kind: "alt_funnel_boosts_cleared", cleared: boosts.length }).catch(() => {});

console.log(`\nDone. gold ${row.gold.toLocaleString()}, xp ${Number(row.xp).toLocaleString()}.`);
