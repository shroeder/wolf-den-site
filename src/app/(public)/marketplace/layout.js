// Wraps every /marketplace/* page so the marketplace gets an app-like, denser mobile layout
// (scoped to `.mkt-app` in globals.css). Desktop is unaffected. (LevelUpWatcher + the social hub live
// in the public layout now so they're present site-wide, not just on /marketplace.)

import DailyCheckin from "@/components/DailyCheckin";
import GameNav from "@/components/GameNav";
import PresenceHeartbeat from "@/components/PresenceHeartbeat";

export default function MarketplaceLayout({ children }) {
    return (
        <div className="mkt-app">
            <DailyCheckin />
            {/* Keeps "online now" fresh for the Town/presence — pings every ~40s while the tab is visible. */}
            <PresenceHeartbeat />
            {/* In-game menu bar — self-hides on non-game pages. */}
            <GameNav />
            {children}
        </div>
    );
}
