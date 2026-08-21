import { notFound } from "next/navigation";

import SkillPanelLab from "@/components/arena/SkillPanelLab";

// ── DEV ONLY: THE SKILL PANEL ────────────────────────────────────────────────────────────────────────────────
// Same gate and same reason as the Arena and Skill Tree labs — an allow-list on NODE_ENV, checked at the only
// entry point, so a preview build or a plain `next start` is a 404 rather than an unauthenticated page
// rendering somebody's build screen.
//
// The panel's states are all behind a point balance: locked needs zero points, ready needs one, and the node
// list does not exist until a skill is owned. On a real account you can see one of those at a time and only by
// spending gold to get back to the others, which is exactly the kind of view that never gets looked at.
export const dynamic = "force-dynamic";
export const metadata = { title: "Skill Panel Lab", robots: { index: false, follow: false } };

export default function SkillPanelLabPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <SkillPanelLab />;
}
