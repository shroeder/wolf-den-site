"use client";

import { useEffect, useRef, useState } from "react";

import { isChunkError, recoverFromChunkError, recoverFromStaleBuild } from "@/components/ChunkRecovery";

// ── WHEN A PAGE DIES ─────────────────────────────────────────────────────────────────────────────────────────
// A React render error used to hand the member straight to the browser's own "This page couldn't load" — no
// idea what broke, nothing to send anyone, and no way for us to know it happened at all unless they thought to
// screenshot it. A whole feature was down for an hour that way.
//
// So: say something human, show the real error, give them ONE BUTTON that puts the whole diagnostic on their
// clipboard, and tell us immediately.
export default function CrashScreen({ error, reset, where = "page" }) {
    const [copied, setCopied] = useState(false);
    const [sent, setSent] = useState(false);
    const reported = useRef(false);

    // The report, and the thing the copy button copies — the SAME text, so what they paste is what we logged.
    const digest = error?.digest || null;
    const details = [
        `Wolf Den — ${where} crash`,
        `when:   ${new Date().toISOString()}`,
        `where:  ${typeof window !== "undefined" ? window.location.pathname + window.location.search : where}`,
        digest ? `digest: ${digest}` : null,
        `error:  ${error?.name || "Error"}: ${error?.message || "(no message)"}`,
        error?.stack ? `\n${String(error.stack).split("\n").slice(0, 12).join("\n")}` : null,
    ].filter(Boolean).join("\n");

    useEffect(() => {
        // Exactly once per crash. An error boundary can re-render, and a loop that reports every time would
        // bury the one report that matters under a thousand copies of itself.
        if (reported.current) return;
        reported.current = true;
        // A CHUNK failure is not this page being broken — it is a deploy landing while the member had the tab
        // open, so the build their HTML names no longer exists. Reloading fetches the current one and puts
        // them on the page they asked for. Showing them a crash screen for that is a bug in us, not the page.
        if (recoverFromChunkError(error, where)) return;
        // The chunks may all still exist and the CODE still be old — a tab open since this morning crashing on
        // a bug fixed at lunchtime. Ask which deployment is current; if this bundle is not it, reload instead of
        // showing a crash screen for something already repaired. Async, so the report below still goes out if
        // the build turns out to be current.
        recoverFromStaleBuild(error, where).catch(() => {});
        fetch("/api/client-error", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                message: error?.message || null,
                name: error?.name || null,
                digest,
                stack: error?.stack ? String(error.stack).slice(0, 4000) : null,
                path: typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
                ua: typeof navigator !== "undefined" ? navigator.userAgent : null,
                where,
            }),
        }).then(() => setSent(true)).catch(() => { /* the screen still works without us */ });
    }, [error, digest, where]);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(details);
            setCopied(true);
            setTimeout(() => setCopied(false), 2400);
        } catch {
            // Clipboard blocked (older browser, no permission) — select it instead so a long-press works.
            const el = document.getElementById("crash-details");
            if (el) {
                const r = document.createRange();
                r.selectNodeContents(el);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(r);
            }
        }
    };

    return (
        <div className="crash">
            <div className="crash-card">
                <div className="crash-mark" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/nav/home.png" alt="" draggable="false" />
                </div>
                <h1>{isChunkError(error) ? "The Den updated under you" : "That page fell over"}</h1>
                <p className="crash-lead">
                    {isChunkError(error)
                        ? <>We shipped an update while this tab was open, so it was reaching for a version of the
                          page that no longer exists. A refresh puts you on the new one — nothing is lost.</>
                        : <>Not your fault, and nothing you did is lost. It&rsquo;s worth trying again — most of
                          these are one-offs.</>}
                </p>

                <div className="crash-actions">
                    <button type="button" className="crash-btn is-primary" onClick={() => (reset ? reset() : window.location.reload())}>
                        Try again
                    </button>
                    <a className="crash-btn" href="/marketplace">Back to the Den</a>
                </div>

                <details className="crash-more">
                    <summary>What went wrong</summary>
                    <pre id="crash-details" className="crash-pre">{details}</pre>
                    <button type="button" className="crash-btn is-copy" onClick={copy}>
                        {copied ? "Copied — paste it to Luke" : "Copy this error"}
                    </button>
                </details>

                <p className="crash-sent">
                    {sent ? "Luke has been told automatically." : "Reporting this automatically…"}
                </p>
            </div>

            <style jsx global>{`
.crash { min-height: 70vh; display: grid; place-items: center; padding: 24px 16px; }
.crash-card { width: min(520px, 100%); text-align: center; padding: 26px 20px 20px; border-radius: 20px;
    background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02));
    border: 1px solid rgba(255,255,255,0.13); box-shadow: 0 20px 60px rgba(0,0,0,0.45); }
.crash-mark img { width: 58px; height: 58px; object-fit: contain; opacity: .9; }
.crash h1 { margin: 10px 0 6px; font-size: 1.4rem; font-weight: 900; color: #f2ead9; }
.crash-lead { margin: 0 auto; max-width: 40ch; font-size: .92rem; line-height: 1.5; color: #a9b0b9; }
.crash-actions { display: flex; gap: 9px; justify-content: center; margin-top: 18px; flex-wrap: wrap; }
.crash-btn { display: inline-flex; align-items: center; justify-content: center; height: 42px; padding: 0 18px;
    border-radius: 12px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.06);
    color: #e7dcc8; font-size: .9rem; font-weight: 800; cursor: pointer; text-decoration: none; }
.crash-btn.is-primary { border: none; color: #2a1a05; background: linear-gradient(180deg, #ffd97a, #f0b93f);
    box-shadow: 0 4px 14px rgba(240,185,63,0.3); }
.crash-btn.is-copy { width: 100%; margin-top: 10px; }
.crash-more { margin-top: 18px; text-align: left; }
.crash-more summary { cursor: pointer; font-size: .8rem; font-weight: 800; color: #8a9099; text-align: center;
    list-style: none; padding: 6px; }
.crash-more summary::-webkit-details-marker { display: none; }
.crash-pre { margin: 8px 0 0; padding: 11px; border-radius: 10px; max-height: 240px; overflow: auto;
    background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.1);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.5;
    color: #cfd8e3; white-space: pre-wrap; word-break: break-word; user-select: all; }
.crash-sent { margin: 14px 0 0; font-size: .76rem; color: #6d747d; }
            `}</style>
        </div>
    );
}
