"use client";

import { useEffect, useRef, useState } from "react";

import UserLevel from "@/components/UserLevel";

const ERROR_COPY = {
    already_yours: "You've already claimed these points. 🎉",
    already_claimed: "These points were already claimed on another account.",
    expired: "This code has expired — ask staff to ring it up again.",
    not_found: "This code isn't valid.",
    invalid: "This code isn't valid.",
    unauthorized: "Please sign in to claim your points.",
};

function dollars(cents) {
    return `$${(Math.max(0, Number(cents) || 0) / 100).toFixed(2)}`;
}

export default function LoyaltyClaimClient({ token, claim }) {
    const [state, setState] = useState({ status: "loading" });
    const ran = useRef(false);

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;

        // Nothing to redeem if the claim is already gone/expired — show why without a round-trip.
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
                if (res.ok && data.ok) return setState({ status: "success", points: data.points, level: data.level });
                setState({ status: "error", error: data.error || "invalid" });
            } catch {
                setState({ status: "error", error: "invalid" });
            }
        })();
    }, [token, claim]);

    if (state.status === "loading") {
        return (
            <div className="stack" style={{ textAlign: "center", gap: 8 }}>
                <div style={{ fontSize: "2rem" }}>🎁</div>
                <p className="muted">Banking your points{claim ? ` on your ${dollars(claim.amountCents)} purchase` : ""}…</p>
            </div>
        );
    }

    if (state.status === "success") {
        return (
            <div className="stack" style={{ textAlign: "center", gap: 12 }}>
                <div style={{ fontSize: "2.5rem" }}>🎉</div>
                <h2 style={{ margin: 0 }}>{state.points > 0 ? `+${state.points} XP` : "Points banked!"}</h2>
                <p className="muted" style={{ margin: 0 }}>Nice — that&apos;s on your Wolf Den account.</p>
                {state.level ? <UserLevel level={state.level} /> : null}
                <a className="btn" href="/marketplace/profile">
                    View your profile
                </a>
            </div>
        );
    }

    return (
        <div className="stack" style={{ textAlign: "center", gap: 10 }}>
            <div style={{ fontSize: "2rem" }}>🐺</div>
            <p style={{ margin: 0 }}>{ERROR_COPY[state.error] || "We couldn't claim these points."}</p>
            <a className="btn" href="/marketplace/profile">
                Go to your profile
            </a>
        </div>
    );
}
