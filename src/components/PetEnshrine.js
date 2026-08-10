"use client";

import { useState } from "react";

import PetArt from "@/components/PetArt";

// ── THE ENSHRINING ───────────────────────────────────────────────────────────────────────────────────────────
// The panel under a pet that has reached level 6. It has one job and it is not "let you press a button": it is
// to make an IRREVERSIBLE choice legible before it is made.
//
// So both forms are drawn, side by side, at size, before you pick. The sprites are the most convincing thing
// about either stone and they cost nothing to show — and a permanent decision made from two lines of text is a
// decision somebody regrets and then tells you about.
//
// It also draws the state where you have NEITHER stone, which is the common one: a level-6 pet standing there
// waiting is the whole reason to go and dig. That case says where stones come from rather than just greying
// out, because a locked button that will not say what unlocks it is the worst thing on any screen.
export default function PetEnshrine({ pet, level, sprites, stones, enshrined, prices, onEnshrine, busy = false }) {
    const [picked, setPicked] = useState(null);
    const [confirming, setConfirming] = useState(false);

    const STONE_META = {
        light: {
            name: "Lightstone", kick: "Breadth", color: "#ffe08a",
            line: "Keeps the ability exactly as it is — and every pet you own gives +12% more of its passive.",
            best: "Better the bigger your pack.",
        },
        dark: {
            name: "Darkstone", kick: "Depth", color: "#b061ff",
            line: "Keeps the ability and raises it to 150% — the strongest a pet ability gets.",
            best: "Better the better the ability.",
        },
    };

    // ── ALREADY DONE ── the pet wears its stone, and the ability is running whether it is equipped or not.
    if (enshrined) {
        const m = STONE_META[enshrined] || STONE_META.light;
        return (
            <div className="pens pens-done" style={{ "--stone": m.color }}>
                <div className="pens-done-art">
                    <PetArt id={pet.id} url={sprites?.[enshrined]?.url} flip={sprites?.[enshrined]?.flip} />
                </div>
                <div className="pens-done-body">
                    <span className="pens-kick">Enshrined · {m.name}</span>
                    <b className="pens-done-h">Its ability is yours for good</b>
                    <p className="pens-done-p">
                        {pet.name}&rsquo;s ability runs whether it is equipped or not. Put something else out —
                        it keeps working.
                    </p>
                </div>
            </div>
        );
    }

    // ── NOT THERE YET ── nothing to offer, and saying so plainly beats a greyed-out button.
    if (level < 6) return null;

    const held = { light: Number(stones?.light) || 0, dark: Number(stones?.dark) || 0 };
    const any = held.light > 0 || held.dark > 0;

    return (
        <div className="pens">
            <div className="pens-head">
                <span className="pens-kick">Level six</span>
                <b className="pens-h">Enshrine {pet.name}</b>
                <p className="pens-p">
                    Spend a stone and this ability becomes permanent — it works whether {pet.name} is equipped or
                    not. You will never have to swap back for it again. <b>The choice of stone is forever.</b>
                </p>
            </div>

            <div className="pens-stones">
                {["light", "dark"].map((id) => {
                    const m = STONE_META[id];
                    const have = held[id];
                    const on = picked === id;
                    return (
                        <button
                            key={id}
                            type="button"
                            className={`pens-stone${on ? " is-on" : ""}${have ? "" : " is-empty"}`}
                            style={{ "--stone": m.color }}
                            onClick={() => { setPicked(on ? null : id); setConfirming(false); }}
                        >
                            {/* THE FORM ITSELF, not a swatch. This is the argument. */}
                            <span className="pens-form">
                                <PetArt id={pet.id} url={sprites?.[id]?.url} flip={sprites?.[id]?.flip} />
                            </span>
                            <span className="pens-stone-kick">{m.kick}</span>
                            <b className="pens-stone-name">{m.name}</b>
                            <span className="pens-stone-line">{m.line}</span>
                            <em className="pens-stone-best">{m.best}</em>
                            <span className={`pens-stone-have${have ? "" : " is-none"}`}>
                                {have ? `${have} in hand` : "none in hand"}
                            </span>
                        </button>
                    );
                })}
            </div>

            {picked && held[picked] > 0 ? (
                <div className="pens-go">
                    {confirming ? (
                        <>
                            <p className="pens-warn">
                                {STONE_META[picked].name} on {pet.name}, permanently. This cannot be undone or
                                changed later.
                            </p>
                            <div className="pens-go-row">
                                <button type="button" className="pens-back" onClick={() => setConfirming(false)}>
                                    Wait
                                </button>
                                <button
                                    type="button"
                                    className="pens-do"
                                    style={{ "--stone": STONE_META[picked].color }}
                                    disabled={busy}
                                    onClick={() => onEnshrine?.(picked)}
                                >
                                    {busy ? "Enshrining…" : `Enshrine with the ${STONE_META[picked].name}`}
                                </button>
                            </div>
                        </>
                    ) : (
                        <button
                            type="button"
                            className="pens-do"
                            style={{ "--stone": STONE_META[picked].color }}
                            onClick={() => setConfirming(true)}
                        >
                            Use the {STONE_META[picked].name}
                        </button>
                    )}
                </div>
            ) : picked ? (
                <p className="pens-none">
                    You have no {STONE_META[picked].name}. They turn up in a deep seam, on a dig, off a boss kill
                    and in the dungeons — or the Quartermaster takes {(prices?.doubloons || 900).toLocaleString()} doubloons
                    and the Armoury takes {(prices?.laurels || 6000).toLocaleString()} laurels for one.
                </p>
            ) : !any ? (
                <p className="pens-none">
                    {pet.name} is ready and you have no stones. They turn up in a deep seam, on a dig, off a boss
                    kill and in the dungeons — or buy one for {(prices?.doubloons || 900).toLocaleString()} doubloons
                    at the Quartermaster, or {(prices?.laurels || 6000).toLocaleString()} laurels at the Armoury.
                </p>
            ) : (
                <p className="pens-none">Pick a stone to see what it does.</p>
            )}
        </div>
    );
}
