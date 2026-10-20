"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import Glyph from "@/components/Glyph";
import { hudFeed } from "@/lib/hud-feed";
import { nudgeFeed } from "@/lib/nudge-feed";

// ── ⚠️ SPRITES, NOT GLYPHS. THE WHOLE WAY DOWN. ─────────────────────────────────────────────────────────────
// Luke, looking at this page: "I hate icons I only like sprites."
//
// It shipped with react-icons line glyphs — a thin outlined sword, a thin outlined paw — because that is what
// the old grid used. They are legible and they are completely characterless, and on a page whose entire job
// is to make a member want to tap something, character IS the job. Next to the Den's painted art they read as
// placeholder.
//
// Every one of these already exists and none of it had to be drawn: the nav's own 128px icon set, plus the
// Pathfinder's chapter art for the three the nav never had (the arena, the kitchen, the shelf). Same hand,
// same lighting, same game.
const ART = {
    boss: "/images/nav/boss.png",
    spin: "/images/nav/spin.png",
    gear: "/images/nav/gear.png",
    pets: "/images/nav/pets.png",
    farm: "/images/nav/farm.png",
    arena: "/images/guide/ch-arena.webp",
    mine: "/images/nav/mining.png",
    fishing: "/images/nav/fishing.png",
    sailing: "/images/nav/sailing.png",
    kitchen: "/images/guide/ch-kitchen.webp",
    casino: "/images/nav/casino.png",
    dungeons: "/images/nav/delves.png",
    forge: "/images/nav/forge.png",
    quests: "/images/nav/quests.png",
    sets: "/images/guide/ch-shelf.webp",
    track: "/images/nav/rewards.png",
    badges: "/images/nav/badges.png",
    ranks: "/images/nav/ranks.png",
    bounties: "/images/nav/bounties.png",
};

/** One painted sprite. `alt` is always empty: every one of these sits beside its own label, so a screen
 *  reader announcing the picture as well would read the name of the place twice. */
function Art({ k, size }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={ART[k]} alt="" width={size} height={size} style={{ display: "block", objectFit: "contain" }} />;
}

// ── THE GAME HUB ─────────────────────────────────────────────────────────────────────────────────────────────
// Luke, looking at the old one: "This page looks ugly and needs a lot of work it should be sexy."
//
// WHAT IT WAS. A text card reading "The Wolf Den Game — level up, fight the boss, collect pets & gear, and
// spin the wheel", then a full-width invite panel, then twelve identical grey tiles. Three problems, and the
// third is the one that matters:
//
//   1. THE HEADLINE TOLD A LEVEL 43 PLAYER WHAT THE GAME IS. They know. It is the page they open every day.
//   2. THE INVITE CARD HELD THE SECOND SLOT FOREVER for a thing you do once.
//   3. NOTHING ON IT WAS ALIVE. Twelve doors, all the same size, none of them saying whether there was
//      anything behind them. The member had to open the Mine to find out the Mine had nothing today.
//
// Every number needed to fix (3) was already on the page. GameNav asks /api/marketplace/hud in the layout —
// chests, spins, boss strikes, quests, crops, free chips, arena fights, mine trips, delve runs — and this
// used to ignore all of it and call /api/marketplace/spin for one figure. It rides the same reply now (see
// hud-feed.js), so the hub got livelier and cheaper in the same change.
//
// ⚠️ A BADGE IS ONLY DRAWN WHEN IT IS A REASON TO TAP. Zero is never rendered. A row of grey "0"s is a wall
// of disappointment and it is also how you teach somebody to stop reading the badges.

// What is ACTIONABLE right now, in the order a member would want it. Each reads one field off the HUD reply.
// `tone` drives the colour; `want` turns a raw count into the sentence on the chip.
const READY = [
    { key: "spin", href: "/marketplace/spin", tone: "spin", art: "spin",
        n: (h) => h.spins, want: (n) => (n === 1 ? "Free spin ready" : `${n} spins ready`) },
    { key: "boss", href: "/marketplace/boss", tone: "boss", art: "boss",
        n: (h) => h.bossStrikes, want: (n) => (n === 1 ? "Boss strike ready" : `${n} boss strikes`) },
    { key: "chests", href: "/marketplace/inventory", tone: "gear", art: "gear",
        n: (h) => h.chests, want: (n) => `${n} chest${n === 1 ? "" : "s"} to open` },
    { key: "quests", href: "/marketplace/quests", tone: "quests", art: "quests",
        n: (h) => h.questsReady, want: (n) => `${n} quest${n === 1 ? "" : "s"} to claim` },
    { key: "crops", href: "/marketplace/farm", tone: "pets", art: "farm",
        n: (h) => h.farm?.cropsReady, want: (n) => `${n} crop${n === 1 ? "" : "s"} ready` },
    { key: "arena", href: "/marketplace/arena", tone: "boss", art: "arena",
        n: (h) => (h.arena?.unlocked ? h.arena.fightsLeft : 0), want: (n) => `${n} arena fight${n === 1 ? "" : "s"}` },
    { key: "mine", href: "/marketplace/mining", tone: "quests", art: "mine",
        n: (h) => (h.mine?.unlocked ? h.mine.trips : 0), want: (n) => `${n} mine trip${n === 1 ? "" : "s"}` },
    { key: "casts", href: "/marketplace/fishing", tone: "sets", art: "fishing",
        n: (h) => (h.sailing?.fishing ? h.sailing.casts : 0), want: (n) => `${n} cast${n === 1 ? "" : "s"} left` },
    { key: "chips", href: "/marketplace/casino", tone: "track", art: "casino",
        n: (h) => (h.casinoChips ? 1 : 0), want: () => "Free chips waiting" },
    { key: "delves", href: "/marketplace/dungeons", tone: "bounty", art: "dungeons",
        n: (h) => (h.delves?.unlocked ? h.delves.runs : 0), want: (n) => `${n} dungeon run${n === 1 ? "" : "s"}` },
];

