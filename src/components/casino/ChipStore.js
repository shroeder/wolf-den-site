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

    useEffect(() => { onRefresh().then(setShelf).catch(() => setShelf({ items: [] })); }, [onRefresh]);

    const buy = useCallback(async (item) => {
        if (busy || item.owned || !item.afford) return;
        unlock();
        setBusy(item.id); setSaid(null);
        const r = await onBuy(item.id);
        setBusy(null);
        if (r?.ok) {
            setShelf(r);
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
                    <div key={item.id} className={`cs-item${item.owned ? " is-owned" : ""}${!item.afford && !item.owned ? " is-dear" : ""}`}>
                        <div className="cs-what">
                            <b>{item.name}</b>
                            <span>{item.blurb}</span>
                        </div>
                        <button type="button" className="cs-buy" disabled={Boolean(busy) || item.owned || !item.afford}
                            onClick={() => buy(item)}>
                            {item.owned ? "Owned" : busy === item.id ? "…" : (
                                <>
                                    <b>{item.price.toLocaleString()}</b>
                                    {/* THE GOLD BEHIND IT. A chip has no instinctive worth yet; this is the
                                        same price in the unit everybody already thinks in. The rate comes
                                        down with the shelf rather than being written here — a copy of it
                                        would have started quoting prices three times too low the day the
                                        rate moved from 0.08 to 0.25. */}
                                    <i>{Math.round(item.price / (shelf.rate || 0.25)).toLocaleString()} gold played</i>
                                </>
                            )}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
