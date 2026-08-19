import { notFound } from "next/navigation";

import FishLab from "@/components/FishLab";
import { FISH_MONSTERS } from "@/lib/marketplace/fishing.js";

// ── DEV ONLY ─────────────────────────────────────────────────────────────────────────────────────────────────
// Same contract as the Arena and Boards labs: an allow-list on NODE_ENV, so this is a 404 in production and in
// any build that is not a real dev server.
//
// It exists because the hand-off from a cast to a monster fight is the one moment in the feature that cannot be
// looked at without sailing out and hooking something — a tier-4 roll on a 12-cast-a-day budget. Everything it
// stubs is a network answer; the components, the timings and the CSS are the real ones.
export const dynamic = "force-dynamic";
export const metadata = { title: "Fishing Lab", robots: { index: false, follow: false } };

export default function FishLabPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    // The catalog comes down as a prop rather than being imported by the lab: fishing.js reaches db.js, which
    // is server-only, and a client component that imports it fails to compile. Handing it down keeps ONE list —
    // a copy pasted into the lab would drift from the real monsters the first time one is added.
    return <FishLab monsters={FISH_MONSTERS} />;
}
