import Image from "next/image";
import Link from "next/link";

import SellInquiryForm from "@/components/SellInquiryForm";

export const metadata = {
    title: "Sell Pokemon & Magic Cards",
    description:
        "Sell Pokemon cards, Magic: The Gathering cards, and select collectibles at The Wolf Den in Montgomery, MN. Get cash offers or store credit for singles, decks, and collections.",
    alternates: {
        canonical: "/sell-cards",
    },
};

export default function SellCardsPage() {
    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Sell or Trade Cards</h1>
                <p>
                    The Wolf Den buys Pokemon cards, Magic: The Gathering cards, and select collectibles in Montgomery, Minnesota.
                </p>
                <p>
                    If you have singles, decks, sealed product, or a larger collection, we offer local evaluation with payout options in cash or higher-value store credit.
                </p>
                <div className="cta-row">
                    <a className="button primary" href="#sell-form">
                        Sell or Consign to Us
                    </a>
                    <a className="button" href="tel:+17014090782">
                        Call Store
                    </a>
                </div>
            </section>

            <section className="card" id="sell-form">
                <h2>Tell us what you have</h2>
                <p className="muted">
                    Send us the cards or collection you&apos;d like to sell or consign and we&apos;ll email you back. No
                    obligation — even if we can&apos;t buy it outright, we can often help you move it.
                </p>
                <SellInquiryForm />
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>What We Are Buying</h2>
                    <ul>
                        <li>Pokemon singles and select sealed product</li>
                        <li>Magic staples, Commander cards, and decks</li>
                        <li>Select graded cards and premium collectibles</li>
                        <li>Small collections and larger trade-in opportunities</li>
                    </ul>
                </article>
                <article className="card">
                    <h2>Payout Options</h2>
                    <ul>
                        <li>Cash offer</li>
                        <li>Higher-value store credit</li>
                        <li>Trade-in toward sealed product or accessories</li>
                    </ul>
                </article>
            </section>

            <section className="grid two-col">
                <article className="card lift">
                    <h2>In-Store Singles Inventory</h2>
                    <Image
                        src="/images/magic-singles-case-the-wolf-den-montgomery-mn.jpg"
                        alt="Magic and trading card singles display case used for local buylist and trade-ins at The Wolf Den"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 48vw"
                        className="content-photo"
                    />
                </article>
                <article className="card">
                    <h2>Why Sell Locally?</h2>
                    <p>
                        Selling locally is often simpler than shipping cards out, waiting on marketplace payouts, or splitting cards across multiple buyers. The Wolf Den gives southern Minnesota players a nearby option for turning collections into cash, store credit, or new product.
                    </p>
                    <p>
                        We are especially interested in inventory that helps grow the local community and strengthen the store&apos;s singles selection over time.
                    </p>
                </article>
            </section>

            <section className="card">
                <h2>How It Works</h2>
                <ol>
                    <li>Bring cards in during business hours or contact the store first for larger collections.</li>
                    <li>We review condition, demand, and current market data.</li>
                    <li>Receive an offer in cash or higher-value store credit.</li>
                </ol>
                <p className="muted">For larger collections, a short message or photo list ahead of time helps speed up the process.</p>
            </section>

            <section className="card">
                <h2>Serving Southern Minnesota Sellers</h2>
                <p>
                    The Wolf Den is a local option for sellers in Montgomery, New Prague, Lonsdale, Faribault, Northfield, Jordan, Le Sueur, Belle Plaine, and nearby southern Minnesota communities who want to sell Pokemon cards, Magic cards, or collections without a long drive.
                </p>
                <div className="cta-row">
                    <Link className="button primary" href="/contact">
                        Contact The Store
                    </Link>
                    <a className="button" href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                        Join Discord
                    </a>
                </div>
            </section>
        </div>
    );
}
