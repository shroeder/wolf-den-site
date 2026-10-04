import ConsumableShelf from "@/components/ConsumableShelf";
import SpinWheel from "@/components/SpinWheel";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { halloweenOn } from "@/lib/marketplace/owner.js";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daily Spin · The Wolf Den" };

export default async function SpinPage() {
    // ── THE SAME ONE QUESTION EVERY DRESSED SCREEN ASKS ──────────────────────────────────────────────
    // halloweenOn, then the member's own town_halloween — the contract the town, the arena and the boss
    // screen already use. Resolved HERE rather than inside SpinWheel because the wheel renders its disc
    // immediately: a costume arriving a tick later would show the ordinary wheel and then swap, which is
    // the one thing a costume must never do.
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    // ⚠️ ONE QUESTION NOW. This used to be canDressUp() AND a `town_halloween` column read — two gates that
    // could disagree, which is how the plaza came to be decorated for a member who could not see the
    // Gourdfather standing in it. See halloweenOn in owner.js.
    const hw = halloweenOn(buyer?.id);
    const spooky = hw;

    // The wheel itself is painted for the season (wheel-disc-hw.webp / wheel-frame-hw.webp, static assets);
    // these two are the sky around it, borrowed from the town's own art. Fetched only when the flag is up,
    // so an ordinary spin costs no extra query.
    //
    // ⚠️ ASK FOR EXACTLY WHAT IS RENDERED. This used to also pull hw_pumpkin and hw_pumpkin_stack, which
    // SpinWheel stopped drawing when the wheel gained its own jack-o-lantern hub and crest — two rows read
    // on every dressed spin and handed to a component that ignores them.
    const art = spooky
        ? Object.fromEntries((await db
            .query(`SELECT art_key, url FROM mkt_town_art WHERE art_key IN ('hw_moon','hw_crow')`)
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
