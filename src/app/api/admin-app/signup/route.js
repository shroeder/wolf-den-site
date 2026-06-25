import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { hashPassword } from "@/lib/consignment/password";
import { isValidEmail, isValidPassword } from "@/lib/admin-app/users";
import { createAdminAppSession } from "@/lib/admin-app/session";
import { resolveEffectivePermissions } from "@/lib/admin-app/permissions";
import { isAdminAppSignupBlocked, recordAdminAppSignupAttempt } from "@/lib/admin-app/throttle";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

const TRIAL_DAYS = 14;
const RESERVED_SLUGS = new Set(["wolf-den", "admin", "api", "www", "store", "app"]);

function getClientIp(request) {
    const forwarded = request.headers.get("x-forwarded-for") || "";
    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }
    return request.headers.get("x-real-ip") || "unknown";
}

function baseSlug(name) {
    const slug = String(name || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
    return slug || "store";
}

async function generateUniqueSlug(name) {
    const base = baseSlug(name);

    for (let attempt = 0; attempt < 6; attempt++) {
        const candidate = attempt === 0 && !RESERVED_SLUGS.has(base)
            ? base
            : `${base}-${randomBytes(2).toString("hex")}`;
        const existing = await db.queryOne("SELECT id FROM stores WHERE slug = $1", [candidate]);
        if (!existing) {
            return candidate;
        }
    }

    // Extremely unlikely fallback.
    return `${base}-${randomBytes(4).toString("hex")}`;
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin-app/signup", async ({ logger, internalError }) => {
        let body;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "invalid_json" }, { status: 400 });
        }

        const storeName = typeof body?.storeName === "string" ? body.storeName.trim() : "";
        const email = typeof body?.email === "string" ? body.email.trim() : "";
        const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
        const password = typeof body?.password === "string" ? body.password : "";
        const deviceLabel = typeof body?.deviceLabel === "string" ? body.deviceLabel.trim().slice(0, 120) : null;
        const clientIp = getClientIp(request);

        if (!storeName) {
            return NextResponse.json({ error: "missing_store_name" }, { status: 400 });
        }
        if (!isValidEmail(email)) {
            return NextResponse.json({ error: "invalid_email" }, { status: 400 });
        }
        if (!displayName) {
            return NextResponse.json({ error: "invalid_display_name" }, { status: 400 });
        }
        if (!isValidPassword(password)) {
            return NextResponse.json({ error: "weak_password" }, { status: 400 });
        }

        if (await isAdminAppSignupBlocked({ ip: clientIp })) {
            logger.warn("admin_app.signup.throttled");
            return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
        }
        await recordAdminAppSignupAttempt({ ip: clientIp });

        const normalizedEmail = email.toLowerCase();

        // Email is globally unique (one email = one account = one store).
        const existingEmail = await db.queryOne(
            "SELECT id FROM admin_app_users WHERE email_normalized = $1",
            [normalizedEmail]
        );
        if (existingEmail) {
            return NextResponse.json({ error: "email_already_exists" }, { status: 409 });
        }

        try {
            const slug = await generateUniqueSlug(storeName);
            const passwordHash = await hashPassword(password);
            const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

            const result = await db.tx(async (client) => {
                const storeRows = await client.query(
                    `INSERT INTO stores (slug, name, status, plan, trial_ends_at)
                     VALUES ($1, $2, 'trialing', 'trial', $3)
                     RETURNING id, slug, name, status, trial_ends_at`,
                    [slug, storeName, trialEndsAt]
                );
                const store = storeRows.rows[0];

                const userRows = await client.query(
                    `INSERT INTO admin_app_users (store_id, email, email_normalized, display_name, password_hash, role, active, must_change_password)
                     VALUES ($1, $2, $3, $4, $5, 'owner', TRUE, FALSE)
                     RETURNING id`,
                    [store.id, email, normalizedEmail, displayName, passwordHash]
                );
                const userId = userRows.rows[0].id;

                const session = await createAdminAppSession(userId, store.id, { deviceLabel, client });

                return { store, userId, ...session };
            });

            const permissions = resolveEffectivePermissions("owner", []);

            logger.info("admin_app.signup.success", { storeId: result.store.id, slug });

            return NextResponse.json(
                {
                    token: result.token,
                    expiresAt: result.expiresAt,
                    user: {
                        id: result.userId,
                        storeId: result.store.id,
                        email,
                        displayName,
                        role: "owner",
                        mustChangePassword: false,
                    },
                    permissions,
                    store: {
                        id: result.store.id,
                        slug: result.store.slug,
                        name: result.store.name,
                        status: result.store.status,
                        trialEndsAt: result.store.trial_ends_at ? new Date(result.store.trial_ends_at).toISOString() : null,
                    },
                },
                { status: 201, headers: { "Cache-Control": "no-store" } }
            );
        } catch (error) {
            // Unique-violation safety net (race on email/slug).
            if (error?.dbCode === "23505" || /duplicate key value/.test(error?.message || "")) {
                return NextResponse.json({ error: "email_already_exists" }, { status: 409 });
            }
            return internalError(error, { event: "admin_app.signup.failure" });
        }
    });
}
