import { COSMETIC_SLOTS, resolveCosmetics } from "@/lib/marketplace/avatar-cosmetics.js";
import { borderClass } from "@/lib/marketplace/borders.js";

// A member's avatar as a LAYERED stack: aura (behind) → the circular portrait (border + photo/generated
// avatar, clipped) → effect/headwear/pet (in front, allowed to overflow the circle). Presentational and
// server-or-client safe. `size` is the circle diameter in px; overlays scale from it (font-size = size).
export default function AvatarStack({ avatarUrl, initial = "?", size = 48, border = "none", cosmetics = null, className = "" }) {
    const c = resolveCosmetics(cosmetics);
    // Native cosmetics (hats) are baked into avatarUrl. Auras = CSS glow. SVG cosmetics = our own vector art.
    const svgItems = COSMETIC_SLOTS.map((s) => c[s]).filter((x) => x && x.kind === "svg");
    return (
        <span className={`av-stack ${className}`.trim()} style={{ width: size, height: size, fontSize: `${size}px` }}>
            {c.aura && c.aura.kind === "overlay" ? <span className={`av-aura av-aura-${c.aura.id}`} aria-hidden="true" /> : null}
            <span className={`av-stack-clip ${borderClass(border)}`.trim()}>
                {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" />
                ) : (
                    <span className="av-stack-initial" aria-hidden="true">{initial}</span>
                )}
            </span>
            {svgItems.map((it) => (
                // Trusted static SVG from our own catalog (not user input).
                <span key={it.id} className={`av-svg av-svg-${it.place}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: it.svg }} />
            ))}
        </span>
    );
}
