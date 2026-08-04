"use client";

// ── HOW THE RUN ENDED ────────────────────────────────────────────────────────────────────────────────────────
// Three endings, and the card has to make the difference obvious at a glance: you cleared it, you died, or you
// walked out. All three PAY — that is the point of the design and the card says so plainly, because "you died"
// on a screen full of loot is otherwise a confusing thing to read.

// Raw <img>: styled-jsx does not scope a custom component, so `.dlw-art` would never have matched.

export default function DelveWrap({ finished, onClose }) {
    // TWO endings now. "You turned back" went with the retreat button: it ended the run and paid exactly what
    // dying pays, so it was a button whose only function was to stop playing.
    const { cleared, died, floor, gold, xp, bonusGold, bonusXp, chests = [], parts = [], frags = 0, gear = [] } = finished;
    const tone = cleared ? "is-clear" : "is-dead";
    const title = cleared ? "The way is clear" : "You fell";
    const line = cleared
        ? "The boss is down and the dungeon is quiet."
        : `Floor ${floor} was as far as you got. You keep everything you had already banked.`;

    return (
        <div className="dlw" role="dialog" aria-modal="true" onClick={onClose}>
            <div className={`dlw-card ${tone}`} onClick={(e) => e.stopPropagation()}>
                {cleared ? (
                    <div className="dlw-rays" aria-hidden="true">
                        {Array.from({ length: 26 }).map((_, i) => (
                            <span key={i} style={{ "--a": `${i * (360 / 26)}deg`, animationDelay: `${(i % 6) * 0.05}s` }} />
                        ))}
                    </div>
                ) : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cleared ? "/images/delves/ev-victory.webp" : "/images/delves/ev-death.webp"} className="dlw-art" alt="" draggable="false" />
                <h3>{title}</h3>
                <p className="dlw-line">{line}</p>

                <div className="dlw-rows">
                    <div className="dlw-row"><span>Gold</span><b>{gold.toLocaleString()}</b></div>
                    <div className="dlw-row"><span>XP</span><b>{xp.toLocaleString()}</b></div>
                    {chests.length ? <div className="dlw-row"><span>Chests</span><b>{chests.length}</b></div> : null}
                    {parts.map((p) => <div key={p.tier} className="dlw-row"><span>{p.name}</span><b>{p.n}</b></div>)}
                    {frags ? <div className="dlw-row"><span>Chest shards</span><b>{frags}</b></div> : null}
                </div>
                {/* Gear is named, not counted. A line reading "Gear 1" is the least interesting way to tell
                    someone the dungeon just handed them a legendary. */}
                {gear.length ? (
                    <div className="dlw-gear">
                        {gear.map((g, i) => <span key={i} className={`dlw-gear-row is-${g.rarity}`}>{g.name}</span>)}
                    </div>
                ) : null}
                {/* Called out separately so the completion purse reads as the reward for finishing rather than
                    disappearing into the total. */}
                {cleared && (bonusGold || bonusXp) ? (
                    <div className="dlw-bonus">Clearing it paid a purse of <b>{bonusGold.toLocaleString()}</b> gold and <b>{bonusXp.toLocaleString()}</b> XP on top.</div>
                ) : null}

                <button type="button" className="dlv-btn" onClick={onClose}>Back to the hall</button>
            </div>

            <style jsx>{`
                .dlw { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 18px;
                    background: rgba(6,4,12,0.84); backdrop-filter: blur(3px); }
                .dlw-card { position: relative; overflow: hidden; width: min(400px, 100%); padding: 22px 22px 18px;
                    border-radius: 20px; text-align: center; background: linear-gradient(180deg, #241c33, #14101f);
                    border: 2px solid #6f5a9c; box-shadow: 0 24px 70px rgba(0,0,0,0.75);
                    animation: dlwPop .38s cubic-bezier(.2,1.4,.35,1) both; }
                @keyframes dlwPop { from { opacity: 0; transform: scale(.9) translateY(12px); } to { opacity: 1; transform: none; } }
                .dlw-card.is-clear { border-color: #ffd75e; box-shadow: 0 24px 70px rgba(0,0,0,0.75), 0 0 60px rgba(255,190,60,0.35); }
                .dlw-card.is-dead { border-color: #ff6f7d; }
                .dlw-rays { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
                .dlw-rays span { position: absolute; width: 3px; height: 46px; border-radius: 2px; background: linear-gradient(#ffd75e, transparent);
                    transform-origin: 50% 0; animation: dlwRay 1.4s cubic-bezier(.15,.7,.3,1) both; }
                @keyframes dlwRay { from { opacity: 1; transform: rotate(var(--a)) translateY(0) scaleY(.4); }
                    to { opacity: 0; transform: rotate(var(--a)) translateY(-180px) scaleY(1); } }
                .dlw-art { position: relative; width: 92px; height: 92px; object-fit: contain; filter: drop-shadow(0 5px 16px rgba(0,0,0,0.6)); }
                .dlw-card h3 { margin: 6px 0 4px; font-size: 1.32rem; font-weight: 900; color: #e9e0ff; }
                .dlw-card.is-clear h3 { color: #ffe28a; }
                .dlw-card.is-dead h3 { color: #ffb0b8; }
                .dlw-line { margin: 0 0 14px; font-size: 0.84rem; line-height: 1.5; color: #a99fc4; }
                .dlw-rows { display: grid; gap: 5px; margin-bottom: 12px; }
                .dlw-row { display: flex; justify-content: space-between; padding: 8px 12px; border-radius: 10px;
                    background: rgba(255,255,255,0.05); font-size: 0.85rem; }
                .dlw-row span { color: #a99fc4; }
                .dlw-row b { color: #ffd75e; font-variant-numeric: tabular-nums; }
                .dlw-gear { display: grid; gap: 5px; margin-bottom: 12px; }
                .dlw-gear-row { padding: 8px 12px; border-radius: 10px; font-size: 0.85rem; font-weight: 900; color: #fff;
                    background: rgba(255,255,255,0.05); border: 1px solid currentColor; }
                .dlw-gear-row.is-rare { color: #4aa3ff; } .dlw-gear-row.is-epic { color: #b061ff; }
                .dlw-gear-row.is-legendary { color: #ffb020; } .dlw-gear-row.is-mythic { color: #33e0a1; }
                .dlw-bonus { margin: 0 0 13px; font-size: 0.76rem; line-height: 1.45; color: #cdb894; }
                .dlw-bonus b { color: #ffe28a; }
            `}</style>
        </div>
    );
}
