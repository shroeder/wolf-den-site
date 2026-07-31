// Generate the PRECISE 20-wedge prize-wheel disc. The AI won't reliably paint exactly 20 even wedges, so we
// draw them ourselves (SVG → PNG) for perfect icon alignment, then drop the AI-painted wolf medallion into the
// center to keep the hand-painted feel. Overwrites public/images/spin/wheel-disc.png.
// Run: node scripts/gen-wheel-disc.mjs   (regenerate the AI medallion first via gen-spin-art.mjs wheel-disc)
import sharp from "sharp";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

const S = 1024, cx = S / 2, cy = S / 2, Rout = S * 0.475, Rin = S * 0.135;
const cols = ["#2f8f7a", "#b0402f", "#2a6db0", "#6b4f9a", "#3a8f5a", "#c77d2f"]; // jewel palette
const N = 20, seg = (2 * Math.PI) / N;

let wedges = "";
for (let i = 0; i < N; i += 1) {
    const a0 = -Math.PI / 2 - seg / 2 + i * seg, a1 = a0 + seg; // divider at 12 o'clock
    const x0 = cx + Math.cos(a0) * Rout, y0 = cy + Math.sin(a0) * Rout;
    const x1 = cx + Math.cos(a1) * Rout, y1 = cy + Math.sin(a1) * Rout;
    wedges += `<path d="M ${cx} ${cy} L ${x0.toFixed(1)} ${y0.toFixed(1)} A ${Rout} ${Rout} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z" fill="${cols[i % cols.length]}" stroke="#d9b64a" stroke-width="5"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">`
    + `<defs><radialGradient id="sheen" cx="50%" cy="42%" r="60%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.14"/><stop offset="70%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.28"/></radialGradient></defs>`
    + `<circle cx="${cx}" cy="${cy}" r="${Rout + 9}" fill="#8a6a1f"/>${wedges}`
    + `<circle cx="${cx}" cy="${cy}" r="${Rout}" fill="url(#sheen)"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${Rout}" fill="none" stroke="#e8c65a" stroke-width="18"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${Rout + 9}" fill="none" stroke="#7a5410" stroke-width="4"/></svg>`;

const base = await sharp(Buffer.from(svg)).png().toBuffer();
const mSize = Math.round(Rin * 2.3);
const med = await sharp("public/images/spin/wheel-disc.png").extract({ left: Math.round(cx - Rin * 1.15), top: Math.round(cy - Rin * 1.15), width: mSize, height: mSize }).png().toBuffer();
const cmask = Buffer.from(`<svg width="${mSize}" height="${mSize}"><circle cx="${mSize / 2}" cy="${mSize / 2}" r="${mSize / 2}" fill="white"/></svg>`);
const medRound = await sharp(med).composite([{ input: cmask, blend: "dest-in" }]).png().toBuffer();
const dmask = Buffer.from(`<svg width="${S}" height="${S}"><circle cx="${cx}" cy="${cy}" r="${Rout + 11}" fill="white"/></svg>`);
await sharp(base).composite([{ input: medRound, top: Math.round(cy - mSize / 2), left: Math.round(cx - mSize / 2) }, { input: dmask, blend: "dest-in" }]).png().toFile("public/images/spin/wheel-disc.png");
console.log("wrote precise 20-wedge disc");
