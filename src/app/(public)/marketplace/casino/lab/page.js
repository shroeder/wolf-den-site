import { notFound } from "next/navigation";

import CasinoClient from "@/components/CasinoClient";
import { bingoState } from "@/lib/marketplace/bingo.js";
import { blackjackState } from "@/lib/marketplace/blackjack.js";
import { getCasinoState } from "@/lib/marketplace/casino.js";

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
// ⚠ THE BIG YELLOW DISC ON THE FLOOR IS NOT A BUG. It is `.cas-blank.is-you`, the deliberate stand-in for a
// member with no avatar sprite, and there is no member here. A real player has a sprite and never sees it.
export const dynamic = "force-dynamic";
export const metadata = { title: "Casino Lab", robots: { index: false, follow: false } };

export default async function Page({ searchParams }) {
    if (process.env.NODE_ENV === "production") notFound();
    const q = await searchParams;
    const [floor, table, hall] = await Promise.all([
        getCasinoState(null), blackjackState(null).catch(() => null), bingoState().catch(() => null),
    ]);
    return (
        <CasinoClient initial={{
            ...floor, blackjack: table, bingo: hall,
            gold: q?.broke ? 40 : 25000, chips: q?.chips != null ? Number(q.chips) : 4820, dailyChips: !q?.claimed,
            vip: { allowed: false, shadows: [] },
        }} />
    );
}
