export const metadata = { title: "FAQ | Wolf Den Cards" };

const faqs = [
    ["Are you open yet?", "Soft opening is planned for May 2026."],
    ["Do you buy cards?", "Yes. We buy Pokemon, Magic, and select collectibles."],
    ["Do you host tournaments?", "Yes. Weekly and special events run year-round."],
    ["Do you sell Pokemon and Magic?", "Yes, both sealed and singles."],
    ["Can kids play here?", "Yes. Family-friendly tables are available."],
    ["Do you take trades?", "Yes, with in-store evaluation and policy terms."],
    ["Do you grade cards?", "We do not grade in-house; submission help may be offered later."],
    ["Do you sell online?", "Yes, launch storefront includes sealed/accessories and featured singles."],
    ["Do you offer local pickup?", "Yes, local pickup is available during business hours."],
];

export default function FaqPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <h1>FAQ</h1>
                <p>Quick answers for the most common store and event questions.</p>
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
        </div>
    );
}
