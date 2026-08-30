"use client";

import { useCallback, useEffect, useState } from "react";

import { disableWebPush, enableWebPush, hasLocalSubscription, isWebPushSupported, pushPermission, registerPushServiceWorker } from "@/lib/web-push-client";
import Coin from "@/components/Coin";

// A single-purpose landing for turning push ON. This is where the recap email's CTA points, so it has exactly
// one job and must work on first tap: the browser only allows requestPermission() inside a real user gesture,
// so there's a big button rather than anything automatic.
//
// It also has to be honest about iOS: Safari cannot do web push from a TAB at all, only from a Home-Screen
// install. Silently doing nothing there (which the site-wide prompt does) leaves iPhone members thinking the
// feature is broken.

const IOS_HELP = "iOS only allows notifications from an app on your Home Screen — not a browser tab.";

function iosNeedsInstall() {
    if (typeof navigator === "undefined" || typeof window === "undefined") return false;
    const ua = navigator.userAgent || "";
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)")?.matches;
    return isIos && !standalone;
}

// ── THE FIVE, DRAWN RATHER THAN TYPED ────────────────────────────────────────────────────────────────────────
// These were emoji, which the Den does not put in its interface: they render differently on every device and
// carry Apple's art direction rather than ours, sitting beside real sprites everywhere else in the game
// looking borrowed. That is the same argument gen-nav-icons.mjs makes at the top of itself.
//
// And the right pictures already exist. Every one of these lines is about a PLACE — the trade screen, the
// plaza, the auction house, the farm, the badge wall — and every one of those places already has a drawn nav
// icon that the member will see again in the menu two seconds later. So the bullet is the destination's own
// icon rather than a new drawing of the same idea: nothing was generated for this, and the card teaches the
// menu while it is asking for permission.
const PERKS = [
    { icon: "trades", text: "Someone sends you a pet or a trade offer" },
    { icon: "town", text: "A raid hits the plaza (they only last minutes)" },
    { icon: "auction", text: "Your auction listing sells" },
    { icon: "farm", text: "Your crops are ready to harvest" },
    { icon: "badges", text: "You earn a badge or level up" },
];

