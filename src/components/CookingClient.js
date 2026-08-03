"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import CookingMinigame from "@/components/CookingMinigame";
import FeatureDailies from "@/components/FeatureDailies";

// Kitchen icons are SPRITES, never emoji — emoji are the OS's artwork and render differently on every device.
// Falls back to empty rather than a broken-image glyph, so a missing file is invisible instead of ugly.
function TrackIcon({ src, className }) {
    const [bad, setBad] = useState(false);
    if (bad || !src) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={src} alt="" draggable="false" onError={() => setBad(true)} />;
}

// ── Permanent credit: the Kitchen was aannw's idea — cook the things you grow and catch instead of just
// selling them. Her actual AI hero sprite is enshrined beside the kettle as a small medallion; tapping it
// tells the story. Hard-coded to the sprite blob on purpose, exactly like the Forge's tribute to Alstier1: a
// fixed dedication should not change or break if the account or its avatar later does.
// Reward-rarity colours for the reveal glow — the dish's tier colours the frame, the PRIZE colours the burst.
const REVEAL_RARITY = { common: "#9aa0a6", rare: "#7ec8ff", epic: "#c9a2ff", legendary: "#ffd75e", mythic: "#ff9ec4" };

const FOUNDER = {
    name: "aannw",
    sprite: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/art/mkt_buyer/1785396661309-480247-bgglm4dqeqalWevOldEeiNBuNtjiOy.webp",
};

// ── THE KITCHEN ──────────────────────────────────────────────────────────────────────────────────────────────
// Pantry, recipes, upgrades. Everything shows a SPRITE — raw ingredients reuse the crop and fish art the game
// already owns, dishes and prepped ingredients have their own. The emoji field is carried only as a fallback if
// a sprite row is ever missing, never as the intended look.
//
// Two kinds of recipe share the screen. A PREP makes an ingredient and says exactly which one; a DISH rolls a
// consumable from its tier and lists the whole pool it can roll from, so there is nothing to guess about what
// pressing the button gets you.

const TIER_RING = { 1: "#cfd8e3", 2: "#7ec8ff", 3: "#c9a2ff", 4: "#ffd75e", 5: "#ff9ec4" };
const pctText = (v) => `${Math.round((Number(v) || 0) * 100)}%`;
// How an upgrade track states its effect. A "chance" track reads as a bare percentage; Big Pot is a size
// increase you always get, so it reads with a plus. Same number, two different promises.
const fmtEffect = (t, v) => (t.kind === "pct" ? pctText(v) : t.kind === "boost" ? `+${pctText(v)}` : `+${v}`);

/** One ingredient/dish icon. Falls back to the emoji only when there is genuinely no sprite. */
function Art({ sprite, emoji, size = 34, alt = "" }) {
    if (sprite) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={sprite} alt={alt} width={size} height={size} style={{ width: size, height: size, objectFit: "contain" }} />;
    }
    return <span style={{ fontSize: size * 0.8, lineHeight: 1 }} aria-hidden="true">{emoji || "•"}</span>;
}

