"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FaDharmachakra } from "react-icons/fa6";

import { useItemSprite } from "@/components/ItemArt";

// The Sets menu icon: the die-cut Warplate Helm sprite (falls back to a helmet emoji until it loads) — a real
// piece of gear reads far better here than the old puzzle-piece glyph.
function SetsHelmet() {
    const sprite = useItemSprite("warplate_helm");
    if (sprite) return <img src={sprite} alt="" width={18} height={18} style={{ width: 18, height: 18, objectFit: "contain", verticalAlign: "-0.28em" }} />;
    return <span aria-hidden="true">🪖</span>;
}

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
    { href: "/marketplace/sets", sprite: "helmet", label: "Sets" },
    { href: "/marketplace/quests", emoji: "📜", label: "Quests" },
    { href: "/marketplace/track", emoji: "🏆", label: "Rewards" },
    { href: "/marketplace/badges", emoji: "🎖️", label: "Badges" },
    { href: "/marketplace/leaderboard", emoji: "🥇", label: "Ranks" },
    { href: "/marketplace/bounties", emoji: "🎯", label: "Bounties" },
    { href: "/marketplace/credit", emoji: "💳", label: "Credit" },
];

const isOn = (pathname, href) => pathname === href || pathname.startsWith(`${href}/`);

// Paths that are part of the game shell but aren't their own nav destination — keep the menu visible on them
// so you don't get dumped out of the game when you (e.g.) tap into another player's profile or the badge list.
const EXTRA_GAME_PATHS = ["/marketplace/u/", "/marketplace/badges", "/marketplace/rewards", "/marketplace/farm"];

export default function GameNav() {
    const pathname = usePathname() || "";
    const [owner, setOwner] = useState(false); // owner-only preview links (e.g. Farm) appended when true
    // Farm is an owner-only preview — append it to the menu only for the owner account.
    const links = owner ? [...LINKS, { href: "/marketplace/farm", emoji: "🏡", label: "Farm" }] : LINKS;
    const inGame = links.some((l) => isOn(pathname, l.href)) || EXTRA_GAME_PATHS.some((p) => pathname === p || pathname.startsWith(p));
    // Unopened-chest reminder: badge the Gear pill (chests are opened on the inventory page). Refetch on
    // each in-game navigation so the count drops as soon as you open them.
    const [chests, setChests] = useState(0);
    const [spins, setSpins] = useState(0); // unused spins (free + tokens) → red badge on the Spin tab
    const [questsReady, setQuestsReady] = useState(0); // completed-but-unclaimed quests → red badge on Quests
    const [sailAttn, setSailAttn] = useState(false); // boat landed & waiting to dig → red-alert dot on Sailing
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
            fetch("/api/marketplace/spin", { cache: "no-store" })
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => { if (alive && d?.signedIn) setSpins((d.freeAvailable ? 1 : 0) + (d.tokens || 0)); })
                .catch(() => {});
            fetch("/api/marketplace/quests", { cache: "no-store" })
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => { if (!alive) return; const qs = Array.isArray(d) ? d : (d?.quests || []); setQuestsReady(qs.filter((q) => q.done && !q.claimed).length); })
                .catch(() => {});
            fetch("/api/marketplace/sailing/status", { cache: "no-store" })
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => { if (alive) { setSailAttn(Boolean(d?.attention)); setOwner(Boolean(d?.owner)); } })
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
                    const chestBadge = l.href === "/marketplace/inventory" && chests > 0 ? chests : null;
                    const spinBadge = l.href === "/marketplace/spin" && spins > 0 ? spins : null;
                    const questBadge = l.href === "/marketplace/quests" && questsReady > 0 ? questsReady : null;
                    const badge = chestBadge ?? spinBadge ?? questBadge;
                    const badgeTitle = chestBadge ? `${chestBadge} chest${chestBadge === 1 ? "" : "s"} to open` : spinBadge ? `${spinBadge} spin${spinBadge === 1 ? "" : "s"} ready` : questBadge ? `${questBadge} quest${questBadge === 1 ? "" : "s"} ready to claim` : null;
                    const dot = l.href === "/marketplace/sailing" && sailAttn;
                    return (
                        <Link key={l.href} href={l.href} className={`game-nav-link${isOn(pathname, l.href) ? " is-active" : ""}${badge ? " has-badge" : ""}${dot ? " has-dot" : ""}`}>
                            {l.Icon ? <l.Icon className="game-nav-ico" aria-hidden="true" /> : l.sprite === "helmet" ? <SetsHelmet /> : <span aria-hidden="true">{l.emoji}</span>} {l.label}
                            {badge ? <span className="game-nav-badge" title={badgeTitle}>{badge}</span> : null}
                            {dot ? <span className="game-nav-dot" title="Your boat has landed — time to dig!" aria-label="needs attention" /> : null}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
