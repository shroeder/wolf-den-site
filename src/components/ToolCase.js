"use client";

// ── THE TOOL CASE — CRAFTING GEAR, ON THE SCREEN WHERE GEAR LIVES ───────────────────────────────────────────
// Eric, 2026-11-09: "Anyone who has the ability to get crafting gear in the game from the grove needs to have
// their equipment screen extended. Maybe a second tab to swap between gear and crafting gear."
//
// The twelve Grove tools pay into twelve different systems — fishing, mining, digging, the forge, the farm,
// sailing, cooking, pets, delves, the jeweller, the arena and the weekly boss. Every one of those bonuses
// applies outside the Grove, and until now the only place to SEE them was a shelf inside it. A member
// harvesting their farm had no way to learn that a hoe they earned three maps ago was why the yield went up.
//
// ⚠️ READ-ONLY, BECAUSE THERE IS NOTHING TO DECIDE. The combat doll opposite is a picker: ten slots, each
// with a ranked list of alternatives behind it. A tool has no alternatives — you hold one per slot or you do
// not, the tier only ever goes up, and nothing can be swapped in or taken off. Giving these cards a tap
// target would promise a choice that does not exist. They state, they do not ask.
//
// ⚠️ THE PERCENTAGE IS THE ONE THE GAME PAYS, AND IT IS SMALLER THAN THE GROVE'S OWN SHELF CLAIMS.
// groveState's `toolMeta` multiplies the tier by the quality band (up to 1.9x) and its comment asserts that
// is "what the tool actually gives" — but the twelve live consumers all read groveToolPct, which does not
// multiply by the band at all. Rather than copy either number, this takes `pct` from groveToolCase, which
// sums the same way the live accessor does. The band is printed beside it as its own fact instead of being
// folded in. See the note on groveToolCase in grove-tools.js — the discrepancy is a defect to settle, and
// this screen follows whichever way it is settled without being edited.

/** The tier's own share and the act-quest perk's, so "+9%" on a tier II tool is not a mystery. */
function Split({ t }) {
    if (!t.perkPct) return null;
    return (
        <small className="toolcase-split">
            {t.toolPct}% tool + {t.perkPct}% quest perk
        </small>
    );
}

export default function ToolCase({ toolCase }) {
    const slots = toolCase?.slots || [];
    const held = toolCase?.heldCount || 0;
    const total = toolCase?.total || slots.length;

    return (
        <div className="card toolcase">
            <div className="toolcase-head">
                <h3>Crafting gear</h3>
                <span className="toolcase-count">{held} of {total} earned</span>
            </div>

            {/* What these ARE, in one line. The combat doll needs no explanation because everyone has worn a
                sword in a game before; a tool that silently raises your farm yield is not self-evident. */}
            <p className="toolcase-intro">
                Tools come from the Grove and help you <b>everywhere else</b> — each one raises the rewards of
                its own system. They cannot be equipped or swapped: you hold one per slot, and its tier rises
                as you go deeper.
            </p>

            <div className="toolcase-grid">
                {slots.map((t) => {
                    const owned = t.tier > 0;
                    return (
                        <div
                            key={t.slot}
                            className={`toolcase-item${owned ? " is-owned" : " is-empty"}`}
                            style={owned ? { borderColor: t.band.tint } : undefined}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="toolcase-art" src={t.art} alt="" aria-hidden="true" />
                            <div className="toolcase-body">
                                <b className="toolcase-name">
                                    {t.name}
                                    {t.numeral ? <span className="toolcase-tier"> {t.numeral}</span> : null}
                                </b>

                                {owned ? (
                                    <>
                                        <span className="toolcase-band" style={{ color: t.band.tint }}>
                                            {t.band.name}
                                            {/* A reworked tool is a tool somebody paid twice for. Nothing can
                                                pay for another roll today (groveRework was deleted with the
                                                bench), so this is history — but it is the member's history. */}
                                            {t.reworks ? <i> · reworked {t.reworks}x</i> : null}
                                        </span>
                                        <span className="toolcase-pct">
                                            +{t.pct}% <span>{t.bonus}</span>
                                        </span>
                                        <Split t={t} />
                                    </>
                                ) : (
                                    <>
                                        <span className="toolcase-band is-none">Not earned yet</span>
                                        <span className="toolcase-pct is-none">
                                            would raise <span>{t.bonus}</span>
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ⚠️ WHERE THEY COME FROM, BECAUSE IT CHANGED YESTERDAY. The workbench was deleted 2026-11-08
                and the kill bar replaced it the same day; a member who remembers crafting these at a bench
                would otherwise go looking for a bench that is gone. The number is not restated here — saying
                "kill things in a Grove zone" is the durable half, and BAR_KILLS is a mint rate that is
                expected to be retuned. */}
            {held < total ? (
                <p className="toolcase-foot">
                    Earn the rest by clearing enemies in the Grove — a bar fills as you fight, and each time it
                    fills you get the next tool for that map&apos;s tier.
                </p>
            ) : (
                <p className="toolcase-foot">
                    Every tool for your depth is earned. Going deeper raises their tiers; a full bar now pays a
                    chest instead.
                </p>
            )}
        </div>
    );
}
