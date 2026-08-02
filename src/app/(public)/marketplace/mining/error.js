"use client";

// The Mine is owner-gated and still being built, so a render error here should SHOW itself rather than
// dropping the whole page to Next's blank "application error" screen. That screen tells the one person who
// can fix it precisely nothing, and the feature isn't public, so there's no one to protect the message from.
//
// Delete this (or make it generic) when mining launches.
export default function MiningError({ error, reset }) {
    return (
        <section className="card" style={{ borderColor: "rgba(255,120,90,0.5)" }}>
            <h2 style={{ margin: "0 0 6px", color: "#ff9a8a" }}>⛏️ The Mine hit an error</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                Owner-only feature, so here&rsquo;s the actual fault rather than a blank page.
            </p>
            <pre style={{
                margin: "10px 0", padding: 12, borderRadius: 10, overflowX: "auto",
                background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.12)",
                fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
                {String(error?.message || error || "unknown error")}
                {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
                {error?.stack ? `\n\n${error.stack}` : ""}
            </pre>
            <button type="button" className="btn" onClick={() => reset()}>Try again</button>
        </section>
    );
}
