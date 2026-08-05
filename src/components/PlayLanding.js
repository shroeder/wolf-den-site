"use client";

import Link from "next/link";
import { FaDharmachakra } from "react-icons/fa6";
import {
    GiAnvil, GiBarn, GiChestArmor, GiCrossedSwords, GiDungeonGate, GiOpenTreasureChest,
    GiPawPrint, GiPodium, GiRibbonMedal, GiScrollUnfurled, GiTwoCoins, GiVillage,
} from "react-icons/gi";

// ── THE PITCH ────────────────────────────────────────────────────────────────────────────────────────────────
// What a stranger saw before this was a grid of emoji with feature names under them — a table of contents for
// software. It never said the one thing that makes the Den different from every other free game on a phone:
// THE LOOT IS REAL. Gear here carries charges you redeem at the counter, and every boss the pack fells hands
// an actual prize to an actual member.
//
// So the page leads with that, and everything on it is true and live: the gear shown is real gear with its
// real art naming the real reward it carries, the prizes listed have genuinely been handed over, and the
// numbers are counted out of the database on each render. No mock-ups, no "coming soon", no stock icons.

const DOING = [
    { Icon: GiCrossedSwords, title: "The weekly boss", desc: "The whole pack beats on one monster. Your hits earn raffle tickets for the prize." },
    { Icon: GiDungeonGate, title: "Dungeons", desc: "Ten floors of fights, traps and choices. Go deeper, or walk out with what you've got." },
    { Icon: GiAnvil, title: "The Forge", desc: "Salvage gear into parts, then hammer your favourite piece stronger on the anvil." },
    { Icon: GiChestArmor, title: "Gear & sets", desc: "Six slots, hundreds of pieces, set bonuses for matching, and elemental affinities." },
    { Icon: GiPawPrint, title: "Pets", desc: "Collect companions, equip one, level it to five — each one changes how you earn." },
    { Icon: GiBarn, title: "Your farm", desc: "Grow crops, decorate the place, and let your pets roam. Visit other people's." },
    { Icon: GiVillage, title: "The town", desc: "A shared overworld with the rest of the pack. Raids, the tavern, and a shiny to spot." },
    { Icon: FaDharmachakra, title: "The daily spin", desc: "One free spin every day — gold, XP, chests, and the mini-wheel jackpot." },
    { Icon: GiScrollUnfurled, title: "Quests", desc: "Three fresh bounties a day, paying gold, chests and tokens." },
    { Icon: GiRibbonMedal, title: "Badges", desc: "Hundreds of them, most earned the slow way. Pick three to fly on your card." },
    { Icon: GiPodium, title: "The leaderboard", desc: "Where you actually stand against everyone else in the Den." },
    { Icon: GiOpenTreasureChest, title: "Chests", desc: "Wooden to gold. Gear, pets, consumables, and the occasional thing you'll brag about." },
];

const money = (n) => (n || 0).toLocaleString();

