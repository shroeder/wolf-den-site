import MarketplaceApplyClient from "@/components/MarketplaceApplyClient";

export const metadata = {
    title: "Become a Vendor | Wolf Den Marketplace",
    description:
        "Apply to sell your sealed product and singles on The Wolf Den Vendor Marketplace. Vendors are hand-vetted; tell us about your business and we'll be in touch.",
    alternates: {
        canonical: "/marketplace/apply",
    },
};

export default function MarketplaceApplyPage() {
    return <MarketplaceApplyClient />;
}
