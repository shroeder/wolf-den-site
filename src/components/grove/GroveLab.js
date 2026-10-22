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
// ── ⚠️ THE TWO BELT STATES THE BENCH COULD NOT REACH ────────────────────────────────────────────────────────
// The HUD chip is a count while there is food and a way to GET food when there is not, and the second half
// was unfilmable: the lab hero carries five poultices and the only way to spend them is to stand in a zone
// being bitten for long enough. A state that needs ten minutes of play to see is a state nobody checks, and
// this one is the single place the whole crafting loop touches the fight.
//   belt    armed and empty  -> "Belt empty", which opens the workbench
//   nobelt  nothing armed    -> "No belt", which opens the backpack
// ⚠️ AND THE BAG'S CEILING, WHICH IS UNREACHABLE ON ANY HEALTHY ACCOUNT. The dock badge only appears at
// three slots or fewer, and filling a real bag to get there means moving a real player's parts around. Two
// scenes instead: the warning, and the state where loot is already being left on the floor.
const bagRoomFor = (scene) => (scene === "bagfull" ? 0 : scene === "bagtight" ? 2 : null);

const beltFor = (scene) => (scene === "nobelt" ? null
    : scene === "belt" ? { ...LAB_BELT, count: 0 }
    : LAB_BELT);

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
    // ── ⚠️ THE BENCH HAD NO WAY TO FILM AN OPEN DOOR, AND NOW THAT MATTERS ─────────────────────────
    // GroveScene locks the way on with `dr.to > unlockedN`, and the lab never passed unlockedN — so it
    // defaulted to 1 and every door on this bench was drawn locked, in every scene, for ever. That was
    // survivable while the door opened on the kill count (the beat it exists to film was the burst, not
    // the state). It is not survivable now that the BOSS is the gate: the whole change is "locked while
    // the boss lives, open once it dies", and a bench that can only ever show one of those two states
    // cannot review it. See [[harness-must-reproduce-the-bug-first]].
    //
    // So the bench holds the same fact the server does, and moves it on the same event: the boss kill.
    // onBoss is the real scene's own callback, which is exactly what GroveClient now reads `unlocked`
    // from — so the bench walks the real sequence rather than a staged copy of it.
    const [bossDown, setBossDown] = useState(scene === "travel");
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
        // "travel" banks the full toll AND starts with the boss already down (see bossDown above), so the
        // gate is open and the only thing left to film is what walking through one looks like.
        //
        // ⚠️ AND NOTE WHAT "unlock" NOW FILMS. It is one kill short of the toll, which used to be one kill
        // short of the DOOR opening. It no longer is: crossing the toll spawns the boss, and the door opens
        // on the boss. So "unlock" films the boss arriving and "gate" films the sealed door standing beside
        // it — the beat moved, and the scene that used to own it now sets it up.
        //
        // The boss scenes bank it too, and THAT IS A FIX RATHER THAN A TIDY-UP. `bossReady` below used to be
        // the whole gate, so setting it true was enough to put a boss in the world. It no longer is: the
        // scene now recomputes readiness live, off the kill count, so that a player who walks in one kill
        // short sees the boss arrive without a reload. Correct in the game, and it silently emptied the
        // bench -- "scene=boss" filmed a hero standing in an empty clearing with no boss and no error, which
        // reads as "the boss is broken" rather than "the fixture is".
        // "gate" is the one that was missing, and the bug it would have caught cost Luke a zone: the boss
        // spawns at the far wall and the way on is at the far wall, so the only question that matters about
        // either of them is what they look like STANDING TOGETHER. No scene put them in the same frame —
        // "door" is seven kills short so no boss exists, and "boss" teleports it to the hero's elbow in the
        // middle of the zone. The gate had never been photographed with the thing that stands beside it.
        const banked = scene === "travel" || scene === "gate" ? z.toUnlock
            : scene === "unlock" ? Math.max(0, z.toUnlock - 1)
            : scene === "door" ? Math.max(0, z.toUnlock - 7)
            : scene === "boss" || scene === "bossin" ? z.toUnlock
            : 0;
        return { ...z, bossReady: true, kills: banked };
    }, [zoneN, scene, travelled]);

    // A fixed seed so two runs of the film rig produce the same zone and a diff means a real change.
    const seed = 424242;

    // Deliberately a mid-game kit rather than a fresh one: a hero who cannot kill anything films thirty
    // seconds of nothing, and a hero who one-shots everything never shows a health bar draining.
    // ⚠️ THE SHAPE IS grove-kit.js's FIGHTER NOW, not the old hand-rolled one. The scene reads `damage`,
    // `critChance` (a SHARE, not a percent), `critMult`, `tempo` and `armour`, so a fixture written in the
    // old names silently gives the lab hero zero of everything and films a hero who cannot hurt anything.
    const stats = useMemo(() => ({
        maxHp: 600, armour: 20, moveSpeed: 0,
        damage: scene === "loot" ? 9999 : 34, dmgPct: 0,
        // ⚠️ THE JUICE SCENE FORCES WHAT IS OTHERWISE RARE. A crit at 22% and a haste proc at a few
        // percent cannot be filmed on demand -- you shoot twenty sheets and hope. The whole reason the
        // lab exists is to make a moment happen DURING the film, so this scene pins both to certainty.
        critChance: scene === "juice" ? 1 : scene === "fight" ? 0.5 : 0.22, critMult: 1.7,
        // Tempo is a multiple of the bare rate, so 1.1 is the old "+10% attack speed".
        // Haste is POINTS, fed through procFrom() -- a big number here is a proc on nearly every swing.
        tempo: 1.1, haste: scene === "juice" ? 400 : 0,
        bleedChance: scene === "fight" ? 0.35 : 0, bleedDamage: 0, bleedLeech: 0,
        // ⚠️ THE BURN SCENE PINS WHAT IS OTHERWISE A ROLL. Kindle's top rank is a 30% chance, so filming
        // a spread off real odds is shooting sheets until one catches. Certainty here, the same reason
        // the juice scene pins crit and haste: the lab exists to make the moment happen DURING the film.
        // ── THE WARDEN, WHOSE WHOLE DEFENCE WAS UNFILMABLE ─────────────────────────────────────────
        // ⚠️ THE REAL MAXED NUMBERS, NOT PINNED CERTAINTY, AND THE FIRST CUT PROVED WHY. Pinning block
        // and guard to 1 made the hero unkillable: every blow halved and then wholly eaten by a shield
        // worth a fifth of his health, so health never moved -- and GRUDGE, which banks what reaches
        // health, could never fire. A bench tuned to show one thing had hidden two others.
        //
        // These are what a full Warden tree actually grants. Blocks are rarer to film and every one of
        // the four is reachable, which is the trade worth making.
        // ⚠️ A SHARE, NOT POINTS. The hero's own `stun` is raw points through STUN_PER_POINT; this is
        // the flat percentage the two Concussion nodes pay. 0.3 rather than certainty, and the first cut
        // proved why: at 1 every landed blow re-stunned the creature before it could ever wind up, so it
        // stood permanently stunned and the one path worth proving -- that a stun CANCELS an attack
        // already in the air -- could not happen at all. Raised enough to land inside a film, low enough
        // that the creature still gets to swing in between.
        stunBonus: scene === "stun" ? 0.3 : 0,
        // ⚠️ THE REAL MAXED NUMBERS, AND THE THIRD TIME THIS LESSON HAS BEEN PAID FOR TODAY. Freeze was
        // pinned to 1 to prove LOCK_IMMUNE_MS works against the worst case -- it does: the creature was
        // held 59% of frames across seven separate locks rather than permanently. But a hero facing a
        // creature that is frozen six seconds in ten and chilled to the cap barely gets HIT, and ICE
        // THORNS only answer damage that reached health, so the bench proving one thing had made another
        // unprovable. Same shape as the Warden's grudge and the stun's cancel.
        //
        // Certainty belongs in a one-off test; the standing bench runs what a maxed tree actually grants.
        freeze: scene === "cold" ? 0.1 : 0,
        chill: scene === "cold" ? 0.1 : 0,
        iceThorns: scene === "cold" ? 0.15 : 0,
        // ── THE WHOLE REMAINING KIT, FOR PROVING EACH PIECE FIRES ──────────────────────────────────
        // ⚠️ REAL MAXED VALUES EXCEPT WHERE A RARE ROLL WOULD NOT LAND INSIDE A FILM. counter, cataclysm
        // and wildProc are 10%, 5% and 5% on a full tree, which is a lot of waiting; surge is COUNTED
        // rather than rolled so it needs no help, and ward, soulfire and regen fire on every swing.
        // Pinning only the three that need it, and the rest honest -- the lesson from three benches that
        // flattered what they were built to prove.
        ward: scene === "kit" ? 0.1 : 0,
        wardRefill: scene === "kit" ? 0.01 : 0,
        counter: scene === "kit" ? 0.6 : 0,
        surge: scene === "kit" ? 1 : 0,
        soulfire: scene === "kit" ? 0.1 : 0,
        cataclysm: scene === "kit" ? 0.3 : 0,
        wildProc: scene === "kit" ? 0.4 : 0,
        regen: scene === "kit" ? 0.025 : 0,
        blockChance: scene === "warden" ? 0.15 : 0,
        blockReduction: scene === "warden" ? 0.5 : 0,
        guardChance: scene === "warden" ? 0.2 : 0,
        guardSize: scene === "warden" ? 0.2 : 0,
        thorns: scene === "warden" ? 0.2 : 0,
        grudge: scene === "warden" ? 0.15 : 0,
        burnChance: scene === "burn" ? 1 : 0,
        burnDamage: scene === "burn" ? 0.2 : 0,
        burnLeech: scene === "burn" ? 0.15 : 0,
        // ⚠️ NO LIFESTEAL IN THE DEATH SCENE. A few percent of every swing out-heals anything a zone-three
        // creature does to you, so the hero stood among three of them getting healthier. The one scene
        // about dying has to be the one scene that cannot win. These are POINTS, not a share.
        // ⚠️ NO LIFESTEAL IN THE EAT SCENE EITHER. Sixteen points of it out-heals a zone-three creature,
        // so the hero climbs back over the 60% line on his own and never reaches for the belt -- the same
        // reason the death scene has none, for the same beat one step earlier.
        lifesteal: scene === "death" || scene === "eat" ? 0 : 16,
    }), [scene]);

    const onTravelLab = useCallback((n) => { say(`travel ${n}`); setTravelled(n); }, [say]);
    const onSettleLab = useCallback((batch) => say(`settle ${batch.length}`), [say]);
    const onPanelLab = useCallback((k) => { say(`panel ${k}`); setPanel(k); }, [say]);
    // ⚠️ AND IT OPENS THE WAY, because that is what the kill now does. The real client does this off
    // `unlocked` in the boss response (see openTheWay in grove.js); there is no server here, so the
    // bench does it off the same callback.
    const onBossLab = useCallback(() => { say("boss"); setBossDown(true); }, [say]);
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
                // ⚠️ A REAL SHARE, OR THE PET SCENE FILMS A COMPANION STANDING THERE. petBite is 0 for a
                // member with no pet equipped and the resolver reads 0 as "do not bite", so a lab that
                // left it at its default would have photographed exactly the behaviour this change
                // replaced. 0.39 is a maxed eternal -- the top of the table, because the scene exists to
                // judge the loudest the pet ever gets, which is where "too noisy" would show up.
                petBite={scene === "pet" ? 0.39 : 0.13}
                belt={beltFor(scene)}
                bagRoom={bagRoomFor(scene)}
                labScene={scene}
                // Locked while the boss stands, open once it falls — the one thing this change is about.
                unlockedN={bossDown ? (travelled || zoneN) + 1 : (travelled || zoneN)}
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
