"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ItemArt from "@/components/ItemArt";
import CoinCta from "@/components/CoinCta";

const RARITY_TXT = { common: "#9aa7b5", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ffb52e", mythic: "#37f5c0", ascendant: "#ff7a3c", eternal: "#ff5cc8" };
const SLOTS = [["", "All slots"], ["main_hand", "Weapon"], ["off_hand", "Off-hand"], ["head", "Head"], ["chest", "Chest"], ["legs", "Legs"], ["feet", "Feet"], ["hands", "Hands"], ["ring", "Ring"], ["amulet", "Amulet"], ["cloak", "Cloak"]];
const RARITIES = [["", "All rarities"], ["common", "Common"], ["rare", "Rare"], ["epic", "Epic"], ["legendary", "Legendary"], ["mythic", "Mythic"]];
const SORTS = [["new", "Newest"], ["old", "Oldest"], ["price_asc", "Price ↑"], ["price_desc", "Price ↓"]];
const TABS = [{ k: "browse", ic: "🔍", label: "Browse" }, { k: "sell", ic: "🏷️", label: "Sell" }, { k: "mine", ic: "📜", label: "Listings" }];

function timeLeft(iso) {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return "ending";
    const h = Math.floor(ms / 3600000);
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    if (h >= 1) return `${h}h ${Math.floor((ms % 3600000) / 60000)}m`;
    return `${Math.max(1, Math.floor(ms / 60000))}m`;
}
function ago(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

// Side-by-side comparison vs the viewer's equipped piece: green ▲ upgrades, red ▼ downgrades, per stat + farm affix.
function CompareBlock({ c }) {
    if (!c) return null;
    if (c.none && !c.diffs.length && !c.farmDiffs.length) return null;
    const chip = (d, isFarm) => (
        <span key={(isFarm ? "f-" : "") + d.key} className={`ah-cmp-chip ${d.delta > 0 ? "up" : "down"}`}>
            {d.icon} {d.delta > 0 ? "▲" : "▼"}{Math.abs(d.delta)}{d.suffix === "%" ? "%" : ""} {d.label}
        </span>
    );
    return (
        <div className="ah-cmp">
            <div className="ah-cmp-head">{c.none ? "🆕 Empty slot — nothing equipped" : <>vs your <b>{c.equippedName}</b>{c.equippedEnhance > 0 ? ` ⚒️+${c.equippedEnhance}` : ""}</>}</div>
            {c.diffs.length || c.farmDiffs.length ? (
                <div className="ah-cmp-chips">
                    {c.diffs.map((d) => chip(d, false))}
                    {c.farmDiffs.map((d) => chip(d, true))}
                </div>
            ) : <div className="ah-cmp-same">Same stats as equipped</div>}
        </div>
    );
}

export default function AuctionClient({ initial }) {
    const [state, setState] = useState(initial || null);
    const [tab, setTab] = useState("browse"); // browse | sell | mine
    const [q, setQ] = useState("");
    const [slot, setSlot] = useState("");
    const [rarity, setRarity] = useState("");
    const [sort, setSort] = useState("new");
    const [listings, setListings] = useState(initial?.listings || []);
    const [busy, setBusy] = useState(false);
    const [flash, setFlash] = useState(null);
    const [sellPick, setSellPick] = useState(null); // item being listed { itemId,... }
    const priceRef = useRef(null); // focused the moment an item is picked, so the keyboard opens on the field
    const [price, setPrice] = useState("");
    const [days, setDays] = useState(3);
    const [detail, setDetail] = useState(null); // listing being inspected in the full-detail modal (browse OR mine)

    const gold = state?.gold || 0;
    const feePct = state?.feePct || 0.05;
    const durations = state?.durations || [1, 3, 5, 7];

    const reloadState = useCallback(async () => {
        const r = await fetch("/api/marketplace/auction", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
        if (r?.owner) { setState(r); setListings(r.listings || []); }
    }, []);

    // Live browse search/filter/sort → re-fetch just the listings.
    useEffect(() => {
        if (tab !== "browse") return undefined;
        const t = setTimeout(async () => {
            const params = new URLSearchParams({ q, slot, rarity, sort });
            const r = await fetch(`/api/marketplace/auction?${params}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
            if (r?.owner) setListings(r.listings || []);
        }, 220);
        return () => clearTimeout(t);
    }, [q, slot, rarity, sort, tab]);

    const showFlash = useCallback((msg) => { setFlash(msg); setTimeout(() => setFlash((f) => (f === msg ? null : f)), 3200); }, []);

    const buy = useCallback(async (id) => {
        setBusy(true);
        const r = await fetch("/api/marketplace/auction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "buy", id }) }).then((x) => x.json()).catch(() => null);
        setBusy(false);
        if (r?.ok) { showFlash(`✅ Bought ${r.item?.name} for ${r.price.toLocaleString()} 🪙!`); try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ } reloadState(); }
        else showFlash(r?.error === "insufficient_gold" ? "Not enough coins." : r?.error === "already_owned" ? "You already own that piece." : r?.error === "own_listing" ? "That's your own listing." : "That listing's gone.");
    }, [showFlash, reloadState]);

    const doList = useCallback(async () => {
        const p = Math.floor(Number(price) || 0);
        if (!sellPick || p < 10) { showFlash("Set a price of at least 10 🪙."); return; }
        setBusy(true);
        const r = await fetch("/api/marketplace/auction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "list", itemId: sellPick.itemId, price: p, days }) }).then((x) => x.json()).catch(() => null);
        setBusy(false);
        if (r?.ok) { showFlash(`📜 Listed ${sellPick.name} for ${p.toLocaleString()} 🪙 (fee ${r.fee.toLocaleString()} 🪙).`); setSellPick(null); setPrice(""); try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ } reloadState(); }
        else showFlash(r?.error === "insufficient_gold" ? `You need ${Math.max(1, Math.ceil(p * feePct)).toLocaleString()} 🪙 for the listing fee.` : r?.error === "equipped" ? "Unequip it first." : r?.error === "collection_piece" ? "That's a collection piece — its bonus is permanent, so it can't be auctioned." : "Couldn't list that.");
    }, [price, sellPick, days, feePct, showFlash, reloadState]);

    const cancel = useCallback(async (id) => {
        setBusy(true);
        const r = await fetch("/api/marketplace/auction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel", id }) }).then((x) => x.json()).catch(() => null);
        setBusy(false);
        if (r?.ok) { showFlash("↩ Listing cancelled — item returned."); reloadState(); }
        else showFlash("Couldn't cancel that.");
    }, [showFlash, reloadState]);

    const fee = useMemo(() => Math.max(1, Math.ceil((Number(price) || 0) * feePct)), [price, feePct]);

    if (state && state.owner === false) {
        return <section className="card"><h1 style={{ marginTop: 0 }}>🏛️ Auction House</h1><p className="muted" style={{ margin: 0 }}>The Auction House is still being built — check back soon.</p></section>;
    }

    return (
        <div className="stack reveal">
            <section className="ah-hero">
                <div className="ah-hero-shine" aria-hidden="true" />
                {state?.auctioneer ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="ah-hero-mascot" src={state.auctioneer} alt="" draggable={false} />
                ) : <span className="ah-hero-mascot ah-hero-mascot-emoji" aria-hidden="true">🧑‍⚖️</span>}
                <div className="ah-hero-body">
                    <h1 className="ah-hero-title">Auction House</h1>
                    <p className="ah-hero-sub">Sell what you don&apos;t use · snag a deal · {Math.round(feePct * 100)}% to list</p>
                </div>
                <span className="ah-hero-gold">🪙 {gold.toLocaleString()}</span>
            </section>

            <div className="ah-tabs" role="tablist" style={{ "--i": TABS.findIndex((t) => t.k === tab) }}>
                <span className="ah-tabs-glide" aria-hidden="true" />
                {TABS.map((t) => {
                    // Listings badge = ACTIVE listings only (sold/expired/cancelled don't count).
                    const n = t.k === "browse" ? listings.length : t.k === "mine" ? (state?.mine || []).filter((m) => m.status === "active").length : (state?.sellable?.length || 0);
                    return (
                        <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={`ah-tab${tab === t.k ? " is-on" : ""}`} onClick={() => setTab(t.k)}>
                            <span className="ah-tab-ic" aria-hidden="true">{t.ic}</span>
                            <span className="ah-tab-lbl">{t.label}{n ? <span className="ah-tab-n">{n}</span> : null}</span>
                        </button>
                    );
                })}
            </div>

            {flash ? <div className="ah-flash">{flash}</div> : null}

            {tab === "browse" ? (
                <>
                    <section className="card ah-filters">
                        <input className="ah-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item or seller…" aria-label="Search" />
                        <div className="ah-selrow">
                            <select value={slot} onChange={(e) => setSlot(e.target.value)} aria-label="Slot">{SLOTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                            <select value={rarity} onChange={(e) => setRarity(e.target.value)} aria-label="Rarity">{RARITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                        </div>
                    </section>
                    {listings.length === 0 ? (
                        <section className="card"><p className="muted" style={{ margin: 0 }}>No listings match — be the first to list something in the Sell tab!</p></section>
                    ) : (
                        <div className="ah-grid">
                            {listings.map((l) => (
                                <div key={l.id} className="ah-card ah-card-tap" style={{ "--rc": RARITY_TXT[l.rarity] || "#9aa7b5" }} onClick={() => setDetail(l)} role="button" tabIndex={0}>
                                    <div className="ah-card-art"><ItemArt id={l.itemId} icon={l.icon} elements={l.elements} />{l.enhanceLevel > 0 ? <span className="ah-enh">⚒️ +{l.enhanceLevel}</span> : null}</div>
                                    <div className="ah-card-name" style={{ color: RARITY_TXT[l.rarity] || "#fff" }}>{l.name}</div>
                                    {l.stats ? <div className="ah-card-stats muted">{l.stats}</div> : null}
                                    {l.forgeStats ? <div className="ah-card-forge">⚒️ +{l.enhanceLevel} · {l.forgeStats}</div> : null}
                                    {l.util ? <div className="ah-card-attune">🔮 +{l.util.value}{l.util.unit} {l.util.label}{l.util.level > 1 ? ` Lv${l.util.level}` : ""} <span className="ah-attune-blurb">· {l.util.blurb}</span></div> : null}
                                    {l.farm ? <div className="ah-card-farm">🌱 {l.farm}</div> : null}
                                    {l.sea ? <div className="ah-card-sea">⚓ {l.sea}</div> : null}
                                    {l.depth ? <div className="ah-card-depth">⛏️ {l.depth}</div> : null}
                                    {l.signature ? <div className="ah-card-sig">★ {l.signature.label} — {l.signature.desc}</div> : null}
                                    {l.compare && !l.mine ? <CompareBlock c={l.compare} /> : null}
                                    <div className="ah-card-meta muted">by {l.sellerName} · {ago(l.listedAt)} · ⏳ {timeLeft(l.expiresAt)}</div>
                                    {l.mine ? (
                                        <button type="button" className="ah-buy is-mine" onClick={(e) => { e.stopPropagation(); setDetail(l); }}>Your listing · view</button>
                                    ) : l.owned ? (
                                        <button type="button" className="ah-buy" disabled onClick={(e) => e.stopPropagation()}>Owned</button>
                                    ) : gold < l.price ? (
                                        <span onClick={(e) => e.stopPropagation()}><CoinCta price={l.price} have={gold} label="coins" /></span>
                                    ) : (
                                        <button type="button" className="ah-buy" disabled={busy} onClick={(e) => { e.stopPropagation(); buy(l.id); }}>🪙 {l.price.toLocaleString()}</button>
                                    )}
                                    <div className="ah-card-tapHint">Tap for full details ›</div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : null}

            {tab === "sell" ? (
                <section className={`card${sellPick ? " ah-sell-padded" : ""}`}>
                    <h3 style={{ marginTop: 0 }}>📤 List an item</h3>
                    {(state?.sellable || []).length === 0 ? (
                        <p className="muted" style={{ margin: 0 }}>No unequipped gear to list right now. Unequip a piece (or win some) and it&apos;ll show up here.</p>
                    ) : (
                        <div className="ah-grid">
                            {(state?.sellable || []).map((it) => (
                                <button key={it.itemId} type="button" className={`ah-card ah-sellcard${sellPick?.itemId === it.itemId ? " is-picked" : ""}`} style={{ "--rc": RARITY_TXT[it.rarity] || "#9aa7b5" }} onClick={() => { setSellPick(it); setPrice(""); setTimeout(() => priceRef.current?.focus(), 60); }}>
                                    <div className="ah-card-art"><ItemArt id={it.itemId} icon={it.icon} elements={it.elements} />{it.enhanceLevel > 0 ? <span className="ah-enh">⚒️ +{it.enhanceLevel}</span> : null}</div>
                                    <div className="ah-card-name" style={{ color: RARITY_TXT[it.rarity] || "#fff" }}>{it.name}</div>
                                    {it.stats ? <div className="ah-card-stats muted">{it.stats}</div> : null}
                                    {it.forgeStats ? <div className="ah-card-forge">⚒️ +{it.enhanceLevel} · {it.forgeStats}</div> : null}
                                    {it.util ? <div className="ah-card-attune">🔮 +{it.util.value}{it.util.unit} {it.util.label}{it.util.level > 1 ? ` Lv${it.util.level}` : ""}</div> : null}
                                    {it.farm ? <div className="ah-card-farm">🌱 {it.farm}</div> : null}
                                    {it.sea ? <div className="ah-card-sea">⚓ {it.sea}</div> : null}
                                    {it.depth ? <div className="ah-card-depth">⛏️ {it.depth}</div> : null}
                                    {it.signature ? <div className="ah-card-sig">★ {it.signature.label}</div> : null}
                                </button>
                            ))}
                        </div>
                    )}
                    {sellPick ? (
                        <div className="ah-listform">
                            <div className="ah-listform-title">List <b style={{ color: RARITY_TXT[sellPick.rarity] || "#fff" }}>{sellPick.name}</b></div>
                            <label className="ah-field"><span>Price (🪙)</span><input ref={priceRef} type="number" inputMode="numeric" min={10} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 2500" /></label>
                            <div className="ah-field"><span>Duration</span>
                                <div className="ah-days">{durations.map((d) => <button key={d} type="button" className={days === d ? "is-on" : ""} onClick={() => setDays(d)}>{d}d</button>)}</div>
                            </div>
                            <div className="ah-feeline muted">Listing fee ({Math.round(feePct * 100)}%): <b>🪙 {fee.toLocaleString()}</b>{Number(price) > 0 ? ` · you keep 🪙 ${Number(price).toLocaleString()} on a sale` : ""}</div>
                            <div className="ah-listform-btns">
                                <button type="button" className="ah-list-btn" disabled={busy || Number(price) < 10 || gold < fee} onClick={doList}>📜 List it{gold < fee ? " (need fee)" : ""}</button>
                                <button type="button" className="ah-cancel-btn" onClick={() => setSellPick(null)}>Cancel</button>
                            </div>
                        </div>
                    ) : null}
                </section>
            ) : null}

            {tab === "mine" ? (
                <section className="card">
                    <h3 style={{ marginTop: 0 }}>📜 Your listings</h3>
                    {(state?.mine || []).length === 0 ? (
                        <p className="muted" style={{ margin: 0 }}>You haven&apos;t listed anything. Head to the Sell tab.</p>
                    ) : (
                        <div className="ah-mine">
                            {(state?.mine || []).map((l) => (
                                <div key={l.id} className="ah-minerow ah-minerow-tap" style={{ "--rc": RARITY_TXT[l.rarity] || "#9aa7b5" }} onClick={() => setDetail(l)} role="button" tabIndex={0}>
                                    <div className="ah-minerow-art"><ItemArt id={l.itemId} icon={l.icon} elements={l.elements} /></div>
                                    <div className="ah-minerow-body">
                                        <div className="ah-minerow-name" style={{ color: RARITY_TXT[l.rarity] || "#fff" }}>{l.name}</div>
                                        <div className="muted" style={{ fontSize: "0.76rem" }}>
                                            🪙 {l.price.toLocaleString()} · {l.status === "active" ? `⏳ ${timeLeft(l.expiresAt)} left` : l.status === "sold" ? "✅ sold" : l.status === "expired" ? "⌛ expired (returned)" : "↩ cancelled"}
                                        </div>
                                        {l.status === "sold" && l.buyerName ? (
                                            <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "#8fe39a", marginTop: 2 }}>
                                                🤝 Bought by {l.buyerAlias ? <Link href={`/marketplace/u/${l.buyerAlias}`} style={{ color: "#8fe39a" }} onClick={(e) => e.stopPropagation()}>{l.buyerName}</Link> : l.buyerName}{l.soldAt ? ` · ${ago(l.soldAt)}` : ""}
                                            </div>
                                        ) : null}
                                    </div>
                                    {l.status === "active" ? <button type="button" className="ah-cancel-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); cancel(l.id); }}>Cancel</button> : <span className="ah-minerow-chev" aria-hidden="true">›</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            ) : null}

            {detail ? (
                <div className="ah-detail-overlay" onClick={() => setDetail(null)}>
                    <div className={`ah-detail rar-${detail.rarity}`} style={{ "--rc": RARITY_TXT[detail.rarity] || "#9aa7b5" }} onClick={(e) => e.stopPropagation()}>
                        <div className="ah-detail-head">
                            <div className="ah-detail-art"><ItemArt id={detail.itemId} icon={detail.icon} />{detail.enhanceLevel > 0 ? <span className="ah-enh">⚒️ +{detail.enhanceLevel}</span> : null}</div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div className="ah-detail-name" style={{ color: RARITY_TXT[detail.rarity] || "#fff" }}>{detail.name}</div>
                                <div className="ah-detail-sub">{detail.rarity} · {String(detail.slot || "").replace(/_/g, " ")}</div>
                            </div>
                            <button type="button" className="ah-detail-x" onClick={() => setDetail(null)} aria-label="Close">✕</button>
                        </div>
                        {detail.stats ? <div className="ah-detail-stats">{detail.stats}</div> : null}
                        {detail.forgeStats ? <div className="ah-card-forge" style={{ textAlign: "left" }}>⚒️ +{detail.enhanceLevel} forge · {detail.forgeStats}</div> : null}
                        {detail.util ? <div className="ah-card-attune" style={{ textAlign: "left" }}>🔮 +{detail.util.value}{detail.util.unit} {detail.util.label}{detail.util.level > 1 ? ` Lv${detail.util.level}` : ""}{detail.util.blurb ? <span className="ah-attune-blurb"> · {detail.util.blurb}</span> : null}</div> : null}
                        {detail.farm ? <div className="ah-card-farm" style={{ textAlign: "left" }}>🌱 Farm affinity: {detail.farm} <span className="ah-attune-blurb">— helps on the farm</span></div> : null}
                        {detail.sea ? <div className="ah-card-sea" style={{ textAlign: "left" }}>⚓ Sea affinity: {detail.sea} <span className="ah-attune-blurb">— helps at sea</span></div> : null}
                        {detail.depth ? <div className="ah-card-depth" style={{ textAlign: "left" }}>⛏️ Depths affinity: {detail.depth} <span className="ah-attune-blurb">— helps underground</span></div> : null}
                        {detail.signature ? <div className="ah-card-sig" style={{ textAlign: "left" }}>★ {detail.signature.label} — {detail.signature.desc}</div> : null}
                        {detail.compare ? <CompareBlock c={detail.compare} /> : null}
                        <div className="ah-detail-meta muted">
                            {detail.mine
                                ? (detail.status === "sold" && detail.buyerName ? <>🤝 Sold to {detail.buyerName}{detail.soldAt ? ` · ${ago(detail.soldAt)}` : ""}</> : detail.status === "active" ? <>Your listing · ⏳ {timeLeft(detail.expiresAt)} left</> : `Your listing · ${detail.status}`)
                                : <>by {detail.sellerName} · {ago(detail.listedAt)} · ⏳ {timeLeft(detail.expiresAt)}</>}
                        </div>
                        <div className="ah-detail-actions">
                            {detail.mine ? (
                                detail.status === "active" ? (
                                    <button type="button" className="ah-cancel-btn" style={{ flex: 1 }} disabled={busy} onClick={() => { cancel(detail.id); setDetail(null); }}>Cancel listing · 🪙 {detail.price.toLocaleString()}</button>
                                ) : null
                            ) : detail.owned ? (
                                <button type="button" className="ah-buy" disabled style={{ flex: 1 }}>You own this</button>
                            ) : gold < detail.price ? (
                                <div style={{ flex: 1 }}><CoinCta price={detail.price} have={gold} label="coins" /></div>
                            ) : (
                                <button type="button" className="ah-buy" style={{ flex: 1 }} disabled={busy} onClick={() => { buy(detail.id); setDetail(null); }}>🪙 Buy for {detail.price.toLocaleString()}</button>
                            )}
                            <button type="button" className="ah-detail-close" onClick={() => setDetail(null)}>Close</button>
                        </div>
                    </div>
                </div>
            ) : null}

            <style>{AH_CSS}</style>
        </div>
    );
}

const AH_CSS = `
/* Hero banner with the Auctioneer mascot */
.ah-hero { position: relative; overflow: hidden; display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 20px;
    background: linear-gradient(135deg, #2a1c0a 0%, #4a2f10 45%, #6b4416 100%); border: 1px solid rgba(255,215,110,0.5); box-shadow: 0 10px 30px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12); }
.ah-hero-shine { position: absolute; top: -60%; width: 55%; height: 220%; transform: rotate(18deg); background: linear-gradient(90deg, transparent, rgba(255,255,255,0.13), transparent); animation: ahShine 4.8s ease-in-out infinite; pointer-events: none; }
@keyframes ahShine { 0% { left: -45%; } 55%,100% { left: 135%; } }
.ah-hero-mascot { width: 76px; height: 76px; object-fit: contain; flex: 0 0 auto; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5)); animation: ahBob 3s ease-in-out infinite; }
.ah-hero-mascot-emoji { font-size: 54px; }
@keyframes ahBob { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-5px) rotate(1.5deg); } }
.ah-hero-body { flex: 1 1 auto; min-width: 0; }
.ah-hero-title { margin: 0; font-size: 1.5rem; font-weight: 900; color: #fff5db; text-shadow: 0 2px 6px rgba(0,0,0,0.4); }
.ah-hero-sub { margin: 2px 0 0; font-size: 0.76rem; font-weight: 600; color: #f0d6a0; }
.ah-hero-gold { flex: 0 0 auto; align-self: flex-start; font-weight: 900; font-size: 0.9rem; color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); border: 1px solid #fff3c4; border-radius: 999px; padding: 5px 12px; box-shadow: 0 3px 8px rgba(0,0,0,0.35); white-space: nowrap; }
/* Segmented tab bar with a sliding highlight */
.ah-tabs { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); padding: 5px; border-radius: 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); }
.ah-tabs-glide { position: absolute; top: 5px; bottom: 5px; left: 5px; width: calc((100% - 10px) / 3); border-radius: 12px; background: linear-gradient(180deg,#ffe488,#f3b23a); box-shadow: 0 4px 12px rgba(243,178,58,0.45); transform: translateX(calc(var(--i, 0) * 100%)); transition: transform .32s cubic-bezier(.2,1.1,.3,1); }
.ah-tab { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 7px; padding: 11px 6px; border: none; background: none; cursor: pointer; font: inherit; font-weight: 800; font-size: 0.9rem; color: #cbb9e0; transition: color .2s; }
.ah-tab.is-on { color: #2a1a06; }
.ah-tab-ic { font-size: 1.05rem; }
.ah-tab-lbl { display: inline-flex; align-items: center; gap: 5px; }
.ah-tab-n { font-size: 0.66rem; font-weight: 900; min-width: 16px; height: 16px; padding: 0 4px; display: grid; place-items: center; border-radius: 999px; }
.ah-tab.is-on .ah-tab-n { background: rgba(42,26,6,0.22); color: #2a1a06; }
.ah-tab:not(.is-on) .ah-tab-n { background: rgba(255,255,255,0.14); color: #e8e2d6; }
.ah-flash { text-align: center; font-weight: 800; color: #ffe0b0; background: rgba(255,215,110,0.12); border: 1px solid rgba(255,215,110,0.4); border-radius: 12px; padding: 10px 14px; }
.ah-filters { display: flex; flex-direction: column; gap: 8px; }
.ah-search { width: 100%; padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: #f2ead9; font-size: 0.9rem; }
.ah-selrow { display: flex; gap: 8px; }
.ah-selrow select { flex: 1 1 0; min-width: 0; padding: 9px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14); background: rgba(30,22,44,0.9); color: #f2ead9; font-size: 0.82rem; font-weight: 700; }
.ah-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.ah-card { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 10px; border-radius: 14px; text-align: center; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-top: 3px solid var(--rc,#9aa7b5); transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease; }
.ah-card:hover { transform: translateY(-3px); border-color: var(--rc,#9aa7b5); box-shadow: 0 12px 26px -10px var(--rc,#000); }
.ah-sellcard { cursor: pointer; color: inherit; font: inherit; }
.ah-sellcard.is-picked { border-color: #ffd75e; box-shadow: 0 0 0 1px #ffd75e, 0 8px 20px rgba(255,215,94,0.2); }
.ah-card-art { position: relative; width: 64px; height: 64px; display: grid; place-items: center; }
.ah-card-art svg, .ah-card-art img { width: 58px; height: 58px; }
.ah-enh { position: absolute; bottom: -4px; right: -6px; font-size: 0.6rem; font-weight: 900; color: #2a1a06; background: linear-gradient(180deg,#ffe27a,#f3b23a); border: 1px solid #fff3c4; border-radius: 999px; padding: 1px 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.5); white-space: nowrap; }
.ah-card-name { font-weight: 800; font-size: 0.86rem; line-height: 1.2; }
.ah-card-stats { font-size: 0.72rem; line-height: 1.25; }
.ah-card-forge { font-size: 0.7rem; line-height: 1.25; font-weight: 800; color: #8fe39a; }
.ah-card-attune { font-size: 0.7rem; line-height: 1.25; font-weight: 800; color: #e0c8ff; }
.ah-attune-blurb { font-weight: 600; color: #b7a9cf; }
.ah-card-farm { font-size: 0.7rem; line-height: 1.25; font-weight: 800; color: #8fe39a; }
.ah-card-sea { font-size: 0.7rem; line-height: 1.25; font-weight: 800; color: #7fd8ff; }
.ah-card-depth { font-size: 0.7rem; line-height: 1.25; font-weight: 800; color: #ffb45e; }
.ah-card-sig { font-size: 0.7rem; line-height: 1.3; font-weight: 700; color: #ffd75e; }
.ah-card-tap { cursor: pointer; }
.ah-card-tapHint { font-size: 0.6rem; font-weight: 700; color: #8a93a0; opacity: 0; transition: opacity .14s; }
.ah-card-tap:hover .ah-card-tapHint { opacity: 1; }
.ah-minerow-tap { cursor: pointer; }
.ah-minerow-chev { flex: 0 0 auto; font-size: 1.3rem; font-weight: 900; color: #8a93a0; padding: 0 4px; }
/* Full-detail modal (browse card or your listing) */
.ah-detail-overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: flex-end; justify-content: center; background: rgba(0,0,0,0.72); padding: 0; }
.ah-detail { width: 100%; max-width: 460px; margin: 0; padding: 16px 16px calc(18px + env(safe-area-inset-bottom)); border-radius: 20px 20px 0 0; background: linear-gradient(180deg, #221830, #17111f); border: 1px solid rgba(255,255,255,0.12); border-top: 3px solid var(--rc, #9aa7b5); box-shadow: 0 -12px 40px rgba(0,0,0,0.6); display: flex; flex-direction: column; gap: 8px; max-height: 88vh; overflow-y: auto; }
.ah-detail-head { display: flex; align-items: center; gap: 12px; }
.ah-detail-art { position: relative; width: 62px; height: 62px; flex: 0 0 auto; display: grid; place-items: center; }
.ah-detail-art svg, .ah-detail-art img { width: 56px; height: 56px; }
.ah-detail-name { font-weight: 900; font-size: 1.12rem; line-height: 1.15; }
.ah-detail-sub { font-size: 0.78rem; color: #b7a9cf; text-transform: capitalize; }
.ah-detail-x { flex: 0 0 auto; width: 32px; height: 32px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.06); color: #e8e2d6; font-weight: 800; cursor: pointer; }
.ah-detail-stats { font-weight: 800; font-size: 0.95rem; color: #f2ead9; }
.ah-detail-meta { font-size: 0.74rem; }
.ah-detail-actions { display: flex; gap: 8px; margin-top: 6px; align-items: stretch; }
.ah-detail-close { flex: 0 0 auto; padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: #e8e2d6; font-weight: 800; cursor: pointer; }
.ah-cmp { margin-top: 4px; padding: 6px 8px; border-radius: 10px; background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.08); }
.ah-cmp-head { font-size: 0.66rem; font-weight: 700; color: #b9c2cf; margin-bottom: 4px; }
.ah-cmp-head b { color: #e7edf4; font-weight: 800; }
.ah-cmp-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.ah-cmp-chip { font-size: 0.64rem; font-weight: 800; padding: 2px 6px; border-radius: 999px; white-space: nowrap; line-height: 1.3; }
.ah-cmp-chip.up { color: #7ee89a; background: rgba(62,192,106,0.16); border: 1px solid rgba(62,192,106,0.32); }
.ah-cmp-chip.down { color: #ff9a8f; background: rgba(224,74,74,0.14); border: 1px solid rgba(224,74,74,0.3); }
.ah-cmp-same { font-size: 0.64rem; font-weight: 700; color: #9aa7b5; }
.ah-card-meta { font-size: 0.68rem; line-height: 1.3; }
.ah-buy { margin-top: 4px; width: 100%; padding: 9px; border-radius: 10px; border: none; cursor: pointer; font-weight: 900; font-size: 0.86rem; color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); box-shadow: 0 3px 0 #b57f22; transition: transform .1s ease, box-shadow .1s ease; }
.ah-buy:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #b57f22; }
.ah-buy:disabled { opacity: .55; cursor: default; background: rgba(255,255,255,0.08); color: #cbb9e0; box-shadow: none; }
.ah-buy.is-mine { background: rgba(120,200,255,0.12); color: #bfe3ff; }
/* THE PRICE FORM IS A BOTTOM SHEET, not the bottom of the page.
   It used to render after the whole grid of sellable gear, so picking an item near the top left the form
   somewhere below the fold with nothing to say it had appeared — you had to scroll the entire inventory to
   find out where to type a price. Now it slides up over the content the moment an item is picked, which is
   also where a thumb already is. */
.ah-listform { position: fixed; left: 0; right: 0; bottom: 0; z-index: 60; margin: 0;
    padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
    border-radius: 18px 18px 0 0; background: linear-gradient(180deg, #241c33, #1a1426);
    border: 1px solid rgba(255,215,110,0.4); border-bottom: none;
    box-shadow: 0 -10px 34px rgba(0,0,0,0.62);
    display: flex; flex-direction: column; gap: 10px;
    animation: ahSheetUp .22s cubic-bezier(.2,.8,.3,1) both; }
@keyframes ahSheetUp { from { transform: translateY(102%); } to { transform: translateY(0); } }
/* Keep the last row of gear reachable above the sheet. */
.ah-sell-padded { padding-bottom: 300px; }
.ah-listform-title { font-weight: 800; font-size: 1rem; }
.ah-field { display: flex; flex-direction: column; gap: 5px; font-size: 0.8rem; font-weight: 700; color: #cbb9e0; }
.ah-field input { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: #f2ead9; font-size: 1rem; font-weight: 800; }
.ah-days { display: flex; gap: 6px; }
.ah-days button { flex: 1 1 0; padding: 9px 0; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: #f2ead9; font-weight: 800; cursor: pointer; }
.ah-days button.is-on { color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); border-color: transparent; }
.ah-feeline { font-size: 0.8rem; }
.ah-listform-btns { display: flex; gap: 8px; }
.ah-list-btn { flex: 1 1 auto; padding: 12px; border-radius: 12px; border: none; cursor: pointer; font-weight: 900; font-size: 0.95rem; color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); box-shadow: 0 4px 0 #b57f22; }
.ah-list-btn:disabled { opacity: .5; cursor: default; box-shadow: none; }
.ah-cancel-btn { flex: 0 0 auto; padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: #e8e2d6; font-weight: 800; cursor: pointer; }
.ah-mine { display: flex; flex-direction: column; gap: 8px; }
.ah-minerow { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-left: 3px solid var(--rc,#9aa7b5); }
.ah-minerow-art { width: 44px; height: 44px; display: grid; place-items: center; flex: 0 0 auto; }
.ah-minerow-art svg, .ah-minerow-art img { width: 40px; height: 40px; }
.ah-minerow-body { flex: 1 1 auto; min-width: 0; }
.ah-minerow-name { font-weight: 800; font-size: 0.9rem; }
`;
