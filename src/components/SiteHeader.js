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
    { href: "/mystery-bags", label: "Mystery Bags" },
    { href: "/events", label: "Events" },
    { href: "/sell-cards", label: "Sell Your Cards" },
    { href: "/new-players", label: "New Players" },
    { href: "/community", label: "Community" },
    { href: "/faq", label: "FAQ" },
    { href: "/contact", label: "Contact" },
];

export default function SiteHeader() {
    const [open, setOpen] = useState(false);
    const [tvMode, setTvMode] = useTvMode();
    const [cartCount, setCartCount] = useState(0);
    const [cartEnabled, setCartEnabled] = useState(false);

    const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";

    useEffect(() => {
        if (!paymentsEnabled) {
            return;
        }

        const syncCartState = async () => {
            let localToggleEnabled = false;

            try {
                localToggleEnabled = window.localStorage.getItem("wolfden-payments-test-enabled") === "1";
            } catch {
                localToggleEnabled = false;
            }

            setCartEnabled(localToggleEnabled);

            if (!localToggleEnabled) {
                setCartCount(0);
                return;
            }

            const response = await fetch("/api/shop/cart", { cache: "no-store" }).catch(() => null);
            const payload = response ? await response.json().catch(() => null) : null;

            if (!response?.ok || !payload) {
                return;
            }

            setCartCount(Number(payload.itemCount || 0));
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
                {paymentsEnabled && cartEnabled && (
                    <Link href="/cart" className="pill nav-cart" onClick={() => setOpen(false)}>
                        Cart
                        <span className="nav-cart-count">{cartCount}</span>
                    </Link>
                )}
                <a className="pill nav-discord" href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                    Join Discord
                </a>
                <button
                    type="button"
                    className={`pill tv-toggle${tvMode ? " tv-toggle-active" : ""}`}
                    onClick={toggleTvMode}
                    aria-pressed={tvMode}
                    title="Toggle TV mode"
                >
                    TV Mode: {tvMode ? "On" : "Off"}
                </button>
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
