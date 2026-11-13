import "server-only";

import { SITE_URL } from "@/lib/site";

import { reasonFor } from "./profile.js";
import { GAME_LABEL, KIND_LABEL } from "./taxonomy.js";

// ── THE EMAIL ────────────────────────────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-13: "I rhink we just send them products we know they are interested in and ensure we can have
// a direct link to that product online. And just focus on landing that one item we know they want."
//
// So it is built around ONE card. The first draft gave three items equal weight and the preview showed what
// that costs: a booster-pack buyer got a jigsaw puzzle and a cardboard box of 3D prints at the same size as
// the pack, photographed on somebody's kitchen table. Three equal rows is a catalogue, and a catalogue
// invites scrolling past. One card at the width of the screen invites a click.
//
// The other two stay, small, under a quieter heading — they cost almost nothing and they catch the case
// where the hero is wrong.
//
// ⚠️ DARK THEME, ALWAYS. Luke, 2026-11-13: "The email theme is always our dark theme." The values below are
// lifted from :root in globals.css rather than eyeballed, so the email and the site cannot drift apart.
// Mail clients do not support CSS variables, so they are inlined — but inlined FROM one place here rather
// than retyped per rule. [[balance-constants-never-copied]]
const BG = "#0E0E0E";
const SURFACE = "#161616";
const ELEVATED = "#1F1F1F";
const INK = "#F2F2F2";
const INK2 = "#B8B8B8";
const MUTED = "#7A7A7A";
const GOLD = "#D4AF37";
const LINE = "rgba(255,255,255,0.08)";
const FONTS = "-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif";

/** How long an offer in one of these emails stands. */
export const OFFER_DAYS = 14;

const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function priceBlock(item, big = false) {
    const size = big ? 22 : 15;
    if (!item.offer) return `<span style="color:${INK};font-weight:700;font-size:${size}px;">${money(item.priceCents)}</span>`;
    return `<span style="color:${MUTED};text-decoration:line-through;font-size:${size - 4}px;">${money(item.offer.wasCents)}</span>
            <span style="color:${GOLD};font-weight:700;font-size:${size}px;margin-left:7px;">${money(item.offer.nowCents)}</span>
            <span style="display:inline-block;margin-left:7px;padding:2px 7px;background:${GOLD};color:#0E0E0E;border-radius:3px;font-size:11px;font-weight:800;letter-spacing:.04em;">${item.offer.capped ? `${money(item.offer.offCents)} OFF` : `${item.offer.pct}% OFF`}</span>`;
}

function hero(item) {
    return `
    <tr><td style="padding:20px 24px 0;">
      <a href="${esc(item.url)}" style="text-decoration:none;display:block;background:${ELEVATED};border:1px solid ${LINE};border-radius:10px;padding:20px;">
        <img src="${esc(item.image_url)}" width="260" alt="${esc(item.name)}"
             style="width:100%;max-width:260px;height:auto;display:block;margin:0 auto 16px;border-radius:6px;">
        <div style="font-size:19px;color:${INK};font-weight:700;line-height:1.3;text-align:center;">${esc(item.name)}</div>
        <div style="font-size:13px;color:${MUTED};margin-top:4px;text-align:center;">${esc(item.category || "")}</div>
        <div style="margin-top:12px;text-align:center;">${priceBlock(item, true)}</div>
        <div style="margin-top:16px;text-align:center;">
          <span style="display:inline-block;padding:12px 30px;background:${GOLD};color:#0E0E0E;border-radius:6px;font-weight:800;font-size:15px;">See it &rarr;</span>
        </div>
      </a>
    </td></tr>`;
}

function smallRow(item) {
    return `
    <tr>
      <td style="padding:8px 0;vertical-align:middle;width:70px;">
        <a href="${esc(item.url)}"><img src="${esc(item.image_url)}" width="58" height="58" alt="${esc(item.name)}"
             style="width:58px;height:58px;object-fit:contain;border-radius:5px;background:${ELEVATED};display:block;"></a>
      </td>
      <td style="padding:8px 0;vertical-align:middle;">
        <a href="${esc(item.url)}" style="text-decoration:none;">
          <div style="font-size:14px;color:${INK};font-weight:600;line-height:1.35;">${esc(item.name)}</div>
          <div style="font-size:14px;margin-top:4px;">${priceBlock(item)}</div>
        </a>
      </td>
    </tr>`;
}

/**
 * `{ subject, html, text }` for one member, or null if there is nothing to send.
 *
 * `picks` must already have been through the margin rule and the consignment rule — this renders what it is
 * given and does no arithmetic of its own, so there is exactly one place a discount can be decided.
 */
