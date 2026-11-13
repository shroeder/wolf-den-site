import "server-only";

import { SITE_URL } from "@/lib/site";

// ── THE RIP EMAIL ────────────────────────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-13, on the pack buyers: "That might be its own template."
//
// It is a different ASK, which is why it could not be a variant of the product email. That one says "here is
// a thing, here is its price, here is the link" to somebody who already buys things like it. This one is
// asking a person who has only ever bought at the counter to try a room in the game they have not opened —
// so the hero is not a product for sale, it is the CHASE: the best card sitting in the pool right now, at
// the size of the screen, with the price of entry under it.
//
// ⚠️ IT PITCHES THE CHEAPEST SENSIBLE TIER, NOT THE BIGGEST ONE. The thing being sold here is a first rip,
// and the bar for that should be as low as their own habit allows. ripPitchFor picks the tier off what they
// actually pay per item.
//
// ⚠️ NO DISCOUNT ANYWHERE IN HERE. The pools carry a target margin that the odds are solved against, so a
// percentage off the entry price is not a discount, it is a silent change to the game's economics.
// [[balance-constants-never-copied]] and [[casino-dont-balance-to-a-number]] both point the same way.
const BG = "#0E0E0E";
const SURFACE = "#161616";
const ELEVATED = "#1F1F1F";
const INK = "#F2F2F2";
const INK2 = "#B8B8B8";
const MUTED = "#7A7A7A";
const GOLD = "#D4AF37";
const LINE = "rgba(255,255,255,0.08)";
const FONTS = "-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif";

const money = (cents) => `$${(cents / 100).toFixed(2)}`;
/** Whole dollars where they are whole — "$287 Umbreon" reads like a person wrote it, "$287.00" does not. */
const round = (cents) => (cents % 100 === 0 ? `$${cents / 100}` : money(cents));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * `{ subject, html, text }` for a pack opener, or null if there is no honest pitch to make.
 */
export function renderRipsEmail({ name = "", pitch, unsubscribeUrl = "" }) {
    if (!pitch?.chase) return null;
    const first = String(name || "").trim().split(/\s+/)[0];
    const greeting = first && first.length <= 14 && !/^\d+$/.test(first) ? `Hi ${esc(first)},` : "Hi,";
    const base = process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;
    const ripsUrl = `${base}/marketplace/rips`;
    const { chase, brand, priceCents, units } = pitch;

    // ⚠️ THE SUBJECT IS THE CARD AND THE PRICE OF A SHOT AT IT, both read from the live pool. Naming the
    // card is what makes this different from every "try our new feature" email ever sent.
    //
    // ⚠️ AND IT SAYS "there's a X in the pack", NOT "the best card is X". Once ripPitchFor rotates the
    // chase across recipients, only one of them is holding the actual top card — "best" would be false for
    // the other seven. "There's a $258 Jirachi in the $15 pack" stays true for every one of them.
    const subject = `${first ? `${first}, there's a ` : "There's a "}${round(chase.cents)} ${esc(chase.name)} in the ${round(priceCents)} pack`;

    const html = `
<div style="margin:0;padding:0;background:${BG};">
<div style="margin:0;padding:22px 10px;background:${BG};font-family:${FONTS};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;margin:0 auto;background:${SURFACE};border-radius:12px;border:1px solid ${LINE};">
    <tr><td style="padding:26px 24px 0;">
      <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:${GOLD};font-weight:800;">Virtual Rips</div>
      <p style="font-size:16px;color:${INK};line-height:1.55;margin:16px 0 0;">${greeting}</p>
      <p style="font-size:16px;color:${INK2};line-height:1.55;margin:8px 0 0;">
        You can rip packs from the shop online now &mdash; same cards, pulled from the real shelf.
      </p>
    </td></tr>

    <tr><td style="padding:20px 24px 0;">
      <a href="${ripsUrl}" style="text-decoration:none;display:block;background:${ELEVATED};border:1px solid ${LINE};border-radius:10px;padding:20px;">
        <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${MUTED};font-weight:700;text-align:center;">In the ${esc(brand)} pool right now</div>
        <img src="${esc(chase.imageUrl)}" width="200" alt="${esc(chase.name)}"
             style="width:100%;max-width:200px;height:auto;display:block;margin:14px auto;border-radius:6px;">
        <div style="font-size:18px;color:${INK};font-weight:700;line-height:1.3;text-align:center;">${esc(chase.name)}</div>
        <div style="font-size:26px;color:${GOLD};font-weight:800;text-align:center;margin-top:8px;">${money(chase.cents)}</div>
        <div style="font-size:13px;color:${MUTED};text-align:center;margin-top:10px;">
          One of ${units.toLocaleString()} cards in the pool &middot; ${money(priceCents)} a pack
        </div>
        <div style="margin-top:18px;text-align:center;">
          <span style="display:inline-block;padding:12px 30px;background:${GOLD};color:#0E0E0E;border-radius:6px;font-weight:800;font-size:15px;">Rip one &rarr;</span>
        </div>
      </a>
    </td></tr>

    <tr><td style="padding:18px 24px 0;">
      <div style="font-size:13px;color:${INK2};line-height:1.6;">
        Pull something you want and we hold it for you at the shop. Don&rsquo;t want it? Sell it straight
        back for credit.
      </div>
    </td></tr>

    <tr><td style="padding:20px 24px 24px;">
      <p style="font-size:12px;color:${MUTED};line-height:1.55;margin:0;border-top:1px solid ${LINE};padding-top:14px;">
        You&rsquo;re getting this because you&rsquo;ve shopped with us.
        <a href="${esc(unsubscribeUrl)}" style="color:${MUTED};">Stop these emails</a> &mdash; your card alerts and order receipts won&rsquo;t change.
      </p>
    </td></tr>
  </table>
</div>
</div>`.trim();

    const text = [
        greeting,
        "",
        "You can rip packs from the shop online now - same cards, pulled from the real shelf.",
        "",
        `In the ${brand} pool right now: ${chase.name} - ${money(chase.cents)}`,
        `One of ${units} cards in the pool. ${money(priceCents)} a pack.`,
        "",
        "Pull something you want and we hold it for you at the shop. Don't want it? Sell it straight back for credit.",
        "",
        ripsUrl,
        "",
        `Stop these emails: ${unsubscribeUrl}`,
    ].join("\n");

    return { subject, html, text };
}
