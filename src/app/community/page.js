export const metadata = {
    title: "Community",
    description: "Join The Wolf Den community in Montgomery, MN — Discord server, local events, and a welcoming trading card game scene.",
};

export default function CommunityPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <h1>Community</h1>
                <p>Our store is built around fair play, welcoming tables, and respectful competition.</p>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>Connect</h2>
                    <ul>
                        <li>
                            <a href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                                Join Discord
                            </a>
                        </li>
                        <li>
                            <a href="https://facebook.com" target="_blank" rel="noreferrer">
                                Follow on Facebook
                            </a>
                        </li>
                    </ul>
                </article>
                <article className="card">
                    <h2>Store Expectations</h2>
                    <ul>
                        <li>Respect opponents, staff, and shared space.</li>
                        <li>Keep language and behavior family-friendly.</li>
                        <li>Ask staff if you are unsure about rulings or etiquette.</li>
                    </ul>
                </article>
            </section>
        </div>
    );
}
