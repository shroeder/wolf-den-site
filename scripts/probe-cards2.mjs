// ── DRIVING THE CAROUSEL, THE STRIKE, AND THE THREE STATES OF A HEALTH BAR ───────────────────────────────────
// The first probe proved a card could be dragged onto a foe and deal damage. This one exists for the things
// that only exist between frames: a swipe walking the hand, a pet crossing the sand, the floor jolting, and a
// bar tweening down rather than snapping. None of those can be checked by looking at a page at rest, so the
// screenshots here are taken ON A CLOCK during the animation rather than after it settles.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { QUIET_HIDE, QUIET_SEEN, installQuiet, quiet } from "./lib/shot-quiet.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL_ = process.argv[2];
const OUT = process.argv[3];
const W = Number(process.argv[4] || 412);
const H = Number(process.argv[5] || 780);
const COOKIE = process.env.SHOT_COOKIE;
const PORT = 9457;

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${process.env.TEMP}/cdp-${PORT}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
let id = 0;
const pending = new Map();
sock.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
if (COOKIE) {
    await send("Network.enable");
    await send("Network.setCookie", { name: "wolfden-mkt-buyer-session", value: COOKIE, domain: new URL(URL_).hostname, path: "/", secure: false, sameSite: "Lax" });
}
await installQuiet(send, { hide: quiet(process.env.SHOT_HIDE, QUIET_HIDE, ","), seen: quiet(process.env.SHOT_SEEN, QUIET_SEEN, ";") });
await send("Page.navigate", { url: URL_ });
await sleep(4200);

