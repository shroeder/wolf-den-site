"use client";

import { useEffect, useMemo, useState } from "react";

import MusterHorn from "@/components/MusterHorn";
import SetsClient from "@/components/SetsClient";
import SpinWheel from "@/components/SpinWheel";
import { PurserPanel } from "@/components/ArenaClient";
import AvatarBuilder from "@/components/AvatarBuilder";
import JewellerClient from "@/components/JewellerClient";
import EquipmentClient from "@/components/EquipmentClient";
import CompendiumClient from "@/components/CompendiumClient";
import RecipeShelf from "@/components/RecipeShelf";
import RecipeFoundWatcher from "@/components/RecipeFoundWatcher";
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
    recipeShop: { price: 750, knowsAll: false },
};


// The Jewelcutter's own state. `jw-one` is the shape from the screenshot — a single Chipped Topaz, which is
// exactly the case the old grid stretched across the whole shelf.
const GEM = (id, name, color, stats, count, art) => ({ id, name, color, stats, count, art, canFuse: count >= 3, fuseCount: 3,
    fuseInto: { id: id + "_up", name: "Flawed " + name.split(" ").pop(), stats } });
const JW = (gems) => ({
    unlocked: true, gold: 3808, gems,
    pieces: [
        { id: "crown_of_kings", name: "Crown of Kings", slot: "helmet", rarity: "legendary", equipped: true,
          statsText: "+12% Might · +18% Fortune", socket: null, socketCost: 12000, sockets: [] },
        { id: "dragon_shield", name: "Dragon Shield", slot: "off_hand", rarity: "epic", equipped: true,
          statsText: "+14% Ferocity", socket: null, socketCost: 9000, sockets: [] },
    ],
});


// A bag with a spread of rarities and slots, so the sort has something to actually sort. `equipped` on two of
// them, because the first thing the ordering has to prove is that what you are wearing floats to the top.
const IT = (id, name, slot, rarity, stats, equipped = false) => ({ id, name, slot, rarity, stats, equipped, enhanceLevel: 0 });
const BAG = {
    items: [
        IT("crown_of_kings", "Crown of Kings", "helmet", "legendary", { might: 12, fortune: 18 }, true),
        IT("dragon_shield", "Dragon Shield", "off_hand", "epic", { ferocity: 14 }, true),
        IT("rusted_blade", "Rusted Blade", "main_hand", "common", { might: 3 }),
        IT("oak_band", "Oak Band", "ring", "common", { fortune: 2 }),
        IT("stormcloak", "Stormcloak", "back", "rare", { crit_chance: 6 }),
        IT("ember_boots", "Ember Treads", "boots", "epic", { crit_chance: 9, ferocity: 4 }),
        IT("wolf_amulet", "Wolf's Tooth", "amulet", "mythic", { crit_power: 22 }),
        IT("iron_belt", "Iron Girdle", "belt", "rare", { might: 7 }),
        IT("scale_mail", "Scale Mail", "chest", "legendary", { ferocity: 20, might: 8 }),
        IT("ascendant_crown", "Ascendant Crown", "helmet", "ascendant", { might: 20, crit_chance: 15, crit_power: 20 }),
    ],
    pieces: [], equipped: { helmet: "crown_of_kings", off_hand: "dragon_shield" }, gold: 3808, shop: [],
};


