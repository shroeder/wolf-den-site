"use client";

import { useEffect, useMemo, useState } from "react";

import MusterHorn from "@/components/MusterHorn";
import SetsClient from "@/components/SetsClient";
import SpinWheel from "@/components/SpinWheel";
import { PurserPanel } from "@/components/ArenaClient";
import AvatarBuilder from "@/components/AvatarBuilder";
import { TOWN_CSS } from "@/components/TownClient";

// ── THE POWERS LAB ───────────────────────────────────────────────────────────────────────────────────────────
// DEV ONLY (the route 404s in production). Controls that are HARD TO REACH, at a real phone width and at
// desktop — the ascension-power controls it was built for, plus anything else that needs a signed-in account
// or a specific server state to lay eyes on.
//
// WHY IT HAS TO EXIST. Each of these is drawn ONLY for the member wearing one specific top-tier item — and not
// one of those items is obtainable right now (every one is `source: "elite"`, which every drop pool excludes).
// So there is literally no way to see any of this by playing, including as the owner. Six controls shipped
// unlooked-at because of that, which is the exact gap this closes.
//
// FOUR OF THE SIX MOUNT THE REAL COMPONENT — MusterHorn, SetsClient, SpinWheel and PurserPanel are imported,
// not copied, so a change to any of them shows up here without anybody remembering to update the lab.
//
// TWO ARE MARKUP FIXTURES, and they say so on screen. The stockade row lives inside TownClient and the landing
// dock inside SailingClient; both are large signed-in clients that fetch a dozen things on mount, and stubbing
// all of that would build a rig bigger than the thing it inspects. What is at risk in those two is PURELY CSS
// — a third button in a row built for two, a second CTA in a dock built for one — and that is exactly what a
// faithful copy of the markup, in the real stylesheet, does test. It does not test their data flow. Anything
// found in a fixture must be confirmed against the real file before it is called fixed.
//
// ?scene=<key> renders one scene. ?chrome=1 adds a spacer the height of the site's real header + nav, because
// a phone screenshot that forgets the chrome is 226px more generous than the device is.

const CHROME_PX = 226;   // measured header + nav + guide strip at 375px wide

// ── SCENES ───────────────────────────────────────────────────────────────────────────────────────────────────
// Every scene is a URL, so a screenshot run is a list of URLs rather than a sequence of taps.
const SETS_FIXTURE = [{
    id: "wheelwarden",
    name: "Wheelwarden's Fortune",
    equipped: 0, owned: 2, total: 4,
    pieces: [
        { id: "piece_wheel_cog", name: "Warden's Cog", rarity: "rare", icon: "GiAbstract050", owned: true, equipped: false, statsText: "No combat stats", flavor: "It turns whether you watch it or not." },
        { id: "piece_wheel_pin", name: "Warden's Pin", rarity: "epic", icon: "GiPin", owned: true, equipped: false, statsText: "No combat stats", flavor: "Holds the whole thing together." },
        { id: "piece_wheel_hub", name: "Warden's Hub", rarity: "legendary", icon: "GiWheelbarrow", owned: false, equipped: false, statsText: "No combat stats", flavor: "The still point." },
        { id: "piece_wheel_rim", name: "Warden's Rim", rarity: "mythic", icon: "GiRingedPlanet", owned: false, equipped: false, statsText: "No combat stats", flavor: "Everything else is decoration." },
    ],
    tiers: [{ need: 2, stats: null, wheel: { luck: 4 } }, { need: 3, stats: null, wheel: { goldPct: 15 } }],
    capstone: { active: false, desc: "Full set: a chance the spin is refunded." },
}];

const SPIN_BASE = {
    signedIn: true, gold: 4820, tokens: 1, spinCount: 63, canSpin: true, freeAvailable: true, tokenCost: 1000,
    wheel: { prizes: Array.from({ length: 20 }, (_, i) => ({ label: ["240 gold", "An Iron chest", "A seed", "80 XP", "A spin token", "A Wooden chest", "500 gold", "A potion"][i % 8], sprite: null, tier: "normal" })) },
    collections: [],
};

const ARENA_BASE = {
    laurels: 1240,
    purser: { doubloons: 386, rate: 1, max: 5000 },
};

