import MarketplaceLoginClient from "@/components/MarketplaceLoginClient";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Sign in | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

export default function MarketplaceLoginPage() {
    return <MarketplaceLoginClient redirectTo="/marketplace/messages" />;
}
