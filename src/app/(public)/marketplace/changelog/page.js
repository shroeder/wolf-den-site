import ChangelogClient from "@/components/ChangelogClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getChangelog } from "@/lib/marketplace/changelog-server.js";
import { isOwner } from "@/lib/marketplace/owner.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "What's New | The Wolf Den",
    description: "Everything that's shipped lately — and who asked for it.",
};

export default async function ChangelogPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const owner = isOwner(buyer?.id);
    const entries = await getChangelog(owner).catch(() => []);
    return (
        <div className="stack reveal">
            <ChangelogClient entries={entries} owner={owner} />
        </div>
    );
}
