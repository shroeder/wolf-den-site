import fs from "node:fs";
import sharp from "sharp";
const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
const prompt =
    "A colossal, menacing armored war-galleon. Its black iron hull is plated with overlapping green-black " +
    "sea-serpent scales, crowned by a huge roaring green serpent/leviathan figurehead at the bow. Blood-red " +
    "tattered battle sails, rows of glowing bronze cannons jutting from gun-ports, jagged spikes and barbed rams, " +
    "cracks of glowing emerald rune-energy along the hull. Heavy, powerful, intimidating capital ship. " +
    "Cel-shaded cartoon mobile-game asset, bold clean black outlines, rich saturated color, dramatic rim lighting. " +
    "Three-quarter view from the front-right, the BOW pointing to the RIGHT, full sails billowing. " +
    "ABSOLUTELY NO text, NO letters, NO words, NO writing, NO lettering, NO banner text anywhere on the ship or sails. " +
    "The ENTIRE ship inside frame with generous margin on all sides — nothing cropped. " +
    "Fully TRANSPARENT background, clean die-cut, NO background, NO scene, NO water, NO glow halo, NO vignette. Centered.";
const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "high", n: 1 }),
});
if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0,300)}`);
const b64 = (await resp.json())?.data?.[0]?.b64_json;
const t = await sharp(Buffer.from(b64, "base64")).trim({ threshold: 10 }).png().toBuffer();
const m = await sharp(t).metadata();
const pad = Math.round(Math.max(m.width, m.height) * 0.08);
const out = await sharp(t).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r:0,g:0,b:0,alpha:0 } }).png().toBuffer();
await sharp(out).resize(1024,1024,{ fit:"contain", background:{ r:0,g:0,b:0,alpha:0 } }).toFile("public/images/sailing/boat-tier10-leviathan.png");
console.log("wrote leviathan", fs.statSync("public/images/sailing/boat-tier10-leviathan.png").size);
