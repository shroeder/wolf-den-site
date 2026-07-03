import { Suspense } from "react";

import MarketplaceResetClient from "@/components/MarketplaceResetClient";

export const metadata = {
    title: "Reset password | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

export default function MarketplaceResetPage() {
    return (
        <div className="stack reveal">
            <Suspense fallback={null}>
                <MarketplaceResetClient />
            </Suspense>
        </div>
    );
}
