export const metadata = {
    title: "Contact & Store Hours",
    description:
        "Contact The Wolf Den in Montgomery, MN for store hours, directions, inventory questions, trade-in requests, and local event updates.",
    alternates: {
        canonical: "/contact",
    },
};

export default function ContactPage() {
    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Contact</h1>
                <p>
                    Contact The Wolf Den for store hours, directions, inventory questions, event questions, trade-in inquiries, and general store updates.
                </p>
                <p>
                    We are located in Montgomery, Minnesota and serve players and collectors across southern Minnesota.
                </p>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>Store Information</h2>
                    <ul>
                        <li>Email: luke@wolfdengamingmn.com</li>
                        <li>Phone: (701) 409-0782</li>
                        <li>Address: 300 1st St S, Montgomery, MN 56069</li>
                        <li>Thu 4–7pm, Fri 4–7pm, Sat 12–6pm, Sun 12–6pm</li>
                    </ul>
                    <p>
                        <strong>Best for:</strong> store questions, inventory checks, event timing, trade-in questions, vendor contact, and local pickup coordination.
                    </p>
                    <div className="cta-row">
                        <a className="button primary" href="tel:+17014090782">
                            Call Store
                        </a>
                        <a
                            className="button"
                            href="https://www.google.com/maps/search/?api=1&query=300+1st+St+S,+Montgomery,+MN+56069"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Get Directions
                        </a>
                    </div>
                </article>
                <article className="card">
                    <h2>Message the Store</h2>
                    <form className="contact-form" action="#" method="post">
                        <label htmlFor="name">Name</label>
                        <input id="name" name="name" required />
                        <label htmlFor="email">Email</label>
                        <input id="email" name="email" type="email" required />
                        <label htmlFor="message">Message</label>
                        <textarea id="message" name="message" rows={5} required />
                        <button className="button primary" type="submit">
                            Send Message
                        </button>
                    </form>
                </article>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>Questions We Can Help With</h2>
                    <ul>
                        <li>Pokemon and Magic inventory availability</li>
                        <li>Event hours and weekly schedule</li>
                        <li>Trade-ins and collection questions</li>
                        <li>New player questions and store recommendations</li>
                        <li>Vendor and distributor outreach</li>
                    </ul>
                </article>
                <article className="card">
                    <h2>Serving Nearby Communities</h2>
                    <p>
                        The Wolf Den is a local option for players and collectors in Montgomery, New Prague, Lonsdale, Faribault, Northfield, Jordan, Le Sueur, Belle Plaine, and other nearby southern Minnesota communities.
                    </p>
                    <p>
                        If you are looking for a local game store, Pokemon cards, or Magic: The Gathering products near you, we are here to help.
                    </p>
                </article>
            </section>
        </div>
    );
}
