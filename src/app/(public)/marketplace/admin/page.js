import AdminLoginClient from "@/components/AdminLoginClient";
import MarketplaceAdminClient from "@/components/MarketplaceAdminClient";
import { getAdminWebSession, getMarketplaceAdmin } from "@/lib/admin-app/web-session";
import { listApplications } from "@/lib/marketplace/applications.js";
import { listVendorsForAdmin } from "@/lib/marketplace/vendors.js";

export const metadata = {
    title: "Marketplace Admin | The Wolf Den",
    robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MarketplaceAdminPage() {
    const admin = await getMarketplaceAdmin();

    if (!admin) {
        // Distinguish "not signed in" from "signed in but lacks marketplace.manage".
        const session = await getAdminWebSession();
        return <AdminLoginClient noAccessName={session ? session.user.displayName : null} />;
    }

    const [applications, vendors] = await Promise.all([listApplications(), listVendorsForAdmin()]);

    return <MarketplaceAdminClient admin={admin.user} applications={applications} vendors={vendors} />;
}
