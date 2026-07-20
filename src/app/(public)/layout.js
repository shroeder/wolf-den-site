import AnnouncementBanner from "@/components/AnnouncementBanner";
import GiftWatcher from "@/components/GiftWatcher";
import LevelUpWatcher from "@/components/LevelUpWatcher";
import LocationPrompt from "@/components/LocationPrompt";
import RewardNudge from "@/components/RewardNudge";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SocialHub from "@/components/SocialHub";
import TrafficBeacon from "@/components/TrafficBeacon";
import WebPushManager from "@/components/WebPushManager";

export default function PublicLayout({ children }) {
    return (
        <>
            <AnnouncementBanner />
            <SiteHeader />
            <RewardNudge />
            <main className="shell content">{children}</main>
            <SiteFooter />
            {/* Site-wide so a level-up earned while shopping still celebrates, not just on /marketplace. */}
            <LevelUpWatcher />
            {/* Pops up admin gifts (item/chest/gold) on next visit — reliable even without browser push. */}
            <GiftWatcher />
            {/* Ever-present social hub (friends + discover + messaging) for signed-in members, every page. */}
            <SocialHub />
            {/* Registers the push service worker + offers to turn on browser notifications (signed-in). */}
            <WebPushManager />
            {/* Logs a page_view for every visitor (incl. anonymous) — powers the admin traffic telemetry. */}
            <TrafficBeacon />
            {/* Asks every visitor for location (once/session) to power "near you" features — not just the map. */}
            <LocationPrompt />
        </>
    );
}
