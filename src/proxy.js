import { NextResponse } from "next/server";
import { SITE_HOSTNAME } from "@/lib/site";

export function proxy(request) {
    const { nextUrl } = request;

    if (nextUrl.hostname === "wolfdengamingmn.com") {
        const redirectUrl = nextUrl.clone();
        redirectUrl.hostname = SITE_HOSTNAME;
        return NextResponse.redirect(redirectUrl, 308);
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

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};