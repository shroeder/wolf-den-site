// Nav menu icons — one die-cut sprite per destination in the "Where to?" grid, replacing the emoji set.
//
// Emoji were never ours: they render differently on every device, carry Apple/Google's art direction rather
// than the Den's, and sit beside real generated sprites everywhere else in the game looking borrowed. These
// compose from art-style.js like every other generator, with SMALL_ICON_EXTRA because a nav icon is read at
// ~18px in the strip and ~28px in the grid.
//
// Sets is deliberately absent: it already reuses the real Warplate Helm item sprite, which beats a new drawing.
//
// Usage:  node scripts/gen-nav-icons.mjs [key ...]     (no args = every missing icon; pass keys to force-redo)
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { housePrompt, SMALL_ICON_EXTRA } from "../src/lib/marketplace/art-style.js";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

// gpt-image-1 returns a 1024² transparent PNG — around 1.8MB each. These are drawn at 18px in the strip and
// 28px in the grid, so shipping the raw output would have put ~43MB of art in the repo to render thumbnails.
// 128px covers 28px at 4× DPI with room to spare.
const ICON_PX = 128;
const shrink = (buf) => sharp(buf)
    .resize(ICON_PX, ICON_PX, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY in accounting_app/local.properties");

const OUT = "public/images/nav";
fs.mkdirSync(OUT, { recursive: true });

// Subjects only — every word about STYLE comes from housePrompt. Each is a concrete object with a loud
// silhouette, because at 18px a scene reads as mud.
const ICONS = {
    // The Compendium: a collector's ledger. Deliberately a BOOK rather than a bag — the screen is a record of
    // everything that exists and what you have found, not another inventory, and the menu should say which.
    // Dungeons has been MAPPED to "delves" in GameNav's sprite table since that table was written, and the
    // file was never drawn — so the one destination whose icon the code insists exists has always quietly
    // fallen back to its emoji. The mirror image of the Compendium bug: a drawing with no mapping.
    delves: "A dark stone stairway descending into the ground between two crumbling pillars, a single torch burning on the wall, deep shadow swallowing the bottom steps",
    compendium: "A thick leather-bound tome lying open, gilded page edges, a red ribbon bookmark, small glowing gemstones and a tiny sword pressed between its pages like specimens",
    town: "A tight cluster of three cosy medieval timber-framed cottages with steep shingled roofs, crooked chimneys and warm golden lit windows, grouped on a small grassy rise",
    boss: "Two heavy fantasy broadswords crossed in an X, ornate cross-guards, leather-wrapped grips, polished steel blades catching the light",
    sailing: "A small single-masted sailing boat with a billowing red-and-cream striped sail and a curved wooden hull, riding one stylised curl of blue water",
    farm: "A plump red barn with a pitched roof and white trim, a leafy green crop sprout growing in the soil beside it",
    spin: "An ornate circular prize wheel seen face-on, divided into alternating jewel-tone wedges with a brass hub and a pointer at the top",
    quests: "An unfurled aged parchment scroll with curled ends, a deep red wax seal, and a feather quill resting across it",
    bounties: "A round archery target of concentric red and white rings with three feathered arrows struck into the bullseye",
    gear: "A heraldic kite shield with a bold chevron device and riveted metal edging, a broadsword angled behind it",
    pets: "A single chunky animal paw print with four rounded toe pads and a large central pad, thick and embossed",
    forge: "A blacksmith's hammer resting head-down on a dark iron anvil, bright orange sparks bursting at the point of contact",
    store: "A wooden market stall with a striped awning, a crate of goods and a hanging lantern",
    creations: "An artist's wooden palette with thick dabs of jewel-tone paint and two brushes crossed behind it",
    trades: "Two hands clasped firmly in a handshake above a small spill of gold coins",
    auction: "A wooden auctioneer's gavel mid-strike on its round sounding block",
    credit: "A neat stack of gold coins beside an upright rounded payment card with an embossed chip",
    rewards: "A two-handled golden trophy cup on a stepped plinth, a laurel sprig curling around its base",
    badges: "A circular gold medal stamped with a star, hanging from a folded ribbon",
    // The first pass stamped a "1" on the podium despite the blanket no-text rule — image models will happily
    // letter a podium unless the blankness is stated as a positive feature of the subject.
    ranks: "A three-step victory podium built from plain smooth stone blocks with completely BLANK unmarked faces, the tallest step in the centre, a bright gold star hovering above it",
    invite: "A wrapped gift box with a large looping ribbon bow and a lifted lid corner",
    // "Character bust" in a fantasy style got two orcs, which reads as an enemy roster rather than your friends.
    friends: "Two friendly cloaked human adventurers shown from the chest up, standing shoulder to shoulder, one slightly behind the other, warm approachable faces",
    inbox: "A sealed envelope with a folded flap and a round red wax seal",
    home: "A heraldic shield crest bearing a bold stylised wolf head in profile",
    customize: "An ornate hand mirror with a scrolled metal frame, a paintbrush crossed behind it",
    fishing: "A wooden fishing rod angled across the frame with a taut line and a bright red-and-white float bobbing below it",
    profile: "A single hooded human adventurer shown from the chest up, framed inside a thick ornate circular ring like a portrait medallion",
    // The Market must not be another storefront: `store` is ALREADY "a wooden market stall with a striped
    // awning", and at 18px two awnings are the same icon. So this one is the GOODS rather than the building —
    // which is also what the screen is actually about, members trading produce and catch between themselves.
    // Distinct at a glance from store (awning), trades (handshake) and auction (gavel).
    market: "A woven wicker basket brimming with fresh produce — orange carrots, leafy greens and a ripe red apple — with a single silver fish laid across the rim and two gold coins leaning against the base",
    // The Casino. A CABINET rather than cards or dice: the floor is nine slot machines and one card table, so
    // the machine is what the place actually is — and at 18px a fanned hand of cards is a smudge while a lit
    // box with three symbols in a window is a silhouette. Deliberately not a die (the Daily Spin owns
    // "gambling shape") and not a coin (the store and the credit screen both already lean on gold discs).
    casino: "A small ornate slot machine cabinet seen straight on, its glass showing three glowing symbols in a row, a fat red-knobbed lever on the right side, gold trim around the frame and a lit marquee arch on top",
};

const want = process.argv.slice(2);
const todo = Object.keys(ICONS).filter((k) => (want.length ? want.includes(k) : !fs.existsSync(path.join(OUT, `${k}.png`))));
if (!todo.length) { console.log("nothing to do — every icon already exists (pass keys to force-redo)"); process.exit(0); }
console.log(`generating ${todo.length}: ${todo.join(", ")}`);

async function one(k) {
    const prompt = housePrompt(ICONS[k], { extra: SMALL_ICON_EXTRA });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const resp = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
                // medium, not high: "high" is ~4x the price and the extra detail dies in the downscale (see art-style.js).
                body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "low", n: 1 }),
            });
            if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
            const b64 = (await resp.json())?.data?.[0]?.b64_json;
            if (!b64) throw new Error("no image in response");
            const file = path.join(OUT, `${k}.png`);
            fs.writeFileSync(file, await shrink(Buffer.from(b64, "base64")));
            console.log(`✓ ${k} (${Math.round(fs.statSync(file).size / 1024)}kb)`);
            return true;
        } catch (e) {
            console.log(`… ${k} attempt ${attempt} failed: ${e.message}`);
            if (attempt === 3) { console.log(`✗ ${k} GAVE UP`); return false; }
            await new Promise((r) => setTimeout(r, 4000 * attempt));
        }
    }
    return false;
}

// Three at a time: fast enough to finish in a few minutes, gentle enough not to trip image rate limits.
const queue = [...todo];
const results = [];
await Promise.all(Array.from({ length: 3 }, async () => {
    for (let k = queue.shift(); k; k = queue.shift()) results.push([k, await one(k)]);
}));

const failed = results.filter(([, ok]) => !ok).map(([k]) => k);
console.log(`\nDONE — ${results.length - failed.length}/${results.length} written to ${OUT}`);
if (failed.length) { console.log(`FAILED: ${failed.join(", ")}`); process.exit(1); }
