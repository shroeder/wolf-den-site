// BADGE POWER STAT ICONS — the one screen still built entirely out of emoji.
//
// The Badge Power panel lists ~30 bonuses across five domains, and every one was an OS emoji: ⚔️ for Might,
// 🍀 for Seed Luck, 🖐️ for Combo Save. Emoji are the operating system's art, not ours — they render
// differently on every device, they carry no house style, and a grid of thirty of them reads as a settings
// screen rather than a character sheet.
//
// Drawn as ONE family so the grid looks like one thing: same ink weight, same warm palette, same die-cut
// contract as every other sprite in the game. They render at roughly 28px, so each subject is a single bold
// silhouette — no scene, no fine detail, nothing that needs to be read.
//
// Run:  node scripts/gen-bonus-icons.mjs [--force] [--only might,crit_chance]
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/bonus";
fs.mkdirSync(OUT, { recursive: true });

const HOUSE = "Painterly cel-shaded 2D fantasy game-icon art, bold dark INK CONTOUR outlines, rich saturated "
    + "colour, warm torchlit medieval palette, chunky readable silhouette, storybook RPG style.";
// The die-cut contract, minus the halo: sprites are never drawn with a sticker rim or a cast shadow.
const DIE_CUT = "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four "
    + "sides. NO part may touch or run off any edge; draw it SMALLER rather than cropped. ISOLATED as a clean "
    + "die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — NO backdrop, NO scenery, NO ground, "
    + "NO cast shadow, NO glow halo, NO white sticker rim, NO circular badge or frame behind it.";
const NEGATIVE = "No text, no words, no letters, no numbers, no signage, no logo, no watermark, no border.";

// One subject per stat. Written as OBJECTS rather than concepts — "a crossed pair of notched swords" survives
// being 28px tall; "might" does not.
const ICONS = {
    // ── Combat
    might: "two crossed broadswords with bright polished STEEL blades, silver-grey metal, and leather-wrapped grips",
    crit_chance: "a round archery target with a single arrow buried dead centre",
    crit_power: "a jagged orange starburst impact flash, like a shell going off",
    // ── Sailing
    broadside: "a stubby iron cannon firing, a puff of smoke at the muzzle",
    ironclad: "a riveted iron-plated shield with a reinforced band across it",
    plunder: "a fat leather coin purse spilling gold coins",
    bounty: "a small heap of gold doubloons",
    dredge: "a short iron shovel biting into sand",
    trove: "a cut blue-white gemstone with bright facets",
    tailwind: "a curled gust of wind, three sweeping motion lines",
    angling: "a bent fishing rod with a taut line and a hook",
    // ── Farming
    growSpeed: "a green seedling sprouting from dark soil, two bright leaves",
    seedLuck: "a four-leaf clover with a fat stem",
    harvestLuck: "a woven wicker basket heaped with vegetables",
    petXp: "a rounded animal paw print, four toes and a pad",
    fertPower: "a heavy watering can tipped, one thick droplet falling",
    goldHarvest: "a golden wheat sheaf tied with twine",
    // ── The Mine
    nerve: "a stout timber pit-prop bracing a stone roof beam",
    lodesense: "a brass compass with a red needle",
    hew: "a miner's pickaxe with a worn wooden haft",
    prospect: "a lit miner's lantern casting a warm cone",
    bellows: "a leather blacksmith's bellows with wooden handles",
    crucible: "a glowing crucible pouring molten metal",
    // ── The Forge
    efficient: "a blacksmith's hammer and tongs crossed",
    keen_eye: "a jeweller's loupe held over a bright spark",
    masters_touch: "an anvil with two bright sparks leaping off it",
    steady_hand: "a heavy gauntleted hand held open, palm out",
};

const only = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? new Set(process.argv[i + 1].split(",")) : null; })();
const FORCE = process.argv.includes("--force");

let made = 0, skipped = 0;
for (const [id, subject] of Object.entries(ICONS)) {
    if (only && !only.has(id)) continue;
    const dest = `${OUT}/${id}.png`;
    if (fs.existsSync(dest) && !FORCE) { skipped += 1; continue; }
    const prompt = `${subject}. ${DIE_CUT} ${HOUSE} Must read clearly at 28 pixels — strong outline, few large shapes, no fine detail. ${NEGATIVE}`;
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", output_format: "png", quality: "medium", n: 1 }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 140)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${id}: no image returned`); continue; }
    // Trim first so the icon fills its box — art that arrives with baked-in margin renders small and floating
    // in a grid where every other cell is full-bleed.
    const buf = await sharp(Buffer.from(b64, "base64"))
        .trim({ threshold: 6 })
        .resize(192, 192, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(dest, buf);
    made += 1;
    console.log(`  ${id.padEnd(14)} ${(buf.length / 1024).toFixed(0)}kb`);
}
console.log(`\ndrew ${made}, skipped ${skipped} (already on disk; --force to redraw)`);
