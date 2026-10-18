"use client";

import { useEffect, useState } from "react";
import { GiCheckMark, GiEnvelope, GiPadlock, GiSparkles, GiTwoCoins } from "react-icons/gi";

import { nudgeFeed, refreshNudges } from "@/lib/nudge-feed";

// ── "FINISH YOUR ACCOUNT" — THE ASK THAT COUNTER-CLAIM PROMISED AND NOBODY BUILT ─────────────────────────────
// Everybody who scanned a receipt at the till got a real account with no password and no verified address,
// deliberately (counter-claim.js: "31 of those 80 walked away" from a form that asked for a code). Its own
// note says they can be asked "at leisure, from the couch, instead of at the till" — this card is the couch.
//
// It is on the game hub rather than the login screen because a till scan is ALREADY SIGNED IN; they will never
// see a login screen again until the cookie is wiped, at which point the thing they needed was this card.
//
// The offer comes down with the shared nudge feed (one request for every watcher on the page — see
// lib/nudge-feed.js), so this card costs no fetch of its own until the member taps it.
export default function VerifyNudge() {
    const [offer, setOffer] = useState(null);
    const [step, setStep] = useState("offer"); // offer → code → done
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [hidden, setHidden] = useState(false);
    const [perks, setPerks] = useState(null);

    useEffect(() => {
        let alive = true;
        nudgeFeed()
            .then((d) => { if (alive && d?.verify?.show) { setOffer(d.verify); setPerks(d.verify.perks); } })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    async function post(body) {
        setBusy(true); setError(null);
        try {
            const res = await fetch("/api/marketplace/verify-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setError(data?.error || "Something went wrong. Try again."); return null; }
            return data;
        } catch {
            setError("Something went wrong. Try again.");
            return null;
        } finally {
            setBusy(false);
        }
    }

    async function send() {
        const data = await post({ action: "send" });
        if (!data) return;
        // Already verified somewhere else (another device, the login screen) — skip straight to the good news.
        if (data.verified) { setPerks(data.perks || perks); setStep("done"); refreshNudges(); return; }
        setStep("code");
    }

    async function confirm() {
        const data = await post({ action: "confirm", code: code.trim() });
        if (!data) return;
        setPerks(data.perks || perks);
        setStep("done");
        // The offer is gone and the XP boost is live — let the feed and the HUD catch up.
        refreshNudges();
        if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-hud-refresh"));
    }

    if (!offer || hidden) return null;

    const p = perks || {};
    const card = {
        display: "flex", flexDirection: "column", gap: 10,
        borderColor: step === "done" ? "rgba(120,220,140,0.55)" : "rgba(255,215,94,0.5)",
        background: step === "done"
            ? "linear-gradient(180deg, rgba(120,220,140,0.12), rgba(255,255,255,0.02))"
            : "linear-gradient(180deg, rgba(255,215,94,0.1), rgba(255,255,255,0.02))",
    };

    if (step === "done") {
        return (
            <section className="card" style={card} data-verify="done">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <GiCheckMark size={26} aria-hidden="true" style={{ flex: "0 0 auto", color: "#7cdc8c" }} />
                    <strong style={{ flex: 1 }}>Address verified — both perks are live.</strong>
                </div>
                <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: "0.92rem", lineHeight: 1.5 }}>
                    <li><strong>+{p.xpPct}% XP</strong> on everything you earn, from now on.</li>
                    <li><strong>+{(p.goldPerDay || 0).toLocaleString()} gold and +{(p.xpPerDay || 0).toLocaleString()} XP a day</strong>, banked while you&apos;re away — collect it on the Pets screen.</li>
                    <li>Your account is tied to your email now, so a new phone or a cleared browser can&apos;t lose it.</li>
                </ul>
            </section>
        );
    }

    // The data-verify hooks below are for the rigs: the offer / code / done states are a tap apart, and
    // scripts/shot.mjs needs a selector it can reach each of them by. See [[visual-rigs]].
    return (
        <section className="card" style={card} data-verify="offer">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <GiEnvelope size={28} aria-hidden="true" style={{ flex: "0 0 auto", color: "#ffd75e" }} />
                <span style={{ flex: 1 }}>
                    <strong>Verify your email — claim a permanent boost</strong>
                    <span className="muted" style={{ display: "block", fontSize: "0.9rem" }}>
                        Takes about twenty seconds, and it&apos;s yours for good.
                    </span>
                </span>
                <button
                    type="button"
                    onClick={() => setHidden(true)}
                    aria-label="Not now"
                    style={{ background: "none", border: "none", color: "inherit", fontSize: 18, cursor: "pointer", opacity: 0.6, padding: "0 4px" }}
                >
                    ×
                </button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <span className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <GiSparkles aria-hidden="true" />{` +${p.xpPct}% XP, forever`}
                </span>
                <span className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <GiTwoCoins aria-hidden="true" />{` +${(p.goldPerDay || 0).toLocaleString()} gold a day while you’re away`}
                </span>
                <span className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <GiPadlock aria-hidden="true" />{" Keeps your account if you lose this phone"}
                </span>
            </div>

            {step === "offer" ? (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                    <button type="button" className="btn-gold" data-verify="send" onClick={send} disabled={busy} style={{ whiteSpace: "nowrap" }}>
                        {busy ? "Sending…" : "Send me a code →"}
                    </button>
                    {offer.email ? <span className="muted" style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>to {offer.email}</span> : null}
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span className="muted" style={{ fontSize: "0.9rem" }}>
                        We sent a 6-digit code to <strong style={{ wordBreak: "break-all" }}>{offer.email}</strong>. Enter it here:
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <input
                            // The one field on this card, so it carries the focus and the numeric keypad. A
                            // phone keyboard that opens on letters for a 6-digit code is a tap nobody makes.
                            autoFocus
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            pattern="[0-9]*"
                            maxLength={6}
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6 && !busy) confirm(); }}
                            placeholder="123456"
                            aria-label="6-digit code"
                            data-verify="code"
                            style={{ flex: "1 1 120px", minWidth: 0, maxWidth: 160, fontSize: "1.1rem", letterSpacing: "0.18em", textAlign: "center" }}
                        />
                        <button type="button" className="btn-gold" onClick={confirm} disabled={busy || code.length !== 6} style={{ whiteSpace: "nowrap" }}>
                            {busy ? "Checking…" : "Claim it"}
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={send}
                        disabled={busy}
                        style={{ background: "none", border: "none", padding: 0, color: "inherit", opacity: 0.7, textDecoration: "underline", cursor: "pointer", fontSize: "0.85rem", alignSelf: "flex-start" }}
                    >
                        Didn&apos;t arrive? Send another
                    </button>
                </div>
            )}

            {error ? <span style={{ color: "#ff9a9a", fontSize: "0.9rem" }}>{error}</span> : null}
        </section>
    );
}
