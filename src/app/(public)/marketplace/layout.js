// Wraps every /marketplace/* page so the marketplace gets an app-like, denser mobile layout
// (scoped to `.mkt-app` in globals.css). Desktop is unaffected. (LevelUpWatcher + the social hub live
// in the public layout now so they're present site-wide, not just on /marketplace.)

import DailyCheckin from "@/components/DailyCheckin";
import GameNav from "@/components/GameNav";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";

export default async function MarketplaceLayout({ children }) {
    // Owner-only in-dev areas (e.g. Sailing) surface in the game menu just for the owner account.
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const owner = isOwner(buyer?.id);
    return (
        <div className="mkt-app">
            <DailyCheckin />
            {/* In-game menu bar — self-hides on non-game pages. */}
            <GameNav owner={owner} />
            {children}
        </div>
    );
}
