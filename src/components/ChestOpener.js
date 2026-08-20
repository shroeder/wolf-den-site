"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import ConsumableArt from "@/components/ConsumableArt";
import ItemArt from "@/components/ItemArt";
import PetArt from "@/components/PetArt";
import { GiCutDiamond } from "react-icons/gi";
import ChestIcon from "@/components/ChestIcon";
// The Den's audio engine. It lives in the arena folder because that is where it was built, but it is one
// AudioContext, one master bus and one stored mute for the whole site — a second engine here would be the
// exact leak its header warns about. It also means the mute you set in the arena is honoured here.
import { Haptic, Sfx, unlock } from "@/components/arena/arena-audio";

const RARITY_LABEL = { common: "Common", rare: "Rare", epic: "Epic", legendary: "LEGENDARY", mythic: "MYTHIC", ascendant: "ASCENDANT", eternal: "ETERNAL" };
// Shared, so a stat added to STAT_META shows up here without anyone remembering to come back.
import { describeStats } from "@/lib/marketplace/items.js";
const statLine = (stats = {}, opts) => describeStats(stats, opts);
const RARITY_COLOR = { common: "#9aa7b5", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ffb52e", mythic: "#37f5c0", ascendant: "#ff7a3c", eternal: "#ff5cc8" };
const PARTICLE_COUNT = { common: 16, rare: 22, epic: 28, legendary: 36, mythic: 46, ascendant: 58, eternal: 72 };
const BIG_RARITIES = new Set(["epic", "legendary", "mythic", "ascendant", "eternal"]);

// Where a rarity sits on the ladder, for "which of these is the best one" questions. RARITY_COLOR is already
// declared in ladder order, so the ladder is read off it rather than typed out a second time.
const RARITY_RANK = (r) => Math.max(0, Object.keys(RARITY_COLOR).indexOf(r));

function rarityOf(reveal) {
    if (reveal?.consumable) return reveal.consumable.kind === "relic" ? "eternal" : "legendary";
    if (reveal?.pet) return reveal.pet.rarity || "rare";
    if (reveal?.recipe) return "epic";
    // A handful of seeds celebrates at the BEST one in it — a Star Fruit out of a gold chest should not be
    // announced at the rarity of the wheat sitting next to it.
    if (Array.isArray(reveal?.seeds) && reveal.seeds.length) {
        const order = ["common", "rare", "epic", "legendary", "mythic"];
        return reveal.seeds.reduce((best, x) => (order.indexOf(x.rarity) > order.indexOf(best) ? x.rarity : best), "common");
    }
    // Tier 1-5 maps onto the rarity ladder so a Flawless gem gets a Flawless-sized celebration.
    if (reveal?.gem) return ["common", "rare", "epic", "legendary", "mythic"][Math.max(0, Math.min(4, (Number(reveal.gem.tier) || 1) - 1))];
    return reveal?.item?.rarity || reveal?.rarity || "common";
}

// Loot-chest opener with a suspense reveal. Fetches the member's chests, opens one on tap (server rolls
// the loot), holds a beat of anticipation, then bursts the reward in with a full-screen celebration.
export default function ChestOpener({ onLoot }) {
    const [chests, setChests] = useState(null);
    const [modalTier, setModalTier] = useState(null);
    const [phase, setPhase] = useState("idle"); // shaking | revealed
    const [reveal, setReveal] = useState(null);
    const [busy, setBusy] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/chests", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        setChests(d?.chests || []);
    }, []);
    useEffect(() => { load(); }, [load]);

    // Lock body scroll while the celebration is up.
    useEffect(() => {
        if (!modalTier) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [modalTier]);

    // ── OPENING A PILE ───────────────────────────────────────────────────────────────────────────────────
    // The one-chest path is a shake, a beat and a full-screen celebration, which is exactly right for one
    // chest and exactly wrong for twenty-eight. A pile gets a rattle and a SUMMARY: everything that came out,
    // best first, in one card you dismiss once.
    //
    // The server caps how many it will open in a request, so `more` is what is left and the card offers
    // another round rather than silently stopping — see BULK_OPEN_CAP.
    const [bulk, setBulk] = useState(null);   // { opens, opened, more, tier }
    async function openAll(tier = null) {
        if (busy) return;
        setBusy(true); setModalTier(tier || "__all"); setPhase("shaking"); setReveal(null); setBulk(null);
        unlock();
        Sfx.chestRattle(1.4);
        Haptic.chestShake();
        const pending = fetch("/api/marketplace/chests", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ all: true, ...(tier ? { tier } : {}) }),
        }).then((r) => r.json().catch(() => ({ error: "failed" })));
        setTimeout(async () => {
            const d = await pending;
            if (d?.error) { setModalTier(null); setBusy(false); return; }
            setBulk({ ...d, tier });
            setChests(d.chests || []);
            setPhase("revealed");
            setBusy(false);
            // The pile celebrates at its BEST chest, the same rule a handful of seeds already follows.
            const best = (d.opens || []).reduce((b, o) => (RARITY_RANK(rarityOf(o)) > RARITY_RANK(b) ? rarityOf(o) : b), "common");
            Sfx.chestOpen(best);
            Haptic.chestOpen(best);
            onLoot?.();
        }, 1500);
    }

    function open(tier) {
        if (busy) return;
        setBusy(true); setModalTier(tier); setPhase("shaking"); setReveal(null); setBulk(null);
        // ── THE SOUND OF IT ── this was silent from end to end: a second and a half of a chest visibly shaking
        // with nothing coming out of the speaker, then a full-screen LEGENDARY with no payoff at all. Opening a
        // chest is the most celebratory thing in the game and it was the quietest.
        //
        // The tap is the gesture that unlocks audio — browsers will not start a context without one — so the
        // whole reveal is audible off this single call.
        unlock();
        Sfx.chestRattle(1.4);
        Haptic.chestShake();
        const pending = fetch("/api/marketplace/chests", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tier }),
        }).then((r) => r.json().catch(() => ({ error: "failed" })));
        // Hold the anticipation, then reveal.
        setTimeout(async () => {
            const d = await pending;
            if (d?.error) { setModalTier(null); setBusy(false); return; }
            setReveal(d); setChests(d.chests || []); setPhase("revealed"); setBusy(false);
            // Scaled by what actually came out, on the same rarity scale the particles and the colours use —
            // hearing "that was a big one" before you have read a word is the whole point.
            const r = rarityOf(d);
            Sfx.chestOpen(r);
            Haptic.chestOpen(r);
            onLoot?.();
        }, 1500);
    }

    function closeModal() { if (busy) return; setModalTier(null); setReveal(null); setBulk(null); setPhase("idle"); }

    if (!chests) return null;
    const total = chests.reduce((s, c) => s + c.count, 0);
    // "__all" is not a tier, so the shake falls back to the richest chest actually held — the pile should
    // rattle as the best thing in it, not as an empty box.
    const activeChest = chests.find((c) => c.tier === modalTier)
        || (modalTier === "__all" ? [...chests].sort((a, z) => RARITY_RANK(z.tier) - RARITY_RANK(a.tier))[0] || chests[0] || null : null);
    const remaining = activeChest?.count || 0;

    const modal = modalTier ? (
        <div className="chest-modal" onClick={phase === "revealed" ? closeModal : undefined}>
            {phase === "shaking" ? (
                <div className="chest-stage">
                    <div className="chest-glowpad" style={{ "--chest": activeChest?.color }} />
                    <div className="chest-shake">
                        {activeChest?.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="chest-img-big" src={activeChest.image} alt="" />
                        ) : (
                            <ChestIcon className="chest-img-big" tier={modalTier} />
                        )}
                    </div>
                    <p className="chest-opening">Opening…</p>
                </div>
            ) : bulk ? (
                <BulkReveal bulk={bulk} onClose={closeModal}
                    onAgain={bulk.more > 0 ? () => openAll(bulk.tier) : null} />
            ) : (
                <RewardReveal reveal={reveal} onClose={closeModal} onAgain={remaining > 0 ? () => open(modalTier) : null} />
            )}
        </div>
    ) : null;

    return (
        <section className="card chest-card">
            <h2 style={{ marginTop: 0 }}>🎁 Loot chests {total ? <span className="chest-total">{total}</span> : null}</h2>
            {total ? (
                <>
                    {/* Said "earned every time you level up", which was the OTHER half of the chest leak: the
                        Rewards Track promises a Gold Chest every tenth level and this line promised one every
                        level. Fixing the grant alone would have left this copy lying in the opposite
                        direction. Chests come from most of the game, so say that rather than name one source. */}
                    <p className="muted" style={{ marginTop: 0 }}>A Gold Chest every 10th level — plus whatever the boss, the delves, the sea and your dailies turn up. Tap to open.</p>
                    <div className="chest-grid">
                        {chests.map((c) => (
                            /* A tile used to BE the button. It carries two now — open one, or open the stack —
                               so it is a container with buttons inside it rather than a button with a button
                               inside it, which is invalid markup and would have swallowed one of the taps. */
                            <div key={c.tier} className="chest-tile" style={{ "--chest": c.color }}>
                                <button type="button" className="chest-tile-one" onClick={() => open(c.tier)} disabled={busy}>
                                    {c.image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img className="chest-img" src={c.image} alt="" />
                                    ) : (
                                        <ChestIcon className="chest-img" tier={c.tier} />
                                    )}
                                    <span className="chest-name">{c.label}</span>
                                    <span className="chest-count">×{c.count}</span>
                                </button>
                                {/* Only worth offering when there is a stack. On a single chest "open all"
                                    and "open" are the same tap with two names. */}
                                {c.count > 1 ? (
                                    <button type="button" className="chest-tile-all" onClick={() => openAll(c.tier)} disabled={busy}>
                                        Open all {c.count}
                                    </button>
                                ) : null}
                            </div>
                        ))}
                    </div>
                    {/* The whole pile, richest first. Only when there is more than one tier to sweep — with a
                        single tier on the shelf its own "open all" already is this button. */}
                    {chests.length > 1 ? (
                        <button type="button" className="chest-openall" onClick={() => openAll(null)} disabled={busy}>
                            Open all {total} chests
                        </button>
                    ) : null}
                </>
            ) : <p className="muted" style={{ margin: 0 }}>No chests right now — level up to earn one.</p>}

            {mounted && modal ? createPortal(modal, document.body) : null}
        </section>
    );
}

