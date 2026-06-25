import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Reversible encryption for per-tenant integration secrets (Square/Plaid tokens)
 * stored in the DB. AES-256-GCM with a random 12-byte IV per blob.
 *
 * Blob format (self-describing for future rotation): "v1:<iv_b64>:<tag_b64>:<ct_b64>".
 *
 * Key comes from INTEGRATION_ENCRYPTION_KEY — 32 bytes, supplied as hex (64 chars)
 * or base64. Losing/rotating this key orphans all stored credentials.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = "v1";

let cachedKey = null;

function getKey() {
    if (cachedKey) {
        return cachedKey;
    }

    const raw = (process.env.INTEGRATION_ENCRYPTION_KEY || "").trim();

    if (!raw) {
        throw new Error("Missing INTEGRATION_ENCRYPTION_KEY environment variable.");
    }

    let key;

    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
        key = Buffer.from(raw, "hex");
    } else {
        key = Buffer.from(raw, "base64");
    }

    if (key.length !== 32) {
        throw new Error("INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes (hex or base64).");
    }

    cachedKey = key;

    return cachedKey;
}

export function encryptSecret(plaintext) {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(blob) {
    if (typeof blob !== "string") {
        throw new Error("Invalid encrypted blob.");
    }

    const [version, ivB64, tagB64, ctB64] = blob.split(":");

    if (version !== VERSION || !ivB64 || !tagB64 || !ctB64) {
        throw new Error("Unrecognized encrypted blob format.");
    }

    const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));

    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ctB64, "base64")),
        decipher.final(),
    ]);

    return plaintext.toString("utf8");
}

/** Convenience helpers for storing/reading a JSON credential object. */
export function encryptJson(value) {
    return encryptSecret(JSON.stringify(value));
}

export function decryptJson(blob) {
    return JSON.parse(decryptSecret(blob));
}
