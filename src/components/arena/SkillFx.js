"use client";

// ── THE EFFECTS LAYER ────────────────────────────────────────────────────────────────────────────────────────
// One component, every skill. A move fires and this throws the right particles for its KIND in the right
// colour for its ELEMENT — so a new archetype or a re-attuned piece looks different without anyone drawing
// anything or writing another animation.
//
// It is deliberately DOM + CSS rather than canvas. Nothing here needs a physics step: each particle is a span
// given a random angle, distance and delay through custom properties, and a keyframe does the rest on the
// compositor. That means it costs nothing on a phone, it inherits the element colour for free, and adding a
// kind is a keyframe and a case rather than a render loop.
//
// Mounted with a `key` that changes per cast, so React replays it from scratch every time.

const ELEMENT_COLOR = {
    fire: "#ff6b3c", water: "#4aa3ff", earth: "#6ad07a", storm: "#ffd75e", light: "#fff0a8", shadow: "#b061ff",
};

// How many pieces, and which shape class, per archetype.
// A kind you cannot tell apart from another kind with your eyes is not really a different kind. Every one of
// the eleven archetypes gets its own shape, direction and motion, so a Flurry never looks like a Strike and a
// Drain never looks like a Rend.
const SHAPE = {
    strike: { n: 14, cls: "shard" },     // a scatter of blade shards
    flurry: { n: 26, cls: "slash" },     // a rapid volley of thin slashes
    spell: { n: 18, cls: "mote" },       // slow orbiting motes
    execute: { n: 16, cls: "spike" },    // hard inward spikes
    rend: { n: 20, cls: "cinder" },      // embers that fall and keep burning
    drain: { n: 18, cls: "wisp" },       // wisps pulled back TOWARD you
    sunder: { n: 16, cls: "crack" },     // armour fragments blown outward
    gamble: { n: 20, cls: "coin" },      // tumbling coins
    surge: { n: 16, cls: "ember" },      // embers rising off you
    ward: { n: 14, cls: "plate" },       // shield plates snapping into place
    riposte: { n: 16, cls: "barb" },     // barbs turning around and going back
    basic: { n: 10, cls: "shard" },
};

// Deterministic scatter from the index — no Math.random, so a re-render can't reshuffle the burst mid-flight.
const spread = (i, n) => {
    const golden = 137.508;
    return {
        "--a": `${(i * golden) % 360}deg`,
        "--d": `${38 + ((i * 53) % 46)}px`,
        "--s": `${0.55 + (((i * 31) % 70) / 100)}`,
        "--t": `${((i * 37) % 160)}ms`,
    };
};

