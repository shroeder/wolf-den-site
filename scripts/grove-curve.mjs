// ── RE-DERIVE THE GROVE'S DIFFICULTY FROM WHO ACTUALLY PLAYS IT ─────────────────────────────────────────────
// Luke: "consider that... I am certainly going to add things that make heros more powerful, like skills
// classes and pet attacks and stuff."
//
// Which is exactly why the table in grove-catalog.js is anchored to two members rather than to constants:
// every one of those additions moves the high anchor, and a table of hand-picked numbers would quietly stop
// meaning anything. This reads both ends off PRODUCTION, runs the real swing() a few thousand times so crit
// stacking and bleed are measured rather than assumed, and prints the curve that falls out.
//
//   npm run grove:curve                  the shipped anchor — Eric has a tough time at MAP 8 ZONE 1
//   npm run grove:curve -- --map 12      ask what a further wall would cost instead
//
// ⚠️ THE HIGH ANCHOR IS A MAP, NOT A ZONE, AND THAT IS THE WHOLE SHAPE OF THE CURVE. Luke, first: "Lets
// make it so eric would have a tough time with map 12 first zone." Then, having played it: "I meant he should
// start to struggle around map 8... Not node 8 on map 1, but map 8 node 1." So the default is 8. The first cut of this tool spanned the gap over
// ELEVEN steps (map 1 zone 1 -> map 1 zone 12) instead of 132, which made the opening forest the entire
// difficulty range of a twenty-map game. The step it produced was right; the granularity was not. If you
// change nothing else here, do not change that.
//
// It changes nothing on disk. Read the table, then paste the baselines into GROVE_ENEMIES / GROVE_BOSSES.
// ⚠️ The printed wanderer numbers are PER-DEPTH TARGETS; scaledFoe multiplies the catalog baseline by
// GROVE_SCALE, so a baseline is its zone's target times that creature's share, divided back out by that
// zone's climb. See the shares in grove-catalog.js — they are authored, not derived here.
// See [[balance-real-bouts-not-sims]] — this is a model, and the first real runs outrank it.
import { readFileSync } from "node:fs";
const pick=(f,k)=>readFileSync(f,"utf8").split(/\r?\n/).find(l=>l.startsWith(k+"=")).slice(k.length+1).trim();
process.env.DATABASE_URL=pick("C:/Users/Luke/Projects/accounting_app/.env","DATABASE_URL");
const { db } = await import("@/lib/db.js");
const { groveFighter } = await import("@/lib/marketplace/grove-kit.js");
const { swing, BLEED_TICKS } = await import("@/lib/marketplace/grove-world.js");
const { drFrom } = await import("@/lib/marketplace/arena-kit.js");
const { GROVE_SCALE } = await import("@/lib/marketplace/grove-catalog.js");
const SWING_MS = 410;
const ZPM = GROVE_SCALE.zonesPerMap;                        // imported, never retyped — see [[balance-constants-never-copied]]
const ai = process.argv.indexOf("--map");
const HI_MAP = ai > -1 ? Math.max(2, Number(process.argv[ai + 1]) || 8) : 8;   // ⚠️ MATCHES GROVE_SCALE

