// Epic naval-clash backdrops for the full-screen RAID battle. Two moods so raids don't feel repetitive.
// Sky fills the top ~60%, churning sea the bottom ~40% (ships + heroes are composited on top in the app).
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const COMMON =
    "Wide cinematic NAVAL BATTLE backdrop for a cartoon mobile game, painterly cel-shaded style with bold shapes and rich saturated color. " +
    "Dramatic towering storm clouds with shafts of god-ray light breaking through, a churning open ocean below with foamy whitecaps and swells, " +
    "faint misty distant islands and a couple of tiny far-off ship silhouettes on the horizon, drifting cannon-smoke haze. " +
    "Epic, moody, high-stakes atmosphere. IMPORTANT: NO ships or characters in the foreground (they are added separately), NO text, NO letters, NO UI, NO watermark. " +
    "Composition: expansive sky filling the upper two-thirds, sea across the lower third, empty center for action.";

const BGS = [
    { file: "raid-bg-day.png", prompt: "Golden-hour stormy clash: warm amber and orange light punching through slate-grey thunderheads, teal-and-gold sea. " + COMMON },
    { file: "raid-bg-night.png", prompt: "Moonlit night clash: deep indigo and violet storm sky, a huge pale moon behind torn clouds, cold cyan moonlight glinting off near-black swells, scattered stars. " + COMMON },
];

for (const b of BGS) {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt: b.prompt, size: "1024x1536", quality: "low", n: 1 }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image for " + b.file);
    await sharp(Buffer.from(b64, "base64")).png().toFile("public/images/sailing/" + b.file);
    console.log("wrote", b.file, fs.statSync("public/images/sailing/" + b.file).size, "bytes");
}
console.log("done");
