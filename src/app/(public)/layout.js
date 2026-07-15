import AnnouncementBanner from "@/components/AnnouncementBanner";
import LevelUpWatcher from "@/components/LevelUpWatcher";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export default function PublicLayout({ children }) {
    return (
        <>
            <AnnouncementBanner />
            <SiteHeader />
            <main className="shell content">{children}</main>
            <SiteFooter />
            {/* Site-wide so a level-up earned while shopping still celebrates, not just on /marketplace. */}
            <LevelUpWatcher />
        </>
    );
}
