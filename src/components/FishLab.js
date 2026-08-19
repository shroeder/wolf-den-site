"use client";

import { useCallback, useEffect, useState } from "react";

import ArenaClient from "@/components/ArenaClient";
import FishingScene from "@/components/FishingScene";
import { baseState, makeBout, SCENES, YOU_SPRITE } from "@/components/arena/arena-lab-fixtures.js";
import { boatDeck } from "@/lib/marketplace/deck-lines.js";

// ── THE HAND-OFF, ON DEMAND ──────────────────────────────────────────────────────────────────────────────────
// The question this was built to answer is "what does it look like when you actually get into the encounter" —
// the seam between a cast and a fight, which is the one part of fishing nobody can look at deliberately. In the
// real game it needs a tier-4 roll out of twelve casts a day.
//
// So: the REAL FishingScene, the REAL FishingWater timings, the REAL ArenaClient, and stubs where the network
// would be. `?monster=<id>` picks what comes up and `?lag=<ms>` fakes a slow phone on both round trips — the
// two things the seam is actually made of. Nothing here re-implements a component; if the seam looks wrong in
// this lab it looks wrong in the game.
// The same member sprite the Arena lab stands on the sand — a real full-body hero, not a bust, for the same
// reason spelled out over there: composition judged against a head-and-shoulders avatar comes out wrong.
const HERO = YOU_SPRITE;

export default function FishLab({ monsters = [] }) {
    const [fight, setFight] = useState(null);
    const [monsterId, setMonsterId] = useState("kraken_young");
    const [lag, setLag] = useState(0);
    const [HAUL, setHaul] = useState(null); // ?haul=gear brings up a piece of gear instead of a monster

    // Read the address in an EFFECT, not during render — the same rule the Arena lab follows. The server has
    // no query string, so seeding state from `window` at render time renders one thing on the server and
    // another in the browser, and the mismatch is a hydration error rather than a lab.
    //
    // Nothing here is needed until a cast is landed, so arriving one tick late costs nothing.
    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        const m = q.get("monster");
        const l = Number(q.get("lag"));
        if (m && monsters.some((x) => x.id === m)) setMonsterId(m);
        if (Number.isFinite(l) && l > 0) setLag(l);
        setHaul(q.get("haul"));
    }, [monsters]);

    const monster = monsters.find((m) => m.id === monsterId) || monsters[0];
    const wait = useCallback((ms) => new Promise((r) => setTimeout(r, ms)), []);

    // ── THE STUBS ────────────────────────────────────────────────────────────────────────────────────────
    // Shaped exactly like the answers fishCast / fishLand give, because the scene branches on their fields.
    const onCast = useCallback(async ({ bait } = {}) => {
        await wait(lag);
        return { ok: true, cast: { biteAt: Date.now() + 2600, fight: "legendary", bait: bait || null } };
    }, [lag, wait]);

    // The land call is what decides a monster. It is awaited BEFORE the rise begins — the scene cannot draw
    // the thing surfacing until it knows what it is — so `lag` here is dead air on "Hauling it in…".
    const onLand = useCallback(async ({ missed } = {}) => {
        await wait(lag);
        if (missed) return { ok: true, missed: true };
        // ?haul=gear — the OTHER thing a cast can bring up. A piece of gear off the sea floor prints its stat
        // line in the haul card, and that card is only reachable by playing a cast through, so there was no
        // way to look at it. Same landed shape fishLand returns.
        // ?haul=treasure — the card that told GrayKitsune a Growth Tonic was Mythic. A consumable prize has no
        // rarity of its own, which is the whole point of the fix: nothing should be claimed about it.
        if (HAUL === "treasure") {
            return { ok: true, landed: true, catchResult: {
                treasure: true, gold: 0, xp: 12, tier: "mythic",
                prize: { kind: "consumable", label: "Growth Tonic", emoji: "🧴", id: "farm_growth_tonic",
                    where: "Added to your supplies", spriteUrl: "/images/consumables/farm_growth_tonic.png" },
            } };
        }
        if (HAUL === "gear") {
            return { ok: true, landed: true, catchResult: {
                fish: { id: "tiger_prawn", name: "Tiger Prawn", lb: 3.2 }, gold: 42, xp: 30,
                extras: [{ kind: "gear", id: "eternal_undying_wall", label: "Undying Wall", rarity: "eternal",
                    slot: "off_hand", icon: "GiCheckedShield",
                    stats: { armor: 313, block_chance: 0.39, vitality: 26, tenacity: 7, pierce: 7, lifesteal: 4, haste: 6 } }],
            } };
        }
        return { ok: true, monster: { id: monster.id, name: monster.name, art: monster.art, tier: monster.tier } };
    }, [lag, monster, wait, HAUL]);

    // And this is the second round trip: fired 1150ms later, once the rise has finished, with the fight
    // mounting only when it answers.
    const onMonster = useCallback(async () => {
        await wait(lag);
        const foe = {
            id: `fish:${monster.id}`, name: monster.name, sprite: monster.art, npc: true, fishing: true,
            level: null, color: null, element: "water", archetype: monster.archetype,
            blurb: monster.blurb, abilities: SCENES.deck.state().bout.foe.abilities,
        };
        setFight(baseState({ bout: makeBout({ fishing: true, foe, foeHp: 268, foeMaxHp: 402, hp: 131, beat: 1, log: [] }) }));
        // `lag` BELONGS in here. Without it this callback closes over the lag it was built with — zero, on
        // first render, before the effect above has read the query string — and the second round trip is
        // silently never simulated. The reel then shows a seam a good deal kinder than the real one.
    }, [lag, monster, wait]);

    return (
        <div style={{ minHeight: "100dvh", background: "#070b14" }}>
            <FishingScene
                fishing={{ casts: { left: 9, max: 12, used: 3 }, baits: [], speciesKnown: 25, speciesTotal: 34, recharge: {} }}
                sky="/images/sailing/sky-storm.png"
                boat="/images/sailing/boat-tier5-galleon.png"
                deck={boatDeck(5)}
                hero={{ art: HERO, flip: false }}
                records={null}
                gold={12500}
                onCast={onCast}
                onLand={onLand}
                onRecharge={async () => {}}
                onLoadRecords={async () => {}}
                onMonster={onMonster}
                onClose={() => {}}
            />
            {fight ? (
                <ArenaClient key={fight.bout?.foe?.id || "hooked"} initial={fight} boutOnly
                    onLeave={() => setFight(null)} />
            ) : null}
        </div>
    );
}