const SCENES = {
    "horn-closed": { label: "Muster horn — closed pill", note: "Rides EVERY page. Bottom-left, because SocialHub owns bottom-right." },
    "horn-open": { label: "Muster horn — open, 5 foes", note: "The wave list scrolls inside itself at 46vh." },
    "horn-boss": { label: "Muster horn — boss raid", note: "One strike button instead of a foe list." },
    "dealer-one": { label: "Dealer's Choice — before the re-roll", note: "One wedge held, plus 'Deal again'." },
    "dealer-two": { label: "Dealer's Choice — both wedges", note: "Two tiles, no 'Deal again'." },
    purser: { label: "The Purser's Exchange", note: "Sits under the crates in the Armoury tab." },
    sets: { label: "The Loaned Exhibit", note: "Open a piece you do NOT own — the borrow button is in the modal." },
    "lock-off": { label: "Hero lock — unlocked", note: "Sits beside the paid redraw; the two decide the same thing." },
    "lock-on": { label: "Hero lock — locked", note: "Locked state must be certain at a glance, and it disables the redraw." },
    stockade: { label: "Warden's Key (markup fixture)", note: "A third button in a row built for two.", fixture: true },
    dock: { label: "Call for the merchant (markup fixture)", note: "A second CTA in a dock built for one.", fixture: true },
};

// ── THE STUB SERVER ──────────────────────────────────────────────────────────────────────────────────────────
// window.fetch is replaced for the whole lab so the real components run their real code paths — load, poll,
// tap, redraw — without a database. Anything not matched falls through to a benign empty object rather than
// throwing, so an unrelated poll (presence, push, telemetry) cannot take the page down.
let stubbedFor = null;
let realFetch = null;

// INSTALLED DURING RENDER, not in an effect. React runs CHILD effects before PARENT effects, so a stub
// installed in the lab's own useEffect arrives AFTER MusterHorn has already made its first call — which hit
// the real endpoint, got {live:false} because nobody is signed in, and shut the panel before it could be
// looked at. That cost a screenshot round to find, and it is the kind of thing a rig gets exactly once.
function installStub(scene) {
    if (typeof window === "undefined" || stubbedFor === scene) return;
    if (!realFetch) realFetch = window.fetch;
    stubbedFor = scene;

    const foes = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1, label: ["Goblin Cutter", "Bandit Archer", "Goblin Shaman", "Bandit Bruiser", "Goblin Chieftain"][i],
        emoji: ["🗡️", "🏹", "🔮", "🪓", "👑"][i], hpPct: [100, 72, 45, 88, 100][i], mine: i === 1, takeable: true,
    }));
    const muster = scene.startsWith("horn")
        ? {
            live: true,
            event: scene === "horn-boss"
                ? { id: 1, kind: "treasure_golem", name: "The Treasure Golem", emoji: "🗿", boss: true, hpPct: 62, myDamage: 4120 }
                : { id: 1, kind: "goblin_swarm", name: "Goblin Swarm", emoji: "👺", boss: false, hpPct: 80, myDamage: 1860 },
            wave: scene === "horn-boss" ? null : 3,
            enemies: scene === "horn-boss" ? [] : foes,
        }
        : { live: false };
    const spin = {
        ...SPIN_BASE,
        pendingChoice: scene.startsWith("dealer")
            ? {
                rerolled: scene === "dealer-two",
                offered: scene === "dealer-two"
                    ? [{ index: 3, label: "An Iron chest", text: "An Iron chest", sprite: null }, { index: 11, label: "1,200 gold", text: "1,200 gold", sprite: null }]
                    : [{ index: 3, label: "An Iron chest", text: "An Iron chest", sprite: null }],
            }
            : null,
    };
    window.fetch = async (url) => {
        const u = String(url);
        if (u.includes("/api/marketplace/muster")) return json(muster);
        if (u.includes("/api/marketplace/spin")) return json(spin);
        if (u.includes("/api/marketplace/sets")) return json({ ok: true, exhibit: "piece_wheel_hub" });
        if (u.includes("/api/marketplace/arena")) return json({ ok: true, ...ARENA_BASE });
        if (u.includes("/api/marketplace/avatar")) {
            return json({ cost: 1000, gold: 4820, canAfford: true, firstIsFree: false, hasAvatar: true, locked: scene === "lock-on" });
        }
        // Everything else the page happens to ask for while it is open.
        return json({});
    };
}

