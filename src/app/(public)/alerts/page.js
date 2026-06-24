import { Suspense } from "react";

import ProductAlertsSignupClient from "@/components/ProductAlertsSignupClient";

export const metadata = {
    title: "New-Arrival Alerts | The Wolf Den",
    description:
        "Get an email when new products land at The Wolf Den in Montgomery, MN. Pick the categories you care about — Pokemon, Magic: The Gathering, sealed product, supplies and more — and we'll alert you when new stock or restocks come in.",
    keywords: [
        "new arrivals alerts",
        "card shop mailing list",
        "Pokemon restock alerts",
        "Magic the Gathering new stock",
        "Montgomery MN game store",
        "new product email alerts",
    ],
    alternates: {
        canonical: "/alerts",
    },
};

export default function AlertsPage() {
    return (
        <Suspense fallback={null}>
            <ProductAlertsSignupClient />
        </Suspense>
    );
}
