import "server-only";

function getRequestHost(request) {
    return request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
}

function matchesHost(originValue, expectedHost) {
    try {
        const parsed = new URL(originValue);

        return parsed.host.toLowerCase() === String(expectedHost || "").toLowerCase();
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
