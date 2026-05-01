import Link from "next/link";

export default function SiteFooter() {
    return (
        <footer className="site-footer">
            <div className="shell footer-grid">
                <div>
                    <h3>The Wolf Den</h3>
                    <p>Trading cards, singles, sealed product, accessories, and local play in Montgomery, MN.</p>
                </div>
                <div>
                    <h3>Top Actions</h3>
                    <ul>
                        <li>
                            <a href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                                Join Discord
                            </a>
                        </li>
                        <li>
                            <Link href="/events">View Events</Link>
                        </li>
                        <li>
                            <Link href="/shop">Shop Inventory</Link>
                        </li>
                        <li>
                            <Link href="/sell-cards">Sell Us Your Cards</Link>
                        </li>
                    </ul>
                </div>
                <div>
                    <h3>Visit</h3>
                    <p>300 1st St S, Montgomery, MN 56069</p>
                    <p>Thu 4–7pm, Fri 4–7pm, Sat 12–6pm</p>
                    <p>Soft opening: May 2026</p>
                </div>
            </div>
        </footer>
    );
}
