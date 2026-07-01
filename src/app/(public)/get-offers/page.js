import SellOfferForm from "@/components/SellOfferForm";

export const metadata = {
    title: "Get Offers From Local Vendors | The Wolf Den",
    description:
        "Have cards to sell? Post what you have and local vetted vendors from The Wolf Den Marketplace will reach out with offers. Free, no obligation.",
    alternates: { canonical: "/get-offers" },
};

export default function GetOffersPage() {
    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Get offers on cards you&apos;re selling</h1>
                <p>
                    Didn&apos;t sell it at the counter? Post it here and the vetted local vendors on The Wolf Den
                    Marketplace can reach out with offers — like shopping it around a card show without leaving.
                </p>
                <p className="muted">Free and no obligation. You choose which offer (if any) to take.</p>
            </section>

            <section className="card">
                <h2>What are you looking to sell?</h2>
                <SellOfferForm />
            </section>

            <section className="card">
                <h2>How it works</h2>
                <ol className="statement-copy">
                    <li>Tell us what you have and how to reach you.</li>
                    <li>Local vetted vendors get notified and email you with offers.</li>
                    <li>You deal directly with whoever makes the best offer — meet up and settle in person.</li>
                </ol>
            </section>
        </div>
    );
}
