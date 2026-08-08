"use client";

import { useState } from "react";

import ShipBattleScene from "@/components/ShipBattleScene";
import ShipYard from "@/components/ShipYard";
import { fleetDeck, boatDeck } from "@/lib/marketplace/deck-lines.js";
import { fleetGunPorts, boatGunPorts } from "@/lib/marketplace/gun-ports.js";
import { shipProfile, foeProfile, initBattleState, resolveVolley, AMMO_LIST, SAILS_MAX, GUN_HP, MAX_ROUNDS } from "@/lib/marketplace/ship-battle.js";
import { ZONE_LIST, zonesOn, zoneKeyFromArt } from "@/lib/marketplace/ship-zones.js";
import { FLEET, fleetView, fleetArt, fleetCaptain } from "@/lib/marketplace/fleet.js";

// Dev-only lab for the ship battle. The real thing is behind a login, a daily sortie limit and a gun deck you
// have to buy, so judging the scene by playing it costs a sortie and can only ever show the one matchup your
// own ship happens to produce. Here every rank is one tap, and the sim is the REAL one — the fight you watch
// is the fight the server would have run.

const BUILDS = {
    fresh: { label: "Fresh boat", boatLevel: 5, gunLevel: 0, gunneryLevel: 0, hullLevel: 0 },
    mid: { label: "Mid (4/4/4)", boatLevel: 25, gunLevel: 4, gunneryLevel: 4, hullLevel: 4 },
    late: { label: "Late (8/8/8)", boatLevel: 37, gunLevel: 8, gunneryLevel: 8, hullLevel: 8 },
};

