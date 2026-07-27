// One-off: generate the PRIZE WHEEL art in the game's hand-painted fantasy style — a rotating ornate disc +
// a stationary bulb-lit frame with a wolf-head pointer. Static assets committed to public/images/spin/.
import fs from "node:fs";
const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const JOBS = [
    {
        out: "public/images/spin/wheel-disc.png",
        prompt: `A top-down perfectly circular fantasy PRIZE WHEEL face for a cozy wolf-themed trading-card-game. Hand-painted mobile RPG art style, rich and warm: aged gold filigree, deep walnut wood, and jewel-tone wedge segments (emerald, sapphire, ruby, amethyst, teal, warm amber) alternating evenly around the wheel, separated by ornate golden dividers radiating from the center. A polished engraved gold outer ring frames the wedges. In the very center sits a round medallion embossed with a noble stylized wolf head. Soft painterly texture, gentle rim lighting, luxurious and inviting, perfectly symmetrical and centered, the round wheel fills the whole frame edge to edge. IMPORTANT: NO pointer, NO triangle, NO arrow, NO marker, NO crest sticking out — just the plain round wheel. Absolutely NO text, NO numbers, NO letters. Nothing behind it.`,
    },
];

fs.mkdirSync("public/images/spin", { recursive: true });
for (const job of JOBS) {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt: job.prompt, size: "1024x1024", background: "transparent", quality: "high", n: 1 }),
    });
    if (!resp.ok) { console.error(`✗ ${job.out}: OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.error(`✗ ${job.out}: no image`); continue; }
    fs.writeFileSync(job.out, Buffer.from(b64, "base64"));
    console.log(`✓ ${job.out} (${fs.statSync(job.out).size} bytes)`);
}