const json = (body) => Promise.resolve({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

export default function PowersLab() {
    const [scene, setScene] = useState("horn-closed");
    const [chrome, setChrome] = useState(true);
    const [bare, setBare] = useState(false);
    const [purserBusy] = useState(false);

    // Before anything below this line renders, and therefore before any child's effect runs.
    installStub(scene);

    // The URL is the source of truth, so a screenshot run is just a list of addresses.
    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        if (q.get("scene") && SCENES[q.get("scene")]) setScene(q.get("scene"));
        if (q.get("chrome") === "0") setChrome(false);
        // ?bare=1 strips the lab's OWN furniture, so a screenshot is the feature and nothing else.
        if (q.get("bare") === "1") setBare(true);
    }, []);

    const meta = SCENES[scene];
    const sets = useMemo(() => SETS_FIXTURE, []);

    return (
        <div className="stack" style={{ paddingBottom: 120 }}>
            {/* The stockade row's styles live in a template string inside TownClient, not in globals.css, so a
                fixture without them renders an unstyled stack — which is what the first run of this lab showed
                and briefly looked like a product bug. Injected here, the row is the real thing. */}
            {scene === "stockade" ? <style>{TOWN_CSS}</style> : null}

            {bare ? null : (
            <div className="card" style={{ position: "sticky", top: 0, zIndex: 50 }}>
                <b>Powers lab</b>
                <p className="muted" style={{ fontSize: ".78rem", margin: ".3rem 0 .5rem" }}>
                    {meta.note}{meta.fixture ? " — MARKUP FIXTURE, not the real client." : ""}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: ".35rem", maxWidth: "100%" }}>
                    {Object.entries(SCENES).map(([k, v]) => (
                        <button key={k} type="button" className={`btn-ghost${scene === k ? " is-active" : ""}`}
                            style={{ fontSize: ".7rem", padding: ".3rem .5rem", whiteSpace: "normal", textAlign: "left" }} onClick={() => setScene(k)}>{v.label}</button>
                    ))}
                    <button type="button" className="btn-ghost" style={{ fontSize: ".7rem", padding: ".3rem .5rem" }}
                        onClick={() => setChrome((v) => !v)}>{chrome ? "Hide site chrome" : `Show site chrome (${CHROME_PX}px)`}</button>
                </div>
            </div>
            )}

            {/* The site's real header + nav + guide strip take this much off a phone before any feature draws.
                A screenshot that forgets it is 226px more generous than the device. */}
            {chrome && !bare ? (
                <div style={{ height: CHROME_PX, borderRadius: 12, border: "1px dashed rgba(220,160,60,.35)", display: "grid", placeItems: "center", color: "#8b7a5e", fontSize: ".75rem" }}>
                    site chrome — header, nav, guide strip ({CHROME_PX}px)
                </div>
            ) : null}

            {/* KEYED ON THE SCENE so switching scenes REMOUNTS it. `defaultOpen` seeds useState, and useState only
                seeds on mount — the scene arrives from the URL in an effect, i.e. after the first render, so
                without this the horn mounts closed and a prop change can never reopen it. */}
            {/* The public layout mounts a MusterHorn on EVERY page, and this lab lives inside that layout — so
                every scene inherits one, sitting on top of whatever is being inspected. Hidden for ALL scenes
                rather than just the horn's, because a floating pill over the wheel is exactly the kind of thing
                that gets mistaken for the bug you are hunting. That it appears at all is the proof the
                site-wide mount works. */}
            <style>{".muster{display:none}.lab-horn .muster{display:block}"}</style>
            {scene.startsWith("horn") ? (
                <div className="lab-horn"><MusterHorn key={scene} defaultOpen={scene !== "horn-closed"} /></div>
            ) : null}
            {scene.startsWith("dealer") ? <SpinWheel key={scene} /> : null}
            {scene === "sets" ? <SetsClient sets={sets} exhibit={null} canLoan /> : null}
            {scene.startsWith("lock") ? <AvatarBuilder key={scene} current={null} /> : null}
            {scene === "purser" ? (
                <section className="card">
                    <div className="ar-arm-head"><b>The Armoury</b><span className="ar-arm-purse">1,240</span></div>
                    <PurserPanel st={ARENA_BASE} busy={purserBusy} act={async () => {}} />
                </section>
            ) : null}
            <Ruler />
            {scene === "stockade" ? <StockadeFixture /> : null}
            {scene === "dock" ? <DockFixture /> : null}
        </div>
    );
}

