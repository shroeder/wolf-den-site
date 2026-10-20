// ── THE FARM'S BACKDROPS CANNOT OUTGROW THE SCENE THEY SIT IN ────────────────────────────────────────────────
// Luke, four separate times: "the aquarium still shows all pets on the leftmost part of the horizontal scroll
// area." Three of those four fixes changed the pet LAYOUT MATHS, and the maths was never wrong -- measured in
// the live DOM it produces 16% to 84%, properly spread.
//
// The bug was underneath it, and it is a shape nothing in this repo was watching:
//
//   A pet is positioned with left:<pct>%. A percentage resolves against the CONTAINING BLOCK, which is the
//   objects layer -- inset:0 on the scene, so exactly the scene's LAYOUT width (one screen). The backdrop,
//   however, is absolutely positioned, so it does not widen that layout box; it just OVERFLOWS it. The
//   aquarium fell through to the Garden's strip, which lays down SIX copies of the tank. At a phone height
//   each copy is 608px, so .farm-scroll became 3,644px of scrollable water while every pet stayed inside the
//   first 359px of it.
//
// So the painted world and the world the pets can occupy were two different widths, and every "spread them
// out" fix spread them perfectly across the wrong one.
//
// ⚠️ THE INVARIANT, AND IT IS NOT ABOUT FISH: a view whose objects are placed by PERCENTAGE must have a
// backdrop that cannot exceed the scene box. Repeating strips are only safe where the scene is itself wide
// (the Garden sets minWidth 190%) or where the objects scroll with it.
//
//   node scripts/check-farm.mjs        (or npm run check:farm)
import fs from "node:fs";

const SRC = "src/components/FarmClient.js";
const s = fs.readFileSync(SRC, "utf8");

let fails = 0;
const ok = (name, cond, extra = "") => {
    if (cond) console.log(`  ok   ${name}`);
    else { console.log(`  FAIL ${name}${extra ? `\n       ${extra}` : ""}`); fails += 1; }
};

console.log("\nTHE AQUARIUM IS ONE TANK");
// A tank has ends. Six of them is six aquariums, and it is what put 3,644px of scroll behind the glass.
ok("the aquarium renders its own single backdrop, not a repeating strip",
    /view === "aquarium" \? \(/.test(s) && /farm-bg-tank/.test(s),
    "the aquarium branch must render <img className=\"farm-bg-tank\"> rather than falling through to the Garden's farm-bg-strip");

const tank = s.match(/\.farm-bg-tank\s*\{([^}]*)\}/)?.[1] || "";
ok(".farm-bg-tank exists as a rule", Boolean(tank));
// inset:0 + object-fit:cover is the whole guarantee -- the image is exactly the scene box and physically
// cannot overflow it, whatever its natural aspect.
ok("...it is pinned to the scene box (inset: 0)", /inset:\s*0/.test(tank), tank.trim().slice(0, 90));
ok("...and it covers rather than sizing itself off its own aspect", /object-fit:\s*cover/.test(tank),
    "width:auto is exactly how the backdrop outgrew the box in the first place");
ok("...so it declares no intrinsic width that could exceed the scene",
    !/width:\s*max-content/.test(tank) && !/min-width:\s*(1[1-9]\d|[2-9]\d\d)%/.test(tank), tank.trim().slice(0, 90));

console.log("\nTHE REPEATING STRIP IS ONLY USED WHERE THE SCENE IS WIDE");
// The Garden deliberately scrolls (minWidth 190%), so a strip filling it is correct there. Outside/Inside
// use their own tiled backdrop. The aquarium must not be in either list.
const stripBranch = s.match(/farm-bg-strip"[\s\S]{0,400}?\)\s*\)/)?.[0] || "";
ok("the strip is not reachable from the aquarium view",
    !/aquarium/.test(stripBranch), "the aquarium must be branched off BEFORE the strip fallback");
ok("the garden still sets a wide scene for its strip to fill",
    /view === "garden" \? "190%"/.test(s),
    "if the garden stops being wide, its strip has the same overflow problem the aquarium had");

console.log("\nPETS ARE PLACED BY PERCENTAGE, SO THE BAND MUST BE REAL");
// If these ever drift to 0/100 the clamp stops protecting the name tags from the glass; if they invert,
// every fish lands on one line again.
const pad = Number(s.match(/const AQ_PAD = (\d+)/)?.[1]);
const top = Number(s.match(/const AQ_TOP = (\d+)/)?.[1]);
const bottom = Number(s.match(/const AQ_BOTTOM = (\d+)/)?.[1]);
ok(`the tank keeps a margin from the glass (AQ_PAD=${pad})`, pad > 0 && pad < 30);
ok(`the fish band is the right way up (${top} -> ${bottom})`, top < bottom && top >= 0 && bottom <= 100);
ok("the usable width is most of the tank, not a sliver", 100 - pad * 2 >= 50, `got ${100 - pad * 2}%`);

console.log(fails
    ? `\ncheck:farm — ${fails} FAILED\n`
    : "\nOK — the aquarium is one tank, it cannot outgrow its scene, and the pets' percentages land on painted water.\n");
process.exit(fails ? 1 : 0);
