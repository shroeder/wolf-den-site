"use client";

import CrashScreen from "@/components/CrashScreen";

// The mine had the site's only error boundary — a bespoke one I added while chasing a crash here. It uses the
// shared screen now, so the mine reports and offers "copy the error" exactly like every other page.
export default function MiningError({ error, reset }) {
    return <CrashScreen error={error} reset={reset} where="the mine" />;
}
