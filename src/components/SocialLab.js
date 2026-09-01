"use client";

import { useEffect, useState } from "react";

import SocialHub from "@/components/SocialHub";

// ── DEV ONLY: THE REAL HUB, BEHIND A STUBBED FETCH ───────────────────────────────────────────────────────────
// The Social hub is the one screen in the game with no rig at all, because everything in it is behind a session:
// `authed` is whatever /api/marketplace/unread says, the tab strip is drawn from the channels the FEED sends
// back, and every badge is a number off the server. So it has only ever been looked at by signing in as a real
// member and reading a real plaza — which is also why a layout change here has always been shipped unseen.
//
// This mounts the REAL component and stubs the handful of endpoints it calls. Not a copy of the markup: a copy
// would drift from the thing it is supposed to be checking, and then the rig would be confidently showing you a
// screen that no longer exists. Only the DATA is invented.
//
// It is deliberately at the busy end — every room present, a badge on most of them, unread mail and a friend
// request — because a bar that holds when everything has a number on it holds when nothing does.
const CHANNELS = ["global", "announce", "bugs", "vip", "staff"];

const SAY = [
    { id: 1, alias: "soullessshiitake", name: "SoullessShiitake", body: "Jewelcutter changes are a huge win", role: "legend", ago: "6m ago" },
    { id: 2, alias: "graykitsune", name: "GrayKitsune", body: "Like the farm update too!", ago: "5m ago" },
    { id: 3, alias: "valkyriesylve", name: "ValkyrieSylve", body: "The gift box is so much better than chasing him around", ago: "2m ago" },
    { id: 4, alias: "ericd", name: "Eric D", body: "Anyone else seeing their record change?", ago: "1m ago" },
];

export default function SocialLab() {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const real = window.fetch.bind(window);
        window.fetch = async (url, init) => {
            const u = String(url);
            const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
            if (u.includes("/api/marketplace/unread")) {
                // A badge on nearly everything, so the aggregate on the two top tabs has something to add up.
                return json({ authenticated: true, total: 3, requests: 2, global: 7,
                    rooms: { global: 7, announce: 2, bugs: 4, vip: 1, staff: 0 } });
            }
            if (u.includes("/api/marketplace/global-chat")) {
                const chan = new URL(u, window.location.origin).searchParams.get("channel") || "global";
                return json({ channels: CHANNELS, roster: [], messages: SAY.map((m) => ({ ...m, channel: chan })) });
            }
            if (u.includes("/api/marketplace/inbox")) return json({ messages: [] });
            if (u.includes("/api/marketplace/friends")) return json({ friends: [], incoming: [], outgoing: [] });
            return real(url, init);
        };
        setReady(true);
        return () => { window.fetch = real; };
    }, []);

    // The hub renders nothing until its first unread poll answers, and that poll has to hit the stub — so it
    // must not mount until the stub is installed. One render's delay, and it is why this is state and not a ref.
    if (!ready) return null;
    return (
        <div style={{ minHeight: "100dvh", background: "#0d0f13" }}>
            <SocialHub />
        </div>
    );
}
