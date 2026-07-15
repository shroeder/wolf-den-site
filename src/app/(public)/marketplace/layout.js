// Wraps every /marketplace/* page so the marketplace gets an app-like, denser mobile layout
// (scoped to `.mkt-app` in globals.css). Desktop is unaffected. (LevelUpWatcher lives in the public
// layout now so the celebration fires site-wide.)
import MarketplaceMessagingDock from "@/components/MarketplaceMessagingDock";

export default function MarketplaceLayout({ children }) {
    return (
        <div className="mkt-app">
            {children}
            <MarketplaceMessagingDock />
        </div>
    );
}
