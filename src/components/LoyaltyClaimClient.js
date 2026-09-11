"use client";

// ── THE ONE SCREEN THE SHOP HAS A MEMBER'S FULL ATTENTION FOR ────────────────────────────────────────────────
// They are standing at the counter holding the thing they just bought, phone out, queue behind them. And what
// this drew was three emoji and a sentence.
//
// Luke, on a real scan of his: "not dopamine inducing ... rewards were lame for her." Both true, and the
// second was partly THIS file's fault rather than the reward table's: see the note on `points` in
// loyalty-claim.js. Her purchase paid 89 XP and the screen printed the words "Points banked!" — because the
// number it showed was a before/after diff and the Square webhook had already banked it ninety seconds
// earlier. The single most motivating number on the screen, silently absent, for a growing share of members.
//
// ⚠️ AND NO EMOJI. This had three — a gift, a party popper, a wolf — which is the house rule broken three
// times over on the highest-value screen in the shop. See [[no-emoji-in-ui]].

import { useEffect, useRef, useState } from "react";

import UserLevel from "@/components/UserLevel";
import PatronageReward from "@/components/PatronageReward";

const ERROR_COPY = {
    already_yours: "You've already claimed these points.",
    already_claimed: "These points were already claimed on another account.",
    expired: "This code has expired — ask staff to ring it up again.",
    not_found: "This code isn't valid.",
    invalid: "This code isn't valid.",
    unauthorized: "Please sign in to claim your points.",
};

function dollars(cents) {
    return `$${(Math.max(0, Number(cents) || 0) / 100).toFixed(2)}`;
}

