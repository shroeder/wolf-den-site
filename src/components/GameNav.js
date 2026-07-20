"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// In-game menu bar: a horizontal, scrollable strip of the game areas, shown at the top of every game page
// so you can hop Boss → Spin → Pets → Gear etc. without going back to the hub. Mounted once in the
// marketplace layout; it self-hides on non-game pages (vendor marketplace, social, profile, checkout…).
const LINKS = [
    { href: "/marketplace/play", emoji: "🎮", label: "Home" },
    { href: "/marketplace/boss", emoji: "⚔️", label: "Boss" },
    { href: "/marketplace/spin", emoji: "🎡", label: "Spin" },
    { href: "/marketplace/pets", emoji: "🐾", label: "Pets" },
    { href: "/marketplace/inventory", emoji: "🛡️", label: "Gear" },
    { href: "/marketplace/sets", emoji: "🧩", label: "Sets" },
    { href: "/marketplace/quests", emoji: "📜", label: "Quests" },
    { href: "/marketplace/track", emoji: "🏆", label: "Rewards" },
    { href: "/marketplace/leaderboard", emoji: "🥇", label: "Ranks" },
    { href: "/marketplace/bounties", emoji: "🎯", label: "Bounties" },
];

const isOn = (pathname, href) => pathname === href || pathname.startsWith(`${href}/`);

export default function GameNav() {
    const pathname = usePathname() || "";
    // Only render inside the game (any of the areas above, incl. their sub-routes like /boss/recap/…).
    if (!LINKS.some((l) => isOn(pathname, l.href))) return null;

    return (
        <nav className="game-nav" aria-label="Game menu">
            <div className="game-nav-scroll">
                {LINKS.map((l) => (
                    <Link key={l.href} href={l.href} className={`game-nav-link${isOn(pathname, l.href) ? " is-active" : ""}`}>
                        <span aria-hidden="true">{l.emoji}</span> {l.label}
                    </Link>
                ))}
            </div>
        </nav>
    );
}
