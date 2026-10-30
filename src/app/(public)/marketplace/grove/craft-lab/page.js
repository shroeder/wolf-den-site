import { notFound } from "next/navigation";

import GroveCraftLab from "@/components/grove/GroveCraftLab.js";

// ── DEV ONLY: THE CRAFT ACT, DRIVABLE ────────────────────────────────────────────────────────────────────────
// Same rule and reason as the Grove scene lab next door: every other build 404s.
//
// The act is three timed beats and a reveal, and none of them can be judged from a still or reached without a
// real session, real parts and an affordable recipe. It shipped once without ever being watched; this is so
// that cannot happen to it twice. See scripts/film.mjs.
export const dynamic = "force-dynamic";
export const metadata = { title: "Grove Craft Lab", robots: { index: false, follow: false } };

export default async function Page({ searchParams }) {
    if (process.env.NODE_ENV !== "development") notFound();
    const sp = await searchParams;
    return (
        <GroveCraftLab
            level={Number(sp?.level) || 12}
            temper={sp?.temper === "1"}
            seed={Number(sp?.seed) || 7}
            games={sp?.games || ""}
            rack={sp?.rack === "1"}
        />
    );
}
