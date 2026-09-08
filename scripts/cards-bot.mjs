// ── PLAY THE CARD GAME, ALL OF IT, WITH A REAL POINTER ───────────────────────────────────────────────────────
// probe-cards.mjs proves ONE interaction: that dragging a card onto a foe deals damage. This plays the whole
// thing — map, fight, reward, shop, campfire, chest, death, new run — through the same DOM and the same mouse
// events a thumb produces, and writes down what it saw at every step.
//
// WHY A BOT AND NOT A SIMULATION. cards-sim.mjs already plays the RULES thousands of times and it is the right
// tool for "is blocking worth a turn". It cannot see the things that have actually been wrong on this game:
// a payout with no screen, a card that renders under the health bars, an End turn you can see through, a room
// that resolves before you arrive. Those are only visible to something that goes through the interface.
//
// ⚠️ IT PLAYS THE OWNER'S REAL RUN, because the game is owner-gated and there is exactly one account that can
// see it. Back the row up before a session and put it back after — scripts/_tmp-runbak.mjs is that, and the
// bot itself never touches the database: everything it does, it does by clicking.
//
// Usage:
//   node scripts/cards-bot.mjs --runs 1                 play one run to death or boss
//   node scripts/cards-bot.mjs --runs 3 --shots out/    ...and photograph every screen it meets
//   node scripts/cards-bot.mjs --url http://localhost:3000/marketplace/cards
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

import { QUIET_HIDE, QUIET_SEEN, installQuiet, quiet } from "./lib/shot-quiet.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ = arg("--url", "http://localhost:3000/marketplace/cards");
const RUNS = Number(arg("--runs", 1));
const SHOTS = arg("--shots", null);
const COOKIE = process.env.SHOT_COOKIE;
const PORT = Number(arg("--port", 9477));
// A phone, because that is what this game is played on and it is where every layout bug has been.
const W = Number(arg("--w", 375)), H = Number(arg("--h", 667));
const MAX_STEPS = Number(arg("--steps", 900));
// ──── HOW WELL IT PLAYS, AND WHY THAT IS A DIAL ────────────────────────────────────────
// The first bot took the first thing on every screen on purpose, and the reason is written below the policy:
// a clever bot that never dies never sees the death screen. That is the right instinct for the job it was
// built for — walk into every room, press every plate, prove the interface works.
//
// It is the wrong instinct for the other question, and the other question is the one that matters now: CAN
// THIS GAME BE BEATEN, and does it take as long as Spire does. A walker that takes the first card offered,
// buys one thing a shop and never drinks a potion arrives at the boss with a starter deck and loses — and
// that tells you nothing whatsoever about the boss. Reading balance off it is reading the bot.
//
// So it is a dial rather than a rewrite. `rough` is the original walker and still the right thing for
// exercising screens. `good` drafts, shops, sharpens, targets and drinks.
const SKILL = arg("--play", "good");
const GOOD = SKILL === "good";
// THE WAY OUT OF ANY ROOM.
// This bot walked in circles for nine hundred steps because it knew the way out by four different class
// names -- .cs-leave, .cr-leave, .ct-return, .cc-return -- and those screens were rebuilt to share one
// bottom band (CardFoot) whose button is .cfoot-go. Nothing in the game was broken; the harness could not
// find a door that was directly in front of it, and reported that as forty identical failures.
// A rig that names an element is coupled to the markup, and the markup is the thing being changed. So it
// asks for the SHARED exit first and keeps the old names behind it.
const LEAVE = ".cfoot-go, .cs-leave, .cr-leave, .cv-leave, .ct-return, .cc-return";

