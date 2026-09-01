"use client";

import { useEffect, useState } from "react";

import CasinoClient from "@/components/CasinoClient";

// ── DEV ONLY: THE REAL FLOOR, WITH ITS ONE AUTHENTICATED CALL STUBBED ────────────────────────────────────────
// Same shape and same reason as SocialLab: mount the REAL component and invent only the DATA. A copy of the
// markup would drift from the thing it is supposed to be checking, and then the rig would confidently show you
// a screen that no longer exists.
//
// The casino needs this more than most. Everything on that floor is behind a session, so the only way it has
// ever been WATCHED is by signing in as a real member and staking real chips — which is why the reveal timing
// ("the purse announces the win before the reels do") was reported by a player rather than caught here.
//
// The spin is not fabricated: the page runs the engine's own playSpin server-side and hands the landed grid
// down. This only wraps it in the envelope the route would have put around it, with the two balances that are
// the whole point of the exercise — `staked` for the instant the bet leaves, `chips` for after the win.
export default function CasinoLab({ initial, spin }) {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const real = window.fetch.bind(window);
        const start = Number(initial?.chips) || 0;
        // The win comes off the engine's own paying spin — see oneSpin in the lab page. A losing spin cannot
        // show you the difference between the two orderings, because both end at the same number.
        const bet = spin?.bet || 100;
        const won = spin?.won || 0;
        window.fetch = async (url, init) => {
            const u = String(url);
            if (u.includes("/api/marketplace/casino") && init?.method === "POST") {
                const body = JSON.parse(init.body || "{}");
                if (body.action === "spin5" && spin) {
                    return new Response(JSON.stringify({
                        ok: true, grid: spin.grid, lines: spin.lines || [], bet,
                        staked: start - bet,        // the moment the stake leaves
                        chips: start - bet + won,   // and again once the machine has finished saying so
                        machine: body.machine || "slot", won,
                    }), { status: 200, headers: { "content-type": "application/json" } });
                }
                // Anything else on the floor is a no-op here rather than a 401 redirect.
                return new Response(JSON.stringify({ ok: false, error: "lab" }), { status: 200 });
            }
            return real(url, init);
        };
        setReady(true);
        return () => { window.fetch = real; };
    }, [initial, spin]);

    if (!ready) return null;
    return <CasinoClient initial={initial} />;
}
