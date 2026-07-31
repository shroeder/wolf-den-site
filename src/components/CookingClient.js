"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import CookingMinigame from "@/components/CookingMinigame";

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
    const [busy, setBusy] = useState(false);
    const [playing, setPlaying] = useState(null);   // the recipe whose minigame is up
    const [result, setResult] = useState(null);
    const [flash, setFlash] = useState(null);
    const [open, setOpen] = useState(null);
    // Where you came FROM. Tapping a missing prepped ingredient jumps to the recipe that makes it; this is the
    // breadcrumb back, so chasing a chain three deep doesn't strand you.
    const [trail, setTrail] = useState([]);
    const [tab, setTab] = useState("all");
    const [devOpen, setDevOpen] = useState(false);
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
        if (d?.ok) { setResult(d); return; }
        say(d?.error === "out_of_cooks" ? "The stove's had enough for today."
            : d?.error === "missing_ingredients" ? `You're out of ${d.missing}.`
            : d?.error === "not_learned" ? "You haven't found that recipe yet."
            : "That didn't work.");
    };

    const upgrade = async (track) => {
        const d = await post({ action: "upgrade", track });
        if (!d?.ok) say(d?.error === "not_enough_gold" ? "Not enough gold." : "Couldn't upgrade that.");
    };

    const s = state || {};
    const cooksLeft = s.cooks?.left ?? 0;
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
                    <Link href="/marketplace/town" className="ck-back" aria-label="Back to Town">←</Link>
                </div>

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

                {/* The one number that decides whether you can act right now gets its own bar. */}
                <div className="ck-cooks">
                    <div className="ck-cooks-row">
                        <span className="ck-cooks-label">Cooks left today</span>
                        <span className="ck-cooks-count"><b>{cooksLeft}</b> / {s.cooks?.max ?? 0}</span>
                    </div>
                    <div className="ck-cooks-bar">
                        {Array.from({ length: s.cooks?.max ?? 0 }, (_, i) => (
                            <span key={i} className={`ck-pip${i < cooksLeft ? " is-on" : ""}`} />
                        ))}
                    </div>
                </div>

                <div className="ck-kpis">
                    <div className="ck-kpi"><b>Lv {s.level}</b><span>cook</span></div>
                    <div className="ck-kpi"><b>{(s.cooksTotal || 0).toLocaleString()}</b><span>cooked</span></div>
                    <div className="ck-kpi"><b>{s.known}<i>/{s.recipeTotal}</i></b><span>recipes</span></div>
                    <div className="ck-kpi"><b>{pctText(s.bestQuality)}</b><span>best run</span></div>
                    <div className="ck-kpi is-gold"><b>{(s.gold || 0).toLocaleString()}</b><span>gold</span></div>
                </div>
                {flash ? <div className="ck-flash">{flash}</div> : null}
            </section>

            {/* Collapsed by default. It's a dev tool, and expanded it was eating the entire first screen
                above the pantry and the recipes — the things the page is actually for. */}
            {s.isOwner ? (
                <section className="card ck-dev">
                    <button type="button" className="ck-dev-toggle" onClick={() => setDevOpen((v) => !v)} aria-expanded={devOpen}>
                        <span>Test kitchen <span className="muted">· owner only</span></span>
                        <span className="ck-dev-caret">{devOpen ? "▲" : "▼"}</span>
                    </button>
                    {devOpen ? (
                        <div className="ck-dev-btns">
                            <button type="button" className="btn-ghost" disabled={busy} onClick={() => post({ action: "dev_stock", what: "all" })}>Stock everything</button>
                            <button type="button" className="btn-ghost" disabled={busy} onClick={() => post({ action: "dev_stock", what: "recipes" })}>All recipes</button>
                            <button type="button" className="btn-ghost" disabled={busy} onClick={() => post({ action: "dev_stock", what: "ingredients" })}>Fill pantry</button>
                            <button type="button" className="btn-ghost" disabled={busy} onClick={() => post({ action: "dev_reset" })}>Wipe kitchen</button>
                        </div>
                    ) : null}
                </section>
            ) : null}

            <section className="card">
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

            <section className="card">
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
                                                        {canGather ? <em className="ck-need-go">get →</em> : null}
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
                                                    ONE of these, at random — likeliest first. A run of <b>{s.bump?.flawlessAt ?? 92}%+</b> bumps
                                                    the whole dish to the next tier&rsquo;s table; below that it&rsquo;s a chance.
                                                </p>
                                                {(r.payout?.pool || []).map((c, i) => (
                                                    <div key={i} className={`ck-pool-row is-${c.rarity || "common"}`}>
                                                        <span className="ck-pool-art"><Art sprite={c.sprite} emoji={c.emoji} size={30} alt={c.name} /></span>
                                                        <span className="ck-pool-copy">
                                                            <b>{c.name}</b>
                                                            <span>{c.desc}</span>
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {r.known ? (
                                            <button type="button" className="btn ck-cook" disabled={busy || !r.canCook || cooksLeft <= 0} onClick={() => setPlaying(r)}>
                                                {cooksLeft <= 0 ? "No cooks left today" : busy ? "Working…" : r.kind === "prep" ? "Start prepping" : "Start cooking"}
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

            <section className="card">
                <div className="ck-sec">The kitchen <span className="muted">· spend gold to cook better</span></div>
                {/* The SAME cards Sailing uses (.sail-upgrades / .sail-upg) rather than a bespoke kitchen list —
                    icon chip, level bar, a "now → next" effect row and a gold buy button. An upgrade should look
                    and behave identically wherever you meet one. */}
                <div className="sail-upgrades is-forge">
                    {(s.tracks || []).map((t) => (
                        <div className={`sail-upg${t.maxed ? " is-maxed" : ""}`} key={t.id}>
                            <div className="sail-upg-top">
                                <span className="sail-upg-title"><span className="sail-upg-ico">{t.icon}</span>{t.name}</span>
                                <span className="muted sail-upg-lv">Lv {t.level}/{t.max}</span>
                            </div>
                            <div className="sail-upg-bar" aria-hidden="true">
                                <span style={{ width: `${t.max ? Math.min(100, (t.level / t.max) * 100) : 0}%` }} />
                            </div>
                            <p className="muted sail-upg-desc">{t.desc}</p>
                            <div className="sail-upg-effect">
                                <span>{t.kind === "pct" ? "Chance" : "Extra"}</span>
                                <b>
                                    {t.kind === "pct" ? pctText(t.valueNow) : `+${t.valueNow}`}
                                    {t.maxed ? null : <> → <span className="sail-upg-next">{t.kind === "pct" ? pctText(t.valueNext) : `+${t.valueNext}`}</span></>}
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

            {playing ? <CookingMinigame recipe={playing} onDone={finishCook} onCancel={() => setPlaying(null)} /> : null}

            {result ? (
                <div className="ck-scrim" role="dialog" onClick={() => setResult(null)}>
                    <div className="ck-reveal" style={{ "--rt": result.made.tierColor }} onClick={(e) => e.stopPropagation()}>
                        <div className="ck-reveal-tier">{result.made.tierName} · {result.grade}</div>
                        <div className="ck-reveal-art"><Art sprite={result.made.sprite} emoji="🍽️" size={110} alt={result.made.name} /></div>
                        <div className="ck-reveal-name">{result.made.name}{result.portions > 1 ? ` ×${result.portions}` : ""}</div>
                        {result.made.reward ? (
                            <div className="ck-reveal-got">
                                <div className="ck-reveal-gold">🪙 {(result.goldPaid || 0).toLocaleString()} gold</div>
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
            ) : null}

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
.ck-cooks-bar { display: flex; gap: 4px; }
.ck-pip { flex: 1 1 0; height: 7px; border-radius: 999px; background: rgba(255,255,255,0.09); }
.ck-pip.is-on { background: linear-gradient(90deg, #f0c46a, #ffd75e); box-shadow: 0 0 8px rgba(255,215,94,0.45); }

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
.ck-dev { border-color: rgba(201,162,255,0.45) !important; }
.ck-dev-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0;
    background: none; border: none; cursor: pointer; font: inherit; font-weight: 800; font-size: 0.9rem; color: #c9a2ff; }
.ck-dev-caret { font-size: 0.7rem; opacity: .7; }
.ck-dev-btns { margin-top: 10px; }
.ck-dev-btns { display: flex; flex-wrap: wrap; gap: 7px; }

.ck-pantry { display: flex; flex-wrap: wrap; gap: 7px; }
.ck-ing { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px 5px 6px; border-radius: 12px;
    background: rgba(255,255,255,0.05); border: 1px solid var(--ck-line); }
.ck-ing.is-rare { border-color: rgba(126,200,255,0.5); }
.ck-ing.is-epic { border-color: rgba(201,162,255,0.5); }
.ck-ing.is-legendary { border-color: rgba(255,215,94,0.55); }
.ck-ing.is-mythic { border-color: rgba(255,158,196,0.55); }
.ck-ing-n { font-weight: 800; color: #ffd75e; font-size: 0.85rem; }

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
.ck-reveal-gold { font-size: 1.05rem; font-weight: 900; color: #ffd75e; margin-bottom: 8px; }
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
.ck-cook { width: 100%; }
.sail-upg-maxed { margin-top: auto; text-align: center; font-size: 0.74rem; font-weight: 900; color: #4ad07f; padding: 7px 0; }


.ck-scrim { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 20px;
    background: rgba(8,6,12,0.78); backdrop-filter: blur(3px); animation: ckIn .16s ease both; }
.ck-reveal { width: min(420px, 100%); padding: 24px 22px 18px; border-radius: 20px; text-align: center;
    background: linear-gradient(180deg, #241c33, #17121f); border: 2px solid var(--rt);
    box-shadow: 0 20px 60px rgba(0,0,0,0.7); animation: ckPop .28s cubic-bezier(.2,.9,.3,1) both; }
.ck-reveal-tier { font-size: 0.7rem; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; color: var(--rt); }
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
