import { notFound } from "next/navigation";

import CasinoLab from "@/components/CasinoLab";
import { bingoState } from "@/lib/marketplace/bingo.js";
import { blackjackState } from "@/lib/marketplace/blackjack.js";
import { getCasinoState } from "@/lib/marketplace/casino.js";
import { CHIP_RATE } from "@/lib/marketplace/chip-rate.js";
import { playSpin, slot5 } from "@/lib/marketplace/casino-slot5.js";

// ── DEV ONLY: THE REAL FLOOR, WITH NOBODY SIGNED IN ──────────────────────────────────────────────────────────
// The casino is behind a redirect — no session, no page — so the only way it has ever been LOOKED at is by
// signing in as a real member. That is why "its not rendering properly" was the first anybody heard of a
// layout that had been shipped broken: nothing on the rig could reach the screen to see it.
//
// The fixture is not hand-written. `getCasinoState(null)` returns the whole real shape — every paytable, the
// resolved reel art, the live pot — and simply has no member on it, so this is the actual server payload
// rather than my guess at what it looks like. Only the purse is overridden, so the chip strip can be seen in
// each state it has: ?claimed=1 for after today's free thousand is gone, ?broke=1 for no gold to convert,
// ?chips=N for any purse — ?chips=10 is the one that proves a machine still refuses a bet it cannot cover.
//
// ?spin=1 also hands the client a REAL spin off the five-reel engine — playSpin, the same function the route
// calls — so the reveal can be filmed without an account and without staking anybody's chips. The lab stubs
// only the POST that would need a session; the grid being landed is the engine's own.
//
// ⚠ THE BIG YELLOW DISC ON THE FLOOR IS NOT A BUG. It is `.cas-blank.is-you`, the deliberate stand-in for a
// member with no avatar sprite, and there is no member here. A real player has a sprite and never sees it.
export const dynamic = "force-dynamic";
export const metadata = { title: "Casino Lab", robots: { index: false, follow: false } };

// One spin off the real engine, shaped the way the route shapes it — the grid, the winning lines, and each
// line's payout converted to chips at the real rate. Kept spinning until it finds a paying one, because the
// thing being watched here is WHEN the win reaches the purse, and a losing spin ends at the same number
// either way. It is a genuine outcome, just a selected one; nothing about the grid is invented.
const BET = 100;
function oneSpin() {
    const m = slot5("slot");
    for (let i = 0; i < 400; i += 1) {
        const r = playSpin(m, { bet: BET, offerId: "mid", meter: [] });
        // The base game's lines live under `base`, not at the top level — the top level is the envelope for
        // every round type the cabinet can go into. Skip the ones that open a bonus: those have their own
        // reveals, and the plain paying spin is the shortest thing that still has a win to hold back.
        const wins = ((r.base && r.base.wins) || []).filter((w) => w.kind === "line");
        if (!wins.length || r.free || r.hold || r.chain || r.gems || r.warren || r.winAgain) continue;
        return {
            grid: r.grid, bet: BET,
            lines: wins.map((w) => ({ ...w, chips: Math.max(1, Math.round(w.amount * CHIP_RATE)) })),
            won: Math.max(1, Math.round((r.base.total || 0) * CHIP_RATE)),
        };
    }
    return null;
}

export default async function Page({ searchParams }) {
    if (process.env.NODE_ENV === "production") notFound();
    const q = await searchParams;
    const [floor, table, hall] = await Promise.all([
        getCasinoState(null), blackjackState(null).catch(() => null), bingoState().catch(() => null),
    ]);
    return (
        <CasinoLab spin={q?.spin ? oneSpin() : null} initial={{
            ...floor, blackjack: table, bingo: hall,
            gold: q?.broke ? 40 : 25000, chips: q?.chips != null ? Number(q.chips) : 4820, dailyChips: !q?.claimed,
            vip: { allowed: false, shadows: [] },
        }} />
    );
}
