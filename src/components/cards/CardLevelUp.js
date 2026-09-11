"use client";

// ── CROSSING A RUNG ──────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THIS WAS COMPUTED AND NEVER DRAWN. The server has worked out every rung a run crossed since the ladder
// went in -- run.levelled, an entry per rung carrying the cards, the trinket and the pet it opens -- and it
// grants the pet too. Nothing in the client ever read it, so a player crossed a rank, was silently handed an
// animal they had no idea existed, and saw a score. See [[declared-but-never-read]].
//
// ⚠️ AND THE FIRST DRAW OF IT WAS A LIST OF WORDS. "NEW CARDS IN THE POOL: Thunderstoop" as plain text, one
// picture on the pet row. Luke: "the level up system needs polish in this window as does the unlocked stuff,
// it should all be sprites and dopamine inducing." He is right -- this is the payout for an entire run, and a
// payout you READ instead of SEE is a receipt. Every unlock is now the object itself: the real card face off
// the same renderer the hand uses, the trinket's own item art, the animal's sprite at the level you have it
// at, behind the rays-and-sparks CardGot already uses when a relic drops.
//
// ⚠️ NO STATE AND NO TIMERS. The obvious build is a carousel that steps rung by rung; the previous screen
// that did that (CardPetGains) shipped a bug where a row "keeps popping up and going away", because anything
// re-rendering on an interval inside a results panel fights the panel's own scroll. So every rung is drawn at
// once, stacked, and the cascade is pure CSS animation-delay off a beat index computed during render. Nothing
// here can appear and then leave, and the player can scroll back up to a rung they scrolled past.

import { useMemo } from "react";

import CardFace, { Sprite } from "@/components/cards/CardFace";
import { cardById, perkById } from "@/lib/marketplace/cards-kit.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";

const BEAT = 200;     // ms between one reveal and the next, all the way down
const LEAD = 160;     // ms before the first one

