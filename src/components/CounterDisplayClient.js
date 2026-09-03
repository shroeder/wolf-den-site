"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

import CounterWheel from "@/components/CounterWheel";

// ── THE CUSTOMER-FACING SCREEN AT THE TILL ───────────────────────────────────────────────────────────────────
// Luke: "we have a pc screen at the point of sale facing the customer."
//
// That is the answer to "there is no hook early enough". 600 of 687 receipt QRs were never scanned by anybody
// — the code was on a piece of paper going into a pocket. A screen at eye level, being looked at during the
// one minute a customer has nothing else to do, is a different proposition entirely: the pitch lands BEFORE
// the sale finishes, and then the same screen shows the QR for the sale that just happened, so the receipt is
// out of the loop altogether.
//
// The screen has exactly two states and this component is only the switch between them:
//
//   IDLE — a prize wheel you can spin (CounterWheel). It replaced a three-panel slideshow that explained the
//     game in prose: four corner piles of sprites, the gear-for-store-credit fact, the boss prizes, the
//     mystery board. All of it true, none of it read. Luke: "lets scrap it and just make a wheel you can
//     spin. and it says the reward. and then shows a qr code to scan. that takes them to the sign up."
//
//   A SALE — everything gets out of the way for the claim: their points and their QR, full width, until it is
//     claimed or the window closes. This is the part that must not be touched by any redesign of the idle
//     screen. It is not marketing; it is how a customer actually banks the points for the purchase they are
//     standing there paying for, and the token in it expires (CLAIM_WINDOW_SECONDS).

const POLL_MS = 4000;

export default function CounterDisplayClient({ displayKey, signupQr, pointsRate, claimBase }) {
    const [claim, setClaim] = useState(null);
    const [qr, setQr] = useState(null);
    const [offline, setOffline] = useState(false);
    const drawnFor = useRef(null);

    const poll = useCallback(async () => {
        // The repo's rule for any timer that talks to the server (check:polls). A shop screen is the
        // foreground tab all day so this rarely fires — but a machine left on overnight should not ask a
        // question 21,600 times before opening.
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

    // Redraw the claim QR only when the TOKEN changes. A QR that flickers every four seconds is one nobody
    // manages to scan.
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

    // ── A SALE LANDED ── everything else gets out of the way.
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
        <>
            <CounterWheel signupQr={signupQr} pointsRate={pointsRate} />
            {offline ? <span className="pos-offline">offline</span> : null}
        </>
    );
}
