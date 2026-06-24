import "server-only";

import { createHash } from "node:crypto";

import { upstashRedis } from "@/lib/upstash-redis";

// Mirrors shop-auth-throttle but namespaced for the admin app login.
const ATTEMPT_WINDOW_SECONDS = 15 * 60;
const IDENTITY_MAX_ATTEMPTS = 8;
const IP_MAX_ATTEMPTS = 30;
const LOCKOUT_SECONDS = 20 * 60;

const fallbackAttempts = new Map();
const fallbackLocks = new Map();

function hashKey(value) {
    return createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function identityKey(ip, email) {
    return `admin-app:auth:identity:${hashKey(`${String(ip || "unknown")}|${normalizeEmail(email)}`)}`;
}

function ipKey(ip) {
    return `admin-app:auth:ip:${hashKey(String(ip || "unknown"))}`;
}

function lockKey(baseKey) {
    return `${baseKey}:lock`;
}

function pruneFallbackMap(map) {
    const now = Date.now();

    for (const [key, entry] of map.entries()) {
        if ((entry?.expiresAt || 0) <= now) {
            map.delete(key);
        }
    }
}

async function isBlockedInSharedStore(identityBaseKey, ipBaseKey) {
    if (await upstashRedis.get(lockKey(identityBaseKey))) {
        return true;
    }

    return Boolean(await upstashRedis.get(lockKey(ipBaseKey)));
}

function isBlockedInFallback(identityBaseKey, ipBaseKey) {
    pruneFallbackMap(fallbackLocks);

    return Boolean(fallbackLocks.get(lockKey(identityBaseKey)) || fallbackLocks.get(lockKey(ipBaseKey)));
}

async function recordFailureInSharedStore(baseKey, maxAttempts) {
    const attempts = Number(await upstashRedis.incr(baseKey));

    if (attempts === 1) {
        await upstashRedis.expire(baseKey, ATTEMPT_WINDOW_SECONDS);
    }

    if (attempts >= maxAttempts) {
        await upstashRedis.set(lockKey(baseKey), "1", LOCKOUT_SECONDS);
    }
}

function recordFailureInFallback(baseKey, maxAttempts) {
    pruneFallbackMap(fallbackAttempts);
    pruneFallbackMap(fallbackLocks);

    const attempt = fallbackAttempts.get(baseKey);
    const now = Date.now();
    let count = 1;

    if (attempt && attempt.expiresAt > now) {
        count = Number(attempt.count || 0) + 1;
    }

    fallbackAttempts.set(baseKey, { count, expiresAt: now + ATTEMPT_WINDOW_SECONDS * 1000 });

    if (count >= maxAttempts) {
        fallbackLocks.set(lockKey(baseKey), { expiresAt: now + LOCKOUT_SECONDS * 1000 });
    }
}

export async function isAdminAppAuthTemporarilyBlocked({ ip, email }) {
    const identityBaseKey = identityKey(ip, email);
    const ipBaseKey = ipKey(ip);

    if (upstashRedis.isConfigured()) {
        return isBlockedInSharedStore(identityBaseKey, ipBaseKey);
    }

    return isBlockedInFallback(identityBaseKey, ipBaseKey);
}

export async function recordFailedAdminAppAuthAttempt({ ip, email }) {
    const identityBaseKey = identityKey(ip, email);
    const ipBaseKey = ipKey(ip);

    if (upstashRedis.isConfigured()) {
        await recordFailureInSharedStore(identityBaseKey, IDENTITY_MAX_ATTEMPTS);
        await recordFailureInSharedStore(ipBaseKey, IP_MAX_ATTEMPTS);
        return;
    }

    recordFailureInFallback(identityBaseKey, IDENTITY_MAX_ATTEMPTS);
    recordFailureInFallback(ipBaseKey, IP_MAX_ATTEMPTS);
}

export async function clearFailedAdminAppAuthAttempts({ ip, email }) {
    const identityBaseKey = identityKey(ip, email);
    const ipBaseKey = ipKey(ip);

    if (upstashRedis.isConfigured()) {
        await upstashRedis.del(identityBaseKey, ipBaseKey, lockKey(identityBaseKey), lockKey(ipBaseKey));
        return;
    }

    fallbackAttempts.delete(identityBaseKey);
    fallbackAttempts.delete(ipBaseKey);
    fallbackLocks.delete(lockKey(identityBaseKey));
    fallbackLocks.delete(lockKey(ipBaseKey));
}
