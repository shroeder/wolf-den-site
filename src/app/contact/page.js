export const metadata = { title: "Contact | The Wolf Den" };

export default function ContactPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <h1>Contact</h1>
                <p>Email, social, and in-store contact details for customers and vendors.</p>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>Contact Info</h2>
                    <ul>
                        <li>Email: luke@wolfdengamingmn.com</li>
                        <li>Phone: (507) 301-6434</li>
                        <li>Address: 300 1st St S, Montgomery, MN 56069</li>
                        <li>Thu 4–7pm, Fri 4–7pm, Sat 12–6pm</li>
                    </ul>
                    <p>
                        <strong>Vendor/Distributor:</strong> Include purchase order details in your message.
                    </p>
                </article>
                <article className="card">
                    <h2>Message Us</h2>
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
        </div>
    );
}
