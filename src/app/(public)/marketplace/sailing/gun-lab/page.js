import { notFound } from "next/navigation";

import GunLab from "@/components/GunLab";

// DEV ONLY — same contract as the battle lab: a 404 anywhere that is not a real dev server.
//
// Every gun a ship owns is drawn on its deck now, and no two hulls put their gun deck in the same place. This
// is where those coordinates get decided by clicking on the boat rather than by guessing from a screenshot and
// redeploying to check — the loop that ate a morning on the crew's deck line. It writes nothing: it prints the
// table to paste into gun-ports.js, so the data lands in source where it can be reviewed.
export const dynamic = "force-dynamic";
export const metadata = { title: "Gun Placement Lab", robots: { index: false, follow: false } };

export default function GunLabPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <GunLab />;
}