// A screenshot cannot tell you WHY something is cut off at the right edge — whether the element is too wide or
// the whole document is. This prints both numbers into the picture, so the answer is in the evidence rather
// than in a guess. `scrollWidth > innerWidth` means the PAGE overflows; the widest offender is named too.
function Ruler() {
    const [r, setR] = useState(null);
    useEffect(() => {
        const t = setTimeout(() => {
            const doc = document.documentElement;
            let worst = null;
            for (const el of document.querySelectorAll("body *")) {
                const w = el.getBoundingClientRect().right;
                if (w > doc.clientWidth + 1 && (!worst || w > worst.w)) {
                    worst = { w: Math.round(w), tag: `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ").filter(Boolean).slice(0, 2).join(".")}` };
                }
            }
            setR({ inner: window.innerWidth, scroll: doc.scrollWidth, client: doc.clientWidth, worst });
        }, 400);
        return () => clearTimeout(t);
    }, []);
    if (!r) return null;
    return (
        <div style={{ position: "fixed", top: 0, right: 0, zIndex: 9999, background: "#0b0b0b", color: "#8fd6a2", font: "700 11px/1.4 monospace", padding: "4px 6px", border: "1px solid #2a2a2a" }}>
            inner {r.inner} · scroll {r.scroll} · client {r.client}
            {r.worst ? <div style={{ color: "#ff8f6a" }}>over: {r.worst.tag} → {r.worst.w}</div> : <div>no overflow</div>}
        </div>
    );
}

// ── MARKUP FIXTURES ──────────────────────────────────────────────────────────────────────────────────────────
// Copies of the two rows that live inside clients too large to mount here. They exist to answer one question
// each — does the new control fit — and they answer nothing else. Keep them in step with the real files by
// hand; if one drifts, the lab is lying, which is worse than not having it.
function StockadeFixture() {
    return (
        <section className="card">
            <p className="muted" style={{ fontSize: ".75rem" }}>TownClient — the stockade action row, with the key added.</p>
            <div className="tw-stock-actions">
                <button type="button" className="tw-stock-btn is-shame">
                    <span className="tw-stock-ico" aria-hidden="true">👉</span>
                    <span className="tw-stock-lbl">Shame them</span>
                    <span className="tw-stock-meta">+8 XP</span>
                    <span className="tw-stock-left">3/3</span>
                </button>
                <button type="button" className="tw-stock-btn is-fruit">
                    <span className="tw-stock-ico" aria-hidden="true">🍅</span>
                    <span className="tw-stock-lbl">Throw rotten fruit</span>
                    <span className="tw-stock-meta">+12 XP · +6 🪙</span>
                    <span className="tw-stock-left">3/3</span>
                </button>
                <button type="button" className="tw-stock-btn is-key">
                    <span className="tw-stock-ico" aria-hidden="true">🗝️</span>
                    <span className="tw-stock-lbl">Turn the warden&apos;s key</span>
                    <span className="tw-stock-meta">Let them out</span>
                    <span className="tw-stock-left">1/week</span>
                </button>
            </div>
        </section>
    );
}

function DockFixture() {
    return (
        <section className="card">
            <p className="muted" style={{ fontSize: ".75rem" }}>SailingClient — the landing dock, with the merchant call added.</p>
            <div className="sail-cta-dock">
                <button className="sail-cta sail-cta-dig">
                    <span className="sail-cta-ico">⛏️</span> Dig for treasure
                </button>
                <button className="sail-cta sail-cta-market">
                    <span className="sail-cta-ico">⚖️</span> Call for the merchant
                </button>
            </div>
        </section>
    );
}
