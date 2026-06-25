import "server-only";

import { NextResponse } from "next/server";

import { requireAdminAppAuth } from "@/lib/admin-app/auth";
import { hasPermission } from "@/lib/admin-app/permissions";
import { getDecryptedCredential, resolveOpenAiKey, resolveSquareAccessToken } from "@/lib/admin-app/integrations";
import { createServerLogger } from "@/lib/server-logger";

const proxyLogger = createServerLogger({ source: "api", subsystem: "admin-app-proxy" });

const P = {
    LEDGER_VIEW: "ledger.view",
    CASH_VIEW: "cash.view",
    TRADES_VIEW: "trades.view",
    TRADES_EDIT: "trades.edit",
    COGS_VIEW: "cogs.view",
    INVENTORY_SCAN: "inventory.scan",
    LABELS_PRINT: "labels.print",
    MYSTERY_MANAGE: "mystery.manage",
    CONSIGNORS_MANAGE: "consignors.manage",
    REPORTS_VIEW: "reports.view",
    BANKING_VIEW: "banking.view",
    AI_USE: "ai.use",
};

/**
 * Scoped pass-through proxies. The phone holds NO upstream secrets; it sends the
 * real upstream path to us, we verify the staff session + an allowlisted path →
 * required-permission rule, then forward with the server-held credential.
 *
 * Each upstream defines:
 *  - resolveBaseUrl(): the upstream origin
 *  - rules: [{ prefix, anyOf }] — first matching prefix wins; caller needs ANY
 *    of `anyOf`. A path that matches no rule is rejected (not allowlisted).
 *  - applyAuth({ headers, bodyText }) -> { headers, bodyText }: inject the secret.
 */
const UPSTREAMS = {
    square: {
        resolveBaseUrl: () => "https://connect.squareup.com",
        rules: [
            { prefix: "/v2/catalog", anyOf: [P.INVENTORY_SCAN, P.LABELS_PRINT, P.REPORTS_VIEW, P.COGS_VIEW, P.MYSTERY_MANAGE, P.CONSIGNORS_MANAGE] },
            { prefix: "/v2/inventory", anyOf: [P.INVENTORY_SCAN, P.REPORTS_VIEW, P.COGS_VIEW, P.TRADES_EDIT, P.MYSTERY_MANAGE] },
            { prefix: "/v2/orders", anyOf: [P.REPORTS_VIEW, P.COGS_VIEW, P.CONSIGNORS_MANAGE, P.MYSTERY_MANAGE] },
            { prefix: "/v2/payments", anyOf: [P.REPORTS_VIEW, P.COGS_VIEW, P.CONSIGNORS_MANAGE] },
            { prefix: "/v2/gift-cards", anyOf: [P.TRADES_EDIT, P.TRADES_VIEW, P.REPORTS_VIEW] },
            { prefix: "/v2/locations", anyOf: [P.INVENTORY_SCAN, P.LABELS_PRINT, P.REPORTS_VIEW, P.COGS_VIEW, P.MYSTERY_MANAGE, P.CONSIGNORS_MANAGE, P.TRADES_EDIT] },
        ],
        applyAuth: async ({ headers, bodyText, storeId }) => {
            // The store's OWN Square token (env fallback ONLY for the flagship store).
            const token = await resolveSquareAccessToken(storeId);
            if (!token) throw new ProxyConfigError("square_not_connected");
            headers.set("Authorization", `Bearer ${token}`);
            if (process.env.SQUARE_API_VERSION) {
                headers.set("Square-Version", process.env.SQUARE_API_VERSION);
            }
            return { headers, bodyText };
        },
    },
    openai: {
        resolveBaseUrl: () => "https://api.openai.com",
        rules: [
            { prefix: "/v1", anyOf: [P.AI_USE] },
        ],
        applyAuth: async ({ headers, bodyText, storeId }) => {
            // Per-store OpenAI key (env fallback ONLY for the flagship store).
            const token = await resolveOpenAiKey(storeId);
            if (!token) throw new ProxyConfigError("openai_not_connected");
            headers.set("Authorization", `Bearer ${token}`);
            return { headers, bodyText };
        },
    },
    plaid: {
        resolveBaseUrl: () => {
            const env = (process.env.PLAID_ENV || "production").trim().toLowerCase();
            return `https://${env}.plaid.com`;
        },
        rules: [
            { prefix: "/link", anyOf: [P.BANKING_VIEW] },
            { prefix: "/item", anyOf: [P.BANKING_VIEW] },
            { prefix: "/transactions", anyOf: [P.BANKING_VIEW] },
            { prefix: "/accounts", anyOf: [P.BANKING_VIEW] },
            { prefix: "/institutions", anyOf: [P.BANKING_VIEW] },
        ],
        // Plaid: vendor client_id/secret stay global; the per-store item access_token
        // is injected from store_integrations for non-/link data calls.
        applyAuth: async ({ headers, bodyText, storeId, path }) => {
            const clientId = process.env.PLAID_CLIENT_ID || "";
            const secret = process.env.PLAID_SECRET || "";
            if (!clientId || !secret) throw new ProxyConfigError("plaid_not_configured");

            let payload = {};
            if (bodyText) {
                try {
                    payload = JSON.parse(bodyText);
                } catch {
                    throw new ProxyConfigError("plaid_invalid_body");
                }
            }
            payload.client_id = clientId;
            payload.secret = secret;

            if (!path.startsWith("/link")) {
                const plaidCred = await getDecryptedCredential(storeId, "plaid");
                if (plaidCred?.credential?.access_token) {
                    payload.access_token = plaidCred.credential.access_token;
                }
            }

            headers.set("Content-Type", "application/json");
            return { headers, bodyText: JSON.stringify(payload) };
        },
    },
};

