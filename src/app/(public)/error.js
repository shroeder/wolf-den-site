"use client";

import CrashScreen from "@/components/CrashScreen";

// Catches a render error anywhere under (public) — every game screen, the shop, the profile. Without one of
// these Next hands the member the browser's own "This page couldn't load", which tells them nothing, gives
// them nothing to send us, and tells US nothing at all.
export default function PublicError({ error, reset }) {
    return <CrashScreen error={error} reset={reset} where="page" />;
}
