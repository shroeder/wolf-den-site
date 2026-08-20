// ── CLASS EMBLEMS AND SKILL-TREE NODE SPRITES ────────────────────────────────────────────────────────────────
// One icon per node, one emblem per class. The node list is read straight out of arena-classes.js, so this
// cannot drift from the tree — add a node there and this generates its art.
//
// House rules, same as every other generator here: die-cut on transparency, bold INK CONTOUR, and never ask
// for outlines-as-rims, sticker edges or drop shadows — they bake a white halo into the cutout.
//
// Usage: node scripts/gen-arena-tree.mjs [key …]   (no args = everything missing)
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!KEY) throw new Error("no OPENAI_API_KEY");

fs.mkdirSync("public/images/arena/node", { recursive: true });
fs.mkdirSync("public/images/arena/class", { recursive: true });
fs.mkdirSync("public/images/arena/track", { recursive: true });

const STYLE = "Painterly cel-shaded 2D video-game art, bold clean dark outlines, chunky readable silhouette, high contrast, vibrant colors, soft inner shading, fantasy action-RPG style.";
const CUT = "ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — absolutely NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white sticker rim. Nothing but the subject. No text, no words, no letters, no numbers, no logo, no watermark, no border.";
const NODE = (s) => `A single fantasy SKILL-TREE NODE ICON — an abstract emblem, no character, no scenery, bold and readable at small size, centered and filling most of the frame. ${s} ${STYLE} ${CUT}`;
const EMBLEM = (s) => `A fantasy GLADIATOR CLASS EMBLEM — a bold heraldic crest, centered and filling the frame, readable at small size. ${s} ${STYLE} ${CUT}`;

// Node id → what the icon shows. Kept beside the tree's own descriptions so the art matches the mechanic.
const QUALITY = (process.argv.includes("--quality") ? process.argv[process.argv.indexOf("--quality") + 1] : "medium");

