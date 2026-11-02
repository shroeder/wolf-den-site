// Wraps every /marketplace/* page so the marketplace gets an app-like, denser mobile layout
// (scoped to `.mkt-app` in globals.css). Desktop is unaffected. (LevelUpWatcher + the social hub live
// in the public layout now so they're present site-wide, not just on /marketplace.)

import DailyCheckin from "@/components/DailyCheckin";
import LaunchCatchUp from "@/components/LaunchCatchUp";
import GameNav from "@/components/GameNav";
import GroveReturnDoor from "@/components/grove/GroveReturnDoor";

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
            {/* ── THE WAY BACK INTO THE GROVE, ON EVERY FEATURE ────────────────────────────────────
                Luke: "Going into a feature completely departs from the grove, we need a way to get
                back right where we left off... And this applies to every feature."

                ⚠️ HERE RATHER THAN IN EACH FEATURE, because "every feature" is twenty-odd pages and
                a per-page door is twenty chances to forget. Renders nothing at all unless the Grove
                left a note in this tab, and reads NO endpoint — see check:chrome and the note in the
                component. */}
            <GroveReturnDoor />
            {children}
        </div>
    );
}
