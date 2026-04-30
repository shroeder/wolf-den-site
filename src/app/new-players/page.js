export const metadata = { title: "New Players & Parents | Wolf Den Cards" };

export default function NewPlayersPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <h1>New Players & Parents</h1>
                <p>Starting Pokemon or Magic can feel overwhelming. We make it easy and welcoming.</p>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>New to Pokemon?</h2>
                    <ul>
                        <li>Recommended beginner products in-stock</li>
                        <li>Simple breakdown of league nights</li>
                        <li>What to bring for first event</li>
                    </ul>
                </article>
                <article className="card">
                    <h2>Cost to Start</h2>
                    <ul>
                        <li>Casual setup: $20-$50</li>
                        <li>Event-ready setup: $60-$150</li>
                        <li>Borrower decks available on select nights</li>
                    </ul>
                </article>
            </section>

            <section className="card">
                <h2>Family-Friendly Notes</h2>
                <ul>
                    <li>Kid-friendly casual pods available.</li>
                    <li>Staff can help pair new players with similar experience levels.</li>
                    <li>Clear store code of conduct and tournament etiquette expectations.</li>
                </ul>
            </section>
        </div>
    );
}
