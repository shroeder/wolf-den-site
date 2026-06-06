import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";

const TWO_FACTOR_CODE_TTL_MINUTES = 10;
const TRUSTED_DEVICE_TTL_DAYS = 30;

function hashValue(value) {
    return createHash("sha256").update(String(value || "")).digest("hex");
}

function generateCode() {
    const value = Math.floor(100000 + (Math.random() * 900000));

    return String(value);
}

export async function createShopTwoFactorCode(customerId) {
    if (!customerId) {
        return null;
    }

    const code = generateCode();
    const codeHash = hashValue(code);

    await db.query(
        `UPDATE shop_customer_two_factor_codes
         SET used_at = NOW()
         WHERE customer_id = $1
           AND used_at IS NULL
           AND purpose = 'login'`,
        [customerId]
    );

    await db.query(
        `INSERT INTO shop_customer_two_factor_codes (
            customer_id,
            purpose,
            code_hash,
            expires_at
        ) VALUES (
            $1,
            'login',
            $2,
            NOW() + ($3 * INTERVAL '1 minute')
        )`,
        [customerId, codeHash, TWO_FACTOR_CODE_TTL_MINUTES]
    );

    return code;
}

export async function verifyShopTwoFactorCode(customerId, code) {
    if (!customerId || !code) {
        return false;
    }

    const codeHash = hashValue(code);
    const token = await db.queryOne(
        `SELECT id
         FROM shop_customer_two_factor_codes
         WHERE customer_id = $1
           AND purpose = 'login'
           AND code_hash = $2
           AND used_at IS NULL
           AND expires_at > NOW()`,
        [customerId, codeHash]
    );

    if (!token) {
        return false;
    }

    const consumed = await db.queryOne(
        `UPDATE shop_customer_two_factor_codes
         SET used_at = NOW()
         WHERE id = $1
           AND used_at IS NULL
         RETURNING id`,
        [token.id]
    );

    return Boolean(consumed);
}

export async function createShopTrustedDeviceToken(customerId, { userAgent, ip } = {}) {
    if (!customerId) {
        return null;
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashValue(token);

    await db.query(
        `INSERT INTO shop_customer_trusted_devices (
            customer_id,
            token_hash,
            expires_at,
            user_agent,
            ip_address
        ) VALUES (
            $1,
            $2,
            NOW() + ($3 * INTERVAL '1 day'),
            $4,
            $5
        )`,
        [
            customerId,
            tokenHash,
            TRUSTED_DEVICE_TTL_DAYS,
            String(userAgent || "").slice(0, 512) || null,
            String(ip || "").slice(0, 64) || null,
        ]
    );

    return token;
}

export async function isShopTrustedDeviceTokenValid(customerId, token) {
    if (!customerId || !token) {
        return false;
    }

    const tokenHash = hashValue(token);
    const trusted = await db.queryOne(
        `SELECT id
         FROM shop_customer_trusted_devices
         WHERE customer_id = $1
           AND token_hash = $2
           AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1`,
        [customerId, tokenHash]
    );

    if (!trusted) {
        return false;
    }

    await db.query(
        `UPDATE shop_customer_trusted_devices
         SET last_used_at = NOW()
         WHERE id = $1`,
        [trusted.id]
    );

    return true;
}
