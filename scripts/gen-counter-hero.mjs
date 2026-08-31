// ── THE CHAMPION ON THE COUNTER SCREEN ───────────────────────────────────────────────────────────────────────
// Luke: "I think we throw away generated sprites so we would need to enshrine it so that we don't get it lost
// from underneath us ... maybe you could just generate a hero using like all the primordial gear and just make
// a profile or something, so we can generate one of the most badass looking heroes possible."
//
// He is right on both counts.
//
// A MEMBER'S HERO IS NOT A STABLE ASSET. `mkt_buyer.avatar_sprite_url` is replaced every time that member
// changes their gear or edits their avatar — the sprite is REDRAWN and the old Blob is orphaned. Pointing a
// shop screen at one means the picture on the wall changes when somebody swaps a hat, and eventually 404s.
// It is also somebody else's likeness on a marketing screen, which is not ours to spend.
//
// So this draws a hero who belongs to nobody, wearing the best gear in the game, and writes it into the REPO
// as a static file. public/images/counter/ is version-controlled: no table, no Blob, no sweep, no expiry.
//
// Usage:  node --import ./scripts/lib/register-loader.mjs scripts/gen-counter-hero.mjs [--quality high]
import fs from "node:fs";
import path from "node:path";

const env = fs.readFileSync("../accounting_app/.env", "utf8");
process.env.DATABASE_URL ||= env.match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g, "");
process.env.BLOB_READ_WRITE_TOKEN ||= env.match(/^BLOB_READ_WRITE_TOKEN=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
process.env.OPENAI_API_KEY ||= fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8")
    .match(/^OPENAI_API_KEY=(.*)$/m)[1].trim();

const realLog = console.log;
console.log = (...a) => { if (typeof a[0] === "string" && a[0].startsWith('{"timestamp"')) return; realLog(...a); };
const arg = (f, d = null) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : d; };
const QUALITY = arg("--quality", "high");

const { ITEMS } = await import("@/lib/marketplace/items.js");
// The top of the ladder, one per slot. Named from ITEMS so the champion is wearing gear that actually exists
// — if somebody authors a rarity above primordial later, this picks it up rather than going stale.
const SLOTS = ["main_hand", "off_hand", "helmet", "chest", "belt", "boots", "back"];
const best = SLOTS.map((slot) => ITEMS
    .filter((i) => i.slot === slot && i.rarity === "primordial")
    .sort((a, b) => (b.sort || 0) - (a.sort || 0))[0]).filter(Boolean);
realLog("\nWearing:");
best.forEach((i) => realLog(`  ${i.slot.padEnd(10)} ${i.name}`));

// Not the member prompt — there is no reference face to preserve here, and no avatar config. This is the same
// STYLE (so the champion stands in the same world as the 88 member heroes) with the gear described instead.
const prompt = `A full-body 2D video-game HERO character: a battle-scarred champion at the peak of their power, `
    + `standing in a confident heroic pose shown from a three-quarter view facing to the RIGHT. `
    + `They are clad head to toe in the finest primordial armour in the realm — ${best.map((i) => i.name).join(", ")} — `
    + `ancient blackened metal shot through with veins of molten orange light, a long cloak caught mid-motion, `
    + `a great glowing blade raised ready in one hand and a heavy rune-lit shield on the other arm. `
    + `Embers drift around them. The face is obscured beneath the helm so this is ANY hero, not one person. `
    + `FRAMING: the ENTIRE figure must fit INSIDE the image with clear empty space on all four sides — roughly `
    + `8% of the image empty above the head and below the feet. Nothing may touch or run off any edge: not the `
    + `helm or crown, not the feet, not the cloak or the raised weapon. Draw the figure SMALLER rather than `
    + `cropping any part of it. ONE WEAPON PER HAND AND NO DUPLICATES: the blade is held in ONE hand and does `
    + `not also appear sheathed or duplicated; the shield is on the other arm. `
    + `2D video-game character art, bold stylized illustration, clean confident outlines, cel-shaded flat `
    + `vibrant colors, strong readable silhouette, centered full-body character splash art, polished RPG `
    + `game-art style, clean coherent anatomy, no extra or malformed limbs, no visual artifacts, transparent `
    + `background, no text, no logo, no watermark, no border. CRITICAL: the character must be oriented facing `
    + `and looking toward the RIGHT side of the image — NOT facing forward and NOT facing left.`;

realLog(`\nquality ${QUALITY}\n`);
const { generateImage } = await import("@/lib/marketplace/openai-image.js");
const url = await generateImage(prompt, {
    size: "1024x1024", quality: QUALITY, pathPrefix: "marketplace/counter", deHalo: true, faceRight: true,
    meta: { origin: "script", subject: "counter_hero", label: "Counter screen — the champion" },
});
if (!url) { realLog("generation failed"); process.exit(1); }

// ── AND INTO THE REPO, NOT A TABLE ───────────────────────────────────────────────────────────────────────────
// The whole point. A Blob URL in a row is a picture somebody else's cleanup can take away; a file in
// public/images/counter is in the commit.
const outDir = "public/images/counter";
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "hero.webp");
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
fs.writeFileSync(out, buf);
realLog(`saved ${out}  (${Math.round(buf.length / 1024)}kb)`);
realLog("Committed as a static asset — no table, no sweep, no expiry.\n");
process.exit(0);
