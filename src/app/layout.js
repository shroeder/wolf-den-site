import "./globals.css";
import { Manrope, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

const manrope = Manrope({
    subsets: ["latin"],
    variable: "--font-body",
});

const spaceGrotesk = Space_Grotesk({
    subsets: ["latin"],
    variable: "--font-display",
});

export const metadata = {
    metadataBase: new URL("https://wolfdengamingmn.com"),
    title: {
        default: "The Wolf Den",
        template: "%s | The Wolf Den",
    },
    icons: {
        icon: "/logo/logo.png",
        shortcut: "/logo/logo.png",
        apple: "/logo/logo.png",
    },
    description:
        "Trading card game store in Montgomery, MN offering Pokemon cards, Magic: The Gathering, singles, sealed product, accessories, and local play for southern Minnesota.",
    keywords: [
        "trading cards",
        "Pokemon",
        "pokemon cards",
        "pokemon singles",
        "pokemon cards near me",
        "Magic The Gathering",
        "magic cards",
        "mtg singles",
        "magic the gathering near me",
        "card shop",
        "card shop near me",
        "pokemon store near me",
        "magic store near me",
        "Montgomery MN",
        "New Prague MN",
        "Lonsdale MN",
        "Faribault MN",
        "Northfield MN",
        "Jordan MN",
        "Le Sueur MN",
        "Belle Plaine MN",
        "singles",
        "sealed product",
        "local game store",
        "LGS",
    ],
    openGraph: {
        type: "website",
        siteName: "The Wolf Den",
        title: "The Wolf Den",
        description:
            "Pokemon and Magic cards in Montgomery, MN, serving players across southern Minnesota including New Prague, Lonsdale, Faribault, Northfield, and Le Sueur.",
        url: "https://wolfdengamingmn.com",
        images: [{ url: "/logo/wolf-den-full-logo.png", width: 420, height: 280, alt: "The Wolf Den logo" }],
    },
    twitter: {
        card: "summary_large_image",
        title: "The Wolf Den",
        description:
            "Pokemon and Magic cards in Montgomery, MN, serving nearby players across southern Minnesota.",
        images: ["/logo/wolf-den-full-logo.png"],
    },
};

const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "Store"],
    name: "The Wolf Den",
    description:
        "Locally owned trading card game store in Montgomery, Minnesota offering Pokemon cards, Magic: The Gathering, singles, sealed product, accessories, and community play.",
    url: "https://wolfdengamingmn.com",
    telephone: "+15073016434",
    email: "luke@wolfdengamingmn.com",
    address: {
        "@type": "PostalAddress",
        streetAddress: "300 1st St S",
        addressLocality: "Montgomery",
        addressRegion: "MN",
        postalCode: "56069",
        addressCountry: "US",
    },
    geo: {
        "@type": "GeoCoordinates",
        latitude: 44.4383,
        longitude: -93.5836,
    },
    image: [
        "https://wolfdengamingmn.com/logo/wolf-den-full-logo.png",
        "https://wolfdengamingmn.com/images/trading-card-store-interior-the-wolf-den-montgomery-mn.jpg",
        "https://wolfdengamingmn.com/images/local-game-store-interior-the-wolf-den-montgomery-mn.jpg",
    ],
    priceRange: "$$",
    areaServed: [
        { "@type": "City", name: "Montgomery" },
        { "@type": "City", name: "New Prague" },
        { "@type": "City", name: "Lonsdale" },
        { "@type": "City", name: "Faribault" },
        { "@type": "City", name: "Northfield" },
        { "@type": "City", name: "Jordan" },
        { "@type": "City", name: "Le Sueur" },
        { "@type": "City", name: "Belle Plaine" },
    ],
    knowsAbout: ["Pokemon cards", "Magic: The Gathering", "trading card singles", "sealed product", "Commander", "local play"],
    openingHoursSpecification: [
        { "@type": "OpeningHoursSpecification", dayOfWeek: "Thursday", opens: "16:00", closes: "19:00" },
        { "@type": "OpeningHoursSpecification", dayOfWeek: "Friday", opens: "16:00", closes: "19:00" },
        { "@type": "OpeningHoursSpecification", dayOfWeek: "Saturday", opens: "12:00", closes: "18:00" },
    ],
    sameAs: [
        "https://discord.gg/Pad8U2KVsD",
        "https://www.facebook.com/WolfDenGamesMN",
    ],
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body className={`${manrope.variable} ${spaceGrotesk.variable}`}>
                <Script
                    src="https://www.googletagmanager.com/gtag/js?id=G-MQGDR0X2L0"
                    strategy="afterInteractive"
                />
                <Script id="gtag-init" strategy="afterInteractive">{`
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', 'G-MQGDR0X2L0');
                `}</Script>
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
                />
                <SiteHeader />
                <main className="shell content">{children}</main>
                <SiteFooter />
            </body>
        </html>
    );
}
