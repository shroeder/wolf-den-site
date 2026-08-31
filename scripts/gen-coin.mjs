// ── THE GOLD COIN ────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "we need the gold sprite to change. It's like a stack of gold, and we want it to be a gold coin. It
// needs to be large."
//
// The old /images/ui/coin.png is three coins in a pile, and <Coin /> draws it at 16px in the middle of running
// text. At that size a pile is a gold smudge — the three separate discs, the shadow between them and the empty
// corners of the canvas all collapse. One coin filling the frame survives the shrink, which is the whole point
// of SMALL_ICON_EXTRA.
//
// Writes beside the original rather than over it, so the swap is a separate decision after looking at it.
//   node --import ./scripts/lib/register-loader.mjs scripts/gen-coin.mjs [--quality medium]
import fs from "node:fs";

const env = fs.readFileSync("../accounting_app/.env", "utf8");
process.env.DATABASE_URL ||= env.match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g, "");
process.env.BLOB_READ_WRITE_TOKEN ||= env.match(/^BLOB_READ_WRITE_TOKEN=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
process.env.OPENAI_API_KEY ||= fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8")
    .match(/^OPENAI_API_KEY=(.*)$/m)[1].trim();

const realLog = console.log;
console.log = (...a) => { if (typeof a[0] === "string" && a[0].startsWith('{"timestamp"')) return; realLog(...a); };
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : d; };
const QUALITY = arg("--quality", "medium");

const { housePrompt, SMALL_ICON_EXTRA } = await import("@/lib/marketplace/art-style.js");
const prompt = housePrompt(
    "A SINGLE large gold coin, one coin only, seen face-on and filling almost the whole frame. Thick milled "
    + "edge, a raised rim, and a simple bold wolf's-head device struck into the middle of the face. Warm "
    + "yellow gold with a brighter polished highlight across the upper left and a deeper amber shadow at the "
    + "lower right so it reads as metal rather than a flat disc.",
    { framing: "sprite", extra: SMALL_ICON_EXTRA
        + " Draw ONE coin — not a stack, not a pile, not scattered coins, and nothing behind it. The coin must "
        + "fill the frame edge to edge with only a hair of empty space, because it is drawn at sixteen pixels "
        + "inside a line of text and anything smaller than the frame disappears." },
);
realLog("\nquality " + QUALITY + "\n" + prompt + "\n");
const { generateImage } = await import("@/lib/marketplace/openai-image.js");
const url = await generateImage(prompt, {
    size: "1024x1024", quality: QUALITY, pathPrefix: "marketplace/ui", deHalo: true,
    meta: { origin: "script", subject: "ui_coin", label: "The gold coin" },
});
if (!url) { realLog("generation failed"); process.exit(1); }
const out = "public/images/ui/coin-new.png";
fs.writeFileSync(out, Buffer.from(await (await fetch(url)).arrayBuffer()));
realLog("saved " + out + "  (" + Math.round(fs.statSync(out).size / 1024) + "kb)");
realLog("Original left untouched at public/images/ui/coin.png\n");
process.exit(0);
