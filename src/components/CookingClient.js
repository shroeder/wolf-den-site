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
            <section className="card ck-head">
                <div className="ck-head-row">
                    <div>
                        <h1 className="ck-title">The Kitchen</h1>
                        <p className="muted ck-sub">Everything you farm and everything you land ends up in here. Prep it, cook it, and time it well.</p>
                    </div>
                    <Link href="/marketplace/town" className="btn-ghost ck-back">← Town</Link>
                </div>
                <div className="ck-stats">
                    <span><b>Lv {s.level}</b> cook</span>
                    <span><b>{s.cooksTotal}</b> cooked</span>
                    <span><b>{s.known}</b>/{s.recipeTotal} recipes</span>
                    <span><b>{cooksLeft}</b>/{s.cooks?.max} left today</span>
                    <span>Best run <b>{pctText(s.bestQuality)}</b></span>
                    <span>🪙 {(s.gold || 0).toLocaleString()}</span>
                </div>
                {flash ? <div className="ck-flash">{flash}</div> : null}
            </section>

            {s.isOwner ? (
                <section className="card ck-dev">
                    <div className="ck-dev-title">Test kitchen <span className="muted">· owner only</span></div>
                    <div className="ck-dev-btns">
                        <button type="button" className="btn-ghost" disabled={busy} onClick={() => post({ action: "dev_stock", what: "all" })}>Stock everything</button>
                        <button type="button" className="btn-ghost" disabled={busy} onClick={() => post({ action: "dev_stock", what: "recipes" })}>All recipes</button>
                        <button type="button" className="btn-ghost" disabled={busy} onClick={() => post({ action: "dev_stock", what: "ingredients" })}>Fill pantry</button>
                        <button type="button" className="btn-ghost" disabled={busy} onClick={() => post({ action: "dev_reset" })}>Wipe kitchen</button>
                    </div>
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
                                <button type="button" className="ck-recipe-head" onClick={() => setOpen(isOpen ? null : r.id)} disabled={!r.known}>
                                    <span className="ck-recipe-art">
                                        {r.known ? <Art sprite={r.sprite} emoji="🍽️" size={42} alt={r.name} /> : <span className="ck-locked-mark" aria-hidden="true" />}
                                    </span>
                                    <span className="ck-recipe-copy">
                                        <span className="ck-recipe-name">{r.known ? r.name : "Undiscovered recipe"}</span>
                                        <span className="ck-recipe-tier">
                                            {r.tierName}{r.kind === "prep" ? " · prep" : ""}{r.known && r.timesCooked ? ` · made ${r.timesCooked}×` : ""}
                                        </span>
                                    </span>
                                    {r.known ? <span className={`ck-recipe-go${r.canCook ? " is-on" : ""}`}>{r.canCook ? "Ready" : "Short"}</span> : null}
                                </button>
                                {isOpen && r.known ? (
                                    <div className="ck-recipe-body">
                                        <p className="ck-recipe-flavor">&ldquo;{r.flavor}&rdquo;</p>

                                        <div className="ck-block-label">Needs</div>
                                        <div className="ck-need">
                                            {(r.need || []).map((n) => (
                                                <span key={n.ref} className={`ck-need-item${n.enough ? "" : " is-short"}`}>
                                                    <Art sprite={n.sprite} emoji={n.emoji} size={22} alt={n.name} />
                                                    <span>{n.name}</span>
                                                    <b>{n.held}/{n.qty}</b>
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

                                        <button type="button" className="btn ck-cook" disabled={busy || !r.canCook || cooksLeft <= 0} onClick={() => setPlaying(r)}>
                                            {cooksLeft <= 0 ? "No cooks left today" : busy ? "Working…" : r.kind === "prep" ? "Start prepping" : "Start cooking"}
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="card">
                <div className="ck-sec">The kitchen <span className="muted">· spend gold to cook better</span></div>
                <div className="ck-tracks">
                    {(s.tracks || []).map((t) => (
                        <div key={t.id} className="ck-track">
                            <span className="ck-track-ico" aria-hidden="true">{t.icon}</span>
                            <span className="ck-track-copy">
                                <span className="ck-track-name">{t.name} <span className="muted">Lv {t.level}/{t.max}</span></span>
                                <span className="ck-track-desc">{t.desc}</span>
                                <span className="ck-track-val">
                                    now <b>{t.kind === "pct" ? pctText(t.valueNow) : `+${t.valueNow}`}</b>
                                    {t.maxed ? null : <> → <b>{t.kind === "pct" ? pctText(t.valueNext) : `+${t.valueNext}`}</b></>}
                                </span>
                            </span>
                            {t.maxed
                                ? <span className="ck-track-max">MAX</span>
                                : <button type="button" className="btn-ghost ck-track-buy" disabled={busy || (s.gold || 0) < t.cost} onClick={() => upgrade(t.id)}>🪙 {t.cost.toLocaleString()}</button>}
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
.ck-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.ck-title { margin: 0 0 4px; font-size: 1.5rem; }
.ck-sub { margin: 0; font-size: 0.86rem; line-height: 1.4; max-width: 52ch; }
.ck-back { flex: 0 0 auto; }
.ck-stats { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 12px; font-size: 0.82rem; color: #b9c2cc; }
.ck-stats b { color: #ffd75e; }
.ck-flash { margin-top: 10px; padding: 8px 12px; border-radius: 10px; background: rgba(224,91,106,0.14); border: 1px solid rgba(224,91,106,0.4); color: #ffb4bc; font-size: 0.84rem; font-weight: 700; }
.ck-sec { font-weight: 800; font-size: 0.98rem; margin-bottom: 10px; }
.ck-empty { margin: 0; font-size: 0.85rem; }
.ck-dev { border-color: rgba(201,162,255,0.45) !important; }
.ck-dev-title { font-weight: 800; font-size: 0.9rem; margin-bottom: 8px; color: #c9a2ff; }
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
.ck-recipe.is-locked { opacity: 0.5; }
.ck-recipe-head { display: flex; align-items: center; gap: 11px; width: 100%; padding: 10px 12px; background: none; border: none; cursor: pointer; text-align: left; font: inherit; color: inherit; }
.ck-recipe-head:disabled { cursor: default; }
.ck-recipe-art { flex: 0 0 auto; width: 42px; height: 42px; display: grid; place-items: center; }
.ck-locked-mark { width: 26px; height: 26px; border-radius: 6px; background: rgba(255,255,255,0.09); border: 1px dashed rgba(255,255,255,0.25); }
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

.ck-tracks { display: flex; flex-direction: column; gap: 8px; }
.ck-track { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.035); border: 1px solid var(--ck-line); }
.ck-track-ico { font-size: 1.3rem; flex: 0 0 auto; }
.ck-track-copy { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.ck-track-name { font-weight: 800; font-size: 0.9rem; }
.ck-track-desc { font-size: 0.76rem; color: #98a2ae; line-height: 1.3; }
.ck-track-val { font-size: 0.74rem; color: #b9c2cc; }
.ck-track-val b { color: #ffd75e; }
.ck-track-buy { flex: 0 0 auto; }
.ck-track-max { flex: 0 0 auto; font-size: 0.74rem; font-weight: 900; color: #4ad07f; }

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
