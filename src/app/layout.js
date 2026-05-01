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
    description:
        "Trading cards, singles, sealed product, accessories, and local play in Montgomery, MN. Your local Pokemon and Magic: The Gathering shop.",
    keywords: ["trading cards", "Pokemon", "Magic The Gathering", "card shop", "Montgomery MN", "singles", "sealed product", "local game store", "LGS"],
    openGraph: {
        type: "website",
        siteName: "The Wolf Den",
        title: "The Wolf Den",
        description:
            "Trading cards, singles, sealed product, accessories, and local play in Montgomery, MN.",
        url: "https://wolfdengamingmn.com",
        images: [{ url: "/logo/wolf-den-full-logo.png", width: 420, height: 280, alt: "The Wolf Den logo" }],
    },
    twitter: {
        card: "summary_large_image",
        title: "The Wolf Den",
        description:
            "Trading cards, singles, sealed product, accessories, and local play in Montgomery, MN.",
        images: ["/logo/wolf-den-full-logo.png"],
    },
};

const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "The Wolf Den",
    description:
        "Trading cards, singles, sealed product, accessories, and local play in Montgomery, MN.",
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
    openingHoursSpecification: [
        { "@type": "OpeningHoursSpecification", dayOfWeek: "Thursday", opens: "16:00", closes: "19:00" },
        { "@type": "OpeningHoursSpecification", dayOfWeek: "Friday", opens: "16:00", closes: "19:00" },
        { "@type": "OpeningHoursSpecification", dayOfWeek: "Saturday", opens: "12:00", closes: "18:00" },
    ],
    sameAs: ["https://discord.gg/Pad8U2KVsD"],
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
