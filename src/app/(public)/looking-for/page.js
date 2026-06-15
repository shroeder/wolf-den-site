import { Suspense } from "react";

import LookingForClient from "@/components/LookingForClient";

export const metadata = {
    title: "Looking For a Card? | The Wolf Den",
    description:
        "Search The Wolf Den's Magic: The Gathering and Pokemon catalog, build a wishlist of cards you're looking for, and get an email when they come into our Montgomery, MN shop.",
    keywords: [
        "card want list",
        "looking for cards",
        "Pokemon card wishlist",
        "Magic the Gathering wishlist",
        "find Pokemon cards Montgomery MN",
        "MTG singles request",
        "card shop near me",
    ],
    alternates: {
        canonical: "/looking-for",
    },
};

export default function LookingForPage() {
    return (
        <Suspense fallback={null}>
            <LookingForClient />
        </Suspense>
    );
}
