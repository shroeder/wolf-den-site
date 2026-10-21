// ── THE RECIPES THAT HAD NO PICTURE ──────────────────────────────────────────────────────────────────────────
// Luke: "Never show glyphs only ever sprites fix this also."
//
// ⚠️ FOUR OF THE SEVEN RECIPE KINDS HAD NO ART AND FELL BACK TO A LINE GLYPH. Tools and food have had real
// painted sprites since the Grove shipped; backpacks, vaults, plots, decorations and charms were drawn with
// a react-icons outline, so a bench row was a painted poultice sitting directly above a flat yellow
// pictogram of a rucksack. Two of them need nothing drawn at all — ui-bag.webp and ui-vault.webp already
// exist and are the same hand — which leaves these.
//
//   node scripts/gen-craft-items.mjs            # price it and stop
//   node scripts/gen-craft-items.mjs --apply
import fs from "node:fs";
import { quality, priceRun } from "./lib/gen-guard.mjs";
import { housePrompt, SMALL_ICON_EXTRA } from "../src/lib/marketplace/art-style.js";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
const OUT = "public/images/grove";
const APPLY = process.argv.includes("--apply");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ONLY = (arg("--only") || "").split(",").map((s) => s.trim()).filter(Boolean);
const Q = quality();
const SIZE = "1024x1024";   // die-cut objects, drawn at 44px in a bench row

const ITEMS = [
    { id: "item-plot", subject: "A small patch of cleared forest floor turned into dark tilled soil, with "
        + "cut roots and a couple of pulled saplings stacked at its edge and a wooden stake marking a corner." },
    { id: "item-deco_grove_stump", subject: "A wide tree stump with a seat worn smooth into its top and a "
        + "simple spiral pattern carved around its rim, moss in the cracks." },
    { id: "item-deco_grove_lantern", subject: "A hanging lantern made from a dried gourd with holes punched "
        + "through it, glowing faint green-white from the dust inside, on a short iron hook." },
    { id: "item-deco_grove_cairn", subject: "A small stack of flat grey barrow stones balanced into a cairn, "
        + "the top stone scratched with an old mark, a few bones half buried at its base." },
    // ⚠️ ONE PER FLAVOUR, NOT ONE PER MAP. Twelve charms is twelve drawings to say what the name and the
    // bonus already say; the three KINDS are what a player actually chooses between at the door.
    { id: "charm-rarityFind", subject: "A braided cord charm hung with a single clear faceted crystal and two "
        + "small bones, the crystal catching light." },
    { id: "charm-emblemFind", subject: "A braided cord charm hung with a carved bone animal token, a paw mark "
        + "cut into its face, and a tuft of dark fur." },
    { id: "charm-rareSpawn", subject: "A braided cord charm hung with a twisted iron bell and a red feather, "
        + "the bell dark and old." },
];

const pick = ITEMS.filter((s) => !ONLY.length || ONLY.includes(s.id));
const bill = priceRun({ count: pick.length, size: SIZE, quality: Q });
console.log(pick.map((s) => "  " + s.id).join("\n"));
if (!APPLY) { console.log("\nnothing drawn — re-run with --apply"); process.exit(0); }
if (!KEY) { console.error("no OPENAI_API_KEY"); process.exit(1); }

for (const s of pick) {
    const prompt = housePrompt(s.subject, { framing: "sprite", extra: SMALL_ICON_EXTRA });
    process.stdout.write(`${s.id} … `);
    const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: SIZE, quality: Q, n: 1, background: "transparent" }),
    }).then((x) => x.json());
    const b64 = r?.data?.[0]?.b64_json;
    if (!b64) { console.log("FAILED", JSON.stringify(r?.error || r).slice(0, 180)); continue; }
    fs.writeFileSync(`${OUT}/${s.id}.png`, Buffer.from(b64, "base64"));
    console.log("drawn");
}
console.log(`\ndone — about $${bill.toFixed(2)}`);
