// The one drawing Sable's recipe page needed. Everything else in her case has art; the page arrived as a grey
// circle beside a 59,100-chip price, which was the most expensive blank on the screen.
// Usage: node scripts/gen-vip-page.mjs
import fs from "node:fs";
import { housePrompt } from "../src/lib/marketplace/art-style.js";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const pick = (src, k) => src.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const OPENAI = pick(props, "OPENAI_API_KEY") || pick(env, "OPENAI_API_KEY");
if (!OPENAI) throw new Error("no OPENAI_API_KEY");

const prompt = housePrompt(
    "a single torn recipe page from an old cookbook, thick cream parchment with a burnt lower edge, dense "
    + "handwritten script and a small ink sketch of a dish, one corner sealed with a dark red wax stamp — "
    + "the page a fence would sell you rather than one from a kitchen shelf",
    { extra: "A single object on transparent background, seen straight on, no hands and no table under it." },
);

const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "low", n: 1 }),
});
if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
const b64 = (await resp.json())?.data?.[0]?.b64_json;
fs.writeFileSync("public/images/casino/vip-page.png", Buffer.from(b64, "base64"));
console.log("wrote public/images/casino/vip-page.png");
