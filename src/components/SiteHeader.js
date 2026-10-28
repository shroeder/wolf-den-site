"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { borderClass } from "@/lib/marketplace/borders.js";
import { isGamePath } from "@/lib/marketplace/game-paths.js";
import { memberSession } from "@/lib/member-session-client";
import { useTvMode } from "@/lib/tv-mode-client";

// ── ⚠️ A SPRITE PER DESTINATION, AND NOT ONE EMOJI ──────────────────────────────────────────────────────────
// Luke, 2026-10-28, looking at the open drawer: "we should have a custom sprite per."
//
// Two of these rows carried 🎮 and 💳 inside the label STRING, which is how emoji survive a no-emoji rule —
// they are not markup, so nothing greps them. They render as Apple's art on one phone and Google's on the
// next, and sitting in a drawer beside the Den's own drawings they read as borrowed clipart. GameNav settled
// this for the game menu already; this is the same fix for the site menu.
//
// ⚠️ THESE ARE THE SAME FILES GameNav USES, NOT A SECOND SET. /public/images/nav is drawn by
// scripts/gen-nav-icons.mjs in the house style, and a parallel icon set for the same destination is how two
// menus start disagreeing about what the Marketplace looks like.
//
// `sprite: null` means NO DRAWING EXISTS YET and the row deliberately renders label-only — About, Mystery
// Bags and Events have no die-cut icon in that folder. A near-enough stand-in is worse than a gap: it quietly
// becomes the permanent answer and nobody remembers it was a placeholder.
const navItems = [
    { href: "/about", label: "About", sprite: null },
    { href: "/shop", label: "Shop", sprite: "store" },
    // The whole RPG game (boss/spin/pets/gear/quests/…) lives behind ONE entry now, so it stops competing
    // with real commerce in the nav. Its own dopamine menu is at /marketplace/play.
    // "home" is the sprite GameNav already maps to /marketplace/play — the game's own front door.
    { href: "/marketplace/play", label: "Game", sprite: "home" },
    { href: "/marketplace/credit", label: "Store Credit", sprite: "credit" },
    { href: "/looking-for", label: "Looking For", sprite: "bounties" },
    { href: "/marketplace", label: "Marketplace", sprite: "market" },
    { href: "/mystery-bags", label: "Mystery Bags", sprite: null },
    { href: "/events", label: "Events", sprite: null },
    { href: "/sell-cards", label: "Sell Your Cards", sprite: "trades" },
];

// Initials for the account avatar, from the customer's name or email.
function initialsOf(customer) {
    const src = String(customer?.name || customer?.firstName || customer?.email || "").trim();
    if (!src) return "?";
    const parts = src.split(/[\s@._-]+/).filter(Boolean);
    const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2);
    return chars.toUpperCase();
}

