"use client";

import { GiPadlock, GiPawPrint, GiHand, GiCutDiamond, GiCheckMark, GiTwoCoins } from "react-icons/gi";

// ── THE SHOP WINDOW ──────────────────────────────────────────────────────────────────────────────────────────
// This is the one screen in the game whose job is to SELL something, so it is built like an advertisement
// rather than like a form. The rules it follows:
//
//   SHOW THE THING. The decoration is drawn at size with three companions actually sitting on its tiers, using
//   the real sprites and the real tier positions the farm renders with. A member should understand what they
//   are buying by LOOKING. The first version of this card was a bullet list and it read like a receipt.
//
//   THE NUMBERS ARE THE HEADLINE. What you get is three tiles with the figure in large type — $5.00, 2,000, and
//   the item itself — because "how much do I get" is the question being asked and it should not be buried in a
//   sentence.
//
//   SAY WHAT IT DOES, ONCE EACH. Three lines, no more. Passive XP, double petting, the rarity count.
//
//   THE MONEY COMES BACK. Stated plainly and given its own line, because it is the strongest fact in the offer
//   and the easiest one to miss: the five dollars is not spent, it turns into credit you spend in the shop.
// The glyphs the package data names. Kept as a map rather than a dynamic import so the bundle only carries
// the handful actually used.
const DO_ICON = {
    GiPawPrint: <GiPawPrint aria-hidden="true" />,
    GiHand: <GiHand aria-hidden="true" />,
    GiCutDiamond: <GiCutDiamond aria-hidden="true" />,
};

export default function PackageCard({ offer, selected, onToggle }) {
    if (!offer) return null;
    const price = `$${((offer.priceCents || 0) / 100).toFixed(2)}`;
    const size = offer.decoSize || 132;
    const tiers = offer.tiers || [];
    const pets = offer.demoPetSprites || [];

    return (
        <div className={`pkgc${selected ? " is-on" : ""}`}>
            {offer.owned ? (
                <div className="pkgc-owned"><GiCheckMark aria-hidden="true" /> You own this — it is in your farm decorations</div>
            ) : offer.ownerPreview ? (
                <div className="pkgc-preview"><GiPadlock aria-hidden="true" /> Owner preview — members cannot see this</div>
            ) : null}

            <div className="pkgc-hero">
                {/* THE ITEM, WORKING. Same composition the farm uses: pets positioned on the measured cushion
                    tiers inside the sprite's own box, so this is a picture of the real thing and not a mockup
                    that can drift away from it. */}
                <div className="pkgc-stage">
                    <span className="pkgc-glow" aria-hidden="true" />
                    <div className="pkgc-stand" style={{ width: size, height: size }}>
                        {offer.decoSprite ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={offer.decoSprite} alt={offer.name} width={size} height={size} className="pkgc-deco" draggable="false" />
                        ) : null}
                        {tiers.map((t, i) => (pets[i] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                key={t.y}
                                src={pets[i]}
                                alt=""
                                draggable="false"
                                className="pkgc-pet"
                                style={{ left: `${t.x}%`, top: `${t.y}%`, width: Math.round(size * (t.s / 100)), height: Math.round(size * (t.s / 100)) }}
                            />
                        ) : null))}
                    </div>
                </div>
                <div className="pkgc-head">
                    <span className="pkgc-kicker">Package</span>
                    <h3>{offer.name}</h3>
                    <p>{offer.blurb}</p>
                    <span className="pkgc-price">{price}</span>
                </div>
            </div>

            <div className="pkgc-gets">
                {(offer.gets || []).map((g) => (
                    <div className="pkgc-get" key={g.key}>
                        <span className="pkgc-get-ico">
                            {g.deco && offer.decoSprite ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={offer.decoSprite} alt="" draggable="false" />
                            ) : g.icon ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={g.icon} alt="" draggable="false" />
                            ) : null}
                        </span>
                        <b>{g.big}</b>
                        <em>{g.label}</em>
                        <i>{g.note}</i>
                    </div>
                ))}
            </div>

            <div className="pkgc-back">
                <GiTwoCoins className="pkgc-back-ico" aria-hidden="true" /> The <b>{price}</b> is not spent — it lands in your account as store credit and buys whatever
                you like in the shop. The coins and the stand come on top.
            </div>

            <div className="pkgc-does">
                {(offer.does || []).map((d) => (
                    <div className="pkgc-do" key={d.head}>
                        <span className="pkgc-do-ico">{DO_ICON[d.icon] || null}</span>
                        <div><b>{d.head}</b><em>{d.body}</em></div>
                    </div>
                ))}
            </div>

            {/* Owned: the shop still SHOWS it (a shop that silently deletes what you just bought looks broken)
                but there is nothing left to sell you — the stand is one-per-farm, so a second copy could never
                leave the drawer. */}
            {offer.owned ? (
                <div className="pkgc-have">Already yours. Place it from the farm decorating tray.</div>
            ) : (
                <button type="button" className={`pkgc-cta${selected ? " is-on" : ""}`} onClick={onToggle}>
                    {selected ? <><GiCheckMark aria-hidden="true" /> Selected — pay below</> : `Get it — ${price}`}
                </button>
            )}
        </div>
    );
}
