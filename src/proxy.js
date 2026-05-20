import { NextResponse } from "next/server";
import { SITE_HOSTNAME } from "@/lib/site";

export function proxy(request) {
    const { nextUrl } = request;

    if (nextUrl.hostname === "wolfdengamingmn.com") {
        const redirectUrl = nextUrl.clone();
        redirectUrl.hostname = SITE_HOSTNAME;
        return NextResponse.redirect(redirectUrl, 308);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};