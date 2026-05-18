import "server-only";

import bcryptjs from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(plaintext) {
    return bcryptjs.hash(plaintext, SALT_ROUNDS);
}

export async function verifyPassword(plaintext, hash) {
    return bcryptjs.compare(plaintext, hash);
}
