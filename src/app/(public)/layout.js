import AnnouncementBanner from "@/components/AnnouncementBanner";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export default function PublicLayout({ children }) {
    return (
        <>
            <AnnouncementBanner />
            <SiteHeader />
            <main className="shell content">{children}</main>
            <SiteFooter />
        </>
    );
}