export default function BattleLab() {
    const [build, setBuild] = useState("mid");
    const [ammo, setAmmo] = useState("round");
    const [battle, setBattle] = useState(null);

    const [live, setLive] = useState(null); // { me, foe, state, meta }

    // The scene reads exactly what the server would have sent it, so what the lab shows is what a real
    // fight shows — including which zones each hull owns and what is left in the racks.
    const view = (st, meta, events, over, win, sunk, reward) => ({
        kind: "fleet", rank: meta.rank, first: true, me: meta.me, foe: meta.foe,
        // The same number the server sends, so the odds on every marker are the odds in the dice.
        myAccuracy: meta.acc ?? 0.7,
        myHp: st.me.hp, foeHp: st.foe.hp, myMax: st.me.max, foeMax: st.foe.max,
        round: st.round, maxRounds: MAX_ROUNDS, gauge: st.gauge,
        sys: {
            me: { sails: st.me.sails, guns: st.me.guns },
            foe: { sails: st.foe.sails, guns: st.foe.guns },
        },
        caps: { sails: SAILS_MAX, gun: GUN_HP },
        zones: {
            me: zonesOn(zoneKeyFromArt(meta.me.art, meta.me.level)),
            foe: zonesOn(zoneKeyFromArt(meta.foe.art, meta.foe.level)),
        },
        zoneInfo: ZONE_LIST.map((z) => ({ id: z.id, name: z.name, icon: z.icon, tint: z.tint, blurb: z.blurb })),
        // The lab is not short of powder: exotics are stocked so every round can be tried against every zone.
        rack: AMMO_LIST.map((a) => ({ id: a.id, name: a.name, icon: a.icon, basic: a.basic, count: a.basic ? null : 99 })),
        loadout: ammo,
        events: events || [], over: Boolean(over), win, sunk, reward,
    });

    const fight = (rank) => {
        const ship = FLEET.find((f) => f.rank === rank);
        const meP = shipProfile({ ...BUILDS[build], ammo, name: "Your ship", art: "/images/sailing/boat-tier5-galleon.png" });
        const foeP = foeProfile(ship);
        const meta = {
            rank, acc: meP.accuracy,
            me: { name: meP.name, art: meP.art, guns: meP.guns, hp: meP.hp, ammo: meP.ammo.id, level: meP.boatLevel,
                  // A player's own rider is their hero sprite, which lives in the DB and has no file on disk. The
                  // lab borrows an arena NPC so the deck holds a real character sprite at real proportions —
                  // a UI glyph here would make the lab useless for judging how the crew sits on the boat.
                  rider: "/images/arena/npc/veteran.webp", riderFlip: false, pet: null,
                  deck: boatDeck(5), ports: boatGunPorts(5, meP.guns) },
            foe: { name: foeP.name, cls: ship.cls, art: fleetArt(ship), guns: foeP.guns, hp: foeP.hp,
                   ammo: foeP.ammo.id, boss: Boolean(ship.boss), flavor: ship.flavor, mirror: false,
                   rider: fleetCaptain(ship), riderFlip: false,
                   deck: fleetDeck(ship.art), ports: fleetGunPorts(ship.art, foeP.guns) },
        };
        const st = initBattleState(meP, foeP);
        setLive({ me: meP, foe: foeP, state: st, meta });
        setBattle(view(st, meta, [], false));
    };

    const volley = (aim) => {
        if (!live) return;
        const r = resolveVolley(live.me, live.foe, live.state, aim);
        setLive((l) => ({ ...l, state: r.state }));
        setBattle(view(r.state, live.meta, r.events, r.over, r.win, r.sunk,
            r.over && r.win ? [{ kind: "doubloons", n: 14 }, { kind: "gold", n: 320 }] : []));
    };

    // The yard against fixture state, so the gun deck and the ladder can be looked at without a database.
    const combat = {
        doubloons: 240,
        ship: { guns: 11, accuracy: 79, hp: 320, armor: 14, boatLevel: 25 },
        tracks: [
            { key: "guns", name: "Cannons", icon: "GiCannon", desc: "More barrels in the broadside — every gun is another roll to hit.", level: 4, max: 8, maxed: false, cost: 66 },
            { key: "gunnery", name: "Gunnery", icon: "GiTargeting", desc: "A drilled crew lays the guns truer — better accuracy, and more raking hits.", level: 4, max: 8, maxed: false, cost: 66 },
            { key: "hull", name: "Hull", icon: "GiShipWheel", desc: "Oak and iron plate — more hit points, and every ball that lands hurts less.", level: 8, max: 8, maxed: true, cost: null },
        ],
        // STRAIGHT OFF THE REAL TABLE. This was a hand-typed copy and it had drifted — old prices, and blurbs
        // still describing fires and rigging damage that no longer exist. A lab that lies is worse than no lab.
        ammo: AMMO_LIST.map((a) => ({
            id: a.id, name: a.name, icon: a.icon, blurb: a.blurb, basic: a.basic, price: a.price,
            count: a.basic ? null : 8, loaded: ammo === a.id,
        })),
        loadout: ammo,
        fleet: { depth: 6, best: 6, max: FLEET.length, wins: 9, losses: 3, cleared: false, ships: fleetView(6) },
    };

    return (
        <div className="stack">
            <section className="card">
                <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Ship battle lab</h1>
                <p className="muted" style={{ margin: "4px 0 10px", fontSize: "0.85rem" }}>
                    Dev only. The real sim, every rank one tap.
                </p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {Object.entries(BUILDS).map(([k, b]) => (
                        <button key={k} type="button" className={`sby-mini${build === k ? " is-load" : ""}`} onClick={() => setBuild(k)}>{b.label}</button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    {["round", "chain", "grape", "explosive"].map((a) => (
                        <button key={a} type="button" className={`sby-mini${ammo === a ? " is-load" : ""}`} onClick={() => setAmmo(a)}>{a}</button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {FLEET.map((f) => (
                        <button key={f.rank} type="button" className="sby-mini" onClick={() => fight(f.rank)}>
                            {f.rank}{f.boss ? "★" : ""}
                        </button>
                    ))}
                </div>
            </section>

            <ShipYard combat={combat} raid={{ cap: 5, used: 1 }} gold={12000} busy={false} onAct={({ action, rank }) => { if (action === "fleet_battle") fight(rank); }} />

            {battle ? <ShipBattleScene battle={battle} busy={false} onVolley={volley} onClose={() => { setBattle(null); setLive(null); }} /> : null}
        </div>
    );
}