// A slice of the catalogue across every rarity, half of it collected — the shape that has to look right.
const CI = (id, name, slot, rarity, stats, collected) => ({ id, name, slot, rarity, stats, collected, art: null, flavor: "A thing that exists.", reqLevel: 10 });
const COMPENDIUM = (() => {
    const rar = ["common", "rare", "epic", "legendary", "mythic", "ascendant", "eternal", "celestial", "primordial"];
    const slots = ["main_hand", "off_hand", "helmet", "chest", "belt", "boots", "back", "amulet", "ring"];
    const items = [];
    for (let i = 0; i < 54; i += 1) {
        items.push(CI(`it_${i}`, ["Rusted Blade", "Oak Band", "Stormcloak", "Ember Treads", "Wolf's Tooth", "Scale Mail"][i % 6] + ` ${i}`,
            slots[i % slots.length], rar[i % rar.length], { might: 3 + i }, i % 2 === 0));
    }
    const count = items.filter((i) => i.collected).length;
    return {
        signedIn: true, items, count, total: items.length,
        bonus: { fortune: 2, might: 3 },
        milestones: [10, 25, 50, 100, 250, 500, 1000].map((at) => ({ at, label: `+${at / 5 | 0} Might`, reached: count >= at })),
        next: { at: 50, toGo: 50 - count, label: "+5 Might, +2 Crit chance" },
    };
})();

// Sixty-four pages across five tiers, holes weighted to the top — which is what a real member's book looks
// like, and the case the tier pips exist to show.
const RECIPE_TIERS = [
    { tier: 1, name: "Simple", color: "#cfd8e3", total: 13, known: 13 },
    { tier: 2, name: "Hearty", color: "#7ec8ff", total: 14, known: 11 },
    { tier: 3, name: "Fine", color: "#c9a2ff", total: 15, known: 8 },
    { tier: 4, name: "Exquisite", color: "#ffd75e", total: 12, known: 3 },
    { tier: 5, name: "Legendary", color: "#ff9ec4", total: 10, known: 1 },
];
// One Simple page and one Legendary page, because the whole point of the reveal work is that those two must
// not arrive on the same beat with only a different hex code between them.
const REVEAL_FIXTURE = {
    "reveal-simple": {
        id: "r_broth", name: "Thin Broth", kind: "dish", tier: 1, tierName: "Simple", tierColor: "#cfd8e3",
        flavor: "It is warm, and that is the whole of it.",
        sprite: null, fallback: "/images/cooking/dish.webp",
        needs: [{ ref: "veg_onion", qty: 2, name: "Onion", sprite: null, fallback: "/images/cooking/dish.webp" }],
        makes: null, book: { total: 64, before: 35 },
    },
    "reveal-legendary": {
        id: "r_feast", name: "The Wolf's Own Feast", kind: "dish", tier: 5, tierName: "Legendary", tierColor: "#ff9ec4",
        flavor: "Served once, to nobody who would say what was in it.",
        sprite: null, fallback: "/images/cooking/dish.webp",
        needs: [
            { ref: "fish_squid", qty: 3, name: "Squid", sprite: null, fallback: "/images/cooking/dish.webp" },
            { ref: "p_dough", qty: 2, name: "Dough", sprite: null, fallback: "/images/cooking/dish.webp" },
        ],
        makes: null, book: { total: 64, before: 63 },
    },
};
const RECIPE_BOOK = { price: 750, knowsAll: false, total: 64, known: 36, tiers: RECIPE_TIERS };
const RECIPE_BOOK_FULL = { price: 750, knowsAll: true, total: 64, known: 64,
    tiers: RECIPE_TIERS.map((t) => ({ ...t, known: t.total })) };

