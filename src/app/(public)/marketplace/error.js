"use client";

import CrashScreen from "@/components/CrashScreen";

// A boundary HERE, not just at (public), is what keeps the game menu on screen.
//
// An error.js renders in place of its segment, INSIDE its parent layout. So a crash caught by (public)/error.js
// replaces everything below the public layout — which includes marketplace/layout.js, and with it GameNav. You
// would keep the site header and footer and lose the game's own menu bar, on the one screen where you most
// want a way out.
//
// Catching it one level lower means the crash lands inside .mkt-app with DailyCheckin and GameNav still
// rendered above it: the page died, the game around it did not.
export default function MarketplaceError({ error, reset }) {
    return <CrashScreen error={error} reset={reset} where="game screen" />;
}
