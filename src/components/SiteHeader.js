"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const navItems = [
    { href: "/shop", label: "Shop" },
    { href: "/events", label: "Events" },
    { href: "/sell-cards", label: "Sell Your Cards" },
    { href: "/new-players", label: "New Players" },
    { href: "/community", label: "Community" },
    { href: "/faq", label: "FAQ" },
    { href: "/contact", label: "Contact" },
];

export default function SiteHeader() {
    const [open, setOpen] = useState(false);

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
                        priority
                    />
                    <span>The Wolf Den</span>
                </Link>
                <a className="pill nav-discord" href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                    Join Discord
                </a>
                <button
                    className="hamburger"
                    aria-label={open ? "Close menu" : "Open menu"}
                    aria-expanded={open}
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
