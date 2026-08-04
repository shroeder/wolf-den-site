import Link from "next/link";
import { FaDharmachakra } from "react-icons/fa6";

import GameHubStats from "@/components/GameHubStats";
import HelmetSprite from "@/components/HelmetSprite";
import RaidDefenseReport from "@/components/RaidDefenseReport";
import ReferralInvite from "@/components/ReferralInvite";
import SpinNudge from "@/components/SpinNudge";
import ViewPing from "@/components/ViewPing";
import { db } from "@/lib/db";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { REF_REFERRER_GOLD, REF_JOINER_GOLD } from "@/lib/marketplace/referral.js";
import { isOwner } from "@/lib/marketplace/owner.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
    title: "The Wolf Den Game | Play",
    robots: { index: false },
};

// THE GAME hub — the single "game" area (one entry in the site header) with its own dopamine-forward menu,
// kept separate from real commerce (Shop / Vendor Marketplace). Every game feature is broken out here.
const FEATURES = [
    { href: "/marketplace/boss", emoji: "⚔️", title: "Weekly Boss", desc: "Land your daily strike on the shared boss for XP & raffle tickets.", tone: "boss" },
    { href: "/marketplace/spin", Icon: FaDharmachakra, title: "Daily Spin", desc: "One free spin a day — gold, XP, chests… and the jackpot.", tone: "spin" },
    { href: "/marketplace/pets", emoji: "🐾", title: "Pets", desc: "Collect companions, equip one, and level it up.", tone: "pets" },
    { href: "/marketplace/inventory", emoji: "🛡️", title: "Gear", desc: "Your loadout, the gold shop, and loot chests.", tone: "gear" },
    { href: "/marketplace/blacksmith", emoji: "🔨", title: "The Forge", desc: "Salvage & enhance your gear — hammer it stronger on the anvil.", tone: "boss" },
    { href: "/marketplace/sets", sprite: "helmet", title: "Gear Sets", desc: "Match pieces for set bonuses and capstones.", tone: "sets" },
    { href: "/marketplace/quests", emoji: "📜", title: "Quests", desc: "Fresh daily bounties → gold, chests & tokens.", tone: "quests" },
    { href: "/marketplace/track", emoji: "🏆", title: "Rewards Track", desc: "See your next unlock and everything you've earned.", tone: "track" },
    { href: "/marketplace/badges", emoji: "🎖️", title: "Badges", desc: "Every badge you've earned — pick 3 to show on your card.", tone: "track" },
    { href: "/marketplace/leaderboard", emoji: "🥇", title: "Leaderboard", desc: "Where you rank against the whole pack.", tone: "leader" },
    { href: "/marketplace/bounties", emoji: "🎯", title: "Bounties", desc: "Post gold for real-world help — or claim someone else's.", tone: "bounty" },
    { href: "/marketplace/invite", emoji: "🎁", title: "Invite Friends", desc: "Share your link — you both earn 500 gold + a chest.", tone: "track" },
];

export default async function GamePlayHub({ searchParams }) {
    // Owner-only preview features (hidden from everyone else) surface an extra tile here.
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const owner = Boolean(buyer && isOwner(buyer.id));
    // A logged-in member gets their shareable invite card; a logged-out visitor who followed one gets a
    // ref-carrying signup CTA (so the referral survives the account they're about to make).
    const alias = buyer ? (await db.queryOne(`SELECT alias FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null))?.alias || null : null;
    const ref = String((await searchParams)?.ref || "").trim().replace(/^@/, "");

    return (
        <div className="stack reveal game-hub">
            <ViewPing event="view_game_hub" />
            {buyer ? <RaidDefenseReport /> : null}
            {buyer ? <SpinNudge /> : null}
            <section className="card game-hub-hero">
                <h1 style={{ margin: 0 }}>🎮 The Wolf Den Game</h1>
                <p className="muted" style={{ margin: "4px 0 0" }}>Level up, fight the boss, collect pets & gear, and spin the wheel — all in one place.</p>
                <GameHubStats />
            </section>

            {!buyer ? (
                <Link href={`/marketplace/login?signup=1${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`} className="card" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit", borderColor: "rgba(255,215,94,0.45)" }}>
                    <span style={{ fontSize: 30 }} aria-hidden="true">🐺</span>
                    <span style={{ flex: 1 }}>
                        <strong>{ref ? `@${ref} invited you — join free` : "Create a free account to play"}</strong>
                        <span className="muted" style={{ display: "block", fontSize: "0.9rem" }}>
                            {ref ? "Verify your email and you both earn bonus gold + a chest." : "Fight the weekly boss, collect pets, and earn XP & store credit."}
                        </span>
                    </span>
                    <span className="btn-gold" style={{ whiteSpace: "nowrap" }}>Get started →</span>
                </Link>
            ) : null}

            {alias ? <ReferralInvite alias={alias} referrerGold={REF_REFERRER_GOLD} joinerGold={REF_JOINER_GOLD} /> : null}

            <div className="game-hub-grid">
                {FEATURES.map((f) => (
                    <Link key={f.href} href={f.href} className={`game-tile tone-${f.tone}`}>
                        <span className="game-tile-emoji" aria-hidden="true">{f.sprite === "helmet" ? <HelmetSprite size={30} /> : f.Icon ? <f.Icon /> : f.emoji}</span>
                        <span className="game-tile-title">{f.title}</span>
                        <span className="game-tile-desc">{f.desc}</span>
                    </Link>
                ))}
                {owner ? (
                    <>
                        <Link href="/marketplace/sailing" className="game-tile tone-boss">
                            <span className="game-tile-emoji" aria-hidden="true">⛵</span>
                            <span className="game-tile-title">Sailing <span className="muted" style={{ fontSize: "0.7em" }}>· owner</span></span>
                            <span className="game-tile-desc">Voyage for treasure — raid ships, dig islands, forge chests.</span>
                        </Link>
                        <Link href="/marketplace/farm" className="game-tile tone-pets">
                            <span className="game-tile-emoji" aria-hidden="true">🏡</span>
                            <span className="game-tile-title">Farm <span className="muted" style={{ fontSize: "0.7em" }}>· owner</span></span>
                            <span className="game-tile-desc">Watch your pets roam — pet them for XP, and visit other farms.</span>
                        </Link>
                    </>
                ) : null}
            </div>
        </div>
    );
}
