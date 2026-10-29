"use client";

import { useEffect, useState } from "react";

import Area from "@/components/grove/GroveArea.js";
import ItemArt from "@/components/ItemArt";

// ── YOUR GEAR, INSIDE THE GROVE ─────────────────────────────────────────────────────────────────────────────
// Luke: "the grove is not doing a good job showing you your gear."
//
// It was showing none of it. The Grove had a backpack (parts), a workbench (crafting), an armoury (forged
// boss sets) and emblems — four screens about things that exist only here — and nothing at all about the
// gear you actually fight in. The numbers it hands the scene come straight off that loadout, so a player
// could not see the cause of their own damage from inside the only place it mattered.
//
// It got worse the day gear started DROPPING here. A sword now falls on the ground, arcs, lands, and is
// collected into an inventory the player has to leave the Grove to look at. The loop this feature is built
// on — kill, get a thing, be stronger — had its middle step off-screen.
//
// ⚠️ THIS READS THE GAME'S OWN GEAR, NOT A GROVE COPY OF IT. Luke, settling this when the loot tables were
// designed: "the gear you get from the Grove is the exact same gear you get from the rest of the game. I
// don't understand the confusion here." So this is /api/marketplace/inventory — the same endpoint, the same
// equip call and the same slots the main gear screen uses. A Grove-local gear store would be a second
// definition of what you are wearing, and the two would disagree the first time either moved.
//
// ⚠️ AND IT IS NOT THE ARMOURY. GroveArmoury is Grove-forged boss SETS out of mkt_grove_armour, bought with
// merits. Different items, different currency, different table. They sit on different panels on purpose.

// What the Grove actually fights with, in the order it matters. The full sheet has twenty-odd numbers and
// most of them do nothing here — printing them all would bury the four that decide whether you win.
//
// ⚠️ NAMED FROM st.hero, WHICH IS WHAT THE SCENE IS HANDED. GroveClient builds `stats` out of exactly these
// fields and passes them to GroveScene, so this panel and the fight cannot disagree about your damage: they
// are reading the same object. A sheet assembled from the item list instead would be a second calculation.
//
// ⚠️ EVERY ONE CARRIES ITS OWN FORMATTER, BECAUSE THE UNITS ARE NOT UNIFORM. GroveClient says this at length
// above GROVE_STAT_READOUT and it is right: critChance is a SHARE (0.17 is 17%), critMult is a true
// MULTIPLIER (swing() does Math.pow(critMult, stacks)), and lifesteal is RAW POINTS fed through a curve at
// the swing — grove-world.js says so in its own docstring: "bleed as shares, lifesteal as raw points".
//
// The first cut of this printed all six the same way. A real crit chance of 0.17 came out as "0%" — not
// visibly broken, just quietly wrong, on the screen whose entire job is telling a player what their gear
// does. Rounding a share to an integer is how a stat silently becomes zero.
const ONE_DP = (v) => `${(v * 100).toFixed(1).replace(/\.0$/, "")}%`;
const SHOWN = [
    { k: "damage", label: "Damage", fmt: (v) => String(Math.round(v)) },
    { k: "health", label: "Max HP", fmt: (v) => String(Math.round(v)) },
    { k: "armor", label: "Armour", fmt: (v) => String(Math.round(v)) },
    { k: "critChance", label: "Crit", fmt: ONE_DP },
    { k: "critMult", label: "Crit dmg", fmt: (v) => `${(Number(v) || 1).toFixed(2)}x` },
    // Points, not a percent — the swing turns them into a rate through LIFESTEAL_PER_POINT.
    { k: "lifesteal", label: "Lifesteal", fmt: (v) => String(Math.round(v)) },
];

const RARITY_TINT = {
    common: "#9aa3b2", uncommon: "#6fbf73", rare: "#5aa9e6", epic: "#b57edc",
    legendary: "#f0b429", mythic: "#ff7a59", ascendant: "#54e6c8", eternal: "#ff5ea8",
};

