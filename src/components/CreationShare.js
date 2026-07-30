"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ── SHARING CREATIONS ────────────────────────────────────────────────────────────────────────────────────────
// Two components, one feature:
//   <CreationShareHub />   on your OWN farm — offers waiting on you, people asking for your art, and a
//                          "share a copy" picker for each piece you've still got a share left on.
//   <AskForCopy decoId />  on someone ELSE's farm — one button on a creation you like.
//
// A creation can only ever be passed on once, so the UI is explicit about that everywhere rather than letting
// someone find out by being refused: the share button says it's a one-time thing before they commit, spent
// pieces say so plainly, and the ask button explains exactly why when it can't be used.

const ERRORS = {
    already_shared: "That piece has already been passed on — a creation can only be shared once.",
    is_a_copy: "This is a copy, and copies can't be shared on.",
    not_finished: "That creation isn't finished yet.",
    recipient_not_found: "No member with that @handle.",
    cannot_share_self: "That's already your piece!",
    recipient_has_copy: "They already have a copy of this one.",
    you_have_copy: "You already have a copy of this one.",
    already_pending: "You've already offered this piece to someone — wait for their answer.",
    already_asked: "You've already asked for this one.",
    already_yours: "That's your own creation.",
    not_pending: "That's already been answered.",
    mint_failed: "Something went wrong making the copy. Nothing was used up — try again.",
};
const errText = (e) => ERRORS[e] || "That didn't work. Try again.";

