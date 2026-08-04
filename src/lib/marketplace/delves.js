import "server-only";

import { db } from "@/lib/db";
import { awardXp, levelForXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { grantEventBadge } from "@/lib/marketplace/badges.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import {
    DELVE_FLOORS, DELVE_TRACKS, DUNGEONS, KIND, MIN_FIGHTS,
    delveMight, delveVigour, dungeonById, encounterArt, encounterBg, eventsFor, FIGHT_DROPS, foeForFloor,
    potionCount, potionHealFrac, wardCut,
} from "@/lib/marketplace/delve-catalog.js";
import { advanceFloor, finishDelveRun, offerChoice } from "@/lib/marketplace/delve-floors.js";

// ── DUNGEON DELVES ───────────────────────────────────────────────────────────────────────────────────────────
// Ten floors, one encounter each, a boss at the bottom. You bring HP and potions; you leave with whatever you
// banked, alive or not. Four dungeons gated on level, each runnable once a day.
//
// PUBLIC since 2026-08-04. Every read and write still goes through DELVES_UNLOCKED, so this stays the one
// switch — exactly as the mine did. The first dungeon gates itself at level 10 anyway, so opening it up does
// not drop a level-2 member into something that will kill them.
export const DELVES_UNLOCKED = (buyerId) => Boolean(buyerId);