const SCENES = {
    "horn-closed": { label: "Muster horn — closed pill", note: "Rides EVERY page. Bottom-left, because SocialHub owns bottom-right." },
    "horn-open": { label: "Muster horn — open, 5 foes", note: "The wave list scrolls inside itself at 46vh." },
    "horn-boss": { label: "Muster horn — boss raid", note: "One strike button instead of a foe list." },
    "dealer-one": { label: "Dealer's Choice — before the re-roll", note: "One wedge held, plus 'Deal again'." },
    "dealer-two": { label: "Dealer's Choice — both wedges", note: "Two tiles, no 'Deal again'." },
    purser: { label: "The Purser's Exchange", note: "Sits under the crates in the Armoury tab." },
    recipe: { label: "Recipe shelf — Armoury", note: "A page from the book, for laurels. Twin of the Quartermaster's." },
    "recipe-done": { label: "Recipe shelf — book finished", note: "Every page known: the buy has to be visibly spent." },
    "reveal-simple": { label: "Recipe reveal — Simple", note: "The quiet end of the book. Book opens, page turns, card resolves." },
    "reveal-legendary": { label: "Recipe reveal — Legendary", note: "The loud end, and it must not be the same half-second as Simple." },
    compendium: { label: "The Compendium", note: "Every item, collected and not. Missing ones are silhouettes." },
    bag: { label: "Gear bag — sort + one-tap equip", note: "Kaishiern's ask: rarity then type, and Equip on the tile." },
    "jw-one": { label: "Jewelcutter — one gem", note: "The case that looked worst: a single stone in a full-width box." },
    "jw-many": { label: "Jewelcutter — a shelf", note: "Several stones, so the colours have to read apart at a glance." },
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
        if (u.includes("/api/marketplace/compendium")) return json(COMPENDIUM);
        // The reveal is driven entirely by this endpoint, so stubbing it runs the REAL watcher through its
        // real three-beat sequence — the only way to see a moment that otherwise needs a lucky harvest.
        if (u.includes("/api/marketplace/recipe-found")) {
            return json({ pending: scene.startsWith("reveal") ? [REVEAL_FIXTURE[scene]] : [] });
        }
        if (u.includes("/api/marketplace/inventory")) return json(BAG);
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
    // Read straight off the URL rather than held in state: it is a one-shot input to a screenshot run.
    const art = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("art") : null;

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
            {scene === "bag" ? <EquipmentClient key={scene} /> : null}
            {scene === "compendium" ? <CompendiumClient key={scene} /> : null}
            {/* Keyed so switching between the two tiers replays the whole three-stage sequence rather than
                swapping a colour on an animation that has already finished. */}
            {scene === "jw-one" ? <JewellerClient key={scene} initial={JW([GEM("topaz_t1", "Chipped Topaz", "#ffb648", { crit_chance: 2 }, 2, "/images/gems/topaz_t1.png")])} /> : null}
            {scene === "jw-many" ? <JewellerClient key={scene} initial={JW([
                GEM("ruby_t1", "Chipped Ruby", "#ff5d6c", { might: 2 }, 3, "/images/gems/ruby_t1.png"),
                GEM("sapphire_t2", "Flawed Sapphire", "#6bb8ff", { ferocity: 4 }, 1, "/images/gems/sapphire_t2.png"),
                GEM("emerald_t1", "Chipped Emerald", "#5ddc9a", { fortune: 2 }, 5, "/images/gems/emerald_t1.png"),
                GEM("topaz_t3", "Polished Topaz", "#ffb648", { crit_chance: 6 }, 1, "/images/gems/topaz_t3.png"),
            ])} /> : null}
            {scene === "purser" ? (
                <section className="card">
                    <div className="ar-arm-head"><b>The Armoury</b><span className="ar-arm-purse">1,240</span></div>
                    <PurserPanel st={ARENA_BASE} busy={purserBusy} act={async () => {}} />
                </section>
            ) : null}
            {scene === "recipe" || scene === "recipe-done" ? (
                <section className="card">
                    <div className="ar-arm-head"><b>The Armoury</b><span className="ar-arm-purse">1,240</span></div>
                    {/* The REAL shelf, not a copy of its markup — the whole reason the old fixture was worth
                        replacing is that it could not have shown the collection it does not know about. */}
                    {/* The price is a literal because cooking.js is server-only and this is a client lab. The
                        real figure is RECIPE_PRICE_LAURELS — if the two disagree, that one is right. */}
                    <RecipeShelf key={scene} shop={scene === "recipe-done" ? RECIPE_BOOK_FULL : RECIPE_BOOK}
                        busy={false} canAfford price={2500} onBuy={() => {}} />
                </section>
            ) : null}
            {/* The watcher is mounted site-wide in the real app; here it is mounted only for its own scenes so
                it does not sit invisibly over every other one. Keyed so re-picking a scene replays it. */}
            {scene.startsWith("reveal") ? <RecipeFoundWatcher key={scene} /> : null}
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