// ── Who am I giving this to? ─────────────────────────────────────────────────────────────────────────────────
// This used to be a bare "@handle" text box, which quietly demanded you already knew someone's exact handle —
// so in practice you could only gift art to people you'd memorised. Now the Den shows up as a list of faces:
// friends first, then everyone else by level, with typing as a filter rather than the only way in.
function MemberPicker({ value, onPick }) {
    const [q, setQ] = useState("");
    const [people, setPeople] = useState(null);
    const [loading, setLoading] = useState(false);
    const reqId = useRef(0);

    useEffect(() => {
        const mine = ++reqId.current;
        setLoading(true);
        // Debounced: typing shouldn't fire a request per keystroke, and a slow early response must never
        // overwrite a newer one (hence the request-id guard).
        const t = setTimeout(async () => {
            const r = await fetch(`/api/marketplace/members?q=${encodeURIComponent(q.trim().replace(/^@/, ""))}`, { cache: "no-store" }).catch(() => null);
            const d = r && r.ok ? await r.json().catch(() => null) : null;
            if (reqId.current === mine) { setPeople(Array.isArray(d?.members) ? d.members : []); setLoading(false); }
        }, q ? 250 : 0);
        return () => clearTimeout(t);
    }, [q]);

    // Friends to the top — the people you're actually likely to hand a piece of art to.
    const sorted = useMemo(() => {
        const list = people || [];
        return [...list].sort((a, b) => (a.relation === "friends" ? 0 : 1) - (b.relation === "friends" ? 0 : 1));
    }, [people]);

    return (
        <div className="cshare-picker">
            <input
                className="cshare-input" value={q} autoComplete="off" inputMode="search"
                onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search the Den…" aria-label="Search members"
            />
            <div className="cshare-picker-list" role="listbox">
                {people === null || (loading && !sorted.length) ? (
                    <p className="cshare-picker-empty">Loading the Den…</p>
                ) : !sorted.length ? (
                    <p className="cshare-picker-empty">Nobody by that name.</p>
                ) : sorted.map((m) => {
                    const on = value?.alias && m.alias === value.alias;
                    return (
                        <button
                            key={m.id} type="button" role="option" aria-selected={on}
                            className={`cshare-person${on ? " is-on" : ""}`}
                            onClick={() => onPick(on ? null : m)}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="cshare-person-av" src={m.avatarUrl} alt="" />
                            <span className="cshare-person-body">
                                <b>{m.displayLabel}</b>
                                <span>@{m.alias} · Lv {m.level}</span>
                            </span>
                            {m.relation === "friends" ? <span className="cshare-person-tag">friend</span> : null}
                            {on ? <span className="cshare-person-check" aria-hidden="true">✓</span> : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function Art({ url, name, size = 46 }) {
    if (!url) return <span className="cshare-art is-empty" style={{ width: size, height: size }} aria-hidden="true">🎨</span>;
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="cshare-art" src={url} alt={name || ""} style={{ width: size, height: size }} />;
}

// ── On your own farm ─────────────────────────────────────────────────────────────────────────────────────────
export function CreationShareHub({ onChanged }) {
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState(null);
    const [err, setErr] = useState(null);
    const [note, setNote] = useState(null);
    const [giving, setGiving] = useState(null); // creation being offered
    const [pick, setPick] = useState(null);     // member chosen to receive it

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/creations/share", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        setState(d || { mine: [], incomingGifts: [], incomingRequests: [], outgoing: [] });
    }, []);
    useEffect(() => { load(); }, [load]);

    const post = useCallback(async (body, key) => {
        setBusy(key); setErr(null); setNote(null);
        const r = await fetch("/api/marketplace/creations/share", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        }).then((x) => x.json()).catch(() => null);
        setBusy(null);
        if (r?.state) setState(r.state);
        if (!r?.ok) { setErr(errText(r?.error)); return null; }
        onChanged?.();
        return r;
    }, [onChanged]);

    if (!state) return null;
    const shareable = state.mine.filter((c) => c.canShare);
    const spent = state.mine.filter((c) => !c.canShare);
    const nothing = !state.mine.length && !state.incomingGifts.length && !state.incomingRequests.length;
    if (nothing) return null;

    return (
        <div className="cshare">
            {err ? <p className="cshare-err">{err}</p> : null}
            {note ? <p className="cshare-note">{note}</p> : null}

            {/* Someone is giving you art — the joyful case, so it goes first. */}
            {state.incomingGifts.map((g) => (
                <div key={`g${g.id}`} className="cshare-card is-gift">
                    <Art url={g.url} name={g.name} size={54} />
                    <div className="cshare-body">
                        <strong>{g.from} wants to share their art with you</strong>
                        <span>“{g.name}” — accept it and it&apos;s yours to place on your farm.</span>
                    </div>
                    <div className="cshare-actions">
                        <button type="button" className="btn-gold" disabled={busy === `g${g.id}`} onClick={async () => {
                            const r = await post({ action: "respond", shareId: g.id, decision: "accept" }, `g${g.id}`);
                            if (r?.ok) setNote(`🎨 “${r.name}” is yours — find it in your decorations.`);
                        }}>{busy === `g${g.id}` ? "…" : "Accept"}</button>
                        <button type="button" className="btn-ghost" disabled={busy === `g${g.id}`} onClick={() => post({ action: "respond", shareId: g.id, decision: "decline" }, `g${g.id}`)}>No thanks</button>
                    </div>
                </div>
            ))}

            {/* People asking for YOUR art. Accepting spends the piece's single share, so say so on the button. */}
            {state.incomingRequests.map((q) => (
                <div key={`q${q.id}`} className="cshare-card is-ask">
                    <Art url={q.url} name={q.name} size={54} />
                    <div className="cshare-body">
                        <strong>{q.asker} is asking for a copy</strong>
                        <span>of your “{q.name}”. Sharing uses up <b>this piece&apos;s</b> one and only share — your other creations aren&apos;t affected.</span>
                    </div>
                    <div className="cshare-actions">
                        <button type="button" className="btn-gold" disabled={busy === `q${q.id}`} onClick={async () => {
                            const r = await post({ action: "respond", shareId: q.id, decision: "accept" }, `q${q.id}`);
                            if (r?.ok) setNote(`🎨 Shared “${r.name}” — ${q.asker} has a copy now.`);
                        }}>{busy === `q${q.id}` ? "…" : "Share it"}</button>
                        <button type="button" className="btn-ghost" disabled={busy === `q${q.id}`} onClick={() => post({ action: "respond", shareId: q.id, decision: "decline" }, `q${q.id}`)}>Keep it mine</button>
                    </div>
                </div>
            ))}

            {/* What you've got outstanding, so nothing feels like it vanished. */}
            {state.outgoing.map((o) => (
                <div key={`o${o.id}`} className="cshare-pending">
                    ⏳ {o.kind === "gift" ? <>Offered “{o.name}” to <b>{o.who}</b> — waiting on them.</> : <>Asked <b>{o.who}</b> for a copy of “{o.name}”.</>}
                    <button type="button" className="cshare-cancel" disabled={busy === `o${o.id}`} onClick={() => post({ action: "respond", shareId: o.id, decision: "cancel" }, `o${o.id}`)}>Cancel</button>
                </div>
            ))}

            {shareable.length ? (
                <div className="cshare-group">
                    <div className="cshare-grouphead">Share a creation<span>Every piece gets its own single share</span></div>
                    {shareable.map((c) => (
                        <div key={c.id} className="cshare-row">
                            <Art url={c.url} name={c.name} />
                            <span className="cshare-name">{c.name}</span>
                            <button type="button" className="btn-ghost cshare-give" onClick={() => { setGiving(giving?.id === c.id ? null : c); setPick(null); setErr(null); }}>
                                {giving?.id === c.id ? "✕ Cancel" : "🎁 Share a copy"}
                            </button>
                        </div>
                    ))}
                    {giving ? (
                        <div className="cshare-give-panel">
                            <div className="cshare-warn">
                                🔒 <strong>“{giving.name}”</strong> can go to one member, once — every creation you make gets its own
                                single share, so this doesn&apos;t use up any of the others. Their copy can&apos;t be passed on again,
                                and yours stays on your farm.
                            </div>
                            <label className="cshare-label">Share with which member?</label>
                            <MemberPicker value={pick} onPick={setPick} />
                            <button
                                type="button" className="btn-gold" style={{ width: "100%", marginTop: 8 }}
                                disabled={!pick?.alias || busy === `give${giving.id}`}
                                onClick={async () => {
                                    const r = await post({ action: "offer", creationId: giving.id, toAlias: pick.alias }, `give${giving.id}`);
                                    if (r?.ok) { setNote(`🎁 Offered “${giving.name}” to ${r.to}.`); setGiving(null); setPick(null); }
                                }}
                            >
                                {busy === `give${giving.id}` ? "Sending…" : pick ? `Offer it to ${pick.displayLabel}` : "Pick someone above"}
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {spent.length ? (
                <div className="cshare-group">
                    <div className="cshare-grouphead">Yours alone<span>Already shared, or a copy someone gave you</span></div>
                    {spent.map((c) => (
                        <div key={c.id} className="cshare-row is-spent">
                            <Art url={c.url} name={c.name} />
                            <span className="cshare-name">{c.name}</span>
                            <span className="cshare-locked">{c.isCopy ? "🎁 a gift" : "🔒 shared"}</span>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

// ── The way in ───────────────────────────────────────────────────────────────────────────────────────────────
// The hub used to be mounted inline, far below the farm scene — you had to scroll past the whole field, the
// controls and the seed bag to find out someone had offered you art. It lives behind this button instead: it
// sits up with the farm tabs, carries a count badge when something is waiting, and opens as a sheet.
export function CreationShareLauncher() {
    const [open, setOpen] = useState(false);
    const [counts, setCounts] = useState(null);

    const refresh = useCallback(async () => {
        const r = await fetch("/api/marketplace/creations/share", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        setCounts(d ? {
            waiting: (d.incomingGifts?.length || 0) + (d.incomingRequests?.length || 0),
            any: Boolean(d.mine?.length || d.incomingGifts?.length || d.incomingRequests?.length || d.outgoing?.length),
        } : null);
    }, []);
    useEffect(() => { refresh(); }, [refresh]);

    // Nothing made, nothing offered, nothing asked — don't put a dead button on the farm.
    if (!counts?.any) return null;
    const waiting = counts.waiting;

    return (
        <>
            <button
                type="button" className={`farm-artbtn${waiting ? " has-attn" : ""}`} onClick={() => setOpen(true)}
                title={waiting ? `${waiting} waiting on you` : "Share your creations"}
            >
                <span aria-hidden="true">🎨</span>Art
                {waiting ? <span className="farm-tab-badge">{waiting}</span> : null}
            </button>
            {open ? (
                <div className="cshare-sheet-wrap" role="dialog" aria-modal="true" aria-label="Creation sharing">
                    <button type="button" className="cshare-sheet-scrim" aria-label="Close" onClick={() => setOpen(false)} />
                    <div className="cshare-sheet">
                        <div className="cshare-sheet-head">
                            <strong>🎨 Your art</strong>
                            <button type="button" className="cshare-sheet-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
                        </div>
                        <div className="cshare-sheet-body">
                            <CreationShareHub onChanged={refresh} />
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}

// ── On someone else's farm ───────────────────────────────────────────────────────────────────────────────────
// Asks the server whether an ask is possible before rendering anything, so the button never appears just to be
// refused — and when it can't be used, it says why in plain words.
export function AskForCopy({ decoId, onAsked }) {
    const [info, setInfo] = useState(null);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            const r = await fetch(`/api/marketplace/creations/share?decoId=${encodeURIComponent(decoId)}`, { cache: "no-store" }).catch(() => null);
            const d = r && r.ok ? await r.json().catch(() => null) : null;
            if (alive) setInfo(d);
        })();
        return () => { alive = false; };
    }, [decoId]);

    if (!info) return null;
    if (done) return <p className="cshare-asked">✅ Asked! You&apos;ll get a notification if they share it.</p>;

    if (!info.canAsk) {
        const why = {
            already_yours: "This one's yours.",
            already_shared: "This piece has already been passed on — creations can only be shared once.",
            is_a_copy: "This is a copy, so it can't be shared on.",
            you_have_copy: "You already have a copy of this.",
            already_asked: "You've already asked for this one.",
        }[info.reason];
        return why ? <p className="cshare-cant">{why}</p> : null;
    }

    return (
        <div className="cshare-askbox">
            <p className="cshare-askcopy">
                {info.artist ? <><b>{info.artist}</b> made this.</> : null} Ask for a copy for your own farm?
                <span> They can share it with one person, once.</span>
            </p>
            {err ? <p className="cshare-err">{err}</p> : null}
            <button type="button" className="btn-gold" style={{ width: "100%" }} disabled={busy} onClick={async () => {
                setBusy(true); setErr(null);
                const r = await fetch("/api/marketplace/creations/share", {
                    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ask", decoId }),
                }).then((x) => x.json()).catch(() => null);
                setBusy(false);
                if (r?.ok) { setDone(true); onAsked?.(); } else setErr(errText(r?.error));
            }}>{busy ? "Asking…" : "🙏 Ask for a copy"}</button>
        </div>
    );
}