// A gem's painted sprite, falling back to the cut-diamond glyph exactly as the Jewelcutter's own GemArt does.
function GemReveal({ gem }) {
    const [broken, setBroken] = useState(false);
    if (!gem?.art || broken) return <GiCutDiamond className="chest-reward-glyph" aria-hidden="true" />;
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="chest-reward-glyph" src={gem.art} alt="" draggable="false" onError={() => setBroken(true)} />;
}

// The full-screen celebration: flash → light rays + particle burst → the reward slams in.
// ── WHAT CAME OUT OF THE PILE ────────────────────────────────────────────────────────────────────────────────
// One card for the whole sweep. Every reveal the server sent, described in one line each and ordered BEST
// FIRST, because a list of twenty-eight in the order they happened buries the mythic under nine bundles of
// wheat. Identical lines fold together with a count for the same reason.
//
// It deliberately does NOT reuse RewardReveal's full-screen treatment per row: that treatment is a
// celebration of one thing, and twenty-eight celebrations is the problem this exists to solve.
function bulkLine(o) {
    if (o.item) return { name: o.item.name, sub: o.item.slot || "gear", rarity: o.item.rarity || "common" };
    if (o.pet) return { name: o.pet.name, sub: "companion", rarity: o.pet.rarity || "rare" };
    if (o.gem) return { name: o.gem.name, sub: "gem", rarity: rarityOf(o) };
    if (o.recipe) return { name: o.recipe.name, sub: "recipe", rarity: "epic" };
    if (o.consumable) return { name: o.consumable.name, sub: o.consumable.kind || "supply", rarity: rarityOf(o) };
    if (Array.isArray(o.seeds) && o.seeds.length) {
        return { name: o.seeds.length === 1 ? `${o.seeds[0].name} seed` : `${o.seeds.length} seeds`, sub: "for the farm", rarity: rarityOf(o) };
    }
    if (o.piece) return { name: "A set piece", sub: "gear", rarity: rarityOf(o) };
    if (o.parts) return { name: `${o.parts.n} ${o.parts.name}`, sub: "you own every piece it could have given", rarity: "common" };
    if (o.gold) return { name: `+${Number(o.gold).toLocaleString()} gold`, sub: "already owned the gear", rarity: "common" };
    return { name: "Something", sub: "", rarity: rarityOf(o) };
}