export default function EnableNotificationsClient() {
    const [state, setState] = useState("loading"); // loading | on | off | blocked | ios | unsupported
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);
    // The onboarding "notifications" task already pays gold once and is already idempotent — it's just that
    // members who blew past the first-visit card never saw the offer. Surface it here instead of inventing a
    // second reward.
    const [bounty, setBounty] = useState(null); // { gold } while unclaimed
    const [earned, setEarned] = useState(null);

    const loadBounty = useCallback(async () => {
        const r = await fetch("/api/marketplace/onboarding", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        const t = (d?.tasks || []).find((x) => x.key === "notifications");
        setBounty(t && !t.claimed ? { gold: t.gold } : null);
    }, []);

    useEffect(() => { loadBounty(); }, [loadBounty]);

    // Claim the gold once the browser has actually granted permission.
    const claimBounty = useCallback(async () => {
        const r = await fetch("/api/marketplace/onboarding", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ key: "notifications" }),
        }).then((x) => x.json()).catch(() => null);
        if (r?.ok && r.gold) { setEarned(r.gold); setBounty(null); }
        else setBounty(null);
    }, []);

    const detect = useCallback(async () => {
        if (iosNeedsInstall()) { setState("ios"); return; }
        if (!isWebPushSupported()) { setState("unsupported"); return; }
        if (pushPermission() === "denied") { setState("blocked"); return; }
        await registerPushServiceWorker().catch(() => {});
        const on = await Promise.race([
            hasLocalSubscription().catch(() => false),
            new Promise((res) => setTimeout(() => res(false), 3000)),
        ]);
        setState(on ? "on" : "off");
    }, []);

    useEffect(() => { detect(); }, [detect]);

    async function turnOn() {
        setBusy(true);
        setMsg(null);
        const res = await enableWebPush();
        setBusy(false);
        if (res.ok) {
            setState("on");
            setMsg("You're all set — we'll ping this device from now on.");
            if (bounty) await claimBounty();
            return;
        }
        if (res.reason === "denied") {
            setState("blocked");
            return;
        }
        setMsg("That didn't go through. Try again, or check your browser's site settings.");
    }

    async function turnOff() {
        setBusy(true);
        await disableWebPush();
        setBusy(false);
        setState("off");
        setMsg(null);
    }

    return (
        <div className="enotif">
            <div className="enotif-hero">
                {/* The nav's own bell sprite, not an emoji — it is the icon this page is reached BY, so
                    the hero and the menu entry are the same object. */}
                <div className="enotif-bell" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/nav/notifications.png" alt="" width={64} height={64} />
                </div>
                <h1 className="enotif-title">
                    {state === "on" ? "Notifications are on" : "Get pinged the moment it happens"}
                </h1>
                <p className="enotif-sub">
                    {state === "on"
                        ? "This device is subscribed. You can fine-tune exactly what reaches you below."
                        : "Most of what happens in the Den is time-sensitive. Without notifications you find out days later — or not at all."}
                </p>
            </div>

            {state !== "on" ? (
                <ul className="enotif-perks">
                    {PERKS.map((p) => (
                        <li key={p.text}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/images/nav/${p.icon}.png`} alt="" aria-hidden="true" width={22} height={22} />
                            {p.text}
                        </li>
                    ))}
                </ul>
            ) : null}

            <div className="enotif-action">
                {state === "loading" ? <p className="muted" style={{ margin: 0 }}>Checking this device…</p> : null}

                {state === "off" ? (
                    <>
                        {bounty ? (
                            <p className="enotif-bounty"><Coin /> Turn them on and we&apos;ll drop <strong>{bounty.gold} gold</strong> in your pocket.</p>
                        ) : null}
                        <button type="button" className="btn-gold enotif-cta" onClick={turnOn} disabled={busy}>
                            {/* NO ICON HERE, deliberately. The emoji bell that used to sit in this label is
                                gone with the rest of them, and the obvious swap — the bell sprite, as used by
                                the hero and the menu — is dark bronze on a gold button and all but vanishes.
                                There is a large bell four lines above this; the button only has to say what
                                pressing it does. */}
                            {busy ? "Turning on…" : bounty ? `Turn on · +${bounty.gold} gold` : "Turn on notifications"}
                        </button>
                        <p className="enotif-fine">Your browser will ask you to allow it. One tap, and you can turn any of it off later.</p>
                    </>
                ) : null}

                {earned ? <p className="enotif-earned">+{earned} <Coin /> added to your gold</p> : null}

                {state === "on" ? (
                    <button type="button" className="btn-ghost" onClick={turnOff} disabled={busy}>Turn off on this device</button>
                ) : null}

                {state === "blocked" ? (
                    <div className="enotif-note">
                        <strong>Notifications are blocked for this site.</strong>
                        <p>Your browser is refusing them, so we can&apos;t ask again from here. Open the padlock (or ⋮ → Site settings) next to the address bar, set Notifications to <em>Allow</em>, then reload this page.</p>
                    </div>
                ) : null}

                {state === "ios" ? (
                    <div className="enotif-note">
                        <strong>One extra step on iPhone &amp; iPad</strong>
                        <p>{IOS_HELP} Tap <em>Share</em> → <em>Add to Home Screen</em>, open the Wolf Den from that new icon, then come back here and tap Turn on.</p>
                    </div>
                ) : null}

                {state === "unsupported" ? (
                    <div className="enotif-note">
                        <strong>This browser can&apos;t do notifications.</strong>
                        <p>Try Chrome on Android or desktop. Everything still shows up in-app when you visit.</p>
                    </div>
                ) : null}

                {msg ? <p className="enotif-msg">{msg}</p> : null}
            </div>

            <p className="enotif-links">
                <a href="#notify-settings">Choose how much we send you ↓</a>
            </p>
        </div>
    );
}
