// Wraps every /marketplace/* page so the marketplace gets an app-like, denser mobile layout
// (scoped to `.mkt-app` in globals.css). Desktop is unaffected. (LevelUpWatcher + the social hub live
// in the public layout now so they're present site-wide, not just on /marketplace.)

import DailyCheckin from "@/components/DailyCheckin";
import GameNav from "@/components/GameNav";
import GuideStrip from "@/components/GuideStrip";

export default function MarketplaceLayout({ children }) {
    return (
        <div className="mkt-app">
            <DailyCheckin />
            {/* In-game menu bar — self-hides on non-game pages. (Presence heartbeat lives in the site-wide
                public layout so a member active ANYWHERE — shop, home, etc. — shows as online.) */}
            <GameNav />
            {/* The Pathfinder comes WITH you. Mounted here rather than on the home screen so it is present in
                every room of the game — it self-hides outside the game, and on the step's own page it stops
                being a signpost and says "you're in the right place". */}
            <GuideStrip />
            {children}
        </div>
    );
}
