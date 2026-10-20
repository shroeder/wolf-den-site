import Link from "next/link";

import RaidDefenseReport from "@/components/RaidDefenseReport";
import ReferralInvite from "@/components/ReferralInvite";
import VerifyNudge from "@/components/VerifyNudge";
import PlayHub from "@/components/PlayHub";
import PlayLanding from "@/components/PlayLanding";
import ViewPing from "@/components/ViewPing";
import { db } from "@/lib/db";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { REF_REFERRER_GOLD, REF_JOINER_GOLD } from "@/lib/marketplace/referral.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { landingData } from "@/lib/marketplace/play-landing.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The signed-out view is now a sales page, so it wants to be found. (It was noindex back when this route was
// purely a member hub.) A signed-in member's version is behind force-dynamic auth, so a crawler only ever
// sees the pitch.
export const metadata = {
    title: "The Wolf Den Game — level up in the game, level up in real life",
    description: "A free RPG built on top of the shop. Beat the weekly boss and a real prize goes home with somebody. Find gear that carries a booster pack, store credit, or a grail card of your choice — redeemed at the counter.",
    openGraph: {
        title: "The Wolf Den Game — the loot is real",
        description: "Free to play. Fight the weekly boss for a real prize, find charged gear you redeem in store, and level a character that your actual shopping levels too.",
    },
};


export default async function GamePlayHub({ searchParams }) {
    // Owner-only preview features (hidden from everyone else) surface an extra tile here.
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const owner = Boolean(buyer && isOwner(buyer.id));
    // A logged-in member gets their shareable invite card; a logged-out visitor who followed one gets a
    // ref-carrying signup CTA (so the referral survives the account they're about to make).
    // ⚠️ ONE QUERY, NOT FOUR. The hub's hero wants the alias it already asked for plus a name, a sprite and
    // a level — all columns on the row this was already fetching. Four reads of one row is the shape
    // CLAUDE.md warns costs a fortune on Active CPU, and this is the most-opened page in the Den.
    const me = buyer
        ? await db.queryOne(
            `SELECT alias, COALESCE(NULLIF(first_name,''), NULLIF(display_name,''), alias) AS name,
                    avatar_sprite_url, xp
               FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null)
        : null;
    const alias = me?.alias || null;
    const ref = String((await searchParams)?.ref || "").trim().replace(/^@/, "");

    // ── LOGGED OUT ── a stranger gets sold, not shown a table of contents. The old view was a grid of emoji
    // over feature names, which never mentioned the only thing that makes this different from any other free
    // game: the loot is real, and the gear carries things you redeem at the counter.
    if (!buyer) {
        const data = await landingData().catch(() => null);
        return (
            <div className="stack reveal game-hub">
                <ViewPing event="view_game_hub" />
                <PlayLanding {...(data || {})} invite={ref} />
            </div>
        );
    }

    return (
        <div className="stack reveal game-hub">
            <ViewPing event="view_game_hub" />
            {buyer ? <RaidDefenseReport /> : null}
            {/* Unverified members only — it renders nothing for everyone else, off the shared nudge feed. */}
            {buyer ? <VerifyNudge /> : null}
            {/* ⚠️ NOT HERE ANY MORE. SpinNudge is a banner reading "You have 2 free spins waiting!" and the
                Ready Now rail two inches below it now says "2 spins ready" in a chip. Two of the same
                sentence stacked is how a page starts feeling like it is shouting. The nudge still appears
                on every OTHER page, which is where it was always doing the work. */}
            {/* ── THE HUB ── hero, what is ready this minute, then the doors. See PlayHub for why the old
                headline, the invite panel's position and the flat grid all had to go. */}
            <PlayHub name={me?.name || ""} avatar={me?.avatar_sprite_url || null} level={levelForXp(Number(me?.xp) || 0)?.level ?? null} />

            {/* ⚠️ LAST, NOT SECOND. Inviting a friend is a thing you do ONCE, and it was holding the slot
                directly under the title on every visit for the rest of your life. */}
            {alias ? <ReferralInvite alias={alias} referrerGold={REF_REFERRER_GOLD} joinerGold={REF_JOINER_GOLD} /> : null}

            {owner ? (
            <div className="game-hub-grid">
                {/* Sprites here too — the owner tiles were the last two glyphs on the page. */}
                <Link href="/marketplace/grove" className="game-tile tone-pets">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <span className="game-tile-emoji" aria-hidden="true"><img src="/images/nav/farm.png" alt="" width={30} height={30} style={{ display: "block", objectFit: "contain" }} /></span>
                    <span className="game-tile-title">The Grove <span className="muted" style={{ fontSize: "0.7em" }}>· owner</span></span>
                    <span className="game-tile-desc">Seven maps of it, behind the preview flag.</span>
                </Link>
                <Link href="/marketplace/cards" className="game-tile tone-sets">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <span className="game-tile-emoji" aria-hidden="true"><img src="/images/nav/cards.png" alt="" width={30} height={30} style={{ display: "block", objectFit: "contain" }} /></span>
                    <span className="game-tile-title">Card Game <span className="muted" style={{ fontSize: "0.7em" }}>· owner</span></span>
                    <span className="game-tile-desc">The deck-building run and its four acts.</span>
                </Link>
            </div>
            ) : null}
        </div>
    );
}
