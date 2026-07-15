"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

// Post-purchase hook: shows only right after checkout (?ordered=…) — the moment a buyer has JUST earned
// points (parked by their email). The highest-converting spot to pull them into a rewards account.
export default function ShopRewardsBanner({ hasRewards = false }) {
    const ordered = useSearchParams()?.get("ordered");
    if (!ordered) return null;

    return (
        <section className="card rewards-callout rewards-earned">
            <div className="rewards-callout-text">
                <div className="rewards-callout-title">🎉 You just earned Wolf Den Rewards points!</div>
                <div className="rewards-callout-sub">
                    {hasRewards
                        ? "They're on your account — keep leveling up."
                        : "Create your free rewards account with this email to claim them and start leveling up."}
                </div>
            </div>
            {hasRewards ? (
                <Link href="/marketplace/card" className="btn rewards-callout-btn">View rewards</Link>
            ) : (
                <Link href="/marketplace/login?signup=1" className="btn rewards-callout-btn">Claim your points →</Link>
            )}
        </section>
    );
}
