"use client";

import CrashScreen from "@/components/CrashScreen";

// The last resort: an error in the ROOT layout itself, which replaces the whole document — so this one has to
// bring its own <html> and <body>. Everything else is caught by the nearer boundaries.
export default function GlobalError({ error, reset }) {
    return (
        <html lang="en">
            <body style={{ margin: 0, background: "#0d0b0a", color: "#e7dcc8", fontFamily: "system-ui, sans-serif" }}>
                <CrashScreen error={error} reset={reset} where="site" />
            </body>
        </html>
    );
}
