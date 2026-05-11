import Image from "next/image";
import Link from "next/link";

export const metadata = {
    title: "About Our Montgomery Game Store",
    description:
        "Learn about The Wolf Den, a locally owned trading card game store in Montgomery, Minnesota serving Pokemon and Magic players across southern Minnesota.",
    alternates: {
        canonical: "/about",
    },
};

export default function AboutPage() {
    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>About The Wolf Den</h1>
                <p>
                    The Wolf Den is a locally owned trading card game store in Montgomery, Minnesota focused on building a welcoming space for collectors, players, and families across southern Minnesota.
                </p>
                <p>
                    We want to give local communities a nearby option for Pokemon cards, Magic: The Gathering, accessories, and in-store play without always needing to drive into the cities.
                </p>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>Why The Store Exists</h2>
                    <p>
                        The goal is simple: make trading card games more accessible for people in Montgomery and the surrounding area. That means real shelf inventory, real community events, and a real place to gather around the games people already love.
                    </p>
                    <p>
                        The Wolf Den is being built around long-term community growth, not just one-time sales. We want the shop to become a trusted local place for releases, trade nights, casual play, and future organized events.
                    </p>
                </article>
                <article className="card">
                    <h2>Who We Serve</h2>
                    <ul>
                        <li>Collectors looking for sealed product and singles</li>
                        <li>Pokemon families and casual players</li>
                        <li>Commander players and local MTG groups</li>
                        <li>New players learning the hobby for the first time</li>
                        <li>Southern Minnesota communities that want a closer local game store</li>
                    </ul>
                </article>
            </section>

            <section className="grid two-col">
                <article className="card lift">
                    <h2>Inside The Wolf Den</h2>
                    <Image
                        src="/images/trading-card-store-interior-the-wolf-den-montgomery-mn.jpg"
                        alt="Interior of The Wolf Den in Montgomery, Minnesota showing card displays and local play space"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 48vw"
                        className="content-photo"
                    />
                </article>
                <article className="card lift">
                    <h2>Real Storefront Inventory</h2>
                    <Image
                        src="/images/local-game-store-interior-the-wolf-den-montgomery-mn.jpg"
                        alt="Wide interior view of The Wolf Den storefront with shelves, display cases, and counter area"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 48vw"
                        className="content-photo"
                    />
                </article>
            </section>

            <section className="card">
                <h2>Serving Southern Minnesota</h2>
                <p>
                    The Wolf Den serves Montgomery, New Prague, Lonsdale, Faribault, Northfield, Jordan, Le Sueur, Belle Plaine, and surrounding southern Minnesota communities.
                </p>
                <p>
                    We know many players have been underserved locally. The shop is meant to help shorten that drive and give the area a stronger local trading card community.
                </p>
            </section>

            <section className="card">
                <h2>Visit or Stay Connected</h2>
                <p>300 1st St S, Montgomery, MN 56069</p>
                <div className="cta-row">
                    <a className="button primary" href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                        Join Discord
                    </a>
                    <Link className="button" href="/events">
                        View Events
                    </Link>
                    <a
                        className="button"
                        href="https://www.google.com/maps/search/?api=1&query=300+1st+St+S,+Montgomery,+MN+56069"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Get Directions
                    </a>
                </div>
            </section>
        </div>
    );
}