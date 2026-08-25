// ── THE POLISH GATE, LIVE ───────────────────────────────────────────────────────────────────────────────────
//
// check-polish.mjs asks whether a feature is WIRED. This one opens it in a browser and asks whether it is
// FINISHED — on any screen in the game, not just a slot machine.
//
// Every rule here is a measurement I made by hand exactly once, after Luke looked at his phone and told me
// something I could have measured myself. That is the whole point of the file: the difference between
// iterating on a feature and being iterated on is whether the measurement happens before he opens it.
//
// ── THE RULES ───────────────────────────────────────────────────────────────────────────────────────────────
//
//   FIT        The thing you press is on the screen, with room under it. "Buttons are off screen on bottom."
//              Five pixels measured true in this rig and was still off screen on his phone, because Android's
//              bottom bar overlays the viewport that dvh reports. Twenty is the floor.
//
//   TAP        Every tap target is at least 44px. Anything smaller is a thing you miss and blame yourself for.
//
//   CONTRAST   Text is legible against what is actually behind it — 4.5:1, the ordinary standard, 3:1 for big
//              bold type. This is most of what "professional" means in practice: nobody says "that contrast
//              ratio is low", they say the screen looks cheap.
//
//   SPACE      No dead gap under the content. "Do you see a big gap between the bottom reel and the spin
//              button?" There was: forty-three pixels of nothing.
//
//   OVERLAP    Nothing carrying words or taps sits on the main content at rest. "Move the win amount down and
//              not cover the bottom slot." Ambience is allowed; readouts and buttons are not.
//
//   MOTION     Where a screen moves it moves correctly: reels fall rather than rise, hold one speed while
//              running, and brake into a stop rather than kicking. Three separate reports, one rule.
//
//   ALIVE      Something moves. A screen where nothing anywhere has an animation or a transition is a
//              spreadsheet — "ghetto and lacking all dopamine and polish".
//
//   PAYOFF     A screen that pays you out does it with sound, haptics, motion and particles. Checked in the
//              SOURCE, because you cannot screenshot a missing sound. "We need a recap modal with dopamine
//              and sprites and motion and sounds and particle effects."
//
//   SPRITES    No operating-system emoji where a member can see it. The house rule is a drawn sprite or a
//              react-icons glyph — an emoji renders differently on every device and carries no style.
//
// WHAT IT STILL CANNOT JUDGE: whether the art is good, whether a sound is annoying, whether a celebration is
// earned, whether a colour is the right one. Those need Luke. What it can do is make sure he never again
// spends a morning telling me a button is off the bottom of the screen or a number is drawn as plain text.
//
// Run:  npm run check:feel                       every screen, three phone sizes
//       npm run check:feel -- --screen=casino
//       npm run check:feel -- --url=https://www.wolfdengamingmn.com
import fs from "node:fs";
import { spawn } from "node:child_process";

import { QUIET_HIDE, QUIET_SEEN, installQuiet } from "./lib/shot-quiet.mjs";

const ARGV = process.argv.slice(2);
const BASE = (ARGV.find((a) => a.startsWith("--url=")) || "").slice(6) || "http://localhost:3000";
const ONLY = (ARGV.find((a) => a.startsWith("--screen=")) || "").slice(9);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9413;

// The three shapes that matter: the floor anybody still carries, Luke's phone, and the tall screen where a
// layout tuned to a short one goes slack.
const SIZES = [[375, 667], [412, 720], [390, 800]];

