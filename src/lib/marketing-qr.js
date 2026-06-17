import "server-only";

import QRCode from "qrcode";

import { SITE_URL } from "@/lib/site";

// Discord invite is the same one linked across the public site (about, community, etc.).
const DISCORD_INVITE_URL = "https://discord.gg/Pad8U2KVsD";
// Google "rate us" short link for The Wolf Den's business profile.
const GOOGLE_REVIEW_URL = "https://g.page/r/CXExyovUzqNTEBM/review";

function siteUrl(pathname) {
    return new URL(pathname, SITE_URL).toString();
}

// Order here is the order the sidebar cycles through.
export const MARKETING_LINKS = [
    {
        key: "discord",
        title: "Join our Discord",
        caption: "Deals, drops & event chat",
        url: DISCORD_INVITE_URL,
    },
    {
        key: "shop",
        title: "Shop online",
        caption: "Singles, sealed & supplies",
        url: siteUrl("/shop"),
    },
    {
        key: "mystery",
        title: "Mystery packs",
        caption: "Grab your own bag to rip",
        url: siteUrl("/mystery-bags"),
    },
    {
        key: "google",
        title: "Rate us on Google",
        caption: "Leave a quick review",
        url: GOOGLE_REVIEW_URL,
    },
    {
        key: "looking-for",
        title: "Looking for a card?",
        caption: "Add it to your want list",
        url: siteUrl("/looking-for"),
    },
];

const QR_OPTIONS = {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: {
        dark: "#10100c",
        light: "#ffffff",
    },
};

// The marketing links are static, so generate the SVGs once and reuse the
// resolved promise across requests.
let cachedQrCodes = null;

export function getMarketingQrCodes() {
    if (!cachedQrCodes) {
        cachedQrCodes = Promise.all(
            MARKETING_LINKS.map(async (link) => ({
                ...link,
                svg: await QRCode.toString(link.url, QR_OPTIONS),
            }))
        ).catch((error) => {
            // Don't cache a failed generation so the next request can retry.
            cachedQrCodes = null;
            throw error;
        });
    }

    return cachedQrCodes;
}