function BulkReveal({ bulk, onClose, onAgain }) {
    const rows = [];
    const put = (line) => {
        const key = `${line.name}|${line.sub}|${line.rarity}`;
        const found = rows.find((r) => r.key === key);
        if (found) found.n += 1;
        else rows.push({ ...line, key, n: 1 });
    };
    for (const o of bulk.opens || []) {
        put(bulkLine(o));
        // A chest can hand over TWO pieces — Twin Hinges is a once-a-day double and openChest returns the
        // extra as `second`. Named on its own row: dropping it would be the summary quietly under-reporting
        // the best thing that can happen to a chest.
        if (o.second) put({ name: o.second.name, sub: "gear · doubled", rarity: o.second.rarity || "common" });
    }
    rows.sort((a, z) => RARITY_RANK(z.rarity) - RARITY_RANK(a.rarity) || z.n - a.n || a.name.localeCompare(z.name));
    const best = rows[0]?.rarity || "common";
    return (
        /* The best rarity tints the CARD, so --r is set on the root rather than the header — the border and the
           glow read it too, which is how a pile that turned up a legendary looks different from one that did
           not before a word is read. */
        <div className="chest-reveal chest-bulk" style={{ "--r": RARITY_COLOR[best] || RARITY_COLOR.common }} onClick={(e) => e.stopPropagation()}>
            <div className="chest-bulk-head">
                <b>{bulk.opened} chest{bulk.opened === 1 ? "" : "s"} opened</b>
                {bulk.more > 0 ? <em>{bulk.more} still on the shelf</em> : null}
            </div>
            <div className="chest-bulk-list">
                {rows.map((r) => (
                    <div key={r.key} className="chest-bulk-row" style={{ "--r": RARITY_COLOR[r.rarity] || RARITY_COLOR.common }}>
                        <b>{r.name}</b>
                        <span>{r.sub}</span>
                        {r.n > 1 ? <em>×{r.n}</em> : null}
                    </div>
                ))}
            </div>
            <div className="chest-modal-actions">
                {onAgain ? <button type="button" className="button gold" onClick={onAgain}>Open {Math.min(bulk.more, 10)} more</button> : null}
                <button type="button" className="button" onClick={onClose}>Done</button>
            </div>
        </div>
    );
}

