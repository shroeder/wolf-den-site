// ── CAN WE STILL DRAW? ───────────────────────────────────────────────────────────────────────────────────────
// 124 scripts in this folder read OPENAI_API_KEY and not one of them could tell you whether it works. That
// gap cost a session: gen-card-art.mjs went to draw eleven card faces, every call came back
//
//     400 — The model 'gpt-image-1' does not exist.
//
// and there was no way to find out WHY without hand-writing a probe. The message is also actively
// misleading: the model exists, it is the ACCOUNT that cannot see it, and a 400 saying "does not exist"
// reads like a typo in the model name rather than a billing or verification problem. Every image generator
// in this repo names that same model, so when this breaks, all 124 break together and silently.
//
// ⚠️ IT NEVER PRINTS THE KEY, and that is the whole reason it is a committed script rather than a one-liner
// somebody pastes into a terminal. It reports length and prefix only, which is enough to tell "rotated" from
// "absent" and not enough to leak.
//
// ⚠️ IT SPENDS NOTHING. /v1/models is a free GET. Nothing here generates an image — proving the key can draw
// by drawing something is how you spend money to learn what a list endpoint tells you for free.
//
// Run:  npm run check:openai
import { readFileSync } from "node:fs";

// The same place every generator in this folder looks. See the note in gen-card-art.mjs.
const PROPS = "C:/Users/Luke/Projects/accounting_app/local.properties";
// What the art pipeline actually asks for. If this is not in the list, nothing in scripts/ can draw.
const NEEDED = "gpt-image-1";

let key = process.env.OPENAI_API_KEY || null;
let from = key ? "the environment" : null;
if (!key) {
    try {
        key = readFileSync(PROPS, "utf8").match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim() || null;
        from = PROPS;
    } catch {
        console.log(`check:openai — could not read ${PROPS}. Is the accounting app checked out?`);
        process.exit(1);
    }
}
if (!key) {
    console.log(`check:openai — no OPENAI_API_KEY in the environment or in ${PROPS}.`);
    process.exit(1);
}

console.log(`key: present, ${key.length} chars, starts "${key.slice(0, 7)}…", read from ${from}`);

const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });

if (!res.ok) {
    const body = await res.text();
    // 401 is a dead/rotated key; 429 with an insufficient_quota code is a billing stop. They are completely
    // different jobs to fix, and the status code is the only thing that separates them.
    console.log(`\nGET /v1/models -> ${res.status}`);
    console.log(body.slice(0, 500));
    console.log(res.status === 401
        ? "\nThe key itself is rejected: rotated, revoked, or mistyped. Issue a new one and update local.properties."
        : "\nThe key is not usable right now. If this mentions quota or billing, the account has stopped paying out.");
    process.exit(1);
}

const ids = (await res.json()).data.map((m) => m.id);
const image = ids.filter((id) => /gpt-image|dall-e/.test(id)).sort();

console.log(`\nGET /v1/models -> 200. The key authenticates and can see ${ids.length} models.`);
console.log(`image models available: ${image.join(", ") || "NONE"}`);

if (image.includes(NEEDED)) {
    console.log(`\ncheck:openai — ${NEEDED} is reachable. The art pipeline can draw.`);
    process.exit(0);
}

// ⚠️ THE KEY WORKS AND THE MODEL IS STILL INVISIBLE, AND THE REASON IS ALMOST NEVER THE ACCOUNT.
// The first version of this script guessed "the organisation is not identity-verified", which is a real
// cause of this exact 400 and was WRONG here — the answer was in the list all along. A model that has been
// RETIRED also answers "does not exist", and when it does, its replacements are sitting in /v1/models next
// to where it used to be. So the script reads the list rather than guessing from the status code.
console.log(`\ncheck:openai — THE KEY WORKS BUT ${NEEDED} IS NOT AVAILABLE TO IT.`);
console.log("Every image generator in scripts/ names that model, so none of them can draw until this is fixed.");

// Successors are anything in the same family that is not the exact string we asked for. If the family is
// still there and our specific version is not, the model was retired out from under us.
const family = NEEDED.replace(/-\d+(\.\d+)?$/, "");
const heirs = image.filter((id) => id.startsWith(family) && id !== NEEDED);

if (heirs.length) {
    console.log(`\nRETIRED, NOT FORBIDDEN. ${heirs.length} newer models in the same family are available:`);
    console.log(`  ${heirs.join("\n  ")}`);
    console.log("\nNothing is wrong with the key, the billing or the organisation — OpenAI withdrew the");
    console.log("version this repo names and the scripts were never told. Point them at a current model.");
    console.log("⚠️ grep for the model name before changing one: it is hardcoded at every call site.");
} else if (image.length) {
    console.log("\nOther image models are visible (listed above) but none in the same family, so this is not a");
    console.log("billing stop. Either the family was withdrawn entirely, or this project's model allowlist");
    console.log("excludes it — platform.openai.com -> your project -> Limits.");
} else {
    console.log("\nNo image model at all is visible. That is usually billing, or an organisation that has not");
    console.log("completed identity verification: platform.openai.com -> Settings -> Organization -> General.");
}
process.exit(1);