const ART = {
    // Reaver — damage, criticals, volume
    "node/rv_might": NODE("a clenched armoured gauntlet crushing a stone, shards flying, deep red accents."),
    // Shieldsplitter — was Killer Instinct. Damage into a RAISED brace, so the icon is the moment of breaking one.
    "node/rv_crit": NODE("a heavy axe blade smashing through a raised round shield, the shield splitting apart, red sparks at the break."),
    // Bloodfeast — was Cleave. A drain now, so the blade is drinking.
    "node/rv_strike": NODE("a fanged sword blade drinking a ribbon of blood that spirals up it into a crimson glow."),
    // Retaliation — was Overkill. A counter-swing off their blow: two blades, theirs turned, yours coming back.
    "node/rv_critdmg": NODE("an incoming blade being knocked aside while a second blade strikes back along it, crimson counter-arc."),
    "node/rv_flurry": NODE("four overlapping speed-blurred blade arcs in a rushing fan."),
    "node/rv_speed": NODE("a winged armoured boot trailing red afterimages."),
    "node/rv_surge": NODE("a roaring wolf head inside a war-horn, sound rings radiating."),
    "node/rv_pierce": NODE("a spearhead punching clean through a cracked shield plate."),
    "node/rv_execute": NODE("a curved executioner's axe over a broken crown."),
    "node/rv_gamble": NODE("two crimson dice mid-tumble trailing sparks, one showing a skull face."),
    "node/rv_open": NODE("a single droplet of blood splashing on a blade edge at dawn."),
    "node/rv_cap": NODE("a snarling fanged maw wreathed in crimson smoke."),
    // Warden — mitigation, counters, sustain
    "node/wd_vigour": NODE("a heavy heart-shaped iron pauldron bound in leather straps, steady blue glow."),
    "node/wd_block": NODE("crossed bracers deflecting an incoming arrow, cyan spark at the contact point."),
    "node/wd_ward": NODE("three interlocking hexagonal shield plates forming a curved barrier, blue light in the seams."),
    "node/wd_soak": NODE("a tower shield planted in stone with a rippling energy dome over it."),
    "node/wd_riposte": NODE("a parrying dagger catching a blade and turning it back, cyan arc."),
    "node/wd_thorns": NODE("a round shield ringed with iron spikes, sparks along the rim."),
    "node/wd_drain": NODE("a chalice catching a stream of glowing life, faint blue vapour rising."),
    "node/wd_regen": NODE("a lung-like bellows of brass and leather exhaling pale blue light."),
    "node/wd_shieldcap": NODE("a stack of three layered energy barriers seen edge-on, brightest at the front."),
    "node/wd_reprisal": NODE("a mirrored blade reflecting a strike back along its own path."),
    "node/wd_stand": NODE("a battered banner still planted upright in cracked ground, one last ember of light."),
    "node/wd_fort": NODE("a portcullis of heavy iron slamming shut, stone blocks either side."),
    // Runecaller — affinity, burns, broken armour
    "node/rc_power": NODE("a floating rune stone crackling with layered elemental light."),
    "node/rc_edge": NODE("a six-spoked elemental wheel, each spoke a different coloured gem."),
    "node/rc_spell": NODE("an open palm projecting a spiral of arcane runes."),
    "node/rc_rend": NODE("a brand of molten fire searing a jagged mark, embers falling."),
    "node/rc_burn": NODE("a slow-burning ember creeping along a fuse of runes."),
    "node/rc_stacks": NODE("three stacked burning rune tiles, each brighter than the last."),
    "node/rc_sunder": NODE("a rune-etched hammer shattering an armour plate into gold shards."),
    // Emberdrinker — was Quickening. Burn damage returned as health, so: embers being drunk.
    "node/rc_cd": NODE("a chalice catching falling embers, orange firelight rising out of it in a curling ribbon."),
    "node/rc_pierce": NODE("a violet bolt punching a clean hole through a rune-warded plate."),
    // Rimeshatter — was Overcharge. The ICE capstone that can freeze a turn away.
    "node/rc_overcharge": NODE("a jagged blue-white ice crystal shattering outward into frozen shards, pale cold light in the cracks."),
    "node/rc_spread": NODE("a bursting star of fire scattering smaller flames outward."),
    "node/rc_fortune": NODE("a rune-carved coin spinning inside a ring of luck-sparks."),
    // ── THE REWRITTEN TREES ──────────────────────────────────────────────────────────────────────────────
    // Twelve nodes per class, three classes, all new ids. The entries above are the OLD tree and are kept only
    // because eleven of the new nodes still point at one of those files; everything below had no art at all,
    // which is why the tree rendered broken-image squares from Deep Cuts downward.
    //
    // Each icon is drawn from what the node actually DOES, because a skill tree is read at a glance and an
    // icon that means nothing is worse than no icon — it teaches the wrong thing confidently.

    // Reaver — bleed, speed, criticals, and answering a blow with one of your own.
    "node/rv_rend": NODE("a deep triple claw-gash torn through a steel plate, blood welling from the cuts."),
    "node/rv_drain": NODE("a curved blade with a ribbon of blood spiralling up it into a crimson glow."),
    "node/rv_counter": NODE("an incoming blade knocked aside while a second blade strikes back along it, crimson counter-arc."),
    "node/rv_stun": NODE("a helmet struck from the side, a burst of impact stars ringing off the temple, red shock lines."),
    "node/rv_haste": NODE("a snarling wolf muzzle scenting the air, three red speed-streaks trailing behind it."),
    "node/rv_leech": NODE("a blood droplet drawn upward into a crimson heart, thin red threads feeding it."),
    "node/rv_wild": NODE("three crimson blades fanned like a dealt hand, one of them lit and sparking."),

    // Warden — plate, guards, and punishing whoever swung.
    "node/wd_health": NODE("a broad iron breastplate with a steady blue heart-glow at its centre, heavy riveted bands."),
    "node/wd_deflect": NODE("a round shield turning a blade wide, a bright cyan spark at the glancing point."),
    "node/wd_counter": NODE("a tower shield slamming forward as a blade rebounds off it, cyan impact ring."),
    "node/wd_guard": NODE("a curved barrier of blue light raised in front of a planted shield, layered like glass."),
    "node/wd_grudge": NODE("a cracked shield whose fractures glow molten orange, the stored heat about to be returned."),
    "node/wd_stun": NODE("a mace head connecting with a helm, blue-white impact stars bursting outward."),
    "node/wd_aegis": NODE("a single vast dome of blue energy over a small planted shield, the dome many times its size."),

    // Runecaller — burn, freeze, wards and raw arcane overflow.
    "node/rc_ember": NODE("a burning heart of coals inside a rune-etched cage, orange light pulsing out of the seams."),
    "node/rc_leech": NODE("a chalice catching falling embers, orange firelight curling up out of it."),
    "node/rc_freeze": NODE("a blade caught mid-swing inside a block of jagged blue ice, frost spikes radiating."),
    "node/rc_chill": NODE("an hourglass rimed with frost, the falling sand freezing into a slow crystal column."),
    "node/rc_thorns": NODE("a ring of pale blue ice spikes bristling outward from a frozen round guard."),
    "node/rc_ward": NODE("a hexagonal shell of translucent violet aether panels, light in every seam."),
    // Rerolled: the pouring stream ran off the top of the frame, so the sprite was cropped at the border.
    // The subject has to sit WHOLLY inside the square — an icon that touches the edge reads as broken art.
    "node/rc_reservoir": NODE("a squat rune-carved stone basin brimming with violet light, small and complete, well inside the frame with clear empty space on every side."),
    "node/rc_surge": NODE("five rune tiles in a row, the fifth erupting in a column of violet light far brighter than the rest."),
    "node/rc_might": NODE("a clenched gauntlet wrapped in glowing violet runes, arcane force bleeding off the knuckles."),
    "node/rc_soulfire": NODE("a pale violet flame passing straight THROUGH a steel plate, the plate untouched and the flame unbroken."),
    "node/rc_cata": NODE("fire and ice colliding in one sphere, half roaring orange flame and half jagged blue frost, shattering at the seam."),

    // Training tracks — bought with gold, so they get the same treatment as the Kitchen's tracks: sprites,
    // never emoji.
    "track/conditioning": NODE("a muscular armoured torso wrapped in training bindings, a steady red heart-glow at its centre."),
    "track/footwork": NODE("a pair of worn leather arena sandals mid-stride over a scuffed sand ring, dust curling."),
    "track/edge": NODE("a spinning whetstone throwing sparks off a blade held against it."),
    "track/instinct": NODE("a single narrowed eye inside a targeting rune, a fine crosshair line across it."),
    "track/stamina": NODE("an hourglass of burning sand with a small flame at its neck, deep orange."),
    "track/renown": NODE("a laurel wreath around a raised gladiator's fist, gold and warm light."),
    // Class emblems
    "class/reaver": EMBLEM("crossed notched cleavers over a snarling wolf skull, crimson and iron, aggressive and brutal."),
    "class/warden": EMBLEM("a tower shield bearing a wolf's head, flanked by two upright spears, steel and deep blue, immovable."),
    "class/runecaller": EMBLEM("a floating rune-carved monolith ringed by six orbiting elemental sparks, violet and gold, arcane."),
};

