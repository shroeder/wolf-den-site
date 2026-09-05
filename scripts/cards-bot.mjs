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
// ⚠️ IT SCROLLS TO WHAT IT IS ABOUT TO PRESS. A bounding rect is measured against the VIEWPORT, and half of
// what this game asks you to press is below the fold on a 375x667 phone — the shop's Move on ribbon lives
// under two shelves and a brazier. Dispatching a click at y=900 lands on nothing at all, silently: the first
// session bought thirty-five things in a row because it could buy, could not leave, and could not tell.
const boxOf = async (sel, nth = 0) => {
    const b = await js(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
        if (!e) return null;
        const r = e.getBoundingClientRect();
        const off = r.top < 0 || r.bottom > innerHeight;
        if (off) e.scrollIntoView({ block: "center" });
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
        screen: has('.cs') ? 'shop' : has('.cr') ? 'room' : has('.cm') ? 'map' : has('.cf-field') ? 'fight' : 'unknown',
        over, title,
        hp: t('.cm-hp') || t('.cr-hp') || t('.cs-hp') || (document.querySelectorAll('.cfb-hp')[0]?.textContent?.trim() ?? null),
        embers: t('.cm-em') || t('.cr-em') || t('.cs-em') || t('.cf-embers'),
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
        shopStock: [...document.querySelectorAll('.cs-buy, .cs-good')].map((b) => b.getAttribute('aria-label')),
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

const log = [];
const note = (...a) => { const line = a.join(" "); log.push(line); console.log(line); };

await send("Page.navigate", { url: URL_ });
await sleep(4200);

let runs = 0, steps = 0, deaths = 0, wins = 0, stuck = 0, shopVisits = 0;
let lastScreen = null;
while (runs < RUNS && steps < MAX_STEPS) {
    steps += 1;
    const st = await readScreen();
    if (st.screen !== lastScreen) { await shot(st.screen); lastScreen = st.screen; }

    // ── THE RESULT AND THE REWARD, both inside the ring's overlay ────────────────────────────────────────
    if (st.over) {
        if (st.offers) {
            await shot("reward");
            note(`  reward: ${st.offers} offered — taking the first`);
            await tap(".cf-offer", 0);
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
        if (!open.length) { note("  map: nothing open — stuck"); await shot("map-stuck"); break; }
        const hp = Number(String(st.hp || "").split("/")[0]) || 0;
        const max = Number(String(st.hp || "").split("/")[1]) || 1;
        // Hurt? take the fire. Otherwise take the first thing that is not a fight, then a fight.
        const pick = (hp / max < 0.55 && open.find((n) => /rest/i.test(n.label)))
            || open.find((n) => /treasure|merchant|unknown/i.test(n.label))
            || open[0];
        note(`  map ${st.hp} ${st.embers || ""} → ${pick.label}`);
        await tap(".cm-node", pick.i);
        await sleep(2600);
        continue;
    }

    if (st.screen === "room") {
        if (st.roomDo) {
            note(`  room: ${st.roomDo}`);
            await tap(".cr-do");
            await sleep(1800);
            await shot("room-done");
        }
        await tap(".cr-leave");
        await sleep(2400);
        continue;
    }

    if (st.screen === "shop") {
        // ONE LOOK, ONE BUY, THEN OUT. A visit that keeps buying is not a shop trip, it is a loop — and the
        // first session ran thirty-five of them because the Move on ribbon was under the fold.
        const opened = shopVisits < 1 && await tap(".cs-buy, .cs-good", 0);
        shopVisits += 1;
        if (opened) {
            await sleep(900);
            await shot("shop-look");
            const canBuy = await js(`!document.querySelector('.cs-look-buy')?.disabled`);
            if (canBuy) { await tap(".cs-look-buy"); await sleep(1600); note("  shop: bought"); }
            else { await tap(".cs-look-no"); await sleep(500); }
        }
        const left = await tap(".cs-leave");
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
        const block = wantsBlock(st);
        const card = (block && playable.find(isBlock)) || playable.find(isAttack) || playable[0];
        // ⚠️ A SKILL LANDS ON YOU; AN ATTACK LANDS ON SOMETHING STILL STANDING. The first cut always dropped
        // on `.cf-foe` index 0, and the moment that one died the bot spent thirty-seven straight steps
        // dragging Bite into a corpse with the energy never moving. A dead foe is still in the row.
        const alive = (st.foes || []).map((f, i) => ({ ...f, i }))
            .filter((f) => (Number(String(f.hp || "").split("/")[0]) || 0) > 0);
        const aim = alive[0]?.i ?? 0;
        const target = isAttack(card) ? ".cf-foe" : ".cf-hero";
        note(`  t${(st.turn || "").replace(/.*Turn /, "")} ${st.hp} e:${st.energy || "?"}`
            + ` — ${card.name} (${card.text}) → ${isAttack(card) ? `foe ${aim} ${alive[0]?.hp || ""}` : "self"}`);
        await dragTo(".cf-hand .cf-card", card.i, target, isAttack(card) ? aim : 0);
        await sleep(1100);
        // ── A TURN THAT IS NOT MOVING IS A TURN TO END ──────────────────────────────────────────────────
        // Whatever the reason a card will not go down — a target it cannot reach, an animation still
        // running, a rule the bot does not know — sitting there re-dragging it is how the run above spent
        // its whole budget on one turn. Three failures and the turn goes back.
        const after = await readScreen();
        if (after.energy === st.energy && (after.hand || []).length === hand.length) {
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

note(`\n── ${runs} run(s), ${steps} steps: ${wins} won, ${deaths} died ──`);
if (SHOTS) { writeFileSync(`${SHOTS}/transcript.txt`, log.join("\n")); note(`transcript + ${shotN} shots in ${SHOTS}`); }
sock.close();
chrome.kill();
process.exit(0);
