import { notFound } from "next/navigation";

import SkillTreeLab from "@/components/arena/SkillTreeLab";

// ── DEV ONLY: THE SKILL TREE, INCLUDING THE PREVIEW VIEW ─────────────────────────────────────────────────────
// Same gate and same reason as the Arena and Compendium labs. The tree's PREVIEW state — reading a discipline
// you are not — is only reachable by tapping a class switch inside the component, so it could not be looked at
// without a real arena account. That is the view that had thirteen rows of bare numbers stacked above it, and
// the view nobody had shot.
export const dynamic = "force-dynamic";
export const metadata = { title: "Skill Tree Lab", robots: { index: false, follow: false } };

export default function SkillTreeLabPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <SkillTreeLab />;
}