async function generate(prompt) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const r = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
                body: JSON.stringify({
                    // MEDIUM by default — the house rule for anything a member looks at. `--quality low`
                    // drops it deliberately (25 icons: ~$1.05 medium against ~$0.27 low), which is worth
                    // having as a choice rather than a constant nobody remembers is set to the cheap one.
                    model: "gpt-image-1", prompt, size: "1024x1024", quality: QUALITY, n: 1,
                    background: "transparent",
                }),
            });
            if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 140)}`);
            const b64 = (await r.json())?.data?.[0]?.b64_json;
            if (!b64) throw new Error("no image");
            return Buffer.from(b64, "base64");
        } catch (e) {
            if (attempt === 3) throw e;
            await new Promise((res) => setTimeout(res, 4000 * attempt));
        }
    }
    return null;
}

const want = process.argv.slice(2);
const keys = Object.keys(ART).filter((k) => (want.length ? want.some((w) => k.includes(w)) : !fs.existsSync(`public/images/arena/${k}.webp`)));
console.log(`${keys.length} tree images to generate`);

const failed = [];
for (const k of keys) {
    try {
        const buf = await generate(ART[k]);
        const out = `public/images/arena/${k}.webp`;
        // Nodes are small on screen; emblems get a bit more room.
        const px = k.startsWith("class/") ? 320 : 192;
        await sharp(buf).resize({ width: px, withoutEnlargement: true })
            .webp({ quality: 90, alphaQuality: 100 }).toFile(out);
        console.log(`✓ ${k} (${Math.round(fs.statSync(out).size / 1024)}kb)`);
    } catch (e) {
        failed.push(k);
        console.log(`✗ ${k}: ${e.message}`);
    }
}
console.log(`\nDONE — ${keys.length - failed.length}/${keys.length}`);
if (failed.length) { console.log(`FAILED: ${failed.join(", ")}`); process.exit(1); }
