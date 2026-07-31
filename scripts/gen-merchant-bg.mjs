// One-off: generate the Gold Merchant's beach-cove background (opaque landscape).
// Reads OPENAI_API_KEY from accounting_app/local.properties. Saves to public/images/sailing/merchant-bg.png.
import fs from "node:fs";
import path from "node:path";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no key");

const prompt = `A vibrant hand-drawn cartoon game background, cel-shaded with bold clean black outlines and rich saturated color, matching a mobile RPG art style. Scene: a sunny tropical treasure-island beach cove at warm golden hour. A curve of pale golden sand in the foreground, gentle turquoise sea with soft foamy waves behind it, a couple of leaning palm trees framing the sides, a few weathered wooden treasure chests and scattered gold coins half-buried in the sand, distant small islands on the horizon, a big warm glowing sun low in a peachy-gold sky with soft clouds. Empty stage — NO people, NO characters, NO text. Painterly polished cartoon illustration, inviting and magical, centered open sandy area in the middle foreground for a character to stand.`;

const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1536x1024", background: "opaque", quality: "high", n: 1 }),
});
if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
const data = await resp.json();
const b64 = data?.data?.[0]?.b64_json;
if (!b64) throw new Error("no image");
const out = path.resolve("public/images/sailing/merchant-bg.png");
fs.writeFileSync(out, Buffer.from(b64, "base64"));
console.log("wrote", out, fs.statSync(out).size, "bytes");
