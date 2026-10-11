"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import GroveScene from "@/components/grove/GroveScene.js";
import { GROVE_CSS } from "@/components/grove/grove-css.js";
import { GROVE_ZONES } from "@/lib/marketplace/grove-catalog.js";

// ── THE GROVE, ON A BENCH ────────────────────────────────────────────────────────────────────────────────────
// Mounts the REAL scene against a fixture session. No database, no auth, no owner gate — and no cost to
// walking into the same first 400ms thirty times in a row, which is what tuning game feel actually consists of.
//
// ⚠️ SPRITES ARE REAL URLS, NOT PLACEHOLDER BOXES. The whole question here is how a drawn sprite SITS on a
// drawn floor at a given scale, so a grey rectangle would answer a different question convincingly. These are
// real hero/pet sprites off the blob store the game already serves.
//
// ⚠️ THE SCENES WERE BEING PASSED AND IGNORED. labScene has been a prop since this file was written and
// GroveScene never read it, so "fight", "boss" and "loot" all played the wander scene — a bench built to
// make rare moments happen on demand could only ever show the one moment that happens anyway. That is how a
// 380ms transition on a transform survived: the first 400ms of a spawn was never filmed, because there was
// no way to film anything but a spawn. The setup now lives in GroveScene (setUpLabScene), because what makes
// a fight happen in the first second is the hero standing NEXT TO something, which is a fact about the world
// rather than a prop.
//
// Scenes:
//   wander  the resting zone — spawn, idle, wander, hop. What the opening frames look like.
//   fight   a foe either side of the hero, both already awake, so a swing lands in the first second and
//           both facings are exercised in one shot.
//   loot    three foes on one hit point each: the kill, the spill, the rest, the name and the draw-in all
//           inside about three seconds.
//   boss    the boss standing at reach with its bar up, for the telegraphs and the chase lerp.
//   climb   the hero pointed at the zone's highest ledge. Nothing about ordinary play reliably produces a
//           three-tier climb within a few seconds of film, and climbing is the half of the zone that until
//           now did not work at all.
const HERO = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/1789189247101-37705.webp";
const PET = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/1788751846210-628644.webp";
// ⚠️ ONE OBJECT, NOT A FRESH LITERAL PER RENDER. It is a dependency of the scene's world useMemo, so an
// inline {} rebuilds the entire zone on every render of this component.
const NO_BONUSES = {};
const LAB_BELT = { id: "food_poultice", name: "Moss Poultice", count: 5, heals: 0.25 };

