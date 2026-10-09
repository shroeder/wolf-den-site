"use client";

import { useMemo, useState } from "react";

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

export default function GroveLab({ scene = "wander", zoneN = 1 }) {
    const [log, setLog] = useState([]);
    // ⚠️ bossReady, OR THE BOSS SCENE IS EMPTY. The real client sets that flag from the server (the zone
    // must be cleared and the cooldown elapsed); without it the spawn pass skips the boss entirely and the
    // boss scene films a rootrat.
    const zone = useMemo(() => {
        const z = GROVE_ZONES.find((x) => x.n === zoneN) || GROVE_ZONES[0];
        return { ...z, bossReady: true };
    }, [zoneN]);

    // A fixed seed so two runs of the film rig produce the same zone and a diff means a real change.
    const seed = 424242;

    // Deliberately a mid-game kit rather than a fresh one: a hero who cannot kill anything films thirty
    // seconds of nothing, and a hero who one-shots everything never shows a health bar draining.
    const stats = useMemo(() => ({
        maxHp: 600, power: scene === "loot" ? 9999 : 34, critRate: scene === "fight" ? 50 : 22,
        critDamage: 70, lifeSteal: 4, attackSpeed: 10, armour: 20,
    }), [scene]);

    return (
        <>
            <style jsx global>{GROVE_CSS}</style>
            <GroveScene
                key={scene + zoneN}
                zone={zone}
                seed={seed}
                bonuses={{}}
                stats={stats}
                heroArt={HERO}
                petArt={PET}
                belt={{ id: "food_poultice", name: "Moss Poultice", count: 5, heals: 0.25 }}
                labScene={scene}
                onSettle={(batch) => setLog((l) => [...l, `settle ${batch.length}`])}
                onBoss={() => setLog((l) => [...l, "boss"])}
                onLeave={() => setLog((l) => [...l, "leave"])}
                onDeath={() => setLog((l) => [...l, "death"])}
            />
            {/* Off-screen, so it never lands in a frame of film but is still readable with --eval. */}
            <b data-lab-log style={{ position: "fixed", left: -9999, top: -9999 }}>{log.join(" | ")}</b>
        </>
    );
}
