import "server-only";

import { Resend } from "resend";

import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

// Buyer -> vendor contact email. Reply-To is the buyer, so the vendor just hits reply and the two
// of them take it off-platform (no on-platform messaging in v1).

const FROM_ADDRESS = "The Wolf Den Marketplace <portal@wolfdengamingmn.com>";

const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

function getResendClient() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        throw new Error("Missing RESEND_API_KEY environment variable.");
    }

    return new Resend(apiKey);
}

function baseUrl() {
    return process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;
}

function formatPrice(value) {
    return value === null || value === undefined ? "" : currency.format(Number(value));
}

// Notify the marketplace admin that a new vendor applied. Recipient is resolved by the caller
// (MARKETPLACE_ADMIN_EMAIL env, else the store owner's email). Best-effort: returns false (no throw)
// if there's no recipient, so it never blocks the public submission.
// Broadcast a one-off announcement email to every member who has an email. Personalizes the greeting, sends
// best-effort in batches (Resend allows 100/call). Returns { total, sent }. Reusable for any announcement.
export async function broadcastAnnouncementEmail({ subject, heading, emoji = "📣", bodyHtml = "", ctaLabel = "", ctaUrl = "" }) {
    if (!process.env.RESEND_API_KEY) return { total: 0, sent: 0, skipped: "no_api_key" };
    const rows = await db
        .query(
            `SELECT email, COALESCE(NULLIF(first_name,''), NULLIF(display_name,''), NULLIF(alias,'')) AS name
               FROM mkt_buyer WHERE email IS NOT NULL AND email <> '' AND alias IS NOT NULL
                 AND COALESCE((notify_prefs ->> 'email:announce')::boolean, TRUE) IS NOT FALSE`
        )
        .catch(() => []);
    if (!rows.length) return { total: 0, sent: 0 };
    const resend = getResendClient();
    const url = ctaUrl ? new URL(ctaUrl, baseUrl()).toString() : baseUrl();
    const wrap = (name) => `
        <div style="max-width:520px;margin:0 auto;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#26221c;">
          <div style="background:linear-gradient(180deg,#2f8f52,#215f39);border-radius:16px 16px 0 0;padding:30px 24px;text-align:center;">
            <div style="font-size:52px;line-height:1;">${emoji}</div>
            <h1 style="margin:12px 0 0;color:#ffffff;font-size:24px;">${heading}</h1>
          </div>
          <div style="background:#fbf8f2;border:1px solid #e6ddcb;border-top:none;border-radius:0 0 16px 16px;padding:24px;">
            <p style="margin:0 0 12px;">${name ? `Hey ${name},` : "Hey there,"}</p>
            <div style="line-height:1.6;font-size:15px;">${bodyHtml}</div>
            ${ctaLabel ? `<div style="text-align:center;margin:22px 0 6px;"><a href="${url}" style="display:inline-block;background:#2f8f52;color:#ffffff;padding:13px 26px;border-radius:10px;font-weight:800;text-decoration:none;font-size:15px;">${ctaLabel}</a></div>` : ""}
            <p style="color:#8a8172;font-size:12px;margin-top:24px;border-top:1px solid #e6ddcb;padding-top:14px;">You're receiving this because you have a Wolf Den account. See you at the shop!</p>
          </div>
        </div>`;
    let sent = 0;
    for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100).map((r) => ({ from: FROM_ADDRESS, to: r.email, subject, html: wrap(r.name || "") }));
        try {
            await resend.batch.send(chunk);
            sent += chunk.length;
        } catch {
            /* best-effort — a failed batch doesn't stop the rest */
        }
    }
    return { total: rows.length, sent };
}