export default function CardLevelUp({ levelled, petArt = {} }) {
    // A flat running beat index across every rung, so the cascade never restarts at a rung boundary: the
    // trinket on rank 7 arrives after the card on rank 7, which arrived after the banner on rank 7, which
    // arrived after everything on rank 6.
    const steps = useMemo(() => {
        const list = Array.isArray(levelled) ? levelled : [];
        let beat = 0;
        return list.map((step) => {
            const head = beat++;
            const cards = (step.cards || []).map((id) => cardById(id)).filter(Boolean);
            const perks = (step.perks || []).map((id) => perkById(id)).filter(Boolean);
            const pet = step.pet ? collectibleById(step.pet) : null;
            const out = {
                level: step.level, name: step.name, head,
                cards: cards.length ? { beat: beat++, items: cards } : null,
                perks: perks.length ? { beat: beat++, items: perks } : null,
                pet: pet ? { beat: beat++, item: pet } : null,
            };
            return out;
        });
    }, [levelled]);

    if (!steps.length) return null;
    const delay = (beat) => ({ animationDelay: `${LEAD + beat * BEAT}ms` });

    return (
        <div className="clv">
            {steps.map((step, si) => (
                <div className="clv-step" key={step.level}>
                    {/* One burst, on the first rung. Repeating it per rung reads as a strobe rather than as a
                        celebration, and a run can cross four of them. */}
                    {si === 0 ? (
                        <>
                            <span className="clv-rays" aria-hidden="true" />
                            <span className="clv-sparks" aria-hidden="true">
                                {Array.from({ length: 14 }, (_, i) => (
                                    <span key={i} className="clv-spark" style={{ "--a": `${i * 25.7}deg`, "--d": `${(i % 5) * 90}ms` }} />
                                ))}
                            </span>
                        </>
                    ) : <span className="clv-halo" aria-hidden="true" />}

                    <div className="clv-head" style={delay(step.head)}>
                        <span className="clv-rung">Rank {step.level}</span>
                        {step.name ? <b className="clv-name">{step.name}</b> : null}
                    </div>

                    {/* EVERYTHING THIS RUNG PAID, IN ONE ROW. The first build stacked card, then trinket, then
                        pet, each under its own heading -- three rungs came to sixteen hundred pixels inside a
                        results panel that already carries the tally above it, so the pet nobody knew they had
                        was now a pet nobody scrolls to. Side by side, a rung is one glance. */}
                    <div className="clv-row">
                        {step.cards?.items.map((c, i) => (
                            <span key={c.id} className="clv-tile" style={{ animationDelay: `${LEAD + step.cards.beat * BEAT + i * 110}ms` }}>
                                <span className="cf-card clv-card"><CardFace card={c} art={petArt[c.pet]} /></span>
                                <em className="clv-kind">card</em>
                            </span>
                        ))}

                        {step.perks?.items.map((t, i) => (
                            <span key={t.id} className="clv-tile is-item" style={{ animationDelay: `${LEAD + step.perks.beat * BEAT + i * 110}ms` }}>
                                <span className="clv-art">
                                    <span className="clv-ring" aria-hidden="true" />
                                    {/* Sprite is a COMPONENT, so the class below is reached with :global -- a
                                        scoped rule aimed at a custom child matches nothing at all. */}
                                    <Sprite className="clv-item-art" src={`/images/cards/items/${t.id}.png`} />
                                </span>
                                <b>{t.name}</b>
                                {t.text ? <i>{t.text}</i> : null}
                                <em className="clv-kind">trinket</em>
                            </span>
                        ))}

                        {step.pet ? (
                            <span className="clv-tile is-pet" style={delay(step.pet.beat)}>
                                <span className="clv-art">
                                    <span className="clv-ring is-big" aria-hidden="true" />
                                    {/* Raw img, not a wrapper: styled-jsx only stamps DOM elements. */}
                                    {petArt[step.pet.item.id]?.url ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img src={petArt[step.pet.item.id].url} alt="" className="clv-pet-art" draggable="false" />
                                    ) : null}
                                </span>
                                <b>{step.pet.item.name}</b>
                                <i>Its cards can turn up in your runs now.</i>
                                <em className="clv-kind">companion</em>
                            </span>
                        ) : null}
                    </div>
                </div>
            ))}

            <style jsx>{`
                .clv { position: relative; display: flex; flex-direction: column; align-items: center; gap: 22px;
                    width: 100%; padding: 18px 8px 6px; text-align: center; }

                .clv-step { position: relative; width: 100%; display: flex; flex-direction: column;
                    align-items: center; gap: 10px; }

                /* The burst sits behind the first rung's name. Everything after it draws a plain soft halo,
                   so a four-rung run is one celebration with echoes, not four of them fighting. */
                .clv-rays { position: absolute; left: 50%; top: 34px; width: 420px; height: 420px;
                    margin: -210px 0 0 -210px; pointer-events: none; z-index: 0; opacity: 0.45;
                    background: repeating-conic-gradient(from 0deg, rgba(255, 214, 120, 0.34) 0deg 7deg, rgba(255, 214, 120, 0) 7deg 18deg);
                    mask-image: radial-gradient(circle, #000 10%, transparent 64%);
                    -webkit-mask-image: radial-gradient(circle, #000 10%, transparent 64%);
                    animation: clvSpin 30s linear infinite; }
                @keyframes clvSpin { to { transform: rotate(360deg); } }
                .clv-halo { position: absolute; left: 50%; top: 30px; width: 280px; height: 150px;
                    margin: -75px 0 0 -140px; pointer-events: none; z-index: 0;
                    background: radial-gradient(ellipse, rgba(255, 198, 96, 0.2), rgba(255, 198, 96, 0) 70%); }

                .clv-sparks { position: absolute; left: 50%; top: 40px; width: 0; height: 0; pointer-events: none; z-index: 0; }
                .clv-spark { position: absolute; left: 0; top: 0; width: 7px; height: 7px; margin: -3px 0 0 -3px;
                    border-radius: 50%; background: #ffe8ae; box-shadow: 0 0 10px rgba(255, 208, 108, 0.9);
                    opacity: 0; animation: clvFly 1700ms ease-out var(--d) infinite; }
                @keyframes clvFly {
                    0% { transform: rotate(var(--a)) translateY(0) scale(0.35); opacity: 0; }
                    20% { opacity: 1; }
                    100% { transform: rotate(var(--a)) translateY(-120px) scale(0.15); opacity: 0; }
                }

                .clv-head { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center;
                    gap: 1px; animation: clvPunch 620ms cubic-bezier(0.18, 1.5, 0.4, 1) both; }
                @keyframes clvPunch {
                    0% { transform: scale(0.5); opacity: 0; }
                    58% { transform: scale(1.09); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
                .clv-rung { font-size: 0.66rem; letter-spacing: 0.24em; text-transform: uppercase; color: #d8b36a; }
                .clv-name { font-size: 1.6rem; line-height: 1.08; color: #fff3d6;
                    text-shadow: 0 0 24px rgba(255, 198, 96, 0.55), 0 2px 0 rgba(0, 0, 0, 0.5); }

                .clv-row { position: relative; z-index: 1; display: flex; flex-wrap: wrap; justify-content: center;
                    align-items: flex-start; gap: 10px; width: 100%; }

                .clv-tile { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 114px;
                    animation: clvDeal 560ms cubic-bezier(0.2, 1.35, 0.4, 1) both; }
                @keyframes clvDeal {
                    0% { transform: translateY(24px) rotate(-7deg) scale(0.7); opacity: 0; }
                    100% { transform: none; opacity: 1; }
                }
                /* THE ANIMAL IS THE BIGGEST PRIZE ON THE ROW, so it is drawn biggest. At trinket size it read
                   as one more thing in a line of things, and it is the only one of the three you keep. */
                .clv-tile.is-pet { width: 168px; }
                .clv-tile.is-pet .clv-art { height: 112px; }
                .clv-tile.is-pet b { font-size: 0.92rem; color: #ffe9bd; }
                .clv-tile.is-item, .clv-tile.is-pet { padding: 8px 7px 9px; border-radius: 13px;
                    border: 1px solid rgba(214, 178, 106, 0.3);
                    background: linear-gradient(180deg, rgba(62, 50, 34, 0.62), rgba(24, 20, 16, 0.62)); }
                .clv-tile b { font-size: 0.78rem; line-height: 1.15; color: #f2dfb2; }
                .clv-tile i { font-size: 0.62rem; font-style: normal; line-height: 1.3; color: #a1957f; }
                .clv-kind { margin-top: 3px; font-style: normal; font-size: 0.56rem; letter-spacing: 0.2em;
                    text-transform: uppercase; color: #8c7f6a; }

                /* CardFace's own global block sets .cf-card to 96x138; this wins on specificity, being two
                   classes deep with the scope hash on it. */
                .clv-card { --cf-w: 100px; --cf-h: 144px; position: relative; width: var(--cf-w); height: var(--cf-h);
                    padding: 0 0 8px; flex: none; filter: drop-shadow(0 0 15px rgba(255, 196, 92, 0.3)); }

                .clv-art { position: relative; display: flex; align-items: center; justify-content: center;
                    width: 100%; height: 84px; margin-bottom: 2px; }
                .clv-ring { position: absolute; left: 50%; top: 50%; width: 86px; height: 86px; margin: -43px 0 0 -43px;
                    border-radius: 50%; pointer-events: none;
                    background: radial-gradient(circle, rgba(255, 202, 104, 0.32), rgba(255, 202, 104, 0) 68%);
                    animation: clvPulse 2.8s ease-in-out infinite; }
                .clv-ring.is-big { width: 128px; height: 128px; margin: -64px 0 0 -64px; }
                @keyframes clvPulse { 0%, 100% { transform: scale(0.9); opacity: 0.65; } 50% { transform: scale(1.08); opacity: 1; } }

                .clv-tile :global(.clv-item-art) { position: relative; width: 78px; height: 78px; object-fit: contain;
                    filter: drop-shadow(0 6px 9px rgba(0, 0, 0, 0.5)); animation: clvBob 3.2s ease-in-out infinite; }
                .clv-pet-art { position: relative; width: 118px; height: 118px; object-fit: contain;
                    filter: drop-shadow(0 8px 11px rgba(0, 0, 0, 0.55)); animation: clvBob 3.6s ease-in-out infinite; }
                @keyframes clvBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

                @media (max-width: 380px) {
                    .clv-name { font-size: 1.4rem; }
                    .clv-tile { width: 104px; }
                    .clv-card { --cf-w: 92px; --cf-h: 133px; }
                }
            `}</style>
        </div>
    );
}
