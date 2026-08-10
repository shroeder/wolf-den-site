import { notFound } from "next/navigation";

import PetEnshrineLab from "@/components/PetEnshrineLab";

// ── DEV ONLY ─────────────────────────────────────────────────────────────────────────────────────────────────
// A 404 in production, checked at the only entry point — same allow-list shape as the arena lab. Testing for
// "is production" would leave this reachable in any build whose NODE_ENV is something else.
export const dynamic = "force-dynamic";
export const metadata = { title: "Enshrine Lab", robots: { index: false, follow: false } };

export default function PetEnshrineLabPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <PetEnshrineLab />;
}