// The win-back recap for members push can't reach. Deliberately short: what's waiting for them, a few lines of
// Den news, then ONE primary CTA that turns on instant alerts — the goal is to convert them to push so they
// stop needing this email. Ends with a plain, obvious way to stop these specific emails; burying that is how
// you earn a spam complaint instead of an unsubscribe.
export async function sendRecapDigestEmail(email, { name = "", hooks = [], news = [], awayDays = null } = {}) {
    if (!process.env.RESEND_API_KEY) return false;
    if (!email) return false;
    const resend = getResendClient();
    const site = baseUrl();
    const settingsUrl = `${site}/marketplace/profile`;

    const li = (rows) => rows
        .map((r) => `<tr><td style="padding:7px 0;vertical-align:top;width:30px;font-size:19px;">${r.icon}</td><td style="padding:7px 0;line-height:1.5;font-size:15px;">${r.text}</td></tr>`)
        .join("");

    // The headline promises only what we can actually deliver — a vague "you missed a lot!" is what makes
    // people unsubscribe. If something is genuinely waiting, lead with that instead.
    const hasHooks = hooks.length > 0;
    const heading = hasHooks ? "Something's waiting for you" : "Here's what you missed";
    const sub = awayDays ? `It's been about ${awayDays} day${awayDays === 1 ? "" : "s"}.` : "";

    const html = `
        <div style="max-width:520px;margin:0 auto;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#26221c;">
          <div style="background:linear-gradient(180deg,#2f8f52,#215f39);border-radius:16px 16px 0 0;padding:28px 24px;text-align:center;">
            <div style="font-size:46px;line-height:1;">🐺</div>
            <h1 style="margin:10px 0 0;color:#ffffff;font-size:22px;">${heading}</h1>
            ${sub ? `<p style="margin:6px 0 0;color:#cfe9d8;font-size:13px;">${sub}</p>` : ""}
          </div>
          <div style="background:#fbf8f2;border:1px solid #e6ddcb;border-top:none;border-radius:0 0 16px 16px;padding:22px 24px;">
            <p style="margin:0 0 14px;">${name ? `Hey ${name},` : "Hey there,"}</p>
            ${hasHooks ? `<table style="width:100%;border-collapse:collapse;margin:0 0 6px;">${li(hooks)}</table>` : ""}
            ${hasHooks && news.length ? `<p style="margin:16px 0 4px;font-size:12px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:#8a8172;">Around the Den</p>` : ""}
            ${news.length ? `<table style="width:100%;border-collapse:collapse;">${li(news)}</table>` : ""}
            <div style="text-align:center;margin:24px 0 8px;">
              <a href="${site}/marketplace" style="display:inline-block;background:#2f8f52;color:#ffffff;padding:13px 26px;border-radius:10px;font-weight:800;text-decoration:none;font-size:15px;">Jump back in</a>
            </div>
            <p style="text-align:center;margin:14px 0 0;font-size:13px;color:#5f594e;line-height:1.5;">
              Want the good stuff the moment it happens instead of a summary?<br />
              <a href="${settingsUrl}" style="color:#2f8f52;font-weight:700;">Turn on instant alerts</a>
            </p>
            <p style="color:#8a8172;font-size:12px;margin-top:22px;border-top:1px solid #e6ddcb;padding-top:14px;line-height:1.5;">
              You're getting this because notifications are off, so we only send it occasionally — at most once every couple of weeks, and never when you've been active.
              <a href="${settingsUrl}" style="color:#8a8172;text-decoration:underline;">Stop these recap emails</a>.
            </p>
          </div>
        </div>`;

    try {
        await resend.emails.send({
            from: FROM_ADDRESS,
            to: email,
            subject: hasHooks ? "Something's waiting for you at The Wolf Den" : "What you missed at The Wolf Den",
            html,
            headers: { "List-Unsubscribe": `<${settingsUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        });
        return true;
    } catch {
        return false;
    }
}

export async function sendVerificationEmail(email, code) {
    const resend = getResendClient();
    await resend.emails.send({
        from: FROM_ADDRESS,
        to: email,
        subject: `Your Wolf Den Marketplace code: ${code}`,
        html: `
            <p>Welcome to the Wolf Den Marketplace!</p>
            <p>Enter this code in the app to verify your email:</p>
            <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p>
            <p>This code expires in 30 minutes. If you didn't create an account, you can ignore this email.</p>
        `,
    });
}

// Notify a member (by email) that they got a DM while away. Best-effort. Rate-limited by the caller
// (only the first unread message in a thread triggers this).
export async function sendDmNotificationEmail(email, { senderName = "Someone", preview = "", name = "" } = {}) {
    if (!email || !process.env.RESEND_API_KEY) return false;
    const resend = getResendClient();
    const hi = name ? `Hey ${name},` : "Hey,";
    const inboxUrl = `${baseUrl()}/marketplace/inbox`;
    const snippet = preview?.trim() ? `“${preview.trim().slice(0, 160)}”` : "";
    await resend.emails.send({
        from: "The Wolf Den <portal@wolfdengamingmn.com>",
        to: email,
        subject: `${senderName} sent you a message`,
        html: `
            <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;">
                <p>${hi}</p>
                <p><strong>${senderName}</strong> sent you a message on The Wolf Den.</p>
                ${snippet ? `<p style="color:#555;border-left:3px solid #d4af37;padding-left:12px;">${snippet}</p>` : ""}
                <p><a href="${inboxUrl}" style="display:inline-block;padding:10px 18px;background:#d4af37;color:#171008;text-decoration:none;border-radius:999px;font-weight:700;">Read &amp; reply →</a></p>
                <p style="color:#888;font-size:12px;">Manage these emails in your profile notification settings.</p>
            </div>
        `,
    });
    return true;
}

// Nudge a vendor (by email) to list their items — sent by an admin from the marketplace admin app. Best-effort.
export async function sendVendorListingNudgeEmail(email, { name = "", listingCount = 0, note = "" } = {}) {
    if (!email || !process.env.RESEND_API_KEY) return false;
    const resend = getResendClient();
    const hi = name ? `Hey ${name},` : "Hey,";
    const portalUrl = `${baseUrl()}/marketplace/vendor`;
    const headline = listingCount > 0
        ? `You've got ${listingCount} listing${listingCount === 1 ? "" : "s"} up — buyers are browsing, and more listings mean more sales.`
        : `Buyers are browsing the marketplace right now — but you don't have any items listed yet.`;
    await resend.emails.send({
        from: "The Wolf Den <portal@wolfdengamingmn.com>",
        to: email,
        subject: "Got cards to sell? List them on The Wolf Den marketplace",
        html: `
            <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;">
                <p>${hi}</p>
                <p>${headline}</p>
                ${note ? `<p style="color:#555;border-left:3px solid #d4af37;padding-left:12px;">${note.replace(/</g, "&lt;")}</p>` : ""}
                <p>Listing takes a minute — scan a barcode or search the catalog, set your price, and you're live in front of every buyer in the pack. 🐺</p>
                <p><a href="${portalUrl}" style="display:inline-block;padding:10px 18px;background:#d4af37;color:#171008;text-decoration:none;border-radius:999px;font-weight:700;">List your items →</a></p>
                <p style="color:#888;font-size:12px;">Sent by The Wolf Den. Reply to this email if you need a hand getting set up.</p>
            </div>
        `,
    });
    return true;
}

// Notify a member (by email) of a friend request while away. Best-effort.
export async function sendFriendRequestEmail(email, { requesterName = "Someone", name = "" } = {}) {
    if (!email || !process.env.RESEND_API_KEY) return false;
    const resend = getResendClient();
    const hi = name ? `Hey ${name},` : "Hey,";
    const friendsUrl = `${baseUrl()}/marketplace/friends`;
    await resend.emails.send({
        from: "The Wolf Den <portal@wolfdengamingmn.com>",
        to: email,
        subject: `${requesterName} wants to be your friend`,
        html: `
            <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;">
                <p>${hi}</p>
                <p><strong>${requesterName}</strong> sent you a friend request on The Wolf Den. 🐺</p>
                <p><a href="${friendsUrl}" style="display:inline-block;padding:10px 18px;background:#d4af37;color:#171008;text-decoration:none;border-radius:999px;font-weight:700;">View request →</a></p>
                <p style="color:#888;font-size:12px;">Manage these emails in your profile notification settings.</p>
            </div>
        `,
    });
    return true;
}

// Congratulate a member on a badge an admin awarded them by hand. Best-effort: returns false (no throw)
// when there's no recipient or no API key, so it never blocks the grant.
export async function sendBadgeAwardedEmail(email, { label, icon = "", description = "", name = "" } = {}) {
    if (!email || !label) return false;
    if (!process.env.RESEND_API_KEY) return false;
    const resend = getResendClient();
    const hi = name ? `Hey ${name},` : "Hey there,";
    const profileUrl = `${baseUrl()}/marketplace/profile`;
    await resend.emails.send({
        from: "The Wolf Den <portal@wolfdengamingmn.com>",
        to: email,
        subject: `You earned the ${label} badge! ${icon}`.trim(),
        html: `
            <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;">
                <p>${hi}</p>
                <p>The Wolf Den just awarded you a badge:</p>
                <div style="text-align:center;padding:22px;margin:14px 0;border:1px solid #e6c76b;border-radius:14px;background:#fff8e6;">
                    <div style="font-size:44px;line-height:1;">${icon || "🏅"}</div>
                    <div style="font-size:20px;font-weight:800;margin-top:8px;">${label}</div>
                    ${description ? `<div style="color:#555;margin-top:6px;">${description}</div>` : ""}
                </div>
                <p>It's now on your profile for everyone to see. Thanks for being part of the pack! 🐺</p>
                <p><a href="${profileUrl}" style="display:inline-block;padding:10px 18px;background:#d4af37;color:#171008;text-decoration:none;border-radius:999px;font-weight:700;">See it on your profile →</a></p>
            </div>
        `,
    });
    return true;
}

// One-time announcement to every member: the Sailing feature has launched.
export async function sendSailingLaunchEmail(email, { name = "" } = {}) {
    if (!email) return false;
    if (!process.env.RESEND_API_KEY) return false;
    const resend = getResendClient();
    const hi = name ? `Hey ${name},` : "Hey there,";
    const url = `${baseUrl()}/marketplace/sailing`;
    await resend.emails.send({
        from: "The Wolf Den <portal@wolfdengamingmn.com>",
        to: email,
        subject: "⛵ A new adventure: Sailing has launched in The Wolf Den",
        html: `
            <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#171008;">
                <p>${hi}</p>
                <div style="text-align:center;padding:26px 18px;margin:14px 0;border:1px solid #7cc4ff;border-radius:16px;background:linear-gradient(160deg,#0d2c4d,#0a1420);color:#eaf2ff;">
                    <div style="font-size:48px;line-height:1;">⛵</div>
                    <div style="font-size:22px;font-weight:800;margin-top:10px;">Sailing has launched!</div>
                    <div style="color:#b9c6d6;margin-top:8px;">A whole new adventure in the game.</div>
                </div>
                <p>Dispatch your boat on <b>voyages</b> to mysterious islands, <b>dig up</b> buried treasure fragments, and <b>forge</b> them into loot chests. Meet the <b>Gold Merchant</b>, greet passing sailors, and <b>raid other members' ships</b> in full-screen ship-to-ship battles.</p>
                <p>Upgrade your hull across <b>11 boat tiers</b>, chase new gear, pets, and hard-earned badges — it all ties into the systems you already play.</p>
                <p style="text-align:center;margin-top:20px;"><a href="${url}" style="display:inline-block;padding:12px 22px;background:#45b6ff;color:#02121f;text-decoration:none;border-radius:999px;font-weight:800;">Set sail →</a></p>
                <p style="color:#777;font-size:13px;margin-top:20px;">See you on the water. 🐺</p>
            </div>
        `,
    });
    return true;
}

// Sent to every member when the weekly boss is slain. Winners get the "come claim your prize" version.
export async function sendBossDefeatedEmail(email, { bossId = "", bossName, winnerLabel = "", prizeName = "", prizeImageUrl = "", isWinner = false, name = "" } = {}) {
    if (!email) return false;
    if (!process.env.RESEND_API_KEY) return false;
    const resend = getResendClient();
    const hi = name ? `Hey ${name},` : "Hey there,";
    // Link to the final RECAP for this specific boss (the live boss page has already rotated to the next one).
    const bossUrl = bossId ? `${baseUrl()}/marketplace/boss/recap/${bossId}` : `${baseUrl()}/marketplace/boss`;
    // Physical-prize terms — shown to the winner so expectations are clear (no shipping, held 1 week).
    const prizeDisclaimer = prizeName
        ? `<p style="font-size:12px;line-height:1.5;color:#8a8a8a;border-top:1px solid #eee;margin-top:16px;padding-top:12px;">
               <strong>Prize terms:</strong> this is a <strong>physical, in-store prize only</strong> — it has no cash value and cannot be shipped.
               We'll hold it at the counter for you for <strong>1 week (7 days)</strong> from today; if it isn't picked up by then, the prize is forfeited.
               Bring your account so we can verify the win. 🐺</p>`
        : "";
    const prizeBlock = prizeName
        ? `<div style="text-align:center;padding:18px;margin:14px 0;border:1px solid #e6c76b;border-radius:14px;background:#fff8e6;">
               ${prizeImageUrl ? `<img src="${prizeImageUrl}" alt="${prizeName}" style="max-width:120px;max-height:120px;object-fit:contain;" />` : ""}
               <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#b8860b;font-weight:800;margin-top:6px;">Raffle prize</div>
               <div style="font-size:18px;font-weight:800;">${prizeName}</div>
           </div>`
        : "";
    await resend.emails.send({
        from: "The Wolf Den <portal@wolfdengamingmn.com>",
        to: email,
        subject: isWinner ? `🏆 You won the ${bossName} raffle!` : `☠️ ${bossName} has been slain!`,
        html: `
            <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;">
                <p>${hi}</p>
                ${isWinner
                    ? `<p><strong>Congratulations — you won the raffle!</strong> The pack took down <strong>${bossName}</strong> and your ticket was drawn.</p>${prizeBlock}<p>Come by The Wolf Den to claim your prize. 🐺</p>${prizeDisclaimer}`
                    : `<p>The whole pack just brought down <strong>${bossName}</strong>! ${winnerLabel ? `The raffle winner is <strong>${winnerLabel}</strong>.` : ""}</p>${prizeBlock}<p>Thanks for fighting — everyone who took part earned XP.</p>`}
                <p><a href="${bossUrl}" style="display:inline-block;padding:10px 18px;background:#d4af37;color:#171008;text-decoration:none;border-radius:999px;font-weight:700;">See the final battle stats →</a></p>
            </div>
        `,
    });
    return true;
}

export async function sendNewApplicationEmail(application, toEmail) {
    if (!toEmail) {
        return false;
    }

    const adminEmail = toEmail;
    const resend = getResendClient();
    const adminUrl = new URL("/marketplace/admin", baseUrl()).toString();

    await resend.emails.send({
        from: FROM_ADDRESS,
        to: adminEmail,
        replyTo: application.email,
        subject: `New vendor application: ${application.businessName}`,
        html: `
            <h1>New vendor application</h1>
            <p><strong>${escapeHtml(application.businessName)}</strong> applied to the marketplace.</p>
            <ul>
                <li>Contact: ${escapeHtml(application.contactName || "—")} (${escapeHtml(application.email)})</li>
                <li>Phone: ${escapeHtml(application.phone || "—")}</li>
                <li>Location: ${escapeHtml(application.locationLabel || application.region || "—")}</li>
                <li>Sells: ${escapeHtml(application.sells || "—")}</li>
                <li>Links: ${escapeHtml(application.links || "—")}</li>
            </ul>
            ${application.notes ? `<p style="white-space:pre-wrap;">${escapeHtml(application.notes)}</p>` : ""}
            <p><a href="${adminUrl}">Review in the admin portal →</a></p>
        `,
    });

    return true;
}

// Email an approved vendor their single-use invite link to set a password + finish onboarding.
export async function sendVendorInviteEmail({ vendor, businessName, inviteToken }) {
    const resend = getResendClient();
    const acceptUrl = new URL("/marketplace/onboard", baseUrl());
    acceptUrl.searchParams.set("token", inviteToken);

    const goldButton =
        "display:inline-block;padding:12px 24px;background:#D4AF37;color:#0E0E0E;text-decoration:none;border-radius:6px;font-weight:bold;";

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: vendor.email,
        subject: "You're approved for the Wolf Den Marketplace",
        html: `
            <h1>Welcome to the Wolf Den Marketplace</h1>
            <p>${escapeHtml(businessName || vendor.displayName)} has been approved. Set your password and finish setting up your storefront to start listing inventory.</p>
            <p><a href="${acceptUrl.toString()}" style="${goldButton}">Finish setting up your account</a></p>
            <p>This link is single-use and expires in 14 days.</p>
            <hr />
            <p><small>The Wolf Den Marketplace</small></p>
        `,
    });

    if (result?.error) {
        throw new Error(result.error.message || "Failed to send invite email.");
    }

    return result;
}

// Tell a buyer that a product on their "notify me" list was just listed by a vendor.
export async function sendWantAvailableEmail(email, product) {
    const resend = getResendClient();
    const url = new URL(`/marketplace/product/${product.catalogProductId}`, baseUrl()).toString();
    const goldButton =
        "display:inline-block;padding:12px 24px;background:#D4AF37;color:#0E0E0E;text-decoration:none;border-radius:6px;font-weight:bold;";

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: email,
        subject: `Now available: ${product.name}`,
        html: `
            <h1>A vendor just listed what you were looking for</h1>
            <p><strong>${escapeHtml(product.name)}</strong>${product.setName ? ` — ${escapeHtml(product.setName)}` : ""}${product.number ? ` (#${escapeHtml(product.number)})` : ""} is now on the Wolf Den Marketplace.</p>
            <p><a href="${url}" style="${goldButton}">See vendor offers</a></p>
            <p>Get in early — vendor stock moves fast.</p>
            <hr />
            <p><small>The Wolf Den Marketplace</small></p>
        `,
    });

    if (result?.error) {
        throw new Error(result.error.message || "Failed to send want-available email.");
    }

    return result;
}

// A vendor responds to a buyer's buy order ("I can fill this"). Emails the buyer; replies route
// straight back to the vendor so they can arrange the deal.
export async function sendBuyOrderResponseEmail(buyerEmail, { vendor, product, message = null, price = null }) {
    const resend = getResendClient();
    const priceLine = price != null ? `<p><strong>Their price:</strong> $${Number(price).toFixed(2)}</p>` : "";
    const msgLine = message
        ? `<p><strong>${escapeHtml(vendor.displayName)} says:</strong><br/>${escapeHtml(message)}</p>`
        : "";

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: buyerEmail,
        replyTo: vendor.email || undefined,
        subject: `A vendor can fill your buy order: ${product.name}`,
        html: `
            <h1>Good news — a vendor has what you're looking for</h1>
            <p><strong>${escapeHtml(vendor.displayName)}</strong> can fill your buy order for <strong>${escapeHtml(product.name)}</strong>${product.setName ? ` — ${escapeHtml(product.setName)}` : ""}.</p>
            ${priceLine}
            ${msgLine}
            <p>Just reply to this email to reach ${escapeHtml(vendor.displayName)} directly and arrange the deal.</p>
            <hr />
            <p><small>The Wolf Den Marketplace</small></p>
        `,
    });

    if (result?.error) {
        throw new Error(result.error.message || "Failed to send buy-order response email.");
    }

    return result;
}

// "You have a new message" nudge back into the app/portal. The conversation lives in-platform — this
// is only a ping, so it never contains reply-to routing to the other party's raw email.
export async function sendNewMessageEmail(toEmail, { fromName, preview, openUrl }) {
    const resend = getResendClient();
    const goldButton = "display:inline-block;padding:12px 24px;background:#D4AF37;color:#0E0E0E;text-decoration:none;border-radius:6px;font-weight:bold;";
    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: toEmail,
        subject: `New message from ${fromName}`,
        html: `
            <h1>You have a new message</h1>
            <p><strong>${escapeHtml(fromName)}</strong> messaged you on the Wolf Den Marketplace:</p>
            <blockquote style="border-left:3px solid #D4AF37;padding-left:12px;color:#555;">${escapeHtml(preview || "")}</blockquote>
            <p><a href="${openUrl}" style="${goldButton}">Open the conversation</a></p>
            <p style="color:#777;font-size:13px;margin-top:6px;">📱 Opens right in the <strong>Wolf Den Market</strong> app if you have it installed — otherwise on the web.</p>
            <hr />
            <p><small>Reply from the app or web (not by replying to this email) so the conversation stays in one place.</small></p>
        `,
    });
    if (result?.error) {
        throw new Error(result.error.message || "Failed to send new-message email.");
    }
    return result;
}

// Weekly vendor-only digest of Vendor Missions (network opportunities). Private per-vendor — never
// sent to buyers.
export async function sendVendorMissionsEmail({ vendor, demandGaps = [], uniques = [] }) {
    const resend = getResendClient();
    const portalUrl = new URL("/marketplace/portal", baseUrl()).toString();
    const goldButton =
        "display:inline-block;padding:12px 24px;background:#D4AF37;color:#0E0E0E;text-decoration:none;border-radius:6px;font-weight:bold;";

    const gapItems = demandGaps
        .slice(0, 8)
        .map(
            (m) =>
                `<li><strong>${escapeHtml(m.name)}</strong>${m.setName ? ` — ${escapeHtml(m.setName)}` : ""} · ` +
                `${m.wantCount} buyer${m.wantCount === 1 ? "" : "s"} want it · ` +
                `${m.sellerCount === 0 ? "nobody stocks it yet" : `${m.sellerCount} seller${m.sellerCount === 1 ? "" : "s"} carry it`}</li>`
        )
        .join("");
    const uniqueItems = uniques
        .slice(0, 5)
        .map(
            (m) =>
                `<li><strong>${escapeHtml(m.name)}</strong>${m.setName ? ` — ${escapeHtml(m.setName)}` : ""}` +
                `${m.wantCount > 0 ? ` · ${m.wantCount} want it` : ""}</li>`
        )
        .join("");

    const sections = [];
    if (gapItems) sections.push(`<h2>Buyers want these — you don't list them</h2><ul>${gapItems}</ul>`);
    if (uniqueItems) sections.push(`<h2>You're the only seller in the network</h2><ul>${uniqueItems}</ul>`);

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: vendor.email,
        subject: "Your Wolf Den Marketplace missions",
        html: `
            <h1>Opportunities from the network</h1>
            <p>Hi ${escapeHtml(vendor.displayName)} — here's what buyers are after and where you stand out this week.</p>
            ${sections.join("")}
            <p><a href="${portalUrl}" style="${goldButton}">Open your portal</a></p>
            <hr />
            <p><small>The Wolf Den Marketplace · sent to you as an active vendor.</small></p>
        `,
    });

    if (result?.error) {
        throw new Error(result.error.message || "Failed to send missions email.");
    }

    return result;
}

export async function sendVendorContactEmail({ vendor, listing, buyerName, buyerEmail, message }) {
    const resend = getResendClient();

    const productUrl = listing?.catalogProductId
        ? new URL(`/marketplace/product/${listing.catalogProductId}`, baseUrl()).toString()
        : null;

    const safeName = buyerName ? String(buyerName).trim() : "A buyer";
    const priceLine = listing?.price !== undefined && listing?.price !== null
        ? ` (listed at ${formatPrice(listing.price)})`
        : "";

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: vendor.email,
        replyTo: buyerEmail,
        subject: `Marketplace inquiry: ${listing?.title || "your listing"}`,
        html: `
            <h1>You have a buyer inquiry</h1>
            <p><strong>${safeName}</strong> is interested in <strong>${listing?.title || "one of your listings"}</strong>${priceLine}.</p>
            ${message ? `<p style="white-space:pre-wrap;border-left:3px solid #D4AF37;padding-left:12px;color:#333;">${escapeHtml(message)}</p>` : ""}
            <p>Reply directly to this email to reach them at <a href="mailto:${buyerEmail}">${buyerEmail}</a>.</p>
            ${productUrl ? `<p><a href="${productUrl}">View the listing</a></p>` : ""}
            <hr />
            <p><small>The Wolf Den Marketplace</small></p>
        `,
    });

    if (result?.error) {
        throw new Error(result.error.message || "Failed to send contact email.");
    }

    return result;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// --- Dealer-to-dealer offer emails (identified relay: recipient can reply straight to the other dealer) ---

