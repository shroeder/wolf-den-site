import { notFound } from "next/navigation";

import GearLab from "@/components/GearLab";

// DEV ONLY, same allow-list as the other labs. The gear screen is signed-in and sits behind a queue of launch
// modals, so it cannot be looked at without an account — which is exactly why its stat lines went unchecked.
export const dynamic = "force-dynamic";
export const metadata = { title: "Gear Lab", robots: { index: false, follow: false } };

export default function GearLabPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <GearLab />;
}