function RewardReveal({ reveal, onClose, onAgain }) {
    const rarity = rarityOf(reveal);
    const color = RARITY_COLOR[rarity] || RARITY_COLOR.common;
    const big = BIG_RARITIES.has(rarity);
    const isItem = Boolean(reveal?.item);
    const isConsumable = Boolean(reveal?.consumable);
    const isPet = Boolean(reveal?.pet);
    // A recipe is one of the things a chest can CONTAIN now, so it gets a reveal like everything else rather
    // than riding along as a side field on whatever the chest actually gave you.
    const isRecipe = Boolean(reveal?.recipe);
    // A GEM IS A THING A CHEST CAN CONTAIN, and nothing here knew that. openChest() has returned {gem} since
    // chests became the Jewelcutter's supply line, but this component branched on item/consumable/pet/recipe
    // and nothing else — so a gem fell through to the final `else`, which is the DUST branch. Four members
    // were handed a real gem and told "You already own that gear — take the dust!" over a "+undefined gold".
    // The gem was always granted; only the telling of it was broken.
    const isGem = Boolean(reveal?.gem);
    // ── AND SEEDS, WHICH A CHEST CAN NOW CONTAIN ─────────────────────────────────────────────────────────
    // Added WITH the branch below, not before it. Everything this component does not recognise falls through
    // to the DUST branch, and the comment two lines up is the receipt: four members were handed a real gem
    // and told "You already own that gear — take the dust!" That is the whole cost of returning a new kind
    // from the server without teaching the reveal about it.
    const isSeeds = Array.isArray(reveal?.seeds) && reveal.seeds.length > 0;

    const particles = useMemo(() => {
        const n = PARTICLE_COUNT[rarity] || 16;
        const cols = [color, "#ffd75e", "#ffffff"];
        return Array.from({ length: n }, (_, i) => {
            const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.6;
            const dist = 110 + Math.random() * 150;
            return {
                tx: `${Math.cos(ang) * dist}px`,
                ty: `${Math.sin(ang) * dist - 15}px`,
                rot: `${Math.random() * 720 - 360}deg`,
                delay: `${Math.random() * 0.12}s`,
                c: cols[i % cols.length],
                sz: `${6 + Math.random() * 9}px`,
                round: i % 2 === 0,
            };
        });
    }, [rarity, color]);

    return (
        <div className="chest-stage" onClick={(e) => e.stopPropagation()}>
            <div className="chest-flash" style={{ "--rar": color }} />
            <div className={`chest-reward-wrap${big ? " slam" : ""}`}>
                <div className="chest-rays" style={{ "--rar": color }} />
                <div className="chest-particles" aria-hidden="true">
                    {particles.map((p, i) => (
                        <span
                            key={i}
                            className={`chest-particle${p.round ? " round" : ""}`}
                            style={{ "--tx": p.tx, "--ty": p.ty, "--rot": p.rot, "--pc": p.c, "--sz": p.sz, animationDelay: p.delay }}
                        />
                    ))}
                </div>
                <div className={`chest-reward rar-${rarity}`} style={{ "--rar": color }}>
                    <span className="chest-rarity-tag">{isSeeds ? "SEEDS" : isRecipe ? "RECIPE" : isConsumable ? (reveal.consumable.kind === "relic" ? "RELIC" : "CONSUMABLE") : isPet ? "🐾 PET" : (RARITY_LABEL[rarity] || rarity)}</span>
                    {isSeeds ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/ui/seed.png" alt="" className="chest-reward-glyph" draggable="false" />
                            <div className="chest-reward-name">
                                {reveal.seeds.length > 1 ? `${reveal.seeds.length} seeds` : reveal.seeds[0].name}
                            </div>
                            <div className="chest-reward-sub muted">
                                {reveal.seeds.map((x) => `${x.emoji || "🌱"} ${x.name}`).join(" · ")} — planted in your seed bag.
                            </div>
                        </>
                    ) : isRecipe ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/images/cooking/dish.png" alt="" className="chest-reward-glyph" draggable="false" />
                            <div className="chest-reward-name">{reveal.recipe.name}</div>
                            <div className="chest-reward-sub muted">A new recipe for the Kitchen&rsquo;s book.</div>
                        </>
                    ) : isPet ? (
                        <>
                            <PetArt id={reveal.pet.id} className="chest-reward-glyph" />
                            <div className="chest-reward-name">{reveal.pet.name}</div>
                            <div className="chest-reward-sub muted">New pet companion!{reveal.pet.hint ? ` ${reveal.pet.hint}` : ""}</div>
                        </>
                    ) : isItem ? (
                        <>
                            <ItemArt id={reveal.item.id} icon={reveal.item.icon} className="chest-reward-glyph" />
                            <div className="chest-reward-name">{reveal.item.name}</div>
                            {/* A chest can hand out a collection TROPHY as well as gear, and a trophy has no
                                slot and no combat stats — it pays for being owned. */}
                            <div className="chest-reward-sub muted">
                                {reveal.item.slot ? `${reveal.item.slot.replace("_", " ")} · ${statLine(reveal.item.stats)}` : "Collection piece"}
                            </div>
                            {reveal.item.signature ? <div className="chest-reward-sig">★ {reveal.item.signature.label} — {reveal.item.signature.desc}</div> : null}
                            {reveal.item.chargeReward ? <div className="chest-reward-sig" style={{ color: "#ffd75e" }}>🎁 Real-world reward: {reveal.item.chargeReward}</div> : null}
                        </>
                    ) : isGem ? (
                        <>
                            <GemReveal gem={reveal.gem} />
                            <div className="chest-reward-name">{reveal.gem.name}</div>
                            <div className="chest-reward-sub muted">{statLine(reveal.gem.stats, { bonus: true })} &middot; socket it at the Jewelcutter</div>
                        </>
                    ) : isConsumable ? (
                        <>
                            <ConsumableArt id={reveal.consumable.id} emoji={reveal.consumable.emoji} className="chest-reward-glyph" />
                            <div className="chest-reward-name">{reveal.consumable.name}</div>
                            <div className="chest-reward-sub muted">{reveal.consumable.desc}</div>
                        </>
                    ) : (
                        <>
                            {/* Parts ride ON the dust now — see the note in chests.js. A member who owns every
                                item at the rolled rarity is the one member for whom this chest could never
                                have paid gear, so the card leads with the thing that IS new. */}
                            {reveal?.parts?.sprite ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className="chest-reward-glyph" src={reveal.parts.sprite} alt="" draggable="false" />
                            ) : <span className="chest-reward-glyph">💰</span>}
                            <div className="chest-reward-name">
                                {reveal?.parts ? `+${reveal.parts.n} ${reveal.parts.name}` : `+${reveal?.gold} gold`}
                            </div>
                            <div className="chest-reward-sub muted">
                                {reveal?.parts
                                    ? `You own every piece it could have given you — so it paid the forge instead. +${reveal?.gold} gold as well.`
                                    : "You already own that gear — take the dust!"}
                            </div>
                        </>
                    )}
                </div>
                {reveal?.badgeDrop ? (
                    <div className="chest-badge-drop" role="status">
                        <span className="chest-badge-drop-icon" aria-hidden="true">{reveal.badgeDrop.icon || "🏅"}</span>
                        <span className="chest-badge-drop-text">
                            <strong>Rare badge drop!</strong>
                            <span>{reveal.badgeDrop.label}</span>
                        </span>
                    </div>
                ) : null}
            </div>
            <div className="chest-modal-actions">
                {onAgain ? <button type="button" className="button gold" onClick={onAgain}>Open another</button> : null}
                <button type="button" className="pill" onClick={onClose}>Done</button>
            </div>
        </div>
    );
}
