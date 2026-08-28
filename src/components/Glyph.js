// ── A GLYPH THAT MIGHT BE A PICTURE ──────────────────────────────────────────────────────────────────────────
// Half the game's data tables carry a little `icon`/`emoji` string that a client drops straight into JSX. That
// works until the glyph in question is the CURRENCY: the coin emoji is drawn by whatever font the device
// ships, and Apple's is a silver quarter with an eagle on it (see Coin.js). The tables are plain data behind an
// API route, so they cannot hold a component — but they can hold a path.
//
// So this renders an image when the value looks like one and the text when it does not, which lets a single
// table hold "/images/ui/coin.png" next to a 🎣 without every consumer learning the difference.
export default function Glyph({ value, size = 16, className = "" }) {
    if (typeof value === "string" && value.startsWith("/")) {
        // `size` may be a number of pixels or a CSS length like "1.5em" — a badge pill sizes its glyph off the
        // surrounding font. The width/height ATTRIBUTES only take a number, so a CSS length goes to the style
        // alone; passing "1.5em" as an attribute is invalid and the browser drops it.
        const px = typeof size === "number" ? size : null;
        // eslint-disable-next-line @next/next/no-img-element
        return (
            <img
                src={value}
                alt=""
                aria-hidden="true"
                width={px ?? undefined}
                height={px ?? undefined}
                className={className}
                style={{ display: "inline-block", verticalAlign: "-0.15em", width: size, height: size, flex: "0 0 auto" }}
            />
        );
    }
    return <span aria-hidden="true" className={className}>{value}</span>;
}
