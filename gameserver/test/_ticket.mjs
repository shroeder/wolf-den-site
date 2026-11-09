import { randomUUID, sign } from "node:crypto";

// Mint a ticket for a test client. The harness holds the private key only
// when a human put it in the environment; prod never has it.
export function devTicket(sub = "test-buyer", zone = "ashfall-1") {
    const raw = process.env.RT_TICKET_PRIVATE_KEY;
    if (!raw) throw new Error("RT_TICKET_PRIVATE_KEY is not set - cannot mint a test ticket");
    const pem = raw.includes("BEGIN") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        sub, name: sub, sprite: null, zone,
        aud: "gameserver", iat: now, exp: now + 60, jti: randomUUID(),
    };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${Buffer.from(sign(null, Buffer.from(body), pem)).toString("base64url")}`;
}
