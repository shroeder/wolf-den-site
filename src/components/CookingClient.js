"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

// ── THE KITCHEN ──────────────────────────────────────────────────────────────────────────────────────────────
// Three things stacked: what you're holding, what you know how to make, and what you've upgraded. The recipe is
// the centre of it — an unknown recipe still shows, as a locked silhouette, because "there is something here
// you haven't found" is more interesting than a shorter list.

const TIER_RING = { 1: "#cfd8e3", 2: "#7ec8ff", 3: "#c9a2ff", 4: "#ffd75e", 5: "#ff9ec4" };
const pct = (v) => `${Math.round((Number(v) || 0) * 100)}%`;

export default function CookingClient({ initial }) {
    const [state, setState] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [dish, setDish] = useState(null);      // the reveal after a cook
    const [flash, setFlash] = useState(null);
    const [open, setOpen] = useState(null);      // the recipe whose card is expanded

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

    const cook = async (id) => {
        const d = await post({ action: "cook", recipe: id });
        if (d?.ok) { setDish(d); return; }
        setFlash(
            d?.error === "out_of_cooks" ? "The stove's had enough for today."
            : d?.error === "missing_ingredients" ? `You're out of ${d.missing}.`
            : d?.error === "not_learned" ? "You haven't found that recipe yet."
            : "That didn't work."
        );
        setTimeout(() => setFlash(null), 2200);
    };

    const upgrade = async (track) => {
        const d = await post({ action: "upgrade", track });
        if (!d?.ok) { setFlash(d?.error === "not_enough_gold" ? "Not enough gold." : "Couldn't upgrade that."); setTimeout(() => setFlash(null), 2000); }
    };

    const s = state || {};
    const cooksLeft = s.cooks?.left ?? 0;

    return (
        <div className="stack reveal ck">
            <section className="card ck-head">
                <div className="ck-head-row">
                    <div>
                        <h1 className="ck-title">🍳 The Kitchen</h1>
                        <p className="muted ck-sub">Everything you farm and everything you land ends up in here. Recipes turn up out in the world — cook one and see what comes out.</p>
                    </div>
                    <Link href="/marketplace/town" className="ck-back">← Town</Link>
                </div>
                <div className="ck-stats">
                    <span><b>Lv {s.level}</b> cook</span>
                    <span><b>{s.cooksTotal}</b> dishes</span>
                    <span><b>{s.known}</b>/{s.recipeTotal} recipes</span>
                    <span><b>{cooksLeft}</b>/{s.cooks?.max} cooks left today</span>
                    <span>🪙 {(s.gold || 0).toLocaleString()}</span>
                </div>
                {flash ? <div className="ck-flash">{flash}</div> : null}
            </section>

            {/* Owner test tools. The feature can't be judged from an empty pantry, and waiting real days for
                crops to grow to find that out isn't a test. */}
            {s.isOwner ? (
                <section className="card ck-dev">
                    <div className="ck-dev-title">🧪 Test kitchen <span className="muted">· owner only</span></div>
                    <div className="ck-dev-btns">
                        <button type="button" disabled={busy} onClick={() => post({ action: "dev_stock", what: "all" })}>Stock everything</button>
                        <button type="button" disabled={busy} onClick={() => post({ action: "dev_stock", what: "recipes" })}>All recipes</button>
                        <button type="button" disabled={busy} onClick={() => post({ action: "dev_stock", what: "ingredients" })}>Fill pantry</button>
                        <button type="button" disabled={busy} onClick={() => post({ action: "dev_reset" })}>Wipe kitchen</button>
                    </div>
                </section>
            ) : null}

            <section className="card">
                <div className="ck-sec">🧺 Pantry <span className="muted">· {s.pantryTotal || 0} ingredients</span></div>
                {(s.pantry || []).length === 0 ? (
                    <p className="muted ck-empty">Nothing in here yet. Harvest a crop or land a fish — you keep them both now.</p>
                ) : (
                    <div className="ck-pantry">
                        {s.pantry.map((p) => (
                            <span key={p.ref} className={`ck-ing is-${p.rarity}`} title={p.name}>
                                <span className="ck-ing-emoji">{p.emoji}</span>
                                <span className="ck-ing-n">{p.qty}</span>
                            </span>
                        ))}
                    </div>
                )}
            </section>

            <section className="card">
                <div className="ck-sec">📜 Recipes <span className="muted">· {s.known}/{s.recipeTotal} found</span></div>
                <div className="ck-recipes">
                    {(s.recipes || []).map((r) => {
                        const isOpen = open === r.id;
                        return (
                            <div key={r.id} className={`ck-recipe${r.known ? "" : " is-locked"}${isOpen ? " is-open" : ""}`} style={{ "--rt": TIER_RING[r.tier] }}>
                                <button type="button" className="ck-recipe-head" onClick={() => setOpen(isOpen ? null : r.id)} disabled={!r.known}>
                                    <span className="ck-recipe-emoji">{r.known ? r.emoji : "❔"}</span>
                                    <span className="ck-recipe-copy">
                                        <span className="ck-recipe-name">{r.known ? r.name : "Undiscovered recipe"}</span>
                                        <span className="ck-recipe-tier">{r.tierName}{r.known && r.timesCooked ? ` · cooked ${r.timesCooked}×` : ""}</span>
                                    </span>
                                    {r.known ? <span className={`ck-recipe-go${r.canCook ? " is-on" : ""}`}>{r.canCook ? "Ready" : "Short"}</span> : null}
                                </button>
                                {isOpen && r.known ? (
                                    <div className="ck-recipe-body">
                                        <p className="ck-recipe-flavor">&ldquo;{r.flavor}&rdquo;</p>
                                        <div className="ck-need">
                                            {(r.need || []).map((n) => (
                                                <span key={n.ref} className={`ck-need-item${n.enough ? "" : " is-short"}`}>
                                                    {n.emoji} {n.name} <b>{n.held}/{n.qty}</b>
                                                </span>
                                            ))}
                                        </div>
                                        <button type="button" className="ck-cook" disabled={busy || !r.canCook || cooksLeft <= 0} onClick={() => cook(r.id)}>
                                            {cooksLeft <= 0 ? "No cooks left today" : busy ? "Cooking…" : `🍳 Cook this (${r.tierName})`}
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="card">
                <div className="ck-sec">🔧 The kitchen <span className="muted">· spend gold to cook better</span></div>
                <div className="ck-tracks">
                    {(s.tracks || []).map((t) => (
                        <div key={t.id} className="ck-track">
                            <span className="ck-track-ico">{t.icon}</span>
                            <span className="ck-track-copy">
                                <span className="ck-track-name">{t.name} <span className="muted">Lv {t.level}/{t.max}</span></span>
                                <span className="ck-track-desc">{t.desc}</span>
                                <span className="ck-track-val">
                                    now <b>{t.kind === "pct" ? pct(t.valueNow) : `+${t.valueNow}`}</b>
                                    {t.maxed ? null : <> → <b>{t.kind === "pct" ? pct(t.valueNext) : `+${t.valueNext}`}</b></>}
                                </span>
                            </span>
                            {t.maxed
                                ? <span className="ck-track-max">MAX</span>
                                : <button type="button" className="ck-track-buy" disabled={busy || (s.gold || 0) < t.cost} onClick={() => upgrade(t.id)}>🪙 {t.cost.toLocaleString()}</button>}
                        </div>
                    ))}
                </div>
            </section>

            {/* The reveal. What came out of the pot is the payoff, so it gets the whole screen for a beat. */}
            {dish ? (
                <div className="ck-scrim" role="dialog" onClick={() => setDish(null)}>
                    <div className="ck-reveal" style={{ "--rt": dish.dish.tierColor }} onClick={(e) => e.stopPropagation()}>
                        <div className="ck-reveal-tier">{dish.dish.tierName}</div>
                        <div className="ck-reveal-emoji">{dish.dish.emoji}</div>
                        <div className="ck-reveal-name">{dish.dish.name}</div>
                        <p className="ck-reveal-desc">{dish.dish.desc}</p>
                        <div className="ck-reveal-tags">
                            {dish.bumped ? <span className="ck-tag heat">🔥 The heat caught it — a tier better!</span> : null}
                            {dish.portions > 1 ? <span className="ck-tag season">🧂 Second helping — ×{dish.portions}</span> : null}
                            {dish.freeCook ? <span className="ck-tag larder">🧺 The larder covered it — no ingredients used</span> : null}
                        </div>
                        <button type="button" className="ck-reveal-btn" onClick={() => setDish(null)}>Into the stash 🍽️</button>
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
.ck-back { flex: 0 0 auto; font-size: 0.82rem; font-weight: 800; color: #8fb8ff; text-decoration: none; }
.ck-stats { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 12px; font-size: 0.82rem; color: #b9c2cc; }
.ck-stats b { color: #ffd75e; }
.ck-flash { margin-top: 10px; padding: 8px 12px; border-radius: 10px; background: rgba(224,91,106,0.14); border: 1px solid rgba(224,91,106,0.4); color: #ffb4bc; font-size: 0.84rem; font-weight: 700; }
.ck-sec { font-weight: 800; font-size: 0.98rem; margin-bottom: 10px; }
.ck-empty { margin: 0; font-size: 0.85rem; }

.ck-dev { border-color: rgba(201,162,255,0.45) !important; }
.ck-dev-title { font-weight: 800; font-size: 0.9rem; margin-bottom: 8px; color: #c9a2ff; }
.ck-dev-btns { display: flex; flex-wrap: wrap; gap: 7px; }
.ck-dev-btns button { padding: 7px 12px; border-radius: 9px; font-size: 0.8rem; font-weight: 700; cursor: pointer;
    background: rgba(201,162,255,0.14); border: 1px solid rgba(201,162,255,0.42); color: #e6d8ff; }
.ck-dev-btns button:disabled { opacity: 0.5; cursor: default; }

.ck-pantry { display: flex; flex-wrap: wrap; gap: 7px; }
.ck-ing { display: inline-flex; align-items: center; gap: 5px; padding: 6px 10px; border-radius: 999px;
    background: rgba(255,255,255,0.05); border: 1px solid var(--ck-line); font-size: 0.85rem; }
.ck-ing.is-rare { border-color: rgba(126,200,255,0.5); }
.ck-ing.is-epic { border-color: rgba(201,162,255,0.5); }
.ck-ing.is-legendary { border-color: rgba(255,215,94,0.55); }
.ck-ing.is-mythic { border-color: rgba(255,158,196,0.55); }
.ck-ing-emoji { font-size: 1.05rem; }
.ck-ing-n { font-weight: 800; color: #ffd75e; }

.ck-recipes { display: flex; flex-direction: column; gap: 8px; }
.ck-recipe { border-radius: 12px; background: rgba(255,255,255,0.035); border: 1px solid var(--ck-line); overflow: hidden; }
.ck-recipe.is-open { border-color: var(--rt); }
.ck-recipe.is-locked { opacity: 0.55; }
.ck-recipe-head { display: flex; align-items: center; gap: 11px; width: 100%; padding: 11px 12px; background: none; border: none; cursor: pointer; text-align: left; font: inherit; color: inherit; }
.ck-recipe-head:disabled { cursor: default; }
.ck-recipe-emoji { font-size: 1.5rem; flex: 0 0 auto; }
.ck-recipe-copy { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.ck-recipe-name { font-weight: 800; font-size: 0.94rem; }
.ck-recipe-tier { font-size: 0.74rem; color: var(--rt); font-weight: 700; }
.ck-recipe-go { flex: 0 0 auto; font-size: 0.72rem; font-weight: 800; padding: 4px 9px; border-radius: 999px; background: rgba(255,255,255,0.07); color: #9aa0a6; }
.ck-recipe-go.is-on { background: rgba(74,208,127,0.16); color: #4ad07f; }
.ck-recipe-body { padding: 0 12px 12px; }
.ck-recipe-flavor { margin: 0 0 9px; font-size: 0.8rem; font-style: italic; color: #98a2ae; }
.ck-need { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.ck-need-item { font-size: 0.79rem; padding: 5px 9px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid var(--ck-line); }
.ck-need-item b { color: #4ad07f; }
.ck-need-item.is-short { border-color: rgba(224,91,106,0.45); }
.ck-need-item.is-short b { color: #e0685c; }
.ck-cook { width: 100%; padding: 11px; border-radius: 11px; font-weight: 800; font-size: 0.92rem; cursor: pointer;
    background: linear-gradient(180deg, #f0c46a, #c9932f); border: 1px solid rgba(255,225,150,0.7); color: #2a1d05; }
.ck-cook:disabled { opacity: 0.45; cursor: default; }

.ck-tracks { display: flex; flex-direction: column; gap: 8px; }
.ck-track { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.035); border: 1px solid var(--ck-line); }
.ck-track-ico { font-size: 1.35rem; flex: 0 0 auto; }
.ck-track-copy { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.ck-track-name { font-weight: 800; font-size: 0.9rem; }
.ck-track-desc { font-size: 0.76rem; color: #98a2ae; line-height: 1.3; }
.ck-track-val { font-size: 0.74rem; color: #b9c2cc; }
.ck-track-val b { color: #ffd75e; }
.ck-track-buy { flex: 0 0 auto; padding: 8px 12px; border-radius: 10px; font-weight: 800; font-size: 0.8rem; cursor: pointer;
    background: rgba(255,215,110,0.14); border: 1px solid rgba(255,215,110,0.42); color: #ffd75e; }
.ck-track-buy:disabled { opacity: 0.42; cursor: default; }
.ck-track-max { flex: 0 0 auto; font-size: 0.74rem; font-weight: 900; color: #4ad07f; }

.ck-scrim { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 20px;
    background: rgba(8,6,12,0.78); backdrop-filter: blur(3px); animation: ckIn .16s ease both; }
.ck-reveal { width: min(420px, 100%); padding: 26px 22px 20px; border-radius: 20px; text-align: center;
    background: linear-gradient(180deg, #241c33, #17121f); border: 2px solid var(--rt);
    box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 40px color-mix(in srgb, var(--rt) 30%, transparent);
    animation: ckPop .28s cubic-bezier(.2,.9,.3,1) both; }
.ck-reveal-tier { font-size: 0.72rem; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; color: var(--rt); }
.ck-reveal-emoji { font-size: 4.6rem; line-height: 1.1; margin: 6px 0 2px; animation: ckSteam 2.4s ease-in-out infinite; }
.ck-reveal-name { font-weight: 900; font-size: 1.24rem; }
.ck-reveal-desc { margin: 6px 0 0; font-size: 0.85rem; color: #b9c2cc; line-height: 1.4; }
.ck-reveal-tags { display: flex; flex-direction: column; gap: 6px; margin: 12px 0 4px; }
.ck-tag { font-size: 0.78rem; font-weight: 700; padding: 6px 10px; border-radius: 9px; }
.ck-tag.heat { background: rgba(255,140,60,0.16); color: #ffb86b; }
.ck-tag.season { background: rgba(126,200,255,0.14); color: #9dd4ff; }
.ck-tag.larder { background: rgba(74,208,127,0.14); color: #6fe0a0; }
.ck-reveal-btn { margin-top: 14px; width: 100%; padding: 12px; border-radius: 12px; font-weight: 800; cursor: pointer;
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.22); color: #f2ead9; }
@keyframes ckIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes ckPop { from { opacity: 0; transform: translateY(14px) scale(.94); } to { opacity: 1; transform: none; } }
@keyframes ckSteam { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-5px) rotate(1deg); } }
`;
