import QRCode from "qrcode";

import CounterWheel from "@/components/CounterWheel";
import { SPEND_XP_PER_DOLLAR } from "@/lib/marketplace/xp.js";
import { SITE_URL } from "@/lib/site";

// Node, because SPEND_XP_PER_DOLLAR comes from xp.js and that module is `server-only`. There is deliberately
// NO force-dynamic any more: with the till poll gone this page has no per-request data left, so it prerenders
// once at build and costs nothing to serve — the cheapest thing on the site, which is the right shape for a
// screen that is open twelve hours a day.
export const runtime = "nodejs";
export const metadata = {
    title: "Wolf Den — counter",
    robots: { index: false, follow: false },
};

// ── THE SCREEN THAT FACES THE CUSTOMER ───────────────────────────────────────────────────────────────────────
// Luke: "all we needed was a wheel that spins and hands out a qr code that just links to the create account
// page. no complex keys or handing out claims."
//
// So that is all this is. Park a browser on /counter, full screen, and leave it. Anybody can spin the wheel,
// it names the discount it landed on, and the QR beside it opens the sign-up form. There is no key to type, no
// polling, no database, and nothing on this page that can be got wrong by a machine left on overnight.
//
// ── WHAT WAS HERE BEFORE, SO NOBODY REBUILDS IT BY ACCIDENT ──────────────────────────────────────────────────
// This screen used to also watch the till: it polled /api/pos/display every four seconds for the newest
// unredeemed loyalty claim and, when a sale landed, replaced everything with that customer's points and a QR
// to bank them. That endpoint handed out live bearer tokens, which is the only reason POS_DISPLAY_KEY ever
// existed — the key was never about who could look at the screen.
//
// All of it is deleted: the endpoint, the key check, pos-display.js and the switching component. THE LOYALTY
// CLAIM FEATURE ITSELF IS UNTOUCHED — claims are still minted and still redeemed at /marketplace/claim/<token>
// (see loyalty-claim.js and the admin route). What is gone is this screen's ability to display one, and with
// it the "you just earned N points" moment at the till. That was the original argument for having a counter
// screen at all, so if it is ever wanted back, it comes back as its own thing rather than as a mode of the
// wheel.
//
// ── THE QR IS TAGGED, AND IT IS THE ONLY TAGGED LINK WE HAVE ─────────────────────────────────────────────────
// Every scan in the Den's history has been indistinguishable from somebody typing the URL: 3,055 of 3,722
// visitors are `direct`. mkt_visitor already stores utm_source/medium/campaign and back-fills buyer_id the
// moment that visitor signs in, so tagging this one link makes the screen measurable — how many people
// scanned it, and how many became members — with no new schema and nothing for the shop to operate.
//
// `signup=1` opens the CREATE form rather than the sign-in form, because somebody scanning a code off a shop
// counter does not have an account yet, and `returnTo` lands the new account on the member's daily spin: they
// just watched a wheel, so the wheel is where the account should start.
const SIGNUP_URL = `${SITE_URL}/marketplace/login?signup=1&returnTo=${encodeURIComponent("/marketplace/spin")}`
    + `&utm_source=pos&utm_medium=qr&utm_campaign=counter-screen`;

export default async function CounterPage() {
    // The one thing this page computes. The offers are a plain module the client imports for itself
    // (counter-discounts.js), so the whole screen is a QR encode and no database at all.
    const signupQr = await QRCode.toDataURL(SIGNUP_URL, {
        width: 720, margin: 1, errorCorrectionLevel: "M",
        color: { dark: "#101014", light: "#ffffff" },
    }).catch(() => null);

    return <CounterWheel signupQr={signupQr} pointsRate={SPEND_XP_PER_DOLLAR} />;
}
