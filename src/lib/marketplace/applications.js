import "server-only";

import { db } from "@/lib/db";
import { sendNewApplicationEmail, sendVendorInviteEmail } from "@/lib/marketplace/email.js";
import { createVendor, createVendorInvite, getVendorByEmail, getVendorById, setVendorLogo } from "@/lib/marketplace/vendors.js";
import { sendAdminPush } from "@/lib/push/send.js";
import { createServerLogger } from "@/lib/server-logger";

const applicationsLogger = createServerLogger({ source: "api", subsystem: "marketplace-applications" });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const APPLICATION_COLUMNS = `id, business_name, contact_name, email, phone, city, region,
    location_label, sells, links, notes, logo_url, status, reviewed_at, vendor_id, created_at, updated_at`;

function toIso(value) {
    return value ? new Date(value).toISOString() : null;
}

function mapApplication(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        businessName: row.business_name,
        contactName: row.contact_name,
        email: row.email,
        phone: row.phone,
        city: row.city,
        region: row.region,
        locationLabel: row.location_label,
        sells: row.sells,
        links: row.links,
        notes: row.notes,
        logoUrl: row.logo_url || null,
        status: row.status,
        reviewedAt: toIso(row.reviewed_at),
        vendorId: row.vendor_id,
        invitedAt: toIso(row.invited_at),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
    };
}

export function isValidEmail(value) {
    return EMAIL_PATTERN.test(String(value || "").trim().toLowerCase());
}

// Where application notifications go: MARKETPLACE_ADMIN_EMAIL if set, otherwise the store's default
// marketplace inbox. Works with no Vercel config.
const DEFAULT_ADMIN_EMAIL = "luke@wolfdengamingmn.com";

function resolveAdminNotifyEmail() {
    return process.env.MARKETPLACE_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
}

// Public submission. Saves the application (source of truth) and best-effort emails Luke.
export async function createApplication(input = {}) {
    const businessName = String(input.businessName || "").trim();
    const email = String(input.email || "").trim();

    if (!businessName) {
        throw new Error("Business name is required.");
    }

    if (!isValidEmail(email)) {
        throw new Error("A valid email address is required.");
    }

    const row = await db.queryOne(
        `INSERT INTO mkt_vendor_application
            (business_name, contact_name, email, phone, city, region, location_label, sells, links, notes, logo_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING ${APPLICATION_COLUMNS}`,
        [
            businessName,
            input.contactName ? String(input.contactName).trim() : null,
            email,
            input.phone ? String(input.phone).trim() : null,
            input.city ? String(input.city).trim() : null,
            input.region ? String(input.region).trim() : null,
            input.locationLabel ? String(input.locationLabel).trim() : null,
            input.sells ? String(input.sells).slice(0, 2000) : null,
            input.links ? String(input.links).slice(0, 1000) : null,
            input.notes ? String(input.notes).slice(0, 2000) : null,
            input.logoUrl ? String(input.logoUrl).trim().slice(0, 2000) : null,
        ]
    );

    const application = mapApplication(row);

    // Best-effort notify — never let a failed email block the submission.
    try {
        const to = resolveAdminNotifyEmail();
        await sendNewApplicationEmail(application, to);
    } catch (error) {
        applicationsLogger.warn("marketplace.application.notify_failed", { reason: error.message });
    }

    await sendAdminPush({
        title: "🧑‍💼 New vendor application",
        body: `${application.business_name}${application.location_label ? ` · ${application.location_label}` : ""} (${application.email})`,
        route: "marketplace",
        data: { applicationId: application.id },
    });

    applicationsLogger.info("marketplace.application.created", { applicationId: application.id });

    return application;
}