export default function GroveGear({ st, onChanged }) {
    const [inv, setInv] = useState(null);
    const [busy, setBusy] = useState("");
    const [openSlot, setOpenSlot] = useState(null);
    const [err, setErr] = useState("");

    // ⚠️ READ WHEN THE PANEL OPENS, NOT WITH THE GROVE STATE. getGroveState is the highest-volume request in
    // this feature — it runs on every zone entry and every settle — and the inventory is a table nobody
    // looks at most sessions. Folding it in would bill the gear screen on every member's every settle
    // whether or not they ever tap it. This component only exists while the panel is open.
    //
    // ⚠️ AND IT GUARDS AGAINST ITS OWN REPLY ARRIVING LATE. The panel is a sheet over a paused zone and can
    // be shut at any moment; a fetch that resolves after that would set state on a component nobody is
    // looking at. Cheap to prevent, and the alternative is a warning that only appears for players with a
    // slow connection — which is to say, not for whoever is testing it.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const r = await fetch("/api/marketplace/inventory", { cache: "no-store" })
                .then((x) => (x.ok ? x.json() : null)).catch(() => null);
            if (!cancelled) setInv(r);
        })();
        return () => { cancelled = true; };
    }, []);

    const equip = async (slot, itemId) => {
        setBusy(slot);
        setErr("");
        const r = await fetch("/api/marketplace/inventory", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ slot, itemId }),
        }).then((x) => x.json()).catch(() => null);
        setBusy("");
        if (!r || r.error) { setErr(r?.error ? String(r.error).replace(/_/g, " ") : "That didn't take."); return; }
        setInv(r);
        setOpenSlot(null);
        // ⚠️ THE GROVE STATE HAS TO BE RE-READ, because the scene's damage and max HP come from st.hero and
        // the server has just recomputed them. Without this the panel would show the new sword and the fight
        // would still be swinging the old one — the exact disagreement this whole component exists to end.
        onChanged?.();
    };

    const hero = st?.hero || null;
    const slots = inv?.slots || [];
    const equipped = inv?.equipped || {};
    const items = inv?.items || [];

    const fitsSlot = (slotDef) => items.filter((i) => i.slot === slotDef.accepts && !i.equipped);
    const itemById = (id) => items.find((i) => i.id === id) || null;

    return (
        <div className="gv-gear">
            <Area id="gear" icon="ui-gear" title="Gear"
                count={slots.length ? `${Object.values(equipped).filter(Boolean).length}/${slots.length}` : null}>
                {inv === null ? (
                    <p className="gv-gear-wait">Reading your kit&hellip;</p>
                ) : (
                    <>
                        {/* ⚠️ EVERY SLOT IS DRAWN, FILLED OR NOT — the same rule the backpack follows and for
                            the same reason Luke gave there ("a lot of void in the area where we show the
                            items"). An empty slot is not absence, it is room, and a player who cannot see
                            that a ring slot exists cannot go looking for a ring. */}
                        <div className="gv-gslots">
                            {slots.map((s) => {
                                const it = itemById(equipped[s.slot]);
                                const spare = fitsSlot(s).length;
                                return (
                                    <button key={s.slot} type="button"
                                        className={`gv-gslot${it ? " is-on" : ""}${openSlot === s.slot ? " is-open" : ""}`}
                                        style={it ? { "--rar": RARITY_TINT[it.rarity] || "#9aa3b2" } : undefined}
                                        disabled={busy === s.slot}
                                        aria-label={it ? `${s.label}: ${it.name}. Tap to change.` : `${s.label}: empty${spare ? `, ${spare} to choose from` : ""}`}
                                        onClick={() => setOpenSlot(openSlot === s.slot ? null : s.slot)}>
                                        <span className="gv-gslot-face">
                                            {it ? <ItemArt id={it.id} icon={it.icon} className="gv-gart" /> : <span className="gv-gslot-none" aria-hidden="true" />}
                                            {/* A count on an EMPTY slot is the whole prompt: it says there is
                                                something to put here without nagging about it. */}
                                            {!it && spare ? <i className="gv-gslot-n">{spare}</i> : null}
                                        </span>
                                        <span className="gv-gslot-label">{s.label}</span>
                                        <span className="gv-gslot-name">{it ? it.name : "Empty"}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {err ? <p className="gv-gear-err">{err}</p> : null}

                        {/* The drawer for one slot. Opens under the grid rather than over it, so the thing
                            you are replacing stays on screen while you choose. */}
                        {openSlot ? (() => {
                            const def = slots.find((s) => s.slot === openSlot);
                            const worn = itemById(equipped[openSlot]);
                            const choices = def ? fitsSlot(def) : [];
                            return (
                                <div className="gv-gpick">
                                    <h5>{def?.label}</h5>
                                    {worn ? (
                                        <button type="button" className="gv-gpick-row is-worn"
                                            onClick={() => equip(openSlot, null)}>
                                            <ItemArt id={worn.id} icon={worn.icon} className="gv-gart-sm" />
                                            <span className="gv-gpick-text">
                                                <b>{worn.name}</b>
                                                <i>{worn.statsText || "—"}</i>
                                            </span>
                                            <span className="gv-gpick-off">Take off</span>
                                        </button>
                                    ) : null}
                                    {choices.length ? choices.map((c) => (
                                        <button key={c.id} type="button" className="gv-gpick-row"
                                            style={{ "--rar": RARITY_TINT[c.rarity] || "#9aa3b2" }}
                                            disabled={busy === openSlot}
                                            onClick={() => equip(openSlot, c.id)}>
                                            <ItemArt id={c.id} icon={c.icon} className="gv-gart-sm" />
                                            <span className="gv-gpick-text">
                                                <b>{c.name}</b>
                                                <i>{c.statsText || "—"}</i>
                                            </span>
                                            <span className="gv-gpick-go">Wear</span>
                                        </button>
                                    )) : (
                                        // ⚠️ AN EMPTY DRAWER SAYS WHERE THEY COME FROM. The backpack panel
                                        // already learned this: a blank list reads as broken, and the one
                                        // thing a player needs here is the sentence that turns it into a goal.
                                        <p className="gv-gear-wait">
                                            Nothing else for this slot yet. Creatures in the Grove drop gear &mdash;
                                            the deeper you are, the better it gets.
                                        </p>
                                    )}
                                </div>
                            );
                        })() : null}
                        {/* ── ⚠️ WHAT IT ADDS UP TO, ON THE SAME BOARD ───────────────────────────────
                            It was a second Area with its own name-board and icon, and that was wrong twice:
                            it pushed the numbers off a 844px phone entirely, and the only unused icon that
                            fitted was ui-tools — a pick and a hammer, which reads as mining on a panel about
                            fighting. One board instead. The totals belong directly under the loadout that
                            produces them anyway: that adjacency is the whole point, because it is what lets
                            a player WATCH damage move when they put a sword on rather than infer it.

                            ⚠️ THESE ARE st.hero, WHICH IS THE OBJECT THE SCENE IS HANDED. Not a sum of the
                            item list — that would be a second calculation of your damage, and the two would
                            disagree the first time either moved. */}
                        {hero ? (
                            <div className="gv-gtot">
                                <h5>In the fight</h5>
                                <div className="gv-gstats">
                                    {SHOWN.map(({ k, label, fmt }) => {
                                        const v = hero[k];
                                        if (v == null) return null;
                                        const shown = fmt(Number(v) || 0);
                                        return (
                                            <div key={k} className="gv-gstat">
                                                <span>{label}</span>
                                                <b>{shown}</b>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}
                    </>
                )}
            </Area>

        </div>
    );
}
