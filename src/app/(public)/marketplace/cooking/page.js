import { redirect } from "next/navigation";

import CookingClient from "@/components/CookingClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getKitchenState } from "@/lib/marketplace/cooking.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "The Kitchen | The Wolf Den",
    description: "Cook what you farm and what you catch.",
};

export default async function CookingPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) redirect("/marketplace/login?returnTo=/marketplace/cooking");

    const state = await getKitchenState(buyer.id);
    // The one gate the whole feature reads (COOK_UNLOCKED). Now open to every signed-in member; a signed-out
    // visitor is bounced to the town rather than shown an empty kitchen.
    if (!state?.unlocked) redirect("/marketplace/town");

    return <CookingClient initial={state} />;
}
