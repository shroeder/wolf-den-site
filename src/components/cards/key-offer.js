// ── THE THREE KEYS, WHEREVER THEY ARE OFFERED ────────────────────────────────────────────────────────────
// Luke: "all the key options need to look a lot juicer and show a sprite for the specific key."
//
// A key is offered in three rooms — the campfire, the chest and after an elite — and it is always the same
// bet: give up the thing you can see for a thing you cannot, three times, and a fourth act opens. Every one
// of those buttons was a line of text on a flat slab. The reward beside it was a painted object at 132px.
// A coloured noun does not win that argument, and the telemetry agreed: nobody took one.
//
// So the key is DRAWN, at the size the other rewards on that screen are drawn, on a plate that is lit in the
// key's own colour. The three sprites are a set — same silhouette family, different ward and different stone
// (scripts/gen-card-keys.mjs) — because a player is comparing the one in front of them against a memory of
// the other two, never against the other two.
//
// ⚠️ ONE COPY, IMPORTED BY BOTH SCREENS, for the same reason DECK_GRID_CSS is: the campfire's key button and
// the elite's key button were two different sets of rules describing one control, and they had already
// drifted — one printed the reason and one did not. Interpolated into each screen's own style block.
export const KEY_TINT = {
    emerald: { glow: "rgba(90, 220, 140, 0.30)", edge: "rgba(90, 220, 140, 0.55)", ink: "#8fe8b4" },
    sapphire: { glow: "rgba(96, 168, 255, 0.30)", edge: "rgba(96, 168, 255, 0.55)", ink: "#9fd0ff" },
    ruby: { glow: "rgba(255, 110, 90, 0.30)", edge: "rgba(255, 120, 90, 0.55)", ink: "#ffb0a0" },
};

/** Where a key's picture lives. Built from the id the way potions and trinkets already are. */
export const keyArt = (id) => `/images/cards/keys/${id}.png`;

export const KEY_OFFER_CSS = `
    .ck-offer { position: relative; display: grid; grid-template-columns: 62px 1fr;
        gap: 2px 14px; align-items: center; width: min(340px, 100%); margin: 10px auto 0;
        padding: 12px 14px; border-radius: 14px; cursor: pointer; text-align: left; font: inherit;
        border: 1px solid var(--ck-edge, rgba(255,215,94,0.45));
        background:
            radial-gradient(120px 80px at 34px 50%, var(--ck-glow, rgba(255,215,94,0.28)), transparent 70%),
            linear-gradient(180deg, rgba(24,26,34,0.96), rgba(14,16,22,0.96));
        box-shadow: 0 8px 22px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06); }
    .ck-offer:disabled { opacity: 0.5; cursor: default; }
    /* The key turns very slightly, forever. A still object on a dark plate reads as an icon; one that
       breathes reads as a thing sitting there waiting to be picked up. */
    .ck-offer-art { grid-row: 1 / 4; width: 62px; height: 62px; object-fit: contain;
        filter: drop-shadow(0 0 14px var(--ck-glow, rgba(255,215,94,0.5))) drop-shadow(0 4px 7px rgba(0,0,0,0.8));
        animation: ckSway 3.4s ease-in-out infinite; }
    @keyframes ckSway {
        0%, 100% { transform: rotate(-3deg) translateY(0); }
        50% { transform: rotate(3deg) translateY(-3px); }
    }
    .ck-offer b { font-family: var(--cf-card-font); font-size: 16px; letter-spacing: 0.02em;
        color: var(--ck-ink, #ffd75e); text-shadow: 0 2px 5px rgba(0,0,0,0.85); }
    .ck-offer i { font-style: normal; font-size: 12px; line-height: 1.35; color: #b9b2a4; }
    /* Air between the price and the reason. Photographed at 369px they ran together into one
       six-line paragraph and the sentence that says WHY a key is worth taking was the half nobody
       would read. */
    .ck-offer em { display: block; margin-top: 5px; font-style: normal; font-size: 11px;
        line-height: 1.4; color: #8f9aa8; }
`;
