"use client";

import Link from "next/link";
import { useState } from "react";

const STATUS_LABEL = {
    open: { label: "Open", color: "#6bf0ff" },
    completed: { label: "Completed", color: "#7ad07a" },
    cancelled: { label: "Taken down", color: "#9a93a6" },
    expired: { label: "Expired", color: "#9a93a6" },
};

function expiresIn(iso) {
    if (!iso) return "";
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return "expiring";
    const days = Math.floor(ms / 86400000);
    if (days >= 1) return `${days}d left`;
    return `${Math.max(1, Math.floor(ms / 3600000))}h left`;
}

// One bounty in full, with the actions available to the viewer: take it on / back out (helpers), or
// complete-and-pay / take down (creator). Group completion lets the creator pick who actually helped.
export default function BountyDetailClient({ initial, signedIn }) {
    const [bounty, setBounty] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [picking, setPicking] = useState(false); // group winner-selection open
    const [winners, setWinners] = useState(() => new Set());

    const status = STATUS_LABEL[bounty.status] || STATUS_LABEL.open;
    const isOpen = bounty.status === "open";
    const participants = bounty.participants || [];

    async function refetch() {
        const r = await fetch(`/api/marketplace/bounties/${bounty.id}`, { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (d?.bounty) setBounty(d.bounty);
    }

    async function act(url, body) {
        setBusy(true);
        setErr(null);
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBusy(false);
        if (r?.ok && d?.ok) { await refetch(); return true; }
        setErr(friendly(d?.error));
        return false;
    }

    const [confirmCancel, setConfirmCancel] = useState(false);
    const claim = () => act(`/api/marketplace/bounties/${bounty.id}/claim`, { action: bounty.viewerClaimed ? "unclaim" : "claim" });
    const cancel = () => act(`/api/marketplace/bounties/${bounty.id}/cancel`);
    const completeSolo = () => act(`/api/marketplace/bounties/${bounty.id}/complete`, {});
    async function completeGroup() {
        if (!winners.size) { setErr("Pick at least one helper."); return; }
        const ok = await act(`/api/marketplace/bounties/${bounty.id}/complete`, { winnerIds: [...winners] });
        if (ok) setPicking(false);
    }
    function toggleWinner(id) {
        setWinners((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    return (
        <>
            <section className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Link href="/marketplace/bounties" className="pill">← Board</Link>
                    <span className="bounty-status" style={{ color: status.color }}>{status.label}</span>
                </div>

                <div className="bounty-detail-head">
                    <span className="bounty-type">{bounty.typeIcon} {bounty.typeLabel}</span>
                    <span className={`bounty-mode bounty-mode-${bounty.mode}`}>{bounty.mode === "group" ? "👥 Group" : "🙋 Solo"}</span>
                </div>
                <h1 style={{ margin: "6px 0 2px" }}>{bounty.title}</h1>
                <p className="muted" style={{ margin: 0 }}>
                    by {bounty.creator.alias ? `@${bounty.creator.alias}` : bounty.creator.name}
                    {isOpen ? ` · ${expiresIn(bounty.expiresAt)}` : ""}
                </p>

                <div className="bounty-reward-big">💰 {bounty.reward.toLocaleString()} <span className="muted" style={{ fontSize: "0.7em", fontWeight: 600 }}>reserved reward</span></div>

                {bounty.description ? <p style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>{bounty.description}</p> : null}

                {bounty.images?.length ? (
                    <div className="bounty-gallery">
                        {bounty.images.map((url) => (
                            <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="" /></a>
                        ))}
                    </div>
                ) : null}
            </section>

            {/* Who's taken it on */}
            <section className="card">
                <h3 style={{ marginTop: 0 }}>{bounty.mode === "group" ? "👥" : "🙋"} On it {participants.length ? `(${participants.length})` : ""}</h3>
                {participants.length === 0 ? (
                    <p className="muted" style={{ margin: 0 }}>No one has taken this on yet.</p>
                ) : (
                    <div className="bounty-people">
                        {participants.map((p) => (
                            <div key={p.id} className={`bounty-person${p.isWinner ? " is-winner" : ""}`}>
                                {p.spriteUrl ? <img src={p.spriteUrl} alt="" /> : <span className="bounty-person-fallback">{(p.name || "?").slice(0, 1)}</span>}
                                <span>{p.alias ? `@${p.alias}` : p.name}</span>
                                {p.isWinner ? <span className="bounty-payout">💰 {p.payout.toLocaleString()}</span> : null}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Actions */}
            {err ? <p style={{ color: "#e66" }}>{err}</p> : null}

            {isOpen && !bounty.isCreator ? (
                <section className="card">
                    {!signedIn ? (
                        <p className="muted" style={{ margin: 0 }}>Sign in to take on this bounty.</p>
                    ) : bounty.mode === "single" && participants.length > 0 && !bounty.viewerClaimed ? (
                        <p className="muted" style={{ margin: 0 }}>Someone&apos;s already on this solo bounty.</p>
                    ) : (
                        <button type="button" className={bounty.viewerClaimed ? "btn-ghost" : "btn-gold"} onClick={claim} disabled={busy} style={{ width: "100%" }}>
                            {bounty.viewerClaimed ? "Back out of this bounty" : "🙌 Take this on"}
                        </button>
                    )}
                </section>
            ) : null}

            {isOpen && bounty.isCreator ? (
                <section className="card">
                    <h3 style={{ marginTop: 0 }}>Manage your bounty</h3>
                    {bounty.mode === "group" && picking ? (
                        <>
                            <p className="muted" style={{ marginTop: 0 }}>Pick who actually helped — the reward splits evenly between them.</p>
                            <div className="stack" style={{ gap: 6 }}>
                                {participants.map((p) => (
                                    <label key={p.id} className="bounty-winner-check">
                                        <input type="checkbox" checked={winners.has(p.id)} onChange={() => toggleWinner(p.id)} />
                                        <span>{p.alias ? `@${p.alias}` : p.name}</span>
                                    </label>
                                ))}
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                <button type="button" className="btn-gold" onClick={completeGroup} disabled={busy || !winners.size}>Complete & split{winners.size ? ` (${winners.size})` : ""}</button>
                                <button type="button" className="btn-ghost" onClick={() => setPicking(false)} disabled={busy}>Cancel</button>
                            </div>
                        </>
                    ) : (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {participants.length === 0 ? (
                                <p className="muted" style={{ margin: 0 }}>No one&apos;s taken it on yet — nothing to complete. You can take it down to get your gold back.</p>
                            ) : bounty.mode === "group" ? (
                                <button type="button" className="btn-gold" onClick={() => setPicking(true)} disabled={busy}>✓ Complete & pick helpers</button>
                            ) : (
                                <button type="button" className="btn-gold" onClick={completeSolo} disabled={busy}>
                                    ✓ Complete & pay {participants[0].alias ? `@${participants[0].alias}` : participants[0].name}
                                </button>
                            )}
                            {confirmCancel ? (
                                <>
                                    <button type="button" className="btn-ghost" onClick={cancel} disabled={busy}>Yes, refund my gold</button>
                                    <button type="button" className="btn-ghost" onClick={() => setConfirmCancel(false)} disabled={busy}>Keep it up</button>
                                </>
                            ) : (
                                <button type="button" className="btn-ghost" onClick={() => setConfirmCancel(true)} disabled={busy}>Take it down (refund)</button>
                            )}
                        </div>
                    )}
                </section>
            ) : null}
        </>
    );
}

function friendly(code) {
    return (
        {
            already_taken: "Someone already took this solo bounty.",
            own_bounty: "You can't take on your own bounty.",
            not_open: "This bounty isn't open anymore.",
            expired: "This bounty has expired.",
            no_claimants: "No one has taken this on yet.",
            no_winners: "Pick at least one helper.",
            not_owner: "Only the creator can do that.",
            not_signed_in: "Sign in first.",
        }[code] || "Something went wrong — try again."
    );
}
