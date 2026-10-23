import { notFound } from "next/navigation";

import GroveMusicLab from "@/components/grove/GroveMusicLab.js";

// ── DEV ONLY: EVERY ZONE'S MUSIC, ONE TAP AWAY ───────────────────────────────────────────────────────────────
// Same rule and reason as the Grove scene lab next door: every other build 404s.
//
// A bed cannot be reviewed in a screenshot, and it cannot be reviewed in the game either — hearing the Ashen
// Reach means grinding seven maps to it. So all hundred and forty-four are here with what each one is made of
// written beside it, plus the danger and boss states that are otherwise unreachable on demand.
export const dynamic = "force-dynamic";
export const metadata = { title: "Grove Music", robots: { index: false, follow: false } };

export default function Page() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <GroveMusicLab />;
}
