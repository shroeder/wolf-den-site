import { notFound } from "next/navigation";

import ForgeLab from "@/components/ForgeLab";

// ── DEV ONLY ─────────────────────────────────────────────────────────────────────────────────────────────────
// Same NODE_ENV allow-list as the other labs. The enhance reveal is two taps and a minigame deep and only
// appears after a successful forge, so it cannot be looked at deliberately — which is how it shipped for a
// week showing a weapon's own damage as though it were one more affix.
export const dynamic = "force-dynamic";
export const metadata = { title: "Forge Lab", robots: { index: false, follow: false } };

export default function ForgeLabPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <ForgeLab />;
}
