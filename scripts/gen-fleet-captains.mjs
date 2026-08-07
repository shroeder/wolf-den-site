// Generate a CAPTAIN for every ship in the pirate fleet.
//
// Your own ship carries your hero sprite and your pet on deck; the enemy carried nobody, which made every
// fleet battle a fight against an empty boat. A ship with a person on it is something you beat — an empty hull
// is scenery you shot at.
//
// Same recipe as the arena NPCs (gen-arena-npcs.mjs): painterly cel-shaded, die-cut on transparency, FACING
// RIGHT. The battle scene mirrors the enemy's crew, so drawing them facing right is what makes them end up
// looking at your ship rather than off the back of their own.
//
// Small on screen — 42px on the deck — so these lean on silhouette and one strong colour rather than detail.
//
//   node scripts/gen-fleet-captains.mjs            # only the ones missing
//   node scripts/gen-fleet-captains.mjs --force    # redraw everything
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/fleet/crew";
fs.mkdirSync(OUT, { recursive: true });

const STYLE = "Painterly cel-shaded 2D video-game art, bold clean dark outlines, chunky readable silhouette, high contrast, vibrant colors, soft inner shading, fantasy action-RPG style.";
// The first pass asked for "full body" and enforced margins after the fact, and 9 of 15 still came back with
// the legs stopping flat at the shin — no ankles, no feet. Margins were not the problem: trimming to the
// content box and padding it gave every one of them a healthy 38px border, which is exactly why a margin
// audit passed them. A bounding box cannot tell a complete figure from an amputated one that has been neatly
// centred, and centring the truncation is what made it read as deliberate clipping on the ship.
// So the lower body has to be demanded explicitly, and named part by part — this model will drop whatever the
// prompt does not insist on.
const CUTOUT = "FULL FIGURE, head to feet, standing on deck in a ready stance, facing right. The COMPLETE lower body MUST be drawn: hips, both thighs, both knees, both shins, both ankles and BOTH FEET/BOOTS fully visible and planted on the ground. Do NOT crop, cut, fade or omit the legs or feet, and do not stop the figure at the waist, thigh or shin — a half figure is wrong. The ENTIRE figure must fit INSIDE the frame with clear empty space on all four sides — roughly 8% empty above the head and 8% below the soles of the feet, and no part of the character, weapon, coat or hat may touch any edge. Draw the figure SMALLER rather than leaving any part of it out. ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — absolutely NO backdrop, NO scenery, NO deck, NO ground, NO cast shadow, NO glow halo, NO white sticker rim. No text, no words, no letters, no logo, no watermark, no border.";
const P = (s) => `A single PIRATE CAPTAIN character for a ship battle. ${s} ${STYLE} ${CUTOUT}`;

// One per fleet ship (fleet.js). The three bosses are named characters and get the detail; the rest are the
// sort of crew you would actually find on that hull.
const CAPTAINS = {
    fleet_cutter: P("A scruffy young fisherman turned pirate in a patched oilskin coat and a battered wool cap, clutching an old boarding axe he clearly does not know how to use, nervous."),
    fleet_sloop: P("A wiry smuggler in a loose linen shirt and a red sash, gold rings, a flintlock pistol tucked in his belt, grinning like he has already sold you something."),
    fleet_lugger: P("A weathered old fisherwoman in a heavy knit sweater and sea boots, grey braid, holding a short blunderbuss, utterly unimpressed."),
    fleet_brig: P("A broad iron-jawed gunner in a soot-stained leather apron and heavy gloves, one arm braced on a rammer, goggles pushed up on his forehead."),
    fleet_boss_revenge: P("SALT MEG — a fearsome pirate captain in a deep crimson longcoat with a wolf-pelt collar, tricorn hat, one silver-ringed hand on a cutlass, a coil of chain over her shoulder. Commanding and unbothered."),
    fleet_schooner: P("A lean quartermaster in a faded blue coat with brass buttons, spyglass in hand, thin and tired but precise."),
    fleet_corvette: P("A soot-blackened bombardier in scorched leathers and a heavy hood, holding a smoking fuse, half his beard burnt away."),
    fleet_frigate: P("A privateer captain in a fine navy coat with gold braid, plumed hat, letter of marque rolled in one hand and a rapier in the other, aristocratic."),
    fleet_heavy: P("A huge armoured bosun in banded iron over sea leathers, arms crossed, a maul slung across his back, immovable."),
    fleet_boss_tithe: P("THE TITHE COLLECTOR — a gaunt hooded figure in black robes edged in dull gold, a brass scale hanging from one hand, skeletal fingers, face lost in shadow. Grim and patient."),
    fleet_razee: P("A brutal raider captain in cut-down black and red armour, shaven head, twin boarding hooks, chain wrapped around one forearm."),
    fleet_ghost: P("A translucent ghostly helmsman in tattered spectral naval uniform, glowing pale green, hollow eyes, one hand still on a wheel that is not there."),
    fleet_bomb: P("A wild-eyed mortar master in a heavy blast apron and ear defenders, arms full of fuses, delighted."),
    fleet_manowar: P("A stern naval commodore in a pristine white and gold uniform with a bicorn hat, hands behind his back, sword at his hip, utterly certain of himself."),
    fleet_boss_sovereign: P("ADMIRAL VANE — a towering figure in black armour chased with gold, a crimson admiral's cloak, a crowned helm under one arm, a golden sabre in hand. The final opponent: regal, cold, unmistakably the best of them."),
};

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));

