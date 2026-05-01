export const metadata = {
    title: "Sell Your Cards",
    description: "Sell your Pokemon, Magic, and collectible cards at The Wolf Den in Montgomery, MN. We offer cash or store credit for singles and collections.",
};

export default function SellCardsPage() {
    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Sell or Trade Cards</h1>
                <p>We buy Pokemon, Magic, and select collectibles.</p>
                <a className="button primary" href="/contact">
                    Start a Buylist Request
                </a>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>What We Are Buying</h2>
                    <ul>
                        <li>Pokemon singles and sealed</li>
                        <li>Magic staples and decks</li>
                        <li>Select graded cards and premium collectibles</li>
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

            <section className="card">
                <h2>How It Works</h2>
                <ol>
                    <li>Bring cards in during business hours.</li>
                    <li>We review condition and market data.</li>
                    <li>Receive a same-day offer in cash or store credit.</li>
                </ol>
                <p className="muted">Optional upgrade: add upload form for photos/card lists to pre-qualify collections.</p>
            </section>
        </div>
    );
}
