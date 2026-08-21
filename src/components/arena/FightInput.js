"use client";

// ── THE ONE THING A MEMBER DOES IN A FIGHT ───────────────────────────────────────────────────────────────────
// Pick what to throw. That is the whole loop, and this is the whole interface to it.
//
// ── THERE WAS A TIMING GAME HERE AND IT IS GONE ──────────────────────────────────────────────────────────────
// A marker swept a lit zone and you tapped it, twice an exchange — once on your swing, once on their answer.
// It was the third timing mechanic this game has had and the third to be removed. Luke, having played it:
// "just remove the timing mini game entirely i hate it during combat."
//
// The first two were removed because they GATED things and this one deliberately did not: it multiplied, it
// never punished, and missing the window fought the fight a competent hand would have. That answered the
// objection the first two earned and it did not answer the real one, which is simpler — a fight is a place to
// spend a DECISION, and a rhythm test interrupts the decision to ask for a reflex. Worse on the defensive
// half, where there was no decision at all: you were going to tap it every time, so the only thing that
// window measured was whether you were still holding the phone.
//
// What is left is the deck. Their beat resolves itself and arrives as transcript (see advance() in
// arena-ring.js), which also halves what a bout costs — it was 42-60 taps and half of them were braces nobody
// was choosing.
export default function FightInput({ bout, busy, onAct }) {
    const awaiting = bout?.awaiting || null;
    // A finished bout, or a transcript from before interactive combat shipped, has nothing to ask for.
    if (awaiting !== "act") return null;

    const deck = bout?.deck || [];
    const cd = bout?.cd || {};

    return (
        <div className="fin">
            <div className="fin-lab">
                <span>Your beat</span>
                <em>{deck.length ? "attack, or spend a skill" : "no skills yet — see the Skills tab"}</em>
            </div>
            <div className="fin-deck">
                <button type="button" className="fin-cmd is-attack" disabled={busy} onClick={() => onAct(null)}>
                    <b>Attack</b>
                    <span>your plain swing</span>
                </button>
                {deck.map((k) => {
                    const cooling = Number(cd[k.id]) || 0;
                    return (
                        <button key={k.id} type="button" className="fin-cmd" disabled={busy || cooling > 0}
                            onClick={() => onAct(k.id)}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={k.sprite} alt="" draggable="false" />
                            <b>{k.name}</b>
                            {cooling > 0
                                ? <i className="fin-cd">{cooling}</i>
                                : <span>{k.power > 0 ? `${k.power.toFixed(2)}x` : "no blow"}{k.free ? " · free" : ""}</span>}
                        </button>
                    );
                })}
            </div>

            <style jsx global>{`
                /* ── IT MUST NOT BE SOMETHING YOU SCROLL TO ──────────────────────────────────────────
                   The arena field is tall — background, two fighters, the telegraph — and on a 390px phone
                   the deck landed below the fold. Stuck to the bottom for the whole beat, on its own ground
                   so the buttons are never read against a fighter sprite. */
                .fin { position: sticky; bottom: 0; z-index: 4; display: grid; gap: 8px;
                    padding: 9px 9px calc(9px + env(safe-area-inset-bottom, 0px));
                    margin: 0 -9px -9px; border-radius: 16px 16px 0 0;
                    background: linear-gradient(to top, rgba(8,6,12,.97) 72%, rgba(8,6,12,.82));
                    border-top: 1px solid rgba(255,255,255,.12); }
                .fin-lab { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
                .fin-lab span { font-size: 9.5px; font-weight: 900; letter-spacing: .16em;
                    text-transform: uppercase; color: #9aa2ab; }
                .fin-lab em { font-style: normal; font-size: 9.5px; color: #7d858f; }

                /* One row, thumb-sized. Four buttons at most — a plain attack and three skills — so they can
                   share the width evenly without any of them getting too small to hit. */
                .fin-deck { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 6px; }
                .fin-cmd { display: grid; justify-items: center; gap: 3px; padding: 10px 5px 8px;
                    border-radius: 14px; cursor: pointer; min-height: 62px;
                    background: rgba(10,8,14,.55); border: 1px solid rgba(255,255,255,.12);
                    transition: transform .1s ease, border-color .16s ease; }
                .fin-cmd.is-attack { background: rgba(255,255,255,.06); }
                .fin-cmd:active:not(:disabled) { transform: scale(.96); }
                .fin-cmd img { width: 26px; height: 26px; object-fit: contain; }
                .fin-cmd b { font-size: 11px; font-weight: 900; color: #e8ecf1; line-height: 1.1; }
                .fin-cmd span { font-size: 9px; color: #8b93a0; }
                .fin-cmd:disabled { opacity: .42; cursor: default; }
                .fin-cd { font-style: normal; font-size: 12px; font-weight: 900; color: #ffb35c;
                    font-variant-numeric: tabular-nums; }
            `}</style>
        </div>
    );
}