const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true }))?.result?.value;
const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}-${name}.png`, Buffer.from(r.data, "base64"));
};
const box = async (sel, nth = 0) => evalJs(`(() => { const e = document.querySelectorAll('${sel}')[${nth}]; if (!e) return null;
    const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom }; })()`);
const readout = async () => evalJs(`(() => {
    const hp = [...document.querySelectorAll('.cfb-hp')].map((e) => e.textContent.trim());
    const fills = [...document.querySelectorAll('.cfb-fill')].map((e) => e.style.width);
    return { bars: hp, fills, active: [...document.querySelectorAll('.cf-hand .cf-card')].findIndex((e) => e.classList.contains('is-picked')),
             hand: document.querySelectorAll('.cf-hand .cf-card').length,
             guard: [...document.querySelectorAll('.cfb-guard')].map((e) => e.textContent.trim()),
             energy: document.querySelector('.cf-energy')?.textContent?.trim() || null }; })()`);
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "mouse" });

// ── 0. THE LAYOUT, IN PIXELS ────────────────────────────────────────────────────────────────────────────────
// Three separate times now the fix for one screen size has broken the other: the raised card standing in the
// health bars at 412x780, the whole fighter column sitting 44px INSIDE the hand at 375x441, and the resting
// cards running 33px off the bottom edge. Every one of them looked like a deliberate composition in a
// screenshot and was a collision in the numbers, so the numbers get checked rather than admired.
const layout = await evalJs(`(() => {
    const r = (sel, n = 0) => { const e = document.querySelectorAll(sel)[n]; if (!e) return null;
        const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
    // The narrowest horizontal gap between any two adjacent health bars. Four bars in a row that TOUCH read as
    // one continuous gauge — the screen says the party shares a pool — and this has now regressed twice, both
    // times because a width was tied to the figure while the spacing was tied to the column.
    const bars = [...document.querySelectorAll('.cfb')].map((e) => e.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    let gap = 999;
    for (let i = 1; i < bars.length; i += 1) gap = Math.min(gap, Math.round(bars[i].left - bars[i - 1].right));
    return { vh: innerHeight, topbar: r('.cf-top'), heroBar: r('.cf-hero .cfb'), foeBar: r('.cf-foe .cfb', 1),
             sprite: r('.cf-hero .cf-sprite'), rest: r('.cf-hand .cf-card'), raised: r('.cf-hand .cf-card.is-picked'),
             barGap: gap };
})()`);
const checks = [
    ["the raised card clears the health bars", layout.raised.top - layout.heroBar.bottom, (v) => v >= 0],
    ["resting cards are on screen", layout.vh - layout.rest.bottom, (v) => v >= 0],
    ["the fighters clear the top bar", layout.sprite.top - layout.topbar.bottom, (v) => v >= 0],
    ["foe bars sit under their bodies", layout.foeBar.top - layout.sprite.bottom, (v) => v >= 0],
    ["health bars do not touch each other", layout.barGap, (v) => v >= 4],
];
let bad = 0;
for (const [what, got, ok] of checks) {
    if (!ok(got)) { bad += 1; console.log(`  FAIL  ${what} — ${got}px`); } else console.log(`  ok    ${what} (${got}px)`);
}
if (bad) { console.log(`LAYOUT  ${bad} collision(s) at ${W}x${H}`); }

// ── 1. AT REST: SOMETHING IS ALREADY BEING READ ─────────────────────────────────────────────────────────────
console.log("OPEN    ", JSON.stringify(await readout()));
await shot("1-open");

// ── 2. THE SWIPE ── sideways across the hand walks the active card; nothing is picked up.
// The dial turns WITH the finger: drag right and the highlight moves right. It was inverted at first —
// filmstrip logic, where you shove the cards one way and the selection goes the other — which is right for
// a strip you scroll and wrong for a dial where the raised card never moves.
const hand = await box(".cf-hand");
await mouse("mousePressed", hand.x, hand.y);
for (let i = 1; i <= 6; i += 1) { await mouse("mouseMoved", hand.x + i * 16, hand.y); await sleep(28); }
await shot("2-swiped-left");
console.log("DRAG-RIGHT ", JSON.stringify(await readout()));  // expect active to WALK RIGHT
for (let i = 1; i <= 12; i += 1) { await mouse("mouseMoved", hand.x + 96 - i * 18, hand.y); await sleep(24); }
await mouse("mouseReleased", hand.x - 120, hand.y);
await sleep(140);
await shot("3-swiped-right");
console.log("DRAG-LEFT  ", JSON.stringify(await readout()));  // and back down to the left end

// ── 3. THE LIFT ── straight up out of the hand, onto the middle foe.
// BY NAME, not by position. Picking "the third card" got a Hop on the first run — a block, self-targeting, so
// there was no arrow to photograph and no blow to land, and the probe reported both as missing rather than as
// never asked for. The thing under test is an ATTACK, so the probe has to go and find one.
const card = await evalJs(`(() => { const cards = [...document.querySelectorAll('.cf-hand .cf-card')];
    const i = cards.findIndex((c) => /Bite|Pounce/i.test(c.textContent)); if (i < 0) return null;
    const r = cards[i].getBoundingClientRect(); return { i, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const foe = await box(".cf-foe", 1);
if (!card || !foe) { console.log("no card/foe", { card, foe }); chrome.kill(); process.exit(1); }
await mouse("mousePressed", card.x, card.y);
await mouse("mouseMoved", card.x, card.y - 30);
await sleep(40);
for (let i = 1; i <= 8; i += 1) {
    await mouse("mouseMoved", card.x + ((foe.x - card.x) * i) / 8, card.y - 30 + ((foe.y - (card.y - 30)) * i) / 8);
    await sleep(35);
}
await sleep(80);
await shot("4-aiming");
// The polygon point count proves the head is part of the ribbon rather than a second shape beside it.
console.log("AIMING  ", JSON.stringify(await evalJs(`({ live: !!document.querySelector('.cf-aim-line.is-live'), lit: !!document.querySelector('.cf-foe.is-target'), pts: document.querySelector('.cf-aim-line')?.getAttribute('points')?.split(' ').length })`)));

const before = await readout();
await mouse("mouseReleased", foe.x, foe.y);

// ── 4. THE BLOW, FRAME BY FRAME ── the pet in flight, the jolt, and the bar on its way down.
for (const ms of [90, 200, 300, 430]) {
    await sleep(ms === 90 ? 90 : 100);
    await shot(`5-strike-${ms}`);
    console.log(`  t+${ms}ms`, JSON.stringify(await evalJs(`({ pet: !!document.querySelector('.cf-strike'), shake: !!document.querySelector('.cf.is-shaking'), fill: document.querySelectorAll('.cfb-fill')[2]?.getBoundingClientRect().width.toFixed(1) })`)));
}
await sleep(600);
await shot("6-landed");
console.log("BEFORE  ", JSON.stringify(before));
console.log("AFTER   ", JSON.stringify(await readout()));

// ── 5. A SHIELDED BAR ── play the block card on yourself and photograph what armour looks like.
const hop = await evalJs(`(() => { const cards = [...document.querySelectorAll('.cf-hand .cf-card')];
    const i = cards.findIndex((c) => /Hop/i.test(c.textContent)); if (i < 0) return null;
    const r = cards[i].getBoundingClientRect(); return { i, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
if (hop) {
    await mouse("mousePressed", hop.x, hop.y);
    await mouse("mouseReleased", hop.x, hop.y);
    await sleep(120);
    const hero = await box(".cf-hero");
    await mouse("mousePressed", hero.x, hero.y);
    await mouse("mouseReleased", hero.x, hero.y);
    await sleep(700);
    await shot("7-shielded");
    console.log("SHIELD  ", JSON.stringify(await readout()));
} else {
    console.log("SHIELD   no Hop in hand this seed");
}

// ── 6. AND WHAT IT LOOKS LIKE WHEN THE FOES SWING BACK ───────────────────────────────────────────────────────
await evalJs(`document.querySelector('.cf-end')?.click()`);
await sleep(1400);
await shot("8-afterfoe");
console.log("ENDED   ", JSON.stringify(await readout()));

// ── 7. A CARD YOU CANNOT PAY FOR DOES NOTHING ───────────────────────────────────────────────────────────────
// It was always unplayable, but only after you had picked it up, aimed it and let go — the game let you
// perform the whole gesture and then quietly refused. This asserts the refusal happens at the START: no
// ghost, no arrow, no lit foes, and the card still in hand afterwards. Reading it must still work.
// From a FRESH fight: by this point the run above has played most of the opening hand, so Pounce — the only
// two-cost card in the starter deck and therefore the only one that can ever be unaffordable — is long gone.
// The first version of this section reported "not exercised" and would have gone on reporting it forever.
await send("Page.navigate", { url: URL_ });
await sleep(3600);
const tapNamed = async (re) => evalJs(`(() => { const c = [...document.querySelectorAll('.cf-hand .cf-card')].find((e) => ${re}.test(e.textContent));
    if (!c) return false; const r = c.getBoundingClientRect();
    const o = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    c.dispatchEvent(new PointerEvent('pointerdown', o)); window.dispatchEvent(new PointerEvent('pointerup', o)); return true; })()`);
for (let n = 0; n < 2; n += 1) {
    if (await tapNamed("/Bite/i")) {
        await sleep(200);
        await evalJs(`document.querySelectorAll('.cf-foe')[0]?.click()`);
        await sleep(700);
    }
}
if (await tapNamed("/Pounce/i")) {
    await sleep(260);
    const pre = await evalJs(`({ hand: document.querySelectorAll('.cf-hand .cf-card').length,
        flagged: !!document.querySelector('.cf-card.is-unaffordable'), energy: document.querySelector('.cf-energy')?.textContent.trim(),
        lit: [...document.querySelectorAll('.cf-foe')].filter((f) => f.classList.contains('is-target')).length })`);
    const pc = await box(".cf-hand .cf-card.is-picked");
    await mouse("mousePressed", pc.x, pc.y);
    for (let i = 1; i <= 8; i += 1) { await mouse("mouseMoved", pc.x, pc.y - i * 22); await sleep(30); }
    const mid = await evalJs(`({ ghost: !!document.querySelector('.cf-drag'), arrow: !!document.querySelector('.cf-aim'),
        lit: [...document.querySelectorAll('.cf-foe')].filter((f) => f.classList.contains('is-target')).length })`);
    await mouse("mouseReleased", pc.x, pc.y - 176);
    await sleep(420);
    const post = await evalJs(`({ hand: document.querySelectorAll('.cf-hand .cf-card').length, energy: document.querySelector('.cf-energy')?.textContent.trim() })`);
    const held = !mid.ghost && !mid.arrow && mid.lit === 0 && post.hand === pre.hand && pre.flagged && pre.lit === 0;
    console.log(`  ${held ? "ok  " : "FAIL"} an unaffordable card stays in the tray`,
        JSON.stringify({ ...pre, ...mid, after: post }));
} else {
    console.log("  --    no Pounce reachable this seed; energy gate not exercised");
}

// ── 8. THE CARD MUST NOT LIE ABOUT ITS OWN NUMBER ───────────────────────────────────────────────────────────
// Pounce applies Vulnerable 2. A Bite aimed at that foe has to PRINT nine, and print six when aimed at
// anybody else — that difference is the entire reason the number waits for a target instead of being
// resolved once. It is also the assertion that catches the text and the field drifting apart again.
await send("Page.navigate", { url: URL_ });
await sleep(3600);
const dragText = () => evalJs(`(() => { const d = document.querySelector('.cf-drag');
    const b = [...document.querySelectorAll('.cfb-band.is-damage')];
    return d ? { text: d.querySelector('.cf-text').textContent.trim(), up: !!d.querySelector('.cf-num.is-up'),
                 bands: b.length, bandPx: b[0] ? Math.round(b[0].getBoundingClientRect().width) : 0 } : null; })()`);
if (await tapNamed("/Pounce/i")) {
    await sleep(220);
    await evalJs(`document.querySelectorAll('.cf-foe')[1].click()`);
    await sleep(900);
    if (await tapNamed("/Bite/i")) {
        await sleep(220);
        const held = await box(".cf-hand .cf-card.is-picked");
        const at = async (n) => box(".cf-foe", n);
        const marked = await at(1);
        const clean = await at(2);
        await mouse("mousePressed", held.x, held.y);
        await mouse("mouseMoved", held.x, held.y - 40); await sleep(50);
        await mouse("mouseMoved", marked.x, marked.y); await sleep(170);
        const onVuln = await dragText();
        await mouse("mouseMoved", clean.x, clean.y); await sleep(170);
        const onClean = await dragText();
        await mouse("mouseReleased", clean.x, clean.y);
        await sleep(600);
        const right = /9 damage/.test(onVuln?.text || "") && onVuln?.up
            && /6 damage/.test(onClean?.text || "") && !onClean?.up;
        console.log(`  ${right ? "ok  " : "FAIL"} the printed damage follows the target`,
            JSON.stringify({ onVuln, onClean }));
        // Exactly ONE bar wears the pending band, and it is the one being pointed at — a band on all three
        // would be promising something the player has not chosen.
        const banded = onVuln?.bands === 1 && onVuln.bandPx > 0 && onClean?.bands === 1;
        console.log(`  ${banded ? "ok  " : "FAIL"} one bar previews the blow`,
            JSON.stringify({ onVuln: onVuln?.bands, px: onVuln?.bandPx, onClean: onClean?.bands }));
    }
}

// ── 9. THE PARTY ACTS ONE AT A TIME ─────────────────────────────────────────────────────────────────────────
// Filmed, the old turn had all three lunging together and the whole turn landing in a single frame: the hero
// dropped 70 to 53 while a 6 and an 11 appeared over him simultaneously. Two things make that legible, and
// both are asserted here rather than admired in a contact sheet — the hero's health has to come down in
// SEPARATE steps, and no two foes may ever be mid-swing at the same moment.
await send("Page.navigate", { url: URL_ });
await sleep(3600);
await evalJs(`document.querySelector('.cf-end')?.click()`);
const hpSteps = [];
let maxConcurrent = 0;
let sawGuard = false;
for (let n = 0; n < 26; n += 1) {
    const snap = await evalJs(`({ hp: document.querySelector('.cf-hero .cfb-hp')?.textContent.trim(),
        swinging: document.querySelectorAll('.cf-foe.is-attacking').length,
        bracing: document.querySelectorAll('.cf-foe.is-bracing').length })`);
    if (snap.hp && hpSteps[hpSteps.length - 1] !== snap.hp) hpSteps.push(snap.hp);
    maxConcurrent = Math.max(maxConcurrent, snap.swinging);
    if (snap.bracing) sawGuard = true;
    await sleep(80);
}
const oneAtATime = maxConcurrent <= 1 && hpSteps.length >= 3;
console.log(`  ${oneAtATime ? "ok  " : "FAIL"} the party acts one at a time`,
    JSON.stringify({ hpSteps, maxSwingingAtOnce: maxConcurrent, aGuardBraced: sawGuard }));

// ── 10. NOBODY EVER UNFLIPS ─────────────────────────────────────────────────────────────────────────────────
// The foe art is drawn facing right and turned round to face the hero. When that flip lived on .cf-body — the
// same property every animation writes — three separate keyframes forgot to repeat it and silently spun a
// fighter to face away for the length of their animation: the idle breath, then the lunge and brace, then
// cfShake, which had a hit foe at scaleX +1 for 240ms. The flip is on the <img> now so no keyframe can reach
// it, and this samples the horizontal scale of every foe through a hit AND a full enemy turn to prove it.
await send("Page.navigate", { url: URL_ });
await sleep(3600);
const flips = () => evalJs(`[...document.querySelectorAll('.cf-foe .cf-sprite')].map((s) => {
    const tr = getComputedStyle(s).transform;
    return tr === 'none' ? 1 : Math.round(new DOMMatrix(tr).a * 100) / 100; })`);
const seenFlips = new Set();
const sample = async (n) => { for (let i = 0; i < n; i += 1) { (await flips()).forEach((v) => seenFlips.add(v)); await sleep(70); } };
await sample(3);
if (await tapNamed("/Bite/i")) {
    await sleep(200);
    await evalJs(`document.querySelectorAll('.cf-foe')[2]?.click()`);
    await sample(12);
}
await evalJs(`document.querySelector('.cf-end')?.click()`);
await sample(22);
const held = [...seenFlips].every((v) => v < 0);
console.log(`  ${held ? "ok  " : "FAIL"} foes stay facing the hero`, JSON.stringify({ scaleXseen: [...seenFlips] }));

// ── 11. THE LINE CLOSES OVER A BODY — BUT NEVER UNDER A FINGER ──────────────────────────────────
// Spire leaves the hole — its monsters stand on positions fixed when the encounter is built and never move
// again. We close it, because three foes across a phone cannot spare a third of the line to a gap. That trade
// is only safe because of one rule, and the rule is the thing worth testing: the survivors must not move while
// a card is being dragged, or a target slides out from under a committed drag.
//
// HITTING THAT WINDOW TAKES CARE. Playing a card sets `acting`, and startDrag refuses to begin a gesture while
// acting is true — so pressing a card just after a kill does nothing at all, and an earlier version of this
// test "passed" the hold while holding nothing. The finger has to already be down when the body drops. So:
// whittle the foe to under one card's worth, press and HOLD an attack, and land the killing blow with a tap
// on the body while the gesture is still live.
await send("Page.navigate", { url: URL_ });
await sleep(3600);
const laidOut = () => evalJs(`(() => { const p = document.querySelector('.cf-party').getBoundingClientRect();
    return { partyMid: Math.round(p.left + p.width / 2),
        foes: [...document.querySelectorAll('.cf-foe')].map((f) => { const b = f.getBoundingClientRect();
            return { down: f.classList.contains('is-down'), gone: getComputedStyle(f).display === 'none',
                     mid: Math.round(b.left + b.width / 2) }; }) }; })()`);
const foeHp = () => evalJs(`Number((document.querySelectorAll('.cf-foe')[0]?.querySelector('.cfb-hp')?.textContent || '')
    .split('/')[0].trim()) || 0`);

// Down to single figures, but NOT dead: every attack in this deck swings 6-9, so from here the next one kills.
for (let turn = 0; turn < 6 && (await foeHp()) > 9; turn += 1) {
    for (let n = 0; n < 5 && (await foeHp()) > 9; n += 1) {
        if (!(await tapNamed("/damage/i"))) break;
        await sleep(170);
        await evalJs(`document.querySelectorAll('.cf-foe')[0]?.click()`);
        await sleep(900);
    }
    if ((await foeHp()) > 9) { await evalJs(`document.querySelector('.cf-end')?.click()`); await sleep(3400); }
}
const hpBefore = await foeHp();

// The finger goes down FIRST and stays down: press an attack, lift it clear of the tray, and only then tap the
// body to land the blow. The dissolve now runs with a live gesture on screen.
await tapNamed("/damage/i");
await sleep(200);
const grabbed = await box(".cf-hand .cf-card.is-picked");
await mouse("mousePressed", grabbed.x, grabbed.y);
for (let i = 1; i <= 5; i += 1) { await mouse("mouseMoved", grabbed.x, grabbed.y - i * 14); await sleep(25); }
const gestureLive = await evalJs(`!!document.querySelector('.cf-drag')`);
await evalJs(`document.querySelectorAll('.cf-foe')[0]?.click()`);
await sleep(1100);
const heldSnap = await laidOut();

// And now let go, somewhere harmless — the bottom corner is tray, not a body.
await mouse("mouseMoved", 12, H - 12); await sleep(60);
await mouse("mouseReleased", 12, H - 12);
await sleep(1400);
const closed = await laidOut();

const killed = heldSnap.foes[0].down;
const survivorsHeld = heldSnap.foes.filter((f) => !f.gone && !f.down);
const survivors = closed.foes.filter((f) => !f.gone);
const stoodStill = killed && gestureLive && !heldSnap.foes[0].gone;
const centred = survivors.length === 2
    && Math.abs(Math.round(survivors.reduce((a, f) => a + f.mid, 0) / survivors.length) - closed.partyMid) <= 8;
const shifted = survivors.length === survivorsHeld.length && survivors.some((f, i) => f.mid !== survivorsHeld[i].mid);
const ok11 = killed && stoodStill && closed.foes[0].gone && centred && shifted;
console.log(`  ${ok11 ? "ok  " : "FAIL"} the line closes over a body, and never under a finger`,
    JSON.stringify({ hpBefore, killed, gestureLive, heldStill: stoodStill, closedUp: closed.foes[0].gone,
        reCentred: centred, moved: shifted, partyMid: closed.partyMid,
        mids: { held: heldSnap.foes.map((f) => (f.gone ? "gone" : f.mid)), after: closed.foes.map((f) => (f.gone ? "gone" : f.mid)) } }));

chrome.kill();
process.exit(0);
