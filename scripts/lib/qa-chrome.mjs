// ── LAUNCH A HEADLESS CHROME THAT CANNOT POISON THE NEXT RUN ────────────────────────────────────────────────
// Every QA rig here spawns Chrome on a FIXED debug port and talks to it over CDP. Two things follow, and both
// cost real time before this existed:
//
//   ⚠️ KILLING THE NODE PROCESS DOES NOT KILL ITS CHROME. Stop a rig mid-run — a timeout, Ctrl-C, a
//     background task cancelled — and the browser survives, still holding the port and the profile. The NEXT
//     run then fetches /json/list, gets the STALE browser's page, and drives a tab that is sitting wherever
//     the dead run left it. It does not error; it hangs, or worse, reports on the wrong page. That is a rig
//     that lies, which is the only kind of rig worse than no rig.
//
//   ⚠️ AND THE PROFILE LOCK SURVIVES TOO, so a second instance can refuse to start and the rig waits forever.
//
// So: clear the port before launching, and tear the browser down on every exit path rather than only the
// happy one.
import { spawn, execFileSync } from "node:child_process";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

/** Kill any headless Chrome already holding this debug port — ours, from a run that did not finish. */
export function clearPort(port) {
    // ⚠️ MATCHED ON THE PORT AND ON --headless, never on the image name alone. Luke's own Chrome is running
    // while these go; a blanket `taskkill /im chrome.exe` would close his browser and his tabs.
    const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | `
        + `Where-Object { $_.CommandLine -like '*remote-debugging-port=${port}*' -and $_.CommandLine -like '*headless*' } | `
        + `ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }`;
    try { execFileSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore", timeout: 20000 }); }
    catch { /* nothing to clear, or powershell unavailable — the launch below will tell us */ }
}

/**
 * Start headless Chrome on `port` and hand back the process.
 *
 * The caller still kills it at the end of a clean run; this adds the paths a clean run does not cover.
 */
export function launchChrome(port, profile) {
    clearPort(port);
    const proc = spawn(CHROME, [
        `--remote-debugging-port=${port}`, "--headless=new", "--no-first-run", "--no-default-browser-check",
        `--user-data-dir=${process.env.TEMP}/${profile}`, "about:blank",
    ], { stdio: "ignore" });

    let gone = false;
    const reap = () => {
        if (gone) return;
        gone = true;
        try { proc.kill(); } catch { /* already dead */ }
        clearPort(port);
    };
    // exit covers a normal return and process.exit(); the signals cover a cancelled background task.
    process.on("exit", reap);
    process.on("SIGINT", () => { reap(); process.exit(130); });
    process.on("SIGTERM", () => { reap(); process.exit(143); });
    process.on("uncaughtException", (e) => { reap(); console.error(e); process.exit(1); });
    return proc;
}

/** Connect to the page target, retrying while Chrome finishes starting. */
export async function attach(port, tries = 20) {
    for (let i = 0; i < tries; i += 1) {
        try {
            const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
            const page = list.find((t) => t.type === "page");
            if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
        } catch { /* not up yet */ }
        await new Promise((r) => { setTimeout(r, 400); });
    }
    throw new Error(`no Chrome on :${port} after ${tries} tries`);
}

/**
 * Refuse to run against a dev server that is not there.
 *
 * ⚠️ WRITTEN AFTER A RIG SPENT TEN MINUTES WAITING FOR A DEAD SERVER. `next build` writes .next underneath a
 * running `next dev` and can take it down — so a suite kicked off straight after a build can find nothing
 * listening, and every `waitFor` in it burns its full timeout before reporting something that looks like a
 * product defect. A rig that cannot tell "broken" from "nothing is running" wastes the time it was meant to
 * save. Fail in one second, with the real reason.
 */
export async function requireDevServer(port) {
    try {
        const r = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(8000) });
        if (r.ok) return true;
        throw new Error(`status ${r.status}`);
    } catch (e) {
        console.error(`\n  ✗ no dev server on :${port} (${e.message}).`);
        console.error(`    start it with: npm run dev     — and note that 'npm run build' can kill a running one.\n`);
        process.exit(2);
    }
}