const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ── WHAT YOU BRING DOWN THERE ────────────────────────────────────────────────────────────────────────────────
// Your health and your swing are both read off your LEVEL and your EQUIPPED GEAR, so a delve rewards the
// loadout you built rather than handing everyone the same body. `gearPower` is the plain sum of every stat on
// what you are wearing — one number, deliberately, because a delve is not the boss fight and does not need to
// care which stat is which.
export async function delverPower(buyerId) {
    const [{ sumItemStats }, { getEquippedIds }] = await Promise.all([
        import("@/lib/marketplace/items.js"),
        import("@/lib/marketplace/inventory.js"),
    ]);
    const [me, bySlot] = await Promise.all([
        db.queryOne(`SELECT COALESCE(xp,0) AS xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        // getEquippedIds returns a {slot -> id} OBJECT; iterating it directly is a known landmine here.
        getEquippedIds(buyerId).catch(() => ({})),
    ]);
    const level = levelForXp(Number(me?.xp) || 0).level;
    const stats = sumItemStats(Object.values(bySlot || {}));
    const gearPower = Object.values(stats).reduce((n, v) => n + (Number(v) || 0), 0);
    return { level, gearPower, vigour: delveVigour(level, gearPower), might: delveMight(level, gearPower) };
}

async function delveRow(buyerId) {
    await db.query(`INSERT INTO mkt_delve (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    return db.queryOne(`SELECT *, ${DAY}::text AS today FROM mkt_delve WHERE buyer_id = $1`, [buyerId]).catch(() => null);
}

// ── DEALING THE FLOORS ───────────────────────────────────────────────────────────────────────────────────────
// The whole run is dealt UP FRONT, then walked. Dealing as you go would make the "at least five fights"
// guarantee impossible to honour without rerolling a floor you had already been shown — which is the one thing
// that would make the dungeon feel rigged rather than dangerous.
//
// Floors 1..9 are drawn weighted from the dungeon's own pool; floor 10 is always the boss. If the draw came up
// short on fights, the shortfall is filled by CONVERTING the least interesting floors (rest and quiet stretches
// first, then traps) rather than appending fights at the end — so the guarantee never shows up as five brawls
// in a row at the bottom.
function dealFloors(dungeon) {
    const pool = [...eventsFor(dungeon.id)];

    // WITHOUT REPLACEMENT. The first cut drew independently each floor and only blocked ADJACENT repeats, which
    // sounds fine and isn't: with 26 events over 9 draws the birthday problem bites hard, and 79% of runs
    // contained the same encounter twice — "A Farmer's Strongbox" three times in one descent reads as a bug,
    // not as randomness. Each event is now removed from the bag once drawn, so all nine floors are distinct.
    // The decks are 26 deep against 9 floors, so there is no risk of running dry.
    const bag = pool.map((e) => ({ e, w: e.weight }));
    const drawOnce = () => {
        const total = bag.reduce((n, b) => n + b.w, 0);
        if (total <= 0 || !bag.length) return null;
        let r = Math.random() * total;
        for (let i = 0; i < bag.length; i += 1) {
            r -= bag[i].w;
            if (r <= 0) return bag.splice(i, 1)[0].e;
        }
        return bag.splice(bag.length - 1, 1)[0].e;
    };

    const floors = [];
    for (let i = 0; i < DELVE_FLOORS - 1; i += 1) {
        const e = drawOnce();
        if (!e) break;
        floors.push({ n: i + 1, event: e, done: false });
    }

    const isFight = (f) => f.event.kind === KIND.fight || f.event.kind === KIND.mimic;
    // Replacement fights must also be ones this run has not used, or the guarantee reintroduces the duplicates
    // the bag just removed.
    const spareFights = bag.filter((b) => b.e.kind === KIND.fight).map((b) => b.e);
    let need = (MIN_FIGHTS - 1) - floors.filter(isFight).length;
    if (need > 0) {
        // Preference ORDER, then everything else. Converting only the four "least interesting" kinds looked
        // tidy and silently broke the guarantee on ~2.7% of runs: a hand full of chests, merchants and shrines
        // simply had nothing in the preferred list left to convert. The last pass is unconditional.
        const order = [KIND.rest, KIND.puzzle, KIND.trap, KIND.cache, KIND.well, KIND.shrine, KIND.merchant, KIND.chest];
        const passes = [...order.map((k) => (f) => f.event.kind === k), (f) => !isFight(f)];
        for (const match of passes) {
            for (const f of floors) {
                if (need <= 0 || !spareFights.length) break;
                if (!match(f)) continue;
                // Never convert a RARE find into a brawl — that is the one floor nobody wants to lose.
                if (f.event.rare) continue;
                f.event = spareFights.splice(Math.floor(Math.random() * spareFights.length), 1)[0];
                need -= 1;
            }
            if (need <= 0 || !spareFights.length) break;
        }
    }

    // ── WHO YOU ACTUALLY MEET ────────────────────────────────────────────────────────────────────────────
    // Foes are dealt in a FINAL pass, from a shuffled bag that refills only once it is empty, so a roster of
    // four cannot put the same creature in front of you three times in one descent. Picking independently per
    // floor felt random and wasn't: with four foes over five fights, two-thirds of runs contained a triple.
    // (This is also why it happens after the conversion pass — converted floors are fights too.)
    let roster = [];
    for (const f of floors) {
        if (f.event.kind !== KIND.fight) continue;
        if (!roster.length) roster = dungeon.foes.map((x) => x.id).sort(() => Math.random() - 0.5);
        f.foeId = roster.pop();
    }

    floors.push({ n: DELVE_FLOORS, event: { id: "boss", kind: KIND.boss, title: dungeon.boss.name, text: dungeon.boss.blurb }, done: false });
    return floors;
}

/** A foe for a fight floor. HP is a multiple of YOUR attack, so a fight is ~3 exchanges whatever you're wearing. */
function makeFoe(dungeon, event, might, floor = null) {
    const base = foeForFloor(dungeon, floor) || dungeon.foes[0];
    const hp = Math.max(1, Math.round(might * dungeon.foeX * (event.hpMult || 1)));
    return {
        id: base.id, name: event.kind === KIND.mimic ? "Mimic" : base.name,
        sprite: event.kind === KIND.mimic ? "/images/delves/foe-mimic.webp" : base.sprite,
        hp, maxHp: hp,
        dmg: [Math.round(dungeon.dmg[0] * (event.dmgMult || 1)), Math.round(dungeon.dmg[1] * (event.dmgMult || 1))],
    };
}

// ── STATE ────────────────────────────────────────────────────────────────────────────────────────────────────
export async function getDelveState(buyerId) {
    if (!DELVES_UNLOCKED(buyerId)) return { unlocked: false };
    const [row, me, power] = await Promise.all([
        delveRow(buyerId),
        db.queryOne(`SELECT COALESCE(xp,0) AS xp, COALESCE(gold,0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        delverPower(buyerId),
    ]);
    const level = power.level;
    const runs = row?.runs_json || {};
    const today = row?.today;

    const dungeons = DUNGEONS.map((d) => ({
        id: d.id, name: d.name, blurb: d.blurb, tint: d.tint, bg: d.bg, minLevel: d.minLevel,
        floors: DELVE_FLOORS,
        boss: { name: d.boss.name, sprite: d.boss.sprite },
        unlocked: level >= d.minLevel,
        runToday: runs[d.id] === today,
    }));

    return {
        unlocked: true,
        level,
        gold: Number(me?.gold) || 0,
        dungeons,
        run: row?.run_json ? publicRun(row.run_json) : null,
        potions: { count: potionCount(row?.satchel_level), healPct: Math.round(potionHealFrac(row?.flask_level) * 100) },
        // What you'd walk in with right now — shown in the hall so better gear is visibly worth wearing.
        power,
        tracks: Object.entries(DELVE_TRACKS).map(([key, t]) => {
            const lv = Number(row?.[t.col]) || 0;
            return {
                key, name: t.name, desc: t.desc, icon: t.icon, effect: t.effect, level: lv, max: t.max,
                now: t.fmt(lv), next: lv >= t.max ? null : t.fmt(lv + 1),
                maxed: lv >= t.max, cost: lv >= t.max ? null : t.cost(lv),
            };
        }),
        stats: {
            started: Number(row?.runs_started) || 0,
            cleared: Number(row?.runs_cleared) || 0,
            died: Number(row?.runs_died) || 0,
            floors: Number(row?.floors_cleared) || 0,
            bosses: Number(row?.bosses_felled) || 0,
            deepest: Number(row?.deepest_floor) || 0,
        },
    };
}

// What the client is allowed to see of a run: never the undealt floors ahead, or the dungeon stops being a
// dungeon. Only the current floor's encounter, and the log of what already happened.
function publicRun(run) {
    const d = dungeonById(run.dungeonId);
    const cur = run.floors[run.floor - 1] || null;
    return {
        dungeonId: run.dungeonId,
        dungeonName: d?.name || run.dungeonId,
        tint: d?.tint,
        // The backdrop is the ROOM THIS ENCOUNTER HAPPENS IN, not one plate for the whole dungeon.
        bg: encounterBg(run.dungeonId, cur?.event) || d?.bg,
        floor: run.floor, floors: DELVE_FLOORS,
        hp: run.hp, maxHp: run.maxHp,
        potions: run.potions, potionHeal: run.potionHeal,
        over: Boolean(run.over), died: Boolean(run.died), cleared: Boolean(run.cleared),
        banked: run.banked,
        foe: run.foe || null,
        // The floor you are standing on, resolved or not.
        current: cur ? {
            n: cur.n, kind: cur.event.kind, title: cur.event.title, text: cur.event.text,
            done: Boolean(cur.done), outcome: cur.outcome || null,
            rare: Boolean(cur.event.rare),
            // A fight floor had no art at all until the foe existed, so the stage sat empty on exactly the
            // floors that should be the most tense. It now shows the thing you are about to meet as a black
            // SILHOUETTE — the shape without the detail, which reads as a threat rather than a spoiler. A
            // mimic keeps its chest picture, because being wrong about that is the entire encounter.
            art: encounterArt(run.dungeonId, cur.event) || (
                cur.event.kind === KIND.boss ? d?.boss?.sprite
                    : foeForFloor(d, cur)?.sprite || null
            ),
            silhouette: !cur.done && (cur.event.kind === KIND.fight || cur.event.kind === KIND.boss),
        } : null,
        log: run.log || [],
        // A choice the CURRENT floor is waiting on. Belt and braces on top of advanceFloor clearing it: a live
        // foe or a pending result means this floor is not asking you anything, whatever is left on the run.
        awaiting: (!run.foe && !run.result && run.awaiting) ? run.awaiting : null,
        // THE BEAT. A floor used to resolve and advance in the same reply, so the only trace of what just
        // happened was a line of grey text in a log — the "no clear juicy conclusion to each encounter"
        // complaint, exactly. The floor now STOPS on its result and waits for you to walk on, which is the one
        // moment the reward is worth showing.
        result: run.result || null,
        potionsUsed: run.potionsUsed || 0,
        lowestHpFrac: run.lowestHpFrac ?? 1,
    };
}

// ── START ────────────────────────────────────────────────────────────────────────────────────────────────────
export async function startDelve(buyerId, dungeonId) {
    if (!DELVES_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const d = dungeonById(dungeonId);
    if (!d) return { ok: false, error: "bad_dungeon" };
    const row = await delveRow(buyerId);
    // Only an UNFINISHED run blocks you. Dying stamps over:true, so a death in the Warren does not stop you
    // walking into the Vault five seconds later — and you walk in on FULL health, because vigour is read fresh
    // at every door. Each dungeon is its own once-a-day, so a bad run costs you that dungeon and nothing else.
    if (row?.run_json && !row.run_json.over) return { ok: false, error: "run_in_progress", ...(await getDelveState(buyerId)) };

    const power = await delverPower(buyerId);
    if (power.level < d.minLevel) return { ok: false, error: "level_locked", ...(await getDelveState(buyerId)) };

    const runs = row?.runs_json || {};
    if (runs[d.id] === row?.today) return { ok: false, error: "already_today", ...(await getDelveState(buyerId)) };

    // Health and swing are FROZEN at the door. Re-reading them mid-run would let you swap gear between floors
    // to heal yourself, and a delve you can re-equip your way out of is not a delve.
    const maxHp = power.vigour;
    const run = {
        dungeonId: d.id,
        floor: 1,
        hp: maxHp, maxHp,
        might: power.might,
        gearPower: power.gearPower,
        potions: potionCount(row?.satchel_level),
        potionHeal: potionHealFrac(row?.flask_level),
        ward: wardCut(row?.ward_level),
        floors: dealFloors(d),
        banked: { gold: 0, xp: 0, chests: [] },
        log: [],
        potionsUsed: 0,
        lowestHpFrac: 1,
        over: false, died: false, cleared: false,
    };
    // The day is claimed at the DOOR, not on completion — otherwise dying and restarting is free.
    const nextRuns = { ...runs, [d.id]: row?.today };
    await db.query(
        `UPDATE mkt_delve SET run_json = $2::jsonb, runs_json = $3::jsonb, runs_started = runs_started + 1, updated_at = NOW() WHERE buyer_id = $1`,
        [buyerId, JSON.stringify(run), JSON.stringify(nextRuns)]
    ).catch(() => {});
    await trackActivity(buyerId, "delve_start", { dungeon: d.id }).catch(() => {});
    return { ok: true, ...(await getDelveState(buyerId)) };
}

const saveRun = (buyerId, run) =>
    db.query(`UPDATE mkt_delve SET run_json = $2::jsonb, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, JSON.stringify(run)]).catch(() => {});

const hurt = (run, raw) => {
    const dmg = Math.max(1, Math.round(raw * (1 - (run.ward || 0))));
    run.hp = Math.max(0, run.hp - dmg);
    run.lowestHpFrac = Math.min(run.lowestHpFrac ?? 1, run.hp / run.maxHp);
    return dmg;
};
// Park the run on its outcome. Everything that used to call advance() the instant a floor resolved calls this
// instead; advancing is now the player's tap ("Onward"), which is what turns a resolution into a beat.
const settle = async (buyerId, run, result) => {
    run.result = result;
    await saveRun(buyerId, run);
    return { ok: true, ...(await getDelveState(buyerId)) };
};
const bank = (run, { gold = 0, xp = 0, chest = null, parts = null, frags = 0, gear = null } = {}) => {
    run.banked.gold += gold;
    run.banked.xp += xp;
    if (chest) run.banked.chests.push(chest);
    // Parts and fragments are BANKED like everything else and handed over at the surface, so dying still pays
    // them out. Gear is the exception — it is granted the moment it drops, because the whole point of a gear
    // drop is the card that shows you what you got.
    if (parts) { run.banked.parts = run.banked.parts || {}; run.banked.parts[parts.tier] = (run.banked.parts[parts.tier] || 0) + parts.n; }
    if (frags) run.banked.frags = (run.banked.frags || 0) + frags;
    if (gear) { run.banked.gear = run.banked.gear || []; run.banked.gear.push(gear); }
};

// ── THE KILL TABLE ───────────────────────────────────────────────────────────────────────────────────────────
// Rolled once per felled foe. Every line is independent, so a very good kill can pay several at once — which is
// the point: the memorable fight is the one that dropped three things, and it can only exist if they are not
// mutually exclusive. `mult` is the event's lootMult, so a fight the deck calls dangerous is also richer.
async function rollFightLoot(buyerId, run, d, { mult = 1, boss = false } = {}) {
    const L = d.loot;
    const got = { parts: null, frags: 0, potion: 0, chest: null, gear: null };
    const hit = (p) => Math.random() < Math.min(0.75, p * mult);

    if (boss || hit(FIGHT_DROPS.parts)) {
        const tier = randInt(L.parts[0], L.parts[1]);
        const n = boss ? randInt(2, 3) : 1;
        got.parts = { tier, n };
        bank(run, { parts: got.parts });
    }
    if (hit(FIGHT_DROPS.frags)) { got.frags = randInt(L.frags[0], L.frags[1]); bank(run, { frags: got.frags }); }
    // A potion lands in your hand NOW, not at the surface — it is only worth anything while you are still down
    // here, and finding one at 40% health is the best thing this dungeon can do to you.
    if (hit(FIGHT_DROPS.potion)) { got.potion = 1; run.potions += 1; }
    if (boss || hit(FIGHT_DROPS.chest)) { got.chest = boss ? L.bigChest : L.chest; bank(run, { chest: got.chest }); }

    // GEAR. Granted immediately so the result card can show the real piece, and recorded on the run so the wrap
    // can list it. The general drop pool only — the Depths sets belong to the mine, which is the feature built
    // to hand them out.
    if (Math.random() < (boss ? L.gearOdds * 4 : L.gearOdds * mult)) {
        try {
            const [{ randomDropPool }, { grantItem }] = await Promise.all([
                import("@/lib/marketplace/items.js"),
                import("@/lib/marketplace/inventory.js"),
            ]);
            // Never hand back a piece already in the bag — a "drop" that is a duplicate is worse than nothing.
            const owned = new Set((await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => [])).map((r) => r.item_id));
            const rarity = pick(L.gear);
            const pool = randomDropPool((i) => i.rarity === rarity && !owned.has(i.id));
            if (pool.length) {
                const it = pick(pool);
                await grantItem(buyerId, it.id, "delve").catch(() => {});
                got.gear = { id: it.id, name: it.name, rarity: it.rarity, icon: it.icon || null, slot: it.slot || null };
                bank(run, { gear: got.gear });
            }
        } catch { /* a missing gear drop must never cost you the kill */ }
    }
    return got;
}

// The one-line summary a drop deserves in the log, and the chips the result card shows.
function lootLine(got, partName) {
    const bits = [];
    if (got.parts) bits.push(`${got.parts.n}x ${partName(got.parts.tier)}`);
    if (got.frags) bits.push(`${got.frags} fragments`);
    if (got.potion) bits.push("a potion");
    if (got.chest) bits.push(`a ${got.chest} chest`);
    if (got.gear) bits.push(got.gear.name);
    return bits;
}

// ── RESOLVING A FLOOR ────────────────────────────────────────────────────────────────────────────────────────
// One entry point for "I acted on the floor I'm standing on". Fights are a single exchange per tap so a foe
// takes a few taps to drop and every tap can hurt — a fight resolved in one click would make HP decoration.
export async function delveAct(buyerId, action, choice = null) {
    if (!DELVES_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await delveRow(buyerId);
    const run = row?.run_json;
    if (!run || run.over) return { ok: false, error: "no_run", ...(await getDelveState(buyerId)) };
    const d = dungeonById(run.dungeonId);
    if (!d) return { ok: false, error: "bad_dungeon" };
    const floor = run.floors[run.floor - 1];
    if (!floor) return { ok: false, error: "no_floor", ...(await getDelveState(buyerId)) };

    // ── POTION — always available, on any floor, mid-fight or not. That's the whole promise of "use them
    // whenever you want", so it deliberately does NOT cost you the floor or give the foe a free swing.
    if (action === "potion") {
        if (run.potions <= 0) return { ok: false, error: "no_potions", ...(await getDelveState(buyerId)) };
        if (run.hp >= run.maxHp) return { ok: false, error: "already_full", ...(await getDelveState(buyerId)) };
        const healed = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * run.potionHeal));
        run.hp += healed;
        run.potions -= 1;
        run.potionsUsed = (run.potionsUsed || 0) + 1;
        run.log.push({ floor: run.floor, kind: "potion", text: `Drank a potion — recovered ${healed} health.` });
        await saveRun(buyerId, run);
        return { ok: true, healed, ...(await getDelveState(buyerId)) };
    }

    // ── ONWARD — leave the floor you just resolved. This is the only way forward: there is no "turn back".
    // Retreat existed and paid exactly what dying pays, so it was a button that ended your run for nothing.
    if (action === "onward") {
        if (!run.result) return { ok: false, error: "nothing_to_leave", ...(await getDelveState(buyerId)) };
        const res = run.result;
        run.result = null;
        return advance(buyerId, run, { outcome: res });
    }

    // ── STRIKE — one exchange in an active fight ──
    if (action === "strike") {
        if (!run.foe) return { ok: false, error: "no_fight", ...(await getDelveState(buyerId)) };
        const you = randInt(Math.round(run.might * 0.75), Math.round(run.might * 1.35));
        run.foe.hp = Math.max(0, run.foe.hp - you);
        const lines = [`You hit ${run.foe.name} for ${you}.`];
        if (run.foe.hp <= 0) {
            const ev = floor.event;
            const gold = Math.round(randInt(d.goldPer[0], d.goldPer[1]) * (ev.lootMult || 1));
            const xp = Math.round(randInt(d.xpPer[0], d.xpPer[1]) * (ev.lootMult || 1));
            bank(run, { gold, xp });
            const isBoss = ev.kind === KIND.boss;
            const got = await rollFightLoot(buyerId, run, d, { mult: ev.lootMult || 1, boss: isBoss });
            const { partName } = await import("@/lib/marketplace/forge-parts.js");
            const extras = lootLine(got, partName);
            lines.push(`${run.foe.name} falls. +${gold} gold, +${xp} XP${extras.length ? `, ${extras.join(", ")}` : ""}.`);
            const felled = run.foe;
            run.foe = null;
            run.log.push({ floor: run.floor, kind: "fight", text: lines.join(" ") });
            return settle(buyerId, run, {
                tone: isBoss ? "boss" : got.gear ? "rare" : "win",
                title: isBoss ? `${felled.name} falls` : `${felled.name} is down`,
                line: got.gear
                    ? `It was carrying something. ${got.gear.name}.`
                    : isBoss ? "The dungeon is quiet. Take what it owes you." : "It does not get up.",
                art: felled.sprite,
                gold, xp,
                chest: got.chest, potion: got.potion,
                parts: got.parts ? { ...got.parts, name: partName(got.parts.tier) } : null,
                frags: got.frags, gear: got.gear,
            });
        }
        // It swings back.
        const took = hurt(run, randInt(run.foe.dmg[0], run.foe.dmg[1]));
        lines.push(`It hits back for ${took}.`);
        run.log.push({ floor: run.floor, kind: "fight", text: lines.join(" ") });
        if (run.hp <= 0) return finishRun(buyerId, run, { died: true });
        await saveRun(buyerId, run);
        return { ok: true, ...(await getDelveState(buyerId)) };
    }

    // ── ENTER — resolve the floor you just walked onto ──
    if (action !== "enter" && action !== "choose") return { ok: false, error: "bad_action" };
    // A finished floor with nothing left to show just moves you on. This used to be an error, which was fine
    // while resolving and advancing happened in one reply — but a run saved under the OLD shape has a done
    // floor and no `result` to tap past, and would have sat there refusing both buttons forever.
    if (floor.done && !run.foe && !run.result) return advance(buyerId, run, {});

    const ev = floor.event;
    switch (ev.kind) {
        case KIND.fight:
        case KIND.mimic:
        case KIND.boss: {
            if (!run.foe) {
                const bossHp = Math.max(1, Math.round(run.might * d.bossX));
                run.foe = ev.kind === KIND.boss
                    ? { id: d.boss.id, name: d.boss.name, sprite: d.boss.sprite, hp: bossHp, maxHp: bossHp, dmg: d.boss.dmg, boss: true }
                    : makeFoe(d, ev, run.might, floor);
                floor.done = true;
                run.log.push({ floor: run.floor, kind: "meet", text: ev.kind === KIND.mimic ? "The chest opens itself. It has teeth." : `${run.foe.name} blocks the way.` });
                // A mimic gets the jump on you — that's the cost of it having looked like treasure.
                if (ev.kind === KIND.mimic) {
                    const took = hurt(run, randInt(run.foe.dmg[0], run.foe.dmg[1]));
                    run.log.push({ floor: run.floor, kind: "fight", text: `It catches you off guard for ${took}.` });
                    if (run.hp <= 0) return finishRun(buyerId, run, { died: true });
                }
            }
            await saveRun(buyerId, run);
            return { ok: true, ...(await getDelveState(buyerId)) };
        }
        case KIND.chest: {
            const gold = Math.round(randInt(d.goldPer[0], d.goldPer[1]) * 1.4 * (ev.lootMult || 1));
            const xp = Math.round(randInt(d.xpPer[0], d.xpPer[1]) * (ev.lootMult || 1));
            // A chest sometimes holds a real chest — the tiers a dungeon pays scale with its gate.
            const tier = ev.lootMult >= 1.5 ? (d.minLevel >= 30 ? "gold" : "iron") : (d.minLevel >= 30 ? "iron" : "wooden");
            const gotChest = Math.random() < 0.35;
            bank(run, { gold, xp, chest: gotChest ? tier : null });
            floor.done = true;
            run.log.push({ floor: run.floor, kind: "chest", text: `+${gold} gold, +${xp} XP${gotChest ? `, and a ${tier} chest` : ""}.` });
            return settle(buyerId, run, {
                tone: ev.rare ? "rare" : "loot", title: ev.rare ? ev.title : "It opens",
                line: gotChest ? "There is a whole chest in here." : "Coin, and something worth knowing.",
                art: encounterArt(run.dungeonId, ev), gold, xp, chest: gotChest ? tier : null, rare: Boolean(ev.rare),
            });
        }
        case KIND.cache: {
            const gold = Math.round(randInt(d.goldPer[0], d.goldPer[1]) * 1.2 * (ev.lootMult || 1));
            bank(run, { gold });
            floor.done = true;
            run.log.push({ floor: run.floor, kind: "cache", text: `Pocketed ${gold} gold.` });
            return settle(buyerId, run, {
                tone: ev.rare ? "rare" : "loot", title: ev.rare ? ev.title : "Pocketed",
                line: "Nobody was coming back for it.",
                art: encounterArt(run.dungeonId, ev), gold, rare: Boolean(ev.rare),
            });
        }
        case KIND.rest: {
            const healed = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * 0.18));
            run.hp += healed;
            floor.done = true;
            run.log.push({ floor: run.floor, kind: "rest", text: healed ? `You catch your breath — recovered ${healed} health.` : "You catch your breath. Nothing to mend." });
            return settle(buyerId, run, {
                tone: "heal", title: "A moment's quiet",
                line: healed ? "You get your wind back." : "Nothing to mend. You take the moment anyway.",
                art: encounterArt(run.dungeonId, ev), healed,
            });
        }
        case KIND.trap: {
            const took = hurt(run, randInt(Math.round(d.dmg[0] * 0.8), Math.round(d.dmg[1] * 1.1)));
            floor.done = true;
            run.log.push({ floor: run.floor, kind: "trap", text: `It catches you for ${took}.` });
            if (run.hp <= 0) return finishRun(buyerId, run, { died: true });
            return settle(buyerId, run, {
                tone: "hurt", title: "It catches you", line: "You should have been watching the floor.",
                art: encounterArt(run.dungeonId, ev), damage: took,
            });
        }
        case KIND.merchant:
        case KIND.well:
        case KIND.shrine:
        case KIND.puzzle:
            return offerChoice(ctxFor(buyerId), run, d, floor, action, choice);
        default: {
            floor.done = true;
            return settle(buyerId, run, { tone: "none", title: ev.title, line: "Nothing comes of it.", art: encounterArt(run.dungeonId, ev) });
        }
    }
}

// ── THE BRIDGE ───────────────────────────────────────────────────────────────────────────────────────────────
// delve-floors.js owns choices, advancing and the payout; this file owns the run. Rather than have the two
// import each other (a cycle), the run-side helpers are handed over explicitly as a small context object.
function ctxFor(buyerId) {
    const ctx = {
        buyerId, saveRun, hurt, bank, settle,
        state: getDelveState,
        advance: (bid, run, opts) => advanceFloor(ctx, run, opts),
        finishRun: (bid, run, opts) => finishDelveRun(ctx, run, opts),
    };
    return ctx;
}
const advance = (buyerId, run, opts) => advanceFloor(ctxFor(buyerId), run, opts);
const finishRun = (buyerId, run, opts) => finishDelveRun(ctxFor(buyerId), run, opts);

// ── UPGRADES ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function upgradeDelve(buyerId, trackKey) {
    if (!DELVES_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const t = DELVE_TRACKS[trackKey];
    if (!t) return { ok: false, error: "bad_track" };
    const row = await delveRow(buyerId);
    const lv = Number(row?.[t.col]) || 0;
    if (lv >= t.max) return { ok: false, error: "maxed", ...(await getDelveState(buyerId)) };
    const cost = t.cost(lv);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold", ...(await getDelveState(buyerId)) };
    await logCoin(buyerId, -cost, "delve_upgrade", { balanceAfter: paid.gold, meta: { track: trackKey } }).catch(() => {});
    // Guarded on the CURRENT level too, so a double-tap cannot buy the same level twice.
    await db.query(`UPDATE mkt_delve SET ${t.col} = ${t.col} + 1, updated_at = NOW() WHERE buyer_id = $1 AND ${t.col} = $2`, [buyerId, lv]).catch(() => {});
    await trackActivity(buyerId, "delve_upgrade", { track: trackKey, level: lv + 1, cost }).catch(() => {});
    return { ok: true, ...(await getDelveState(buyerId)) };
}

/** Close the finished-run card so the dungeon list comes back. */
export async function clearDelveRun(buyerId) {
    if (!DELVES_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    await db.query(`UPDATE mkt_delve SET run_json = NULL, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getDelveState(buyerId)) };
}