// The doors. `badge` is the live count drawn in the corner; everything without one is a place rather than a
// chore, and gets no badge at all rather than a zero.
const TILES = [
    { href: "/marketplace/boss", art: "boss", title: "Weekly Boss", desc: "Strike the shared boss for XP and raffle tickets.", tone: "boss", badge: (h) => h.bossStrikes, big: true },
    { href: "/marketplace/spin", art: "spin", title: "Daily Spin", desc: "One free spin a day — gold, chests, the jackpot.", tone: "spin", badge: (h) => h.spins, big: true },
    { href: "/marketplace/inventory", art: "gear", title: "Gear & Chests", desc: "Your loadout, the shop, and everything unopened.", tone: "gear", badge: (h) => h.chests },
    { href: "/marketplace/pets", art: "pets", title: "Pets", desc: "Collect companions, equip one, level it up.", tone: "pets" },
    { href: "/marketplace/farm", art: "farm", title: "The Farm", desc: "Crops grow while you are gone. Pets roam it.", tone: "pets", badge: (h) => h.farm?.cropsReady, when: () => true },
    { href: "/marketplace/arena", art: "arena", title: "Arena", desc: "Fight the pack and climb the NPC ladder.", tone: "boss", badge: (h) => h.arena?.fightsLeft, when: (h) => h.arena?.unlocked },
    { href: "/marketplace/mining", art: "mine", title: "The Mine", desc: "Push your luck downward for ore and gems.", tone: "quests", badge: (h) => h.mine?.trips, when: (h) => h.mine?.unlocked },
    { href: "/marketplace/fishing", art: "fishing", title: "Fishing", desc: "Cast for the kitchen, and for what is deeper.", tone: "sets", badge: (h) => h.sailing?.casts, when: (h) => h.sailing?.fishing },
    { href: "/marketplace/sailing", art: "sailing", title: "Sailing", desc: "Send the boat out, dig up what it finds.", tone: "sets", when: (h) => h.sailing?.fishing },
    { href: "/marketplace/cooking", art: "kitchen", title: "The Kitchen", desc: "Turn the harvest into buffs worth timing.", tone: "quests", when: (h) => h.kitchen },
    { href: "/marketplace/casino", art: "casino", title: "The Casino", desc: "Five cabinets, a wheel, and a card table.", tone: "track", badge: (h) => (h.casinoChips ? "!" : 0), when: (h) => h.casino },
    { href: "/marketplace/dungeons", art: "dungeons", title: "Dungeons", desc: "A run with a boss at the bottom of it.", tone: "bounty", badge: (h) => h.delves?.runs, when: (h) => h.delves?.unlocked },
    { href: "/marketplace/blacksmith", art: "forge", title: "The Forge", desc: "Salvage and enhance — hammer it stronger.", tone: "boss" },
    { href: "/marketplace/quests", art: "quests", title: "Quests", desc: "Fresh daily bounties for gold and chests.", tone: "quests", badge: (h) => h.questsReady },
    { href: "/marketplace/sets", art: "sets", title: "Gear Sets", desc: "Match pieces for set bonuses and capstones.", tone: "sets" },
    { href: "/marketplace/track", art: "track", title: "Rewards Track", desc: "Your next unlock, and everything earned.", tone: "track" },
    { href: "/marketplace/badges", art: "badges", title: "Badges", desc: "Every badge — pick three for your card.", tone: "track" },
    { href: "/marketplace/leaderboard", art: "ranks", title: "Leaderboard", desc: "Where you rank against the whole pack.", tone: "leader" },
    { href: "/marketplace/bounties", art: "bounties", title: "Bounties", desc: "Post gold for real help, or claim someone's.", tone: "bounty" },
];

