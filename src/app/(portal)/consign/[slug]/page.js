import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import ConsignmentPortalClient from "@/components/ConsignmentPortalClient";
import { getPublicConsignorBySlug } from "@/lib/consignment/config";
import { CONSIGNMENT_SESSION_COOKIE, getAuthenticatedConsignorFromToken } from "@/lib/consignment/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
    const { slug } = await params;
    const consignor = await getPublicConsignorBySlug(slug);

    if (!consignor) {
        return {
            title: "Consignment Portal",
            robots: {
                index: false,
                follow: false,
            },
        };
    }

    return {
        title: `${consignor.displayName} Consignment Portal`,
        description: `Secure consignment dashboard for ${consignor.displayName}.`,
        robots: {
            index: false,
            follow: false,
        },
    };
}

export default async function ConsignmentPortalPage({ params }) {
    const { slug } = await params;
    const consignor = await getPublicConsignorBySlug(slug);

    if (!consignor) {
        notFound();
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(CONSIGNMENT_SESSION_COOKIE)?.value;
    const authenticatedConsignor = getAuthenticatedConsignorFromToken(token);
    const initialAuthenticated = authenticatedConsignor?.slug === consignor.slug;

    return (
        <ConsignmentPortalClient
            slug={consignor.slug}
            displayName={consignor.displayName}
            consignmentRate={consignor.consignmentRate}
            initialAuthenticated={initialAuthenticated}
        />
    );
}