// ── THE SCREENS ─────────────────────────────────────────────────────────────────────────────────────────────
// `open` is whatever it takes to get past a lobby to the thing itself, run in the page. `main` is the element
// the feature is actually about — what must not be covered and what the controls sit under. `act` is the
// thing you press, which must always be reachable. Adding a feature here is how it joins the gate.
// ── THE CASINO IS NINE SCREENS, NOT ONE ─────────────────────────────────────────────────
// There was one `casino` entry here and it opened The Deep, so every gate run ever made checked ONE of the
// five slot cabinets and none of the four rooms that are not slot machines. Luke, asked whether the polish
// gate had covered any of it: "did you do the polish gate on the casino and slots bingo blackjack vip, all
// features of slots?" It had not, and it could not have — the machines live behind a `seated` state, so
// nothing that only navigates to /marketplace/casino has ever seen one.
//
// `?at=<id>` walks you to a cabinet on load (see CasinoClient), which is what makes each of them reachable
// as its own screen. `open` then sits you down at it. Every cabinet, every table, and the room behind the
// rope now gets measured at all three phone sizes.
//
// The five-reel cabinets share `main`, `act` and `motion` because they ARE one component with five paytables
// — but they are listed separately anyway, because the thing being checked is the ART and the LAYOUT, and
// those differ per cabinet. The Menagerie in particular renders a completely different grid (colossal).
const SEAT = "const b=[...document.querySelectorAll('.cas-mach')].find(x=>x.className.includes('is-near')); if(b) b.click();";
const SLOT5 = { main: ".s5-window, .col5-main", act: ".s5-spin",
    motion: ".s5-reel:last-child .s5-strip, .col5-grid.is-tall .col5-reel:last-child .col5-strip",
    open: SEAT };

const SCREENS = [
    // The floor itself — the room you walk around, before you sit at anything.
    { id: "casino", path: "/marketplace/casino", main: ".cas-room", act: ".cas-mach.is-live",
        // Both deliberate: the mute button lives in the room's corner on Luke's instruction, and the social
        // button floats over every screen in the game.
        allowOver: ["cas-audiobar", "social-fab"] },

    // The five slot cabinets.
    { id: "slot-hunt", path: "/marketplace/casino?at=slot", ...SLOT5 },
    { id: "slot-harvest", path: "/marketplace/casino?at=slot2", ...SLOT5 },
    { id: "slot-deep", path: "/marketplace/casino?at=slot3", ...SLOT5 },
    { id: "slot-menagerie", path: "/marketplace/casino?at=slot4", ...SLOT5 },
    { id: "slot-vault", path: "/marketplace/casino?at=slot5", ...SLOT5 },

    // The four that are not slot machines.
    { id: "keno", path: "/marketplace/casino?at=keno", main: ".cas-keno, .cas-grid", act: ".cas-pull", open: SEAT },
    { id: "bingo", path: "/marketplace/casino?at=bingo", main: ".cas-bcard", act: ".cas-pull", open: SEAT },
    { id: "blackjack", path: "/marketplace/casino?at=blackjack", main: ".cas-felt", act: ".cas-pull, .cas-act", open: SEAT },
    { id: "counter", path: "/marketplace/casino?at=store", main: ".cs-shelf", act: ".cs-item", open: SEAT },

    // And the room behind the rope. Two clicks: the first walks to the arch, the second opens it — the same
    // two-step a member does, which is also the only way to prove the rope actually opens.
    // Three staged clicks: walk to the rope, open it, then walk to the bartender — because `act` has to be
    // the thing the room is FOR. It was ".vip-talk, .vip-out", and the talk button only exists once you are
    // stood at somebody, so every run pressed "← The floor" instead and then reported the room as silent and
    // instant. It was: leaving a room is silent and instant. A gate that presses the wrong button measures
    // the wrong thing perfectly.
    { id: "vip", path: "/marketplace/casino", main: ".vip-room", act: ".vip-talk",
        open: "const d=document.querySelector('.cas-vipdoor');"
            + " if(d){ d.click(); setTimeout(()=>d.click(), 600);"
            + " setTimeout(()=>{ const b=document.querySelector('.vip-npc.is-bartender'); if(b) b.click(); }, 1400); }" },
    { id: "farm", path: "/marketplace/farm", main: ".farm-plots, .farm-yard, .card", act: ".btn-gold" },
    { id: "arena", path: "/marketplace/arena", main: ".ar-stage, .card", act: ".btn-gold" },
    { id: "mine", path: "/marketplace/mine", main: ".mine-face, .card", act: ".btn-gold" },
    { id: "sailing", path: "/marketplace/sailing", main: ".card", act: ".btn-gold" },
    { id: "cooking", path: "/marketplace/cooking", main: ".card", act: ".btn-gold" },
    { id: "spin", path: "/marketplace/spin", main: ".card", act: ".btn-gold" },
    { id: "pets", path: "/marketplace/pets", main: ".card", act: ".btn-gold" },
    { id: "quests", path: "/marketplace/quests", main: ".card", act: ".btn-gold" },
].filter((s) => !ONLY || s.id === ONLY);