class ProxyConfigError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

function matchRule(rules, path) {
    return rules.find((rule) => path === rule.prefix || path.startsWith(`${rule.prefix}/`) || path.startsWith(rule.prefix)) || null;
}

// Headers we forward from the client request to the upstream. We intentionally
// drop Authorization (replaced) and hop-by-hop / host headers.
const FORWARD_HEADERS = ["content-type", "accept", "idempotency-key", "openai-beta"];

/**
 * @param {Request} request
 * @param {"square"|"openai"|"plaid"} upstreamKey
 * @param {{ params: Promise<{ path?: string[] }> }} context
 */
export async function handleProxy(request, upstreamKey, context) {
    const upstream = UPSTREAMS[upstreamKey];

    if (!upstream) {
        return NextResponse.json({ error: "unknown_upstream" }, { status: 404 });
    }

    const auth = await requireAdminAppAuth(request, proxyLogger);

    if (auth.response) {
        return auth.response;
    }

    const { path: pathSegments = [] } = (await context.params) || {};
    const path = `/${pathSegments.join("/")}`;

    const rule = matchRule(upstream.rules, path);

    if (!rule) {
        proxyLogger.warn("admin_app.proxy.not_allowlisted", { upstreamKey, path });
        return NextResponse.json({ error: "path_not_allowed" }, { status: 403 });
    }

    const permitted = rule.anyOf.some((perm) => hasPermission(auth.session.effectivePermissions, perm));

    if (!permitted) {
        proxyLogger.warn("admin_app.proxy.permission_denied", {
            upstreamKey,
            path,
            userId: auth.session.user.id,
            anyOf: rule.anyOf,
        });
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const method = request.method.toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD" && method !== "DELETE";
    let bodyText = hasBody ? await request.text() : null;

    let headers = new Headers();
    for (const name of FORWARD_HEADERS) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
    }

    try {
        ({ headers, bodyText } = await upstream.applyAuth({
            headers,
            bodyText,
            storeId: auth.session.user.storeId,
            path,
        }));
    } catch (error) {
        if (error instanceof ProxyConfigError) {
            proxyLogger.error("admin_app.proxy.config_error", error, { upstreamKey, code: error.code });
            return NextResponse.json({ error: error.code }, { status: 502 });
        }
        throw error;
    }

    const search = new URL(request.url).search || "";
    const targetUrl = `${upstream.resolveBaseUrl()}${path}${search}`;

    let upstreamResponse;
    try {
        upstreamResponse = await fetch(targetUrl, {
            method,
            headers,
            body: bodyText,
        });
    } catch (error) {
        proxyLogger.error("admin_app.proxy.upstream_unreachable", error, { upstreamKey, path });
        return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
    }

    const responseBody = await upstreamResponse.text();

    proxyLogger.info("admin_app.proxy.forwarded", {
        upstreamKey,
        path,
        method,
        status: upstreamResponse.status,
        userId: auth.session.user.id,
    });

    return new NextResponse(responseBody, {
        status: upstreamResponse.status,
        headers: {
            "Content-Type": upstreamResponse.headers.get("content-type") || "application/json",
            "Cache-Control": "no-store",
        },
    });
}
