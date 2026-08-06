"use client";

import { useState } from "react";

import ShipBattleScene from "@/components/ShipBattleScene";
import ShipYard from "@/components/ShipYard";
import { shipProfile, foeProfile, simulateShipBattle } from "@/lib/marketplace/ship-battle.js";
import { FLEET, fleetView, fleetArt } from "@/lib/marketplace/fleet.js";

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

    const fight = (rank) => {
        const ship = FLEET.find((f) => f.rank === rank);
        const me = shipProfile({ ...BUILDS[build], ammo, name: "Your ship", art: "/images/sailing/boat-tier5-galleon.png" });
        const foe = foeProfile(ship);
        const sim = simulateShipBattle(me, foe);
        setBattle({
            kind: "fleet", rank, first: true, win: sim.win, sunk: sim.sunk,
            me: { name: me.name, art: me.art, guns: me.guns, hp: me.hp, ammo: me.ammo.id, level: me.boatLevel },
            foe: { name: foe.name, cls: ship.cls, art: fleetArt(ship), guns: foe.guns, hp: foe.hp, ammo: foe.ammo.id,
                   boss: Boolean(ship.boss), flavor: ship.flavor },
            events: sim.events, myMax: sim.myMax, foeMax: sim.foeMax, myHp: sim.myHp, foeHp: sim.foeHp,
            reward: sim.win ? [{ kind: "doubloons", n: 12 }, { kind: "gold", n: 340 }, { kind: "parts", n: 2, tier: 3 }] : [],
        });
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
        ammo: [
            { id: "round", name: "Round Shot", icon: "GiCannonBall", blurb: "Solid iron. No tricks, no waste — and you never run out.", basic: true, price: 0, count: null, loaded: ammo === "round" },
            { id: "chain", name: "Chain Shot", icon: "GiChainedHeart", blurb: "Two balls on a chain, tumbling through the rigging.", basic: false, price: 12, count: 8, loaded: ammo === "chain" },
            { id: "grape", name: "Grapeshot", icon: "GiCannonShot", blurb: "Murder on a light hull, useless against armour.", basic: false, price: 14, count: 0, loaded: ammo === "grape" },
            { id: "explosive", name: "Explosive Shell", icon: "GiBurningEmbers", blurb: "Wild off the muzzle, but what lands starts a fire.", basic: false, price: 22, count: 3, loaded: ammo === "explosive" },
        ],
        loadout: ammo,
        fleet: { depth: 6, best: 6, max: FLEET.length, wins: 9, losses: 3, cleared: false, sortiesLeft: 3, sortiesMax: 3, ships: fleetView(6) },
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

            <ShipYard combat={combat} busy={false} onAct={({ action, rank }) => { if (action === "fleet_battle") fight(rank); }} />

            {battle ? <ShipBattleScene battle={battle} onClose={() => setBattle(null)} /> : null}
        </div>
    );
}
