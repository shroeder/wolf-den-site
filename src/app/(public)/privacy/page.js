export const metadata = {
    title: "Privacy Policy",
    description:
        "How The Wolf Den collects, uses, and protects your information across the Wolf Den website and the Wolf Den Marketplace app.",
    alternates: {
        canonical: "/privacy",
    },
};

export default function PrivacyPolicyPage() {
    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Privacy Policy</h1>
                <p>
                    This policy explains what information The Wolf Den (&ldquo;we,&rdquo; &ldquo;us&rdquo;) collects and how we use it
                    across the Wolf Den website (wolfdengamingmn.com) and the Wolf Den Marketplace mobile app.
                </p>
                <p className="secondary">Effective date: July 5, 2026</p>
            </section>

            <section className="card">
                <h2>Information We Collect</h2>
                <ul>
                    <li>
                        <strong>Account details.</strong> If you create a vendor or buyer account, we collect your email address
                        and display name. Passwords are stored in hashed form; we never see or store them in plain text.
                    </li>
                    <li>
                        <strong>Contact information you provide.</strong> When you post items to sell or contact a vendor, we
                        collect the email address (and, optionally, name and phone number) you enter so the other party can reply.
                    </li>
                    <li>
                        <strong>Approximate location.</strong> The Marketplace app can use your device&rsquo;s coarse (city-level)
                        location to sort nearby vendors and estimate distance. This is optional and only used while you use that
                        feature. We do not collect precise GPS location or track you in the background.
                    </li>
                    <li>
                        <strong>Listings and messages.</strong> Product listings, prices, offers, and messages you send through the
                        marketplace are stored so we can operate the service.
                    </li>
                    <li>
                        <strong>Anonymous usage data.</strong> We record anonymous usage events (pages viewed, searches, an
                        anonymous device/visitor identifier, and coarse region from your IP address) to understand what&rsquo;s used
                        and improve the product. The website also uses Google Analytics.
                    </li>
                </ul>
            </section>

            <section className="card">
                <h2>How We Use Your Information</h2>
                <ul>
                    <li>To operate the marketplace &mdash; create listings, connect buyers and vendors, and deliver offers.</li>
                    <li>To sort and show nearby vendors when you choose to use location.</li>
                    <li>To secure accounts and prevent abuse.</li>
                    <li>To understand feature usage and improve the website and app.</li>
                    <li>To respond to your questions and support requests.</li>
                </ul>
            </section>

            <section className="card">
                <h2>How Information Is Shared</h2>
                <p>
                    We do <strong>not</strong> sell your personal information. Information is shared only as needed to run the
                    service:
                </p>
                <ul>
                    <li>
                        <strong>With other users you choose to interact with.</strong> When you contact a vendor or post an item to
                        sell, the contact details you provide are shared with the relevant vendor(s) so they can respond.
                    </li>
                    <li>
                        <strong>With service providers.</strong> We use trusted providers to host the service and process data
                        (for example, our hosting and database providers and Google Analytics). They may process data only on our
                        behalf.
                    </li>
                    <li>
                        <strong>When required by law.</strong> We may disclose information if required to comply with a legal
                        obligation.
                    </li>
                </ul>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>Your Choices</h2>
                    <ul>
                        <li>You can decline or revoke the location permission in your device settings at any time.</li>
                        <li>You can request access to, correction of, or deletion of your account and associated data.</li>
                        <li>You can stop using the service and ask us to remove your listings.</li>
                    </ul>
                </article>
                <article className="card">
                    <h2>Data Retention &amp; Security</h2>
                    <p>
                        We keep information for as long as your account is active or as needed to provide the service, then delete
                        or anonymize it. We use reasonable technical measures to protect your data, though no system is perfectly
                        secure.
                    </p>
                    <p>The service is intended for users 13 and older; we do not knowingly collect data from children under 13.</p>
                </article>
            </section>

            <section className="card">
                <h2>Contact Us</h2>
                <p>
                    Questions about this policy, or want your data deleted? Email{" "}
                    <a href="mailto:luke@wolfdengamingmn.com">luke@wolfdengamingmn.com</a> and we&rsquo;ll help.
                </p>
                <p className="secondary">
                    We may update this policy from time to time; material changes will be reflected by the effective date above.
                </p>
            </section>
        </div>
    );
}
