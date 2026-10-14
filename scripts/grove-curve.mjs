// ── RE-DERIVE THE GROVE'S DIFFICULTY FROM WHO ACTUALLY PLAYS IT ─────────────────────────────────────────────
// Luke: "consider that... I am certainly going to add things that make heros more powerful, like skills
// classes and pet attacks and stuff."
//
// Which is exactly why the table in grove-catalog.js is anchored to two members rather than to constants:
// every one of those additions moves the high anchor, and a table of hand-picked numbers would quietly stop
// meaning anything. This reads both ends off PRODUCTION, runs the real swing() a few thousand times so crit
// stacking and bleed are measured rather than assumed, and prints the curve that falls out.
//
//   npm run grove:curve
//
// It changes nothing. Read the table, then paste the baselines into GROVE_ENEMIES / GROVE_BOSSES.
// ⚠️ The printed wanderer numbers are PER-ZONE TARGETS; scaledFoe multiplies the catalog baseline by
// GROVE_SCALE, so a baseline is its zone's target divided back out by that zone's multiplier.
// See [[balance-real-bouts-not-sims]] — this is a model, and the first real runs outrank it.
import { readFileSync } from "node:fs";
const pick=(f,k)=>readFileSync(f,"utf8").split(/\r?\n/).find(l=>l.startsWith(k+"=")).slice(k.length+1).trim();
process.env.DATABASE_URL=pick("C:/Users/Luke/Projects/accounting_app/.env","DATABASE_URL");
const { db } = await import("@/lib/db.js");
const { groveFighter } = await import("@/lib/marketplace/grove-kit.js");
const { swing, BLEED_TICKS } = await import("@/lib/marketplace/grove-world.js");
const { drFrom } = await import("@/lib/marketplace/arena-kit.js");
const SWING_MS = 410;

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
const R = Math.pow(hi.dps/lo.dps, 1/11);
const Rh = Math.pow(hi.ehp/lo.ehp, 1/11);
console.log(`${lo.name}: ${lo.dps.toFixed(0)} dps, ${lo.f.health} hp, ${(drFrom(lo.f.armor,0)*100).toFixed(0)}% DR -> ${lo.ehp.toFixed(0)} effective HP`);
console.log(`${hi.name}: ${hi.dps.toFixed(0)} dps, ${hi.f.health} hp, ${(drFrom(hi.f.armor,0)*100).toFixed(0)}% DR -> ${hi.ehp.toFixed(0)} effective HP`);
console.log(`power x${R.toFixed(3)}/zone, durability x${Rh.toFixed(3)}/zone\n`);

const SWINGS=3, HIT_SHARE=0.055;           // a hit costs ~5.5% of the expected body
const bossSec=(z)=>35+(80-35)*((z-1)/11);
const r2=(n)=>n<1000?Math.round(n/10)*10:n<100000?Math.round(n/100)*100:Math.round(n/1000)*1000;
const rd=(n)=>n<100?Math.round(n):Math.round(n/10)*10;

const out=[];
for(let z=1;z<=12;z++){
    const dps=lo.dps*Math.pow(R,z-1), per=lo.perSwing*Math.pow(R,z-1), ehp=lo.ehp*Math.pow(Rh,z-1);
    const hit=ehp*HIT_SHARE;
    out.push({z, hp:r2(per*SWINGS), boss:r2(dps*bossSec(z)),
              dmg:[rd(hit*0.8), rd(hit*1.2)], bdmg:[rd(hit*1.9), rd(hit*2.7)]});
}
console.log("zone   wanderer       boss   foe dmg        boss dmg");
for(const r of out) console.log(`${String(r.z).padStart(4)} ${String(r.hp).padStart(10)} ${String(r.boss).padStart(10)}   [${r.dmg[0]},${r.dmg[1]}]`.padEnd(52)+`[${r.bdmg[0]},${r.bdmg[1]}]`);

const e=out[11];
const eHit=Math.round(((e.dmg[0]+e.dmg[1])/2)*(1-drFrom(hi.f.armor,0)));
const eB=Math.round(((e.bdmg[0]+e.bdmg[1])/2)*(1-drFrom(hi.f.armor,0)));
console.log(`\nERIC AT ZONE 12`);
console.log(`  boss ${(e.boss/hi.dps).toFixed(0)}s, wanderers ${(e.hp/hi.perSwing).toFixed(1)} swings each, 15-30 in the zone`);
console.log(`  a wanderer hits him for ${eHit} of ${hi.f.health} hp  -> ${Math.ceil(hi.f.health/eHit)} hits to kill him`);
console.log(`  the boss hits him for ${eB}            -> ${Math.ceil(hi.f.health/eB)} hits to kill him`);
const n=out[0];
const nHit=Math.round(((n.dmg[0]+n.dmg[1])/2)*(1-drFrom(lo.f.armor,0)));
console.log(`\nLITTLEWOLF AT ZONE 1`);
console.log(`  boss ${(n.boss/lo.dps).toFixed(0)}s, wanderers ${(n.hp/lo.perSwing).toFixed(1)} swings each`);
console.log(`  a wanderer hits him for ${nHit} of ${lo.f.health} hp -> ${Math.ceil(lo.f.health/nHit)} hits`);
console.log(`\nJS:\n  hp:   [${out.map(r=>r.hp).join(", ")}]`);
console.log(`  dmg:  [${out.map(r=>`[${r.dmg[0]},${r.dmg[1]}]`).join(", ")}]`);
console.log(`  boss: [${out.map(r=>r.boss).join(", ")}]`);
console.log(`  bdmg: [${out.map(r=>`[${r.bdmg[0]},${r.bdmg[1]}]`).join(", ")}]`);
