"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { borderClass } from "@/lib/marketplace/borders.js";
import { useTvMode } from "@/lib/tv-mode-client";

const navItems = [
    { href: "/about", label: "About" },
    { href: "/shop", label: "Shop" },
    { href: "/marketplace/rewards", label: "🏆 Rewards" },
    { href: "/looking-for", label: "Looking For" },
    { href: "/marketplace", label: "Marketplace" },
    { href: "/mystery-bags", label: "Mystery Bags" },
    { href: "/events", label: "Events" },
    { href: "/sell-cards", label: "Sell Your Cards" },
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
    const [mktAvatar, setMktAvatar] = useState(null);
    const [mktName, setMktName] = useState(null);
    const [mktBorder, setMktBorder] = useState("none");

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
                setMktBorder(b.border || "none");
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

    // Nav links (+ Discord) shared by the desktop inline bar and the mobile dropdown.
    const navContent = (
        <>
            {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="nav-link" onClick={() => setOpen(false)}>
                    {item.label}
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
                    <Link href="/" className="brand" onClick={() => setOpen(false)}>
                        <Image
                            className="brand-mark"
                            src="/logo/logo.png"
                            alt="The Wolf Den logo"
                            width={1536}
                            height={1024}
                            sizes="30px"
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
                    {paymentsEnabled && cartEnabled && authCustomer ? (
                        <Link href="/shop/account" className="nav-account" title="Your account (orders, sign out)" aria-label="Your account" onClick={() => setOpen(false)}>
                            {mktAvatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className={`nav-account-avatar nav-account-avatar-img ${borderClass(mktBorder)}`.trim()} src={mktAvatar} alt="Your account" />
                            ) : (
                                <span className={`nav-account-avatar ${borderClass(mktBorder)}`.trim()}>{initialsOf({ name: mktName || authCustomer.name, email: authCustomer.email })}</span>
                            )}
                        </Link>
                    ) : paymentsEnabled && cartEnabled ? (
                        <Link href="/shop/account" className="pill nav-signin" onClick={() => setOpen(false)}>
                            {authLoading ? "…" : "Sign In"}
                        </Link>
                    ) : null}
                </div>
            </div>
            <nav
                className={`nav-row${open ? " nav-open" : ""}`}
                aria-label="Main navigation"
            >
                <div className="shell nav-inner">{navContent}</div>
            </nav>
        </header>
    );
}
