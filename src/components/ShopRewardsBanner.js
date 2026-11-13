import Link from "next/link";

// ── THE MOMENT AFTER THEY PAY ────────────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-12: "they should be onboarded into the game by visibly seeing the in-game rewards they've
// just achieved by spending money. And there should be a ramp for them to be onboarded into the game."
//
// This banner existed and said: "🎉 You just earned Wolf Den Rewards points!" — no number, no mention of a
// game, and a link to a card. So a buyer learned that something abstract had happened to an account they did
// not know they had. Three things were missing and all three are the same thing: nothing on this screen was
// CONCRETE.
//
//   WHAT      the actual points and gold that order paid, read back from the ledger (see rewardsForOrder)
//   WHERE     that it is a game, named, with the rooms those rewards are spent in
//   NEXT      one door, chosen by the state they are actually in
//
// ⚠️ IT IS NO LONGER A CLIENT COMPONENT. It read ?ordered= with useSearchParams, which can answer "did they
// just check out" and can never answer "what did that order pay" — that is a database row. The page resolves
// both and this renders them, which also means the numbers are in the HTML rather than arriving a tick later
// on a screen somebody is reading once.
//
// ⚠️ AND THE RAMP FORKS ON `unclaimed`. An account provisioned by a purchase has no password: telling that
// person to "go play" sends them to a login they cannot pass. Their ramp is to claim it. Somebody who
// already has a real account gets the guide instead, which is the ramp that already exists.
export default function ShopRewardsBanner({ ordered = null, rewards = null }) {
    if (!ordered) return null;

    const points = rewards?.points ?? null;
    const unclaimed = Boolean(rewards?.unclaimed);
    // ⚠️ GOLD IS LOOKED UP, NOT COPIED FROM THE XP. awardXp does pay gold alongside points, which is
    // what [[awardxp-gold-tracks-xp-landmine]] is about — but the two take different multipliers, so they
    // are different numbers. A real $20 test purchase paid 112 XP and 48 gold. This screen exists to be
    // checked against their balance; printing the XP twice would have failed at exactly that.
    const gold = rewards?.gold ?? null;

    return (
        <section className="card rewards-callout rewards-earned">
            <div className="rewards-callout-text">
                <div className="rewards-callout-title">
                    {points != null && gold != null
                        ? `🎉 You just earned ${points.toLocaleString()} XP and ${gold.toLocaleString()} gold`
                        : points != null
                            ? `🎉 You just earned ${points.toLocaleString()} XP`
                            : "🎉 That order just earned you XP and gold"}
                </div>
                <div className="rewards-callout-sub">
                    {unclaimed ? (
                        <>
                            They are waiting in a Wolf Den account that is already yours &mdash; it was made
                            with this email when you ordered. Set a password and it is open: a hero, a farm,
                            pets, the Grove, and gold to spend on all of it.
                        </>
                    ) : (
                        <>
                            They are on your account. Gold buys gear, seeds and pets in{" "}
                            <strong>The Wolf Den</strong> &mdash; the game that comes with your account.
                        </>
                    )}
                </div>
                {/* ── THE RAMP ────────────────────────────────────────────────────────────────────
                    Not a tutorial and not a tour: the one sentence that says where to start. The
                    onboarding guide already exists and already pays coins per chapter, so the ramp is
                    pointing at it rather than building a second one. [[teach-by-showing-not-telling]] */}
                {!unclaimed ? (
                    <div className="rewards-callout-sub">
                        New to it? <Link href="/marketplace/guide">The guide</Link> walks you through it a
                        room at a time, and pays you for finishing each one.
                    </div>
                ) : null}
            </div>
            {unclaimed ? (
                <Link href="/marketplace/login?signup=1" className="btn-gold">Claim your account &rarr;</Link>
            ) : (
                <Link href="/marketplace" className="btn-gold">Open the Den &rarr;</Link>
            )}
        </section>
    );
}
