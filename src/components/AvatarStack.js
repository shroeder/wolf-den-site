import { resolveCosmetics } from "@/lib/marketplace/avatar-cosmetics.js";
import { borderClass } from "@/lib/marketplace/borders.js";

// A member's avatar as a LAYERED stack: aura (behind) → the circular portrait (border + photo/generated
// avatar, clipped) → effect/headwear/pet (in front, allowed to overflow the circle). Presentational and
// server-or-client safe. `size` is the circle diameter in px; overlays scale from it (font-size = size).
export default function AvatarStack({ avatarUrl, initial = "?", size = 48, border = "none", cosmetics = null, className = "" }) {
    const c = resolveCosmetics(cosmetics);
    return (
        <span className={`av-stack ${className}`.trim()} style={{ width: size, height: size, fontSize: `${size}px` }}>
            {c.aura ? <span className={`av-aura av-aura-${c.aura.id}`} aria-hidden="true" /> : null}
            <span className={`av-stack-clip ${borderClass(border)}`.trim()}>
                {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" />
                ) : (
                    <span className="av-stack-initial" aria-hidden="true">{initial}</span>
                )}
            </span>
            {c.effect ? <span className={`av-effect av-effect-${c.effect.id}`} aria-hidden="true">{c.effect.glyph}</span> : null}
            {c.headwear ? <span className="av-headwear" aria-hidden="true">{c.headwear.glyph}</span> : null}
            {c.pet ? <span className="av-pet" aria-hidden="true">{c.pet.glyph}</span> : null}
        </span>
    );
}
