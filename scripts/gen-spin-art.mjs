// Generate ALL prize-wheel art in the game's hand-painted style: a slim bulb-lit frame (big center hole), a
// 20-wedge disc, a small mini-wheel disc, 16 prize sprites, and 6 wheel-exclusive gear sprites. Static assets
// under public/images/spin/. Run: node scripts/gen-spin-art.mjs   (add slugs to regen only some)
import fs from "node:fs";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history
const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const STYLE = "hand-painted mobile fantasy RPG / trading-card-game art style, warm rich saturated color, bold clean rendering, cohesive with a cozy wolf-themed game. Die-cut on a FULLY TRANSPARENT background — nothing behind it, no scene, no shadow. Absolutely NO text, NO words, NO numbers, NO letters.";
const SPRITE = (subject) => `A single ${subject}, centered, fills the frame, ${STYLE}`;

const JOBS = [
    { out: "public/images/spin/wheel-frame.png", size: "1024x1024", prompt: `Just a thin decorative gold CIRCLET sitting exactly on the outermost edge of a square image — like a slim porthole rim. The circlet band is extremely narrow (only ~7% of the radius). Everything inside is one enormous empty transparent circle (roughly 85% of the image is transparent hole). Small round glowing golden marquee light bulbs are spaced evenly around the thin gold band. A small carved gold wolf head sits at the top of the ring as a tiny downward pointer. Fully transparent center and transparent outside the ring. ${STYLE}` },
    { out: "public/images/spin/wheel-disc.png", size: "1024x1024", prompt: `A top-down circular fantasy PRIZE WHEEL face divided into EXACTLY TWENTY (20) perfectly equal, even, identical-width thin wedge segments — like a clock face but with 20 evenly spaced spokes. The 20 wedges alternate jewel tones (emerald, sapphire, ruby, amethyst, teal, amber) and are separated by 20 straight fine gold dividers radiating evenly from a small central medallion embossed with a wolf head. One divider points straight up at 12 o'clock. A polished gold outer ring. Painterly, perfectly symmetrical and regular, the round wheel fills the frame. NO pointer, NO triangle, NO arrow, NO marker. ${STYLE}` },
    { out: "public/images/spin/gear/wg-chest.png", size: "1024x1024", prompt: SPRITE("ornate wolf-themed leather-and-steel chestplate cuirass, fantasy armor") },
    { out: "public/images/spin/gear/wg-belt.png", size: "1024x1024", prompt: SPRITE("ornate war belt with a golden wolf-head buckle and fang studs") },
    { out: "public/images/spin/gear/wg-boots.png", size: "1024x1024", prompt: SPRITE("pair of ornate fur-lined prowler boots with steel toes, fantasy gear") },
    { out: "public/images/spin/gear/wg-axe.png", size: "1024x1024", prompt: SPRITE("curved fantasy war axe with a wolf-etched steel head and leather-wrapped haft") },
    { out: "public/images/spin/mini-wheel.png", size: "1024x1024", prompt: `A small top-down fantasy prize wheel with EIGHT equal jewel-tone wedge segments and thin gold dividers, a tiny gold wolf medallion in the center, ornate gold rim, playful and inviting. NO pointer, NO arrow. ${STYLE}` },

    { out: "public/images/spin/prizes/coins-small.png", size: "1024x1024", prompt: SPRITE("small neat stack of shiny gold coins") },
    { out: "public/images/spin/prizes/coins-big.png", size: "1024x1024", prompt: SPRITE("big overflowing pile of glittering gold coins") },
    { out: "public/images/spin/prizes/gem-jackpot.png", size: "1024x1024", prompt: SPRITE("huge glowing multifaceted golden diamond gemstone radiating brilliant light, the ultimate jackpot prize") },
    { out: "public/images/spin/prizes/coin-burst.png", size: "1024x1024", prompt: SPRITE("burst of gold coins exploding joyfully outward from a golden coin") },
    { out: "public/images/spin/prizes/xp-orb.png", size: "1024x1024", prompt: SPRITE("glowing sky-blue experience orb, a radiant magical star-crystal") },
    { out: "public/images/spin/prizes/pet-treat.png", size: "1024x1024", prompt: SPRITE("big meaty golden-brown bone pet treat") },
    { out: "public/images/spin/prizes/seed-pouch.png", size: "1024x1024", prompt: SPRITE("small brown drawstring pouch spilling a few green sprouting seeds") },
    { out: "public/images/spin/prizes/fertilizer.png", size: "1024x1024", prompt: SPRITE("burlap sack of dark rich fertilizer soil with a green leaf sprouting on top") },
    { out: "public/images/spin/prizes/dig-shard.png", size: "1024x1024", prompt: SPRITE("glowing carved ancient stone treasure fragment / relic shard with golden runes") },
    { out: "public/images/spin/prizes/potion-red.png", size: "1024x1024", prompt: SPRITE("glowing red adrenaline potion in a corked glass vial with a sparkle") },
    { out: "public/images/spin/prizes/potion-brew.png", size: "1024x1024", prompt: SPRITE("frothy amber magical brew in an ornate wooden tankard, a berserker's drink") },
    { out: "public/images/spin/prizes/chest-wood.png", size: "1024x1024", prompt: SPRITE("small closed wooden treasure chest with dark iron bands and a brass lock") },
    { out: "public/images/spin/prizes/chest-gold.png", size: "1024x1024", prompt: SPRITE("ornate closed golden treasure chest glowing with warm light") },
    { out: "public/images/spin/prizes/spin-ticket.png", size: "1024x1024", prompt: SPRITE("ornate golden carnival prize ticket / raffle ticket with a small wheel motif") },
    { out: "public/images/spin/prizes/mini-wheel.png", size: "1024x1024", prompt: SPRITE("small ornate golden prize wheel with jewel-tone wedges, a playful bonus icon") },
    { out: "public/images/spin/prizes/mystery-box.png", size: "1024x1024", prompt: SPRITE("mysterious dark gift box sealed with a glowing golden question mark and gold ribbon") },
    { out: "public/images/spin/prizes/bonus-spin.png", size: "1024x1024", prompt: SPRITE("glowing golden arrow arrows forming a circular refresh loop around a small prize wheel, a free-spin token") },

    { out: "public/images/spin/gear/wg-helm.png", size: "1024x1024", prompt: SPRITE("epic ornate wolf-themed steel-and-gold war helmet with wolf ears") },
    { out: "public/images/spin/gear/wg-blade.png", size: "1024x1024", prompt: SPRITE("epic curved golden fantasy sword with a wolf-head pommel, glowing edge") },
    { out: "public/images/spin/gear/wg-shield.png", size: "1024x1024", prompt: SPRITE("epic round ornate shield emblazoned with a golden wolf crest") },
    { out: "public/images/spin/gear/wg-cloak.png", size: "1024x1024", prompt: SPRITE("epic flowing enchanted deep-blue cloak fastened with a golden wolf clasp") },
    { out: "public/images/spin/gear/wg-amulet.png", size: "1024x1024", prompt: SPRITE("epic glowing wolf-fang amulet on a golden chain, radiating power") },
    { out: "public/images/spin/gear/wg-gauntlet.png", size: "1024x1024", prompt: SPRITE("epic ornate armored gauntlet with golden claws and a wolf sigil") },
];

const only = process.argv.slice(2);
fs.mkdirSync("public/images/spin/prizes", { recursive: true });
fs.mkdirSync("public/images/spin/gear", { recursive: true });
let ok = 0, run = 0;
for (const job of JOBS) {
    if (only.length && !only.some((s) => job.out.includes(s))) continue;
    run += 1;
    try {
        const resp = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            // medium, not high: "high" is ~4x the price and the extra detail dies in the downscale (see art-style.js).
            body: JSON.stringify({ model: "gpt-image-1", prompt: job.prompt, size: job.size, background: "transparent", quality: "low", n: 1 }),
        });
        if (!resp.ok) { console.error(`✗ ${job.out}: ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
        const b64 = (await resp.json())?.data?.[0]?.b64_json;
        if (!b64) { console.error(`✗ ${job.out}: no image`); continue; }
        fs.writeFileSync(job.out, Buffer.from(b64, "base64"));
        ok += 1; console.log(`✓ ${job.out}`);
    } catch (e) { console.error(`✗ ${job.out}: ${e.message}`); }
}
console.log(`Done. ${ok}/${run} generated.`);