export default function GroveLab({ scene = "wander", zoneN = 1 }) {
    // ── ⚠️ THE LOG IS A REF, AND EVERY HANDLER BELOW IS STABLE. THIS WAS TEARING THE LOOP DOWN ─────
    // The bench used to pass `bonuses={{}}` and a fresh inline arrow for every callback, so each render
    // handed GroveScene new identities — and the scene's loop effect lists onSettle among its
    // dependencies while its world useMemo lists bonuses. So a single setLog, fired by any event worth
    // logging, rebuilt the world and restarted the loop: the hero snapped back, the population respawned,
    // and anything the loop was accumulating went to zero.
    //
    // It is the bench rather than the game, and it still matters: it hid a genuine pause/resume result
    // behind a world that was being replaced underneath the test. The log is written to a ref and painted
    // into a node by hand, so nothing here re-renders at all.
    const logRef = useRef([]);
    const logNode = useRef(null);
    const say = useCallback((line) => {
        logRef.current = [...logRef.current, line];
        if (logNode.current) logNode.current.textContent = logRef.current.join(" | ");
    }, []);
    // Where a gate has taken us, overriding the zone in the URL once one is walked through.
    const [travelled, setTravelled] = useState(null);
    const [panel, setPanel] = useState(null);
    // ⚠️ bossReady, OR THE BOSS SCENE IS EMPTY. The real client sets that flag from the server (the zone
    // must be cleared and the cooldown elapsed); without it the spawn pass skips the boss entirely and the
    // boss scene films a rootrat.
    const zone = useMemo(() => {
        const n = travelled || zoneN;
        const z = GROVE_ZONES.find((x) => x.n === n) || GROVE_ZONES[0];
        // ⚠️ AND A BANKED KILL COUNT FOR THE DOOR SCENES, or the best beat in the zone is unfilmable.
        // The way on opens at toUnlock, which is 25 kills in zone two — forty seconds of film in which
        // nothing happens and then one thing does. "door" stands at the threshold so the gate is sealed
        // with its toll showing; "unlock" is one kill short, so the very next thing that dies opens it.
        // "travel" banks the full toll, so the gate is already open and the only thing left to film is
        // what walking through one looks like.
        const banked = scene === "travel" ? z.toUnlock
            : scene === "unlock" ? Math.max(0, z.toUnlock - 1)
            : scene === "door" ? Math.max(0, z.toUnlock - 7)
            : 0;
        return { ...z, bossReady: true, kills: banked };
    }, [zoneN, scene, travelled]);

    // A fixed seed so two runs of the film rig produce the same zone and a diff means a real change.
    const seed = 424242;

    // Deliberately a mid-game kit rather than a fresh one: a hero who cannot kill anything films thirty
    // seconds of nothing, and a hero who one-shots everything never shows a health bar draining.
    const stats = useMemo(() => ({
        maxHp: 600, power: scene === "loot" ? 9999 : 34, critRate: scene === "fight" ? 50 : 22,
        critDamage: 70, attackSpeed: 10, armour: 20,
        // ⚠️ NO LIFESTEAL AND NO ARMOUR IN THE DEATH SCENE. Four percent of a 34-power swing every 400ms
        // out-heals anything a zone-three creature does to you, so the hero stood among three of them
        // getting healthier. The one scene about dying has to be the one scene that cannot win.
        lifeSteal: scene === "death" ? 0 : 4,
    }), [scene]);

    const onTravelLab = useCallback((n) => { say(`travel ${n}`); setTravelled(n); }, [say]);
    const onSettleLab = useCallback((batch) => say(`settle ${batch.length}`), [say]);
    const onPanelLab = useCallback((k) => { say(`panel ${k}`); setPanel(k); }, [say]);
    const onBossLab = useCallback(() => say("boss"), [say]);
    const onLeaveLab = useCallback(() => say("leave"), [say]);
    const onDeathLab = useCallback(() => say("death"), [say]);

    return (
        <>
            <style jsx global>{GROVE_CSS}</style>
            {panel ? (
                <div className="gv-zsheet">
                    <button type="button" className="gv-zsheet-x" aria-label="Back to the zone"
                        onClick={() => setPanel(null)}>x</button>
                    <p className="muted" style={{ textAlign: "center" }}>bench stand-in for the {panel} panel</p>
                </div>
            ) : null}
            <GroveScene
                key={scene + zoneN}
                zone={zone}
                seed={seed}
                bonuses={NO_BONUSES}
                stats={stats}
                heroArt={HERO}
                petArt={PET}
                belt={LAB_BELT}
                labScene={scene}
                // ⚠️ THE LAB TRAVELS FOR REAL, or the transition cannot be filmed at all. onTravel was
                // simply absent here, so tapping a gate on the bench did nothing and the one moment the
                // door exists to deliver was the one moment unreviewable. No server: it swaps the zone
                // prop, which is exactly what the client does with the response.
                onTravel={onTravelLab}
                onSettle={onSettleLab}
                // ⚠️ THE DOCK ONLY RENDERS IF SOMETHING IS LISTENING, so the bench has to listen or the
                // one in-zone control added since the lab was written is the one that cannot be filmed.
                // The panel itself belongs to GroveClient; what this stands in for is the HANDOFF — the
                // button opens, the zone freezes, the close button puts it back.
                onPanel={onPanelLab}
                paused={panel !== null}
                onBoss={onBossLab}
                onLeave={onLeaveLab}
                onDeath={onDeathLab}
            />
            {/* Off-screen, so it never lands in a frame of film but is still readable with --eval. */}
            <b data-lab-log ref={logNode} style={{ position: "fixed", left: -9999, top: -9999 }} />
        </>
    );
}
