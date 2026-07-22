// One-off: generate the buried treasure-chest sprite that gets uncovered tile-by-tile in the dig game.
// Front view, ~3:2 so it slices cleanly across a 3-wide × 2-tall chest footprint. Transparent PNG.
import fs from "node:fs";
const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no key");

const prompt = `A single classic wooden TREASURE CHEST, front 3/4 view, cel-shaded cartoon game asset with bold clean black outlines and rich saturated color, matching a mobile RPG art style. Rounded barrel lid with dark iron bands and shiny brass corner brackets, a big golden lock plate with a keyhole on the front, warm honey-brown wood planks with visible grain, a few gold coins spilling at its base. The chest is closed, centered, fills the frame, sitting flat. Fully TRANSPARENT background — no ground, no scene, no text, just the chest cut out cleanly. Polished, glossy, inviting, clearly reads as treasure (not dirt).`;

const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1536x1024", background: "transparent", quality: "high", n: 1 }),
});
if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
const b64 = (await resp.json())?.data?.[0]?.b64_json;
if (!b64) throw new Error("no image");
fs.writeFileSync("public/images/sailing/dig-chest.png", Buffer.from(b64, "base64"));
console.log("wrote public/images/sailing/dig-chest.png", fs.statSync("public/images/sailing/dig-chest.png").size, "bytes");
