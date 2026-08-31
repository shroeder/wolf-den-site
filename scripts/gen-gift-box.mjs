// ── THE LOOT PIG'S GIFT BOX ──────────────────────────────────────────────────────────────────────────────────
// Luke: "maybe we just have him leave you a gift box every day that you get to open, and it has random amounts
// of money and seeds and crops in it ... clicking the gift box opens it up in a modal like opening a chest."
//
// So the box has to do two jobs at two sizes. On the pasture it is 92px among decorations and pets, and it has
// to read as SOMETHING TO TAP rather than as scenery somebody placed — which is why it is a wrapped present
// with a bow and not a crate: a present is the one container shape nobody mistakes for furniture. In the modal
// it is 86px with a burst behind it, so the same drawing carries both.
//
// INTO THE REPO, NOT A TABLE. Every other farm sprite is a mkt_town_art row or a Blob URL, and both of those
// are pictures somebody else's cleanup can take away — see the note in gen-counter-hero.mjs. This one is drawn
// on every member's farm every day, so it goes in public/images/farm and into the commit.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/gen-gift-box.mjs [--quality medium]
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
    "A SINGLE closed gift box sitting on the ground, seen from a three-quarter view slightly above. A square "
    + "wooden crate-lidded present wrapped in deep red cloth with a broad gold ribbon crossing the lid and a "
    + "big gold bow tied on top. Brass corner caps on the box and a warm golden light leaking out from the "
    + "thin seam under the lid, so it reads as full of something. Rustic and farm-made rather than "
    + "birthday-party glossy — this was left in a pasture by a pig.",
    { framing: "sprite", extra: SMALL_ICON_EXTRA
        + " ONE box only — not a stack, not a pile, nothing scattered around it and nothing behind it. The box "
        + "must fill the frame with only a hair of empty space on each side. It is CLOSED: the lid is on and "
        + "the bow is tied. No pig, no animal, no character, no coins spilling out, no open lid, no hands." },
);
realLog("\nquality " + QUALITY + "\n" + prompt + "\n");
const { generateImage } = await import("@/lib/marketplace/openai-image.js");
const url = await generateImage(prompt, {
    size: "1024x1024", quality: QUALITY, pathPrefix: "marketplace/farm", deHalo: true, resizeTo: 384,
    meta: { origin: "script", subject: "farm_gift_box", label: "The Loot Pig's gift box" },
});
if (!url) { realLog("generation failed"); process.exit(1); }
fs.mkdirSync("public/images/farm", { recursive: true });
const out = "public/images/farm/gift-box.webp";
fs.writeFileSync(out, Buffer.from(await (await fetch(url)).arrayBuffer()));
realLog("saved " + out + "  (" + Math.round(fs.statSync(out).size / 1024) + "kb)");
process.exit(0);
