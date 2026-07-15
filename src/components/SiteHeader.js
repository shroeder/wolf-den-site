"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useTvMode } from "@/lib/tv-mode-client";

const navItems = [
    { href: "/about", label: "About" },
    { href: "/pokemon-cards", label: "Pokemon Cards" },
    { href: "/magic-the-gathering", label: "Magic: The Gathering" },
    { href: "/shop", label: "Shop" },
    { href: "/marketplace/rewards", label: "🏆 Rewards" },
    { href: "/just-in", label: "Just In" },
    { href: "/looking-for", label: "Looking For" },
    { href: "/marketplace", label: "Marketplace" },
    { href: "/alerts", label: "New-Arrival Alerts" },
    { href: "/mystery-bags", label: "Mystery Bags" },
    { href: "/events", label: "Events" },
    { href: "/sell-cards", label: "Sell Your Cards" },
    { href: "/new-players", label: "New Players" },
    { href: "/community", label: "Community" },
    { href: "/faq", label: "FAQ" },
    { href: "/contact", label: "Contact" },
];

// Initials for the account avatar, from the customer's name or email.
function initialsOf(customer) {
    const src = String(customer?.name || customer?.firstName || customer?.email || "").trim();
    if (!src) return "?";
    const parts = src.split(/[\s@._-]+/).filter(Boolean);
    const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2);
    return chars.toUpperCase();
}

export default function SiteHeader() {
    const [open, setOpen] = useState(false);
    const [tvMode, setTvMode] = useTvMode();
    const [cartCount, setCartCount] = useState(null);
    const [cartLoading, setCartLoading] = useState(false);
    const [cartEnabled, setCartEnabled] = useState(false);
    const [authLoading, setAuthLoading] = useState(false);
    const [authCustomer, setAuthCustomer] = useState(null);
    const [mktAuthed, setMktAuthed] = useState(false);
    const [mktUnread, setMktUnread] = useState(0);
    const [mktAvatar, setMktAvatar] = useState(null);
    const [mktName, setMktName] = useState(null);

    const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";

    // The member's profile avatar (their logo) + public name — used for the account button. Fetched
    // once; falls back to initials when there's no avatar.
    useEffect(() => {
        let alive = true;
        (async () => {
            const r = await fetch("/api/marketplace/auth/me", { cache: "no-store" }).catch(() => null);
            const d = r && r.ok ? await r.json().catch(() => null) : null;
            const b = d?.buyer;
            if (alive && b) {
                setMktAvatar(b.avatarUrl || null);
                setMktName(b.displayLabel || null);
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    // Marketplace inbox badge: show an Inbox link + unread count for signed-in marketplace members.
    useEffect(() => {
        let alive = true;
        const load = async () => {
            const r = await fetch("/api/marketplace/unread", { cache: "no-store" }).catch(() => null);
            const d = r && r.ok ? await r.json().catch(() => null) : null;
            if (!alive || !d) return;
            setMktAuthed(Boolean(d.authenticated));
            setMktUnread(Number(d.total || 0));
        };
        load();
        const id = setInterval(load, 60000);
        return () => {
            alive = false;
            clearInterval(id);
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
                const response = await fetch("/api/shop/cart", { cache: "no-store" }).catch(() => null);
                const payload = response ? await response.json().catch(() => null) : null;

                if (!response?.ok || !payload) {
                    setCartCount(0);
                    return;
                }

                setCartCount(Number(payload.itemCount || 0));

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

    return (
        <header className="site-header">
            <div className="shell top-row">
                <div className="top-left">
                    <Link href="/" className="brand" onClick={() => setOpen(false)}>
                        <Image
                            className="brand-mark"
                            src="/logo/logo.png"
                            alt="The Wolf Den logo"
                            width={1536}
                            height={1024}
                            sizes="34px"
                            priority
                        />
                        <span>The Wolf Den</span>
                    </Link>
                    <span className="top-sep" aria-hidden="true" />
                    <a className="pill nav-discord" href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                        Join Discord
                    </a>
                    <button
                        type="button"
                        className={`tv-toggle${tvMode ? " tv-toggle-active" : ""}`}
                        onClick={toggleTvMode}
                        aria-pressed={tvMode}
                        aria-label={tvMode ? "Exit fullscreen / TV mode" : "Fullscreen / TV mode"}
                        title={tvMode ? "Exit TV mode" : "Fullscreen / TV mode"}
                    >
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            {tvMode ? (
                                <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
                            ) : (
                                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
                            )}
                        </svg>
                    </button>
                </div>
                <div className="top-right">
                    {mktAuthed ? (
                        <Link href="/marketplace/inbox" className="pill nav-inbox" onClick={() => setOpen(false)}>
                            Inbox
                            {mktUnread > 0 ? <span className="nav-inbox-badge">{mktUnread > 99 ? "99+" : mktUnread}</span> : null}
                        </Link>
                    ) : null}
                    {paymentsEnabled && cartEnabled && (
                        <>
                            <Link href="/cart" className="nav-cart-icon" title="Cart" aria-label="Cart" onClick={() => setOpen(false)}>
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <circle cx="9" cy="21" r="1" />
                                    <circle cx="20" cy="21" r="1" />
                                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                                </svg>
                                {Number(cartCount || 0) > 0 ? <span className="nav-cart-badge">{cartCount > 99 ? "99+" : cartCount}</span> : null}
                            </Link>
                            {authCustomer ? (
                                <Link href="/shop/account" className="nav-account" title="Your account (orders, sign out)" aria-label="Your account" onClick={() => setOpen(false)}>
                                    {mktAvatar ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img className="nav-account-avatar nav-account-avatar-img" src={mktAvatar} alt="Your account" />
                                    ) : (
                                        <span className="nav-account-avatar">{initialsOf({ name: mktName || authCustomer.name, email: authCustomer.email })}</span>
                                    )}
                                </Link>
                            ) : (
                                <Link href="/shop/account" className="pill" onClick={() => setOpen(false)}>
                                    {authLoading ? "…" : "Sign In"}
                                </Link>
                            )}
                        </>
                    )}
                    <button
                        className="hamburger"
                        aria-label={open ? "Close menu" : "Open menu"}
                        aria-expanded={open}
                        disabled={tvMode}
                        onClick={() => setOpen((v) => !v)}
                    >
                        <span className={`ham-bar${open ? " open" : ""}`} />
                        <span className={`ham-bar${open ? " open" : ""}`} />
                        <span className={`ham-bar${open ? " open" : ""}`} />
                    </button>
                </div>
            </div>
            <nav
                className={`nav-row${open ? " nav-open" : ""}`}
                aria-label="Main navigation"
            >
                <div className="shell nav-inner">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="nav-link"
                            onClick={() => setOpen(false)}
                        >
                            {item.label}
                        </Link>
                    ))}
                </div>
            </nav>
        </header>
    );
}
