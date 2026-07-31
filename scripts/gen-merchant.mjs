// Regenerate the Gold Merchant — clean die-cut, FULL figure (hat to boots) with generous margin, transparent.
import fs from "node:fs";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history
const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no key");

const prompt = `A jolly, portly gentleman GOLD MERCHANT, full body head-to-toe, standing facing forward with both arms raised out to his sides as he cheerfully tosses shiny gold coins into the air. He wears a bright golden-yellow three-piece suit, a matching tall golden TOP HAT (the entire rounded top of the hat fully visible), a big curly brown handlebar moustache, a red bow tie, and brown shoes. Cel-shaded cartoon mobile-game mascot style, bold clean black outlines, rich saturated color, friendly and inviting. IMPORTANT: the ENTIRE character must be inside the frame with generous empty space/margin on ALL sides — nothing cropped, especially the top of his hat and his feet. Fully TRANSPARENT background, clean die-cut, absolutely NO background, NO scene, NO glow, NO vignette, NO shadow halo — just the character cut out cleanly on transparency. Centered.`;

const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1536", background: "transparent", quality: "low", n: 1 }),
});
if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
const b64 = (await resp.json())?.data?.[0]?.b64_json;
if (!b64) throw new Error("no image");
fs.writeFileSync("public/images/sailing/merchant.png", Buffer.from(b64, "base64"));
console.log("wrote merchant.png", fs.statSync("public/images/sailing/merchant.png").size, "bytes");
