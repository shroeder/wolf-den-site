import MarketplaceWantsClient from "@/components/MarketplaceWantsClient";

export const metadata = {
    title: "Your Want List | Wolf Den Marketplace",
    description:
        "Tell local vendors what cards and sealed product you're looking for. When a vendor lists something on your want list, you get an email — no hunting required.",
    alternates: {
        canonical: "/marketplace/wants",
    },
};

export default function MarketplaceWantsPage() {
    return <MarketplaceWantsClient />;
}
