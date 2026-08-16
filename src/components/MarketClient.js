"use client";

import { useCallback, useMemo, useState } from "react";
import { GiBasket, GiScrollUnfurled, GiShop } from "react-icons/gi";

import HowToPlay from "@/components/HowToPlay";

// ── THE MARKET ───────────────────────────────────────────────────────────────────────────────────────────────
// The stall front: what the Den has for sale, what you're selling, and what's on your own shelf that somebody
// else might want. Built on the Forge's shape — an immersive animated scene up top, then plain cards — because
// that is the layout that made the Forge feel like a place rather than a form.
//
// The scene's motes drift and the awnings breathe on their own. Per the house rule, the animation is not
// gated on prefers-reduced-motion: the ambience IS the feature here.

// ── Permanent credit: the Market was Sunflower Jinxx's idea ──────────────────────────────────────────────────
// She asked for it in global chat on 2026-08-15 — "trade/sell prepped food to people... so many people have
// said they have a cool recipe, but not the prepable required thing" — and it was built the same night. Her
// real hero sprite is enshrined at the corner of the square; tapping it tells the story. Same treatment as
// Alstier1 in the Forge, and hard-coded to the sprite blob on purpose so a fixed dedication can never break
// if her account or avatar changes later.
const FOUNDER = {
    name: "Sunflower Jinxx",
    sprite: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/1786426256619-77678.webp",
};

const RARITY = { common: "#9aa0a6", rare: "#7ec8ff", epic: "#c9a2ff", legendary: "#ffd75e", mythic: "#ff9ec4" };
const rarityColor = (r) => RARITY[r] || RARITY.common;
const KIND_LABEL = { crop: "Crop", fish: "Fish", prep: "Prepped" };

// Every failure the server can hand back, said in words a person can act on. An error code rendered raw is a
// dead end — you can see something went wrong and not what to do about it.
const ERRORS = {
    not_open: "The Market isn't open to you yet.",
    bad_item: "That isn't something the Market trades.",
    bad_qty: "Pick an amount between 1 and 999.",
    bad_price: "Set a price of at least 1 gold.",
    too_many_open: "You already have the most stalls one member can run. Pull one first.",
    not_enough: "You don't have that many any more.",
    could_not_list: "The stall wouldn't go up — your goods are back on your shelf.",
    gone: "Somebody just took that one.",
    your_own: "That's your own stall.",
    not_enough_gold: "You can't afford that.",
    bad_listing: "That stall is no longer there.",
};

