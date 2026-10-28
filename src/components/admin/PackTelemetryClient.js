"use client";

import { useCallback, useEffect, useState } from "react";

const usd = (cents) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;
const pct = (v) => (v === null || v === undefined ? "—" : `${v}%`);

const RANGES = [7, 30, 90];

// ⚠️ THE PAGE GATE AND THE API GATE ARE DIFFERENT AUTH SYSTEMS, AND THIS IS THE PAIR.
//
// The page lets you in on a MARKETPLACE session (isOwner on the buyer cookie). `/api/admin/*` does not accept
// that at all — requireAdminAccess only takes an admin-app bearer session or the shared admin key. So the
// first version rendered a perfectly correct screen that sat on "Loading…" forever, because the door and the
// machine were checking different credentials. Exactly the shape of the casino launch bug, one layer up.
//
// The house answer is the one AdminPlayersPanel and AdminBossPanel already use: keep the admin key in
// localStorage and send it as a Bearer header.
const KEY_STORE = "wolfden-admin-key";

export default function PackTelemetryClient() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [queue, setQueue] = useState([]);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [key, setKey] = useState("");

    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from localStorage on mount
    useEffect(() => { setKey(localStorage.getItem(KEY_STORE) || ""); }, []);

    // ⚠️ NOTHING IS SET BEFORE THE FIRST AWAIT. A synchronous setState at the top of a function called from
    // an effect is a render-during-render, which is what react-hooks/set-state-in-effect is pointing at. So
    // the error is cleared on the way OUT (on success) rather than on the way in.
    const load = useCallback(async (range) => {
        if (!key) return;
        const auth = { Authorization: `Bearer ${key}` };
        const [t, q] = await Promise.all([
            fetch(`/api/admin/packs/telemetry?days=${range}`, { cache: "no-store", headers: auth }),
            fetch("/api/admin/packs/queue", { cache: "no-store", headers: auth }),
        ]);
        if (!t.ok) {
            setError(t.status === 401 || t.status === 403
                ? "That admin key was rejected."
                : "Couldn't load telemetry.");
            return;
        }
        setError(null);
        setData(await t.json());
        if (q.ok) setQueue((await q.json()).tasks || []);
    }, [key]);

    // One read on mount and on an explicit range change. No timer at all: this is a screen somebody opens to
    // check a number, not a dashboard anybody leaves running — so there is nothing for check:polls to gate.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount (setState is post-await)
    useEffect(() => { if (key) load(days); }, [key, days, load]);

    async function closeTask(taskId, notFound) {
        if (busy) return;
        setBusy(true);
        try {
            const res = await fetch("/api/admin/packs/queue", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
                body: JSON.stringify({ taskId, notFound }),
            });
            const body = await res.json();
            if (!res.ok) { setError(body.error || "Couldn't close that."); return; }
            await load(days);
        } finally {
            setBusy(false);
        }
    }

    // No key yet, or a rejected one: ask for it rather than spinning forever. The same box AdminPlayersPanel
    // shows, so somebody who has already pasted it once never sees this again.
    if (!key || error) {
        return (
            <div className="pt-keybox">
                {error ? <p className="pt-error">{error}</p> : null}
                <label>
                    <span>Admin key</span>
                    <input
                        type="password"
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder="Paste the admin key"
                    />
                </label>
                <button
                    type="button"
                    className="pk-btn pk-btn-primary"
                    onClick={() => { localStorage.setItem(KEY_STORE, key); setError(null); load(days); }}
                >
                    Save key
                </button>
            </div>
        );
    }
    if (!data) return <p className="muted">Loading…</p>;

    const h = data.headline;
    const g = data.guardrail;

    return (
        <div className="pt-wrap">
            <div className="pt-range">
                {RANGES.map((r) => (
                    <button
                        key={r}
                        type="button"
                        className={`vt-tab ${days === r ? "vt-tab-on" : ""}`}
                        onClick={() => setDays(r)}
                    >
                        {r} days
                    </button>
                ))}
            </div>

            {/* ⚠️ THE POOL GUARDRAIL GETS ITS OWN BOX AND GOES RED. At or above 100%, every pack sold loses
                money. Luke sets the EV when he builds the bags, so this is a number to check rather than a
                lever to pull — but it moves on its own as hits get pulled, so it is not set-and-forget. */}
            <section className={`pt-guard ${g.losing ? "pt-guard-bad" : ""}`}>
                <div>
                    <span className="vt-head-label">Expected value per pack</span>
                    <strong className="pt-big">{usd(g.evCents)}</strong>
                    <span className="pt-sub">{pct(g.evPercentOfPrice)} of the {usd(g.priceCents)} price</span>
                </div>
                <div>
                    <span className="vt-head-label">Packs left</span>
                    <strong className="pt-big">{g.remaining}</strong>
                    <span className="pt-sub">{usd(g.poolValueCents)} of cards</span>
                </div>
                {g.losing ? (
                    <p className="pt-alarm">
                        Every pack sold right now loses money — the pool is worth more than it costs.
                    </p>
                ) : null}
                {!data.priceTrusted ? (
                    <p className="pt-alarm">
                        Square did not return a pack price, so opens are refused. Nobody is being charged a
                        guessed number.
                    </p>
                ) : null}
            </section>

            <section className="pt-stats">
                <Stat label="Opens" value={h.opens} />
                <Stat label="Revenue" value={usd(h.revenueCents)} gold />
                <Stat label="Sales tax" value={usd(h.taxCents)} />
                <Stat label="COGS" value={usd(h.cogsCents)} />
                <Stat label="Margin" value={usd(h.marginCents)} sub={pct(h.marginPercent)} gold />
                <Stat label="Sold back" value={pct(h.sellBackRate)} sub={`${h.soldBack} of ${h.opens}`} />
                <Stat label="Vault held" value={data.vault.heldCount} sub={usd(data.vault.heldValueCents)} />
                <Stat label="Pull queue" value={data.queue.open} sub={data.queue.promoted ? `${data.queue.promoted} urgent` : "none urgent"} />
            </section>

            {/* ⚠️ A margin built mostly on an estimate is a guess wearing a number's clothes. 37% of the pool
                had a real cost when this was measured, so the share is stated rather than implied. The
                estimate is per channel now — 65% for a bag, 46% for a shelf single — so this line names
                neither and points at the basis breakdown instead. */}
            <section className="pt-note">
                <strong>{pct(g.costedPercent)}</strong> of the pool has a real recorded cost
                ({g.costedCount} of {g.remaining}). The rest falls back to an estimate, and any margin above
                is only as good as that mix.
                {data.cogsBasis.length ? (
                    <span className="pt-basis">
                        {data.cogsBasis.map((b) => `${b.basis}: ${b.n}`).join(" · ")}
                    </span>
                ) : null}
            </section>

            {/* ── ⚠️ THE HEADLINE ABOVE IS BLENDED, AND BLENDED IS A DIFFERENT QUESTION, NOT A WRONG ONE ──
                "What did this feature take this week" has one answer and the row above is it. "Is the
                Pokémon pack priced right" does not: a $15 category pack and a $20 bag have different
                prices, costs and margins, so one average across both moves when the MIX moves — a good week
                of bag sales would read as the category packs improving.

                Shown only once more than one pool has opens in it. Before that this table is the headline
                again with a label on it. */}
            {(data.byPool || []).length > 1 ? (
                <>
                    {/* ── ⚠️ MODELLED BESIDE REALISED, BECAUSE AT 100% SELL-BACK THE MARGIN IS A
                        PREDICTION ──────────────────────────────────────────────────────────────────
                        Each tier's price is fixed and its odds are solved nightly to hit a target EV.
                        That target IS the business — so the question this screen has to answer is not
                        "what did we make" but "is the model holding". Realised alone cannot answer it.

                        ⚠️ AND IT REFUSES TO JUDGE A SMALL SAMPLE. The payout distribution is
                        heavy-tailed — one $279 card erases fifty good pulls, and a correctly priced
                        Pokémon pool still has a 17.7% chance of being down after a HUNDRED opens. Under
                        30 sell-backs the realised column is shown greyed with "need more", because a red
                        number three opens in is noise and treating it as a signal is how somebody
                        retunes a model that was never wrong. */}
                    <h3 className="pt-h">By pack — modelled vs realised</h3>
                    <ul className="pt-pools">
                        {data.byPool.map((p) => (
                            <li key={p.pool}>
                                <span className="pt-pool-name">
                                    {p.brand}
                                    {p.alpha != null ? <i className="pt-alpha">odds curve {Number(p.alpha).toFixed(2)}</i> : null}
                                </span>
                                <span className="pt-pool-opens">{p.opens} opens</span>
                                <span className="pt-pool-margin">
                                    {p.modelledMarginCents != null ? usd(p.modelledMarginCents) : "—"}
                                    <i>{p.modelledMarginPercent != null ? `${p.modelledMarginPercent}% modelled` : "no model"}</i>
                                </span>
                                <span className={`pt-pool-sold${p.trustworthy ? "" : " pt-thin"}`}>
                                    {p.sellBackMarginPerOpenCents != null
                                        ? usd(p.sellBackMarginPerOpenCents)
                                        : "—"}
                                    <i>{p.trustworthy
                                        ? `realised / open (${p.soldBack})`
                                        : `need more (${p.soldBack})`}</i>
                                </span>
                            </li>
                        ))}
                    </ul>
                    {data.missingPayouts > 0 ? (
                        <p className="pt-warn">
                            {data.missingPayouts} sell-back{data.missingPayouts === 1 ? "" : "s"} with no recorded
                            payout — the figure is missing, not zero.
                        </p>
                    ) : null}
                </>
            ) : null}

            <h3 className="pt-h">What people are pulling</h3>
            <ul className="pt-tiers">
                {data.tierSplit.map((t) => (
                    <li key={t.key}>
                        <span className="pt-dot" style={{ background: t.glow }} />
                        <span className="pt-tier-label">{t.label}</span>
                        <span className="pt-tier-bar">
                            <span style={{ width: `${Math.min(100, t.share)}%`, background: t.glow }} />
                        </span>
                        <span className="pt-tier-n">{t.n} · {pct(t.share)}</span>
                    </li>
                ))}
            </ul>

            <h3 className="pt-h">
                Pull queue
                {data.queue.refile ? ` — ${data.queue.refile} to re-file` : ""}
            </h3>
            {queue.length === 0 ? (
                <p className="muted">Nothing waiting.</p>
            ) : (
                <ul className="pt-queue">
                    {queue.map((t) => (
                        <li key={t.id} className={t.promoted ? "pt-urgent" : ""}>
                            <div className="pt-q-main">
                                <strong>{t.bagSku}</strong>
                                <span>{t.cardName} · {usd(t.valueCents)}</span>
                                <span className="pt-q-sub">
                                    {t.member}
                                    {t.kind === "refile" ? " · put back" : ""}
                                    {t.promoted ? " · ORDER WAITING" : ""}
                                </span>
                                {t.note ? <span className="pt-q-sub">{t.note}</span> : null}
                            </div>
                            <div className="pt-q-actions">
                                <button type="button" className="pk-btn pk-btn-primary" onClick={() => closeTask(t.id, false)} disabled={busy}>
                                    Done
                                </button>
                                {/* The only detector that a bag has gone missing. Refunds in full, no
                                    questions — the member never pays for our inventory drift. */}
                                <button type="button" className="vt-cancel" onClick={() => closeTask(t.id, true)} disabled={busy}>
                                    Can&apos;t find it
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <h3 className="pt-h">Members</h3>
            {data.members.length === 0 ? (
                <p className="muted">No opens in this window.</p>
            ) : (
                <ul className="pt-members">
                    {data.members.map((m) => (
                        <li key={m.buyerId}>
                            <span className="pt-m-name">{m.name}</span>
                            <span className="pt-m-cell">{m.opens} opens</span>
                            <span className="pt-m-cell">{usd(m.spentCents)} spent</span>
                            <span className="pt-m-cell">{usd(m.pulledCents)} pulled</span>
                            {/* Net position is the abuse-detection number: consistently net-positive across
                                many opens is either luck or a mispriced pool. */}
                            <span className={`pt-m-net ${m.netCents > 0 ? "vt-up" : "vt-down"}`}>
                                {m.netCents > 0 ? "+" : "−"}{usd(Math.abs(m.netCents))}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function Stat({ label, value, sub, gold }) {
    return (
        <div className="pt-stat">
            <span className="vt-head-label">{label}</span>
            <strong className={gold ? "vt-gold" : ""}>{value}</strong>
            {sub ? <span className="pt-sub">{sub}</span> : null}
        </div>
    );
}