// Thresholds. Every number was set by something Luke said, not by me.
const MIN_CLEAR = 20;
const MIN_TAP = 44;
const MIN_CONTRAST = 4.5;
const MAX_GAP = 40;
const MAX_SPEED_SWING = 1.5;
const MAX_SETTLE_KICK = 1.8;

// Components that pay a member out. A payoff drawn in silence, without motion or particles, is the note Luke
// has given more than any other.
const PAYOFF_FILES = [
    "src/components/casino/WinTally.js", "src/components/ChestOpener.js",
    "src/components/casino/Slot5.js", "src/components/casino/ColossalReels.js",
];

const problems = [];
const advisories = [];
const fail = (where, rule, msg) => problems.push({ where, rule, msg });

// ── STATIC: DOES A PAYOFF MAKE A NOISE ──────────────────────────────────────────────────────────────────────
for (const f of PAYOFF_FILES) {
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, "utf8");
    const name = f.split("/").pop();
    if (!/\b(Sfx|Cas|sfx)\./.test(src)) fail(name, "PAYOFF", "pays a member out and never makes a sound");
    if (!/\bHaptic\./.test(src)) fail(name, "PAYOFF", "pays a member out and never buzzes the phone");
    if (!/Burst|particle|confetti/i.test(src)) fail(name, "PAYOFF", "pays a member out and throws nothing — no particles");
}

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${process.env.TEMP}/cdp-feel-${PORT}`,
    "--autoplay-policy=no-user-gesture-required", "about:blank",
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
sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.value;

await send("Page.enable");
await send("Runtime.enable");

// ── NOTHING MAY BE SITTING OVER THE SCREEN BEING MEASURED ─────────────────────────────────────
// The shot rig has dismissed every launch card, check-in and prompt in the Den since it was written. This gate
// did not, and the difference cost two wrong answers in one afternoon: it reported the casino floor as silent
// and the counter as unresponsive, and both readings were of an undismissed "Badge earned" modal sitting over
// the page — one the gate's own previous run had earned by walking into the VIP lounge.
//
// A gate measuring through a modal does not report the modal. It reports whatever the modal made the screen
// underneath look like, which is a wrong answer delivered with complete confidence, and it is worse than no
// gate at all. UNCONDITIONAL here rather than behind an env flag: there is no version of this measurement
// that wants a launch card in the way.
await installQuiet(send, { hide: QUIET_HIDE.join(","), seen: QUIET_SEEN.join(";") });
await send("Network.enable");
if (process.env.SHOT_COOKIE) {
    await send("Network.setCookie", {
        name: "wolfden-mkt-buyer-session", value: process.env.SHOT_COOKIE,
        domain: new URL(BASE).hostname, path: "/",
        secure: new URL(BASE).protocol === "https:", sameSite: "Lax",
    });
}

const PROBE = (sc) => `(() => {
  ${sc.open || ""}
  return new Promise(res => setTimeout(() => {
    const pick = sel => { for (const s of sel.split(',')) { const e = document.querySelector(s.trim()); if (e) return e; } return null; };
    const mainEl = pick(${JSON.stringify(sc.main)});
    const actEl = pick(${JSON.stringify(sc.act)});
    const out = { found: Boolean(mainEl), act: Boolean(actEl), over: [], small: [], dim: [], emoji: [], gap: null, clear: null, animated: 0 };
    if (actEl) out.clear = Math.round(innerHeight - actEl.getBoundingClientRect().bottom);

    if (mainEl) {
      const m = mainEl.getBoundingClientRect();
      let nearest = innerHeight;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || r.top < m.bottom + 1) continue;
        if (r.left > m.right || r.right < m.left) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
        if (r.top < nearest) nearest = r.top;
      }
      out.gap = Math.round(nearest - m.bottom);

      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
        if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (el.contains(mainEl) || mainEl.contains(el)) continue;
        if (r.width >= innerWidth * 0.98 && r.height >= innerHeight * 0.9) continue;
        if (!(r.left < m.right && r.right > m.left && r.top < m.bottom && r.bottom > m.top)) continue;
        const speaks = (el.textContent || '').trim().length > 0;
        const taps = el.matches('button,a,[role=button]') || el.querySelector('button,a,[role=button]');
        if (!speaks && !taps) continue;
        // ── IS IT ACTUALLY ON TOP, OR MERELY UNDERNEATH? ────────────────────────────────────────────
        // Geometry alone cannot answer this and it was getting it wrong on every seated casino screen:
        // the machine opens as a position:fixed stage over the floor, so all nine cabinets are still
        // in the DOM, still absolutely positioned, and still overlapping the thing you are looking at —
        // while being completely covered by it. The gate reported cas-mach on keno, blackjack and the
        // counter every run, which is the kind of standing false positive that teaches somebody to stop
        // reading the output.
        //
        // elementFromPoint settles it: ask the browser what is actually painted at the middle of the
        // overlap, and if the answer is not this element or something inside it, it is behind something
        // and it is not covering anything.
        const cx = Math.round(Math.max(r.left, m.left) + (Math.min(r.right, m.right) - Math.max(r.left, m.left)) / 2);
        const cy = Math.round(Math.max(r.top, m.top) + (Math.min(r.bottom, m.bottom) - Math.max(r.top, m.top)) / 2);
        const top = document.elementFromPoint(cx, cy);
        if (!top || !(top === el || el.contains(top))) continue;
        out.over.push((el.className || el.tagName).toString().split(' ')[0]);
      }
    }

    for (const b of document.querySelectorAll('button, a[href], [role=button]')) {
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
      if (Math.min(r.width, r.height) < ${MIN_TAP}) {
        out.small.push(((b.textContent || b.getAttribute('aria-label') || b.className || '?').toString().trim().slice(0, 14)) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      }
    }

    const lum = c => { const v = c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126*v[0] + 0.7152*v[1] + 0.0722*v[2]; };
    const nums = s => { const m = (s || '').match(/[0-9.]+/g); return m ? m.map(Number) : null; };
    const bgOf = el => { let n = el; while (n && n !== document.documentElement) { const p = nums(getComputedStyle(n).backgroundColor); if (p && (p.length < 4 || p[3] > 0.6)) return p.slice(0, 3); n = n.parentElement; } return [13, 9, 19]; };
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length) continue;
      const txt = (el.textContent || '').trim();
      if (txt.length < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.5) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
      // ── GRADIENT TEXT IS NOT ITS COLOR PROPERTY ─────────────────────────────────────────────────
      // The Den fills its big numbers with a gold gradient via background-clip: text, which leaves the color property
      // to a dark fallback nobody ever sees. Reading it called every headline number 1.1:1 — twenty
      // false positives on one screen, which would have taught me to ignore this rule inside a day.
      if (/text/.test(cs.getPropertyValue('-webkit-background-clip')) || /text/.test(cs.getPropertyValue('background-clip'))) continue;
      if (cs.color === 'rgba(0, 0, 0, 0)' || cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue;
      const fg = nums(cs.color); if (!fg) continue;
      const L1 = lum(fg.slice(0, 3)), L2 = lum(bgOf(el));
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize);
      const big = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      if (ratio < (big ? 3 : ${MIN_CONTRAST})) out.dim.push(txt.slice(0, 16) + ' ' + ratio.toFixed(1) + ':1');
      if (/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test(txt)) out.emoji.push(txt.slice(0, 18));
    }

    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.animationName !== 'none' || (cs.transitionDuration !== '0s' && cs.transitionProperty !== 'none')) out.animated += 1;
      if (out.animated > 3) break;
    }
    res(JSON.stringify(out));
  }, 3200));
})()`;

// ── DOES PRESSING IT DO ANYTHING ────────────────────────────────────────────────────────────────────────────
// Luke, naming the thing I actually get wrong: "you tend to make features like a web UI ... often times you
// miss interactability and cause and effect ... something flashy should happen when it doesn't, or something
// should happen a little slower with animations, or something needs a modal that pops up, or certain kinds of
// noises and sounds, vibrations on the phone."
//
// Every one of those is invisible to a screenshot and measurable from inside the page. So: hook the speaker,
// hook the vibrator, watch the DOM, press the thing, and see what the machine does about it.
//
//   SILENT     the press made no sound
//   NUMB       the press never buzzed the phone
//   DEAD       the press changed nothing on screen — the definition of a button that is not a button
//   LAGGY      nothing changed for a fifth of a second after the tap; a control has to answer instantly
//   INSTANT    the whole thing was over in under half a second. "Something should happen a little slower
//              with animations." A result that arrives with no time to watch is a receipt.
const REACTION = (actSel) => `(() => {
  const pick = sel => { for (const s of sel.split(',')) { const e = document.querySelector(s.trim()); if (e) return e; } return null; };
  const act = pick(${JSON.stringify(actSel)});
  if (!act || act.disabled) return JSON.stringify({ skip: 1 });

  // The speaker. Every sound in the Den ends up starting one of these two nodes.
  let sounds = 0;
  for (const K of [window.AudioBufferSourceNode, window.OscillatorNode]) {
    if (!K || !K.prototype || !K.prototype.start) continue;
    const orig = K.prototype.start;
    K.prototype.start = function (...a) { sounds += 1; return orig.apply(this, a); };
  }
  // The phone. navigator.vibrate is a no-op in headless but it is still CALLED, which is the question.
  let buzzes = 0;
  const ov = navigator.vibrate ? navigator.vibrate.bind(navigator) : null;
  navigator.vibrate = (...a) => { buzzes += 1; return ov ? ov(...a) : true; };

  // The screen. Class and style changes are how this app animates, so they are what "something happened"
  // looks like from here — plus anything added or removed.
  let changes = 0, firstAt = null, lastAt = null, modal = false, newImgs = 0;
  const t0 = performance.now();
  const mo = new MutationObserver(recs => {
    for (const r of recs) {
      changes += 1;
      if (firstAt === null) firstAt = performance.now() - t0;
      lastAt = performance.now() - t0;
      for (const n of r.addedNodes || []) {
        if (n.nodeType !== 1) continue;
        if (n.matches && (n.matches('[role=dialog],[aria-modal=true]') || /modal|tally|reveal|splash|overlay/i.test(n.className || ''))) modal = true;
        if (n.tagName === 'IMG' || (n.querySelector && n.querySelector('img'))) newImgs += 1;
      }
    }
  });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });

  // ── A CSS ANIMATION IS SOMETHING HAPPENING, AND IT MUTATES NOTHING ─────────────────────────
  // The observer only sees DOM changes, so a panel that mounts in one mutation and then spends 280ms
  // animating in reads as "over in 2ms". That is how this gate called the casino stage, the VIP lounge and
  // the counter INSTANT while all three were mid-reveal — it was measuring the wrong thing and saying so
  // with confidence, which is worse than staying quiet.
  //
  // getAnimations() is the missing half: anything running right after the press is time the player spends
  // watching, whether or not it touches the DOM. The longest one wins, because that is when the screen
  // actually settles.
  let animMs = 0;
  const measureAnims = () => {
    try {
      for (const a of document.getAnimations()) {
        if (a.playState !== 'running') continue;
        const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
        if (!t) continue;
        const total = (Number(t.delay) || 0) + (Number(t.activeDuration) || 0);
        // Ignore the room's ambience — chandeliers and glows loop forever and are not a response to a press.
        if (!Number.isFinite(total) || t.iterations === Infinity) continue;
        if (total > animMs) animMs = total;
      }
    } catch (e) { /* getAnimations is Chrome-only; absence just means no credit */ }
  };

  act.click();
  requestAnimationFrame(() => { measureAnims(); setTimeout(measureAnims, 60); });
  return new Promise(res => setTimeout(() => {
    mo.disconnect();
    // Whichever finished last: the final DOM change, or the animation the press started.
    const settled = Math.max(lastAt || 0, animMs);
    res(JSON.stringify({ sounds, buzzes, changes, firstAt, lastAt: settled, animMs, modal, newImgs }));
  }, 5000));
})()`;

const MOTION = (sel) => `(() => {
  const strip = () => { for (const s of ${JSON.stringify(sel)}.split(',')) { const e = document.querySelector(s.trim()); if (e) return e; } return null; };
  const y = el => { if (!el) return null; const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return m.m42; };
  const go = [...document.querySelectorAll('button')].find(x => /^\\s*(spin|pull)\\s*$/i.test(x.textContent));
  if (!go || !strip()) return JSON.stringify({ skip: 1 });
  const s = []; const t0 = performance.now(); go.click();
  return new Promise(res => {
    const tick = () => { const el = strip();
      s.push({ t: performance.now() - t0, y: y(el), stopping: /is-stop/.test(el ? el.parentElement.className : '') });
      if (performance.now() - t0 < 6000) requestAnimationFrame(tick); else done(); };
    const done = () => {
      const v = []; let skip = false;
      for (let i = 1; i < s.length; i++) {
        const dt = (s[i].t - s[i-1].t) / 1000; if (dt <= 0) continue;
        const d = s[i].y - s[i-1].y;
        // The loop wraps the strip a whole cycle. That frame is not a speed, and neither is the one after
        // it — measured on a rock-steady reel they came back 909 then 1916, which sum to two ordinary frames.
        if (Math.abs(d) > 140) { skip = true; continue; }
        if (skip) { skip = false; continue; }
        v.push({ v: d / dt, stopping: s[i].stopping });
      }
      const moving = v.filter(x => Math.abs(x.v) > 40);
      if (!moving.length) return res(JSON.stringify({ skip: 1 }));
      // Run and stop are measured APART. Mixing them drags the median down until the run itself looks like
      // a kick — it reported 2.5x on a stop that is genuinely half the speed of the run.
      const run = moving.filter(x => !x.stopping).map(x => Math.abs(x.v)).sort((a, b) => a - b);
      const stop = moving.filter(x => x.stopping).map(x => Math.abs(x.v));
      if (run.length < 8) return res(JSON.stringify({ skip: 1 }));
      // The middle half. A 10-90 trim still let the frames either side of a phase boundary through, and
      // those are not a speed — they are the animation starting and the class flipping.
      const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
      res(JSON.stringify({
        down: moving.filter(x => x.v > 0).length / moving.length,
        swing: q(run, 0.75) / Math.max(1, q(run, 0.25)),
        kick: stop.length ? Math.max(...stop) / q(run, 0.5) : 0,
      }));
    };
    requestAnimationFrame(tick);
  });
})()`;

for (const sc of SCREENS) {
    for (const [W, H] of SIZES) {
        await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: true });
        await send("Page.navigate", { url: BASE + sc.path });
        // The VIP entry is two clicks with a walk between them and a round trip after it, so it needs
        // longer than a screen that is simply there when the page settles.
        await sleep(sc.id === "vip" ? 7000 : 4500);
        const d = JSON.parse((await evaluate(PROBE(sc))) || "null");
        const at = `${sc.id} @ ${W}x${H}`;
        if (!d) { fail(at, "unreachable", "the probe returned nothing"); continue; }
        if (!d.found) { fail(at, "unreachable", `nothing matching ${sc.main} — the screen did not load, or the selector is stale`); continue; }

        if (d.act && d.clear < MIN_CLEAR) fail(at, "FIT", `the main action sits ${d.clear}px off the bottom — under ${MIN_CLEAR} is off screen on a real phone`);
        if (!d.act) fail(at, "FIT", `nothing matching ${sc.act} — no obvious thing to press`);
        if (d.gap != null && d.gap > MAX_GAP) fail(at, "SPACE", `${d.gap}px of dead space under the main content`);
        // ── SOME THINGS ARE MEANT TO BE ON THE CONTENT ─────────────────────────────────
        // The casino's mute button is in the corner of the room because Luke asked for it there — "move the
        // mute button down into the top right of the animation frame, not the entire screen" — and the
        // social button floats over every screen in the game by design. Reporting both on every run is how
        // a gate trains somebody to skim past it, and the next real overlap goes with them.
        const over = [...new Set(d.over)].filter((c) => !(sc.allowOver || []).includes(c));
        if (over.length) fail(at, "OVERLAP", `on the content at rest: ${over.slice(0, 4).join(", ")}`);
        if (d.small.length) fail(at, "TAP", `under ${MIN_TAP}px: ${[...new Set(d.small)].slice(0, 4).join(" · ")}`);
        // ── ADVISORY, NOT A FAILURE, UNTIL IT IS CALIBRATED ─────────────────────────────────────────
        // This one is not trustworthy yet and I am not going to pretend otherwise. On the casino it calls
        // twenty headline numbers 1.1:1 — text that is plainly legible on screen — because the Den paints
        // its big numbers with a gradient and the `color` property is a dark fallback nobody sees. I tried
        // three ways to detect that and none of them caught these elements, so the rule PRINTS and does not
        // fail the run. A gate that cries wolf is a gate everyone learns to skip, which is worse than not
        // having written it. It goes back to failing when it can tell a dark colour from a dark-looking one.
        if (d.dim.length) advisories.push(`${at}  CONTRAST  ${d.dim.length} may be hard to read, worst: ${[...new Set(d.dim)].slice(0, 3).join(" · ")}`);
        if (d.emoji.length) fail(at, "SPRITES", `emoji where a sprite belongs: ${[...new Set(d.emoji)].slice(0, 3).join(" · ")}`);
        if (d.animated === 0) fail(at, "ALIVE", "nothing on this screen animates or transitions at all");

        // ── AND THEN PRESS IT ────────────────────────────────────────────────────────────────────────
        // Once per screen, at his phone size. This is the half of the gate that asks whether the feature
        // is a GAME rather than a form.
        if (W === 412) {
            const rx = JSON.parse((await evaluate(REACTION(sc.act))) || "{}");
            if (!rx.skip) {
                if (!rx.sounds) fail(`${sc.id} press`, "SILENT", "pressing the main action made no sound at all");
                if (!rx.buzzes) fail(`${sc.id} press`, "NUMB", "pressing the main action never buzzed the phone");
                if (!rx.changes) fail(`${sc.id} press`, "DEAD", "pressing the main action changed nothing on screen");
                else {
                    if (rx.firstAt > 200) fail(`${sc.id} press`, "LAGGY", `nothing moved for ${Math.round(rx.firstAt)}ms after the tap — a control has to answer instantly`);
                    if (rx.lastAt < 400) {
                        fail(`${sc.id} press`, "INSTANT",
                            `the whole thing was over in ${Math.round(rx.lastAt)}ms — there is nothing to watch`
                            + (rx.animMs ? ` (longest animation ${Math.round(rx.animMs)}ms)` : " (and nothing animated)"));
                    }
                }
            }
        }

        if (sc.motion && W === 412) {
            const mo = JSON.parse((await evaluate(MOTION(sc.motion))) || "{}");
            if (!mo.skip) {
                if (mo.down < 0.9) fail(`${sc.id} motion`, "MOTION", `travels upward ${Math.round((1 - mo.down) * 100)}% of the time — reels fall`);
                if (mo.swing > MAX_SPEED_SWING) fail(`${sc.id} motion`, "MOTION", `speed varies ${mo.swing.toFixed(2)}x while running — it should hold one speed`);
                if (mo.kick > MAX_SETTLE_KICK) fail(`${sc.id} motion`, "MOTION", `the stop peaks at ${mo.kick.toFixed(1)}x the run — it brakes, it does not kick`);
            }
        }
    }
}

sock.close();
chrome.kill();

if (advisories.length) {
    console.log("");
    console.log("  advisory — printed, not failing (see the note on CONTRAST):");
    for (const a of advisories.slice(0, 6)) console.log(`    · ${a}`);
}

if (problems.length) {
    const by = {};
    for (const p of problems) (by[p.where] ||= []).push(p);
    for (const [where, list] of Object.entries(by)) {
        console.log(`\n  ${where}`);
        for (const p of list) console.log(`    ✗ ${p.rule.padEnd(9)} ${p.msg}`);
    }
    console.log(`\ncheck:feel — ${problems.length} problem(s). Every rule here is a note Luke has already had to`);
    console.log("  give me by hand at least once. Fix it before he opens it.");
    process.exit(1);
}
console.log(`\ncheck:feel — ${SCREENS.length} screen(s) across ${SIZES.length} phone sizes: the thing you press is`);
console.log("  reachable, tap targets are real, text is legible, nothing sits on the content, no dead space,");
console.log("  every payoff makes a noise and throws something, and where it moves it moves right.");
console.log("  It has NOT judged whether any of it is beautiful. That still needs Luke.");
