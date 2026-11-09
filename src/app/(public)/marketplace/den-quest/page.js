import Link from "next/link";
import { redirect } from "next/navigation";

import DenQuest from "@/components/denquest/DenQuest.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { denQuestOpen } from "@/lib/marketplace/owner.js";

// ── DEN QUEST ────────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THIS PAGE IS WHY THE CLIENT LIVES ON THIS DOMAIN. The browser only sends the session cookie to the host
// that issued it, so the ticket fetch inside the component only works from an origin the member is already
// signed in to. Served from denquestonline.com it would 401 for everyone, forever, and no amount of netcode
// would fix it. That domain becomes a front door that sends people here until a proper handoff is built.
//
// Not owner-gated: the whole point is friends on their own accounts. `denQuestOpen` is one switch in owner.js.
export const dynamic = "force-dynamic";
export const metadata = {
    title: "Den Quest | Wolf Den",
    robots: { index: false, follow: false },
};

export default async function DenQuestPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);

    // ⚠️ SIGNED OUT IS NOT AN ERROR HERE, IT IS A DOOR. Redirecting to /marketplace would bounce a friend who
    // followed a link straight out of the game with no idea why.
    if (!buyer) {
        return (
            <div className="stack">
                <h1 style={{ marginBottom: 2 }}>Den Quest</h1>
                <p className="muted" style={{ marginTop: 0, maxWidth: "60ch" }}>
                    Sign in with your Wolf Den account to play — the same one you use for the marketplace.
                    There is no separate account for Den Quest.
                </p>
                <p><Link className="pill" href="/marketplace">Sign in</Link></p>
            </div>
        );
    }
    if (!denQuestOpen(buyer.id)) redirect("/marketplace");

    return (
        <div className="stack">
            <h1 style={{ marginBottom: 2 }}>Den Quest</h1>
            <p className="muted" style={{ marginTop: 0, maxWidth: "62ch" }}>
                An early prototype, and a live one — everyone here is in the same world on the same server.
                Bring a friend and you will see each other move and fight in real time.
            </p>
            <DenQuest serverUrl={process.env.RT_PUBLIC_URL || "wss://den-quest-rt.fly.dev/ws"} />
        </div>
    );
}
