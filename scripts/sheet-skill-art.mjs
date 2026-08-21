// ── LOOK AT THE WHOLE SET AT ONCE ────────────────────────────────────────────────────────────────────────────
// Every icon in one grid, grouped by skill and branch, at the size it is actually drawn.
//
// This exists because of a failure mode that only shows up ACROSS MANY: two previews looked great and the real
// problem — every dark pet form collapsing to the same black mass — was invisible until a set was laid side by
// side. A skill panel is ninety small icons a member scans in a second, so the risk here is the same one:
// nine "an abstract emblem of a heavy blow" prompts can each be fine and collectively be one picture.
//
// It composes an actual PNG rather than an HTML page, because the point is to hand somebody an image they can
// look at on a phone, and because a browser screenshot of a grid is a screenshot of a browser.
//
//   node scripts/sheet-skill-art.mjs out/skills.png
import fs from "node:fs";
import sharp from "sharp";

import { SKILLS } from "../src/lib/marketplace/arena-skills.js";

const OUT = process.argv[2] || "skill-sheet.png";
const CELL = 96;                 // ~3x the drawn size, so a flaw is visible without pretending it is a poster
const PAD = 10;
const LABEL = 18;
const COLS = 10;                 // one skill a row: its emblem, then nine nodes in branch order

const rows = [];
for (const s of SKILLS) {
    const cells = [{ label: s.name, file: `public/images/arena/skill/${s.id}.webp`, emblem: true }];
    for (const b of s.branches) {
        for (const n of s.nodes.filter((x) => x.branch === b.id)) {
            cells.push({ label: n.name, file: `public/images/arena/skill/node/${n.id}.webp`, cap: n.tier === 2 });
        }
    }
    rows.push({ skill: s, cells });
}

const W = COLS * (CELL + PAD) + PAD;
const H = rows.length * (CELL + LABEL + PAD) + PAD;

const layers = [];
for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < rows[r].cells.length; c += 1) {
        const cell = rows[r].cells[c];
        if (!fs.existsSync(cell.file)) continue;
        layers.push({
            input: await sharp(cell.file).resize({ width: CELL, height: CELL, fit: "contain",
                background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
            left: PAD + c * (CELL + PAD),
            top: PAD + r * (CELL + LABEL + PAD),
        });
    }
    // The row's own caption: which skill, and where the branch boundaries fall, so a column that has drifted
    // can be named rather than pointed at.
    const brs = rows[r].skill.branches.map((b) => b.name).join("  ·  ");
    const svg = `<svg width="${W}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg">
        <text x="4" y="13" font-family="sans-serif" font-size="11" font-weight="700" fill="#e8ecf1">${rows[r].skill.name}</text>
        <text x="${4 + rows[r].skill.name.length * 7 + 12}" y="13" font-family="sans-serif" font-size="10" fill="#8b93a0">${brs}</text>
    </svg>`;
    layers.push({ input: Buffer.from(svg), left: 0, top: PAD + r * (CELL + LABEL + PAD) + CELL + 1 });
}

await sharp({ create: { width: W, height: H, channels: 4, background: { r: 12, g: 10, b: 18, alpha: 1 } } })
    .composite(layers).png().toFile(OUT);
console.log(`${OUT}  ${W}x${H}  — ${layers.length} pieces, ${rows.length} skills`);
