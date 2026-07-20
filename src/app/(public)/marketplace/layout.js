// Wraps every /marketplace/* page so the marketplace gets an app-like, denser mobile layout
// (scoped to `.mkt-app` in globals.css). Desktop is unaffected. (LevelUpWatcher + the social hub live
// in the public layout now so they're present site-wide, not just on /marketplace.)

import DailyCheckin from "@/components/DailyCheckin";
import HappyHour from "@/components/HappyHour";

export default function MarketplaceLayout({ children }) {
    return (
        <div className="mkt-app">
            <DailyCheckin />
            <HappyHour />
            {children}
        </div>
    );
}
