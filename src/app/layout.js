import "./globals.css";
import { Manrope, Space_Grotesk } from "next/font/google";
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
    title: "Wolf Den Cards",
    description:
        "Trading cards, singles, sealed product, accessories, and local play in Montgomery, MN.",
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body className={`${manrope.variable} ${spaceGrotesk.variable}`}>
                <SiteHeader />
                <main className="shell content">{children}</main>
                <SiteFooter />
            </body>
        </html>
    );
}