export function renderOutreachEmail({ name = "", profile, picks = [], pattern = null, unsubscribeUrl = "" }) {
    void pattern;   // deliberately unused in the copy — see the note on `intro` below
    if (!picks.length) return null;
    const [lead, ...rest] = picks;
    const first = String(name || "").trim().split(/\s+/)[0];
    const greeting = first && first.length <= 14 && !/^\d+$/.test(first) ? `Hi ${esc(first)},` : "Hi,";
    const base = process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;
    // Singles get the character ("a Mew"); sealed product has none, so it gets its own name with the
    // condition and collector-number tail trimmed off ("a Pitch Black Booster Pack").
    const leadEntity = lead.entities?.character
        || String(lead.name || "").replace(/\s*[-–]?\s*\b(NM|LP|MP|HP|DMG)\b\s*$/i, "").trim().slice(0, 44)
        || null;
    const anyOffer = picks.some((p) => p.offer);

    // ⚠️ THE SUBJECT NAMES THE CARD, NOT THE CATEGORY. "Some Pokémon singles came in" is true of this shop
    // every week of the year and reads as a mailing list. "We got an Umbreon in" is a reason to open it.
    const subject = leadEntity
        ? `${first ? `${first}, w` : "W"}e got ${/^[aeiou]/i.test(leadEntity) ? "an" : "a"} ${leadEntity} in`
        : `${first ? `${first}, s` : "S"}omething ${reasonFor(profile, { GAME_LABEL, KIND_LABEL })} just came in`;

    // ── ⚠️ THE PATTERN NEVER APPEARS IN THE EMAIL ──────────────────────────────────────────────────────
    // Luke, 2026-11-13: "Dont tell them what we know about them."
    //
    // The draft opened with "You've been after Special Illustration Rares and Full Art cards" and that is
    // the line that turns a helpful note into surveillance. The customer did not tell the shop they collect
    // Full Arts — the shop worked it out from their receipts, and saying so out loud invites exactly the
    // question you do not want asked about an email they did not sign up for.
    //
    // `pattern` still does all its work: it chose the card. It is simply never spoken. A well-chosen card
    // demonstrates that you know them, which is the pleasant version of the same fact.
    const intro = "This just came into the shop.";

    const html = `
<div style="margin:0;padding:0;background:${BG};">
<div style="margin:0;padding:22px 10px;background:${BG};font-family:${FONTS};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;margin:0 auto;background:${SURFACE};border-radius:12px;border:1px solid ${LINE};">
    <tr><td style="padding:26px 24px 0;">
      <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:${GOLD};font-weight:800;">The Wolf Den</div>
      <p style="font-size:16px;color:${INK};line-height:1.55;margin:16px 0 0;">${greeting}</p>
      <p style="font-size:16px;color:${INK2};line-height:1.55;margin:8px 0 0;">${intro}</p>
    </td></tr>
    ${hero(lead)}
    ${rest.length ? `
    <tr><td style="padding:22px 24px 0;">
      <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${MUTED};font-weight:700;border-top:1px solid ${LINE};padding-top:16px;">Also in</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rest.map(smallRow).join("")}</table>
    </td></tr>` : ""}
    ${anyOffer ? `
    <tr><td style="padding:18px 24px 0;">
      <div style="background:rgba(212,175,55,0.08);border-left:3px solid ${GOLD};padding:11px 13px;font-size:13px;color:${INK2};line-height:1.5;">
        Show this email at the counter for the price shown. Good for ${OFFER_DAYS} days.
      </div>
    </td></tr>` : ""}
    <tr><td style="padding:20px 24px 24px;">
      <p style="font-size:12px;color:${MUTED};line-height:1.55;margin:0;border-top:1px solid ${LINE};padding-top:14px;">
        You&rsquo;re getting this because you&rsquo;ve shopped with us.
        <a href="${esc(unsubscribeUrl)}" style="color:${MUTED};">Stop these emails</a> &mdash; your card alerts and order receipts won&rsquo;t change.
        &nbsp;&middot;&nbsp; <a href="${base}/shop" style="color:${MUTED};">Browse the shop</a>
      </p>
    </td></tr>
  </table>
</div>
</div>`.trim();

    const text = [
        greeting,
        "",
        "This just came into the shop.",
        "",
        `${lead.name} - ${lead.offer ? `${money(lead.offer.wasCents)} now ${money(lead.offer.nowCents)} (${lead.offer.pct}% off)` : money(lead.priceCents)}`,
        lead.url,
        ...(rest.length ? ["", "Also in:", ...rest.map((p) => `- ${p.name} ${p.offer ? money(p.offer.nowCents) : money(p.priceCents)}  ${p.url}`)] : []),
        "",
        anyOffer ? `Show this email at the counter for the price shown. Good for ${OFFER_DAYS} days.` : "",
        "",
        `Stop these emails: ${unsubscribeUrl}`,
    ].filter(Boolean).join("\n");

    return { subject, html, text };
}
