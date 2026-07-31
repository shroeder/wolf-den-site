"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

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
    const [tab, setTab] = useState("all");
    const [devOpen, setDevOpen] = useState(false);

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
                            <div key={r.id} className={`ck-recipe${r.known ? "" : " is-locked"}${isOpen ? " is-open" : ""}`} style={{ "--rt": TIER_RING[r.tier] }}>
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
                                            {(r.need || []).map((n) => (
                                                <span key={n.ref} className={`ck-need-item${!r.known ? "" : n.enough ? "" : " is-short"}`}>
                                                    <Art sprite={n.sprite} emoji={n.emoji} size={22} alt={n.name} />
                                                    <span>{n.name}</span>
                                                    <b>{r.known ? `${n.held}/${n.qty}` : `×${n.qty}`}</b>
                                                </span>
                                            ))}
                                        </div>

                                        <div className="ck-block-label">Makes</div>
                                        {r.makes ? (
                                            <div className="ck-makes">
                                                <Art sprite={r.makes.sprite} emoji="🧂" size={30} alt={r.makes.name} />
                                                <span><b>{r.makes.name}</b> — a prepped ingredient other recipes call for.</span>
                                            </div>
                                        ) : (
                                            <div className="ck-pool">
                                                <p className="ck-pool-intro">One of these, at random — a good timing run can push it a tier higher:</p>
                                                {(r.pool || []).map((c) => (
                                                    <div key={c.id} className="ck-pool-row">
                                                        <b>{c.name}</b><span>{c.desc}</span>
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
                        <p className="ck-reveal-desc">{result.made.desc}</p>
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
    background-repeat: no-repeat; background-position: center; opacity: 0.13; pointer-events: none; }
.ck-hero > * { position: relative; }
.ck-hero-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.ck-title { margin: 0; font-size: 1.55rem; line-height: 1.1; }
.ck-sub { margin: 3px 0 0; font-size: 0.85rem; color: #98a2ae; }
.ck-back { flex: 0 0 auto; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16); color: #cfd6dd;
    text-decoration: none; font-size: 1rem; font-weight: 800; }
.ck-back:hover { background: rgba(255,255,255,0.11); }

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
.ck-makes { display: flex; align-items: center; gap: 10px; font-size: 0.82rem; color: #cfd6dd; margin-bottom: 12px; }
.ck-pool { margin-bottom: 12px; }
.ck-pool-intro { margin: 0 0 6px; font-size: 0.78rem; color: #98a2ae; }
.ck-pool-row { display: flex; flex-direction: column; gap: 1px; padding: 5px 9px; border-radius: 8px; background: rgba(255,255,255,0.035); margin-bottom: 4px; }
.ck-pool-row b { font-size: 0.8rem; }
.ck-pool-row span { font-size: 0.73rem; color: #8b93a0; line-height: 1.3; }
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
