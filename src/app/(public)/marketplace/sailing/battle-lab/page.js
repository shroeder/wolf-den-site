import { notFound } from "next/navigation";

import BattleLab from "@/components/BattleLab";

// DEV ONLY — same contract as the Arena and Boards labs: an allow-list on NODE_ENV, so this is a 404 in
// production and in any build that is not a real dev server. It exists because a ship battle costs one of
// three daily sorties and can only show the matchup your own gun deck happens to produce, which is no way to
// judge whether a broadside reads, whether a miss looks like a miss, or whether the sinking lands.
export const dynamic = "force-dynamic";
export const metadata = { title: "Ship Battle Lab", robots: { index: false, follow: false } };

export default function BattleLabPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <BattleLab />;
}
