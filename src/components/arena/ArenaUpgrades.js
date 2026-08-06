"use client";

import CoinCta from "@/components/CoinCta";

// ── ARENA UPGRADE TRACKS ─────────────────────────────────────────────────────────────────────────────────────
// Deliberately the SAME card as the boat, the dig site and the rail: `sail-upg` markup, the level pips, the
// fill bar, the now → next effect line and CoinCta when you cannot afford it.
//
// Reusing those class names rather than inventing arena ones is the point. A member who has upgraded a boat
// already knows how to read this, and a change to how upgrades look lands everywhere at once instead of in
// five places that have drifted apart.
//
// These are NOT the skill tree, and keeping them apart matters: the tree is a build bought with a currency
// you cannot farm, and these are the flat always-good numbers you buy with gold. No amount of gold buys a
// skill point, so the tree can never become pay-to-win.
export default function ArenaUpgrades({ upgrades = [], gold = 0, busy, onBuy, flash }) {
    if (!upgrades.length) return null;
    return (
        <div className="ar-upg-wrap">
            <h2 className="sail-upg-h">Arena training</h2>
            <p className="muted ar-upg-sub">
                Bought with gold, and separate from your skill points — training sharpens the numbers, the tree
                decides how you fight.
            </p>
            <div className="sail-upgrades is-boat">
                {upgrades.map((u) => (
                    <div key={u.id}
                        className={`sail-upg${u.maxed ? " is-maxed" : ""}${flash === u.id ? " is-bought" : ""}`}>
                        <div className="sail-upg-top">
                            <span className="sail-upg-title">
                                <span className="sail-upg-ico">{u.icon}</span>{u.name}
                            </span>
                            <span className="muted sail-upg-lv">Lv {u.level}/{u.max}</span>
                        </div>
                        <div className="sail-upg-bar" aria-hidden="true">
                            <span style={{ width: `${u.max ? Math.min(100, (u.level / u.max) * 100) : 0}%` }} />
                        </div>
                        <p className="muted sail-upg-desc">{u.desc}</p>
                        <div className="sail-upg-effect">
                            <b>
                                {u.now}
                                {u.maxed ? "" : <> → <span className="sail-upg-next">{u.next}</span></>}
                            </b>
                        </div>
                        {u.maxed
                            ? <span className="muted sail-upg-lv">Maxed</span>
                            : gold < u.cost
                                ? <CoinCta price={u.cost} have={gold} className="sail-upg-cta" />
                                : (
                                    <button type="button" className="btn-ghost sail-upg-buy" disabled={busy}
                                        onClick={() => onBuy(u.id)}>
                                        🪙 {u.cost.toLocaleString()}
                                    </button>
                                )}
                    </div>
                ))}
            </div>
            <style jsx global>{`
                .ar-upg-wrap { margin-top: 18px; }
                .ar-upg-sub { margin: 2px 0 12px; font-size: 12px; line-height: 1.5; }
            `}</style>
        </div>
    );
}
