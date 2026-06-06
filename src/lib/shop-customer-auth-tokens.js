import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import {
    getShopCustomerByEmail,
    normalizeEmail,
    updateShopCustomerPassword,
    verifyShopCustomerEmail,
} from "@/lib/shop-customers";

const EMAIL_VERIFICATION_TOKEN_TTL_HOURS = 48;
const PASSWORD_RESET_TOKEN_TTL_MINUTES = 60;

function hashToken(token) {
    return createHash("sha256").update(String(token || "")).digest("hex");
}

function createRawToken() {
    return randomBytes(32).toString("hex");
}

export async function createEmailVerificationTokenForCustomer(customerId) {
    if (!customerId) {
        return null;
    }

    const rawToken = createRawToken();
    const tokenHash = hashToken(rawToken);

    await db.query(
        `UPDATE shop_customer_email_verification_tokens
         SET used_at = NOW()
         WHERE customer_id = $1 AND used_at IS NULL`,
        [customerId]
    );

    await db.query(
        `INSERT INTO shop_customer_email_verification_tokens (
            customer_id,
            token_hash,
            expires_at
        ) VALUES (
            $1,
            $2,
            NOW() + ($3 * INTERVAL '1 hour')
        )`,
        [customerId, tokenHash, EMAIL_VERIFICATION_TOKEN_TTL_HOURS]
    );

    await db.query(
        `UPDATE shop_customer_accounts
         SET email_verification_sent_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [customerId]
    );

    return rawToken;
}

export async function consumeEmailVerificationToken(rawToken) {
    const tokenHash = hashToken(rawToken);

    const token = await db.queryOne(
        `SELECT *
         FROM shop_customer_email_verification_tokens
         WHERE token_hash = $1
           AND used_at IS NULL
           AND expires_at > NOW()`,
        [tokenHash]
    );

    if (!token) {
        return null;
    }

    const consumed = await db.queryOne(
        `UPDATE shop_customer_email_verification_tokens
         SET used_at = NOW()
         WHERE id = $1 AND used_at IS NULL
         RETURNING *`,
        [token.id]
    );

    if (!consumed) {
        return null;
    }

    return verifyShopCustomerEmail(token.customer_id);
}

export async function createPasswordResetTokenForEmail(email) {
    const customer = await getShopCustomerByEmail(normalizeEmail(email));

    if (!customer || !customer.email_verified_at) {
        return null;
    }

    const rawToken = createRawToken();
    const tokenHash = hashToken(rawToken);

    await db.query(
        `UPDATE shop_customer_password_reset_tokens
         SET used_at = NOW()
         WHERE customer_id = $1 AND used_at IS NULL`,
        [customer.id]
    );

    await db.query(
        `INSERT INTO shop_customer_password_reset_tokens (
            customer_id,
            token_hash,
            expires_at
        ) VALUES (
            $1,
            $2,
            NOW() + ($3 * INTERVAL '1 minute')
        )`,
        [customer.id, tokenHash, PASSWORD_RESET_TOKEN_TTL_MINUTES]
    );

    await db.query(
        `UPDATE shop_customer_accounts
         SET password_reset_sent_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [customer.id]
    );

    return {
        token: rawToken,
        customer,
    };
}

export async function consumePasswordResetToken(rawToken, nextPassword) {
    if (String(nextPassword || "").length < 8) {
        const error = new Error("Password must be at least 8 characters.");
        error.code = "invalid_password";
        throw error;
    }

    const tokenHash = hashToken(rawToken);
    const token = await db.queryOne(
        `SELECT *
         FROM shop_customer_password_reset_tokens
         WHERE token_hash = $1
           AND used_at IS NULL
           AND expires_at > NOW()`,
        [tokenHash]
    );

    if (!token) {
        return null;
    }

    const consumed = await db.queryOne(
        `UPDATE shop_customer_password_reset_tokens
         SET used_at = NOW()
         WHERE id = $1 AND used_at IS NULL
         RETURNING *`,
        [token.id]
    );

    if (!consumed) {
        return null;
    }

    return updateShopCustomerPassword(token.customer_id, nextPassword);
}
