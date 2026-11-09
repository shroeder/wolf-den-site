import DenQuest from "@/components/denquest/DenQuest.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { denQuestOpen } from "@/lib/marketplace/owner.js";

// ── DEN QUEST, ON ITS OWN DOMAIN ─────────────────────────────────────────────────────────────────────────────
// denquestonline.com/ rewrites here (see next.config.mjs). Same deployment, same accounts, its own front door.
//
// ⚠️ SIGNED OUT IS A DOOR, NOT AN ERROR. This origin cannot see the Wolf Den session cookie -- that is a
// browser rule, not a bug -- so the sign-in link goes to the handoff on the domain that CAN see it, which
// bounces straight back here with a session of its own. See lib/marketplace/denquest-handoff.js.
export const dynamic = "force-dynamic";
export const metadata = {
    title: "Den Quest",
    description: "A small online world, played with your Wolf Den account.",
    robots: { index: false, follow: false },
};

const HANDOFF = "https://www.wolfdengamingmn.com/api/denquest/handoff";

export default async function DenQuestHome() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);

    if (!buyer || !denQuestOpen(buyer.id)) {
        return (
            <div className="stack">
                <h1 style={{ marginBottom: 2 }}>Den Quest</h1>
                <p className="muted" style={{ marginTop: 0, maxWidth: "58ch" }}>
                    A small online world. Play it with your Wolf Den account — the same one you use for the
                    shop and the marketplace. There is no separate sign-up.
                </p>
                <p><a className="pill" href={HANDOFF}>Sign in with your Wolf Den account</a></p>
            </div>
        );
    }

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
