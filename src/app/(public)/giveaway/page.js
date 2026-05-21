import Link from "next/link";

import GiveawayWheelClient from "@/components/GiveawayWheelClient";

export const metadata = {
    title: "Giveaway Wheel",
    description: "Spin for random in-store discounts and bonus dollar amounts at The Wolf Den.",
    robots: {
        index: false,
        follow: false,
    },
    alternates: {
        canonical: "/giveaway",
    },
};

export default function GiveawayPage() {
    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Wolf Den Giveaway Wheel</h1>
                <p>Welcome to the hidden page. Spin to reveal a random in-store reward.</p>
                <p className="secondary">No online checkout required. Rewards are redeemed in-store with staff.</p>
            </section>

            <GiveawayWheelClient />

            <section className="card">
                <h2>Rules</h2>
                <ul>
                    <li>Rewards are for in-store use only.</li>
                    <li>One reward redemption per transaction unless staff approves otherwise.</li>
                    <li>The Wolf Den may adjust prize amounts during special events.</li>
                </ul>
                <div className="cta-row">
                    <Link className="button" href="/shop">
                        Back to Shop Inventory
                    </Link>
                </div>
            </section>
        </div>
    );
}
