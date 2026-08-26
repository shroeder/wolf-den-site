// ── SCREENSHOT ANY URL AT A REAL PHONE SIZE ──────────────────────────────────────────────────────────────────
// Every feature gets looked at on a phone AND on a wide screen before it is called done. This is the tool for
// the first half of that, and it exists because the obvious approach does not work:
//
//   THE TRAP: Chrome clamps --window-size to somewhere around 500px, so you cannot ask for a 375px viewport on
//   the command line — you will silently get ~500 and think you checked a phone. Emulation.setDeviceMetricsOverride
//   is the only thing that gives you the width you asked for. Node 22 ships WebSocket, so CDP needs no package.
//
//   THE SECOND TRAP: a page with no <meta name="viewport"> lays out at Chrome's 980px mobile fallback even
//   inside a 375px frame, so the shot looks like a phone and is not one. If window.innerWidth does not match
//   what you asked for, the page is lying to you and so is the screenshot.
//
//   THE THIRD TRAP: remote sprites arrive after load. Shooting immediately gives you a clean, empty, wrong
//   picture — hence the settle delay below.
//
//   THE FOURTH TRAP: half of what needs looking at is not on the page at load — a modal, an open panel, a
//   selected tab. Shooting the closed state and calling the feature checked is the same class of mistake as
//   shooting a 500px "phone". Hence the optional click selector below, which FAILS LOUDLY when it matches
//   nothing rather than quietly handing you a picture of the thing not open.
//
// Usage:
//   node scripts/shot.mjs <url> <out.png> [width=375] [height=667] [portOffset=0] [clickSelector] [waitForSelector]
//
// A file:// URL works, which is how a fixture page (one component, real sprite URLs, the app's real numbers)
// gets checked without standing up an authenticated session.
// cannot be produced that way — Emulation.setDeviceMetricsOverride is the only thing that actually gives you
// the viewport you asked for. Node 22 has WebSocket built in, so no dependency is needed.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

import { QUIET_HIDE, QUIET_SEEN, installQuiet, quiet } from "./lib/shot-quiet.mjs";

