import { NextResponse } from "next/server";
import { SITE_HOSTNAME } from "@/lib/site";

const GAME_ONLY = new Set(["/den-quest", "/enter", "/model-lab", "/walk-lab"]);

function isGameHost(hostname) {
    const h = String(hostname || "").toLowerCase();
    return h === "denquestonline.com" || h === "www.denquestonline.com"
        // Previews and local work have no second domain to test against, so the
        // routes stay reachable there; production is where the line matters.
        || h === "localhost" || h === "127.0.0.1" || h.endsWith(".vercel.app");
}

export function proxy(request) {
    const { nextUrl } = request;

    if (nextUrl.hostname === "wolfdengamingmn.com") {
        const redirectUrl = nextUrl.clone();
        redirectUrl.hostname = SITE_HOSTNAME;
        return NextResponse.redirect(redirectUrl, 308);
    }

    // ── ONE DEPLOYMENT, TWO PRODUCTS, AND THE HOST DECIDES ───────────────────────────────────────────────
    // Luke, 2026-11-09: "I dont want the 3d game or any 3d labs in the existing website."
    //
    // denquestonline.com and wolfdengamingmn.com are the same Vercel project — that is what lets the game
    // reuse the accounts table, the session code and the deploy pipeline without a second codebase. But
    // sharing a deployment would otherwise mean sharing every ROUTE: /den-quest, /model-lab and /walk-lab
    // would answer on the shop's domain too, just unlinked.
    //
    // ⚠️ UNLINKED IS NOT THE SAME AS ABSENT. A route nobody links to is still a route — reachable by anyone
    //    who guesses it, and invisible to the next person who adds a nav item. The host check is what makes
    //    the separation true rather than a convention.
    //
    // A total list, not a prefix: a prefix would quietly capture a future shop route starting with the same
    // word. A 404 rather than a redirect, because redirecting would leak that the page exists elsewhere.
    if (GAME_ONLY.has(nextUrl.pathname) && !isGameHost(nextUrl.hostname)) {
        return new NextResponse(null, { status: 404 });
    }

    // Anonymous visitor id for marketplace engagement analytics (unique reach). The native app sends
    // its own x-mkt-vid header; we only mint one for cookieless web visitors, forwarding it so the
    // first request attributes correctly. No PII; Vercel edge geo is already on the request.
    const path = nextUrl.pathname;
    if (path.startsWith("/marketplace") || path.startsWith("/api/marketplace")) {
        const hasVid = request.headers.get("x-mkt-vid") || request.cookies.get("mkt_vid")?.value;
        if (!hasVid) {
            const vid = crypto.randomUUID();
            const headers = new Headers(request.headers);
            headers.set("x-mkt-vid", vid);
            const res = NextResponse.next({ request: { headers } });
            res.cookies.set("mkt_vid", vid, {
                httpOnly: true,
                sameSite: "lax",
                maxAge: 60 * 60 * 24 * 365,
                path: "/",
            });
            return res;
        }
    }

    return NextResponse.next();
}

// ── ⚠️ AND IT DOES NOT RUN FOR A PICTURE ─────────────────────────────────────────────────────────────────────
// The matcher excluded Next's own build output and nothing else, so it ran on every file in public/ as well —
// 1,150 of them, 716 webp and 416 png. Every sprite on every screen was an edge invocation: an arena bout
// pulls two hero sprites, the skill icons and a backdrop; the casino floor pulls five cabinets; the farm pulls
// its decorations, crops and pets. A single page view was tens of invocations before anybody clicked
// anything, and on a plan billed by invocation that is the biggest multiplier in the app.
//
// This middleware does exactly two things — redirect the apex domain, and mint an anonymous visitor id for
// cookieless web visitors. Neither is meaningful for a .webp: the document request always arrives first and
// carries both. So static assets are excluded by folder AND by extension, because public/ grows new folders
// and an extension list catches those on the day they are added rather than the day somebody notices.
export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|images/|logo/|push-sw.js|.*\\.(?:png|jpe?g|gif|webp|svg|ico|mp3|wav|woff2?)$).*)"],
};