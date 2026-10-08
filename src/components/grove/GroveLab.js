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
// Scenes:
//   wander  the resting zone — spawn, idle, wander, hop. What the opening frames look like.
//   fight   drops the hero next to a foe so a swing lands within the first second of film.
//   boss    the zone boss, for the health bar and the standoff.
//   loot    a foe on one hit point, so a death and its loot spill happen immediately.
const HERO = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/1789189247101-37705.webp";
const PET = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/1788751846210-628644.webp";

export default function GroveLab({ scene = "wander", zoneN = 1 }) {
    const [log, setLog] = useState([]);
    const zone = useMemo(() => GROVE_ZONES.find((z) => z.n === zoneN) || GROVE_ZONES[0], [zoneN]);

    // A fixed seed so two runs of the film rig produce the same zone and a diff means a real change.
    const seed = 424242;

    // Deliberately a mid-game kit rather than a fresh one: a hero who cannot kill anything films thirty
    // seconds of nothing, and a hero who one-shots everything never shows a health bar draining.
    const stats = useMemo(() => ({
        maxHp: 600, power: scene === "loot" ? 9999 : 34, critRate: 22, critDamage: 70,
        lifeSteal: 4, attackSpeed: 10, armour: 20,
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
                belt={{ id: "grove_bread", name: "Coarse Bread", count: 5 }}
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