// NOT named `ref` — React treats a prop called ref as an element ref, so the invite code would never arrive.
export default function PlayLanding({ perks = [], parade = [], prizes = [], counts = {}, invite = "" }) {
    const refCode = invite;
    const signup = `/marketplace/login?signup=1${refCode ? `&ref=${encodeURIComponent(refCode)}` : ""}`;
    const proof = [
        { n: counts.members, label: "in the pack" },
        { n: counts.bosses, label: "bosses felled" },
        { n: counts.gear, label: "pieces of gear" },
        { n: counts.pets, label: "pets" },
        { n: counts.badges, label: "badges" },
    ].filter((s) => s.n > 0);

    return (
        <div className="pl">
            {/* ── HERO ── real gear spilling behind the promise it is there to back up. */}
            <section className="pl-hero">
                <div className="pl-spill" aria-hidden="true">
                    {parade.map((g, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={g.id} src={g.sprite} alt="" draggable="false"
                            className={`pl-spill-i is-${g.rarity}`} style={{ "--i": i }} />
                    ))}
                </div>

                <div className="pl-hero-body">
                    {refCode ? <span className="pl-kick is-ref">@{refCode} invited you</span> : <span className="pl-kick">The Wolf Den</span>}
                    <h1 className="pl-h1">Level up in the game.<br />Level up in real life.</h1>
                    <p className="pl-sub">
                        A free RPG that runs on top of the shop. Beat the weekly boss and a real prize goes home
                        with somebody. Find the right gear and it carries a booster pack, store credit — or a
                        grail card of your choice — that you redeem at the counter.
                    </p>
                    <div className="pl-cta">
                        <Link href={signup} className="pl-btn">Create a free account</Link>
                        <Link href="/marketplace/login" className="pl-btn is-ghost">I already have one</Link>
                    </div>
                    {refCode ? (
                        <p className="pl-refnote">Verify your email and you both earn bonus gold and a chest.</p>
                    ) : null}
                </div>

                {/* Counted live. A zero means the read failed, not that the Den is empty — so it stays off
                    the page rather than advertising that nobody plays. */}
                {proof.length ? (
                    <ul className="pl-proof">
                        {proof.map((s) => <li key={s.label}><b>{money(s.n)}</b><span>{s.label}</span></li>)}
                    </ul>
                ) : null}
            </section>

            {/* ── THE HOOK ── the actual reason to play, told with the actual items. */}
            {perks.length ? (
                <section className="pl-sec">
                    <span className="pl-eyebrow"><GiTwoCoins aria-hidden="true" /> The loot is real</span>
                    <h2 className="pl-h2">Some gear you wear. Some gear you spend.</h2>
                    <p className="pl-lede">
                        Charged gear carries something you can walk out of the shop with. Bring it to the
                        counter, burn a charge, take the thing. These are real pieces you can find.
                    </p>
                    <div className="pl-perks">
                        {perks.map((p) => (
                            <div key={p.id} className={`pl-perk is-${p.rarity}`}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img className="pl-perk-art" src={p.sprite} alt="" draggable="false" />
                                <span className="pl-perk-body">
                                    <em className="pl-rarity">{p.rarity}</em>
                                    <b>{p.name}</b>
                                    <span className="pl-perk-reward">{p.reward}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {/* ── PROOF ── prizes that have genuinely been handed over, named. */}
            {prizes.length ? (
                <section className="pl-sec">
                    <span className="pl-eyebrow"><GiCrossedSwords aria-hidden="true" /> Every boss has a prize</span>
                    <h2 className="pl-h2">The pack kills it. Somebody takes it home.</h2>
                    <p className="pl-lede">
                        One monster, everyone swinging. Every hit banks raffle tickets, and when it finally goes
                        down we draw for the prize. Here is what has actually gone out the door:
                    </p>
                    <div className="pl-prizes">
                        {prizes.map((p, i) => (
                            <div key={i} className="pl-prize">
                                <b>{p.prize}</b>
                                <em>won off {p.boss}</em>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {/* ── THE OTHER HALF ── the bit nobody expects: shopping is progression. */}
            <section className="pl-sec pl-irl">
                <span className="pl-eyebrow"><GiChestArmor aria-hidden="true" /> Both at once</span>
                <h2 className="pl-h2">Your shopping levels your character.</h2>
                <p className="pl-lede">
                    Buying, trading and playing at the Den pays XP into the same account you fight the boss
                    with. The two halves aren&rsquo;t separate games — the counter and the character sheet are
                    wired together, and store credit moves between them.
                </p>
            </section>

            {/* ── WHAT IT ACTUALLY IS ── */}
            <section className="pl-sec">
                <span className="pl-eyebrow"><GiDungeonGate aria-hidden="true" /> What you&rsquo;ll be doing</span>
                <h2 className="pl-h2">There is a lot in here.</h2>
                <div className="pl-grid">
                    {DOING.map((d) => (
                        <div key={d.title} className="pl-do">
                            <span className="pl-do-ico"><d.Icon aria-hidden="true" /></span>
                            <b>{d.title}</b>
                            <em>{d.desc}</em>
                        </div>
                    ))}
                </div>
            </section>

            <section className="pl-close">
                <h2 className="pl-h2">It costs nothing to start.</h2>
                <p className="pl-lede">Make an account, take your first swing at the boss, and see what drops.</p>
                <Link href={signup} className="pl-btn is-big">Create a free account</Link>
            </section>

            <style jsx>{`
                .pl { display: grid; gap: 16px; }

                /* ── hero ── */
                .pl-hero { position: relative; overflow: hidden; border-radius: 20px; padding: 30px 18px 18px;
                    background: radial-gradient(120% 90% at 50% 0%, rgba(255,190,90,0.20), transparent 62%),
                        linear-gradient(180deg, rgba(28,20,34,0.96), rgba(10,8,14,0.98));
                    border: 1px solid rgba(255,190,110,0.28); }
                /* Real gear, drifting. It is doing a job: the promise above it is about loot, so the loot is
                   what sits behind it — not an abstract gradient. */
                .pl-spill { position: absolute; inset: 0; pointer-events: none; opacity: .5; }
                .pl-spill-i { position: absolute; width: clamp(46px, 9vw, 78px); height: auto;
                    left: calc(3% + (var(--i) * 5.4%)); top: calc(6% + (var(--i) * 4.7%) - (var(--i) * 4.7% / 18 * 0));
                    transform: rotate(calc(var(--i) * 23deg));
                    animation: plDrift calc(9s + var(--i) * 0.7s) ease-in-out calc(var(--i) * -0.9s) infinite alternate;
                    filter: drop-shadow(0 8px 16px rgba(0,0,0,0.7)); }
                .pl-spill-i:nth-child(even) { top: calc(48% + (var(--i) * 2.2%)); }
                .pl-spill-i.is-eternal, .pl-spill-i.is-ascendant { filter: drop-shadow(0 8px 16px rgba(0,0,0,0.7)) drop-shadow(0 0 16px rgba(255,200,90,0.6)); }
                @keyframes plDrift { from { transform: translateY(0) rotate(calc(var(--i) * 23deg)); }
                    to { transform: translateY(-16px) rotate(calc(var(--i) * 23deg + 8deg)); } }

                .pl-hero-body { position: relative; z-index: 2; text-align: center; max-width: 620px; margin: 0 auto; }
                .pl-kick { display: inline-block; font-size: 10px; font-weight: 900; letter-spacing: .2em;
                    text-transform: uppercase; color: #ffd75e; padding: 4px 12px; border-radius: 999px;
                    background: rgba(8,6,10,0.7); border: 1px solid rgba(255,215,94,0.4); }
                .pl-kick.is-ref { color: #8bf0b4; border-color: rgba(139,240,180,0.5); }
                .pl-h1 { margin: 14px 0 0; font-size: clamp(1.75rem, 7.4vw, 2.9rem); line-height: 1.08;
                    font-weight: 900; letter-spacing: -0.02em; color: #fff;
                    text-shadow: 0 4px 30px rgba(0,0,0,0.8); }
                .pl-sub { margin: 12px auto 0; max-width: 540px; font-size: 14px; line-height: 1.6; color: #d7cdbd;
                    text-shadow: 0 2px 12px rgba(0,0,0,0.8); }
                .pl-cta { display: flex; gap: 9px; justify-content: center; flex-wrap: wrap; margin-top: 18px; }
                .pl-refnote { margin: 10px 0 0; font-size: 12px; color: #8bf0b4; }


                /* Counted out of the database every render, so it cannot drift out of date. */
                .pl-proof { position: relative; z-index: 2; list-style: none; margin: 22px 0 0; padding: 14px 0 0;
                    display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px;
                    border-top: 1px solid rgba(255,255,255,0.1); }
                .pl-proof li { display: grid; text-align: center; }
                .pl-proof b { font-size: 18px; font-weight: 900; color: #ffd75e; }
                .pl-proof span { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #8a939d; }

                /* ── sections ── */
                .pl-sec, .pl-close { border-radius: 18px; padding: 20px 16px;
                    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); }
                .pl-close { text-align: center;
                    background: radial-gradient(110% 90% at 50% 0%, rgba(255,190,90,0.16), transparent 66%), rgba(255,255,255,0.03);
                    border-color: rgba(255,190,110,0.3); }
                .pl-eyebrow { display: inline-flex; align-items: center; gap: 7px; font-size: 10px; font-weight: 900;
                    letter-spacing: .16em; text-transform: uppercase; color: #ffd75e; }
                .pl-eyebrow :global(svg) { width: 15px; height: 15px; }
                .pl-h2 { margin: 8px 0 0; font-size: clamp(1.2rem, 4.6vw, 1.6rem); font-weight: 900;
                    letter-spacing: -0.015em; color: #fff; }
                .pl-lede { margin: 8px 0 0; font-size: 13.5px; line-height: 1.62; color: #a9b0b8; max-width: 620px; }

                /* ── the perk cards ── */
                .pl-perks { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 9px; margin-top: 16px; }
                .pl-perk { display: flex; align-items: center; gap: 12px; padding: 11px; border-radius: 14px;
                    background: rgba(0,0,0,0.32); border: 1px solid var(--r, rgba(255,255,255,0.14)); }
                .pl-perk.is-rare { --r: rgba(90,160,255,0.5); }
                .pl-perk.is-epic { --r: rgba(176,97,255,0.5); }
                .pl-perk.is-legendary { --r: rgba(255,176,32,0.55); }
                .pl-perk.is-ascendant { --r: rgba(255,120,60,0.6); }
                .pl-perk.is-eternal { --r: rgba(255,80,140,0.65); }
                .pl-perk-art { flex: 0 0 auto; width: 56px; height: 56px; object-fit: contain;
                    filter: drop-shadow(0 5px 10px rgba(0,0,0,0.7)); }
                .pl-perk-body { min-width: 0; display: grid; gap: 1px; }
                .pl-rarity { font-style: normal; font-size: 9px; font-weight: 900; letter-spacing: .14em;
                    text-transform: uppercase; color: var(--r); filter: brightness(1.5); }
                .pl-perk-body b { font-size: 13.5px; color: #fff; }
                .pl-perk-reward { font-size: 12px; line-height: 1.4; color: #ffd75e; font-weight: 700; }

                /* ── prizes actually handed over ── */
                .pl-prizes { display: grid; gap: 8px; margin-top: 16px; }
                .pl-prize { display: grid; gap: 2px; padding: 11px 14px; border-radius: 12px;
                    background: rgba(0,0,0,0.3); border-left: 3px solid #ffd75e; }
                .pl-prize b { font-size: 13.5px; color: #fff; }
                .pl-prize em { font-style: normal; font-size: 11.5px; color: #8a939d; }

                .pl-irl { background: radial-gradient(90% 120% at 100% 0%, rgba(139,240,180,0.12), transparent 60%), rgba(255,255,255,0.03); }

                /* ── what you'll do ── */
                .pl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 9px; margin-top: 16px; }
                .pl-do { display: grid; gap: 3px; padding: 13px; border-radius: 13px;
                    background: rgba(0,0,0,0.28); border: 1px solid rgba(255,255,255,0.09); }
                .pl-do-ico { color: #ffd75e; }
                .pl-do-ico :global(svg) { width: 24px; height: 24px; }
                .pl-do b { font-size: 13px; color: #fff; margin-top: 3px; }
                .pl-do em { font-style: normal; font-size: 11.5px; line-height: 1.45; color: #9aa2ab; }

                .pl-close .pl-lede { margin-left: auto; margin-right: auto; }
            `}</style>

            {/* The buttons are <Link>s, and styled-jsx only stamps its scoping class onto DOM elements — a
                scoped `.pl-btn` rule would have matched nothing at all. Global, deliberately. */}
            <style jsx global>{`
                .pl-btn { display: inline-block; padding: 12px 22px; border-radius: 12px; text-decoration: none;
                    font-weight: 900; font-size: 14px; color: #241500;
                    background: linear-gradient(180deg, #ffe08a, #ffb020);
                    box-shadow: 0 10px 26px -10px rgba(255,176,32,0.9); }
                .pl-btn.is-ghost { color: #f3e8d6; background: rgba(255,255,255,0.07);
                    border: 1px solid rgba(255,255,255,0.2); box-shadow: none; }
                .pl-btn.is-big { padding: 15px 30px; font-size: 15px; }
                .pl-close .pl-btn { margin-top: 16px; }
            `}</style>
        </div>
    );
}
