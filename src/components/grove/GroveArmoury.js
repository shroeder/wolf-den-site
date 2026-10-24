"use client";

import { useMemo, useState } from "react";

import Area from "@/components/grove/GroveArea.js";
import {
    ARMOUR_PIECES, ARMOUR_SLOTS, GROVE_SETS, GROVE_SET_ORDER, setBonusFor,
} from "@/lib/marketplace/grove-forge.js";

// ── THE ARMOURY ─────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "you can make boss armor that is a set in game. Depending on the boss difficulty determines the
// rarity of the set."
//
// ⚠️ THIS IS WHERE MERITS BECOME A CURRENCY. Until now they were a number that went up. Every boss in the
// game has paid them since the day they were built and there was nothing anywhere to spend one on — a
// faucet with no sink, which is the thing half the economy notes in this repo are about.
//
// ⚠️ FORGE AND WEAR IN THE SAME TILE, ON PURPOSE. The obvious split is "craft it at the workbench, equip it
// here", and it is wrong: it makes the player hold a piece's cost in their head while they walk between two
// screens to compare it against what they are already wearing. One tile answers all three questions a piece
// ever raises — what does it give me, what does it cost, and am I wearing it.
//
// It lives on the emblems panel rather than the workbench because that panel is already the answer to "what
// am I wearing", and armour is the second thing worn rather than the second thing crafted.

/** What a set is worth when all three are on, phrased the way the tiles phrase everything else. */
const STAT_LABEL = {
    might: "Might", vitality: "Vitality", armour: "Armour", crit_rate: "Crit",
    crit_damage: "Crit dmg", life_steal: "Lifesteal", attack_speed: "Atk speed",
    move_speed: "Move", rarity_find: "Rarity find",
};
const PCT = new Set(["crit_rate", "crit_damage", "life_steal", "attack_speed", "move_speed", "rarity_find"]);
const statLine = (k, v) => `${STAT_LABEL[k] || k} +${v}${PCT.has(k) ? "%" : ""}`;

