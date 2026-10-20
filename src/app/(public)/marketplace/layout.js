// Wraps every /marketplace/* page so the marketplace gets an app-like, denser mobile layout
// (scoped to `.mkt-app` in globals.css). Desktop is unaffected. (LevelUpWatcher + the social hub live
// in the public layout now so they're present site-wide, not just on /marketplace.)

import DailyCheckin from "@/components/DailyCheckin";
import LaunchCatchUp from "@/components/LaunchCatchUp";
import GameNav from "@/components/GameNav";

export default function MarketplaceLayout({ children }) {
    return (
        <div className="mkt-app">
            {/* Marks a brand-new browser caught up on every feature announcement, BEFORE any of them can
                open. Renders nothing. See LaunchCatchUp for why signup was the wrong moment to do this. */}
            <LaunchCatchUp />
            <DailyCheckin />
            {/* In-game menu bar — self-hides on non-game pages. (Presence heartbeat lives in the site-wide
                public layout so a member active ANYWHERE — shop, home, etc. — shows as online.) */}
            <GameNav />
            {children}
        </div>
    );
}