async function loadOfferContext(offerId) {
    return db.queryOne(
        `SELECT o.kind, o.amount, o.quantity, o.note,
                l.title AS listing_title,
                vf.id AS from_id, vf.display_name AS from_name, vf.email AS from_email,
                vt.id AS to_id, vt.display_name AS to_name, vt.email AS to_email
         FROM mkt_dealer_offer o
         JOIN mkt_listing l ON l.id = o.listing_id
         JOIN mkt_vendor vf ON vf.id = o.from_vendor_id
         JOIN mkt_vendor vt ON vt.id = o.to_vendor_id
         WHERE o.id = $1`,
        [offerId]
    );
}

export async function sendDealerOfferEmail(offerId) {
    const o = await loadOfferContext(offerId);
    if (!o) return null;
    const resend = getResendClient();
    const portalUrl = new URL("/marketplace/portal", baseUrl()).toString();
    const storefrontUrl = new URL(`/marketplace/vendor/${o.from_id}`, baseUrl()).toString();
    const terms = o.kind === "trade" ? "proposes a trade for" : "wants to buy";
    const amountLine = o.amount != null ? ` — ${currency.format(Number(o.amount))}` : "";
    const qtyLine = o.quantity > 1 ? ` (qty ${o.quantity})` : "";

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: o.to_email,
        replyTo: o.from_email,
        subject: `Dealer offer on ${o.listing_title}`,
        html: `
            <h1>Another dealer made you an offer</h1>
            <p><strong>${escapeHtml(o.from_name)}</strong> ${terms} your <strong>${escapeHtml(o.listing_title)}</strong>${amountLine}${qtyLine}.</p>
            ${o.note ? `<p>They said: &ldquo;${escapeHtml(o.note)}&rdquo;</p>` : ""}
            <p><strong>Just reply to this email</strong> to talk to ${escapeHtml(o.from_name)} directly, or accept/decline in your <a href="${portalUrl}">portal</a>.</p>
            <p><a href="${storefrontUrl}">See ${escapeHtml(o.from_name)}'s storefront</a></p>
            <hr /><p><small>The Wolf Den Marketplace · dealer network</small></p>
        `,
    });
    if (result?.error) throw new Error(result.error.message || "Failed to send offer email.");
    return result;
}

