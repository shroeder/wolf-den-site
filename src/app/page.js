import Image from "next/image";
import Link from "next/link";

const categories = ["Pokemon", "Magic", "Singles", "Accessories", "Events"];

export default function HomePage() {
    return (
        <div className="stack reveal">
            <section className="hero card">
                <p className="eyebrow">Montgomery, Minnesota</p>
                <Image
                    className="hero-logo"
                    src="/logo/wolf-den-full-logo.png"
                    alt="Wolf Den Cards"
                    width={420}
                    height={280}
                    priority
                />
                <h1 className="sr-only">Wolf Den Cards</h1>
                <p className="lead">
                    Trading cards, singles, sealed product, accessories, and local play in Montgomery, MN.
                </p>
                <p>
                    <strong>Status:</strong> Soft opening in May 2026.
                </p>
                <div className="cta-row">
                    <a className="button primary" href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                        Join Discord
                    </a>
                    <Link className="button" href="/events">
                        View Events
                    </Link>
                    <Link className="button" href="/shop">
                        Get Opening Updates
                    </Link>
                </div>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>Hours & Location</h2>
                    <p>300 1st St S, Montgomery, MN 56069</p>
                    <ul>
                        <li>Thursday: 4:00 PM – 7:00 PM</li>
                        <li>Friday: 4:00 PM – 7:00 PM</li>
                        <li>Saturday: 12:00 PM – 6:00 PM</li>
                    </ul>
                    <a className="text-link" href="https://www.google.com/maps/search/?api=1&query=300+1st+St+S,+Montgomery,+MN+56069" target="_blank" rel="noreferrer">
                        Open Map
                    </a>
                </article>
                <article className="card">
                    <h2>Featured Categories</h2>
                    <div className="chips">
                        {categories.map((category) => (
                            <span key={category} className="chip">
                                {category}
                            </span>
                        ))}
                    </div>
                    <p className="muted">Storefront and interior photos can be dropped here once available.</p>
                </article>
            </section>

            <section className="grid three-col">
                <article className="card lift">
                    <h2>Shop Inventory</h2>
                    <p>Sealed product, accessories, and featured singles online at launch.</p>
                    <Link className="text-link" href="/shop">
                        Browse Shop
                    </Link>
                </article>
                <article className="card lift">
                    <h2>Events</h2>
                    <p>Weekly leagues, Friday tournaments, and beginner-friendly play nights.</p>
                    <Link className="text-link" href="/events">
                        See Calendar
                    </Link>
                </article>
                <article className="card lift">
                    <h2>We Buy Cards</h2>
                    <p>Cash or store credit for Pokemon, Magic, and select collectibles.</p>
                    <Link className="text-link" href="/sell-cards">
                        Sell Your Cards
                    </Link>
                </article>
            </section>
        </div>
    );
}