// ── SHOT_QUIET=1 ── seed every known "already seen this" marker and hide every known scrim, so a shot is of
// the page rather than of whichever launch card this profile has not dismissed yet. See lib/shot-quiet.mjs.
if (process.env.SHOT_QUIET) {
    process.env.SHOT_SEEN = quiet(process.env.SHOT_SEEN, QUIET_SEEN, ";");
    process.env.SHOT_HIDE = quiet(process.env.SHOT_HIDE, QUIET_HIDE, ",");
}

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = process.argv[2];
const out = process.argv[3];
const W = Number(process.argv[4] || 375);
const H = Number(process.argv[5] || 667);
const PORT = 9333 + (Number(process.argv[6] || 0));
// ── A SEQUENCE, NOT A CLICK ──────────────────────────────────────────────────────────────────────────────────
// Some states are two taps deep — open Fishing, THEN open the bait step — and one selector cannot reach them.
// Comma-separate them and each is clicked in turn, every one confirmed before the next is attempted, so a
// failure still names the step that did not open rather than handing back a picture of the wrong screen.
// The final WAIT confirms the last step, as before.
const CLICK = process.argv[7] || null;
const CLICKS = CLICK ? CLICK.split(",").map((x) => x.trim()).filter(Boolean) : [];
const WAIT = process.argv[8] || null;   // what the click should have produced; the proof it actually landed

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${process.env.TEMP}/cdp-${PORT}`,
    "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws = null;
for (let i = 0; i < 40 && !ws; i += 1) {
    await sleep(250);
    try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
        const page = list.find((t) => t.type === "page");
        if (page) ws = page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
}
if (!ws) { chrome.kill(); throw new Error("chrome never came up"); }

const sock = new WebSocket(ws);
await new Promise((r) => { sock.onopen = r; });
let id = 0;
const pending = new Map();
sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
// THE ONE THAT MATTERS: a real 375-wide viewport, at 2x so the sprites are judged at phone pixel density.
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });

// SIGNED-IN PAGES. Most of the game is behind a session, and without this the rig can only ever shoot the
// login redirect — which looks like a perfectly good screenshot of the wrong page. Set SHOT_COOKIE to a
// buyer-session token and the shot happens as that member.
//   SHOT_COOKIE=<token> node scripts/shot.mjs http://localhost:3000/marketplace/market out.png
if (process.env.SHOT_COOKIE) {
    await send("Network.enable");
    await send("Network.setCookie", {
        name: "wolfden-mkt-buyer-session", value: process.env.SHOT_COOKIE,
        domain: new URL(url).hostname, path: "/",
        // ── SECURE, OR PROD SILENTLY SIGNS YOU OUT ───────────────────────────────────────────────────
        // The session cookie is issued with Secure+SameSite=Lax, and a cookie set over CDP without them
        // does not match it — so the request goes out unauthenticated and the rig films the sign-in page
        // while reporting success. Localhost worked because http exempts it, which is exactly why this
        // went unnoticed: every shot that mattered was local. Mirror the real cookie's flags whenever the
        // target is https and the rig can film production too.
        secure: new URL(url).protocol === "https:",
        sameSite: "Lax",
    });
}

// ── AND SOME OF THEM CANNOT BE CLICKED AWAY ──────────────────────────────────────────────────────────────────
// The daily check-in is server-driven, not a localStorage marker, so SHOT_SEEN cannot pre-empt it — and the
// CLICK below returns early whenever WAIT already matches, which it does, because the page IS rendered
// underneath. SHOT_HIDE takes a comma-separated list of selectors and hides them before anything is captured.
//
//   SHOT_HIDE=".checkin-overlay,.promo" node scripts/shot.mjs …
// Both hooks live in lib/shot-quiet.mjs now, because check-feel.mjs needed the same two and had neither —
// see the note there. What is left here is the CHOICE of what to quiet, which is the caller's business:
// SHOT_HIDE is a comma-separated selector list, SHOT_SEEN a semicolon-separated set of localStorage markers,
// and SHOT_QUIET=1 merges the standing list into both (see the top of this file).
await installQuiet(send, { hide: process.env.SHOT_HIDE, seen: process.env.SHOT_SEEN });

await send("Page.navigate", { url });
// Let the sprites actually arrive — a blank shot proves nothing. 2600ms was not enough on a cold dev server:
// a launch modal's art came out as an empty 82px box while a DOM probe at 5s showed it loaded and visible, so
// the picture was wrong and looked deliberate. Cheap insurance on a tool whose whole job is being trustworthy.
await sleep(4200);

// ── SOME STATES HAVE NO BUTTON AT ALL ────────────────────────────────────────────────────────────────────────
// A modal that only appears when the app dispatches an event — the pet level-up celebration, an XP toast — has
// nothing on the page to click, so CLICK cannot reach it and it would go to members unlooked-at. SHOT_EVAL runs
// one expression in the page after load, which is enough to fire the event that opens it.
//
//   SHOT_EVAL='window.dispatchEvent(new CustomEvent("wolfden-pet-levelup", { detail: { petId: "kitten", level: 6 } }))'
if (process.env.SHOT_EVAL) {
    await send("Runtime.enable");
    const r = await send("Runtime.evaluate", { expression: process.env.SHOT_EVAL, returnByValue: true, awaitPromise: true });
    if (r?.exceptionDetails) {
        console.error(`shot.mjs: SHOT_EVAL threw — ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
        sock.close(); chrome.kill(); process.exit(1);
    }
    await sleep(1400);   // let whatever it opened mount and finish its entrance
}

// Open whatever state is being judged.
//
// THE CLICK MUST BE RETRIED, AND ITS RESULT MUST BE CHECKED. The element exists in the server-rendered HTML
// long before React attaches a handler to it, so a single well-timed .click() dispatches into nothing and the
// page sits there closed — and the screenshot comes out looking entirely reasonable. So: click, look for what
// the click was supposed to produce, click again. Nothing matching after the window is a hard failure rather
// than a picture of the thing not open.
await send("Runtime.enable");
// Hoisted out of the click block below: SHOT_SCROLL needs it too, and it is a two-line wrapper around a CDP
// call rather than anything the click sequence owns.
const evaluate = async (expression) =>
    (await send("Runtime.evaluate", { expression, returnByValue: true }))?.result?.value;

