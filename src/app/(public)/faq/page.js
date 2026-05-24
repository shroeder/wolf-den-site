import Link from "next/link";

export const metadata = {
    title: "Store FAQ",
    description:
        "Frequently asked questions about The Wolf Den in Montgomery, MN, including Pokemon cards, Magic: The Gathering, events, trade-ins, hours, and local pickup.",
    alternates: {
        canonical: "/faq",
    },
};

const faqs = [
    ["Where is The Wolf Den located?", "The Wolf Den is located at 300 1st St S, Montgomery, MN 56069."],
    ["What are your current store hours?", "Current hours are Thursday 4 PM to 7 PM, Friday 4 PM to 7 PM, and Saturday 12 PM to 6 PM."],
    ["Are you open yet?", "Yes. We are open and continuing to grow inventory, events, and community offerings."],
    ["Do you sell Pokemon cards?", "Yes. The Wolf Den carries Pokemon sealed product, singles, accessories, and beginner-friendly items."],
    ["Do you sell Magic: The Gathering?", "Yes. The store carries Magic sealed product, singles, accessories, and supports local community play."],
    ["Do you buy or trade cards?", "Yes. We buy and evaluate Pokemon, Magic, and select collectibles. Trade-ins may be accepted depending on condition and store needs."],
    ["Do you host events?", "Yes. Friday 4 PM to 7 PM is focused on Commander community play, and Saturday 12 PM to 6 PM is focused on Pokemon community events."],
    ["Are your events beginner friendly?", "Yes. The store is actively trying to build a welcoming environment for new players, returning players, families, and casual fans."],
    ["Can kids play at The Wolf Den?", "Yes. Pokemon-focused community time and family-friendly in-store expectations make the store welcoming for younger players and parents."],
    ["Do I need to be competitive to show up?", "No. Right now the focus is on community growth, casual play, learning, and helping people connect locally."],
    ["Do you offer local pickup?", "Yes. Local pickup is available during store hours in Montgomery."],
    ["How do I get inventory and event updates?", "Discord is the best place for store updates, inventory announcements, and weekly event information."],
    ["What areas do you serve?", "The Wolf Den serves Montgomery, New Prague, Lonsdale, Faribault, Northfield, Jordan, Le Sueur, Belle Plaine, and surrounding southern Minnesota communities."],
];

const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
            "@type": "Answer",
            text: answer,
        },
    })),
};

export default function FaqPage() {
    return (
        <div className="stack reveal">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
            />
            <section className="card hero-accent">
                <h1>FAQ</h1>
                <p>Quick answers for common questions about store hours, events, inventory, trade-ins, and visiting The Wolf Den in Montgomery, Minnesota.</p>
            </section>
            <section className="card">
                <div className="stack compact">
                    {faqs.map(([question, answer]) => (
                        <article key={question}>
                            <h2>{question}</h2>
                            <p>{answer}</p>
                        </article>
                    ))}
                </div>
            </section>
            <section className="card">
                <h2>Need Something More Specific?</h2>
                <p>
                    If you have a question about current inventory, a trade-in, event timing, or store policies, contact the store directly or join Discord for updates.
                </p>
                <div className="cta-row">
                    <Link className="button primary" href="/contact">
                        Contact The Store
                    </Link>
                    <Link className="button" href="/events">
                        View Events
                    </Link>
                    <a className="button" href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                        Join Discord
                    </a>
                </div>
            </section>
        </div>
    );
}