export async function sendDealerOfferResponseEmail(offerId, status) {
    const o = await loadOfferContext(offerId);
    if (!o) return null;
    const resend = getResendClient();
    const portalUrl = new URL("/marketplace/portal", baseUrl()).toString();

    // accepted/declined -> tell the offerer (reply-to owner); withdrawn -> tell the owner (reply-to offerer).
    const toOfferer = status === "accepted" || status === "declined";
    const to = toOfferer ? o.from_email : o.to_email;
    const replyTo = toOfferer ? o.to_email : o.from_email;
    const actorName = toOfferer ? o.to_name : o.from_name;
    const verb =
        status === "accepted" ? "accepted your offer on" : status === "declined" ? "declined your offer on" : "withdrew their offer on";

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        replyTo,
        subject: `Dealer offer ${status}: ${o.listing_title}`,
        html: `
            <h1>Dealer offer ${escapeHtml(status)}</h1>
            <p><strong>${escapeHtml(actorName)}</strong> ${verb} <strong>${escapeHtml(o.listing_title)}</strong>.</p>
            ${status === "accepted" ? `<p><strong>Reply to this email</strong> to arrange the handoff.</p>` : ""}
            <p><a href="${portalUrl}">Open your portal</a></p>
            <hr /><p><small>The Wolf Den Marketplace · dealer network</small></p>
        `,
    });
    if (result?.error) throw new Error(result.error.message || "Failed to send offer response email.");
    return result;
}

