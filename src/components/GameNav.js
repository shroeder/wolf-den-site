"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FaDharmachakra } from "react-icons/fa6";

// In-game menu bar: a horizontal, scrollable strip of the game areas, shown at the top of every game page
// so you can hop Boss → Spin → Pets → Gear etc. without going back to the hub. Mounted once in the
// marketplace layout; it self-hides on non-game pages (vendor marketplace, social, profile, checkout…).
const LINKS = [
    { href: "/marketplace/play", emoji: "🎮", label: "Home" },
    { href: "/marketplace/profile", emoji: "👤", label: "Profile" },
    { href: "/marketplace/boss", emoji: "⚔️", label: "Boss" },
    { href: "/marketplace/sailing", emoji: "⛵", label: "Sailing" },
    { href: "/marketplace/spin", Icon: FaDharmachakra, label: "Spin" },
    { href: "/marketplace/pets", emoji: "🐾", label: "Pets" },
    { href: "/marketplace/inventory", emoji: "🛡️", label: "Gear" },
    { href: "/marketplace/store", emoji: "🛒", label: "Store" },
    { href: "/marketplace/sets", emoji: "🧩", label: "Sets" },
    { href: "/marketplace/quests", emoji: "📜", label: "Quests" },
    { href: "/marketplace/track", emoji: "🏆", label: "Rewards" },
    { href: "/marketplace/leaderboard", emoji: "🥇", label: "Ranks" },
    { href: "/marketplace/bounties", emoji: "🎯", label: "Bounties" },
    { href: "/marketplace/credit", emoji: "💳", label: "Credit" },
];

const isOn = (pathname, href) => pathname === href || pathname.startsWith(`${href}/`);

export default function GameNav() {
    const pathname = usePathname() || "";
    const links = LINKS;
    const inGame = links.some((l) => isOn(pathname, l.href));
    // Unopened-chest reminder: badge the Gear pill (chests are opened on the inventory page). Refetch on
    // each in-game navigation so the count drops as soon as you open them.
    const [chests, setChests] = useState(0);
    useEffect(() => {
        if (!inGame) return undefined;
        let alive = true;
        const loadChests = () => {
            fetch("/api/marketplace/chests", { cache: "no-store" })
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => {
                    if (!alive) return;
                    setChests((d?.chests || []).reduce((s, c) => s + (c.count || 0), 0));
                })
                .catch(() => {});
        };
        loadChests();
        // Live-update the chest badge after any action (opening a chest, earning one) — not just on nav.
        const onRefresh = () => loadChests();
        window.addEventListener("wolfden-hud-refresh", onRefresh);
        return () => { alive = false; window.removeEventListener("wolfden-hud-refresh", onRefresh); };
    }, [inGame, pathname]);

    if (!inGame) return null;

    return (
        <nav className="game-nav" aria-label="Game menu">
            {/* Coins live in the top HUD strip (RewardNudge), not here — keeps this row purely navigation. */}
            <div className="game-nav-scroll">
                {links.map((l) => {
                    const badge = l.href === "/marketplace/inventory" && chests > 0 ? chests : null;
                    return (
                        <Link key={l.href} href={l.href} className={`game-nav-link${isOn(pathname, l.href) ? " is-active" : ""}${badge ? " has-badge" : ""}`}>
                            {l.Icon ? <l.Icon className="game-nav-ico" aria-hidden="true" /> : <span aria-hidden="true">{l.emoji}</span>} {l.label}
                            {badge ? <span className="game-nav-badge" title={`${badge} chest${badge === 1 ? "" : "s"} to open`}>{badge}</span> : null}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
