import "server-only";

import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/consignment/password";

const DUMMY_PASSWORD_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function toPublicCustomer(customer) {
    if (!customer) {
        return null;
    }

    return {
        id: customer.id,
        email: customer.email,
        hasSavedProfile: Boolean(customer.square_customer_id),
    };
}

function toSessionCustomer(customer) {
    if (!customer) {
        return null;
    }

    return {
        id: customer.id,
        email: customer.email,
        hasSavedProfile: Boolean(customer.square_customer_id),
        squareCustomerId: customer.square_customer_id || null,
    };
}

export async function getShopCustomerById(id) {
    if (!id) {
        return null;
    }

    const customer = await db.queryOne(
        `SELECT *
         FROM shop_customer_accounts
         WHERE id = $1 AND active = TRUE`,
        [id]
    );

    return customer || null;
}

export async function getShopCustomerByEmail(email) {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
        return null;
    }

    const customer = await db.queryOne(
        `SELECT *
         FROM shop_customer_accounts
         WHERE email_normalized = $1 AND active = TRUE`,
        [normalizedEmail]
    );

    return customer || null;
}

export async function registerShopCustomer(email, password) {
    const normalizedEmail = normalizeEmail(email);
    const trimmedEmail = String(email || "").trim();

    if (!normalizedEmail) {
        throw new Error("Email is required.");
    }

    if (String(password || "").length < 8) {
        throw new Error("Password must be at least 8 characters.");
    }

    const existing = await getShopCustomerByEmail(normalizedEmail);

    if (existing) {
        const error = new Error("Account already exists for this email.");
        error.code = "account_exists";
        throw error;
    }

    const passwordHash = await hashPassword(password);

    const customer = await db.queryOne(
        `INSERT INTO shop_customer_accounts (
            email,
            email_normalized,
            password_hash
        ) VALUES ($1, $2, $3)
        RETURNING *`,
        [trimmedEmail, normalizedEmail, passwordHash]
    );

    return toPublicCustomer(customer);
}

export async function loginShopCustomer(email, password) {
    const normalizedEmail = normalizeEmail(email);
    const customer = await getShopCustomerByEmail(normalizedEmail);

    if (!customer?.password_hash) {
        await verifyPassword(password, DUMMY_PASSWORD_HASH);
        return null;
    }

    const isValid = await verifyPassword(password, customer.password_hash);

    if (!isValid) {
        return null;
    }

    await db.query(
        `UPDATE shop_customer_accounts
         SET last_login_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [customer.id]
    );

    return toPublicCustomer(customer);
}

export async function updateShopCustomerSquareId(customerId, squareCustomerId) {
    if (!customerId || !squareCustomerId) {
        return null;
    }

    const updated = await db.queryOne(
        `UPDATE shop_customer_accounts
         SET square_customer_id = $2,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [customerId, String(squareCustomerId || "").trim()]
    );

    return toPublicCustomer(updated);
}

export async function getShopCustomerBySessionSubject(customerId) {
    const customer = await getShopCustomerById(customerId);

    return toSessionCustomer(customer);
}
