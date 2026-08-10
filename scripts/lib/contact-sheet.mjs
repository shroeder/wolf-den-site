import fs from "node:fs"; import sharp from "sharp";
const dir = process.argv[2], out = process.argv[3], cols = +(process.argv[4] || 5);
const files = fs.readdirSync(dir).filter(f => f.endsWith(".png")).sort();
const C = 260, rows = Math.ceil(files.length / cols);
const tiles = [];
for (let i = 0; i < files.length; i++) {
    const img = await sharp(`${dir}/${files[i]}`).resize(C - 16, C - 34, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    tiles.push({ input: img, left: (i % cols) * C + 8, top: Math.floor(i / cols) * C + 8 });
    const label = `<svg width="${C - 16}" height="20"><text x="0" y="15" font-family="monospace" font-size="13" fill="#fff">${files[i].replace(".png", "")}</text></svg>`;
    tiles.push({ input: Buffer.from(label), left: (i % cols) * C + 8, top: Math.floor(i / cols) * C + C - 24 });
}
await sharp({ create: { width: cols * C, height: rows * C, channels: 4, background: { r: 24, g: 30, b: 40, alpha: 1 } } }).composite(tiles).png().toFile(out);
console.log(out, files.length);