export async function listApplications({ status } = {}) {
    // Join the linked vendor so we can surface when the invite was last sent (mkt_vendor.invited_at).
    const cols = `a.id, a.business_name, a.contact_name, a.email, a.phone, a.city, a.region,
        a.location_label, a.sells, a.links, a.notes, a.logo_url, a.status, a.reviewed_at,
        a.vendor_id, a.created_at, a.updated_at, v.invited_at AS invited_at`;
    const rows = status
        ? await db.query(
              `SELECT ${cols} FROM mkt_vendor_application a LEFT JOIN mkt_vendor v ON v.id = a.vendor_id
               WHERE a.status = $1 ORDER BY a.created_at DESC`,
              [status]
          )
        : await db.query(
              `SELECT ${cols} FROM mkt_vendor_application a LEFT JOIN mkt_vendor v ON v.id = a.vendor_id
               ORDER BY a.created_at DESC`
          );

    return rows.map(mapApplication);
}

export async function getApplicationById(id) {
    const row = await db.queryOne(`SELECT ${APPLICATION_COLUMNS} FROM mkt_vendor_application WHERE id = $1`, [id]);

    return mapApplication(row);
}

// Approve: create (or reuse) the vendor, generate an invite, email the accept link, mark approved.
// Returns the vendor + the raw invite token so the admin UI can also surface the link directly.
export async function approveApplication(id) {
    const application = await getApplicationById(id);

    if (!application) {
        throw new Error("Application not found.");
    }

    if (application.status === "approved" && application.vendorId) {
        // Already approved: re-issue AND re-send the invite. "Approve + invite" should always send an
        // invite, so an already-approved vendor who never got the email (or lost it) gets a fresh one.
        const existingVendor = await getVendorById(application.vendorId);
        const { inviteToken, emailSent } = await issueAndEmailInvite(existingVendor, application);
        return { application, vendorId: application.vendorId, inviteToken, emailSent, reused: true };
    }

    // Reuse an existing vendor with this email if one exists, else create a fresh one.
    let vendor = await getVendorByEmail(application.email);

    if (!vendor) {
        vendor = await createVendor({
            email: application.email,
            displayName: application.businessName,
            logoUrl: application.logoUrl,
            address: {
                city: application.city,
                region: application.region,
                locationLabel: application.locationLabel,
            },
        });
    } else if (application.logoUrl && !vendor.logoUrl) {
        // Reusing an existing vendor — carry over the application's logo if they don't have one yet.
        vendor = await setVendorLogo(vendor.id, application.logoUrl);
    }

    await db.query(
        `UPDATE mkt_vendor_application
         SET status = 'approved', vendor_id = $2, reviewed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [application.id, vendor.id]
    );

    const { inviteToken, emailSent } = await issueAndEmailInvite(vendor, application);

    applicationsLogger.info("marketplace.application.approved", {
        applicationId: application.id,
        vendorId: vendor.id,
        emailSent,
    });

    return { application: { ...application, status: "approved", vendorId: vendor.id }, vendorId: vendor.id, inviteToken, emailSent };
}

// Create a single-use invite for a vendor and email it. Returns { inviteToken, emailSent }. The email
// is best-effort — a send failure never blocks approval — but emailSent is surfaced so the admin can be
// told to share the link manually when it doesn't go out.
async function issueAndEmailInvite(vendor, application) {
    const inviteToken = await createVendorInvite(vendor.id);
    let emailSent = false;
    if (vendor?.email) {
        try {
            await sendVendorInviteEmail({ vendor, businessName: application.businessName, inviteToken });
            emailSent = true;
        } catch (error) {
            applicationsLogger.warn("marketplace.application.invite_email_failed", {
                applicationId: application.id,
                reason: error.message,
            });
        }
    } else {
        applicationsLogger.warn("marketplace.application.invite_email_skipped_no_email", {
            applicationId: application.id,
            vendorId: vendor?.id,
        });
    }
    return { inviteToken, emailSent };
}

export async function rejectApplication(id) {
    const row = await db.queryOne(
        `UPDATE mkt_vendor_application
         SET status = 'rejected', reviewed_at = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING ${APPLICATION_COLUMNS}`,
        [id]
    );

    if (!row) {
        throw new Error("Application not found.");
    }

    applicationsLogger.info("marketplace.application.rejected", { applicationId: id });

    return mapApplication(row);
}
