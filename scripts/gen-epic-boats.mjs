// Generate the two EPIC end-game boat hulls (tier 10 = level 90, tier 11 = level 100).
// Same cel-shaded, bold-outline, bow-facing-RIGHT 3/4 view as the existing tiers, transparent die-cut.
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const STYLE =
    "Cel-shaded cartoon mobile-game asset, bold clean black outlines, rich saturated color, dramatic rim lighting. " +
    "Three-quarter view from the front-right, the BOW (front) pointing to the RIGHT, full sails billowing. " +
    "The ENTIRE ship inside frame with generous empty margin on all sides — nothing cropped, especially mast tops. " +
    "Fully TRANSPARENT background, clean die-cut, absolutely NO background, NO scene, NO water, NO glow halo, NO vignette — just the ship cut out on transparency. Centered.";

const BOATS = [
    {
        file: "boat-tier10-leviathan.png",
        prompt:
            "A colossal, menacing armored war-galleon named the LEVIATHAN DREADNOUGHT. Its black iron hull is plated with " +
            "overlapping green-black sea-serpent scales, crowned by a huge roaring serpent/leviathan figurehead at the bow. " +
            "Blood-red tattered battle sails, rows of glowing bronze cannons jutting from gun-ports, jagged spikes and " +
            "barbed rams, cracks of glowing emerald rune-energy along the hull. Heavy, powerful, intimidating capital ship. " +
            STYLE,
    },
    {
        file: "boat-tier11-celestial.png",
        prompt:
            "A breathtaking, radiant divine flagship named the CELESTIAL WARSHIP — the ultimate legendary vessel. A gleaming " +
            "white-and-gold hull covered in ornate golden filigree and glowing constellation engravings, crystal masts, and " +
            "sails woven from shimmering aurora starlight in teal, violet and gold. A brilliant blazing sun/star figurehead, " +
            "floating banners of light, tiny stars and cosmic sparkles drifting off it, an angelic heavenly aura of pure " +
            "power. Absolutely epic, awe-inspiring, godlike endgame ship. " +
            STYLE,
    },
];

for (const b of BOATS) {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt: b.prompt, size: "1024x1024", background: "transparent", quality: "high", n: 1 }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image for " + b.file);
    const raw = Buffer.from(b64, "base64");
    // Trim transparent margin then re-pad uniformly so the ship is centered with equal breathing room.
    const t = await sharp(raw).trim({ threshold: 10 }).png().toBuffer();
    const m = await sharp(t).metadata();
    const pad = Math.round(Math.max(m.width, m.height) * 0.08);
    const out = await sharp(t).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    await sharp(out).resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toFile("public/images/sailing/" + b.file);
    console.log("wrote", b.file, fs.statSync("public/images/sailing/" + b.file).size, "bytes");
}
console.log("done");
