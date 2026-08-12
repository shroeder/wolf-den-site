"use client";

// ── A STONE, FOR SALE ────────────────────────────────────────────────────────────────────────────────────────
// The same shelf in both shops: the Quartermaster takes doubloons, the Armoury takes laurels. One component so
// the two cannot drift into describing the same item differently.
//
// This is the FLOOR UNDER THE LUCK. Stones drop from four systems, and randomness eventually hands somebody
// nothing for a month — a chase item you cannot chase is a wall rather than a chase. The price is deliberately
// unfriendly: roughly a month of deciding this is the thing you are saving for. Nobody buys one by accident.
//
// In the Armoury it is the ONE fixed-price thing in a shop that is otherwise all crates, and that is the point:
// a floor that is itself a gamble is not a floor.
// The two currencies this shelf trades in, each with its own coin. Doubloons at the Quartermaster, laurels
// in the Armoury — the shelf is shared, so the coin has to follow the shop rather than the component.
const COIN = { doubloons: "/images/sailing/doubloon.png", laurels: "/images/arena/armoury/laurel.png" };

export default function PetStoneShelf({ shop, currency, purse, busy, onBuy }) {
    if (!shop?.stones?.length) return null;
    const unit = currency === "laurels" ? "laurels" : "doubloons";
    const price = Number(shop.price) || 0;

    return (
        <div className="psts">
            <div className="psts-head">
                <b className="psts-h">Pet stones</b>
                <span className="psts-sub">Make one pet&rsquo;s ability permanent</span>
            </div>
            <div className="psts-row">
                {shop.stones.map((s) => {
                    const held = Number(shop.held?.[s.id]) || 0;
                    const poor = purse < price;
                    return (
                        <div key={s.id} className="psts-card" style={{ "--stone": s.color }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="psts-art" src={s.art} alt="" draggable="false" />
                            <b className="psts-name">{s.name}</b>
                            <span className="psts-line">{s.line}</span>
                            {held ? <em className="psts-held">{held} in hand</em> : null}
                            {/* ── THE PRICE IS THE PRICE, AFFORDABLE OR NOT ───────────────────────────────
                                It read "Need 4,000" when short and "4,000 doubloons" when not, so the one
                                number a member is trying to compare across a shelf changed its wording
                                depending on their balance — and the shelf beside it (the Enchantment Scroll,
                                the tracks) shows a coin and a number. The label is now the same in both
                                states: the currency's own coin, then the cost. Disabled says "you cannot
                                afford this" far better than the word need does, and the title carries the
                                shortfall for anyone who wants the arithmetic. */}
                            <button type="button" className="psts-buy" disabled={busy || poor}
                                onClick={() => onBuy?.(s.id)}
                                title={poor ? `${(price - purse).toLocaleString()} more ${unit} needed` : `Costs ${price.toLocaleString()} ${unit}`}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img className="psts-buy-coin" src={COIN[unit]} alt={unit} draggable="false" />
                                {price.toLocaleString()}
                            </button>
                        </div>
                    );
                })}
            </div>
            <p className="psts-note">
                They also turn up in a deep seam, on a dig, off a boss kill and in the dungeons. This is for when
                the dice never land your way.
            </p>
        </div>
    );
}
