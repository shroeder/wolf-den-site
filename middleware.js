import { NextResponse } from "next/server";

// Assign an anonymous first-party visitor id to marketplace visitors (for unique-reach analytics).
// The native app sends its own stable x-mkt-vid header, so we only mint one for cookieless web
// visitors — and we forward it as a request header so the first request can attribute correctly.
// No PII; Vercel edge geo (x-vercel-ip-*) is already on the request and read downstream.
export const config = {
    matcher: ["/marketplace/:path*", "/api/marketplace/:path*"],
};

export function middleware(request) {
    const headerVid = request.headers.get("x-mkt-vid");
    const cookieVid = request.cookies.get("mkt_vid")?.value;
    if (headerVid || cookieVid) {
        return NextResponse.next();
    }
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
