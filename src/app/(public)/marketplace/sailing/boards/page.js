import { notFound } from "next/navigation";
import Link from "next/link";

import SailingBoards from "@/components/SailingBoards";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { sailingBoards } from "@/lib/marketplace/sailing.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Sailing Boards — The Wolf Den",
    description: "The Den's biggest boats and its most-decorated diggers.",
};

// The two leaderboards a member asked for in the survey: whose boat is the biggest, and who has dug the most
// out of the sand. Signed-in only — there is nothing here for a visitor with no boat.
export default async function SailingBoardsPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) return notFound();

    const { me, ...boards } = await sailingBoards(buyer.id);
    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0 }}>Sailing boards</h1>
                <p className="muted" style={{ marginTop: 0 }}>
                    The Den&rsquo;s biggest boats and its most-decorated diggers. Everyone who has ever sailed or
                    forged a chest is on here somewhere.
                </p>
                <Link href="/marketplace/sailing" className="pill">&larr; Back to the docks</Link>
            </section>
            <SailingBoards boards={boards} mePlace={me} />
        </div>
    );
}
