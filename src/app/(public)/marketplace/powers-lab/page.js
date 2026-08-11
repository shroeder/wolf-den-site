import { notFound } from "next/navigation";

import PowersLab from "@/components/powers/PowersLab";

// ── DEV ONLY ─────────────────────────────────────────────────────────────────────────────────────────────────
// Same contract as the Arena and Boards labs: an allow-list on NODE_ENV, so this is a 404 in production and in
// any build that is not a real dev server.
//
// It exists because every control the ascension powers added is drawn ONLY for the member wearing one specific
// top-tier item, and no top-tier item is obtainable — they are all `source: "elite"`, which every drop pool
// excludes. Without this route there is no way to look at any of them, including as the owner.
export const dynamic = "force-dynamic";
export const metadata = { title: "Powers Lab", robots: { index: false, follow: false } };

export default function PowersLabPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <PowersLab />;
}
