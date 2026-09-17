// ── ANSWER THE PAGE'S OWN FETCHES, SO A STATE CAN BE PUT IN FRONT OF A CAMERA WITHOUT A DATABASE ──────────────
// A screen whose state arrives over fetch — a cart with items in it, a signed-in account, a balance — cannot be
// filmed or shot from a clean machine: there is no row to make it true. This installs a fetch shim before the
// document runs, keyed on a substring of the request URL, so `{"/api/shop/cart": {...}}` serves that JSON to
// whatever asks for it and the page renders the state for real.
//
//   { "/api/shop/cart": { "json": { … } }, "/api/shop/auth": { "json": { … }, "status": 200 } }
//
// A bare value is the body; `{ json, status }` sets the status too. First key whose substring is IN the URL
// wins, so order the table most-specific first.
//
// ⚠️ ONE IMPLEMENTATION, NOT TWO. This was inline in film.mjs, and shot.mjs — the rig you need for a page that
// is not animating, because a screencast only delivers frames when something PAINTS — had no mock at all, so a
// static screen driven by fetch could not be looked at by the rig that can photograph it. film.mjs and shot.mjs
// have already diverged twice this way (see the notes in both), each time fixing a bug in one copy only. Both
// call this now. See [[reuse-the-rule-never-restate-it]].
//
// ⚠️ AND IT REPORTS WHAT IT SERVED. A fixture whose key never matches is a rig quietly photographing the real
// state while claiming it drove one — the same wrong-picture-that-looks-right both rigs exist to prevent. Read
// the log back with readMockLog() and print it next to the shot.
export async function installMock(send, table) {
    if (!table) return;
    await send("Page.addScriptToEvaluateOnNewDocument", {
        source: `(() => {
            const table = ${JSON.stringify(table)};
            const served = []; const missed = [];
            window.__mockLog = () => ({ served, missed });
            const real = window.fetch.bind(window);
            window.fetch = async (input, init) => {
                const url = String(typeof input === "string" ? input : (input && input.url) || "");
                for (const key of Object.keys(table)) {
                    if (!url.includes(key)) continue;
                    const v = table[key];
                    const body = v && typeof v === "object" && "json" in v ? v.json : v;
                    const status = (v && v.status) || 200;
                    served.push(key);
                    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
                }
                if (url.includes("/api/")) missed.push(url);
                return real(input, init);
            };
        })();`,
    });
}

// What the shim actually answered, as one line. `evaluate` is the caller's own page-eval helper, because the
// two rigs wrap Runtime.evaluate differently.
//
// ⚠️ THE MOCK LOG LIVES IN THE PAGE, AND A NAVIGATION REPLACES IT. Read it BEFORE anything renavigates, or it
// reads "NONE — the fixture never matched" on a page the fixture in fact drove, which is the rig lying in the
// one direction it must never lie. film.mjs reported exactly that while the shot plainly showed the fixture's
// own item name, because it read the log after re-pointing the tab at the contact sheet.
export async function reportMock(evaluate) {
    const raw = await evaluate("window.__mockLog ? JSON.stringify(window.__mockLog()) : null");
    if (!raw) return null;
    const log = JSON.parse(raw);
    const keys = [...new Set(log.served)];
    console.log(`  mock  served ${log.served.length} request(s) from ${keys.length} key(s): ${keys.join(", ") || "NONE — the fixture never matched"}`);
    const miss = [...new Set(log.missed)];
    if (miss.length) console.log(`  mock  fell through to the real server: ${miss.slice(0, 6).join(", ")}`);
    return log;
}