export default function GroveArmoury({ st, partName, PartIcon, post, refresh, setNote }) {
    const [busy, setBusy] = useState(null);

    const owned = useMemo(() => new Set(st.armour?.owned || []), [st.armour?.owned]);
    const worn = st.armour?.worn || {};
    const wornSet = useMemo(() => new Set(Object.values(worn)), [worn]);
    const merits = Number(st.merits) || 0;
    const pack = st.pack || {};

    const forge = async (piece) => {
        setBusy(piece.id);
        const d = await post({ action: "forgeArmour", piece: piece.id });
        setBusy(null);
        if (!d?.ok) {
            setNote(d?.error === "not_enough_merits" ? "Not enough merits for that."
                : d?.error === "not_enough_parts" ? "Not enough parts for that."
                : d?.error === "already_made" ? "You already forged that one."
                : "Couldn't forge that.");
            return;
        }
        setNote(`${d.piece.name} forged.`);
        await refresh();
    };

    const wear = async (piece) => {
        setBusy(piece.id);
        const d = await post({ action: "wearArmour", piece: piece.id });
        setBusy(null);
        if (!d?.ok) { setNote("Couldn't do that."); return; }
        await refresh();
    };

    return (
        <Area id="armoury" icon="ui-vault" title="Boss Armour" count={`${merits} merits`}>
            {/* ── THE CURRENCY HAS A FACE NOW ────────────────────────────────────────────────────
                Luke: "Use sprites for merit and all things in the grove." It was a word beside a number,
                which is what the arena's laurels were before they were drawn — and the note there is
                right: the currencies people talk about are the ones with a face. Struck bronze gone
                verdigris with an antler raised on it, so it cannot be confused with gold's warm coin in
                a row of numbers. */}
            <p className="gv-arm-purse">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/grove/ui-merit.webp" alt="" width={26} height={26} />
                <b>{merits.toLocaleString()}</b><span>merits</span>
            </p>
            {/* ⚠️ NO CAPTION HERE EITHER. "Won from bosses. Three pieces to a set, and the set pays
                more than its parts." — where the merits are spent is the header's own count, the three
                pieces are three drawn slots, and the set bonus is printed on the set. See the note in
                GroveClient's emblem panel. */
}

            {GROVE_SET_ORDER.map((setId) => {
                const set = GROVE_SETS[setId];
                const pieces = ARMOUR_PIECES.filter((p) => p.setId === setId);
                const wornHere = pieces.filter((p) => wornSet.has(p.id)).length;
                const complete = wornHere >= ARMOUR_SLOTS.length;
                return (
                    <section key={setId} className={`gv-arm-set is-${setId}${complete ? " is-complete" : ""}`}>
                        <header>
                            <b>{set.name}</b>
                            <em>{setId}</em>
                            <span>zones {set.zones[0]}&ndash;{set.zones[1]}</span>
                            <u>{wornHere}/{ARMOUR_SLOTS.length}</u>
                        </header>

                        <div className="gv-arm-row">
                            {pieces.map((piece) => {
                                const have = owned.has(piece.id);
                                const on = wornSet.has(piece.id);
                                // What is still missing, counted from the bag the forge actually spends.
                                const short = piece.parts
                                    .map((r) => ({ ...r, missing: Math.max(0, r.n - (Number(pack[r.part]) || 0)) }))
                                    .filter((r) => r.missing > 0);
                                const canPay = merits >= piece.merits && !short.length;
                                return (
                                    <div key={piece.id}
                                        className={`gv-arm-piece${on ? " is-on" : ""}${have ? " is-have" : ""}`}>
                                        {/* ⚠️ THE PIECE, DRAWN. Fifteen rows of stat text with no picture
                                            was the one shelf in the Grove with nothing to look at, next to
                                            a tool ladder carrying 156 sprites. Luke: "Use sprites for merit
                                            and all things in the grove." */}
                                        <span className="gv-arm-face">
                                            {piece.art ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={piece.art} alt="" width={52} height={52} loading="lazy" />
                                            ) : null}
                                        </span>
                                        <b>{piece.name.replace(`${set.name} `, "")}</b>
                                        <ul>
                                            {Object.entries(piece.stats).map(([k, v]) => (
                                                <li key={k}>{statLine(k, v)}</li>
                                            ))}
                                        </ul>

                                        {have ? (
                                            <button type="button" disabled={busy === piece.id}
                                                className={`gv-arm-go${on ? " is-off" : ""}`}
                                                onClick={() => wear(piece)}>
                                                {on ? "Take off" : "Wear"}
                                            </button>
                                        ) : (
                                            <>
                                                {/* The cost, always visible -- a price you have to press a
                                                    button to discover is a price you cannot plan around. */}
                                                <span className="gv-arm-cost">
                                                    <i className={merits >= piece.merits ? "" : "is-short"}>
                                                        {piece.merits} merits
                                                    </i>
                                                    {piece.parts.map((r) => {
                                                        const miss = short.find((x) => x.part === r.part);
                                                        return (
                                                            <i key={r.part} className={miss ? "is-short" : ""}>
                                                                <PartIcon id={r.part} size={16} />
                                                                {r.n} {partName(r.part)}
                                                            </i>
                                                        );
                                                    })}
                                                </span>
                                                <button type="button" className="gv-arm-go"
                                                    disabled={!canPay || busy === piece.id}
                                                    onClick={() => forge(piece)}>
                                                    {busy === piece.id ? "…" : canPay ? "Forge" : "Short"}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* ⚠️ THE SET BONUS IS SHOWN WHETHER OR NOT IT IS ACTIVE. A reward only visible once
                            you have already earned it cannot be the reason anybody earns it. */}
                        <p className={`gv-arm-bonus${complete ? " is-on" : ""}`}>
                            <b>All three:</b>{" "}
                            {Object.entries(setBonusFor(setId)).map(([k, v]) => statLine(k, v)).join(" · ")}
                        </p>
                    </section>
                );
            })}
        </Area>
    );
}
