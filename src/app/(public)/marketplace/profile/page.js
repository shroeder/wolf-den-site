import MarketplaceProfileClient from "@/components/MarketplaceProfileClient";

export const metadata = {
    title: "Your Profile | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

export default function ProfileSettingsPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <MarketplaceProfileClient />
            </section>
        </div>
    );
}