async function profile(name) {
    const r = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = $1`, [name]);
    const f = await groveFighter(r.id);
    let st=7; const rand=()=>(st=(st*1103515245+12345)&0x7fffffff)/0x7fffffff;
    let tot=0,bl=0,n=4000;
    for(let i=0;i<n;i++){const h=swing(f,0,rand);tot+=h.dealt;if(h.bleed)bl+=h.bleed.dmg*BLEED_TICKS;}
    const cd=SWING_MS/Math.max(0.2,f.tempo);
    return {name,f,perSwing:tot/n,dps:((tot+bl)/n)/(cd/1000),cd,
            ehp: f.health/(1-drFrom(f.armor,0))};   // effective HP under the ARENA model
}
const lo = await profile("Littlewolf"), hi = await profile("Eric D");

// depth d = (map-1)*ZPM + zone. Low anchor is depth 1; high anchor is the FIRST ZONE of HI_MAP.
const HI_DEPTH = (HI_MAP - 1) * ZPM + 1;
const STEPS = HI_DEPTH - 1;
const R  = Math.pow(hi.dps/lo.dps, 1/STEPS);
const Rh = Math.pow(hi.ehp/lo.ehp, 1/STEPS);
console.log(`${lo.name}: ${lo.dps.toFixed(0)} dps, ${lo.f.health} hp, ${(drFrom(lo.f.armor,0)*100).toFixed(0)}% DR -> ${lo.ehp.toFixed(0)} effective HP   (map 1 zone 1)`);
console.log(`${hi.name}: ${hi.dps.toFixed(0)} dps, ${hi.f.health} hp, ${(drFrom(hi.f.armor,0)*100).toFixed(0)}% DR -> ${hi.ehp.toFixed(0)} effective HP   (map ${HI_MAP} zone 1, depth ${HI_DEPTH})`);
console.log(`x${(hi.dps/lo.dps).toFixed(1)} power over ${STEPS} zones`);
console.log(`per zone: power x${R.toFixed(4)} (+${((R-1)*100).toFixed(2)}%), durability x${Rh.toFixed(4)} (+${((Rh-1)*100).toFixed(2)}%)  COMPOUNDING`);
console.log(`per map:  power x${Math.pow(R,ZPM).toFixed(3)}, durability x${Math.pow(Rh,ZPM).toFixed(3)}`);
console.log(`\n-> GROVE_SCALE = { hpPerZone: ${(R-1).toFixed(4)}, dmgPerZone: ${(Rh-1).toFixed(4)}, zonesPerMap: ${ZPM} }\n`);

const SWINGS=3, HIT_SHARE=0.055;
const r2=(n)=>n<1000?Math.round(n/10)*10:n<100000?Math.round(n/100)*100:Math.round(n/1000)*1000;
const rd=(n)=>n<100?Math.round(n):Math.round(n/10)*10;
// The boss ramp restarts each map: a boss is the thing that ends ITS map, so the last one is the long one.
const bossSec=(z)=>35+(80-35)*((z-1)/(ZPM-1));
const at=(d)=>{
    const k=d-1, z=((d-1)%ZPM)+1;
    const dps=lo.dps*Math.pow(R,k), per=lo.perSwing*Math.pow(R,k), ehp=lo.ehp*Math.pow(Rh,k);
    const hit=ehp*HIT_SHARE;
    return {d, z, map:Math.floor((d-1)/ZPM)+1, dps, per, ehp,
            hp:r2(per*SWINGS), boss:r2(dps*bossSec(z)),
            dmg:[rd(hit*0.8), rd(hit*1.2)], bdmg:[rd(hit*1.9), rd(hit*2.7)]};
};

const out=[]; for(let z=1;z<=ZPM;z++) out.push(at(z));
console.log("── MAP 1, the only one built ──");
console.log("zone   wanderer       boss   foe dmg        boss dmg");
for(const r of out) console.log(`${String(r.z).padStart(4)} ${String(r.hp).padStart(10)} ${String(r.boss).padStart(10)}   [${r.dmg[0]},${r.dmg[1]}]`.padEnd(52)+`[${r.bdmg[0]},${r.bdmg[1]}]`);

// WHAT IT FEELS LIKE, for both ends, at the places that decide whether the curve is right. A table of HP is
// not a judgement — "dies in 19 hits" is, and it is the only line of this output worth arguing with.
const feel=(who,r)=>{
    const h=Math.round(((r.dmg[0]+r.dmg[1])/2)*(1-drFrom(who.f.armor,0)));
    const b=Math.round(((r.bdmg[0]+r.bdmg[1])/2)*(1-drFrom(who.f.armor,0)));
    return `${(r.hp/who.perSwing).toFixed(1).padStart(5)} sw/trash · boss ${String((r.boss/who.dps).toFixed(0)).padStart(4)}s · dies in ${String(Math.ceil(who.f.health/h)).padStart(3)} trash / ${Math.ceil(who.f.health/b)} boss hits`;
};
console.log("");
console.log(`${lo.name.padEnd(11)} map  1 zone  1 : ${feel(lo,out[0])}`);
console.log(`${lo.name.padEnd(11)} map  1 zone ${ZPM} : ${feel(lo,out[ZPM-1])}   <- can a newcomer finish the forest?`);
console.log(`${hi.name.padEnd(11)} map  1 zone ${ZPM} : ${feel(hi,out[ZPM-1])}   <- the top of the Den should stroll it`);
for (const m of [2, 4, 8, HI_MAP])
    console.log(`${hi.name.padEnd(11)} map ${String(m).padStart(2)} zone  1 : ${feel(hi,at((m-1)*ZPM+1))}`
        + (m === HI_MAP ? "   <- THE ANCHOR: a tough time" : ""));

console.log(`\nJS (map 1 per-zone targets):\n  hp:   [${out.map(r=>r.hp).join(", ")}]`);
console.log(`  dmg:  [${out.map(r=>`[${r.dmg[0]},${r.dmg[1]}]`).join(", ")}]`);
console.log(`  boss: [${out.map(r=>r.boss).join(", ")}]`);
console.log(`  bdmg: [${out.map(r=>`[${r.bdmg[0]},${r.bdmg[1]}]`).join(", ")}]`);