// ── THE NUMBER COUNTS UP RATHER THAN APPEARING ───────────────────────────────────────────────────────────
// It is the difference between being told what you earned and watching it land, and it is the whole reason a
// slot machine spins instead of printing a result. Eased out, so the big number is legible early and settles
// rather than crawling.
function useCountUp(target, ms = 900) {
    const [n, setN] = useState(0);
    useEffect(() => {
        const to = Math.max(0, Number(target) || 0);
        if (!to) { setN(0); return undefined; }
        const started = performance.now();
        let raf = 0;
        const tick = (now) => {
            const t = Math.min(1, (now - started) / ms);
            setN(Math.round(to * (1 - Math.pow(1 - t, 3))));
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, ms]);
    return n;
}

export default function LoyaltyClaimClient({ token, claim }) {
    const [state, setState] = useState({ status: "loading" });
    const ran = useRef(false);

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;
        if (!claim) return setState({ status: "error", error: "not_found" });
        if (claim.expired) return setState({ status: "error", error: "expired" });
        (async () => {
            try {
                const res = await fetch("/api/marketplace/loyalty/claim", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.ok) return setState({ status: "success", points: data.points, level: data.level, patronage: data.patronage });
                setState({ status: "error", error: data.error || "invalid" });
            } catch {
                setState({ status: "error", error: "invalid" });
            }
        })();
    }, [token, claim]);

    const shown = useCountUp(state.status === "success" ? state.points : 0);

    if (state.status === "loading") {
        return (
            <div className="lc">
                <span className="lc-spin" aria-hidden="true" />
                <p className="lc-quiet">Banking your points{claim ? ` on your ${dollars(claim.amountCents)} purchase` : ""}…</p>
                <style jsx>{`
                    .lc { display: flex; flex-direction: column; align-items: center; gap: 12px;
                        padding: 18px 0; text-align: center; }
                    .lc-spin { width: 34px; height: 34px; border-radius: 50%;
                        border: 3px solid rgba(255, 215, 94, 0.25); border-top-color: #ffd75e;
                        animation: lcTurn 0.8s linear infinite; }
                    @keyframes lcTurn { to { transform: rotate(360deg); } }
                    .lc-quiet { margin: 0; font-size: 13px; color: #8a9384; }
                `}</style>
            </div>
        );
    }

    if (state.status === "success") {
        return (
            <div className="lc">
                <span className="lc-rays" aria-hidden="true" />
                <span className="lc-sparks" aria-hidden="true">
                    {Array.from({ length: 12 }, (_, i) => (
                        <span key={i} className="lc-spark" style={{ "--a": `${i * 30}deg`, "--d": `${(i % 4) * 80}ms` }} />
                    ))}
                </span>

                {state.points > 0 ? (
                    <>
                        <b className="lc-xp">+{shown.toLocaleString()}<i>XP</i></b>
                        <p className="lc-quiet">
                            {claim ? `Banked on your ${dollars(claim.amountCents)} purchase.` : "Banked on your Wolf Den account."}
                        </p>
                    </>
                ) : (
                    <>
                        <b className="lc-none">Points banked</b>
                        <p className="lc-quiet">That&apos;s on your Wolf Den account.</p>
                    </>
                )}

                {state.level ? <UserLevel level={state.level} /> : null}
                <PatronageReward patronage={state.patronage} />
                <a className="btn lc-cta" href="/marketplace/profile">View your profile</a>

                <style jsx>{`
                    .lc { position: relative; display: flex; flex-direction: column; align-items: center;
                        gap: 10px; padding: 10px 0 4px; text-align: center; overflow: hidden; }
                    .lc-rays { position: absolute; left: 50%; top: 46px; width: 380px; height: 380px;
                        margin: -190px 0 0 -190px; pointer-events: none; z-index: 0; opacity: 0.4;
                        background: repeating-conic-gradient(from 0deg, rgba(255, 215, 94, 0.34) 0deg 7deg, rgba(255, 215, 94, 0) 7deg 18deg);
                        mask-image: radial-gradient(circle, #000 8%, transparent 62%);
                        -webkit-mask-image: radial-gradient(circle, #000 8%, transparent 62%);
                        animation: lcTurn 26s linear infinite; }
                    @keyframes lcTurn { to { transform: rotate(360deg); } }
                    .lc-sparks { position: absolute; left: 50%; top: 52px; width: 0; height: 0;
                        pointer-events: none; z-index: 0; }
                    .lc-spark { position: absolute; left: 0; top: 0; width: 6px; height: 6px;
                        margin: -3px 0 0 -3px; border-radius: 50%; background: #ffe8ae;
                        box-shadow: 0 0 9px rgba(255, 208, 108, 0.9); opacity: 0;
                        animation: lcFly 1600ms ease-out var(--d) infinite; }
                    @keyframes lcFly {
                        0% { transform: rotate(var(--a)) translateY(0) scale(0.4); opacity: 0; }
                        20% { opacity: 1; }
                        100% { transform: rotate(var(--a)) translateY(-110px) scale(0.15); opacity: 0; }
                    }
                    .lc-xp { position: relative; z-index: 1; font-size: 3.1rem; line-height: 1; font-weight: 900;
                        color: #ffd75e; text-shadow: 0 0 26px rgba(255, 198, 96, 0.6), 0 2px 0 rgba(0, 0, 0, 0.45);
                        animation: lcPunch 0.6s cubic-bezier(0.18, 1.5, 0.4, 1) both; }
                    .lc-xp i { font-style: normal; font-size: 1.1rem; margin-left: 6px; letter-spacing: 0.12em;
                        color: #d8b36a; }
                    .lc-none { position: relative; z-index: 1; font-size: 1.6rem; color: #f2e9dc;
                        animation: lcPunch 0.6s cubic-bezier(0.18, 1.5, 0.4, 1) both; }
                    @keyframes lcPunch {
                        0% { transform: scale(0.5); opacity: 0; }
                        58% { transform: scale(1.08); opacity: 1; }
                        100% { transform: scale(1); opacity: 1; }
                    }
                    .lc-quiet { position: relative; z-index: 1; margin: 0; font-size: 13px; color: #8a9384; }
                    .lc-cta { position: relative; z-index: 1; margin-top: 6px; }
                `}</style>
            </div>
        );
    }

    return (
        <div className="lc">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/nav/logo.png" alt="" className="lc-mark" draggable="false" />
            <p className="lc-msg">{ERROR_COPY[state.error] || "We couldn't claim these points."}</p>
            <a className="btn" href="/marketplace/profile">Go to your profile</a>
            <style jsx>{`
                .lc { display: flex; flex-direction: column; align-items: center; gap: 10px;
                    padding: 14px 0; text-align: center; }
                .lc-mark { width: 54px; height: 54px; object-fit: contain; opacity: 0.9; }
                .lc-msg { margin: 0; font-size: 14px; color: #f2e9dc; }
            `}</style>
        </div>
    );
}
