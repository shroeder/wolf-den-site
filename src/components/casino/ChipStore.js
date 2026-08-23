"use client";

import { useCallback, useEffect, useState } from "react";
import { Cas } from "@/components/casino/casino-audio.js";
import { Haptic, unlock } from "@/components/arena/arena-audio.js";

// ── THE COUNTER ──────────────────────────────────────────────────────────────────────────────────────────────
// Where chips turn into things, and the only place they are worth anything. The machines decide how many chips
// you get; this decides what a chip IS, which is why the prices live in one list on the server and this screen
// only renders them.
//
// EVERY PRICE SHOWS THE GOLD BEHIND IT. A chip is a currency nobody has an instinct for yet — "1,600 chips"
// means nothing on its own, and a shelf of meaningless numbers is a shelf nobody can decide anything at. The
// gold is what a member already thinks in, so it is printed under every price. It is not a second currency
// being asked for; it is the same number in a unit you can feel.

export default function ChipStore({ chips, onBuy, onRefresh }) {
    const [shelf, setShelf] = useState(null);
    const [busy, setBusy] = useState(null);
    const [said, setSaid] = useState(null);
    // The thing being inspected, or null.
    const [open, setOpen] = useState(null);

    useEffect(() => { onRefresh().then(setShelf).catch(() => setShelf({ items: [] })); }, [onRefresh]);

    const buy = useCallback(async (item) => {
        if (busy || item.owned || !item.afford) return;
        unlock();
        setBusy(item.id); setSaid(null);
        const r = await onBuy(item.id);
        setBusy(null);
        if (r?.ok) {
            setShelf(r);
            setOpen(null);
            setSaid({ good: true, text: `${r.name} is yours.` });
            Cas.jackpot(); Haptic.crit();
        } else {
            setSaid({ good: false, text: r?.error === "not_enough_chips" ? "Not enough chips for that."
                : r?.error === "already_owned" ? "You already have that one."
                : "That didn't go through." });
            Cas.lose();
        }
    }, [busy, onBuy]);

    if (!shelf) return <p className="cs-wait">Opening the case…</p>;

    return (
        <div className="cs">
            <div className="cs-head">
                <b>{Number(chips ?? shelf.balance ?? 0).toLocaleString()}</b>
                <i>chips</i>
            </div>
            <p className="cs-intro">Won at the machines. Good here and nowhere else.</p>

            {said ? <p className={`cs-said${said.good ? " is-good" : ""}`}>{said.text}</p> : null}

            <div className="cs-shelf">
                {shelf.items.map((item) => (
                    <button key={item.id} type="button"
                        className={`cs-item${item.owned ? " is-owned" : ""}${!item.afford && !item.owned ? " is-dear" : ""}`}
                        onClick={() => { setOpen(item); Cas.chips(); }}>
                        {/* THE THING ITSELF. Every one of these is drawn — gems, forge parts, consumables
                            and decorations all carry a sprite somewhere in the game — and the counter was
                            showing a name and a price. Somebody spending four thousand chips on a sapphire
                            could not see the sapphire. */}
                        <span className="cs-art">
                            {item.art
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={item.art} alt="" draggable="false" />
                                : <i aria-hidden="true" />}
                        </span>
                        <span className="cs-what">
                            <b>{item.name}</b>
                            <span>{item.blurb}</span>
                        </span>
                        <span className="cs-price">
                            {item.owned ? <b className="cs-owned">Owned</b> : (
                                <>
                                    <b>{item.price.toLocaleString()}</b>
                                    <i>{Math.round(item.price / (shelf.rate || 0.25)).toLocaleString()} gold played</i>
                                </>
                            )}
                        </span>
                    </button>
                ))}
            </div>

            {/* ── INSPECT ─────────────────────────────────────────────────────────────────────────────
                Tapping a thing shows what it DOES before it asks for the chips. Everything in here is
                generated from the real numbers the owning feature reads — a hand-typed "+7 might" goes
                stale the first time somebody retunes a gem, and it goes stale silently. */}
            {open ? (
                <div className="cs-scrim" role="dialog" aria-modal="true" aria-label={open.name}
                    onClick={() => setOpen(null)}>
                    <div className="cs-card" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="cs-x" onClick={() => setOpen(null)} aria-label="Close">✕</button>
                        <div className="cs-hero">
                            {open.art
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={open.art} alt="" draggable="false" />
                                : <i aria-hidden="true" />}
                        </div>
                        <h4>{open.name}</h4>
                        {open.detail ? <p className="cs-kind">{open.detail}</p> : null}
                        <p className="cs-blurb">{open.blurb}</p>

                        {open.lines?.length ? (
                            <ul className="cs-lines">
                                {open.lines.map((l, i) => (
                                    <li key={i}>
                                        {l.art
                                            // eslint-disable-next-line @next/next/no-img-element
                                            ? <img src={l.art} alt="" />
                                            : null}
                                        <b>{l.label}</b>
                                        <span>{l.value}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                        {open.foot ? <p className="cs-foot">{open.foot}</p> : null}

                        <button type="button" className="cs-take"
                            disabled={Boolean(busy) || open.owned || !open.afford}
                            onClick={() => buy(open)}>
                            {open.owned ? "You already have this"
                                : !open.afford ? `${(open.price - (chips ?? shelf.balance ?? 0)).toLocaleString()} more chips needed`
                                : busy === open.id ? "…"
                                : `Take it — ${open.price.toLocaleString()} chips`}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