if (CLICKS.length) {
    for (let step = 0; step < CLICKS.length; step += 1) {
        const sel = CLICKS[step];
        const last = step === CLICKS.length - 1;
        // Each step is confirmed by what it should PRODUCE: the next selector in the chain, or WAIT for the
        // final one. A step that cannot be confirmed fails here, naming itself.
        const proof = last ? WAIT : CLICKS[step + 1];
        let opened = false;
        for (let i = 0; i < 20 && !opened; i += 1) {
            const state = await evaluate(`(() => {
                if (${JSON.stringify(!!proof)} && document.querySelector(${JSON.stringify(proof || "*")})) return "open";
                const el = document.querySelector(${JSON.stringify(sel)});
                if (!el || el.disabled) return "missing";
                // A TAP, NOT JUST A CLICK. .click() dispatches a click and nothing else, so any control
                // wired to onPointerDown — which is most of the ones that have to feel instant, the mine's
                // swing among them — never hears it, and the step fails claiming the button did nothing.
                for (const type of ["pointerdown", "pointerup"]) {
                    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true }));
                }
                el.click();
                return ${JSON.stringify(!!proof)} ? "clicked" : "open";
            })()`);
            if (state === "open") opened = true;
            else await sleep(400);
        }
        if (!opened) {
            console.error(`shot.mjs: step ${step + 1}/${CLICKS.length} — ${sel} never produced ${proof || "a click"} — refusing to shoot the unopened page`);
            sock.close(); chrome.kill(); process.exit(1);
        }
        if (!last) await sleep(900);   // let the step land before reaching for the next one
    }
    // Let the open animation land AND the newly-revealed images arrive. 800ms covered the animation only, so
    // a menu full of icons shot as a grid of blank tiles — the same "clean, empty, wrong picture" the settle
    // delay above exists to prevent, just moved behind the click.
    // ── SHOT_AFTER ── how long to wait after the last click, in ms.
    // 2200 is right for a panel opening: the animation lands and the sprites arrive. It is WRONG for anything
    // that expires — a combat callout lives about a second, so the default reliably photographs the moment
    // after it. Override when the thing being shot is transient.
    await sleep(Number(process.env.SHOT_AFTER) || 2200);
}

// ── AND THE FIFTH TRAP: THE THING IS ON THE PAGE, JUST NOT ON THE SCREEN ─────────────────────────────────────
// A long screen — the farm, the store, a settings page — puts most of what needs looking at below the fold, and
// a 375-wide shot of the top of it is a picture of the header. Shooting a 4000px-tall "phone" instead is worse:
// it is not a viewport any phone has, so nothing that depends on height (a sticky bar, a card that sizes to the
// screen) lays out the way a member will see it.
//
// SHOT_SCROLL=<selector> keeps the real viewport and moves the page under it. It FAILS LOUDLY like the click
// sequence does — a selector that matches nothing means the shot would have been of the wrong part of the page,
// and a wrong picture that looks right is the thing this whole file exists to prevent.
if (process.env.SHOT_SCROLL) {
    const sel = process.env.SHOT_SCROLL;
    // SCROLLING ONCE IS NOT ENOUGH, AND THE FIRST VERSION OF THIS SHIPPED A PICTURE OF THE HEADER. A panel
    // that fetches its own data — the shed does — mounts after the scroll and reflows everything under it, and
    // a late hydration pass can put the window back at the top. So: scroll, let the page settle, scroll again,
    // and then CHECK. `place` is the element's real position at shutter time, and anything not inside the
    // viewport is a failure rather than a screenshot of somewhere else.
    let place = null;
    for (let i = 0; i < 6; i += 1) {
        place = await evaluate(`(() => {
            const el = document.querySelector(${JSON.stringify(sel)});
            if (!el) return null;
            el.scrollIntoView({ block: "center", behavior: "instant" });
            const r = el.getBoundingClientRect();
            return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(window.innerHeight) };
        })()`);
        if (place === null) break;
        await sleep(500);
        if (place.top >= 0 && place.bottom <= place.h) break;
    }
    if (!place) {
        console.error(`shot.mjs: SHOT_SCROLL — ${sel} matched nothing, refusing to shoot the wrong part of the page`);
        sock.close(); chrome.kill(); process.exit(1);
    }
    await sleep(900); // lazy images below the old fold have to arrive before the shutter
    // ONE LAST SCROLL, AS LATE AS POSSIBLE. The wait above is exactly when a late-arriving sprite reflows the
    // page out from under the scroll, so the position is re-taken here and then checked — the loop above gets
    // the images loaded, this gets the element under the lens.
    const settled = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return false;
        el.scrollIntoView({ block: "center", behavior: "instant" });
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0;
    })()`);
    if (!settled) {
        console.error(`shot.mjs: SHOT_SCROLL — ${sel} would not stay in the viewport, refusing to shoot`);
        sock.close(); chrome.kill(); process.exit(1);
    }
    await sleep(250);
}

const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
writeFileSync(out, Buffer.from(data, "base64"));
console.log(`${out}  ${W}x${H}`);
sock.close();
chrome.kill();
process.exit(0);
