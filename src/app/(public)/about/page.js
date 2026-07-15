import Link from "next/link";

const ADDRESS = "300 1st St S, Montgomery, MN 56069";
const MAPS_URL = "https://www.google.com/maps/search/?api=1&query=300+1st+St+S+Montgomery+MN+56069";
const DISCORD_URL = "https://discord.gg/Pad8U2KVsD";
const FACEBOOK_URL = "https://www.facebook.com/WolfDenGamesMN";
const PHONE = "(701) 409-0782";
const PHONE_TEL = "+17014090782";
const EMAIL = "luke@wolfdengamingmn.com";

const TOWNS = "Montgomery, New Prague, Lonsdale, Faribault, Northfield, Jordan, Le Sueur, Belle Plaine";

const FAQS = [
    { q: "Where is The Wolf Den located?", a: `${ADDRESS} — a real storefront in downtown Montgomery.` },
    { q: "What are your hours?", a: "Open 7 days a week, daily 12–6 PM, with Thursday and Friday until 7 PM." },
    { q: "Do you sell Pokémon cards?", a: "Yes — Elite Trainer Boxes, booster boxes and bundles, sleeved boosters, Pokémon Center products, singles, and accessories." },
    { q: "Do you sell Magic: The Gathering?", a: "Yes — play boosters, collector products, Commander decks, bundles and prerelease kits, singles, sealed, and accessories." },
    { q: "Do you buy or trade cards?", a: "Yes — cash or store credit on qualifying Pokémon, Magic, and select collectibles. Bring them in or ask us." },
    { q: "Do you host events?", a: "Yes — Thursday Kids Card Club (4–7 PM), Friday Commander Night (4–7 PM), and Saturday Pokémon community play (12–6 PM)." },
    { q: "Are events beginner friendly?", a: "Absolutely. Our play is casual and welcoming — no tournament experience needed, and staff are happy to teach." },
    { q: "Can kids play at The Wolf Den?", a: "Yes. We keep family-friendly tables and love helping new and younger players learn the ropes." },
    { q: "Do I need to be competitive to show up?", a: "Not at all — most of what we run is casual Commander and community play." },
    { q: "Do you offer local pickup?", a: "Yes — order online and pick it up in store." },
    { q: "How do I get inventory and event updates?", a: "Join our Discord (and follow us on Facebook), or turn on New-Arrival Alerts on the site." },
    { q: "What areas do you serve?", a: `${TOWNS}, and the surrounding southern Minnesota communities.` },
];

export const metadata = {
    title: "About The Wolf Den — Pokémon, Magic & Local Play in Montgomery, MN",
    description:
        "Locally owned trading card game store in Montgomery, Minnesota. Pokémon and Magic: The Gathering singles, sealed product, and accessories, weekly community play, trade-ins, and new-player help — serving New Prague, Faribault, Northfield, Lonsdale, and southern Minnesota.",
    keywords: [
        "Pokemon cards Montgomery MN",
        "Magic The Gathering Montgomery MN",
        "trading card game store southern Minnesota",
        "card shop near me",
        "game store near me",
        "pokemon singles",
        "pokemon sealed product",
        "MTG singles",
        "Friday Commander Night",
        "new prague pokemon cards",
        "faribault pokemon cards",
        "northfield pokemon cards",
        "new prague mtg",
        "local game store southern Minnesota",
    ],
    alternates: { canonical: "/about" },
};

function faqJsonLd() {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
    };
}

