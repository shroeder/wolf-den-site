import { notFound } from "next/navigation";

import FarmModalsLab from "@/components/FarmModalsLab";

// ── DEV ONLY: THE THREE FARM MODALS AGAINST FIXTURES ─────────────────────────────────────────────────────────
// Same rule and same reason as the Trophy Room and Arena labs: mount the REAL components with a hand-built
// payload so each one can be shot at 375x667 and at desktop width without an authenticated session.
//
// The farm needs its own lab more than most screens do, because the farm's fixture is a LIVE MEMBER'S FARM
// (kitchen-lab reads Sunflower Jinxx's for real). Every one of these three modals only appears after an action
// that WRITES — a harvest, a plant, a once-a-day claim — so the only way to see them on that rig is to spend
// somebody's crops and open somebody's daily box. This route is how they get looked at without touching a row.
export const dynamic = "force-dynamic";
export const metadata = { title: "Farm Modals Lab", robots: { index: false, follow: false } };

export default function Page() {
    if (process.env.NODE_ENV === "production") notFound();
    return <FarmModalsLab />;
}
