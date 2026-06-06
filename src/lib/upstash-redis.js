import "server-only";

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";

function isUpstashConfigured() {
    return Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
}

async function callRedis(command, args = []) {
    if (!isUpstashConfigured()) {
        return null;
    }

    const segments = [command, ...args].map((value) => encodeURIComponent(String(value)));
    const response = await fetch(`${UPSTASH_REDIS_REST_URL}/${segments.join("/")}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
        },
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`Upstash command failed with status ${response.status}.`);
    }

    const payload = await response.json().catch(() => null);

    if (!payload || payload.error) {
        throw new Error(payload?.error || "Upstash command failed.");
    }

    return payload.result;
}

export const upstashRedis = {
    isConfigured: isUpstashConfigured,
    get: async (key) => callRedis("GET", [key]),
    set: async (key, value, ttlSeconds) => {
        if (!Number.isFinite(Number(ttlSeconds)) || Number(ttlSeconds) <= 0) {
            return callRedis("SET", [key, value]);
        }

        return callRedis("SET", [key, value, "EX", Math.floor(Number(ttlSeconds))]);
    },
    incr: async (key) => callRedis("INCR", [key]),
    expire: async (key, ttlSeconds) => callRedis("EXPIRE", [key, Math.floor(Number(ttlSeconds))]),
    del: async (...keys) => {
        if (!keys.length) {
            return 0;
        }

        return callRedis("DEL", keys);
    },
};
