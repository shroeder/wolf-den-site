"use client";

import { useState } from "react";

// ── THE PRIZE FIRST, THEN ONE FIELD ──────────────────────────────────────────────────────────────────────────
// What a signed-out scanner used to get was the ordinary create-account form: first name, last name, display
// name, email, password, then a six-digit code out of their inbox. And the page never loaded the claim at all
// before showing it, so the form had NOTHING on the other side of it — no statement of what they had won.
//
// Measured: 56 of 80 scans land within ten minutes of the sale, so that was being read at the till with a
// queue behind them, and 31 of 80 gave up.
//
// So: the points are the headline, they are stated before anything is asked, and the ask is one field. The
// account is made passwordless and the verification email can wait until they are sitting down — see
// counter-claim.js for why that is safe and exactly where it stops being safe.

const ERRORS = {
    bad_email: "That doesn't look like an email address.",
    not_found: "We can't find that code — check the QR and try again.",
    already_claimed: "These points have already been claimed.",
    expired: "That code has expired. Show it to staff and they can re-issue it.",
    could_not_create: "Something went wrong making your account. Try again?",
    could_not_sign_in: "Your account is made, but signing you in failed. Try the sign-in link below.",
};

export default function CounterClaimClient({ kind = "loyalty", token, preview, signInHref }) {
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    // The address came back as one that already belongs to somebody. We read it back and ask, then bank it on
    // THEIR account — no session, ever. See counter-claim.js for why that is the safe half and the login was
    // the unnecessary half.
    const [confirming, setConfirming] = useState(null);
    const [banked, setBanked] = useState(null);
    // The corrected headline, once the address turns out to belong to somebody who is not on their first visit.
    const [real, setReal] = useState(null);

    async function send(confirm) {
        setBusy(true);
        setErr(null);
        const r = await fetch("/api/marketplace/claim/start", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ kind, token, email: email.trim(), confirm }),
        }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (d?.ok && d.signedIn) {
            // A HARD navigation, not a router push. The session arrived as a Set-Cookie on this response and
            // the page we are going to is a server component that reads it — a soft navigation can render
            // from a cache that predates the cookie and show the signed-out screen we just escaped.
            window.location.assign(window.location.pathname);
            return;
        }
        setBusy(false);
        // Banked on an existing account. There is no session and no page to go to, so the answer is here.
        if (d?.ok) { setConfirming(null); setBanked({ points: Number(d.points) || 0, email: d.email || email.trim() }); return; }
        if (d?.needsConfirm) {
            setConfirming(d.email || email.trim());
            // The server knows what this member will ACTUALLY get — they are not a first visit. See the note
            // in counter-claim.js on why the page's own preview over-promises for them.
            if (Number.isFinite(d.points)) setReal({ total: d.points, lines: d.lines || [] });
            return;
        }
        setErr(ERRORS[d?.error] || "Couldn't claim that — try again.");
    }

    async function claim(e) {
        e.preventDefault();
        if (busy || !email.trim()) return;
        await send(false);
    }

    return (
        <div className="cclaim">
            {/* ── WHAT YOU HAVE WON ────────────────────────────────────────────────────────────────────────
                Above the fold and above the ask, because this is the entire reason to fill anything in. */}
            <div className="cclaim-prize">
                <span className="cclaim-kicker">Your points are waiting</span>
                <strong className="cclaim-points">{(real?.total ?? preview.total).toLocaleString()}</strong>
                <span className="cclaim-unit">points</span>
                {(real?.lines ?? preview.lines).length ? (
                    <ul className="cclaim-break">
                        {(real?.lines ?? preview.lines).map((l) => (
                            <li key={l.label}><span>{l.label}</span><b>+{l.points.toLocaleString()}</b></li>
                        ))}
                    </ul>
                ) : null}
            </div>

            <form className="cclaim-form" onSubmit={claim}>
                <label htmlFor="cclaim-email">Where should we keep them?</label>
                <input
                    id="cclaim-email" type="email" inputMode="email" autoComplete="email"
                    placeholder="you@example.com" value={email} required
                    onChange={(ev) => { setEmail(ev.target.value); setErr(null); setConfirming(null); setReal(null); }}
                />
                {/* ⚠️ ONE GOLD BUTTON AT A TIME. Once the address turns out to belong to somebody, the answer
                    is the confirm below and this is no longer it — two identical primary buttons on a phone at
                    a till is a coin toss. The field stays, because changing a typo is the other thing they
                    might want to do. */}
                {!confirming && !banked ? (
                    <>
                        <button type="submit" className="btn-gold" disabled={busy || !email.trim()}>
                            {busy ? "Claiming…" : "Claim my points"}
                        </button>
                        {/* THE ONLY SMALL PRINT, and it is a promise rather than a warning. Somebody handing
                            over an address at a till wants to know what it costs them. */}
                        <p className="cclaim-fine">No password to make up, nothing to confirm. We&apos;ll email
                            you a link later so you can get back in from any device.</p>
                    </>
                ) : null}
            </form>

            {confirming ? (
                <div className="cclaim-known" role="status">
                    <b>You&apos;re already a member.</b>
                    <span>We&apos;ll put these points on the Wolf Den account for <u>{confirming}</u>.</span>
                    <button type="button" className="btn-gold" disabled={busy} onClick={() => send(true)}>
                        {busy ? "Banking…" : "Yes — bank my points"}
                    </button>
                    <a className="cclaim-thin" href={signInHref}>or sign in first</a>
                </div>
            ) : null}
            {banked ? (
                <div className="cclaim-known" role="status">
                    <b>{banked.points > 0 ? `+${banked.points.toLocaleString()} XP banked` : "Points banked"}</b>
                    <span>They&apos;re on the account for <u>{banked.email}</u>. Open the Den on your phone to spend them.</span>
                    <a className="btn-gold" href={signInHref}>Sign in</a>
                </div>
            ) : null}
            {err ? <p className="cclaim-err" role="alert">{err}</p> : null}

            {!confirming && !banked ? (
                <p className="cclaim-alt">Already have an account? <a href={signInHref}>Sign in instead</a></p>
            ) : null}
        </div>
    );
}