export default function MarketClient({ initial }) {
    const [state, setState] = useState(initial);
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [bought, setBought] = useState(null);   // the sold-reveal
    // Open on whichever half of the market you can actually use. An empty board is the normal state early on,
    // and landing on "no stalls yet" when you're holding thirty sellable things is a dead end by default.
    const [tab, setTab] = useState((initial?.listings || []).length ? "buy" : "sell");
    const [selling, setSelling] = useState(null); // the ref being priced up
    const [showFounder, setShowFounder] = useState(false);
    const [qty, setQty] = useState(1);
    const [price, setPrice] = useState(10);

    const listings = state?.listings || [];
    const mine = state?.mine || [];
    const sellable = state?.sellable || [];
    const gold = Number(state?.gold || 0);

    const act = useCallback(async (body, tag) => {
        setBusy(tag);
        setError("");
        try {
            const r = await fetch("/api/marketplace/market", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify(body),
            });
            const d = await r.json();
            if (!d?.ok) {
                setError(ERRORS[d?.error] || "That didn't go through. Try again.");
                // A failed action still returns the CURRENT board when the server has one — a "somebody just
                // took that" that leaves the sold stall sitting there invites the same tap again.
                if (d?.listings) setState(d);
                return null;
            }
            setState(d);
            // The gold pill in the shell reads its own number; nudge it rather than let it disagree with this
            // screen until the next navigation.
            window.dispatchEvent(new Event("wolfden-hud-refresh"));
            return d;
        } catch {
            setError("The Market didn't answer. Try again.");
            return null;
        } finally {
            setBusy("");
        }
    }, []);

    const doBuy = async (l) => {
        const d = await act({ action: "buy", id: l.id }, `buy-${l.id}`);
        if (d?.bought) setBought(d.bought);
    };
    const doCancel = (l) => act({ action: "cancel", id: l.id }, `cancel-${l.id}`);
    const doList = async () => {
        if (!selling) return;
        const d = await act({ action: "list", ref: selling.ref, qty: askQty, unitGold: price }, "list");
        if (d?.ok) { setSelling(null); setTab("mine"); }
    };

    // What the Den is asking for this item elsewhere, shown while you price your own. Pricing blind is how a
    // market ends up with one stall at 5 gold and one at 500 — this is the live number where the decision is.
    const goingRate = useMemo(() => {
        if (!selling) return null;
        const others = (state?.listings || []).filter((l) => l.ref === selling.ref && !l.mine);
        if (!others.length) return null;
        return { low: Math.min(...others.map((l) => l.unitGold)), count: others.length };
    }, [selling, state]);

    // The amount is CLAMPED WHERE IT IS USED, not corrected after the fact in an effect. The shelf can shrink
    // underneath an open sheet (a cook, another stall), and a stale qty would otherwise be sent and bounced.
    const askQty = Math.max(1, Math.min(selling?.qty || 1, qty));
    const totalAsk = askQty * price;

    return (
        <div className="stack reveal mk">
            <style>{MARKET_CSS}</style>

            <HowToPlay
                id="market"
                emoji="🏪"
                title="the Market"
                accent="#5fd0a8"
                tagline="Sell what you grow, catch and prep — and buy the ingredient you're short of instead of farming for it."
                steps={[
                    "Anything on your pantry shelf can go up for sale: crops, fish and prepped ingredients.",
                    "Set a price per unit. Your goods leave your shelf the moment the stall goes up, so nothing can be sold twice.",
                    "Buy a stall outright and the goods land straight on your own shelf, ready to cook.",
                    "Pull a stall any time it hasn't sold and everything comes back to you.",
                ]}
            />

            {/* The market square — an immersive scene, like the Forge's hearth and the farm's pasture. */}
            <div className="mk-scene">
                <div className="mk-sky" aria-hidden="true" />
                <div className="mk-motes" aria-hidden="true">
                    {Array.from({ length: 16 }).map((_, i) => (
                        <span key={i} style={{ left: `${(i * 6.3 + 3) % 100}%`, animationDelay: `${(i * 0.6) % 7}s`, animationDuration: `${7 + (i % 6)}s` }} />
                    ))}
                </div>
                {/* The stall itself — the SAME sprite the town street draws, so the square you walk into is
                    visibly the building you tapped. It sits to the right and rocks gently; the title gets the
                    left half to itself so the two never fight for the same pixels. */}
                {state?.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="mk-art" src={state.art} alt="" draggable="false" aria-hidden="true" />
                ) : null}
                <div className="mk-scene-inner">
                    <h1 className="mk-title">The Market</h1>
                    {/* Deliberately NOT your gold — the HUD strip above already shows it, and repeating it here
                        cost the line the room it needed for the number you can't get anywhere else. */}
                    <p className="mk-tagline">
                        {listings.length ? `${listings.length} stall${listings.length === 1 ? "" : "s"}` : "No stalls yet"}
                        {mine.length ? ` · ${mine.length} yours` : ""}
                        {sellable.length ? ` · ${sellable.length} to sell` : ""}
                    </p>
                </div>

                {/* Founder's medallion — Sunflower Jinxx's hero, enshrined for asking for the place. */}
                <button
                    type="button" className="mk-founder" onClick={() => setShowFounder(true)}
                    title={`The Market was ${FOUNDER.name}'s idea`}
                    aria-label={`About the Market — an idea by ${FOUNDER.name}`}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {FOUNDER.sprite ? <img src={FOUNDER.sprite} alt={FOUNDER.name} draggable="false" /> : <span aria-hidden="true">★</span>}
                </button>
            </div>

            {showFounder ? (
                <div className="mk-scrim" role="dialog" aria-modal="true" onClick={() => setShowFounder(false)}>
                    <div className="mk-founder-card" onClick={(e) => e.stopPropagation()}>
                        <div className="mk-founder-hero">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {FOUNDER.sprite ? <img src={FOUNDER.sprite} alt={FOUNDER.name} draggable="false" /> : null}
                        </div>
                        <div className="mk-founder-kicker">Founder&apos;s Tribute</div>
                        <h3 className="mk-founder-name">{FOUNDER.name}</h3>
                        <p className="mk-founder-body">
                            The Market was <b>{FOUNDER.name}&apos;s</b> idea. She asked whether people could trade
                            and sell prepped food to each other — because so many of us have a recipe we love and
                            not the one ingredient it wants — and the square was built that same night. Her hero
                            keeps a stall here for good. Every trade made in the Den traces back to her asking.
                        </p>
                        <button type="button" className="mk-confirm" onClick={() => setShowFounder(false)}>Back to the square</button>
                    </div>
                </div>
            ) : null}

            <div className="mk-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "buy"} className={`mk-tab${tab === "buy" ? " on" : ""}`} onClick={() => setTab("buy")}>
                    Stalls{listings.length ? <b>{listings.length}</b> : null}
                </button>
                <button type="button" role="tab" aria-selected={tab === "sell"} className={`mk-tab${tab === "sell" ? " on" : ""}`} onClick={() => setTab("sell")}>
                    Sell{sellable.length ? <b>{sellable.length}</b> : null}
                </button>
                <button type="button" role="tab" aria-selected={tab === "mine"} className={`mk-tab${tab === "mine" ? " on" : ""}`} onClick={() => setTab("mine")}>
                    Yours{mine.length ? <b>{mine.length}</b> : null}
                </button>
            </div>

            {error ? <div className="mk-error" role="alert">{error}</div> : null}

            {tab === "buy" ? (
                <section className="card mk-panel">
                    <h3 className="mk-panel-h"><GiShop aria-hidden="true" /> Open stalls</h3>
                    <p className="mk-panel-sub">Cheapest first. Buying takes the whole stall — the goods go straight to your pantry.</p>
                    {listings.length ? (
                        <div className="mk-grid">
                            {listings.map((l) => (
                                <div key={l.id} className={`mk-card${l.mine ? " is-mine" : ""}${l.afford || l.mine ? "" : " is-poor"}`} style={{ "--rc": rarityColor(l.rarity) }}>
                                    <div className="mk-thumb">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        {l.sprite ? <img src={l.sprite} alt={l.name} draggable="false" /> : <span className="mk-noart" aria-hidden="true" />}
                                        <span className="mk-qty">×{l.qty}</span>
                                    </div>
                                    <b className="mk-name">{l.name}</b>
                                    <span className="mk-kind">{KIND_LABEL[l.kind] || l.kind}</span>
                                    <span className="mk-unit">{l.unitGold.toLocaleString()} gold each</span>
                                    {/* ValkyrieSylve asked to see whether a stall feeds a recipe she owns. Only
                                        recipes you KNOW and are actually short for, so it reads as "this is the
                                        thing you're missing" rather than trivia about where an ingredient goes. */}
                                    {l.forRecipe ? (
                                        <span className={`mk-recipe${l.forRecipe.completes ? " is-completes" : ""}`}
                                            title={l.forRecipe.names.join(" · ")}>
                                            {l.forRecipe.completes ? "Completes " : "Toward "}
                                            {l.forRecipe.names[0]}
                                            {l.forRecipe.names.length > 1 ? ` +${l.forRecipe.names.length - 1}` : ""}
                                        </span>
                                    ) : null}
                                    <span className="mk-seller">{l.mine ? "your stall" : l.seller}</span>
                                    {l.mine ? (
                                        <button type="button" className="mk-buy is-pull" disabled={Boolean(busy)} onClick={() => doCancel(l)}>
                                            {busy === `cancel-${l.id}` ? "…" : "Pull it"}
                                        </button>
                                    ) : (
                                        <button type="button" className="mk-buy" disabled={Boolean(busy) || !l.afford} onClick={() => doBuy(l)}>
                                            {busy === `buy-${l.id}` ? "…" : l.afford ? `Buy · ${l.total.toLocaleString()}` : `Need ${l.total.toLocaleString()}`}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="mk-empty">The square is quiet. Put something up and you&apos;ll be the first stall.</p>
                    )}
                </section>
            ) : null}

            {tab === "sell" ? (
                <section className="card mk-panel">
                    <h3 className="mk-panel-h"><GiBasket aria-hidden="true" /> Your shelf</h3>
                    <p className="mk-panel-sub">
                        Pick something to sell. You can run <b>{state?.maxOpen}</b> stalls at once — <b>{state?.openSlots}</b> free.
                    </p>
                    {sellable.length ? (
                        <div className="mk-grid">
                            {sellable.map((p) => (
                                <button
                                    key={`${p.kind}:${p.ref}`}
                                    type="button"
                                    className={`mk-card mk-pick${selling?.ref === p.ref ? " on" : ""}`}
                                    style={{ "--rc": rarityColor(p.rarity) }}
                                    disabled={!state?.openSlots}
                                    onClick={() => { setSelling(p); setQty(1); setError(""); }}
                                >
                                    <div className="mk-thumb">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        {p.sprite ? <img src={p.sprite} alt={p.name} draggable="false" /> : <span className="mk-noart" aria-hidden="true" />}
                                        <span className="mk-qty">×{p.qty}</span>
                                    </div>
                                    <b className="mk-name">{p.name}</b>
                                    <span className="mk-kind">{KIND_LABEL[p.kind] || p.kind}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="mk-empty">Your shelf is empty. Harvest something on the farm or land a fish and it&apos;ll show up here.</p>
                    )}
                </section>
            ) : null}

            {tab === "mine" ? (
                <section className="card mk-panel">
                    <h3 className="mk-panel-h"><GiScrollUnfurled aria-hidden="true" /> Your stalls</h3>
                    <p className="mk-panel-sub">These goods are already off your shelf. Pull a stall and they come straight back.</p>
                    {mine.length ? (
                        <div className="mk-grid">
                            {mine.map((l) => (
                                <div key={l.id} className="mk-card" style={{ "--rc": rarityColor(l.rarity) }}>
                                    <div className="mk-thumb">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        {l.sprite ? <img src={l.sprite} alt={l.name} draggable="false" /> : <span className="mk-noart" aria-hidden="true" />}
                                        <span className="mk-qty">×{l.qty}</span>
                                    </div>
                                    <b className="mk-name">{l.name}</b>
                                    <span className="mk-unit">{l.unitGold.toLocaleString()} each · {l.total.toLocaleString()} total</span>
                                    <button type="button" className="mk-buy is-pull" disabled={Boolean(busy)} onClick={() => doCancel(l)}>
                                        {busy === `cancel-${l.id}` ? "…" : "Pull it"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="mk-empty">You aren&apos;t selling anything yet.</p>
                    )}
                </section>
            ) : null}

            {/* Pricing sheet — slides up over the shelf once you've picked something. */}
            {selling ? (
                <div className="mk-scrim" role="dialog" aria-modal="true" onClick={() => setSelling(null)}>
                    <div className="mk-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="mk-sheet-head" style={{ "--rc": rarityColor(selling.rarity) }}>
                            <div className="mk-thumb big">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {selling.sprite ? <img src={selling.sprite} alt={selling.name} draggable="false" /> : <span className="mk-noart" aria-hidden="true" />}
                            </div>
                            <div>
                                <b className="mk-sheet-name">{selling.name}</b>
                                <span className="mk-sheet-have">{selling.qty} on your shelf</span>
                            </div>
                        </div>

                        <label className="mk-field">
                            <span>How many</span>
                            <div className="mk-stepper">
                                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="One fewer">−</button>
                                <input
                                    type="number" inputMode="numeric" min="1" max={selling.qty} value={askQty}
                                    onChange={(e) => setQty(Math.max(1, Math.min(selling.qty, Math.round(Number(e.target.value) || 1))))}
                                />
                                <button type="button" onClick={() => setQty((q) => Math.min(selling.qty, q + 1))} aria-label="One more">+</button>
                                <button type="button" className="mk-all" onClick={() => setQty(selling.qty)}>All</button>
                            </div>
                        </label>

                        <label className="mk-field">
                            <span>Gold each</span>
                            <div className="mk-stepper">
                                <button type="button" onClick={() => setPrice((p) => Math.max(1, p - 5))} aria-label="Five less">−</button>
                                <input
                                    type="number" inputMode="numeric" min="1" max={state?.maxUnitGold || 100000} value={price}
                                    onChange={(e) => setPrice(Math.max(1, Math.min(state?.maxUnitGold || 100000, Math.round(Number(e.target.value) || 1))))}
                                />
                                <button type="button" onClick={() => setPrice((p) => p + 5)} aria-label="Five more">+</button>
                            </div>
                        </label>

                        {/* The live number, where the decision is — not a tutorial about pricing. */}
                        {goingRate ? (
                            <p className="mk-rate">
                                {goingRate.count} other stall{goingRate.count === 1 ? "" : "s"} selling {selling.name} from <b>{goingRate.low.toLocaleString()}</b> each.
                                <button type="button" className="mk-undercut" onClick={() => setPrice(Math.max(1, goingRate.low - 1))}>Undercut</button>
                            </p>
                        ) : (
                            <p className="mk-rate">Nobody else is selling {selling.name}. You set the price.</p>
                        )}

                        <div className="mk-total"><span>They pay</span><b>{totalAsk.toLocaleString()} gold</b></div>

                        <div className="mk-sheet-actions">
                            <button type="button" className="mk-cancel" onClick={() => setSelling(null)}>Never mind</button>
                            <button type="button" className="mk-confirm" disabled={busy === "list"} onClick={doList}>
                                {busy === "list" ? "Setting up…" : "Open the stall"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* The reveal — the one moment worth animating on the buy side. */}
            {bought ? (
                <div className="mk-scrim" role="dialog" aria-modal="true" onClick={() => setBought(null)}>
                    <div className="mk-reveal" onClick={(e) => e.stopPropagation()}>
                        <div className="mk-rays" aria-hidden="true" />
                        <div className="mk-reveal-art">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {bought.sprite ? <img src={bought.sprite} alt={bought.name} draggable="false" /> : <span className="mk-noart" aria-hidden="true" />}
                        </div>
                        <div className="mk-reveal-kicker">Sold to you</div>
                        <h3 className="mk-reveal-name">{bought.name} ×{bought.qty}</h3>
                        <p className="mk-reveal-sub">−{bought.cost.toLocaleString()} gold · straight onto your shelf</p>
                        <button type="button" className="mk-confirm" onClick={() => setBought(null)}>Back to the square</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

const MARKET_CSS = `
/* ── The market square — an immersive banner, same family as the Forge's hearth ── */
.mk-scene { position: relative; border-radius: 16px; overflow: hidden; height: min(34vh, 260px); min-height: 168px;
    display: flex; flex-direction: column; justify-content: flex-end;
    background: radial-gradient(120% 90% at 50% 0%, #1d3b34, #0b1714 72%);
    box-shadow: inset 0 -40px 70px rgba(0,0,0,0.55), 0 10px 30px rgba(0,0,0,0.4); border: 1px solid rgba(95,208,168,0.28); }
.mk-sky { position: absolute; inset: 0; background: radial-gradient(90% 70% at 70% 10%, rgba(255,215,94,0.16), transparent 62%); animation: mkSun 11s ease-in-out infinite; }
@keyframes mkSun { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
.mk-motes { position: absolute; inset: 0; pointer-events: none; z-index: 1; overflow: hidden; }
.mk-motes span { position: absolute; bottom: -8px; width: 3px; height: 3px; border-radius: 50%; background: radial-gradient(circle, #ffe9a8, rgba(255,200,90,0.5) 60%, transparent); opacity: 0; animation: mkMote linear infinite; }
@keyframes mkMote { 0% { transform: translateY(0) translateX(0) scale(1); opacity: 0; } 15% { opacity: 0.85; } 100% { transform: translateY(-260px) translateX(18px) scale(0.4); opacity: 0; } }
/* The stall sprite. Anchored bottom-RIGHT and capped at 58% of the width so the title always keeps the left
   half — an overlap here put the awnings straight through the word "Market" on a 375px phone. */
.mk-art { position: absolute; right: 2%; bottom: 0; z-index: 2; width: 52%; max-width: 290px; max-height: 86%;
    object-fit: contain; object-position: bottom center;
    filter: drop-shadow(0 10px 22px rgba(0,0,0,0.6)) drop-shadow(0 0 26px rgba(95,208,168,0.22));
    animation: mkBob 6s ease-in-out infinite; transform-origin: bottom center; }
@keyframes mkBob { 0%,100% { transform: translateY(0) rotate(-0.4deg); } 50% { transform: translateY(-6px) rotate(0.4deg); } }
/* The text plate. Its gradient is what keeps the tagline legible where the sprite creeps behind it. */
.mk-scene-inner { position: relative; z-index: 3; padding: 16px; max-width: 60%;
    background: linear-gradient(90deg, rgba(6,14,12,0.9) 55%, transparent); border-radius: 0 0 0 16px; }
.mk-title { margin: 0; font-size: 1.7rem; font-weight: 900; color: #d8fff0; text-shadow: 0 2px 10px rgba(40,200,150,0.5), 0 1px 3px #000; letter-spacing: 0.02em; }
.mk-tagline { margin: 5px 0 0; font-size: 12.5px; font-weight: 600; color: #bfe7d8; text-shadow: 0 1px 4px #000; }

/* ── Founder's medallion (Sunflower Jinxx) — small hero circle pinned top-right of the square ── */
.mk-founder { position: absolute; top: 12px; right: 12px; z-index: 4; width: 46px; height: 46px; border-radius: 50%; padding: 0; cursor: pointer; overflow: hidden;
    background: radial-gradient(circle at 50% 30%, #16302a, #061410); border: 2px solid rgba(95,208,168,0.4);
    box-shadow: 0 3px 12px rgba(0,0,0,0.55), inset 0 0 8px rgba(0,0,0,0.6);
    display: grid; place-items: center; transition: transform .18s cubic-bezier(.2,1.4,.35,1), box-shadow .18s, border-color .18s; }
.mk-founder img { width: 112%; height: 112%; object-fit: contain; object-position: center 8%; display: block; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6)); }
.mk-founder:hover, .mk-founder:focus-visible { transform: scale(1.12) rotate(-3deg); border-color: rgba(140,240,200,0.8); box-shadow: 0 5px 18px rgba(0,0,0,0.6), 0 0 16px rgba(95,208,168,0.55); outline: none; }
.mk-founder-card { position: relative; width: 100%; max-width: 340px; text-align: center; padding: 22px 22px 18px; border-radius: 18px;
    background: linear-gradient(180deg, #12271f, #091511); border: 1px solid rgba(95,208,168,0.45);
    box-shadow: 0 24px 70px rgba(0,0,0,0.7), 0 0 34px rgba(40,190,140,0.26); animation: mkPop .32s cubic-bezier(.2,1.4,.35,1) both; }
.mk-founder-hero { width: 96px; height: 96px; margin: 0 auto 12px; border-radius: 50%; overflow: hidden; display: grid; place-items: center;
    background: radial-gradient(circle at 50% 28%, #17332c, #05100d); border: 3px solid rgba(95,208,168,0.45);
    box-shadow: 0 6px 20px rgba(0,0,0,0.55), inset 0 0 14px rgba(0,0,0,0.6), 0 0 20px rgba(60,200,150,0.28); }
.mk-founder-hero img { width: 108%; height: 108%; object-fit: contain; object-position: center 6%; display: block; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5)); }
.mk-founder-kicker { font-size: 10.5px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: #7fe0bd; }
.mk-founder-name { margin: 3px 0 8px; font-size: 1.35rem; font-weight: 900; color: #eafff7; text-shadow: 0 2px 8px rgba(40,200,150,0.45); }
.mk-founder-body { margin: 0 0 16px; font-size: 13px; line-height: 1.55; color: #cfe8de; }
.mk-founder-body b { color: #8fe3c4; }

/* ── Tabs ── */
.mk-tabs { display: flex; gap: 6px; }
.mk-tab { flex: 1; padding: 9px 6px; border-radius: 11px; border: 1px solid rgba(255,255,255,0.08); cursor: pointer;
    background: rgba(255,255,255,0.04); color: #b9c9c3; font-weight: 800; font-size: 12.5px; display: flex; align-items: center; justify-content: center; gap: 5px; }
.mk-tab b { font-size: 10.5px; padding: 1px 6px; border-radius: 999px; background: rgba(95,208,168,0.2); color: #8fe3c4; }
.mk-tab.on { background: linear-gradient(180deg, rgba(95,208,168,0.22), rgba(95,208,168,0.08)); border-color: rgba(95,208,168,0.5); color: #d8fff0; }

.mk-error { padding: 10px 12px; border-radius: 11px; font-size: 12.5px; font-weight: 700; color: #ffd4d4; background: rgba(190,60,60,0.18); border: 1px solid rgba(255,120,120,0.35); }

/* ── Panels ── */
.mk-panel-h { margin: 0 0 11px; font-size: 12px; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; color: #7fe0bd; display: flex; align-items: center; gap: 6px; }
.mk-panel-sub { margin: -6px 0 12px; font-size: 11.5px; line-height: 1.35; color: #9db3ac; }
.mk-panel-sub b { color: #a9f0d6; }
.mk-empty { margin: 0; font-size: 12.5px; color: #90a49e; line-height: 1.45; }

/* ── Stall cards. auto-fit down to 104px so a 375px phone still gets three across ── */
.mk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
.mk-card { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 9px 7px; border-radius: 12px; text-align: center;
    background: rgba(8,18,15,0.6); border: 1px solid color-mix(in srgb, var(--rc) 45%, transparent); }
.mk-card.is-mine { border-style: dashed; }
.mk-card.is-poor { opacity: 0.62; }
.mk-thumb { position: relative; width: 54px; height: 54px; display: grid; place-items: center; }
.mk-thumb.big { width: 72px; height: 72px; }
.mk-thumb img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.55)) drop-shadow(0 0 9px color-mix(in srgb, var(--rc) 50%, transparent)); }
.mk-noart { width: 34px; height: 34px; border-radius: 8px; background: linear-gradient(135deg, color-mix(in srgb, var(--rc) 80%, #fff), var(--rc)); opacity: 0.75; }
.mk-qty { position: absolute; right: -2px; bottom: -2px; font-size: 10.5px; font-weight: 900; padding: 1px 5px; border-radius: 999px; color: #061410; background: var(--rc); box-shadow: 0 1px 4px rgba(0,0,0,0.5); }
.mk-name { font-size: 12px; font-weight: 900; color: #eafff7; line-height: 1.15; }
.mk-kind { font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: color-mix(in srgb, var(--rc) 78%, #fff); }
.mk-unit { font-size: 11px; color: #ffd75e; font-weight: 800; }
.mk-seller { font-size: 10.5px; color: #8ea39d; }
/* The recipe tell. "Completes" (you can cook it after this) is the loud one; "Toward" is the quieter
   half-answer, because a stall that only dents a shortfall is worth knowing about but not shouting. */
.mk-recipe { font-size: 10px; font-weight: 800; line-height: 1.2; padding: 2px 6px; border-radius: 999px;
    color: #bfe7d8; background: rgba(95,208,168,0.12); border: 1px solid rgba(95,208,168,0.28); }
.mk-recipe.is-completes { color: #062018; background: linear-gradient(180deg, #a9f0d6, #5fd0a8); border-color: transparent; }
.mk-buy { margin-top: 5px; width: 100%; padding: 7px 4px; border-radius: 9px; border: none; cursor: pointer; font-weight: 900; font-size: 11.5px;
    color: #062018; background: linear-gradient(180deg, #7fe9c4, #3fbb92); box-shadow: 0 3px 0 #1f7a5c; }
.mk-buy:active { transform: translateY(2px); box-shadow: 0 1px 0 #1f7a5c; }
.mk-buy:disabled { opacity: 0.5; cursor: default; box-shadow: 0 3px 0 #2c4a41; }
.mk-buy.is-pull { color: #2a1405; background: linear-gradient(180deg, #ffd06a, #ff9a2e); box-shadow: 0 3px 0 #b4611a; }
.mk-buy.is-pull:active { box-shadow: 0 1px 0 #b4611a; }
.mk-pick { cursor: pointer; }
.mk-pick.on { box-shadow: 0 0 0 2px var(--rc), 0 0 18px color-mix(in srgb, var(--rc) 45%, transparent); }
.mk-pick:disabled { opacity: 0.45; cursor: default; }

/* ── The pricing sheet + the reveal ── */
.mk-scrim { position: fixed; inset: 0; z-index: 220; display: grid; place-items: center; padding: 18px; background: rgba(4,10,8,0.74); backdrop-filter: blur(3px); animation: mkFade .18s ease both; }
@keyframes mkFade { from { opacity: 0; } to { opacity: 1; } }
.mk-sheet, .mk-reveal { position: relative; width: 100%; max-width: 340px; padding: 18px; border-radius: 18px;
    background: linear-gradient(180deg, #12271f, #091511); border: 1px solid rgba(95,208,168,0.4);
    box-shadow: 0 24px 70px rgba(0,0,0,0.7), 0 0 34px rgba(40,190,140,0.22); animation: mkPop .3s cubic-bezier(.2,1.4,.35,1) both; }
@keyframes mkPop { from { opacity: 0; transform: scale(.92) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.mk-sheet-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.mk-sheet-name { display: block; font-size: 1.05rem; font-weight: 900; color: #eafff7; }
.mk-sheet-have { font-size: 11.5px; color: #9db3ac; }
.mk-field { display: block; margin-bottom: 12px; }
.mk-field > span { display: block; font-size: 10.5px; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; color: #7fe0bd; margin-bottom: 5px; }
.mk-stepper { display: flex; gap: 5px; }
.mk-stepper button { width: 38px; padding: 8px 0; border-radius: 9px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.06); color: #eafff7; font-weight: 900; font-size: 15px; cursor: pointer; }
.mk-stepper input { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 9px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.35); color: #eafff7; font-weight: 900; font-size: 15px; text-align: center; }
.mk-stepper .mk-all { width: auto; padding: 8px 11px; font-size: 11.5px; }
.mk-rate { margin: 0 0 12px; font-size: 11.5px; line-height: 1.45; color: #9db3ac; }
.mk-rate b { color: #ffd75e; }
.mk-undercut { margin-left: 6px; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(95,208,168,0.45); background: rgba(95,208,168,0.14); color: #8fe3c4; font-size: 10.5px; font-weight: 900; cursor: pointer; }
.mk-total { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 11px; margin-bottom: 14px;
    background: rgba(255,215,94,0.1); border: 1px solid rgba(255,215,94,0.3); }
.mk-total span { font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #d9c88f; }
.mk-total b { font-size: 1.05rem; font-weight: 900; color: #ffd75e; }
.mk-sheet-actions { display: flex; gap: 8px; }
.mk-cancel { flex: 1; padding: 11px; border-radius: 11px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: #b9c9c3; font-weight: 800; font-size: 12.5px; cursor: pointer; }
.mk-confirm { flex: 2; padding: 11px; border-radius: 11px; border: none; cursor: pointer; font-weight: 900; font-size: 13px;
    color: #062018; background: linear-gradient(180deg, #7fe9c4, #3fbb92); box-shadow: 0 3px 0 #1f7a5c; }
.mk-confirm:active { transform: translateY(2px); box-shadow: 0 1px 0 #1f7a5c; }
.mk-confirm:disabled { opacity: 0.6; cursor: default; }
.mk-reveal { text-align: center; overflow: hidden; }
.mk-rays { position: absolute; top: -40%; left: 50%; width: 320px; height: 320px; margin-left: -160px; pointer-events: none;
    background: conic-gradient(from 0deg, transparent 0 12deg, rgba(127,233,196,0.18) 12deg 22deg, transparent 22deg 34deg);
    animation: mkSpin 14s linear infinite; }
@keyframes mkSpin { to { transform: rotate(360deg); } }
.mk-reveal-art { position: relative; width: 96px; height: 96px; margin: 4px auto 10px; display: grid; place-items: center; animation: mkRise .45s cubic-bezier(.2,1.4,.35,1) both; }
.mk-reveal-art img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.6)) drop-shadow(0 0 18px rgba(127,233,196,0.55)); }
@keyframes mkRise { 0% { opacity: 0; transform: scale(.5) translateY(14px); } 60% { opacity: 1; } 100% { opacity: 1; transform: scale(1) translateY(0); } }
.mk-reveal-kicker { position: relative; font-size: 10.5px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: #7fe0bd; }
.mk-reveal-name { position: relative; margin: 3px 0 6px; font-size: 1.3rem; font-weight: 900; color: #eafff7; text-shadow: 0 2px 10px rgba(40,200,150,0.45); }
.mk-reveal-sub { position: relative; margin: 0 0 16px; font-size: 12.5px; color: #bfe7d8; }
`;
