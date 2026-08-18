import { notFound } from "next/navigation";

import WaterLab from "@/components/WaterLab";

// DEV ONLY — same NODE_ENV allow-list as every other lab here. The fishing scene's phases are TIMED (a bite
// arrives when it arrives), so there is no way to look at the bite or the haul on a real cast without standing
// at the rail waiting for one. This drives the phases directly.
export const dynamic = "force-dynamic";
export const metadata = { title: "Water Lab", robots: { index: false, follow: false } };

export default function WaterLabPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <WaterLab />;
}
