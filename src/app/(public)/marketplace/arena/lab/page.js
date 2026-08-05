import { notFound } from "next/navigation";

import ArenaLab from "@/components/arena/ArenaLab";

// ── DEV ONLY ─────────────────────────────────────────────────────────────────────────────────────────────────
// A 404 in production, checked at the top of the only entry point. The lab mounts the real ArenaClient against
// fixture state with a stubbed API — useful for building the fight, and something that must never be reachable
// on the live site, where it would be an unauthenticated page that renders another member's screen.
export const dynamic = "force-dynamic";
export const metadata = { title: "Arena Lab", robots: { index: false, follow: false } };

export default function ArenaLabPage() {
    // Allow-list, not deny-list. Testing for "is production" leaves the lab reachable in any build whose
    // NODE_ENV is something else — a preview, a test harness, a plain `next start` with the variable unset.
    // Only a real dev server renders it; everything else is a 404.
    if (process.env.NODE_ENV !== "development") notFound();
    return <ArenaLab />;
}
