// Generate the fifteen PIRATE FLEET hulls — the ladder ship battles are fought against (see fleet.js).
//
// Same recipe as the player's own boat tiers (gen-epic-boats.mjs): cel-shaded, bold outline, die-cut on
// transparency. One deliberate difference — these ships face LEFT, because the enemy sits on the RIGHT of the
// battle stage and a fleet that all faces the wrong way has to be mirrored in CSS, which flips its lighting.
//
// Rules that are not negotiable (they have cost re-rolls before): no sticker rim, no white outline glow, no
// drop shadow, no background, no water. A die-cut sprite composites onto the scene; anything baked around the
// edge shows up as a halo the moment it sits on the sea.
//
//   node scripts/gen-fleet-ships.mjs            # only the ones missing
//   node scripts/gen-fleet-ships.mjs --force    # redraw everything
//   node scripts/gen-fleet-ships.mjs fleet_cutter fleet_boss_tithe
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT_DIR = "public/images/fleet";
const STYLE =
    "Cel-shaded cartoon mobile-game asset, bold clean black outlines, rich saturated color, dramatic rim lighting. " +
    "Three-quarter view from the front-left, the BOW (front) pointing to the LEFT, sails set. " +
    "The ENTIRE ship inside frame with generous empty margin on all sides — nothing cropped, especially mast tops. " +
    "Fully TRANSPARENT background, clean die-cut, absolutely NO background, NO scene, NO water, NO sky, " +
    "NO glow halo, NO white outline, NO sticker rim, NO drop shadow, NO vignette — just the ship cut out on " +
    "transparency. Centered.";

const SHIPS = [
    { key: "fleet_cutter", prompt: "A small shabby fishing cutter turned pirate: patched brown sail, peeling paint, two mismatched cannons lashed to the open deck with rope. Scruffy, low, barely seaworthy." },
    { key: "fleet_sloop", prompt: "A fast low smuggler's sloop, dark green hull with a single raked mast, narrow and sleek, barrels and crates roped down on deck, a small black pennant." },
    { key: "fleet_lugger", prompt: "A weathered coastal lugger with three stubby masts and tan lugsails, wide-beamed, cannons run out along a cluttered deck, fishing nets hung on the rail." },
    { key: "fleet_brig", prompt: "A squat iron-plated gun brig, grey mismatched armour plates bolted along the waterline, six black cannons, smoke-stained sails, brutal and utilitarian." },
    { key: "fleet_boss_revenge", boss: true, prompt: "SALT MEG'S REVENGE — a fearsome pirate brigantine with deep crimson sails, a snarling wolf-skull figurehead, chain-shot racks along the rail and coiled boarding grapnels. Menacing, well-kept, clearly a captain's ship." },
    { key: "fleet_schooner", prompt: "A tall lean two-masted schooner with pale grey sails, a thin crew, elegant lines, a long bowsprit, faded blue hull with gold trim worn to bare wood." },
    { key: "fleet_corvette", prompt: "A heavy corvette bristling with mortars and shell racks, scorched black hull, smoke curling from a deck furnace, iron-banded masts, dangerous and soot-stained." },
    { key: "fleet_frigate", prompt: "A privateer frigate flying a tattered letter-of-marque pennant, deep navy hull with a gold stripe, two gun decks, ornate stern windows, disciplined and prosperous." },
    { key: "fleet_heavy", prompt: "A slow armoured heavy frigate, thick oak sides layered with iron bands, a blunt reinforced bow ram, small high sails, unmistakably built to out-last rather than out-run." },
    { key: "fleet_boss_tithe", boss: true, prompt: "THE BLACK TITHE — a huge black ship of the line, three gun decks of bronze cannons, black sails edged in dull gold, a hooded skeletal tax-collector figurehead holding scales. Grim, enormous, oppressive." },
    { key: "fleet_razee", prompt: "A razee warship — a ship of the line cut down by one deck for speed. Heavy hull, low profile, oversized sail plan, chain-shot bundles stacked on deck, dark red and black." },
    { key: "fleet_ghost", prompt: "A ghostly derelict brig: translucent pale blue-green glowing hull, shredded phantom sails, no crew visible, drifting green witch-fire along the rigging, eerie and beautiful." },
    // "COLOSSAL" and "built around" were taken literally: the mortar came back bigger than the hull carrying
    // it, sitting on the deck like a prop rather than a weapon a ship could mount. It is a ketch with a heavy
    // mortar ON it now, with the size stated in relation to the deck so the model has a bound to work to.
    { key: "fleet_bomb", prompt: "A squat two-masted bomb ketch. A heavy short iron mortar sits in a reinforced well amidships, angled up — the mortar is SMALL relative to the ship, no taller than the deck rail and about one fifth of the hull's length, mounted low and set INTO the deck rather than towering over it. Reinforced hull, shell racks along the bulwark, blast-scarred planking, stubby masts pushed to the ends. The SHIP is the subject and dominates the frame; the mortar is one piece of equipment on it." },
    { key: "fleet_manowar", prompt: "A towering man-o'-war, three full decks of guns, white sails with a naval crest, ornate gilded stern gallery, pristine and overwhelming in scale." },
    { key: "fleet_boss_sovereign", boss: true, prompt: "ADMIRAL VANE'S SOVEREIGN — the fleet flagship. A vast black-and-gold warship with four decks of guns, blood-red sails bearing a golden crown, a crowned sea-dragon figurehead, lanterns blazing along the stern. Awe-inspiring, unmistakably the final ship." },
];

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const s of SHIPS) {
    if (only.length && !only.includes(s.key)) continue;
    const file = `${OUT_DIR}/${s.key}.png`;
    if (!force && fs.existsSync(file)) { console.log("skip (exists):", s.key); continue; }
    const prompt = `${s.prompt} ${s.boss ? "This is a BOSS ship — larger, richer and more detailed than the rest of the fleet. " : ""}${STYLE}`;
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "low", n: 1 }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image for " + s.key);
    const raw = Buffer.from(b64, "base64");
    // Trim the transparent margin, then re-pad evenly, so every hull is centred and they all read at the same
    // scale on the battle stage regardless of how the model framed it.
    const t = await sharp(raw).trim({ threshold: 10 }).png().toBuffer();
    const m = await sharp(t).metadata();
    const pad = Math.round(Math.max(m.width, m.height) * 0.06);
    const padded = await sharp(t).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    await sharp(padded).resize(768, 768, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toFile(file);
    console.log("wrote", s.key, fs.statSync(file).size, "bytes");
}
console.log("done");