if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${process.env.TEMP}/cdp-bot-${PORT}`, "about:blank",
], { stdio: "ignore" });

let ws = null;
for (let i = 0; i < 40 && !ws; i += 1) {
    await sleep(250);
    try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
        ws = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
}
if (!ws) { chrome.kill(); throw new Error("chrome never came up"); }
const sock = new WebSocket(ws);
await new Promise((r) => { sock.onopen = r; });
let msgId = 0;
const pending = new Map();
sock.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((res) => {
    const i = ++msgId; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params }));
});

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
if (COOKIE) {
    await send("Network.enable");
    await send("Network.setCookie", {
        name: "wolfden-mkt-buyer-session", value: COOKIE,
        domain: new URL(URL_).hostname, path: "/", secure: false, sameSite: "Lax",
    });
}
// Same reason film.mjs and shot.mjs do it: a launch modal over the board swallows every pointer event and the
// game looks broken while being fine.
await installQuiet(send, { hide: quiet(process.env.SHOT_HIDE, QUIET_HIDE, ","), seen: quiet(process.env.SHOT_SEEN, QUIET_SEEN, ";") });

const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true }))?.result?.value;
let shotN = 0;
const shot = async (name) => {
    if (!SHOTS) return;
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${SHOTS}/${String(++shotN).padStart(3, "0")}-${name}.png`, Buffer.from(r.data, "base64"));
};
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", {
    type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "mouse",
});
// ⚠️ ⚠️ AND SIDEWAYS, WHICH TOOK BEATING AN ACT TO FIND OUT. The Deep's sheet is wider than a phone, so
// its rooms scroll horizontally — and this only ever measured top and bottom. The bot chose a lit
// room sitting at x=377 on a 375px screen and dispatched eight presses into the empty space beside the
// window before declaring itself stuck. Act one's map fits across, which is exactly why every map in
// this game worked perfectly for as long as nothing ever won an act.
// ⚠️ IT SCROLLS TO WHAT IT IS ABOUT TO PRESS. A bounding rect is measured against the VIEWPORT, and half of
// what this game asks you to press is below the fold on a 375x667 phone — the shop's Move on ribbon lives
// under two shelves and a brazier. Dispatching a click at y=900 lands on nothing at all, silently: the first
// session bought thirty-five things in a row because it could buy, could not leave, and could not tell.
const boxOf = async (sel, nth = 0) => {
    const b = await js(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
        if (!e) return null;
        const r = e.getBoundingClientRect();
        const off = r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth;
        if (off) e.scrollIntoView({ block: "center", inline: "center" });
        return { off }; })()`);
    if (b?.off) await sleep(260);
    return js(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
        if (!e) return null; const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height,
                 onScreen: r.top >= 0 && r.bottom <= innerHeight }; })()`);
};
const tap = async (sel, nth = 0) => {
    const b = await boxOf(sel, nth);
    if (!b || !b.w) return false;
    await mouse("mousePressed", b.x, b.y);
    await sleep(40);
    await mouse("mouseReleased", b.x, b.y);
    return true;
};
// A DRAG, NOT A CLICK. The hand listens on pointerdown and tracks movement; a bare .click() plays nothing.
const dragTo = async (fromSel, nth, toSel, toNth = 0) => {
    const a = await boxOf(fromSel, nth);
    const b = await boxOf(toSel, toNth);
    if (!a || !b) return false;
    await mouse("mousePressed", a.x, a.y);
    for (let i = 1; i <= 8; i += 1) {
        await mouse("mouseMoved", a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
        await sleep(30);
    }
    await sleep(60);
    await mouse("mouseReleased", b.x, b.y);
    return true;
};

// ── WHAT SCREEN AM I ON ──────────────────────────────────────────────────────────────────────────────────────
// Every screen in this game is a root class: .cm the map, .cs the shop, .cr the campfire and the chest, and
// .cf-field the ring. The overlay inside the ring (.cf-choose) is both the reward and the result, told apart
// by what its title says.
const readScreen = async () => js(`(() => {
    const t = (s) => document.querySelector(s)?.textContent?.trim() || null;
    const has = (s) => Boolean(document.querySelector(s));
    const over = has('.cf-choose');
    const title = t('.cf-title span');
    return {
        screen: has('.cs') ? 'shop' : has('.cv') ? 'event' : has('.cr') ? 'room' : has('.cm') ? 'map' : has('.cf-field') ? 'fight' : 'unknown',
        eventName: t('.cv-name'),
        eventChoices: [...document.querySelectorAll('.cv-do')].map((b) => ({
            label: b.querySelector('b')?.textContent?.trim() || null, off: b.disabled,
        })),
        eventPicking: has('.cv-pick'),
        eventDone: has('.cv-got'),
        over, title,
        hp: t('.cm-hp') || t('.cr-hp') || t('.cs-hp') || t('.cv-hp') || (document.querySelectorAll('.cfb-hp')[0]?.textContent?.trim() ?? null),
        embers: t('.cm-em') || t('.cr-em') || t('.cs-em') || t('.cv-em') || t('.cf-embers'),
        turn: t('.cf-turn'),
        energy: t('.cf-energy-n'),
        offers: document.querySelectorAll('.cf-offer').length,
        foes: [...document.querySelectorAll('.cf-foe')].map((f) => ({
            hp: f.querySelector('.cfb-hp')?.textContent?.trim() || null,
            intent: f.querySelector('.cf-intent')?.getAttribute('title') || null,
        })),
        hand: [...document.querySelectorAll('.cf-hand .cf-card')].map((c) => ({
            name: c.querySelector('.cf-banner')?.textContent?.trim() || null,
            text: c.querySelector('.cf-text')?.textContent?.trim() || null,
            cost: c.querySelector('.cf-cost i')?.textContent?.trim() || null,
            playable: !c.classList.contains('is-spent'),
        })),
        nodes: [...document.querySelectorAll('.cm-node')].map((n) => ({
            label: n.getAttribute('aria-label'), open: n.classList.contains('is-open'), disabled: n.disabled,
        })),
        roomDo: t('.cr-do-label'),
        // Every plate on the campfire, not just the first: resting and sharpening are two different rooms
        // wearing one screen, and which of them you want depends entirely on your health.
        roomChoices: [...document.querySelectorAll('.cr-do')].map((b) => ({
            label: b.querySelector('.cr-do-label')?.textContent?.trim() || '', off: b.disabled,
        })),
        // The shelf reads itself out for a screen reader already, and it says everything a buyer needs:
        // "Ash Fang, 145 embers, more than you have. Deal 12 damage. Look closer."
        shopStock: [...document.querySelectorAll('.cs-buy, .cs-good')].map((b) => b.getAttribute('aria-label')),
        // The three trinkets a dead boss offers. A screen the bot could only ever reach by WINNING, which is
        // why it went unhandled until it did.
        bossPerks: [...document.querySelectorAll('.cf-bossperk')].map((b) => (b.textContent || '').trim()),
        shopBurn: (() => {
            const e = document.querySelector('.cs-burn');
            return e ? { label: (e.textContent || '').trim().slice(0, 70), off: Boolean(e.disabled) } : null;
        })(),
        potions: [...document.querySelectorAll('.cf-potion')].map((b) => ({
            label: b.getAttribute('aria-label') || '', off: Boolean(b.disabled),
        })),
    };
})()`);

// ── THE POLICY ───────────────────────────────────────────────────────────────────────────────────────────────
// Deliberately simple and deliberately WRITTEN DOWN, because the bot's job is to exercise the game rather than
// to be good at it: a clever bot that never dies never sees the death screen. It blocks when the announced
// swing would take more than a quarter of what it has left, and swings otherwise — the same two policies
// cards-sim.mjs scores, so a change that helps the reader in the sim should show up here too.
const wantsBlock = (st) => {
    const hp = Number(String(st.hp || "").split("/")[0]) || 0;
    const incoming = (st.foes || []).reduce((n, f) => {
        const m = /(\d+)/.exec(f.intent || "");
        return n + (m && /attack|damage|hits?/i.test(f.intent || "") ? Number(m[1]) : 0);
    }, 0);
    return incoming > 0 && incoming > hp * 0.25;
};
const isAttack = (c) => /deal|damage/i.test(c.text || "");
const isBlock = (c) => /block/i.test(c.text || "");
// ⚠ WHAT IT IS AIMED AT IS NOT THE SAME QUESTION AS WHETHER IT IS AN ATTACK. Targeting used isAttack,
// which looks for the word "damage" — so Dazzle ("Apply 2 Weak and 2 Vulnerable.") was dropped on the HERO
// every time it was drawn, and a card that debuffs nothing because it was pointed at yourself is a wasted
// turn the transcript reports as a card played. Anything that lands on a foe is thrown at a foe.
const hitsFoe = (c) => {
    const t = c.text || "";
    if (/deal|damage/i.test(t)) return true;
    if (/\b(apply|inflict)\b/i.test(t) && /vulnerable|weak|frail|poison|burn/i.test(t)) return true;
    return /\b(enem(y|ies)|foe)\b/i.test(t) && !/all enemies gain/i.test(t);
};

// ──── AND THE POLICY THAT IS TRYING TO WIN ────────────────────────────────────────────────
// Everything below reads the same words the player reads — the sentence printed on the card, the price on
// the shelf, the label on the plate. It deliberately does NOT import the rules: a bot that scores cards off
// their card definitions is grading the game with the game's own answer key, and would go on agreeing with a
// card whose printed text had stopped matching what it does. Reading the face is how you catch that.
const num = (t, re) => { const m = re.exec(t || ""); return m ? Number(m[1]) : 0; };

// What a card is worth per point of energy. Damage is the unit; everything else is priced against it.
// `need` is what the DECK is short of, which changes what a card is worth to it — see draftValue.
const worth = (c, need = null) => {
    const t = c.text || "";
    if (/cannot be played|unplayable/i.test(t)) return -99;      // a Wound is a dead draw, not a card
    const cost = Number(String(c.cost ?? "").replace(/\D/g, "")) || 0;
    const dmg = num(t, /Deal (\d+) damage/i) * (num(t, /(\d+) times/i) || 1);
    const blk = num(t, /Gain (\d+) Block/i);
    let v = dmg;
    v += blk * 0.9;                                               // block is worth a little under damage
    v += num(t, /Heal (\d+)/i) * 0.7;
    v += num(t, /Draw (\d+)/i) * 4;                               // a card is worth about four damage
    // ⚠ ONLY STRENGTH THAT ENDS UP YOURS. `/(\d+) Strength/` also matches "The enemy loses 2 Strength
    // for good", so Disarm was scored as a fourteen-point bomb and drafted twice in one run — the bot was
    // reading a debuff on the foe as a buff on itself. Anchor it to the words that mean you gained it.
    if (!/(enem|foe|it|they)\w*\s+loses/i.test(t)) v += num(t, /(?:Gain|and)\s+(\d+) Strength/i) * 5;
    // Taking Strength OFF the thing hitting you is real, and worth about what a debuff is worth.
    v += num(t, /loses (\d+) Strength/i) * 3;
    v += num(t, /(\d+) Vulnerable/i) * 3;
    v += num(t, /(\d+) Weak/i) * 3;
    v += num(t, /(\d+) Thorns/i) * 2;
    if (/Gain \d+ Energy|\+\d+ Energy/i.test(t)) v += 9;
    if (/Exhaust/i.test(t)) v -= 2.5;                             // once, then gone
    // ──── AND WHAT THE DECK IS SHORT OF ────────────────────────────────────────────────────
    // ⚠ A DECK OF NOTHING BUT BLOCK CANNOT WIN. Three runs died holding Quills+, Shrug It Off, Scuttle+,
    // Fleece and Gleaning, because every one of those scores well on its own and the bot had no notion that
    // it had stopped drafting a way to actually kill anything. Guarding perfectly for thirty turns is a loss.
    // A real player asks "what is this deck missing" before "what is the best card here", so this does too.
    if (need) {
        if (dmg > 0 && need.damage) v *= 1.7;
        if (dmg === 0 && blk > 0 && !need.damage) v *= 1.1;
        if (dmg === 0 && blk > 0 && need.damage) v *= 0.6;
    }
    // Per energy, and a nought-cost card is not infinitely good — it still takes a card slot.
    return v / Math.max(0.75, cost);
};

// ⚠ A DECK GETS WORSE BY GROWING. Spire's whole drafting tension is that every card you take makes the
// good ones rarer, so a card has to beat the deck it is joining rather than merely be positive. Ten is the
// starter; past about eighteen only a genuinely strong card is worth the dilution.
//
// The first cut of this never once refused a card, because the numbers coming out of worth() sat between ten
// and fourteen and the bar was three. A threshold has to be set against the distribution it is filtering or
// it is a decoration — these are read off what the evaluator actually returns for real offers.
const wantsCard = (best, deckN) => best.v >= (deckN >= 20 ? 17 : deckN >= 16 ? 13 : deckN >= 13 ? 10 : 6);

// What the deck has too little of. Only one thing is ever fatal to be short of, and it is damage.
const deckNeeds = (attacks, deckN) => ({ damage: attacks / Math.max(1, deckN) < 0.42 });

// Incoming damage this turn, read off the intent pills the same way the player reads them.
const incomingOn = (st) => (st.foes || []).reduce((n, f) => {
    const m = /(\d+)/.exec(f.intent || "");
    return n + (m && /attack|damage|hits?|swing/i.test(f.intent || "") ? Number(m[1]) : 0);
}, 0);

const hpOf = (s) => Number(String(s || "").split("/")[0]) || 0;
const maxOf = (s) => Number(String(s || "").split("/")[1]) || 1;

// ⚠ KILL THE ONE THAT IS NEARLY DEAD, NOT THE ONE IN FRONT. A foe removed is its whole intent removed
// for the rest of the fight, which is worth more than the same damage spread across two survivors — this is
// the single biggest difference between a bot that beats an elite and one that does not.
const aimAt = (st) => {
    const alive = (st.foes || []).map((f, i) => ({ ...f, i })).filter((f) => hpOf(f.hp) > 0);
    if (!alive.length) return { i: 0, hp: null };
    return alive.slice().sort((a, b) => hpOf(a.hp) - hpOf(b.hp))[0];
};

// Which card to play now. Not "the best card" — the best card FOR THIS TURN, which is a different thing
// when something is about to hit you for half your health.
const chooseCard = (st, playable) => {
    const hp = hpOf(st.hp), max = maxOf(st.hp);
    const incoming = incomingOn(st);
    const target = aimAt(st);
    const scored = playable.map((c) => {
        let v = worth(c);
        const t = c.text || "";
        // Setup before the swing: a debuff played after the last attack of a turn does nothing this turn.
        if (/Vulnerable|Weak/i.test(t)) v += 3;
        // Enough damage on the card to finish the target outright — take the kill.
        const dmg = num(t, /Deal (\d+) damage/i) * (num(t, /(\d+) times/i) || 1);
        if (dmg > 0 && target.hp && dmg >= hpOf(target.hp)) v += 25;
        // The swing coming is big relative to what is left: guarding is now the highest-value play there is.
        if (isBlock(c) && incoming > 0) v += incoming > hp * 0.45 ? 14 : incoming > hp * 0.25 ? 5 : 0;
        // Healing a full hero is a wasted card.
        if (/Heal/i.test(t) && hp >= max) v -= 5;
        return { ...c, v };
    });
    return scored.sort((a, b) => b.v - a.v)[0];
};

// A bottle is a resource, and hoarding it to the death screen is the commonest way to waste one.
const wantsPotion = (st) => {
    const hp = hpOf(st.hp), max = maxOf(st.hp);
    const incoming = incomingOn(st);
    if (!(st.potions || []).length) return -1;
    const usable = (st.potions || []).map((p, i) => ({ ...p, i })).filter((p) => !p.off);
    if (!usable.length) return -1;
    const desperate = hp <= max * 0.35 || incoming >= hp;
    if (!desperate) return -1;
    // Whatever answers being about to die: healing first, then block, then anything at all.
    const heal = usable.find((p) => /heal|health/i.test(p.label));
    const guard = usable.find((p) => /block/i.test(p.label));
    return (heal || guard || usable[0]).i;
};

// A shelf item, out of the sentence the shelf reads to a screen reader.
const shelfItem = (label, i) => {
    const m = /^(.*?),\s*(\d+)\s*embers(,\s*more than you have)?\.\s*(.*?)\s*Look closer\.?$/i.exec(label || "");
    if (!m) return { i, name: label || "?", price: Infinity, poor: true, text: "" };
    return { i, name: m[1], price: Number(m[2]), poor: Boolean(m[3]), text: m[4] || "" };
};

const log = [];
// ──── NOTHING IN HERE MAY REPEAT FOREVER ──────────────────────────────────────────────
// Every loop this bot has fallen into looked the same from outside: one line, over and over, while the run
// went nowhere — thirty "drink: Small Mercy", ten "skipped Rally", forty "shop: leaving". Each one got its
// own guard afterwards, which is one guard per loop discovered, and the next loop is always somewhere new.
// So the LINE ITSELF is the signal. A step that says exactly what the last step said, many times over, is a
// bot that has stopped playing whether or not anyone predicted that particular way of stopping.
let repeatOf = null, repeats = 0;
const note = (...a) => {
    const line = a.join(" ");
    if (line === repeatOf) repeats += 1; else { repeatOf = line; repeats = 0; }
    log.push(line);
    console.log(line);
};
const spinning = () => repeats >= 7;

await send("Page.navigate", { url: URL_ });
await sleep(4200);

let runs = 0, steps = 0, deaths = 0, wins = 0, stuck = 0, shopVisits = 0;
// ⚠ COUNTED, NOT READ. The first cut of this read `.cm-deck-n` off the map, which looks like a deck
// size and is not — it is the "x2" badge on a card the deck holds two of, and it only exists at all while
// the deck panel is open. So the counter never moved, every draft saw a ten-card deck, and the bot took all
// fifteen cards it was offered while believing it was keeping a tight one. Counted here instead: ten to
// start, one for each card taken or bought, one back for each card burned.
let deckSize = 10;
// Of those ten, five swing. The share of the deck that can deal damage is the one thing a draft must not
// let slide — see deckNeeds.
let attackCards = 5;
// Cards this turn that were thrown and did not land, and the turn they belong to.
let turnKey = null;
// How many turns in a row the bot has been looking at the same screen. A fight legitimately sits on one for
// a long time; nothing else should.
let sameScreen = 0, screenWas = null;
const refused = new Set();
// How many of each named thing has been bought this run, so the shelf cannot sell four of one bottle.
const bought = new Map();
// Belt slots that were pressed and poured nothing. Cleared the moment any bottle does work.
const poured = new Set();
let lastScreen = null;
while (runs < RUNS && steps < MAX_STEPS) {
    steps += 1;
    const st = await readScreen();
    if (st.screen !== lastScreen) { await shot(st.screen); lastScreen = st.screen; }

    // The same step, seven times over: whatever this screen wants, the bot is not giving it. Photograph it,
    // try the way out, and if there is not one, stop rather than spend the budget discovering there is not.
    // ⚠️ AND ONE THAT COUNTS SCREENS, NOT SENTENCES. The campfire loop above renamed itself every pass,
    // so the text-matching watchdog never fired and the run spent its whole budget on one room. This one
    // asks a duller question — how many turns in a row have I been on this same screen — which no amount
    // of changing wording can hide from.
    sameScreen = st.screen === screenWas ? sameScreen + 1 : 0;
    screenWas = st.screen;
    if (sameScreen >= 25 && st.screen !== "fight") {
        note(`  ⚠️  ${sameScreen} turns on the same ${st.screen} — taking the way out`);
        await shot("stuck-screen");
        sameScreen = 0;
        if (!(await tap(LEAVE))) { note("  no way out — stopping"); break; }
        await sleep(2400);
        continue;
    }

    if (spinning()) {
        await shot("spinning");
        note(`  ⚠  SPINNING on the same step — trying the way out`);
        repeats = 0;
        if (!(await tap(LEAVE)) && !(await tap(".cf-end"))) { note("  no way out — stopping"); break; }
        await sleep(2400);
        continue;
    }

    // ── THE RESULT AND THE REWARD, both inside the ring's overlay ────────────────────────────────────────
    if (st.over) {
        // ──── THE BOSS IS DOWN, AND THE ACT DOES NOT OPEN BY ITSELF ────────────────────────
        // ⚠ THE BOT SAT HERE FOR EIGHT MINUTES. Beating an act offers three boss trinkets and one must be
        // taken before the next act opens — and nothing in here knew the screen, because the walker this
        // was grown from had never once won a fight it needed to see. So the run finished, the game was
        // waiting politely, and the harness reported an unknown screen until the budget ran out.
        // A whole third of this game was unreachable by its own test rig, and only a bot good enough to win
        // could ever have found that out.
        if ((st.bossPerks || []).length) {
            await shot("boss-trinket");
            // They all cost something; the question is what. Max health is the price that keeps being paid
            // for the rest of the run, so it is the one worth counting against the offer.
            const priced = st.bossPerks.map((t, i) => {
                const cost = Number((/-(\d+) max health/i.exec(t) || [])[1] || 0);
                let v = 10 - cost;
                if (/heal \d+ after every fight/i.test(t)) v += 8;      // it pays every single room
                if (/every enemy starts/i.test(t)) v += 7;
                if (/first attack each fight/i.test(t)) v += 4;         // once a fight, and only the first
                return { i, t, v };
            }).sort((a, b) => b.v - a.v);
            const take = priced[0];
            note(`  boss trinket: ${take.t.split(/(?<=[a-z])(?=[A-Z])/)[0] || take.t}`.slice(0, 110));
            await tap(".cf-bossperk", take.i);
            await sleep(2400);
            continue;
        }
        if (st.offers) {
            await shot("reward");
            if (!GOOD) {
                note(`  reward: ${st.offers} offered — taking the first`);
                await tap(".cf-offer", 0);
                await sleep(1800);
                continue;
            }
            // ──── THE DRAFT, WHICH IS WHERE THE RUN IS ACTUALLY DECIDED ──────────────────────────
            // Reads the three faces on offer, scores them per energy, and ⚠ IS WILLING TO TAKE NOTHING.
            // Skipping is a real move in this game — it pays embers and it keeps the deck thin — and a bot
            // that cannot skip ends the act holding twenty-six cards and drawing its worst five.
            const offered = await js(`[...document.querySelectorAll('.cf-offer')].map((o) => ({
                name: o.querySelector('.cf-banner')?.textContent?.trim() || null,
                text: o.querySelector('.cf-text')?.textContent?.trim() || null,
                cost: o.querySelector('.cf-cost i')?.textContent?.trim() || null,
            }))`);
            const size = deckSize || 10;
            const need = deckNeeds(attackCards, size);
            const best = (offered || []).map((c, i) => ({ ...c, i, v: worth(c, need) })).sort((a, b) => b.v - a.v)[0];
            if (best && wantsCard(best, size)) {
                note(`  draft: ${best.name} (${best.text}) — worth ${best.v.toFixed(1)}/energy,`
                    + ` deck ${size} (${attackCards} attacks${need.damage ? ", SHORT of damage" : ""})`);
                await tap(".cf-offer", best.i);
                deckSize += 1;
                if (/deal \d+ damage/i.test(best.text || "")) attackCards += 1;
            } else {
                note(`  draft: skipped ${best ? `${best.name} at ${best.v.toFixed(1)}` : "all"} — deck ${size} is better thin`);
                // ⚠ .cf-pill IS NOT ONE BUTTON. It is the shared plate style — Close, Leave, Replay this
                // fight, both halves of two confirm dialogs, and Take nothing — so tapping index 0 pressed
                // whichever happened to be first in the document. Filmed: ten identical "skipped Rally" lines
                // and the reward never closed, which burned the rest of the run's step budget.
                // Find the plate by what is written on it, which is the only stable thing about it.
                const skipAt = await js(`[...document.querySelectorAll('.cf-pill')]
                    .findIndex((b) => /take nothing/i.test(b.textContent || ''))`);
                if (skipAt >= 0) await tap(".cf-pill", skipAt);
                else { note("  ⚠  no Take nothing plate — taking the best instead"); await tap(".cf-offer", best.i); deckSize += 1; }
            }
            await sleep(1800);
            continue;
        }
        await shot("result");
        const done = /died|abandoned|run is yours/i.test(st.title || "");
        if (done) {
            if (/run is yours/i.test(st.title || "")) wins += 1; else deaths += 1;
            runs += 1;
            note(`══ RUN ${runs} ENDED: ${st.title} ══`);
            if (runs >= RUNS) break;
            // ⚠ A NEW RUN IS A NEW DECK, and none of this was being put back — run three opened
            // believing it already held nineteen cards, so its draft bar started at the strictest setting and
            // it refused things a fresh deck badly wants. Everything counted per-run is reset here.
            deckSize = 10;
            attackCards = 5;
            bought.clear();
            poured.clear();
            refused.clear();
            await tap(".cf-pill.is-primary");   // New run
            await sleep(3000);
            continue;
        }
        // A won fight with the offers still in flight. Wait for them.
        await sleep(900);
        continue;
    }

    if (st.screen !== "shop") shopVisits = 0;

    if (st.screen === "map") {
        const open = (st.nodes || []).map((n, i) => ({ ...n, i })).filter((n) => n.open && !n.disabled);
        // ⚠️ ONE BAD READ IS NOT A STUCK RUN. This broke off the whole session the first time it saw a map
        // with nothing lit — and a map with nothing lit is what you get for a moment after tapping a room,
        // while the server is answering and the next screen has not replaced this one yet. Filmed: the run
        // had advanced into a fight and the bot had already given up on it.
        // Three looks before it believes the map, which costs a second and a half in the case that is
        // genuinely stuck and saves the run in the case that is not.
        if (!open.length) {
            let seen = null;
            for (let look = 0; look < 3 && !seen; look += 1) {
                await sleep(700);
                const again = await readScreen();
                if (again.screen !== "map") { seen = again; break; }
                const lit = (again.nodes || []).filter((n) => n.open && !n.disabled);
                if (lit.length) { seen = again; break; }
            }
            if (!seen) { note("  map: nothing open — stuck"); await shot("map-stuck"); break; }
            continue;
        }
        const hp = hpOf(st.hp);
        const max = maxOf(st.hp);
        // Hurt? take the fire. Otherwise take the first thing that is not a fight, then a fight.
        let pick = (hp / max < 0.55 && open.find((n) => /rest/i.test(n.label)))
            || open.find((n) => /treasure|merchant|unknown/i.test(n.label))
            || open[0];
        if (GOOD) {
            // ──── ROUTING, WHICH IS THE OTHER HALF OF THE DRAFT ──────────────────────────────
            // An elite is where the trinkets are, and a trinket is worth more than any single card — so a
            // healthy deck WALKS TOWARDS them and a hurt one goes round. Taking every elite on the sheet is
            // how a Spire player ends act one stronger than the act two that follows it.
            const fire = open.find((n) => /rest/i.test(n.label));
            const elite = open.find((n) => /elite/i.test(n.label));
            pick = (hp / max < 0.5 && fire)
                || (hp / max > 0.75 && elite)
                || open.find((n) => /treasure|merchant/i.test(n.label))
                || open.find((n) => /unknown/i.test(n.label))
                || fire
                || open[0];
        }
        note(`  map ${st.hp} ${st.embers || ""} deck ${deckSize} → ${pick.label}`);
        await tap(".cm-node", pick.i);
        await sleep(2600);
        continue;
    }

    // ── A ROOM WITH WRITING IN IT ────────────────────────────────────────────────────────────────────────
    // ⚠️ THE BOT SAT ON ONE FOR 339 STEPS. Events landed and nothing here knew the screen, so `unknown` came
    // back over and over and the run never moved — which is the whole argument for this bot existing: the
    // simulator had been happily playing events for an hour and could not have told me the interface was a
    // dead end. Takes the first choice it can afford (the disabled ones say so on the plate), answers the
    // picker if the choice asks which card, then leaves.
    if (st.screen === "event") {
        if (st.eventPicking) {
            note("  event: choosing a card");
            await tap(".cv-card:not(.is-done)");
            await sleep(1800);
            await shot("event-done");
            await tap(LEAVE);
            await sleep(2400);
            continue;
        }
        if (!st.eventDone) {
            const take = st.eventChoices.findIndex((c) => !c.off);
            note(`  event: ${st.eventName} → ${st.eventChoices[take]?.label || "(nothing available)"}`);
            if (take > -1) {
                await tap(".cv-do", take);
                await sleep(1900);
                await shot("event-done");
            }
        }
        await tap(LEAVE);
        await sleep(2400);
        continue;
    }

    if (st.screen === "room") {
        // ──── THE FIRE IS A CHOICE, AND THE WALKER NEVER MADE IT ────────────────────────────
        // Two plates on a campfire: heal, or sharpen a card for the rest of the run. Tapping the first one
        // every time means never sharpening anything, and a permanently upgraded card compounds across every
        // remaining fight where the heal is spent by the next elite. Full health? take the edge.
        // ⚠️ THE SHARPEN PLATE IS A TOGGLE. Its label flips to "Never mind" while the picker is open, so
        // pressing it again CLOSES the picker — and because the label changed, the note changed, and the
        // repeat-watchdog below never saw two identical lines. A loop that renames itself every pass is
        // invisible to a watchdog that matches on text.
        if (GOOD && await js(`!!document.querySelector('.cr-pick')`)) {
            note("  fire: picker already open — closing it rather than toggling");
            await tap(".cr-pick-close");
            await sleep(700);
            continue;
        }
        if (GOOD && (st.roomChoices || []).length > 1) {
            const live = st.roomChoices.map((c, i) => ({ ...c, i })).filter((c) => !c.off);
            const fire = live.find((c) => /heal/i.test(c.label));
            const edge = live.find((c) => /sharpen/i.test(c.label));
            const want = (hpOf(st.hp) / maxOf(st.hp) < 0.62 && fire) || edge || live[0];
            if (want) {
                note(`  fire: ${want.label} (at ${st.hp})`);
                await tap(".cr-do", want.i);
                await sleep(1500);
                // Sharpening opens a picker; take the card the deck leans on most, which is the one it holds
                // the most copies of — upgrading a card you draw twice a fight beats upgrading a one-off.
                if (/sharpen/i.test(want.label)) {
                    // ⚠️ THE PICKABLE THING IS .cr-card, NOT .cf-card. The button carries `is-done` when the
                    // card has already been sharpened; .cf-card is a SPAN inside it holding the face. So
                    // `.cf-card:not(.is-done)` excluded nothing — the class it was testing lives one level up —
                    // and the index it produced counted the already-sharpened cards too. On a deck where most
                    // cards were done it kept choosing a DISABLED button, which does nothing, forever.
                    // Filmed: 161 identical campfire screens on one room.
                    const PICK = ".cr-pick-deck .cr-card:not(.is-done)";
                    const which = await js(`(() => {
                        const cs = [...document.querySelectorAll(${JSON.stringify(PICK)})];
                        const name = (c) => c.querySelector('.cf-banner')?.textContent?.trim() || '';
                        // The card the deck leans on most: the one it holds the most copies of, tie-broken by
                        // how much text is on it (a card that does two things is worth sharpening over a card
                        // that does one).
                        const n = {}; cs.forEach((c) => { n[name(c)] = (n[name(c)] || 0) + 1; });
                        let bi = 0, bs = -1;
                        cs.forEach((c, i) => {
                            const sc = (n[name(c)] || 1) * 10 + (c.querySelector('.cf-text')?.textContent || '').length / 40;
                            if (sc > bs) { bs = sc; bi = i; }
                        });
                        return { i: bi, name: name(cs[bi]) || null, of: cs.length };
                    })()`);
                    if (which && which.of) {
                        note(`  fire: sharpening ${which.name} (${which.of} still sharpenable)`);
                        await tap(PICK, which.i);
                        await sleep(1600);
                    } else {
                        // Everything in the deck is already sharpened. The plate said otherwise, so take the
                        // way out the panel offers rather than pressing the plate again and reopening it.
                        note("  fire: nothing left to sharpen — closing the picker");
                        await tap(".cr-pick-close");
                        await sleep(700);
                    }
                }
                await shot("room-done");
                await tap(LEAVE);
                await sleep(2400);
                continue;
            }
        }
        if (st.roomDo) {
            note(`  room: ${st.roomDo}`);
            await tap(".cr-do");
            await sleep(1800);
            await shot("room-done");
        }
        await tap(LEAVE);
        await sleep(2400);
        continue;
    }

    if (st.screen === "shop") {
        // ONE LOOK, ONE BUY, THEN OUT. A visit that keeps buying is not a shop trip, it is a loop — and the
        // first session ran thirty-five of them because the Move on ribbon was under the fold.
        // ──── AND A GOOD PLAYER LEAVES THE SHOP EMPTY ──────────────────────────────────
        // Embers do nothing at the end of a run. The walker bought one thing, whichever happened to be first,
        // and reached the boss with 285 unspent — which is most of a second deck left on the shelf.
        // Burning comes first and it is not close: taking a Wound or a starter Bite OUT is worth more than
        // almost anything you could put in, because it makes every good card you own more likely every draw.
        if (GOOD) {
            if (shopVisits < 1) {
                if (st.shopBurn && !st.shopBurn.off && /burn a card/i.test(st.shopBurn.label || "")) {
                    await tap(".cs-burn");
                    await sleep(1100);
                    // The worst card in the deck: a Wound if there is one, otherwise the weakest thing printed.
                    const burn = await js(`(() => {
                        const cs = [...document.querySelectorAll('.cs-pick .cf-card')];
                        let bi = -1, bs = 1e9;
                        cs.forEach((c, i) => {
                            const t = c.querySelector('.cf-text')?.textContent || '';
                            const d = Number((/Deal (\\d+) damage/i.exec(t) || [])[1] || 0)
                                + Number((/Gain (\\d+) Block/i.exec(t) || [])[1] || 0);
                            const s = /cannot be played|unplayable/i.test(t) ? -1 : d;
                            if (s < bs) { bs = s; bi = i; }
                        });
                        return { i: bi, name: cs[bi]?.querySelector('.cf-banner')?.textContent?.trim() || null };
                    })()`);
                    if (burn && burn.i >= 0) {
                        note(`  shop: burning ${burn.name}`);
                        await tap(".cs-pick .cf-card", burn.i);
                        await sleep(1700);
                        if (deckSize) deckSize -= 1;
                    }
                }
                // Then the shelf, best value per ember first, for as long as one is affordable.
                for (let buy = 0; buy < 4; buy += 1) {
                    const look = await readScreen();
                    if (look.screen !== "shop") break;
                    // ⚠ AND NOT FOUR OF THE SAME BOTTLE. Value alone bought Hex Flask, Hex Flask, Hex
                    // Flask and Hex Flask — eighty-four embers on one answer to one problem, when the belt
                    // only ever needs one or two of anything. Nobody shops like that.
                    const stock = (look.shopStock || []).map(shelfItem)
                        .filter((it) => !it.poor && Number.isFinite(it.price))
                        .filter((it) => (bought.get(it.name) || 0) < 2)
                        .map((it) => ({ ...it, v: worth({ text: it.text, cost: null }) / Math.max(1, it.price / 60) }))
                        .sort((a, b) => b.v - a.v);
                    if (!stock.length) break;
                    const it = stock[0];
                    await tap(".cs-buy, .cs-good", it.i);
                    await sleep(900);
                    const can = await js(`!document.querySelector('.cs-look-buy')?.disabled`);
                    if (!can) { await tap(".cs-look-no"); await sleep(500); break; }
                    await tap(".cs-look-buy");
                    await sleep(1700);
                    note(`  shop: bought ${it.name} for ${it.price}`);
                    bought.set(it.name, (bought.get(it.name) || 0) + 1);
                    if (!/potion|flask|oil|tonic|elixir|draught/i.test(it.name)) deckSize += 1;
                }
                await shot("shop-look");
            }
            shopVisits += 1;
            const gone = await tap(LEAVE);
            note(`  shop: leaving (${gone ? "pressed" : "COULD NOT FIND the way out"})`);
            await sleep(2400);
            continue;
        }
        const opened = shopVisits < 1 && await tap(".cs-buy, .cs-good", 0);
        shopVisits += 1;
        if (opened) {
            await sleep(900);
            await shot("shop-look");
            const canBuy = await js(`!document.querySelector('.cs-look-buy')?.disabled`);
            if (canBuy) { await tap(".cs-look-buy"); await sleep(1600); note("  shop: bought"); }
            else { await tap(".cs-look-no"); await sleep(500); }
        }
        const left = await tap(LEAVE);
        note(`  shop: leaving (${left ? "pressed" : "COULD NOT FIND the way out"})`);
        await sleep(2400);
        continue;
    }

    if (st.screen === "fight") {
        const hand = st.hand || [];
        const playable = hand.map((c, i) => ({ ...c, i })).filter((c) => c.playable);
        if (!playable.length) {
            note(`  turn ${st.turn || "?"} — nothing playable, ending turn`);
            await tap(".cf-end");
            await sleep(2600);
            continue;
        }
        // ⚠ A BOTTLE ON THE BELT AT THE DEATH SCREEN IS A BOTTLE WASTED. The walker never had a way to
        // drink one at all, so every potion this game has ever handed out was still being carried when it
        // died — which also means no potion effect had ever once been exercised through the interface.
        if (GOOD) {
            const bottle = wantsPotion(st);
            // ⚠ AND IT HAS TO GIVE UP ON THE BELT. The first cut had no guard here at all, and a bottle
            // whose press did not land is a press the bot will decide to make again on the very next look — it
            // is still hurt, the bottle is still there, the reasoning is unchanged. Filmed: thirty-odd
            // identical "drink: Small Mercy" lines at 19/88 with nothing on screen moving, which burned the
            // whole step budget of a run that was four turns from killing a boss.
            // Any loop a bot can enter by being CORRECT twice needs a counter, not better reasoning.
            if (bottle >= 0 && !poured.has(bottle)) {
                const was = st.hp;
                note(`  drink: ${(st.potions[bottle].label || "").replace(/^Drink /, "")} (at ${st.hp})`);
                // What is actually under the finger. A scrim from some other part of the site parked over the
                // game swallows every press silently, and from the transcript that is indistinguishable from
                // a button that does not work — so it says which it was.
                const onTop = await js(`(() => { const b = document.querySelectorAll('.cf-potion')[${bottle}];
                    if (!b) return null; const r = b.getBoundingClientRect();
                    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                    return e === b || b.contains(e) ? null : (e?.className || 'something'); })()`);
                if (onTop) note(`  ⚠  the belt is UNDER ${String(onTop).split(" ").pop()} — the press cannot reach it`);
                await tap(".cf-potion", bottle);
                await sleep(1500);
                const now = await readScreen();
                // Poured and nothing moved: not this bottle again, whatever the reason.
                if (now.hp === was && (now.potions || []).length === (st.potions || []).length) {
                    poured.add(bottle);
                    note(`  drink: it did not pour — leaving that bottle alone`);
                } else {
                    poured.clear();
                }
                continue;
            }
        }
        // ──── A CARD THAT WOULD NOT GO DOWN IS NOT THE CARD TO TRY AGAIN ──────────────────────
        // Filmed at a boss: Quills+ chosen four times in one turn, thrown four times, and the energy never
        // moved off 1/3. Whatever the reason a particular throw does not land — a card sitting half off the
        // end of the tray, a rule the bot has not modelled — re-picking the same card is guaranteed to
        // reproduce it, and the walker's stall guard then spends the whole turn discovering that three times.
        // So a refusal is remembered for the turn and the next-best card is played instead.
        // ⚠ THE HAND IS STILL FLYING IN. A turn deals five cards that animate onto the tray, and a drag
        // begun while they are moving starts on a card that is no longer where it was measured. Whole opening
        // turns went by with three cards thrown and the energy never leaving 3/3 — which reads in the
        // transcript exactly like three cards that do not work. Wait for the deal on the first play of a turn.
        if (st.turn !== turnKey) {
            turnKey = st.turn;
            refused.clear();
            await sleep(700);
        }
        const offered = playable.filter((c) => !refused.has(c.name));
        if (!offered.length) {
            note(`  turn ${st.turn || "?"} — every playable card refused, ending turn`);
            await tap(".cf-end");
            await sleep(2600);
            continue;
        }
        const block = wantsBlock(st);
        const card = GOOD
            ? chooseCard(st, offered)
            : (block && offered.find(isBlock)) || offered.find(isAttack) || offered[0];
        // ⚠️ A SKILL LANDS ON YOU; AN ATTACK LANDS ON SOMETHING STILL STANDING. The first cut always dropped
        // on `.cf-foe` index 0, and the moment that one died the bot spent thirty-seven straight steps
        // dragging Bite into a corpse with the energy never moving. A dead foe is still in the row.
        const alive = (st.foes || []).map((f, i) => ({ ...f, i }))
            .filter((f) => (Number(String(f.hp || "").split("/")[0]) || 0) > 0);
        // The walker hit whoever stood leftmost. A player finishes the one that is nearly dead, because a
        // corpse stops swinging — see aimAt.
        // ⚠ NAME THE FOE YOU AIM AT, THEN READ THAT FOE. The line below said `foe ${aim}` and then printed
        // alive[0]'s health whatever the aim was, so a transcript of a two-foe fight showed the leftmost
        // creature's bar frozen while the bot was correctly killing the other one — which reads exactly
        // like damage that does not land. Cost an hour of chasing a bug that was in this line, not the game.
        const aimed = GOOD ? aimAt(st) : (alive[0] || { i: 0, hp: null });
        const aim = aimed.i ?? 0;
        const target = hitsFoe(card) ? ".cf-foe" : ".cf-hero";
        note(`  t${(st.turn || "").replace(/.*Turn /, "")} ${st.hp} e:${st.energy || "?"}`
            + ` — ${card.name} (${card.text}) → ${hitsFoe(card) ? `foe ${aim} ${aimed.hp || ""}` : "self"}`);
        // ⚠ THROW FROM THE MIDDLE OF THE TRAY. The hand is a carousel: only the raised card sits fully
        // on screen and the ones at either end are clipped by the edge, so a drag that starts on their
        // visible sliver begins outside the card it meant to pick up. Tapping first is what a thumb does
        // anyway — walk the hand, read the card, then throw it.
        if (GOOD) { await tap(".cf-hand .cf-card", card.i); await sleep(280); }
        const slot = GOOD
            ? await js(`[...document.querySelectorAll('.cf-hand .cf-card')].findIndex((c) =>
                (c.querySelector('.cf-banner')?.textContent || '').trim() === ${JSON.stringify(card.name || "")})`)
            : card.i;
        await dragTo(".cf-hand .cf-card", slot >= 0 ? slot : card.i, target, hitsFoe(card) ? aim : 0);
        await sleep(1100);
        // ── A TURN THAT IS NOT MOVING IS A TURN TO END ──────────────────────────────────────────────────
        // Whatever the reason a card will not go down — a target it cannot reach, an animation still
        // running, a rule the bot does not know — sitting there re-dragging it is how the run above spent
        // its whole budget on one turn. Three failures and the turn goes back.
        const after = await readScreen();
        if (after.energy === st.energy && (after.hand || []).length === hand.length) {
            refused.add(card.name);
            stuck += 1;
            if (stuck >= 3) {
                note(`  turn will not move (${card.name} × ${stuck}) — ending it`);
                await shot("stuck");
                await tap(".cf-end");
                await sleep(2600);
                stuck = 0;
            }
        } else stuck = 0;
        continue;
    }

    note(`  unknown screen (${st.title || "no title"}) — waiting`);
    await shot("unknown");
    await sleep(1500);
}

note(`\n── ${runs} run(s), ${steps} steps: ${wins} won, ${deaths} died — played ${SKILL} ──`);
if (SHOTS) { writeFileSync(`${SHOTS}/transcript.txt`, log.join("\n")); note(`transcript + ${shotN} shots in ${SHOTS}`); }
sock.close();
chrome.kill();
process.exit(0);