// --- Inventory swap emails (identified relay: recipient can reply straight to the proposer) ---

async function loadSwapContext(swapId) {
    const swap = await db.queryOne(
        `SELECT s.cash, s.note,
                vf.id AS from_id, vf.display_name AS from_name, vf.email AS from_email,
                vt.id AS to_id, vt.display_name AS to_name, vt.email AS to_email
         FROM mkt_swap s
         JOIN mkt_vendor vf ON vf.id = s.from_vendor_id
         JOIN mkt_vendor vt ON vt.id = s.to_vendor_id
         WHERE s.id = $1`,
        [swapId]
    );
    if (!swap) return null;
    const items = await db.query(
        `SELECT si.side, l.title FROM mkt_swap_item si JOIN mkt_listing l ON l.id = si.listing_id WHERE si.swap_id = $1`,
        [swapId]
    );
    swap.offer = items.filter((i) => i.side === "offer").map((i) => i.title);
    swap.request = items.filter((i) => i.side === "request").map((i) => i.title);
    return swap;
}

function swapList(titles) {
    return titles.length ? `<ul>${titles.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : "<p>—</p>";
}

export async function sendSwapEmail(swapId) {
    const s = await loadSwapContext(swapId);
    if (!s) return null;
    const resend = getResendClient();
    const portalUrl = new URL("/marketplace/portal", baseUrl()).toString();
    const storefrontUrl = new URL(`/marketplace/vendor/${s.from_id}`, baseUrl()).toString();
    const cashLine = s.cash != null ? `<p><strong>Plus ${currency.format(Number(s.cash))} cash</strong> on their side.</p>` : "";

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: s.to_email,
        replyTo: s.from_email,
        subject: `Swap proposal from ${s.from_name}`,
        html: `
            <h1>${escapeHtml(s.from_name)} wants to swap</h1>
            <p><strong>They give you:</strong></p>
            ${swapList(s.offer)}
            <p><strong>For your:</strong></p>
            ${swapList(s.request)}
            ${cashLine}
            ${s.note ? `<p>They said: &ldquo;${escapeHtml(s.note)}&rdquo;</p>` : ""}
            <p><strong>Reply to this email</strong> to talk to ${escapeHtml(s.from_name)}, or accept/decline in your <a href="${portalUrl}">portal</a>.</p>
            <p><a href="${storefrontUrl}">See their storefront</a></p>
            <hr /><p><small>The Wolf Den Marketplace · dealer swaps</small></p>
        `,
    });
    if (result?.error) throw new Error(result.error.message || "Failed to send swap email.");
    return result;
}

export async function sendSwapResponseEmail(swapId, status) {
    const s = await loadSwapContext(swapId);
    if (!s) return null;
    const resend = getResendClient();
    const portalUrl = new URL("/marketplace/portal", baseUrl()).toString();
    const toProposer = status === "accepted" || status === "declined";
    const to = toProposer ? s.from_email : s.to_email;
    const replyTo = toProposer ? s.to_email : s.from_email;
    const actorName = toProposer ? s.to_name : s.from_name;
    const verb =
        status === "accepted" ? "accepted your swap" : status === "declined" ? "declined your swap" : "withdrew their swap";

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        replyTo,
        subject: `Swap ${status}`,
        html: `
            <h1>Swap ${escapeHtml(status)}</h1>
            <p><strong>${escapeHtml(actorName)}</strong> ${verb}.</p>
            ${status === "accepted" ? `<p><strong>Reply to this email</strong> to arrange the trade.</p>` : ""}
            <p><a href="${portalUrl}">Open your portal</a></p>
            <hr /><p><small>The Wolf Den Marketplace · dealer swaps</small></p>
        `,
    });
    if (result?.error) throw new Error(result.error.message || "Failed to send swap response email.");
    return result;
}

// --- Password reset ---

export async function sendPasswordResetEmail(email, token) {
    const resend = getResendClient();
    const url = new URL("/marketplace/reset", baseUrl());
    url.searchParams.set("token", token);
    const goldButton =
        "display:inline-block;padding:12px 24px;background:#D4AF37;color:#0E0E0E;text-decoration:none;border-radius:6px;font-weight:bold;";

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: email,
        subject: "Reset your Wolf Den Marketplace password",
        html: `
            <h1>Reset your password</h1>
            <p>Tap below to set a new password. This link expires in 1 hour.</p>
            <p><a href="${url.toString()}" style="${goldButton}">Reset password</a></p>
            <p>If you didn't request this, you can safely ignore this email — your password won't change.</p>
            <hr /><p><small>The Wolf Den Marketplace</small></p>
        `,
    });
    if (result?.error) throw new Error(result.error.message || "Failed to send reset email.");
    return result;
}
