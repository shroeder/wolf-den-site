import Link from "next/link";
import { FaDharmachakra } from "react-icons/fa6";

import GameHubStats from "@/components/GameHubStats";
import ViewPing from "@/components/ViewPing";

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
    { href: "/marketplace/sets", emoji: "🧩", title: "Gear Sets", desc: "Match pieces for set bonuses and capstones.", tone: "sets" },
    { href: "/marketplace/quests", emoji: "📜", title: "Quests", desc: "Fresh daily bounties → gold, chests & tokens.", tone: "quests" },
    { href: "/marketplace/track", emoji: "🏆", title: "Rewards Track", desc: "See your next unlock and everything you've earned.", tone: "track" },
    { href: "/marketplace/leaderboard", emoji: "🥇", title: "Leaderboard", desc: "Where you rank against the whole pack.", tone: "leader" },
    { href: "/marketplace/bounties", emoji: "🎯", title: "Bounties", desc: "Post gold for real-world help — or claim someone else's.", tone: "bounty" },
];

export default function GamePlayHub() {
    return (
        <div className="stack reveal game-hub">
            <ViewPing event="view_game_hub" />
            <section className="card game-hub-hero">
                <h1 style={{ margin: 0 }}>🎮 The Wolf Den Game</h1>
                <p className="muted" style={{ margin: "4px 0 0" }}>Level up, fight the boss, collect pets & gear, and spin the wheel — all in one place.</p>
                <GameHubStats />
            </section>

            <div className="game-hub-grid">
                {FEATURES.map((f) => (
                    <Link key={f.href} href={f.href} className={`game-tile tone-${f.tone}`}>
                        <span className="game-tile-emoji" aria-hidden="true">{f.Icon ? <f.Icon /> : f.emoji}</span>
                        <span className="game-tile-title">{f.title}</span>
                        <span className="game-tile-desc">{f.desc}</span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
