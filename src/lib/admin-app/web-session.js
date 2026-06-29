import "server-only";

import { cookies } from "next/headers";

import { hasPermission } from "@/lib/admin-app/permissions";
import { resolveAdminAppSession } from "@/lib/admin-app/session";

// Browser-side session for the website admin portal. It reuses the SAME admin_app_sessions token
// system the phone app uses (createAdminAppSession / resolveAdminAppSession) — the only difference
// is the raw token rides in an httpOnly cookie instead of a Bearer header. The phone flow is
// untouched; this is purely additive.

export const ADMIN_WEB_COOKIE = "wolfden-admin-web-session";

const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // matches the 30-day session TTL

export async function setAdminWebSessionCookie(token) {
    const cookieStore = await cookies();

    cookieStore.set(ADMIN_WEB_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: COOKIE_MAX_AGE_SECONDS,
    });
}

export async function clearAdminWebSessionCookie() {
    const cookieStore = await cookies();

    cookieStore.delete(ADMIN_WEB_COOKIE);
}

export async function getAdminWebSessionToken() {
    const cookieStore = await cookies();

    return cookieStore.get(ADMIN_WEB_COOKIE)?.value || null;
}

// Resolve the current admin from the cookie (or null). Use in server components + route handlers.
export async function getAdminWebSession() {
    const token = await getAdminWebSessionToken();

    if (!token) {
        return null;
    }

    return resolveAdminAppSession(token);
}

// Gate for marketplace admin surfaces. Returns the session if the user has marketplace.manage
// (owner always does), otherwise null.
export async function getMarketplaceAdmin() {
    const session = await getAdminWebSession();

    if (!session || !hasPermission(session.effectivePermissions, "marketplace.manage")) {
        return null;
    }

    return session;
}
