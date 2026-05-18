import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";

const TOKEN_LENGTH = 32;
const TOKEN_EXPIRY_DAYS = 14;

function generateToken() {
    return randomBytes(TOKEN_LENGTH).toString("hex");
}

function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

export async function createSetupToken(consignorId) {
    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await db.query(
        `INSERT INTO consignor_setup_tokens (consignor_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [consignorId, tokenHash, expiresAt]
    );

    return token;
}

export async function validateSetupToken(rawToken) {
    if (!rawToken) {
        return null;
    }

    const tokenHash = hashToken(rawToken);

    const tokenRecord = await db.queryOne(
        `SELECT id, consignor_id, used_at, expires_at
         FROM consignor_setup_tokens
         WHERE token_hash = $1`,
        [tokenHash]
    );

    if (!tokenRecord) {
        return null;
    }

    if (tokenRecord.used_at) {
        return null;
    }

    if (new Date(tokenRecord.expires_at) < new Date()) {
        return null;
    }

    return {
        id: tokenRecord.id,
        consignorId: tokenRecord.consignor_id,
    };
}

export async function consumeSetupToken(tokenId) {
    await db.query(
        `UPDATE consignor_setup_tokens
         SET used_at = NOW()
         WHERE id = $1`,
        [tokenId]
    );
}

export async function invalidateUnusedSetupTokens(consignorId) {
    await db.query(
        `UPDATE consignor_setup_tokens
         SET used_at = NOW()
         WHERE consignor_id = $1
           AND used_at IS NULL
           AND expires_at > NOW()`,
        [consignorId]
    );
}
