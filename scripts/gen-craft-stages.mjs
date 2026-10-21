// ── THE CRAFTING STAGES ──────────────────────────────────────────────────────────────────────────────────────
// Luke: "its 3 separate stages with immersive background and sprite decorations, you seem to have combined it
// all?" He is right — the act was one panel with the rack bolted to the top and the controls swapping
// underneath, which is a widget with three modes rather than three places.
//
// Three backdrops, one per stage, each a room you are standing in:
//
//   bg-forge    the fire.    Coals, bellows, a glow that is the only light in the room.
//   bg-anvil    the shaping. The anvil on its stump, hammers on the wall, scale on the floor.
//   bg-rack     the setting. The cooling rack and its bins, where the piece is dropped.
//
// ⚠️ SIDE-ON AND FLAT, NOT RECEDING, for the same reason every Grove backdrop is — a vanishing point is only
// right from one camera position, and these sit behind UI that moves over them. See
// [[scrolling-room-needs-flat-backdrop]]. They are also deliberately DIM and bottom-weighted: controls and a
// plinko rack sit on top, and a busy upper half would fight every number on the screen.
//
// ⚠️ COMPOSED FROM housePrompt, like every other generator here, so these belong to the same hand as the
// zones and the chests. See [[house-art-style]].
//
//   node scripts/gen-craft-stages.mjs            # price it and stop
//   node scripts/gen-craft-stages.mjs --apply    # draw it
//   node scripts/gen-craft-stages.mjs --apply --only bg-anvil
import fs from "node:fs";
import { quality, priceRun } from "./lib/gen-guard.mjs";
import { housePrompt } from "../src/lib/marketplace/art-style.js";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
const OUT = "public/images/grove";
const APPLY = process.argv.includes("--apply");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ONLY = (arg("--only") || "").split(",").map((s) => s.trim()).filter(Boolean);
const Q = quality();
// ⚠️ PORTRAIT, BECAUSE THE SCREEN IS PORTRAIT. The first set was drawn 1536x1024 and the phone is 390x920 —
// `cover` on that pairing throws away about seventy percent of the WIDTH, so the forge pit fell off the left
// edge and the stage was a close-up of the middle of a bellows. A composition clause cannot save a wide
// painting from a tall frame; the canvas has to match the hole it goes in. Same lesson as
// [[sprite-amputation-vs-clipping]], one aspect ratio over.
const SIZE = "1024x1536";

// ⚠️ THE SAME CLAUSE ON ALL THREE, so the three stages read as one workshop seen from three angles rather
// than three unrelated rooms. The light source changes and the furniture changes; the walls do not.
const SHOP = "Interior of a small timber-framed smithy with soot-dark plank walls and a packed earth floor, "
    + "seen flat side-on with no perspective recession, as a stage backdrop. ";
const FOR_UI = "Tall vertical composition. The upper third is quiet and near-empty so interface elements can sit over "
    + "it; the subject fills the middle and the floor fills the lower third. Dim overall, lit by one warm "
    + "source, deep shadow in the corners. No text, no lettering, no characters, no hands.";

const STAGES = [
    {
        id: "bg-forge",
        subject: SHOP + "At the left, a stone forge pit heaped with coals glowing orange and white-hot, heat "
            + "shimmer rising. A big leather-and-oak bellows beside it with its handle raised. Tongs and a "
            + "water bucket on the floor. The coal glow is the only light and it throws long shadows up the wall.",
    },
    {
        id: "bg-anvil",
        subject: SHOP + "Centre of the room: a heavy black anvil mounted on a scarred oak stump, a scattering of "
            + "bright scale and sparks on the floor around it. Hammers, tongs and files hanging on a rack across "
            + "the back wall. Cooler light than the forge, coming low and from the right.",
    },
    {
        id: "bg-rack",
        subject: SHOP + "The far end of the shop: a long low wooden cooling rack running the full width, divided "
            + "into a row of open bins by thin timber partitions, with a quenching trough steaming gently behind "
            + "it. Sparse upright pegs above the bins. Cold blue-grey light from a shuttered window high up.",
    },
];

const pick = STAGES.filter((s) => !ONLY.length || ONLY.includes(s.id));
const bill = priceRun({ count: pick.length, size: SIZE, quality: Q });
console.log(pick.map((s) => "  " + s.id).join("\n"));
if (!APPLY) {
    console.log("\nnothing drawn — re-run with --apply");
    process.exit(0);
}
if (!KEY) { console.error("no OPENAI_API_KEY in accounting_app/local.properties"); process.exit(1); }

for (const s of pick) {
    const prompt = housePrompt(s.subject, { framing: "scene", extra: FOR_UI });
    process.stdout.write(`${s.id} … `);
    const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: SIZE, quality: Q, n: 1 }),
    }).then((x) => x.json());
    const b64 = r?.data?.[0]?.b64_json;
    if (!b64) { console.log("FAILED", JSON.stringify(r?.error || r).slice(0, 200)); continue; }
    fs.writeFileSync(`${OUT}/${s.id}.webp`, Buffer.from(b64, "base64"));
    console.log("drawn");
}
console.log(`\ndone — about $${bill.toFixed(2)}`);
