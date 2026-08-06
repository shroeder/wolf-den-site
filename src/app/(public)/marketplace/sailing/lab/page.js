import { notFound } from "next/navigation";

import BoardsLab from "@/components/BoardsLab";

// ── DEV ONLY ─────────────────────────────────────────────────────────────────────────────────────────────────
// Same contract as the Arena lab: an allow-list on NODE_ENV, so this is a 404 in production and in any build
// that isn't a real dev server. It exists because the screens it renders — the leaderboards and the collection
// panels — are signed-in, database-backed pages, and a layout bug in either is a thing you can only judge by
// LOOKING at it, at a phone width, with the site's own chrome around it.
export const dynamic = "force-dynamic";
export const metadata = { title: "Boards Lab", robots: { index: false, follow: false } };

export default function BoardsLabPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <BoardsLab />;
}
