import ConsumableShelf from "@/components/ConsumableShelf";
import SpinWheel from "@/components/SpinWheel";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { canDressUp } from "@/lib/marketplace/owner.js";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daily Spin · The Wolf Den" };

export default async function SpinPage() {
    // ── THE SAME ONE QUESTION EVERY DRESSED SCREEN ASKS ──────────────────────────────────────────────
    // canDressUp, then the member's own town_halloween — the contract the town, the arena and the boss
    // screen already use. Resolved HERE rather than inside SpinWheel because the wheel renders its disc
    // immediately: a costume arriving a tick later would show the ordinary wheel and then swap, which is
    // the one thing a costume must never do.
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const hw = buyer && canDressUp(buyer.id)
        ? await db.queryOne(`SELECT town_halloween FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null)
        : null;
    const spooky = Boolean(hw?.town_halloween);

    // The dressing is made of art the town already has — the moon, a crow, two pumpkins. Nothing new was
    // drawn for this. Fetched only when the flag is up so an ordinary spin costs no extra query.
    const art = spooky
        ? Object.fromEntries((await db
            .query(`SELECT art_key, url FROM mkt_town_art WHERE art_key IN ('hw_moon','hw_crow','hw_pumpkin','hw_pumpkin_stack')`)
            .catch(() => [])).map((r) => [r.art_key, r.url]))
        : {};

    return (
        <div className="stack reveal">
            <SpinWheel halloween={spooky} hwArt={art} />
            {/* Lucky Coin, Golden Ticket, Wheel Rewind — all of them buy spins of the wheel above. */}
            <ConsumableShelf feature="spin" title="Spins in your pack" />
        </div>
    );
}
