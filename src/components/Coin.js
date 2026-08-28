import { COIN_ICON } from "@/lib/coin-icon";

// ── ONE COIN, EVERYWHERE, THE SAME COIN ──────────────────────────────────────────────────────────────────────
// The gold coin was the 🪙 emoji, drawn by whatever font the device ships. Google's is gold; APPLE'S IS A
// SILVER QUARTER WITH AN EAGLE ON IT — so on an iPad the game's currency was a different coin from the one
// every screenshot, sprite and shop card shows. Luke: "ipad shows a quarter instead of the desired gold coin
// sprite?"
//
// It also broke the standing rule in this codebase: no emoji in the UI, a sprite or a react-icons glyph. The
// art already existed at /images/ui/coin.png and the casino has been using its own file for months.
//
// `size` matches the em-height the emoji occupied at each call site, so nothing reflows.
export default function Coin({ size = 16, className = "" }) {
    return (
        <img
            src={COIN_ICON}
            alt=""
            aria-hidden="true"
            width={size}
            height={size}
            className={className}
            style={{ display: "inline-block", verticalAlign: "-0.15em", width: size, height: size, flex: "0 0 auto" }}
        />
    );
}
