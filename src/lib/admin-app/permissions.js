import "server-only";

/**
 * Permission catalog + role defaults for the admin app (accounting_app) staff login.
 *
 * Effective permissions = role defaults, then per-person overrides applied on top
 * (granted=true adds, granted=false removes). The `owner` role always has everything.
 *
 * Keep ALL_PERMISSIONS in sync with the gating in the Android app and the
 * server-side `requirePermission` checks on each route.
 */

export const ROLES = Object.freeze(["owner", "manager", "staff"]);

export const ALL_PERMISSIONS = Object.freeze([
    "ledger.view",
    "ledger.edit",
    "cash.view",
    "trades.view",
    "trades.edit",
    "cogs.view",
    "cogs.edit",
    "inventory.scan",
    "labels.print",
    "mystery.manage",
    "mystery.report",
    "events.manage",
    "consignors.manage",
    "reports.view",
    "banking.view",
    "ai.use",
    "remediations.run",
    "staff.manage",
    "marketplace.manage",
]);

const PERMISSION_SET = new Set(ALL_PERMISSIONS);

// Role -> default permission keys. `owner` is special-cased to all permissions.
const ROLE_DEFAULTS = Object.freeze({
    owner: ALL_PERMISSIONS,
    manager: Object.freeze([
        "ledger.view",
        "ledger.edit",
        "cash.view",
        "trades.view",
        "trades.edit",
        "cogs.view",
        "cogs.edit",
        "inventory.scan",
        "labels.print",
        "mystery.manage",
        "mystery.report",
        "events.manage",
        "consignors.manage",
        "reports.view",
        "banking.view",
        "ai.use",
    ]),
    staff: Object.freeze([
        "inventory.scan",
        "labels.print",
        "mystery.report",
    ]),
});

export function isValidRole(role) {
    return ROLES.includes(role);
}

export function isValidPermission(key) {
    return PERMISSION_SET.has(key);
}

export function getRoleDefaultPermissions(role) {
    return ROLE_DEFAULTS[role] ? [...ROLE_DEFAULTS[role]] : [];
}

/**
 * Resolve a user's effective permission keys.
 *
 * @param {string} role
 * @param {Array<{permission_key: string, granted: boolean}>} overrides
 * @returns {string[]} sorted, deduped effective permission keys
 */
export function resolveEffectivePermissions(role, overrides = []) {
    if (role === "owner") {
        return [...ALL_PERMISSIONS];
    }

    const effective = new Set(getRoleDefaultPermissions(role));

    for (const override of overrides) {
        const key = override?.permission_key;

        if (!PERMISSION_SET.has(key)) {
            continue;
        }

        if (override.granted) {
            effective.add(key);
        } else {
            effective.delete(key);
        }
    }

    return [...effective].sort();
}

export function hasPermission(effectivePermissions, key) {
    return Array.isArray(effectivePermissions) && effectivePermissions.includes(key);
}
