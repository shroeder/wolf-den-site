// Wraps every /marketplace/* page so the marketplace gets an app-like, denser mobile layout
// (scoped to `.mkt-app` in globals.css). Desktop is unaffected.
import LevelUpWatcher from "@/components/LevelUpWatcher";
import MarketplaceMessagingDock from "@/components/MarketplaceMessagingDock";

export default function MarketplaceLayout({ children }) {
    return (
        <div className="mkt-app">
            {children}
            <LevelUpWatcher />
            <MarketplaceMessagingDock />
        </div>
    );
}
