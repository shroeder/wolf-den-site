import { notFound } from "next/navigation";

import GroveLab from "@/components/grove/GroveLab.js";

// ── DEV ONLY: THE GROVE SCENE, DRIVABLE ──────────────────────────────────────────────────────────────────────
// Same rule and reason as the Arena, Casino and Farm labs: every other build 404s.
//
// ⚠️ THIS EXISTS BECAUSE GAME FEEL CANNOT BE REVIEWED ANY OTHER WAY. Luke: "I want you to iterate autonomously
// without me as a game developer and really think about how you can make this feel like a real video game."
// Hit-stop, knockback, a health bar's chase lerp, a loot arc — none of them are visible in a still, and the
// only other way to see one is to walk a real account into a real zone on the live database and hope the thing
// you are tuning happens. That is how the spin and the float survived: nobody had watched the first 400ms of a
// spawn frame by frame.
//
// So the scene mounts here against a fixture, with every moment worth judging reachable as a URL, and
// scripts/film.mjs photographs it. See visual-feature-film-rig.
export const dynamic = "force-dynamic";
export const metadata = { title: "Grove Lab", robots: { index: false, follow: false } };

export default async function Page({ searchParams }) {
    if (process.env.NODE_ENV !== "development") notFound();
    const sp = await searchParams;
    return <GroveLab scene={String(sp?.scene || "wander")} zoneN={Number(sp?.zone) || 1} />;
}
