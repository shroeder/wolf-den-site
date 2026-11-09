import { generateKeyPairSync, randomUUID, sign } from "node:crypto";

import { WebSocket } from "ws";

import { verifyTicket } from "../auth/ticket.js";

// ─────────────────────────────────────────────────────────────────────────
// THE DOOR, AS ASSERTIONS
//
//     npm run rt:ticket          (server must be running, keys set)
//
// ⚠️ A GATE IS ONLY EVIDENCE IF IT CAN BE SEEN TO REFUSE. Checking that a
//    valid ticket is accepted proves almost nothing -- a server that
//    accepts everything passes that test. Every case below is a forgery
//    that MUST be turned away, and the valid ticket is the control that
//    stops the suite passing because the door is simply bricked up.
//
// Six cases, and what each would mean if it got in:
//
//   valid             the control; if this fails the rest proves nothing
//   wrong key         anyone who can run a signer can be anyone
//   tampered payload  edit the `sub` and you are someone else
//   expired           a ticket out of a log works forever
//   wrong audience    a ticket minted for another service is reusable here
//   replayed          one captured ticket admits unlimited connections
// ─────────────────────────────────────────────────────────────────────────

const URL_RT = process.env.RT_URL || "ws://127.0.0.1:8090/ws";
const b64url = (b) => Buffer.from(b).toString("base64url");

const PRIV = process.env.RT_TICKET_PRIVATE_KEY;
if (!PRIV) { console.log("RT_TICKET_PRIVATE_KEY not set"); process.exit(1); }
const privPem = PRIV.includes("BEGIN") ? PRIV : Buffer.from(PRIV, "base64").toString("utf8");

function mint(overrides = {}, keyPem = privPem) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        sub: "test-buyer-1", name: "Tester", sprite: null, zone: "ashfall-1",
        aud: "gameserver", iat: now, exp: now + 60, jti: randomUUID(),
        ...overrides,
    };
    const body = b64url(JSON.stringify(payload));
    return `${body}.${b64url(sign(null, Buffer.from(body), keyPem))}`;
}

const results = [];
const check = (name, pass, detail) => {
    results.push({ name, pass });
    console.log(`  ${pass ? "ok  " : "FAIL"}  ${name.padEnd(30)} ${detail}`);
};

// ── UNIT: the verifier itself ────────────────────────────────────────────
const other = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

check("valid ticket verifies", verifyTicket(mint()).ok === true, "the control");
check("wrong key refused",
    verifyTicket(mint({}, other.privateKey)).reason === "bad_signature", "bad_signature");

const good = mint();
const [body, sig] = good.split(".");
const evil = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
evil.sub = "somebody-else";
check("tampered payload refused",
    verifyTicket(`${b64url(JSON.stringify(evil))}.${sig}`).reason === "bad_signature", "bad_signature");

const past = Math.floor(Date.now() / 1000) - 120;
check("expired ticket refused",
    verifyTicket(mint({ iat: past, exp: past + 60 })).reason === "expired", "expired");
check("wrong audience refused",
    verifyTicket(mint({ aud: "something-else" })).reason === "wrong_audience", "wrong_audience");

const once = mint();
const first = verifyTicket(once);
const second = verifyTicket(once);
check("replay refused", first.ok === true && second.reason === "replayed",
    `first ${first.ok ? "ok" : first.reason}, second ${second.reason}`);

// ── END TO END: does the socket actually enforce it? ─────────────────────
function tryConnect(ticket, label) {
    return new Promise((resolve) => {
        const ws = new WebSocket(URL_RT);
        let settled = false;
        const done = (v) => { if (!settled) { settled = true; try { ws.close(); } catch {} resolve(v); } };
        ws.on("open", () => { if (ticket !== null) ws.send(JSON.stringify({ type: "ticket", ticket })); });
        ws.on("message", (d, isBinary) => {
            if (isBinary) return;
            try {
                const m = JSON.parse(String(d));
                if (m.type === "welcome") done("admitted");
                if (m.type === "denied") done("denied");
            } catch { /* ignore */ }
        });
        ws.on("close", () => done("closed"));
        ws.on("error", () => done("error"));
        setTimeout(() => done("timeout"), 7000);
    });
}

const live = await tryConnect(mint(), "valid");
check("socket admits a valid ticket", live === "admitted", live);

const forged = await tryConnect(mint({}, other.privateKey), "forged");
check("socket refuses a forgery", forged === "denied" || forged === "closed", forged);

// ⚠️ THE SILENT CLIENT IS MEASURED AT THE SERVER, NOT AT THE CLIENT.
//    The obvious probe -- wait for a close event -- measures the proxy, not
//    the server. Measured: the server closes the socket at the 5 second
//    grace mark and the close reaches the client at 5.02s on loopback and
//    10.24s through Fly's proxy, and terminating the connection outright
//    does not change it. That 5 second lag is Fly holding the downstream
//    connection; the app cannot shorten it and nothing it owns is still
//    allocated.
//
//    What actually matters is whether an unauthenticated socket keeps a
//    SERVER slot, and the server reports that itself. So: open one, say
//    nothing, and check the server's own client count returns to where it
//    started.
const healthUrl = (process.env.RT_URL || "ws://127.0.0.1:8090/ws")
    .replace(/^ws/, "http").replace(/\/ws$/, "/health");
const readClients = async () => {
    const r = await fetch(healthUrl, { cache: "no-store" }).catch(() => null);
    return r?.ok ? (await r.json()).clients : null;
};

const before = await readClients();
const silentWs = new WebSocket(process.env.RT_URL || "ws://127.0.0.1:8090/ws");
await new Promise((r) => { silentWs.on("open", r); silentWs.on("error", r); });
const during = await readClients();
await new Promise((r) => setTimeout(r, 6500));     // grace is 5s
const after = await readClients();
try { silentWs.close(); } catch { /* already gone */ }

check("a silent socket takes a slot", during !== null && during > before,
    `clients ${before} -> ${during} while connected`);
check("and the server drops it", after !== null && after <= before,
    `clients back to ${after} after the 5s grace`);

const failed = results.filter((r) => !r.pass);
console.log("");
if (failed.length) { console.log(`DOOR FAILED - ${failed.length} of ${results.length}`); process.exit(1); }
console.log(`DOOR HOLDS - ${results.length} assertions`);
process.exit(0);