// ── ⚠️ TWO MENUS IS THE FIRST THING A NEW MEMBER MEETS ───────────────────────────────────────────────────────
// Luke: "when you are in the game, there should be one menu. Because its confusing people with the top middle
// menu and top left menu. I would think we would have clarity when inside the game."
//
// /marketplace/* lives inside the PUBLIC layout, so a game screen was served this header — brand, nine shop
// links, Discord, a hamburger, TV mode, cart, account — AND GameNav underneath it, which is itself a
// twenty-two pill strip over a seven-section grid. Roughly forty destinations stacked in the top two inches,
// in two different visual languages, on the screen somebody opens for the first time.
//
// Neither bar is wrong where it belongs. The shop nav is right on /shop; the game nav is right in the game.
// They are only wrong TOGETHER, so the fix is about where, not about what: inside the game this collapses to
// the brand and the account button, and GameNav is the only menu on the screen.
//
// ⚠️ THE BRAND STAYS, AND IT IS LOAD-BEARING. It is the way back to the shop. GameNav has no exit — seven
// sections, forty-odd entries, and not one of them leaves /marketplace — so a header with no brand would
// leave the browser button as the only way out of the game. Same trap game-paths.js documents five times
// over, one level up.
export default function SiteHeader() {
    const pathname = usePathname() || "";
    // ⚠️ THE SAME PREDICATE THE NAV AND THE PATHFINDER USE. A second list of "what counts as the game" would
    // drift on the first new area, and the symptom would be this bar reappearing in one room and not its
    // neighbour — see the note at the top of game-paths.js.
    const slim = isGamePath(pathname);
    const [open, setOpen] = useState(false);
    const [tvMode, setTvMode] = useTvMode();
    const [cartCount, setCartCount] = useState(null);
    const [cartLoading, setCartLoading] = useState(false);
    const [cartEnabled, setCartEnabled] = useState(false);
    const [authLoading, setAuthLoading] = useState(false);
    const [authCustomer, setAuthCustomer] = useState(null);
    const [mktAvatar, setMktAvatar] = useState(null);
    const [mktName, setMktName] = useState(null);
    const [mktBorder, setMktBorder] = useState("none");
    const [mktAuthed, setMktAuthed] = useState(false);
    // Luke: "Need a way to get to vard vault from menu." Door 8 of 9 — see the note on the nav list below.
    const [mktVault, setMktVault] = useState(false);

    const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";

    // The member's profile avatar (their logo) + public name — used for the account button. Fetched
    // once; falls back to initials when there's no avatar.
    useEffect(() => {
        let alive = true;
        (async () => {
            // ⚠️ THROUGH memberSession, NOT A BARE FETCH. The peekers need the same answer on the same
            // page load, and two layout-mounted components asking the same endpoint is one request per
            // navigation per visitor for ever. One promise, both callers.
            const b = await memberSession();
            if (alive && b) {
                setMktAuthed(true);
                setMktAvatar(b.avatarUrl || null);
                setMktName(b.displayLabel || null);
                setMktBorder(b.border || "none");
                setMktVault(Boolean(b.vault));
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        if (!paymentsEnabled) {
            return;
        }

        const syncCartState = async () => {
            setCartLoading(true);
            setAuthLoading(true);

            // The PAYMENTS_ENABLED env flag is the single source of truth for exposing checkout.
            setCartEnabled(true);

            try {
                // chrome-fanout: on-demand — behind NEXT_PUBLIC_PAYMENTS_ENABLED, which is off
                const response = await fetch("/api/shop/cart", { cache: "no-store" }).catch(() => null);
                const payload = response ? await response.json().catch(() => null) : null;

                if (!response?.ok || !payload) {
                    setCartCount(0);
                    return;
                }

                setCartCount(Number(payload.itemCount || 0));

                // chrome-fanout: on-demand — behind NEXT_PUBLIC_PAYMENTS_ENABLED, which is off
                const authResponse = await fetch("/api/shop/auth", { cache: "no-store" }).catch(() => null);
                const authPayload = authResponse ? await authResponse.json().catch(() => null) : null;

                if (authResponse?.ok && authPayload?.authenticated) {
                    setAuthCustomer(authPayload.customer || null);
                } else {
                    setAuthCustomer(null);
                }
            } finally {
                setCartLoading(false);
                setAuthLoading(false);
            }
        };

        syncCartState();

        const onStorage = () => {
            syncCartState();
        };

        const onCartUpdated = () => {
            syncCartState();
        };

        window.addEventListener("storage", onStorage);
        window.addEventListener("wolfden-shop-cart-updated", onCartUpdated);

        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("wolfden-shop-cart-updated", onCartUpdated);
        };
    }, [paymentsEnabled]);

    const toggleTvMode = () => {
        const nextValue = !tvMode;
        setTvMode(nextValue);

        if (nextValue) {
            setOpen(false);
        }
    };

    // ⚠️ ONE COPY, BECAUSE BOTH HEADERS DRAW IT. The slim in-game bar and the full shop bar show the same
    // account control, and two copies of it would disagree the first time either the border, the fallback
    // initials or the signed-out destination changed.
    const accountButton = mktAuthed ? (
        <Link href="/marketplace/profile" className="nav-account" title="Your account" aria-label="Your account" onClick={() => setOpen(false)}>
            {mktAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={`nav-account-avatar nav-account-avatar-img ${borderClass(mktBorder)}`.trim()} src={mktAvatar} alt="Your account" />
            ) : (
                <span className={`nav-account-avatar ${borderClass(mktBorder)}`.trim()}>{initialsOf({ name: mktName })}</span>
            )}
        </Link>
    ) : (
        <Link href="/marketplace/login" className="pill nav-signin" onClick={() => setOpen(false)}>Sign In</Link>
    );

    // ── THE IN-GAME BAR ──────────────────────────────────────────────────────────────────────────────
    // The brand, and the account. Nothing else: no shop links, no Discord, no cart, no hamburger, no TV
    // mode. Those all belong to the shop, and inside the game every one of them is a door competing with
    // the forty GameNav already offers.
    //
    // ⚠️ RETURNED AFTER EVERY HOOK, NOT BEFORE. All of this component's state and effects are declared
    // above — branching earlier would call a different number of hooks on a game page than on a shop page,
    // which is the one thing React will not forgive.
    if (slim) {
        return (
            <header className="site-header is-slim">
                <div className="shell top-row">
                    <Link href="/" className="brand" title="Back to the shop">
                        <Image className="brand-mark" src="/logo/logo.png" alt="The Wolf Den logo"
                            width={1536} height={1024} sizes="34px" priority />
                        <span>The Wolf Den</span>
                    </Link>
                    <div className="top-right">{accountButton}</div>
                </div>
            </header>
        );
    }

    // ── THE CARD VAULT IN THE SITE MENU ──────────────────────────────────────────────────────────────────
    // Luke, with a card already in it: "Need a way to get to vard vault from menu."
    //
    // It was reachable from the game nav and from the end of a reveal, and neither of those is where you
    // look for a thing you own. The site menu is the one list that is on every page.
    //
    // ⚠️ GATED ON THE SAME PREDICATE AS EVERY OTHER DOOR, carried on the auth/me reply this component was
    // already reading (door 8 of 9, docs/virtual-packs-and-the-card-vault.md §16.2). Not isOwner — a bare
    // owner check is a gate that does not open when the feature does, and this feature has nine of them.
    //
    // Placed straight after Mystery Bags because that is where a card in it came from.
    const links = mktVault
        ? navItems.flatMap((item) => (item.href === "/mystery-bags"
            ? [item, { href: "/marketplace/vault", label: "Card Vault", sprite: "cards" }]
            : [item]))
        : navItems;

    // Nav links (+ Discord) shared by the desktop inline bar and the mobile dropdown.
    const navContent = (
        <>
            {links.map((item) => (
                <Link key={item.href} href={item.href} className="nav-link" onClick={() => setOpen(false)}>
                    {/* ⚠️ The sprite is DECORATION, so it is aria-hidden with an empty alt and the label stays
                        real text beside it. An icon-only row is unreadable to a screen reader and ambiguous to
                        everyone else; the drawing is there to make the row findable at a glance, not to
                        replace the word. CSS hides it in the desktop inline bar, where nine icons would
                        overflow a strip that already squeezes its own padding twice to fit. */}
                    {item.sprite ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="nav-sprite" src={`/images/nav/${item.sprite}.png`} alt="" aria-hidden="true" width={24} height={24} />
                    ) : null}
                    <span>{item.label}</span>
                </Link>
            ))}
            <a className="nav-link nav-link-discord" href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.291.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.946 2.418-2.157 2.418z" />
                </svg>
                Join Discord
            </a>
        </>
    );

    return (
        <header className="site-header">
            <div className="shell top-row">
                <div className="top-left">
                    {/* ── ⚠️ THE WOLF IS THE MENU ON A PHONE ─────────────────────────────────────────
                        Luke, 2026-10-28: "the menu on the phone should be part of the Wolf icon, and it
                        should be a left drawer that overlaps, as you would expect in a phone app."

                        So on a phone the mark is a BUTTON that opens the drawer, and on a desktop it stays
                        a LINK home. Two elements, one visible at a time, rather than one element with a
                        conditional handler: a link that sometimes does not navigate is the kind of thing
                        that breaks middle-click, breaks "open in new tab", and reads as a bug to anyone
                        who tries it.

                        ⚠️ THE DESKTOP LINK HOME STAYS, AND IT IS LOAD-BEARING. The note on the slim header
                        records it: the brand is the way back to the shop, and GameNav has no exit of its
                        own. Phones get the drawer, which contains that same way out. */}
                    <button
                        type="button"
                        className={`brand brand-menu${open ? " brand-menu-open" : ""}`}
                        aria-label={open ? "Close menu" : "Open menu"}
                        aria-expanded={open}
                        onClick={() => setOpen((v) => !v)}
                    >
                        <Image
                            className="brand-mark"
                            src="/logo/logo.png"
                            alt=""
                            width={1536}
                            height={1024}
                            sizes="50px"
                            priority
                        />
                        {/* ── ⚠️ THE WOLF ALONE DOES NOT READ AS A BUTTON ────────────────────────────
                            Luke: "ensure its apparant how to open the menu." A logo is the one thing on a
                            page everybody has been trained NOT to expect a menu behind — it is the way
                            home. Merging the two without a mark means the menu is, in practice, hidden.

                            So the bars stay, just attached to the wolf instead of floating three inches
                            away as their own button. It is still "part of the Wolf icon" as asked; it is
                            simply legible. The glyph flips to an × when open, which is the other half of
                            the affordance — the control that opened it is visibly the one that closes it. */}
                        <span className="brand-menu-glyph" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                                {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
                            </svg>
                        </span>
                        <span className="brand-menu-word">Menu</span>
                    </button>
                    <Link href="/" className="brand brand-link" onClick={() => setOpen(false)}>
                        <Image
                            className="brand-mark"
                            src="/logo/logo.png"
                            alt="The Wolf Den logo"
                            width={1536}
                            height={1024}
                            sizes="50px"
                            priority
                        />
                        <span>The Wolf Den</span>
                    </Link>
                </div>
                <nav className="nav-inline" aria-label="Primary">{navContent}</nav>
                <button
                    type="button"
                    className="nav-icon nav-menu"
                    aria-label={open ? "Close menu" : "Open menu"}
                    aria-expanded={open}
                    disabled={tvMode}
                    onClick={() => setOpen((v) => !v)}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
                    </svg>
                </button>
                <div className="top-right">
                    <button
                        type="button"
                        className={`nav-icon tv-toggle${tvMode ? " tv-toggle-active" : ""}`}
                        onClick={toggleTvMode}
                        aria-pressed={tvMode}
                        aria-label={tvMode ? "Exit fullscreen / TV mode" : "Fullscreen / TV mode"}
                        title={tvMode ? "Exit TV mode" : "Fullscreen / TV mode"}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            {tvMode ? (
                                <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
                            ) : (
                                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
                            )}
                        </svg>
                    </button>
                    {paymentsEnabled && cartEnabled && (
                        <Link href="/cart" className="nav-icon nav-cart-icon" title="Cart" aria-label="Cart" onClick={() => setOpen(false)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="9" cy="21" r="1" />
                                <circle cx="20" cy="21" r="1" />
                                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                            </svg>
                            {Number(cartCount || 0) > 0 ? <span className="nav-cart-badge">{cartCount > 99 ? "99+" : cartCount}</span> : null}
                        </Link>
                    )}
                    {accountButton}
                </div>
            </div>
            {/* ⚠️ THE SCRIM IS NOT DECORATION. A drawer with no way to dismiss it except the exact
                control that opened it is the thing that makes a web menu feel like a web menu. Tapping
                anywhere outside closes it, which is what every phone app does and what a thumb tries
                first. aria-hidden because it is a dismiss target, not content. */}
            {open ? <button type="button" className="nav-scrim" aria-hidden="true" tabIndex={-1} onClick={() => setOpen(false)} /> : null}
            <nav
                /* ⚠️ nav-drawer IS ITS OWN CLASS ON PURPOSE. Styling the drawer through .nav-row meant
                   inheriting a pile of header rules written for a dropdown — one of which pinned the
                   height to 70px, so a panel with top:0 and bottom:0 still rendered as a stub. A new
                   class owns the whole box and nothing else in the sheet can reach it. */
                className={`nav-row nav-drawer${open ? " nav-open" : ""}`}
                aria-label="Main navigation"
            >
                <div className="shell nav-inner">{navContent}</div>
            </nav>
        </header>
    );
}
