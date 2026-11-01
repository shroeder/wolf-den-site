import { notFound } from "next/navigation";

import GroveQuestLab from "@/components/grove/GroveQuestLab.js";

// ── DEV ONLY: THE WHOLE QUEST LOOP, BEAT BY BEAT ────────────────────────────────────────────────────────────
// Luke: "show me like the whole the player going through the quest and taking each quest chunk and getting
// rewards and selecting the next step and going back to the NPC and all that stuff."
//
// ⚠️ THAT ARC CANNOT BE PHOTOGRAPHED ON A REAL ACCOUNT. Every beat of it is gated behind play: a step only
// becomes claimable after forty kills, the next step only appears after the claim, and a finished chain needs
// all of them. Filming it live would mean grinding a map per screenshot. So the beats are fixtures, driven by
// ?beat=, and the panel under them is the REAL GroveQuests — the same component the game mounts.
//
// ⚠️ AND A LAB PROVES THE COMPONENT, NEVER THE WIRING. [[declared-but-never-mounted]]. This says what each
// beat LOOKS like; it says nothing about whether claimStep pays or the pip updates. Both still need the game.
//
//   /marketplace/grove/quest-lab?beat=1   fresh chain, nothing done
//   /marketplace/grove/quest-lab?beat=2   mid-step, the bar part full
//   /marketplace/grove/quest-lab?beat=3   ready to hand in
//   /marketplace/grove/quest-lab?beat=4   just claimed — what the hand-in says
//   /marketplace/grove/quest-lab?beat=5   next step live, and a finished chain beside it
export const dynamic = "force-dynamic";
export const metadata = { title: "Grove Quest Lab", robots: { index: false, follow: false } };

export default async function Page({ searchParams }) {
    if (process.env.NODE_ENV !== "development") notFound();
    const sp = await searchParams;
    return <GroveQuestLab beat={Number(sp?.beat) || 1} />;
}
