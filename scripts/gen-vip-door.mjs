// The bouncer at the rope, and the pass that gets you past him.
//
// Luke: "I think that there should be a bouncer in front of the door." The rope alone is a piece of furniture
// and a furniture cannot refuse you — a door with somebody standing at it is a door with a rule.
//
// Usage: node scripts/gen-vip-door.mjs
import fs from "node:fs";
import sharp from "sharp";

import { housePrompt } from "../src/lib/marketplace/art-style.js";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const pick = (src, k) => src.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const OPENAI = pick(props, "OPENAI_API_KEY") || pick(env, "OPENAI_API_KEY");
if (!OPENAI) throw new Error("no OPENAI_API_KEY");

// FRAMING, the same clause the cabinets needed: whole subject, clear air on every side. Five machines shipped
// amputated because nobody said this out loud in the prompt.
const FRAMING = " The ENTIRE figure must be inside the frame with clear empty space above the head and below "
    + "the feet — nothing touching or running off any edge. Centred, whole, with room around it.";

const JOBS = {
    "vip-bouncer": {
        file: "public/images/casino/vip-bouncer.webp", size: 384,
        prompt: housePrompt(
            "A broad, calm fantasy casino DOORMAN standing squarely at rest, seen straight on from the front: "
            + "a heavyset anthropomorphic bull in a well-cut dark burgundy dinner jacket with gold trim, a black "
            + "bow tie, one brass earring, arms folded across his chest, a small velvet rope clip on his lapel. "
            + "Unbothered rather than aggressive — the expression of somebody who has heard every excuse and is "
            + "not going to hear a new one tonight. Warm lamplight from one side. He is drawn SMALL in the "
            + "frame: his HORNS and the top of his head must have a wide band of empty space above them, and his "
            + "shoes a wide band below."
            + FRAMING,
        ),
    },
    "vip-pass": {
        file: "public/images/casino/perks/vip-pass.webp", size: 320,
        prompt: housePrompt(
            "A single ornate CASINO MEMBERSHIP CARD seen straight on, floating: thick black lacquered card stock "
            + "with a heavy gold bevelled edge, a gold wolf-head crest embossed in the centre, fine guilloche "
            + "line-work in the background of the card, and a small violet gemstone set into one corner. It "
            + "catches the light like something expensive. Absolutely NO letters, NO words, NO numbers on it."
            + " The ENTIRE card inside the frame with clear space on every side.",
        ),
    },
};

for (const [key, job] of Object.entries(JOBS)) {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt: job.prompt, size: "1024x1024", background: "transparent", quality: "low", n: 1 }),
    });
    if (!resp.ok) throw new Error(`${key}: OpenAI ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    const buf = Buffer.from(b64, "base64");
    fs.mkdirSync(job.file.replace(/\/[^/]+$/, ""), { recursive: true });
    await sharp(buf).resize(job.size, job.size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 88 }).toFile(job.file);
    // The edge check the cabinets taught us, run here rather than after somebody notices on a phone.
    const { data, info } = await sharp(fs.readFileSync(job.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let top = 0;
    for (let x = 0; x < info.width; x += 1) if (data[x * info.channels + 3] > 24) top += 1;
    console.log(`${key} → ${job.file}  top-row opaque ${top}${top ? "  ⚠ touches the top edge" : "  ok"}`);
}
