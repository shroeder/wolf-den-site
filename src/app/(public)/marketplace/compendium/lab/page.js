import { notFound } from "next/navigation";

import CompendiumLab from "@/components/CompendiumLab";

// ── DEV ONLY ─────────────────────────────────────────────────────────────────────────────────────────────────
// Same rule as the Arena lab, for the same reason: this mounts the real screen against fixture state with a
// stubbed API, and on the live site it would be an unauthenticated page rendering a collection that is not
// yours. Allow-list, not deny-list — only a real dev server renders it, and every other build 404s, including
// a preview or a plain `next start` with NODE_ENV unset.
export const dynamic = "force-dynamic";
export const metadata = { title: "Compendium Lab", robots: { index: false, follow: false } };

export default function CompendiumLabPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <CompendiumLab />;
}