export default function PlayHub({ name = "", avatar = null, level = null, isNew = false }) {
    const [hud, setHud] = useState(null);
    const [unlock, setUnlock] = useState(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            // Both of these are already in flight for this page load — the HUD for the menu, the nudge feed
            // for the root-layout watchers. Neither call opens a request of its own.
            const [h, u] = await Promise.all([
                hudFeed(),
                nudgeFeed().then((d) => d?.nextUnlock || null).catch(() => null),
            ]);
            if (!alive) return;
            setHud(h); setUnlock(u);
        })();
        const onRefresh = () => { hudFeed().then((h) => alive && setHud(h)); };
        window.addEventListener("wolfden-hud-refresh", onRefresh);
        return () => { alive = false; window.removeEventListener("wolfden-hud-refresh", onRefresh); };
    }, []);

    const ready = hud ? READY.map((r) => ({ ...r, n: Number(r.n(hud)) || 0 })).filter((r) => r.n > 0) : [];
    const tiles = TILES.filter((t) => !t.when || (hud && t.when(hud)));

    return (
        <div className="ph">
            {/* ── THE HERO ── who you are, not what the game is. */}
            <section className="ph-hero">
                <div className="ph-hero-art" aria-hidden="true">
                    {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatar} alt="" />
                    ) : <Art k="pets" size={52} />}
                </div>
                <div className="ph-hero-body">
                    <div className="ph-hero-kick">
                        {name ? `Welcome back, ${name}` : "Welcome back"}
                        {level != null ? <span className="ph-lv">Lv {level}</span> : null}
                    </div>
                    {/* ⚠️ THE BAR IS A DISTANCE, NOT A PAT ON THE HEAD. It names the thing it is counting
                        toward, because a progress bar with no prize at the end of it is decoration. */}
                    {unlock && !unlock.maxed && unlock.label ? (
                        <>
                            <div className="ph-bar"><span style={{ width: `${unlock.pct || 0}%` }} /></div>
                            <div className="ph-next">
                                Next: <Glyph value={unlock.icon} /> <b>{unlock.label}</b>
                                <span className="muted"> · {(unlock.xpToGo || 0).toLocaleString()} XP to go</span>
                            </div>
                        </>
                    ) : unlock ? (
                        <div className="ph-next muted">{(unlock.xp || 0).toLocaleString()} XP</div>
                    ) : <div className="ph-next muted">&nbsp;</div>}
                </div>
            </section>

            {/* ── ⚠️ A NEW MEMBER IS SHOWN THE DOOR, NOT THE BUILDING ────────────────────────────────────
                Luke: "when you sign up for the game, we really need the guide more prevalent to help them
                learn what to do."

                The four people who joined on the day the 30th promo ran did between seven and twelve things
                each and stopped. That is not somebody who disliked the game, it is somebody who opened a
                screen with nineteen doors on it and had no idea which one was first — and the Pathfinder,
                which exists precisely to answer that, was a tile in the nav drawer with the same weight as
                the leaderboard.

                So for a new account it goes ABOVE everything, before the rail and before the grid, and it is
                the only thing on the page styled as an instruction. It disappears on its own as they level,
                because a veteran being told where to start is the same failure in the other direction. */}
            {isNew ? (
                <Link href="/marketplace/guide" className="ph-start">
                    <span className="ph-start-art" aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/images/guide/ch-hero.webp" alt="" width={52} height={52} />
                    </span>
                    <span className="ph-start-body">
                        <b>New here? Start with the Pathfinder.</b>
                        <em>One thing at a time, in order, and it pays you for each one. Takes about a minute to get going.</em>
                    </span>
                    <span className="ph-start-go" aria-hidden="true">→</span>
                </Link>
            ) : null}

            {/* ── READY NOW ── only what can be done this minute. Collapses to nothing when nothing can. */}
            {ready.length ? (
                <section className="ph-ready" aria-label="Ready now">
                    <h2 className="ph-ready-h">Ready now</h2>
                    <div className="ph-rail">
                        {ready.map((r) => (
                            <Link key={r.key} href={r.href} className={`ph-chip tone-${r.tone}`}>
                                <span className="ph-chip-ico" aria-hidden="true"><Art k={r.art} size={22} /></span>
                                <span>{r.want(r.n)}</span>
                            </Link>
                        ))}
                    </div>
                </section>
            ) : null}

            <div className="ph-grid">
                {tiles.map((t) => {
                    const n = hud && t.badge ? t.badge(hud) : 0;
                    return (
                        <Link key={t.href} href={t.href} className={`ph-tile tone-${t.tone}${t.big ? " is-big" : ""}`}>
                            <span className="ph-tile-ico" aria-hidden="true"><Art k={t.art} size={38} /></span>
                            <span className="ph-tile-title">{t.title}</span>
                            <span className="ph-tile-desc">{t.desc}</span>
                            {/* Zero is never drawn — see the note at the top. */}
                            {n ? <span className="ph-tile-badge">{n}</span> : null}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
