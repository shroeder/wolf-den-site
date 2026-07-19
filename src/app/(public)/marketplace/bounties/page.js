import BountyBoardClient from "@/components/BountyBoardClient";
import ViewPing from "@/components/ViewPing";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Bounty Board | The Wolf Den",
    description: "Post a bounty, attach your gold, and let the community help — learn a game, find a card, get a trade, and more. Fulfilled in the real world.",
    alternates: { canonical: "/marketplace/bounties" },
};

export default function BountiesPage() {
    return (
        <>
            <ViewPing event="view_bounties" />
            <BountyBoardClient />
        </>
    );
}
