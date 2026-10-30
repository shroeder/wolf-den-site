"use client";

import { useEffect } from "react";

import { GROVE_ENEMIES, GROVE_ZONES, partSources, emblemArt } from "@/lib/marketplace/grove-catalog.js";
import { recipesUsing } from "@/lib/marketplace/grove-recipes.js";

// ── WHAT IS THIS, WHERE DID IT COME FROM, AND WHAT IS IT FOR ────────────────────────────────────────────────
// Luke: "there has to be some linkage between your inventory and crafting, kind of like how cooking does it,
// where you can see all the ingredients and bounce between linked ingredients and stuff. We have to create
// some kind of connection to easily traverse between inventory and crafting."
//
// Cooking's version of that is a recipe row whose missing ingredient jumps to the recipe that MAKES it, with
// a breadcrumb back. The Grove cannot copy it move for move, because a Grove part is not made by anything —
// it is cut off a creature. So the jump has two destinations instead of one, and this sheet is both:
//
//   BACKWARDS, to where it drops: which creatures carry it and which zones those creatures live in.
//   FORWARDS, to what it becomes: every recipe that wants it, and a tap to land on that row at the bench.
//
// ⚠️ IT OPENS FROM THE BAG, WHICH IS THE HALF OF THE LOOP THAT HAD NO ANSWER. The bench is a list of
// recipes, so "what does this recipe need" was always free. Standing over twenty kinds of bone and moss with
// nothing on any screen saying which were worth keeping is the direction that was missing, and it is the
// direction a player is facing when they are deciding whether to walk back for one more.
//
// ⚠️ THE BAG CELLS WERE INERT SPANS AND THAT WAS CORRECT AT THE TIME — their only job had been tap-to-bank
// and the bank is gone, so they were demoted from buttons on purpose ("a control that looks pressable and
// does nothing is worse than a label"). They are buttons again now because there is finally something
// behind them. That is the test, not whether a tap is available.

/** A creature, named, with the amulet the game already draws for it. */
function Creature({ id }) {
    const e = GROVE_ENEMIES[id];
    if (!e) return null;                       // an unbuilt map's enemy; see partSources
    const art = emblemArt(e.emblem);
    return (
        <li className="gv-pv-foe">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {art ? <img src={art} alt="" width={30} height={30} loading="lazy" /> : null}
            <b>{e.name}</b>
        </li>
    );
}

export default function GrovePartSheet({
    part, have = 0, wished = false, partName, PartIcon,
    onToggleWish = () => {}, onGoRecipe = () => {}, onClose = () => {},
}) {
    // Escape closes it. A sheet that can only be dismissed by hitting a specific pixel is a sheet people
    // get stuck in, and this one is reachable by accident from any cell in the bag.
    useEffect(() => {
        const k = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", k);
        return () => window.removeEventListener("keydown", k);
    }, [onClose]);

    const { enemies, zones } = partSources(part);
    const uses = recipesUsing(part);
    const zoneNames = zones.map((z) => GROVE_ZONES.find((x) => x.id === z)?.name).filter(Boolean);

    return (
        <div className="gv-pv" role="dialog" aria-label={partName(part)} onClick={onClose}>
            <div className="gv-pv-card" onClick={(e) => e.stopPropagation()}>
                <div className="gv-pv-head">
                    <span className="gv-pv-face"><PartIcon id={part} size={54} /></span>
                    <div>
                        <b>{partName(part)}</b>
                        {/* The count is the reason the sheet is worth opening at all: every number below
                            is read against it. */}
                        <i>{have} in your bag</i>
                    </div>
                    <button type="button" className="gv-pv-x" onClick={onClose} aria-label="Close">×</button>
                </div>

                {/* ── WHERE IT COMES FROM ──────────────────────────────────────────────────────────
                    ⚠️ ONLY WALKABLE ZONES. partSources reads zones off GROVE_ZONES, which excludes
                    unbuilt maps, so this cannot send anyone toward a forest that does not exist yet. */}
                {enemies.length ? (
                    <section className="gv-pv-sec">
                        <h5>Cut from</h5>
                        <ul className="gv-pv-foes">
                            {enemies.map((id) => <Creature key={id} id={id} />)}
                        </ul>
                        {zoneNames.length ? <p className="gv-pv-where">{zoneNames.join(" · ")}</p> : null}
                    </section>
                ) : null}

                {/* ── WHAT IT IS FOR ───────────────────────────────────────────────────────────────
                    check-grove.mjs already guarantees every part is wanted by at least one recipe
                    ("a part that drops and does nothing is litter in a sixteen-slot bag"), so an
                    empty list here would be a bug in the catalogue rather than a state to design for
                    — but it still renders as nothing rather than as an empty heading. */}
                {uses.length ? (
                    <section className="gv-pv-sec">
                        <h5>Goes into</h5>
                        <ul className="gv-pv-uses">
                            {uses.map((u) => {
                                // Enough of them, right now, for this one recipe. Not "can you craft it"
                                // — that needs every other part too, and the bench says so on its own
                                // row. This answers the narrower question the player asked by opening a
                                // single part: is what I am carrying enough for this line of it.
                                const enough = have >= u.need;
                                return (
                                    <li key={u.id}>
                                        <button type="button" onClick={() => onGoRecipe(u.id)}
                                            title={`Go to ${u.name} at the workbench`}>
                                            <b>{u.name}</b>
                                            <em className={enough ? "is-have" : "is-short"}>
                                                {Math.min(have, u.need)}/{u.need}
                                            </em>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ) : null}

                {/* The same wishlist this part already had on the bench, offered where a player is
                    actually looking at the part. One list, two doors — not a second mechanism. */}
                <button type="button" className={`gv-pv-wish${wished ? " is-on" : ""}`}
                    aria-pressed={wished} onClick={() => onToggleWish(part)}>
                    {wished ? "On your list" : "Put it on your list"}
                </button>
            </div>
        </div>
    );
}
