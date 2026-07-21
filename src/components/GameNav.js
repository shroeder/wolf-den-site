"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
    const inGame = LINKS.some((l) => isOn(pathname, l.href));
    // Unopened-chest reminder: badge the Gear pill (chests are opened on the inventory page). Refetch on
    // each in-game navigation so the count drops as soon as you open them.
    const [chests, setChests] = useState(0);
    const [gold, setGold] = useState(null);
    useEffect(() => {
        if (!inGame) return undefined;
        let alive = true;
        fetch("/api/marketplace/chests", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (!alive) return;
                setChests((d?.chests || []).reduce((s, c) => s + (c.count || 0), 0));
                if (typeof d?.gold === "number") setGold(d.gold);
            })
            .catch(() => {});
        return () => { alive = false; };
    }, [inGame, pathname]);

    if (!inGame) return null;

    return (
        <nav className="game-nav" aria-label="Game menu">
            {/* One authoritative gold balance for the whole game — section headers don't repeat it. */}
            {gold != null ? <span className="game-nav-gold" title="Your gold">🪙 {gold.toLocaleString()}</span> : null}
            <div className="game-nav-scroll">
                {LINKS.map((l) => {
                    const badge = l.href === "/marketplace/inventory" && chests > 0 ? chests : null;
                    return (
                        <Link key={l.href} href={l.href} className={`game-nav-link${isOn(pathname, l.href) ? " is-active" : ""}${badge ? " has-badge" : ""}`}>
                            <span aria-hidden="true">{l.emoji}</span> {l.label}
                            {badge ? <span className="game-nav-badge" title={`${badge} chest${badge === 1 ? "" : "s"} to open`}>{badge}</span> : null}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
