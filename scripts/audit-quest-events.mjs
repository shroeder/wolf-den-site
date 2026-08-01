// Every event a bounty listens for must actually be FIRED somewhere, and every bounty's wording must match the
// events behind it.
//
// This exists because "Feed or pet your pets 3 times" was mapped to `feed_pet` alone — petting fires `pet_farm`
// or `pet_other` — so a member could pet all day and watch the counter sit at 0/3. The mapping looked right in
// isolation; only comparing it against what the code actually emits showed the gap.
import { readdirSync, readFileSync } from "node:fs";

const dir = "src/lib/marketplace";
const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
const all = files.map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n");

const map = readFileSync(`${dir}/activity.js`, "utf8").match(/ACTIVITY_QUEST_KEYS = \{([\s\S]*?)\};/)[1];
const pairs = [...map.matchAll(/([a-z_]+):\s*"([a-z_]+)"/g)].map((m) => ({ event: m[1], quest: m[2] }));

// Every event name actually passed to trackActivity anywhere in the codebase.
//
// The second argument is NOT always a bare string — farm.js emits `own ? "pet_farm" : "pet_other"`. Matching
// only bare literals reported both of those as never-fired, which is a false alarm of exactly the kind this
// script exists to prevent. So: take the whole call head and pull every quoted token out of it.
const fired = new Set();
for (const m of all.matchAll(/trackActivity\(([^;]{0,240}?)\)/g)) {
    for (const q of m[1].matchAll(/"([a-z_]+)"/g)) fired.add(q[1]);
}

const dead = pairs.filter((p) => !fired.has(p.event));
console.log(`${pairs.length} events mapped to bounties, ${fired.size} distinct events fired in the codebase`);
if (dead.length) {
    console.log("\nMAPPED BUT NEVER FIRED — these bounties can never tick:");
    for (const d of dead) console.log(`  ${d.event}  ->  ${d.quest}`);
} else {
    console.log("every mapped event is fired somewhere");
}

// The reverse: which quest keys have NO event feeding them at all.
const quests = readFileSync(`${dir}/town-quests.js`, "utf8");
const poolKeys = [...quests.matchAll(/^\s{4}([a-z_]+):\s*\{\s*emoji:/gm)].map((m) => m[1]);
const fedQuests = new Set(pairs.filter((p) => fired.has(p.event)).map((p) => p.quest));
// Town-native keys are bumped directly by bumpTownQuest rather than through the activity map.
const townNative = [...quests.matchAll(/bumpTownQuest\([^,]+,\s*"([a-z_]+)"/g)].map((m) => m[1]);
const nativeElsewhere = [...all.matchAll(/bumpTownQuest\([^,]+,\s*"([a-z_]+)"/g)].map((m) => m[1]);
const covered = new Set([...fedQuests, ...townNative, ...nativeElsewhere]);
const starved = poolKeys.filter((k) => !covered.has(k));
console.log(`\n${poolKeys.length} bounty activities in the pool`);
console.log(starved.length ? `NO SOURCE FEEDING THEM: ${starved.join(", ")}` : "every bounty activity has a source");
process.exit(dead.length || starved.length ? 1 : 0);
