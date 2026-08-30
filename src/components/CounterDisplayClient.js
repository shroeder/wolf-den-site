"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

// ── THE CUSTOMER-FACING SCREEN AT THE TILL ───────────────────────────────────────────────────────────────────
// Two states and nothing else.
//
//   IDLE  — the pitch. This is the hook that was missing: somebody paying has sixty seconds of nothing to do
//           and a screen at eye level, and until now it told them nothing. It says what the points are, what
//           they are for, and how long it takes.
//   CLAIM — the sale that just landed, as a QR big enough to scan from arm's length across a counter, with
//           the number they have just earned above it.
//
// The receipt is out of the loop. 600 of 687 codes were never scanned because they were on a piece of paper
// going into a pocket; this one is in front of their face while their card is still in the reader.
//
// It never asks for anything and has no controls — it is a sign, not an app. Nobody touches it.

const POLL_MS = 4000;

export default function CounterDisplayClient({ displayKey, idleQr, pitch, claimBase }) {
    const [claim, setClaim] = useState(null);
    const [qr, setQr] = useState(null);
    const [offline, setOffline] = useState(false);
    // The token the QR currently shows, so a poll that returns the SAME claim does not redraw it — a QR that
    // flickers every four seconds is a QR nobody manages to scan.
    const drawnFor = useRef(null);

    const poll = useCallback(async () => {
        // ── STOPS WHEN NOBODY IS LOOKING ─────────────────────────────────────────────────────────────────
        // The repo's own rule for any timer that talks to the server (see check:polls). A shop screen is
        // usually the foreground tab all day, so this rarely fires — but a screen left on an unattended
        // machine overnight should not be asking a question 21,600 times before opening.
        if (typeof document !== "undefined" && document.hidden) return;
        const r = await fetch(`/api/pos/display?key=${encodeURIComponent(displayKey)}`, { cache: "no-store" }).catch(() => null);
        if (!r || !r.ok) { setOffline(true); return; }
        const d = await r.json().catch(() => null);
        setOffline(false);
        setClaim(d?.claim || null);
    }, [displayKey]);

    useEffect(() => {
        poll();
        const t = setInterval(poll, POLL_MS);
        return () => clearInterval(t);
    }, [poll]);

    // Draw the claim QR only when the TOKEN changes. Big and high-contrast: this is read by a phone camera
    // held a couple of feet away, across a counter, under shop lighting.
    useEffect(() => {
        const token = claim?.token || null;
        if (!token) { drawnFor.current = null; setQr(null); return; }
        if (drawnFor.current === token) return;
        drawnFor.current = token;
        QRCode.toDataURL(`${claimBase}${token}`, {
            width: 720, margin: 1, errorCorrectionLevel: "M",
            color: { dark: "#101014", light: "#ffffff" },
        }).then(setQr).catch(() => setQr(null));
    }, [claim?.token, claimBase]);

    if (claim) {
        return (
            <div className="pos pos-claim">
                <div className="pos-claim-left">
                    <span className="pos-kick">You just earned</span>
                    <strong className="pos-points">{claim.points.toLocaleString()}</strong>
                    <span className="pos-unit">points</span>
                    <ul className="pos-break">
                        {claim.lines.map((l) => (
                            <li key={l.label}><span>{l.label}</span><b>+{l.points.toLocaleString()}</b></li>
                        ))}
                    </ul>
                </div>
                <div className="pos-claim-right">
                    {qr ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="pos-qr" src={qr} alt="" />
                    ) : <div className="pos-qr pos-qr-wait" />}
                    <b className="pos-scan">Scan to keep them</b>
                    <span className="pos-scan-sub">One tap, no password. About ten seconds.</span>
                </div>
            </div>
        );
    }

    return (
        <div className="pos pos-idle">
            <div className="pos-idle-copy">
                <span className="pos-kick">The Wolf Den</span>
                <h1>{pitch.headline}</h1>
                <ul className="pos-pitch">
                    {pitch.lines.map((l) => <li key={l}>{l}</li>)}
                </ul>
                {/* Said out loud so the number on the next screen is not a surprise, and so somebody who is
                    not buying anything today still knows what the rate is. */}
                <p className="pos-rate"><b>{pitch.rate}</b> points per $1 · every purchase, every time</p>
            </div>
            <div className="pos-idle-qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="pos-qr" src={idleQr} alt="" />
                <b className="pos-scan">Scan to join</b>
                <span className="pos-scan-sub">Free. Your points start on your next purchase.</span>
            </div>
            {/* A screen that has quietly lost the server must SAY so, or it sits there looking correct while
                every sale goes unclaimed. Small, in a corner, for staff rather than customers. */}
            {offline ? <span className="pos-offline">offline</span> : null}
        </div>
    );
}
