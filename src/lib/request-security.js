import "server-only";

function getRequestHost(request) {
    return request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
}

// Strip a leading "www." so the apex and its www subdomain are treated as the same site. The site's
// apex (wolfdengamingmn.com) 307-redirects to www, but a request can still arrive with an Origin on
// one and a forwarded host on the other (cached apex tab, CDN rewrite). Without this, that mismatch
// fails the origin check and silently degrades write endpoints (e.g. shipping rates -> flat fallback).
function baseHost(host) {
    return String(host || "").toLowerCase().replace(/^www\./, "");
}

function matchesHost(originValue, expectedHost) {
    try {
        const parsed = new URL(originValue);

        return baseHost(parsed.host) === baseHost(expectedHost);
    } catch {
        return false;
    }
}

export function isTrustedWriteRequest(request) {
    const host = getRequestHost(request);

    if (!host) {
        return false;
    }

    const origin = request.headers.get("origin");

    if (origin) {
        return matchesHost(origin, host);
    }

    const referer = request.headers.get("referer");

    if (referer) {
        return matchesHost(referer, host);
    }

    return false;
}