export default function CookingClient({ initial }) {
    const [state, setState] = useState(initial);
    const [showFounder, setShowFounder] = useState(false); // the aannw credit medallion
    const [busy, setBusy] = useState(false);
    const [playing, setPlaying] = useState(null);   // the recipe whose minigame is up
    const [result, setResult] = useState(null);
    // The kitchen had four stacked cards and upgrades were the LAST one, below a 64-row recipe list — so the
    // thing you spend gold on was the thing nobody scrolled to. Same tab treatment the recipe list already uses.
    const [view, setView] = useState("recipes");
    // Bumped after every finished cook so the dailies card re-reads its progress immediately — a bounty that
    // only updates on a page refresh reads as broken.
    const [dailyTick, setDailyTick] = useState(0);
    const [flash, setFlash] = useState(null);
    const [open, setOpen] = useState(null);
    // Where you came FROM. Tapping a missing prepped ingredient jumps to the recipe that makes it; this is the
    // breadcrumb back, so chasing a chain three deep doesn't strand you.
    const [trail, setTrail] = useState([]);
    const [tab, setTab] = useState("all");
    // The kettle gives itself a shake every few seconds. Randomised so it never falls into a metronome — a
    // predictable twitch reads as a broken loop, an unpredictable one reads as something alive.
    const [shaking, setShaking] = useState(false);
    useEffect(() => {
        let timer;
        const schedule = () => {
            timer = setTimeout(() => {
                setShaking(true);
                setTimeout(() => setShaking(false), 620);
                schedule();
            }, 4200 + Math.random() * 5200);
        };
        schedule();
        return () => clearTimeout(timer);
    }, []);

    const post = useCallback(async (body) => {
        setBusy(true);
        try {
            const r = await fetch("/api/marketplace/cooking", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
            });
            const d = await r.json().catch(() => ({}));
            if (d?.unlocked) setState(d);
            return d;
        } finally { setBusy(false); }
    }, []);

    const say = (msg) => { setFlash(msg); setTimeout(() => setFlash(null), 2300); };

    const finishCook = async ({ quality, chain }) => {
        const rec = playing;
        setPlaying(null);
        const d = await post({ action: "cook", recipe: rec.id, quality, chain });
        if (d?.ok) {
            setResult(d);
            setDailyTick((n) => n + 1);
            // Cooking spends ingredients and pays gold/XP — tell the site-wide HUD and the nav, so the coin
            // counter and the Kitchen's "dishes you can cook" badge both settle without needing a navigation.
            try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* SSR / no window */ }
            // A rising chord on the reveal, pitched by the rung — the same synthesised approach the minigame
            // uses, so no asset to load and nothing to go stale. Wrapped: blocked audio must never break the
            // reveal itself.
            try {
                const rw = d.made?.reward;
                const climb = rw?.rungs ? rw.rung / rw.rungs : 0.5;
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (Ctx) {
                    const ac = new Ctx();
                    const notes = climb >= 0.99 ? [523, 659, 784, 1047] : climb > 0.6 ? [440, 554, 659] : [349, 440];
                    notes.forEach((f, i) => {
                        const o = ac.createOscillator(); const g = ac.createGain();
                        o.type = "triangle"; o.frequency.setValueAtTime(f, ac.currentTime + i * 0.09);
                        g.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.09);
                        g.gain.exponentialRampToValueAtTime(0.13, ac.currentTime + i * 0.09 + 0.02);
                        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.09 + 0.42);
                        o.connect(g); g.connect(ac.destination);
                        o.start(ac.currentTime + i * 0.09); o.stop(ac.currentTime + i * 0.09 + 0.45);
                    });
                }
            } catch { /* audio is a bonus, never a requirement */ }
            return;
        }
        say(d?.error === "missing_ingredients" ? `You're out of ${d.missing}.`
            : d?.error === "not_learned" ? "You haven't found that recipe yet."
            : "That didn't work.");
    };

    const upgrade = async (track) => {
        const d = await post({ action: "upgrade", track });
        if (!d?.ok) say(d?.error === "not_enough_gold" ? "Not enough gold." : "Couldn't upgrade that.");
        else try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* SSR / no window */ }
    };

    const s = state || {};
    const cookedToday = s.cooks?.today ?? 0;
    const byId = useMemo(() => Object.fromEntries((s.recipes || []).map((r) => [r.id, r])), [s.recipes]);

    // Jump to the recipe that makes an ingredient, remembering where we were.
    const jumpTo = (recipeId, fromId) => {
        if (!byId[recipeId]) return;
        setTrail((t) => [...t, fromId]);
        setOpen(recipeId);
        setTab("all"); // the target may not be in the current filter, and a jump that lands on nothing is worse
        setTimeout(() => {
            document.getElementById(`ck-r-${recipeId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 40);
    };
    const goBack = () => {
        setTrail((t) => {
            const prev = t[t.length - 1];
            if (prev) {
                setOpen(prev);
                setTimeout(() => document.getElementById(`ck-r-${prev}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 40);
            }
            return t.slice(0, -1);
        });
    };

    const shown = useMemo(() => {
        const all = s.recipes || [];
        if (tab === "ready") return all.filter((r) => r.canCook);
        if (tab === "prep") return all.filter((r) => r.kind === "prep");
        if (tab === "dish") return all.filter((r) => r.kind === "dish");
        return all;
    }, [s.recipes, tab]);

    return (
        <div className="stack reveal ck">
            {/* HERO. The old header was a title, a three-line paragraph and a run-on stat line that wrapped
                mid-sentence — a wall of text where every other screen in the game leads with a picture. The
                kitchen's own building art is the banner, the blurb is one line, and the numbers are tiles. */}
            <section className="card ck-hero" style={s.art ? { "--ck-art": `url(${s.art})` } : undefined}>
                <div className="ck-hero-top">
                    <div className="ck-hero-id">
                        <h1 className="ck-title">The Kitchen</h1>
                        <p className="ck-sub">Cook what you farm and what you land.</p>
                    </div>
                    {/* Founder's medallion — aannw's hero sprite, permanently enshrined for dreaming up the Kitchen. */}
                    <button type="button" className="ck-founder" onClick={() => setShowFounder(true)} title={`Cooked up by ${FOUNDER.name}`} aria-label={`About the Kitchen — an idea by ${FOUNDER.name}`}>
                        {FOUNDER.sprite ? <img src={FOUNDER.sprite} alt={FOUNDER.name} draggable="false" /> : <span aria-hidden="true">🍳</span>}
                    </button>
                    <Link href="/marketplace/town" className="ck-back" aria-label="Back to Town">←</Link>
                </div>

                {showFounder ? (
                    <div className="ck-founder-scrim" role="dialog" aria-modal="true" onClick={() => setShowFounder(false)}>
                        <div className="ck-founder-card" onClick={(e) => e.stopPropagation()}>
                            <div className="ck-founder-hero">
                                {FOUNDER.sprite ? <img src={FOUNDER.sprite} alt={FOUNDER.name} draggable="false" /> : <span style={{ fontSize: 44 }} aria-hidden="true">🍳</span>}
                            </div>
                            <div className="ck-founder-kicker">🍳 Founder&apos;s Tribute</div>
                            <h3 className="ck-founder-name">{FOUNDER.name}</h3>
                            <p className="ck-founder-body">The Kitchen was <b>{FOUNDER.name}&apos;s</b> idea. She asked why everything you grow and everything you land just gets sold — and said there should be somewhere to actually cook it. So here it is. Her hero is enshrined beside the kettle as thanks. Every dish in the Den traces back to her.</p>
                            <button type="button" className="ck-founder-close" onClick={() => setShowFounder(false)}>Back to the kettle</button>
                        </div>
                    </div>
                ) : null}

                {/* THE KETTLE. Upgrading anything eventually changes the pot you're looking at, which is a far
                    better reward than a number moving in a list. It bubbles constantly and gives itself a shake
                    every few seconds so the screen is never completely still. */}
                {s.kettle?.sprite ? (
                    <div className="ck-kettle-wrap">
                        <div className={`ck-kettle${shaking ? " is-shaking" : ""}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={s.kettle.sprite} alt={`Your kitchen, stage ${s.kettle.stage} of 5`} className="ck-kettle-img" />
                            <span className="ck-bub b1" aria-hidden="true" />
                            <span className="ck-bub b2" aria-hidden="true" />
                            <span className="ck-bub b3" aria-hidden="true" />
                            <span className="ck-bub b4" aria-hidden="true" />
                        </div>
                        <div className="ck-kettle-meta">
                            <span className="ck-kettle-stage">Stage {s.kettle.stage}<i>/5</i></span>
                            <span className="ck-kettle-hint">
                                {s.kettle.nextAt
                                    ? `${s.kettle.nextAt - s.kettle.total} more upgrade${s.kettle.nextAt - s.kettle.total === 1 ? "" : "s"} to the next pot`
                                    : "The finest pot in the den"}
                            </span>
                        </div>
                    </div>
                ) : null}

                {/* There is no daily allowance any more — cook as much as you have ingredients for. This was a
                    pip bar counting down the five you were rationed; now it just says what you've done today,
                    which is a thing to be pleased about rather than a meter draining toward "come back
                    tomorrow". The real limit is the pantry, and the pantry is right below. */}
                <div className="ck-cooks">
                    <div className="ck-cooks-row">
                        <span className="ck-cooks-label">Cooked today</span>
                        <span className="ck-cooks-count"><b>{cookedToday}</b></span>
                    </div>
                    <p className="ck-cooks-note">No daily limit — the pantry is the only thing stopping you.</p>
                </div>

                {/* The five-tile stat grid that used to sit here is gone. "recipes" repeated the count in the
                    Recipes header immediately below it; "cooked" and "best run" both read 0 until you have
                    played enough for them to mean anything; and gold belongs beside the prices on the Upgrades
                    tab, where it is a decision rather than a fact. What remains above — the pot's stage and
                    cooks left — is the part that changes what you can do right now. */}
                {flash ? <div className="ck-flash">{flash}</div> : null}
            </section>

            <div className="ck-viewtabs">
                {[["recipes", "/images/cooking/tab-recipes.png", "Recipes"],
                  ["pantry", "/images/cooking/tab-pantry.png", "Pantry"],
                  ["upgrades", "/images/cooking/tab-upgrades.png", "Upgrades"]].map(([k, icon, label]) => (
                    <button key={k} type="button" className={`ck-viewtab${view === k ? " is-on" : ""}`} onClick={() => setView(k)}>
                        <TrackIcon src={icon} className="ck-viewtab-ico" />{label}
                    </button>
                ))}
            </div>

            {/* Same card Farm and Sailing carry, in the same spot. The Kitchen's three bounties have existed
                and been ticking server-side since launch — nothing ever rendered them, so nobody knew. */}
            <FeatureDailies feature="cooking" refreshKey={dailyTick} />

            <section className="card" hidden={view !== "pantry"}>
                <div className="ck-sec">Pantry <span className="muted">· {s.pantryTotal || 0} ingredients</span></div>
                {(s.pantry || []).length === 0 ? (
                    <p className="muted ck-empty">Nothing in here yet. Harvest a crop or land a fish — you keep them both now.</p>
                ) : (
                    <div className="ck-pantry">
                        {s.pantry.map((p) => (
                            <span key={p.ref} className={`ck-ing is-${p.rarity}`} title={p.name}>
                                <Art sprite={p.sprite} emoji={p.emoji} size={30} alt={p.name} />
                                <span className="ck-ing-n">{p.qty}</span>
                            </span>
                        ))}
                    </div>
                )}
            </section>

            <section className="card" hidden={view !== "recipes"}>
                <div className="ck-sec">Recipes <span className="muted">· {s.known}/{s.recipeTotal} found</span></div>
                <div className="ck-tabs">
                    {[["all", "All"], ["ready", "Ready"], ["prep", "Prep"], ["dish", "Dishes"]].map(([k, label]) => (
                        <button key={k} type="button" className={`ck-tab${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}>{label}</button>
                    ))}
                </div>
                <div className="ck-recipes">
                    {shown.length === 0 ? <p className="muted ck-empty">Nothing here yet.</p> : null}
                    {shown.map((r) => {
                        const isOpen = open === r.id;
                        return (
                            <div key={r.id} id={`ck-r-${r.id}`} className={`ck-recipe${r.known ? "" : " is-locked"}${isOpen ? " is-open" : ""}`} style={{ "--rt": TIER_RING[r.tier] }}>
                                {/* A locked recipe is now tappable too. "Undiscovered recipe" told you nothing
                                    and gave you nowhere to go; the sprite, what it makes and WHERE IT DROPS
                                    turn the same row into something to chase. */}
                                <button type="button" className="ck-recipe-head" onClick={() => setOpen(isOpen ? null : r.id)}>
                                    <span className={`ck-recipe-art${r.known ? "" : " is-dim"}`}>
                                        <Art sprite={r.sprite} emoji="🍽️" size={42} alt={r.name} />
                                    </span>
                                    <span className="ck-recipe-copy">
                                        <span className="ck-recipe-name">{r.name}</span>
                                        <span className="ck-recipe-tier">
                                            {r.tierName}{r.kind === "prep" ? " · prep" : ""}{r.known && r.timesCooked ? ` · made ${r.timesCooked}×` : ""}
                                        </span>
                                    </span>
                                    {r.known
                                        ? <span className={`ck-recipe-go${r.canCook ? " is-on" : ""}`}>{r.canCook ? "Ready" : "Short"}</span>
                                        : <span className="ck-recipe-go is-locked-tag">Not found</span>}
                                </button>
                                {isOpen ? (
                                    <div className="ck-recipe-body">
                                        {trail.length && isOpen ? (
                                            <button type="button" className="ck-crumb" onClick={goBack}>
                                                ← Back to {byId[trail[trail.length - 1]]?.name || "where you were"}
                                            </button>
                                        ) : null}
                                        <p className="ck-recipe-flavor">&ldquo;{r.flavor}&rdquo;</p>

                                        {!r.known ? (
                                            <div className="ck-howto">
                                                <span className={`ck-howto-ico is-${r.source?.key}`} aria-hidden="true">
                                                    {r.source?.key === "sea" ? "⚓" : r.source?.key === "chest" ? "🧰" : "🌾"}
                                                </span>
                                                <span>
                                                    <b>How to find it</b>
                                                    {r.source?.label}
                                                </span>
                                            </div>
                                        ) : null}

                                        <div className="ck-block-label">Needs</div>
                                        <div className="ck-need">
                                            {(r.need || []).map((n) => {
                                                const short = r.known && !n.enough;
                                                // Short of a PREPPED ingredient? Tap it and go make it. Short of a
                                                // raw one? Tap it and go get it. Hunting the list for whatever
                                                // produces "Risen Dough" was the worst part of using this screen.
                                                const canJump = short && n.madeBy;
                                                const canGather = short && !n.madeBy && n.gather;
                                                const body = (
                                                    <>
                                                        <Art sprite={n.sprite} emoji={n.emoji} size={22} alt={n.name} />
                                                        <span>{n.name}</span>
                                                        <b>{r.known ? `${n.held}/${n.qty}` : `×${n.qty}`}</b>
                                                        {canJump ? <em className="ck-need-go">make →</em> : null}
                                                        {/* Holding the SEED is the single most confusing near-miss: the farm's bag
                                                            lists it under the crop's own name, so "I need a carrot, the farm says I
                                                            have 7" reads as a bug. Say "plant" rather than "get" when that's the
                                                            actual situation — a title attribute never shows up on a phone. */}
                                                        {canGather ? <em className="ck-need-go">{n.seeds > 0 ? `plant (${n.seeds} seed${n.seeds === 1 ? "" : "s"}) →` : "get →"}</em> : null}
                                                    </>
                                                );
                                                if (canJump) {
                                                    return (
                                                        <button type="button" key={n.ref} className="ck-need-item is-short is-link"
                                                            title={`${n.madeBy.name} makes this`} onClick={() => jumpTo(n.madeBy.id, r.id)}>
                                                            {body}
                                                        </button>
                                                    );
                                                }
                                                if (canGather) {
                                                    return <Link key={n.ref} href={n.gather.href} className="ck-need-item is-short is-link" title={n.gather.label}>{body}</Link>;
                                                }
                                                return <span key={n.ref} className={`ck-need-item${short ? " is-short" : ""}`}>{body}</span>;
                                            })}
                                        </div>

                                        <div className="ck-block-label">Makes</div>
                                        {r.makes ? (
                                            <div className="ck-makes">
                                                <Art sprite={r.makes.sprite} emoji="🧂" size={30} alt={r.makes.name} />
                                                <span><b>{r.makes.name}</b> — a prepped ingredient other recipes call for.</span>
                                            </div>
                                        ) : (
                                            <div className="ck-pool">
                                                {/* The gold is GUARANTEED and stated first — the roll is a bonus on top. Listing
                                                    only the roll made cooking look like a lottery with a lot of blanks. */}
                                                <p className="ck-pool-intro">
                                                    <b>How well you cook decides which one you get.</b> Bottom rung for a rough
                                                    run, top rung for a flawless one — and a run of {s.bump?.flawlessAt ?? 92}%+
                                                    also bumps you onto the next tier&rsquo;s ladder entirely.
                                                </p>
                                                {/* Rendered TOP-RUNG FIRST so the best outcome is what you see, and numbered so
                                                    the ladder reads as a ladder. The old list was sorted by likelihood, which
                                                    looked identical and meant something completely different. */}
                                                <div className="ck-ladder">
                                                    {[...(r.payout?.pool || [])].reverse().map((c) => (
                                                        <div key={c.rung} className={`ck-pool-row is-${c.rarity || "common"}`}>
                                                            <span className="ck-rung">{c.rung}</span>
                                                            <span className="ck-pool-art"><Art sprite={c.sprite} emoji={c.emoji} size={30} alt={c.name} /></span>
                                                            <span className="ck-pool-copy">
                                                                <b>{c.name}</b>
                                                                <span>{c.desc}</span>
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {r.known ? (
                                            <button type="button" className="btn ck-cook" disabled={busy || !r.canCook} onClick={() => setPlaying(r)}>
                                                {busy ? "Working…" : r.kind === "prep" ? "Start prepping" : "Start cooking"}
                                            </button>
                                        ) : (
                                            <p className="ck-locked-note">You haven&rsquo;t found this recipe yet — keep at it and it&rsquo;ll turn up.</p>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="card" hidden={view !== "upgrades"}>
                {/* Gold moved here from the old stat grid — beside the prices, where it is the number you are
                    actually weighing an upgrade against. */}
                <div className="ck-sec">The kitchen <span className="muted">· 🪙 {(s.gold || 0).toLocaleString()} to spend</span></div>
                {/* The SAME cards Sailing uses (.sail-upgrades / .sail-upg) rather than a bespoke kitchen list —
                    icon chip, level bar, a "now → next" effect row and a gold buy button. An upgrade should look
                    and behave identically wherever you meet one. */}
                <div className="sail-upgrades is-forge">
                    {(s.tracks || []).map((t) => (
                        <div className={`sail-upg${t.maxed ? " is-maxed" : ""}`} key={t.id}>
                            <div className="sail-upg-top">
                                <span className="sail-upg-title"><span className="sail-upg-ico"><TrackIcon src={t.icon} /></span>{t.name}</span>
                                <span className="muted sail-upg-lv">Lv {t.level}/{t.max}</span>
                            </div>
                            <div className="sail-upg-bar" aria-hidden="true">
                                <span style={{ width: `${t.max ? Math.min(100, (t.level / t.max) * 100) : 0}%` }} />
                            </div>
                            <p className="muted sail-upg-desc">{t.desc}</p>
                            <div className="sail-upg-effect">
                                <span>{t.kind === "pct" ? "Chance" : t.kind === "boost" ? "Serving" : "Extra"}</span>
                                <b>
                                    {fmtEffect(t, t.valueNow)}
                                    {t.maxed ? null : <> → <span className="sail-upg-next">{fmtEffect(t, t.valueNext)}</span></>}
                                </b>
                            </div>
                            {t.maxed
                                ? <span className="sail-upg-maxed">MAXED</span>
                                : <button type="button" className="btn-ghost sail-upg-buy" disabled={busy || (s.gold || 0) < t.cost} onClick={() => upgrade(t.id)}>
                                    🪙 {t.cost.toLocaleString()}
                                </button>}
                        </div>
                    ))}
                </div>
            </section>

            {playing ? <CookingMinigame recipe={playing} onDone={finishCook} /> : null}

            {/* PORTALLED TO <body> ON PURPOSE. This card is a direct child of `.stack.reveal`, and
                `.reveal > *` applies `fade-in-up ... both` — fill-mode `both` leaves `transform: translateY(0)`
                on the element permanently. Any transform other than `none` makes an element the containing block
                for its own `position: fixed` children, so `inset: 0` stopped meaning "the viewport" and the
                payoff card laid itself out somewhere down a very long page. Rendering into <body> puts it
                outside every ancestor transform, stacking context and overflow on this page for good. */}
            {result && typeof document !== "undefined" ? createPortal((() => {
                const rw = result.made.reward;
                const topRung = Boolean(rw?.rungs && rw.rung >= rw.rungs);
                return (
                <div className="ck-scrim" role="dialog" onClick={() => setResult(null)}>
                    <div
                        className={`ck-reveal is-r${result.made.reward?.rung || 1}${result.bumped ? " is-bumped" : ""}`}
                        style={{ "--rt": result.made.tierColor, "--rr": REVEAL_RARITY[result.made.reward?.rarity] || result.made.tierColor }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* THE PAYOFF. This was the one reveal in the game with no effects at all — a static card
                            after a five-step minigame. Everything below scales with the RUNG you landed on, so a
                            top-rung cook is visibly louder than a consolation one and you can tell before reading. */}
                        <span className="ck-reveal-rays" aria-hidden="true" />
                        <span className="ck-reveal-burst" aria-hidden="true" />
                        {topRung ? (
                            <span className="ck-reveal-sparks" aria-hidden="true">
                                {Array.from({ length: 14 }, (_, i) => (
                                    <i key={i} style={{ "--a": `${i * (360 / 14)}deg`, "--d": `${0.04 + (i % 5) * 0.05}s` }} />
                                ))}
                            </span>
                        ) : null}
                        <div className="ck-reveal-tier">{result.made.tierName} · {result.grade}</div>
                        <div className="ck-reveal-art"><Art sprite={result.made.sprite} emoji="🍽️" size={110} alt={result.made.name} /></div>
                        <div className="ck-reveal-name">{result.made.name}{result.portions > 1 ? ` ×${result.portions}` : ""}</div>
                        {result.made.reward ? (
                            <div className="ck-reveal-got">
                                {result.made.reward.rungs ? (
                                    <div className="ck-reveal-rung">
                                        <span className="ck-rung-pips" aria-hidden="true">
                                            {Array.from({ length: result.made.reward.rungs }, (_, i) => (
                                                <i key={i} className={i < result.made.reward.rung ? "is-on" : ""} style={{ "--i": `${i * 0.05}s` }} />
                                            ))}
                                        </span>
                                        Rung {result.made.reward.rung} of {result.made.reward.rungs}
                                        {topRung ? <b> · TOP OF THE LADDER</b> : null}
                                    </div>
                                ) : null}
                                <div className={`ck-reveal-prize is-${result.made.reward.rarity || "common"}`}>
                                    <Art sprite={result.made.reward.sprite} emoji={result.made.reward.emoji} size={44} alt={result.made.reward.name} />
                                    <span><b>{result.made.reward.name}</b><span>{result.made.reward.desc}</span></span>
                                </div>
                            </div>
                        ) : <p className="ck-reveal-desc">{result.made.desc}</p>}
                        <div className="ck-reveal-tags">
                            {result.bumped ? <span className="ck-tag heat">The heat caught it — a tier better</span> : null}
                            {result.portions > 1 ? <span className="ck-tag season">Second helping — ×{result.portions}</span> : null}
                            {result.freeCook ? <span className="ck-tag larder">The larder covered it — no ingredients used</span> : null}
                            <span className="ck-tag run">Timing {pctText(result.quality)} · best chain ×{result.chain} · +{result.xp} XP</span>
                        </div>
                        <button type="button" className="btn ck-reveal-btn" onClick={() => setResult(null)}>
                            {result.made.kind === "prep" ? "Into the pantry" : "Into the stash"}
                        </button>
                    </div>
                </div>
                );
            })(), document.body) : null}

            <style>{CK_CSS}</style>
        </div>
    );
}

const CK_CSS = `
.ck { --ck-line: rgba(255,255,255,0.09); }
/* HERO — the building art sits behind the title, faded and pushed right, so the header has an identity
   without costing legibility. */
.ck-hero { position: relative; overflow: hidden; }
.ck-hero::before { content: ""; position: absolute; right: -14px; top: 50%; transform: translateY(-50%);
    width: 190px; height: 190px; background-image: var(--ck-art); background-size: contain;
    background-repeat: no-repeat; background-position: center; opacity: 0.08; pointer-events: none; }
.ck-hero > * { position: relative; }
.ck-hero-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.ck-title { margin: 0; font-size: 1.55rem; line-height: 1.1; }
.ck-sub { margin: 3px 0 0; font-size: 0.85rem; color: #98a2ae; }
.ck-back { flex: 0 0 auto; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16); color: #cfd6dd;
    text-decoration: none; font-size: 1rem; font-weight: 800; }
.ck-back:hover { background: rgba(255,255,255,0.11); }
/* ── Founder's medallion (aannw) — a small hero circle beside the back arrow, mirroring the Forge's tribute
   to Alstier1 but in the kitchen's warm copper rather than the hearth's ember orange. ── */
.ck-founder { flex: 0 0 auto; width: 40px; height: 40px; border-radius: 50%; padding: 0; cursor: pointer; overflow: hidden;
    background: radial-gradient(circle at 50% 30%, #2a1c12, #0d0805); border: 2px solid rgba(224,158,80,0.4);
    box-shadow: 0 3px 12px rgba(0,0,0,0.55), inset 0 0 8px rgba(0,0,0,0.6);
    display: grid; place-items: center; transition: transform .18s cubic-bezier(.2,1.4,.35,1), box-shadow .18s, border-color .18s; }
.ck-founder img { width: 112%; height: 112%; object-fit: contain; object-position: center 8%; display: block; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6)); }
.ck-founder span { font-size: 19px; }
.ck-founder:hover, .ck-founder:focus-visible { transform: scale(1.12) rotate(-3deg); border-color: rgba(255,200,120,0.75); box-shadow: 0 5px 18px rgba(0,0,0,0.6), 0 0 16px rgba(230,170,90,0.5); outline: none; }
.ck-founder-scrim { position: fixed; inset: 0; z-index: 240; display: grid; place-items: center; padding: 20px; background: rgba(8,5,3,0.72); backdrop-filter: blur(3px); animation: ckFounderFade .2s ease both; }
.ck-founder-card { position: relative; max-width: 340px; width: 100%; text-align: center; padding: 22px 22px 18px; border-radius: 18px;
    background: linear-gradient(180deg, #2c1e12, #170f08); border: 1px solid rgba(224,158,80,0.45); box-shadow: 0 24px 70px rgba(0,0,0,0.7), 0 0 34px rgba(224,150,70,0.26);
    animation: ckFounderPop .32s cubic-bezier(.2,1.4,.35,1) both; }
.ck-founder-hero { width: 96px; height: 96px; margin: 0 auto 12px; border-radius: 50%; overflow: hidden; display: grid; place-items: center;
    background: radial-gradient(circle at 50% 28%, #261a10, #0c0704); border: 3px solid rgba(230,175,95,0.45); box-shadow: 0 6px 20px rgba(0,0,0,0.55), inset 0 0 14px rgba(0,0,0,0.6); }
.ck-founder-hero img { width: 108%; height: 108%; object-fit: contain; object-position: center 6%; display: block; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5)); }
.ck-founder-kicker { font-size: 10.5px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: #e9b981; }
.ck-founder-name { margin: 3px 0 8px; font-size: 1.35rem; font-weight: 900; color: #ffe4bd; text-shadow: 0 2px 8px rgba(224,140,50,0.45); }
.ck-founder-body { margin: 0 0 16px; font-size: 13px; line-height: 1.55; color: #eddcc6; }
.ck-founder-body b { color: #ffd39a; }
.ck-founder-close { width: 100%; padding: 10px; border-radius: 11px; border: none; cursor: pointer; font-weight: 900; font-size: 13px; color: #2a1a05; background: linear-gradient(180deg, #ffd89a, #e8a24a); box-shadow: 0 3px 0 #a86a24; }
.ck-founder-close:active { transform: translateY(2px); box-shadow: 0 1px 0 #a86a24; }
@keyframes ckFounderFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ckFounderPop { from { opacity: 0; transform: scale(.9) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }

/* THE KETTLE ────────────────────────────────────────────────────────────────────────────────────────────── */
.ck-kettle-wrap { display: flex; flex-direction: column; align-items: center; margin: 10px 0 2px; }
.ck-kettle { position: relative; width: 128px; height: 128px; display: grid; place-items: center;
    animation: ckSimmer 3.4s ease-in-out infinite; transform-origin: 50% 92%; }
.ck-kettle-img { width: 128px; height: 128px; object-fit: contain;
    filter: drop-shadow(0 6px 14px rgba(0,0,0,0.55)) drop-shadow(0 0 22px rgba(255,150,60,0.28)); }
/* A quick rattle, fired on a random timer from the component. */
.ck-kettle.is-shaking { animation: ckRattle .62s cubic-bezier(.36,.07,.19,.97); }
@keyframes ckSimmer {
    0%, 100% { transform: translateY(0) scale(1); }
    50%      { transform: translateY(-2px) scale(1.012); }
}
@keyframes ckRattle {
    0%, 100% { transform: translate(0, 0) rotate(0); }
    12% { transform: translate(-3px, 1px) rotate(-1.6deg); }
    28% { transform: translate(3px, -1px) rotate(1.4deg); }
    45% { transform: translate(-2px, 1px) rotate(-1deg); }
    62% { transform: translate(2px, 0) rotate(.7deg); }
    80% { transform: translate(-1px, 0) rotate(-.3deg); }
}
/* Bubbles rise out of the pot and pop. Four, each on its own offset, so the rhythm never repeats visibly. */
.ck-bub { position: absolute; left: 50%; bottom: 46%; width: 9px; height: 9px; border-radius: 50%;
    background: radial-gradient(circle at 34% 30%, rgba(255,255,255,0.9), rgba(255,196,120,0.55) 55%, rgba(255,150,60,0.15));
    box-shadow: 0 0 8px rgba(255,180,90,0.5); pointer-events: none; opacity: 0; }
.ck-bub.b1 { animation: ckBubble 2.6s ease-in infinite;         margin-left: -14px; }
.ck-bub.b2 { animation: ckBubble 3.1s ease-in .7s infinite;     margin-left: 2px; width: 7px; height: 7px; }
.ck-bub.b3 { animation: ckBubble 2.2s ease-in 1.4s infinite;    margin-left: 12px; width: 6px; height: 6px; }
.ck-bub.b4 { animation: ckBubble 3.6s ease-in 2.1s infinite;    margin-left: -4px; width: 11px; height: 11px; }
@keyframes ckBubble {
    0%   { opacity: 0; transform: translateY(0) scale(.5); }
    18%  { opacity: .95; transform: translateY(-10px) scale(1); }
    70%  { opacity: .8; transform: translateY(-34px) scale(1.05); }
    100% { opacity: 0; transform: translateY(-50px) scale(.4); }
}
.ck-kettle-meta { display: flex; flex-direction: column; align-items: center; gap: 1px; margin-top: 2px; }
.ck-kettle-stage { font-size: 0.78rem; font-weight: 900; color: #ffd75e; }
.ck-kettle-stage i { font-style: normal; color: #7a828c; font-size: 0.68rem; }
.ck-kettle-hint { font-size: 0.68rem; color: #7a828c; }

/* The actionable number, as a bar of pips — glanceable without reading. */
.ck-cooks { margin-top: 14px; }
.ck-cooks-row { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px; }
.ck-cooks-label { font-size: 0.7rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; color: #7a828c; }
.ck-cooks-count { font-size: 0.84rem; color: #98a2ae; }
.ck-cooks-count b { color: #ffd75e; font-size: 1.02rem; }
.ck-cooks-note { margin: 4px 0 0; font-size: 0.72rem; color: #7a828c; }
.ck-viewtab-ico { width: 20px; height: 20px; object-fit: contain; flex: 0 0 auto; }
.sail-upg-ico img { width: 22px; height: 22px; object-fit: contain; display: block; }

/* KPI tiles instead of a run-on sentence that wrapped mid-stat. */
.ck-kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 14px; }
.ck-kpi { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 8px 4px; border-radius: 10px;
    background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.07); text-align: center; }
.ck-kpi b { font-size: 0.94rem; font-weight: 900; color: #f2ead9; line-height: 1.1; }
.ck-kpi b i { font-style: normal; font-size: 0.74rem; color: #7a828c; font-weight: 700; }
.ck-kpi span { font-size: 0.62rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #7a828c; }
.ck-kpi.is-gold b { color: #ffd75e; }
@media (max-width: 420px) { .ck-kpis { grid-template-columns: repeat(3, 1fr); } }
.ck-flash { margin-top: 10px; padding: 8px 12px; border-radius: 10px; background: rgba(224,91,106,0.14); border: 1px solid rgba(224,91,106,0.4); color: #ffb4bc; font-size: 0.84rem; font-weight: 700; }
.ck-sec { font-weight: 800; font-size: 0.98rem; margin-bottom: 10px; }
.ck-empty { margin: 0; font-size: 0.85rem; }
    background: none; border: none; cursor: pointer; font: inherit; font-weight: 800; font-size: 0.9rem; color: #c9a2ff; }

.ck-pantry { display: flex; flex-wrap: wrap; gap: 7px; }
.ck-ing { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px 5px 6px; border-radius: 12px;
    background: rgba(255,255,255,0.05); border: 1px solid var(--ck-line); }
.ck-ing.is-rare { border-color: rgba(126,200,255,0.5); }
.ck-ing.is-epic { border-color: rgba(201,162,255,0.5); }
.ck-ing.is-legendary { border-color: rgba(255,215,94,0.55); }
.ck-ing.is-mythic { border-color: rgba(255,158,196,0.55); }
.ck-ing-n { font-weight: 800; color: #ffd75e; font-size: 0.85rem; }

/* Top-level view switch. Bigger and icon-led so it reads as navigation, not as another filter row — the
   recipe-category tabs (.ck-tab) sit INSIDE the recipes view and must stay visibly subordinate to these. */
.ck-viewtabs { display: flex; gap: 7px; margin: 0 0 12px; }
.ck-viewtab { flex: 1 1 0; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 11px 6px;
    border-radius: 12px; font-size: 0.86rem; font-weight: 900; cursor: pointer; color: #cbbfa8;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); }
.ck-viewtab span { font-size: 1.05rem; line-height: 1; }
.ck-viewtab.is-on { background: rgba(255,215,110,0.17); border-color: rgba(255,215,110,0.5); color: #ffd75e;
    box-shadow: 0 0 0 1px rgba(255,215,110,0.18) inset; }
.ck-tabs { display: flex; gap: 6px; margin-bottom: 11px; }
.ck-tab { flex: 1 1 0; padding: 7px 4px; border-radius: 9px; font-size: 0.8rem; font-weight: 800; cursor: pointer;
    background: rgba(255,255,255,0.05); border: 1px solid var(--ck-line); color: #b9c2cc; }
.ck-tab.is-on { background: rgba(255,215,110,0.16); border-color: rgba(255,215,110,0.45); color: #ffd75e; }

.ck-recipes { display: flex; flex-direction: column; gap: 8px; }
.ck-recipe { border-radius: 12px; background: rgba(255,255,255,0.035); border: 1px solid var(--ck-line); overflow: hidden; }
.ck-recipe.is-open { border-color: var(--rt); }
/* A locked recipe is dimmed, not hidden — you can still read it, which is the point. */
.ck-recipe.is-locked { opacity: 0.72; }
.ck-recipe.is-locked .ck-recipe-name { color: #b0b7c0; }
.ck-recipe-art.is-dim img { filter: grayscale(0.85) brightness(0.62); }
.ck-recipe-go.is-locked-tag { background: rgba(255,255,255,0.05); color: #7a828c; }
.ck-locked-note { margin: 4px 0 0; font-size: 0.78rem; color: #8b93a0; }
/* Where to go looking. The whole reason a locked row is worth tapping. */
.ck-howto { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border-radius: 10px; margin-bottom: 12px;
    background: rgba(126,200,255,0.07); border: 1px solid rgba(126,200,255,0.22); }
.ck-howto-ico { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; flex: 0 0 auto;
    font-size: 1rem; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); }
.ck-howto-ico.is-sea { border-color: rgba(126,200,255,0.45); }
.ck-howto-ico.is-farm { border-color: rgba(126,213,126,0.45); }
.ck-howto-ico.is-chest { border-color: rgba(255,215,94,0.45); }
.ck-howto > span:last-child { display: flex; flex-direction: column; gap: 1px; font-size: 0.79rem; color: #b9c2cc; }
.ck-howto b { font-size: 0.68rem; font-weight: 900; letter-spacing: .07em; text-transform: uppercase; color: #7ec8ff; }
.ck-recipe-head { display: flex; align-items: center; gap: 11px; width: 100%; padding: 10px 12px; background: none; border: none; cursor: pointer; text-align: left; font: inherit; color: inherit; }
.ck-recipe-head:disabled { cursor: default; }
.ck-recipe-art { flex: 0 0 auto; width: 42px; height: 42px; display: grid; place-items: center; }
.ck-recipe-copy { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.ck-recipe-name { font-weight: 800; font-size: 0.94rem; }
.ck-recipe-tier { font-size: 0.74rem; color: var(--rt); font-weight: 700; }
.ck-recipe-go { flex: 0 0 auto; font-size: 0.72rem; font-weight: 800; padding: 4px 9px; border-radius: 999px; background: rgba(255,255,255,0.07); color: #9aa0a6; }
.ck-recipe-go.is-on { background: rgba(74,208,127,0.16); color: #4ad07f; }
.ck-recipe-body { padding: 0 12px 12px; }
.ck-recipe-flavor { margin: 0 0 10px; font-size: 0.8rem; font-style: italic; color: #98a2ae; }
.ck-block-label { font-size: 0.66rem; font-weight: 900; letter-spacing: .09em; text-transform: uppercase; color: #7a828c; margin: 0 0 6px; }
.ck-need { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.ck-need-item { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; padding: 4px 9px 4px 5px; border-radius: 9px; background: rgba(255,255,255,0.05); border: 1px solid var(--ck-line); }
.ck-need-item b { color: #4ad07f; }
.ck-need-item.is-short { border-color: rgba(224,91,106,0.45); }
.ck-need-item.is-short b { color: #e0685c; }
/* A shortfall you can act on looks like a control, not a label. */
.ck-need-item.is-link { cursor: pointer; text-decoration: none; color: inherit; font: inherit;
    border-color: rgba(255,180,90,0.5); background: rgba(255,180,90,0.08); }
.ck-need-item.is-link:hover { background: rgba(255,180,90,0.16); }
.ck-need-go { font-style: normal; font-size: 0.68rem; font-weight: 900; color: #ffb86b; margin-left: 2px; }
.ck-crumb { display: inline-flex; align-items: center; margin: 0 0 8px; padding: 5px 11px; border-radius: 9px;
    font-size: 0.76rem; font-weight: 800; cursor: pointer; color: #8fb8ff;
    background: rgba(143,184,255,0.1); border: 1px solid rgba(143,184,255,0.3); }
.ck-makes { display: flex; align-items: center; gap: 10px; font-size: 0.82rem; color: #cfd6dd; margin-bottom: 12px; }
.ck-pool { margin-bottom: 12px; }
.ck-pool-intro { margin: 0 0 6px; font-size: 0.78rem; color: #98a2ae; }
.ck-payout { display: flex; align-items: center; gap: 9px; padding: 8px 11px; border-radius: 10px; margin-bottom: 9px;
    background: rgba(255,215,94,0.09); border: 1px solid rgba(255,215,94,0.28); font-size: 0.8rem; color: #cfd6dd; }
.ck-payout-ico { font-size: 1.05rem; }
.ck-payout b { color: #ffd75e; }
.ck-reveal-got { margin-top: 10px; }
.ck-reveal-prize { display: flex; align-items: center; gap: 11px; text-align: left; padding: 10px 12px; border-radius: 12px;
    background: rgba(255,255,255,0.05); border: 1px solid var(--rr, rgba(255,255,255,0.12)); }
.ck-reveal-prize.is-rare { --rr: #7ec8ff; } .ck-reveal-prize.is-epic { --rr: #c9a2ff; }
.ck-reveal-prize.is-legendary { --rr: #ffd75e; } .ck-reveal-prize.is-mythic { --rr: #ff9ec4; }
.ck-reveal-prize > span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ck-reveal-prize b { font-size: 0.95rem; color: var(--rr, #f2ead9); }
.ck-reveal-prize span span { font-size: 0.76rem; color: #98a2ae; line-height: 1.35; }
/* Every outcome is an item, so every outcome gets its picture and its rarity — a legendary drop should LOOK
   different from a handful of scrap before you've read a word of it. */
.ck-pool-row { display: flex; align-items: center; gap: 10px; padding: 7px 9px; border-radius: 10px; margin-bottom: 5px;
    background: rgba(255,255,255,0.035); border-left: 3px solid var(--rr, #8b93a0); }
.ck-pool-row.is-common { --rr: #cfd8e3; }
.ck-pool-row.is-rare { --rr: #7ec8ff; background: rgba(126,200,255,0.06); }
.ck-pool-row.is-epic { --rr: #c9a2ff; background: rgba(201,162,255,0.07); }
.ck-pool-row.is-legendary { --rr: #ffd75e; background: rgba(255,215,94,0.08); }
.ck-pool-row.is-mythic { --rr: #ff9ec4; background: rgba(255,158,196,0.09); box-shadow: inset 0 0 18px rgba(255,158,196,0.09); }
.ck-pool-art { flex: 0 0 auto; width: 30px; height: 30px; display: grid; place-items: center; }
.ck-pool-copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ck-pool-copy b { font-size: 0.81rem; color: var(--rr); }
.ck-pool-copy > span { font-size: 0.72rem; color: #8b93a0; line-height: 1.3; }
.ck-pool-intro b { color: #ffd75e; }
/* The ladder. A spine down the left makes the ordering the first thing you read. */
.ck-ladder { position: relative; padding-left: 4px; }
.ck-ladder::before { content: ""; position: absolute; left: 15px; top: 6px; bottom: 6px; width: 2px; border-radius: 2px;
    background: linear-gradient(180deg, #ff9ec4, #ffd75e 30%, #c9a2ff 60%, rgba(255,255,255,0.12)); opacity: .5; }
.ck-rung { position: relative; z-index: 1; flex: 0 0 auto; display: grid; place-items: center; width: 22px; height: 22px;
    border-radius: 50%; font-size: 0.66rem; font-weight: 900; color: #17121f; background: var(--rr, #8b93a0);
    box-shadow: 0 0 0 3px rgba(23,18,31,0.9); }
.ck-reveal-rung { font-size: 0.68rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; color: #7a828c; margin-bottom: 6px; }
.ck-cook { width: 100%; }
.sail-upg-maxed { margin-top: auto; text-align: center; font-size: 0.74rem; font-weight: 900; color: #4ad07f; padding: 7px 0; }


.ck-scrim { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 20px;
    background: rgba(8,6,12,0.78); backdrop-filter: blur(3px); animation: ckIn .16s ease both; }
.ck-reveal { width: min(420px, 100%); padding: 24px 22px 18px; border-radius: 20px; text-align: center;
    background: linear-gradient(180deg, #241c33, #17121f); border: 2px solid var(--rt);
    box-shadow: 0 20px 60px rgba(0,0,0,0.7); animation: ckPop .28s cubic-bezier(.2,.9,.3,1) both; }
.ck-reveal-tier { font-size: 0.7rem; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; color: var(--rt); position: relative; z-index: 2; }
/* ── THE PAYOFF ───────────────────────────────────────────────────────────────────────────────────────────
   Everything here scales with the RUNG. A consolation cook gets a soft glow; the top of the ladder gets rays,
   a full burst and sparks. You should be able to tell how well you did before you read a single word. */
.ck-reveal { position: relative; overflow: hidden; animation: ckRevealPop .42s cubic-bezier(.2,1.5,.35,1) both; }
.ck-reveal > *:not(.ck-reveal-rays):not(.ck-reveal-burst):not(.ck-reveal-sparks) { position: relative; z-index: 2; }
.ck-reveal-rays { position: absolute; top: 34%; left: 50%; width: 460px; height: 460px; margin: -230px 0 0 -230px;
    pointer-events: none; z-index: 0; opacity: 0; border-radius: 50%;
    background: repeating-conic-gradient(from 0deg, var(--rr) 0deg 7deg, transparent 7deg 20deg);
    -webkit-mask-image: radial-gradient(circle, #000 12%, transparent 62%); mask-image: radial-gradient(circle, #000 12%, transparent 62%);
    animation: ckRays 8s linear infinite, ckRaysIn .5s ease-out .08s forwards; }
.ck-reveal-burst { position: absolute; top: 34%; left: 50%; width: 260px; height: 260px; margin: -130px 0 0 -130px;
    pointer-events: none; z-index: 0; border-radius: 50%;
    background: radial-gradient(circle, var(--rr) 0%, transparent 68%); opacity: 0;
    animation: ckBurst .62s ease-out .05s forwards; }
.ck-reveal-sparks { position: absolute; top: 34%; left: 50%; width: 0; height: 0; z-index: 1; pointer-events: none; }
.ck-reveal-sparks i { position: absolute; width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px; border-radius: 50%;
    background: var(--rr); box-shadow: 0 0 10px 2px var(--rr); opacity: 0;
    transform: rotate(var(--a)) translateY(0); animation: ckSpark .72s ease-out var(--d) forwards; }
/* Rung 1-2 are consolations — dim the fireworks rather than firing them at full for a bad cook. */
.ck-reveal.is-r1 .ck-reveal-rays, .ck-reveal.is-r2 .ck-reveal-rays { opacity: 0 !important; animation: none; }
.ck-reveal.is-r1 .ck-reveal-burst, .ck-reveal.is-r2 .ck-reveal-burst { animation-duration: .4s; filter: saturate(.5); }
/* A tier bump is the loudest thing that can happen — the frame itself flashes. */
.ck-reveal.is-bumped { animation: ckRevealPop .42s cubic-bezier(.2,1.5,.35,1) both, ckBumpFlash 1.1s ease-out .3s 2; }
.ck-reveal-art { position: relative; z-index: 2; }
/* The ladder, as pips you can count. They fill left-to-right so the climb is visible. */
.ck-rung-pips { display: inline-flex; gap: 3px; vertical-align: middle; margin-right: 7px; }
.ck-rung-pips i { width: 12px; height: 4px; border-radius: 999px; background: rgba(255,255,255,0.14); }
.ck-rung-pips i.is-on { background: var(--rr); box-shadow: 0 0 7px var(--rr); animation: ckPip .32s ease-out var(--i) both; }
.ck-reveal-rung b { color: var(--rr); letter-spacing: .1em; }
@keyframes ckRevealPop { from { opacity: 0; transform: scale(.9) translateY(14px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes ckRays { to { transform: rotate(360deg); } }
@keyframes ckRaysIn { to { opacity: 0.16; } }
@keyframes ckBurst { 0% { opacity: .55; transform: scale(.35); } 100% { opacity: 0; transform: scale(1.7); } }
@keyframes ckSpark { 0% { opacity: 1; transform: rotate(var(--a)) translateY(6px); } 100% { opacity: 0; transform: rotate(var(--a)) translateY(120px); } }
@keyframes ckPip { from { opacity: 0; transform: scaleX(.2); } to { opacity: 1; transform: scaleX(1); } }
@keyframes ckBumpFlash { 0%,100% { box-shadow: 0 20px 60px rgba(0,0,0,0.7); } 50% { box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 46px var(--rt); } }
.ck-reveal-art { margin: 8px 0 4px; animation: ckSteam 2.4s ease-in-out infinite; }
.ck-reveal-name { font-weight: 900; font-size: 1.2rem; }
.ck-reveal-desc { margin: 6px 0 0; font-size: 0.84rem; color: #b9c2cc; line-height: 1.4; }
.ck-reveal-tags { display: flex; flex-direction: column; gap: 6px; margin: 12px 0 4px; }
.ck-tag { font-size: 0.77rem; font-weight: 700; padding: 6px 10px; border-radius: 9px; }
.ck-tag.heat { background: rgba(255,140,60,0.16); color: #ffb86b; }
.ck-tag.season { background: rgba(126,200,255,0.14); color: #9dd4ff; }
.ck-tag.larder { background: rgba(74,208,127,0.14); color: #6fe0a0; }
.ck-tag.run { background: rgba(255,255,255,0.06); color: #b9c2cc; }
.ck-reveal-btn { margin-top: 14px; width: 100%; }
@keyframes ckIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes ckPop { from { opacity: 0; transform: translateY(14px) scale(.94); } to { opacity: 1; transform: none; } }
@keyframes ckSteam { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
`;
