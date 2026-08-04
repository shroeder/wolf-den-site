import AnnouncementBanner from "@/components/AnnouncementBanner";
import BossCelebrationWatcher from "@/components/BossCelebrationWatcher";
import FeatureModal from "@/components/FeatureModal";
import GiftWatcher from "@/components/GiftWatcher";
import GuideStrip from "@/components/GuideStrip";
import HappyHourWatcher from "@/components/HappyHourWatcher";
import LevelUpWatcher from "@/components/LevelUpWatcher";
import PetLevelUp from "@/components/PetLevelUp";
import LocationPrompt from "@/components/LocationPrompt";
import PresenceHeartbeat from "@/components/PresenceHeartbeat";
import RecipeFoundWatcher from "@/components/RecipeFoundWatcher";
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
            <main className="shell content">
                {/* The Pathfinder rides ABOVE the page content, site-wide. It was mounted in the marketplace
                    layout, which meant it vanished the moment a step sent you to /looking-for or /shop — pages
                    the guide itself points at, and the exact abandonment it exists to prevent. It decides for
                    itself where to show. */}
                <GuideStrip />
                {children}
            </main>
            <SiteFooter />
            {/* Site-wide so a level-up earned while shopping still celebrates, not just on /marketplace. */}
            <LevelUpWatcher />
            {/* Site-wide pet level-up / evolution celebration — fires anywhere a pet ticks over a level. */}
            <PetLevelUp />
            {/* Every member who fought a boss sees its defeat celebration once, not just the finisher. */}
            <BossCelebrationWatcher />
            {/* When Happy Hour goes live, everyone gets the "it started!" modal once (with a donor recap). */}
            <HappyHourWatcher />
            {/* Recipes drop from ~18 different systems, so the "you found one!" card lives here rather than in
                any one of them — the server marks the reveal owed and this pays it wherever the member is. */}
            <RecipeFoundWatcher />
            {/* Pops up admin gifts (item/chest/gold) on next visit — reliable even without browser push. */}
            <GiftWatcher />
            {/* Ever-present social hub (friends + discover + messaging) for signed-in members, every page. */}
            <SocialHub />
            {/* One-time feature-launch announcement (shows once per member) — currently the Farm launch. */}
            <FeatureModal />
            {/* Registers the push service worker + offers to turn on browser notifications (signed-in). */}
            <WebPushManager />
            {/* Logs a page_view for every visitor (incl. anonymous) — powers the admin traffic telemetry. */}
            <TrafficBeacon />
            {/* Real-time "online now" heartbeat (members only) — keeps the Town's presence fresh from ANY page,
                not just the game area, so a member active anywhere on the site shows up as online. */}
            <PresenceHeartbeat />
            {/* Asks every visitor for location (once/session) to power "near you" features — not just the map. */}
            <LocationPrompt />
        </>
    );
}
