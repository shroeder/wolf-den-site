import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import OpeningBanner from "@/components/OpeningBanner";

export default function PublicLayout({ children }) {
    return (
        <>
            <OpeningBanner />
            <SiteHeader />
            <main className="shell content">{children}</main>
            <SiteFooter />
        </>
    );
}