// The margin the prompt only ASKS for, enforced after the fact — the arena learned this the hard way when
// seven of ten sprites came back with the plume sliced off the helmet.
async function frame(buf) {
    const t = await sharp(buf).trim({ threshold: 10 }).png().toBuffer();
    const m = await sharp(t).metadata();
    const pad = Math.round(Math.max(m.width, m.height) * 0.09);
    const padded = await sharp(t).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return sharp(padded).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

// ── FACING ───────────────────────────────────────────────────────────────────────────────────────────────────
// This matters more than it looks. The battle scene MIRRORS the enemy's crew (ShipBattleScene passes
// scaleX(-1) on the foe side) on the assumption that every sprite is drawn facing RIGHT — so one that comes
// back facing left gets flipped to face AWAY from the ship it is fighting, and the captain stares off the back
// of his own boat.
//
// The prompt asks for right-facing and the model obeys most of the time. The obvious next move is to detect
// the strays automatically, and it does NOT work: a gpt-4o pass over these fifteen flipped twelve of them and
// then still reported ten as left-facing — it contradicts itself on its own output. openai-image.js already
// carries the same finding, measured against 452 labelled sprites ("the labels are wrong on clearly
// directional creatures and meaningless on symmetrical ones"). A detector that is wrong two thirds of the time
// does more damage than the defect it is chasing, because it silently reverses sprites that were correct.
//
// So facing is checked BY EYE on a contact sheet and corrected by hand:
//     node scripts/gen-fleet-captains.mjs --sheet          # writes crew-sheet.png, five across, big enough to read
//     node scripts/gen-fleet-captains.mjs --flip fleet_cutter
if (args.includes("--flip")) {
    if (!only.length) throw new Error("--flip needs at least one sprite key");
    for (const k of only) {
        const file = `${OUT}/${k}.png`;
        if (!fs.existsSync(file)) { console.log("skip (missing):", k); continue; }
        fs.writeFileSync(file, await sharp(fs.readFileSync(file)).flop().png().toBuffer());
        console.log("flipped", k);
    }
    process.exit(0);
}

// A contact sheet is the only reliable way to audit this set — for facing, and for the amputated-legs defect
// that a per-file margin check cannot see (a figure with no feet still measures a tidy border on all sides).
if (args.includes("--sheet")) {
    const keys = Object.keys(CAPTAINS).filter((k) => fs.existsSync(`${OUT}/${k}.png`));
    const cell = 440, cols = 5, rows = Math.ceil(keys.length / cols);
    const comp = [];
    for (let i = 0; i < keys.length; i++) {
        comp.push({
            input: await sharp(`${OUT}/${keys[i]}.png`).resize(cell - 16, cell - 16, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
            left: (i % cols) * cell + 8, top: Math.floor(i / cols) * cell + 8,
        });
    }
    await sharp({ create: { width: cols * cell, height: rows * cell, channels: 4, background: { r: 252, g: 252, b: 253, alpha: 1 } } })
        .composite(comp).png().toFile("crew-sheet.png");
    console.log("wrote crew-sheet.png —", keys.join(" | "));
    process.exit(0);
}

for (const [k, prompt] of Object.entries(CAPTAINS)) {
    if (only.length && !only.includes(k)) continue;
    const file = `${OUT}/${k}.png`;
    if (!force && fs.existsSync(file)) { console.log("skip (exists):", k); continue; }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        // `low` is where the amputated legs came from: at that tier the model routinely drops whatever is
        // furthest from the focal point, and on a standing figure that is the feet. Anatomy completeness is
        // the whole job here, so this is worth the ~4c a head.
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "medium", n: 1 }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image for " + k);
    fs.writeFileSync(file, await frame(Buffer.from(b64, "base64")));
    console.log("wrote", k, fs.statSync(file).size, "bytes — CHECK FACING (--sheet), flip with --flip " + k);
}
console.log("done");