export default function SkillFx({ kind = "strike", element = null, side = "right", crit = false }) {
    const shape = SHAPE[kind] || SHAPE.basic;
    const color = ELEMENT_COLOR[element] || "#ffd75e";

    return (
        <span className={`fx is-${side}${crit ? " is-crit" : ""}`} style={{ "--c": color }} aria-hidden="true">
            <span className="fx-flash" />
            <span className={`fx-ring is-${kind}`} />
            {Array.from({ length: shape.n }).map((_, i) => (
                <span key={i} className={`fx-p is-${shape.cls}`} style={spread(i, shape.n)} />
            ))}

            <style jsx>{`
                .fx { position: absolute; top: 0; bottom: 0; width: 50%; pointer-events: none; z-index: 22;
                    display: grid; place-items: center; }
                .fx.is-right { right: 0; }
                .fx.is-left { left: 0; }

                /* A wash of the element's colour over the target — the thing that actually reads at a glance. */
                .fx-flash { position: absolute; inset: -10%; border-radius: 50%;
                    background: radial-gradient(circle, color-mix(in srgb, var(--c) 55%, transparent), transparent 68%);
                    animation: fxFlash .42s ease-out both; }
                @keyframes fxFlash { from { opacity: .95; transform: scale(.5) } to { opacity: 0; transform: scale(1.5) } }

                /* A shockwave whose shape follows the archetype. */
                .fx-ring { position: absolute; width: 96px; height: 96px; border-radius: 50%;
                    border: 3px solid var(--c); box-shadow: 0 0 26px var(--c);
                    animation: fxRing .5s cubic-bezier(.15,.8,.3,1) both; }
                .fx-ring.is-ward { border-width: 6px; border-radius: 22%; }
                .fx-ring.is-surge { border-style: dashed; }
                .fx-ring.is-execute { border-radius: 14%; }
                @keyframes fxRing { from { opacity: 1; transform: scale(.35) } to { opacity: 0; transform: scale(2.1) } }

                /* Every particle is the same span; the shape class changes what it looks like and the custom
                   properties change where it goes. */
                .fx-p { position: absolute; width: 9px; height: 9px; background: var(--c);
                    filter: drop-shadow(0 0 8px var(--c));
                    animation: fxOut .62s cubic-bezier(.1,.75,.3,1) var(--t) both; }
                .fx-p.is-shard { clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
                .fx-p.is-mote { border-radius: 50%; animation-name: fxOrbit; animation-duration: .85s; }
                .fx-p.is-spike { clip-path: polygon(50% 0, 62% 62%, 50% 100%, 38% 62%); animation-name: fxIn; }
                .fx-p.is-coin { border-radius: 50%; background: linear-gradient(180deg, #ffe08a, #ffb020);
                    animation-name: fxTumble; }
                .fx-p.is-ember { border-radius: 50%; animation-name: fxRise; animation-duration: .9s; }
                .fx-p.is-plate { border-radius: 2px; width: 14px; height: 5px; animation-name: fxIn; }
                /* FLURRY — thin fast slashes, many of them, over almost as soon as they start. */
                .fx-p.is-slash { width: 22px; height: 2px; border-radius: 1px;
                    animation-name: fxOut; animation-duration: .34s; }
                /* REND — cinders that fall and linger, because the burn does too. */
                .fx-p.is-cinder { width: 6px; height: 6px; border-radius: 50%;
                    animation-name: fxFall; animation-duration: 1.1s; }
                /* DRAIN — pulled back toward the caster rather than thrown away from the target. */
                .fx-p.is-wisp { width: 7px; height: 7px; border-radius: 50%;
                    animation-name: fxSiphon; animation-duration: .8s; }
                /* SUNDER — hard angular chips of broken guard. */
                .fx-p.is-crack { width: 11px; height: 4px; clip-path: polygon(0 0, 100% 40%, 80% 100%, 10% 60%);
                    animation-name: fxOut; animation-duration: .5s; }
                /* RIPOSTE — goes out, turns, and comes back. */
                .fx-p.is-barb { width: 10px; height: 3px; clip-path: polygon(0 50%, 70% 0, 100% 50%, 70% 100%);
                    animation-name: fxReturn; animation-duration: .7s; }

                @keyframes fxFall {
                    from { opacity: 1; transform: rotate(var(--a)) translateX(calc(var(--d) * .5)) translateY(-10px) scale(var(--s)); }
                    60% { opacity: .9; }
                    to { opacity: 0; transform: rotate(var(--a)) translateX(calc(var(--d) * .5)) translateY(44px) scale(.3); } }
                @keyframes fxSiphon {
                    from { opacity: 0; transform: rotate(var(--a)) translateX(var(--d)) scale(var(--s)); }
                    30% { opacity: 1; }
                    to { opacity: 0; transform: rotate(var(--a)) translateX(0) scale(.2); } }
                @keyframes fxReturn {
                    0% { opacity: 1; transform: rotate(var(--a)) translateX(0) scale(var(--s)); }
                    45% { opacity: 1; transform: rotate(var(--a)) translateX(var(--d)) scale(var(--s)); }
                    100% { opacity: 0; transform: rotate(calc(var(--a) + 180deg)) translateX(var(--d)) scale(.4); } }

                @keyframes fxOut {
                    from { opacity: 1; transform: rotate(var(--a)) translateX(0) scale(var(--s)); }
                    to { opacity: 0; transform: rotate(var(--a)) translateX(var(--d)) scale(0); } }
                /* Spikes and shield plates come INWARD — a finisher lands on them, a ward closes around you. */
                @keyframes fxIn {
                    from { opacity: 0; transform: rotate(var(--a)) translateX(calc(var(--d) * 1.7)) scale(var(--s)); }
                    45% { opacity: 1; }
                    to { opacity: 0; transform: rotate(var(--a)) translateX(6px) scale(var(--s)); } }
                @keyframes fxOrbit {
                    from { opacity: 1; transform: rotate(var(--a)) translateX(10px) scale(var(--s)); }
                    to { opacity: 0; transform: rotate(calc(var(--a) + 140deg)) translateX(var(--d)) scale(.2); } }
                @keyframes fxTumble {
                    from { opacity: 1; transform: rotate(var(--a)) translateX(0) rotateY(0) scale(var(--s)); }
                    to { opacity: 0; transform: rotate(var(--a)) translateX(var(--d)) rotateY(900deg) scale(.4); } }
                @keyframes fxRise {
                    from { opacity: 1; transform: rotate(var(--a)) translateX(calc(var(--d) * .4)) translateY(0) scale(var(--s)); }
                    to { opacity: 0; transform: rotate(var(--a)) translateX(calc(var(--d) * .4)) translateY(-70px) scale(.2); } }

                /* A genuinely well-timed hit gets more of everything. */
                .fx.is-crit .fx-flash { animation-duration: .6s; }
                .fx.is-crit .fx-ring { border-width: 5px; animation-duration: .68s; }
                .fx.is-crit .fx-p { width: 12px; height: 12px; }
            `}</style>
        </span>
    );
}