export default function AboutPage() {
    return (
        <div className="stack reveal about-page">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }} />

            <section className="card hero-accent" id="top">
                <h1>The Wolf Den</h1>
                <p className="lead">
                    A locally owned trading card game store in <strong>Montgomery, Minnesota</strong> — Pokémon and Magic:
                    The Gathering, sealed and singles, weekly community play, and trade-ins. A real local option for players,
                    collectors, and families across southern Minnesota, without the drive into the cities.
                </p>
                <div className="cta-row">
                    <Link href="/shop" className="button primary">Shop Inventory</Link>
                    <Link href="/events" className="button">View Events</Link>
                    <a href={MAPS_URL} className="button" target="_blank" rel="noreferrer">Get Directions</a>
                    <a href={DISCORD_URL} className="button" target="_blank" rel="noreferrer">Join Discord</a>
                </div>
            </section>

            <section className="card" id="games">
                <h2>What We Carry</h2>
                <div className="grid two-col about-games">
                    <article>
                        <h3>🔴 Pokémon TCG</h3>
                        <p>
                            Elite Trainer Boxes, booster boxes and bundles, sleeved boosters and premium collections, Pokémon
                            Center products, plus singles, sleeves, binders, and deck boxes. Rotating stock of current
                            expansions.
                        </p>
                        <Link href="/shop" className="text-link">Shop Pokémon →</Link>
                    </article>
                    <article>
                        <h3>⚫ Magic: The Gathering</h3>
                        <p>
                            Play booster boxes, collector products, Commander decks, bundles and prerelease kits, singles, and
                            sealed — focused on current releases and Commander. Sleeves and accessories too.
                        </p>
                        <Link href="/shop" className="text-link">Shop Magic →</Link>
                    </article>
                </div>
                <p className="secondary about-trade">
                    We also <strong>buy and trade</strong> — cash or store credit on qualifying Pokémon, Magic, and select
                    collectibles. <Link href="/sell-cards" className="text-link">Sell or trade your cards →</Link>
                </p>
            </section>

            <section className="card" id="community">
                <h2>Weekly Play &amp; Community</h2>
                <p>
                    The Wolf Den is built to be a gathering place, not just a shelf. Casual, welcoming tables — new players
                    always welcome.
                </p>
                <ul className="about-events">
                    <li><strong>Thursday · Kids Card Club</strong> — 4–7 PM</li>
                    <li><strong>Friday · Commander Night</strong> — 4–7 PM casual Commander, trading, learn-to-play</li>
                    <li><strong>Saturday · Pokémon Community</strong> — 12–6 PM</li>
                </ul>
                <div className="cta-row">
                    <a href={DISCORD_URL} className="button primary" target="_blank" rel="noreferrer">Join Discord</a>
                    <a href={FACEBOOK_URL} className="button" target="_blank" rel="noreferrer">Follow on Facebook</a>
                    <Link href="/events" className="button">All Events</Link>
                </div>
            </section>

            <section className="card" id="new-players">
                <h2>New to the Hobby?</h2>
                <p>
                    Beginners, parents, and families are exactly who this store is for. Start small — a starter product,
                    sleeves, a deck box, a binder — and ask us anything before you overspend. Commander and casual Pokémon
                    are the easiest ways in, and you never need tournament experience to sit down and play.
                </p>
                <div className="cta-row">
                    <Link href="/events" className="button primary">Come to a Community Night</Link>
                    <Link href="/shop" className="button">Browse Starter Product</Link>
                </div>
            </section>

            <section className="card" id="visit">
                <h2>Visit Us</h2>
                <div className="grid two-col about-visit">
                    <div>
                        <p><strong>Address</strong><br />{ADDRESS}</p>
                        <p><strong>Hours</strong><br />Daily 12–6 PM · Thursday &amp; Friday until 7 PM</p>
                    </div>
                    <div>
                        <p><strong>Phone</strong><br /><a href={`tel:${PHONE_TEL}`} className="text-link">{PHONE}</a></p>
                        <p><strong>Email</strong><br /><a href={`mailto:${EMAIL}`} className="text-link">{EMAIL}</a></p>
                    </div>
                </div>
                <p className="secondary">
                    Serving {TOWNS}, and nearby southern Minnesota.
                </p>
                <div className="cta-row">
                    <a href={MAPS_URL} className="button primary" target="_blank" rel="noreferrer">Get Directions</a>
                </div>
            </section>

            <section className="card" id="faq">
                <h2>FAQ</h2>
                <dl className="about-faq">
                    {FAQS.map((f) => (
                        <div key={f.q} className="about-faq-item">
                            <dt>{f.q}</dt>
                            <dd>{f.a}</dd>
                        </div>
                    ))}
                </dl>
            </section>

            <section className="card" id="contact">
                <h2>Contact Us</h2>
                <p>Questions about inventory, events, trade-ins, or getting started? The fastest ways to reach us:</p>
                <div className="cta-row">
                    <a href={`tel:${PHONE_TEL}`} className="button primary">Call {PHONE}</a>
                    <a href={`mailto:${EMAIL}`} className="button">Email Us</a>
                    <a href={DISCORD_URL} className="button" target="_blank" rel="noreferrer">Ask on Discord</a>
                    <a href={MAPS_URL} className="button" target="_blank" rel="noreferrer">Get Directions</a>
                </div>
            </section>
        </div>
    );
}
