import Image from "next/image";
import Link from "next/link";

export const metadata = {
    title: "Local TCG Community",
    description:
        "Join The Wolf Den community in Montgomery, MN for local Pokemon and Magic play, Discord updates, trade nights, and a welcoming southern Minnesota trading card scene.",
    alternates: {
        canonical: "/community",
    },
};

export default function CommunityPage() {
    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Community</h1>
                <p>
                    The Wolf Den is being built around fair play, welcoming tables, local connections, and a healthy trading card community for southern Minnesota.
                </p>
                <p>
                    Whether you play Pokemon, Magic: The Gathering, or are just getting started in the hobby, the goal is to create a local store where people can show up, feel comfortable, and keep coming back.
                </p>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>Connect With The Community</h2>
                    <ul>
                        <li>
                            <a href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                                Join Discord
                            </a>
                        </li>
                        <li>
                            <a href="https://www.facebook.com/WolfDenGamesMN" target="_blank" rel="noreferrer">
                                Follow on Facebook
                            </a>
                        </li>
                        <li>
                            Weekly Friday Magic community nights
                        </li>
                        <li>Weekly Saturday Pokemon community days</li>
                        <li>Trade conversations and release updates</li>
                    </ul>
                    <p>
                        Discord is the best place for event updates, local discussion, inventory announcements, and future tournament news.
                    </p>
                </article>
                <article className="card">
                    <h2>Store Expectations</h2>
                    <ul>
                        <li>Respect opponents, staff, and shared space.</li>
                        <li>Keep language and behavior family-friendly.</li>
                        <li>Ask staff if you are unsure about rulings or etiquette.</li>
                        <li>Help new players feel welcome at the table.</li>
                    </ul>
                </article>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>What Community Means Here</h2>
                    <p>
                        Right now the focus is not on big, polished tournament infrastructure. It is on helping local players meet each other, trade cards, learn games, and establish a real local scene that can grow over time.
                    </p>
                    <p>
                        That means casual play, conversation, beginner support, and consistency. As the player base grows, event offerings will grow with it.
                    </p>
                </article>
                <article className="card">
                    <h2>Who Is Welcome</h2>
                    <ul>
                        <li>New players learning Pokemon or Magic</li>
                        <li>Collectors looking for local hobby community</li>
                        <li>Commander groups and casual MTG players</li>
                        <li>Families and younger Pokemon fans</li>
                        <li>Returning players getting back into the hobby</li>
                    </ul>
                </article>
            </section>

            <section className="grid two-col">
                <article className="card lift">
                    <h2>At The Tables</h2>
                    <Image
                        src="/images/people_hanging.jpg"
                        alt="Players hanging out and playing cards together at The Wolf Den tables"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 48vw"
                        className="content-photo"
                    />
                    <p className="muted">The kind of local play environment we are building every week.</p>
                </article>
                <article className="card">
                    <h2>Why This Matters</h2>
                    <p>
                        A healthy local scene starts with people having a comfortable place to sit down, play, learn, and talk cards. This is the environment we want to keep growing at The Wolf Den.
                    </p>
                    <p>
                        If you are brand new, you do not need to know everyone already. Show up, introduce yourself, and we will help you find a table.
                    </p>
                </article>
            </section>

            <section className="card">
                <h2>Serving Southern Minnesota</h2>
                <p>
                    The Wolf Den is building community for Montgomery, New Prague, Lonsdale, Faribault, Northfield, Jordan, Le Sueur, Belle Plaine, and surrounding southern Minnesota communities that want a stronger local TCG scene.
                </p>
                <div className="cta-row">
                    <a className="button primary" href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                        Join Discord
                    </a>
                    <Link className="button" href="/events">
                        View Weekly Events
                    </Link>
                </div>
            </section>
        </div>
    );
}
