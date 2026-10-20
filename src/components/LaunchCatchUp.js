"use client";

import { useEffect } from "react";

import { catchUpNewBrowser } from "@/lib/marketplace/launch-modals.js";

// ── A BROWSER THAT HAS NEVER BEEN HERE STARTS CAUGHT UP ──────────────────────────────────────────────────────
// Renders nothing. It exists to run once, as early as any marketplace page mounts, and before the launch
// cards have had a chance to decide they are owed the screen.
//
// WHY IT IS NOT IN THE SIGNUP PATH. It was — markLaunchesSeen() fires when an account is created, which
// protects the one browser that created it and nothing else. The people that leaves exposed are the ones it
// matters most for: somebody who signs up on the shop laptop and plays on their phone, anybody in a private
// window, and every dormant member coming back on a device that has forgotten them. Account creation is the
// wrong event. FIRST CONTACT WITH THIS BROWSER is the right one, and it covers signup as a special case.
//
// ⚠️ MOUNTED IN THE LAYOUT, AND IT COSTS NOTHING. No fetch, no state, no render — two localStorage reads on
// first paint and then an early return forever after. See CLAUDE.md on what a component in a layout is
// allowed to do: this is the cheap end of that rule, not an exception to it.
export default function LaunchCatchUp() {
    useEffect(() => { catchUpNewBrowser(); }, []);
    return null;
}
