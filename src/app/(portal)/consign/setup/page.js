import { Suspense } from "react";
import ConsignmentSetupClient from "@/components/ConsignmentSetupClient";

export const metadata = {
    title: "Set Up Portal | Consignment",
    robots: {
        index: false,
        follow: false,
    },
};

export default function SetupPage() {
    return (
        <Suspense fallback={<div className="consignment-portal"><p>Loading setup...</p></div>}>
            <ConsignmentSetupClient />
        </Suspense>
    );
}
