import "server-only";

import { db } from "@/lib/db";

function toDateStr(value) {
    return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function mapEvent(row) {
    return {
        id: row.id,
        name: row.name,
        locationLabel: row.location_label || null,
        eventDate: toDateStr(row.event_date),
        imageUrl: row.image_url || null,
        latitude: row.latitude != null ? Number(row.latitude) : null,
        longitude: row.longitude != null ? Number(row.longitude) : null,
        createdBy: row.created_by || null,
        createdByName: row.created_by_name || null,
        vendorCount: row.vendor_count != null ? Number(row.vendor_count) : undefined,
    };
}

// Common event columns + creator name, for the list/detail queries (aliased "e").
const EVENT_COLS =
    "e.id, e.name, e.location_label, e.event_date, e.image_url, e.created_by, e.latitude, e.longitude, " +
    "(SELECT display_name FROM mkt_vendor WHERE id = e.created_by) AS created_by_name";

// Upcoming events with optional filters: text (name / location / attending-vendor name — covers
// "who's going"), a specific date, and vicinity (nearLat/nearLng → distance sort). Undated/no-coord
// events sort last.
export async function listUpcomingEvents({ q = null, date = null, nearLat = null, nearLng = null, limit = 50 } = {}) {
    const params = [];
    const where = ["(e.event_date IS NULL OR e.event_date >= CURRENT_DATE)"];

    if (date) {
        params.push(date);
        where.push(`e.event_date = $${params.length}`);
    }
    const text = q ? String(q).trim() : "";
    if (text.length >= 2) {
        params.push(`%${text}%`);
        const p = `$${params.length}`;
        where.push(
            `(e.name ILIKE ${p} OR e.location_label ILIKE ${p} OR EXISTS (
                SELECT 1 FROM mkt_event_vendor ev JOIN mkt_vendor v ON v.id = ev.vendor_id
                WHERE ev.event_id = e.id AND v.display_name ILIKE ${p}))`
        );
    }

    const hasNear = Number.isFinite(Number(nearLat)) && Number.isFinite(Number(nearLng));
    let distanceSelect = "NULL::numeric AS distance_km";
    let orderBy = "e.event_date ASC NULLS LAST, e.name ASC";
    if (hasNear) {
        params.push(Number(nearLat));
        const latP = `$${params.length}`;
        params.push(Number(nearLng));
        const lngP = `$${params.length}`;
        distanceSelect =
            `CASE WHEN e.latitude IS NULL OR e.longitude IS NULL THEN NULL ELSE ` +
            `6371 * acos(LEAST(1, cos(radians(${latP})) * cos(radians(e.latitude)) * ` +
            `cos(radians(e.longitude) - radians(${lngP})) + sin(radians(${latP})) * sin(radians(e.latitude)))) END AS distance_km`;
        orderBy = "distance_km ASC NULLS LAST, e.event_date ASC NULLS LAST";
    }

    params.push(limit);
    const limitP = `$${params.length}`;
    const rows = await db.query(
        `SELECT ${EVENT_COLS}, ${distanceSelect},
                (SELECT COUNT(*) FROM mkt_event_vendor ev JOIN mkt_vendor v ON v.id = ev.vendor_id AND v.status = 'active'
                   WHERE ev.event_id = e.id)::int AS vendor_count
         FROM mkt_event e
         WHERE ${where.join(" AND ")}
         ORDER BY ${orderBy}
         LIMIT ${limitP}`,
        params
    );
    return rows.map((r) => ({ ...mapEvent(r), distanceKm: r.distance_km != null ? Number(r.distance_km) : null }));
}

// For the vendor portal: upcoming events + whether THIS vendor is attending.
export async function listEventsForVendor(vendorId) {
    const rows = await db.query(
        `SELECT ${EVENT_COLS},
                EXISTS (SELECT 1 FROM mkt_event_vendor ev WHERE ev.event_id = e.id AND ev.vendor_id = $1) AS attending
         FROM mkt_event e
         WHERE e.event_date IS NULL OR e.event_date >= CURRENT_DATE
         ORDER BY e.event_date ASC NULLS LAST, e.name ASC
         LIMIT 100`,
        [vendorId]
    );
    return rows.map((r) => ({ ...mapEvent(r), attending: r.attending === true }));
}

// Create (or reuse a duplicate of) an event. Returns the event id.
export async function createEvent({ name, locationLabel = null, eventDate = null, createdBy = null, imageUrl = null, latitude = null, longitude = null }) {
    const trimmed = String(name || "").trim();
    if (!trimmed) {
        throw new Error("Event name is required.");
    }
    const date = eventDate || null;
    const lat = latitude != null && latitude !== "" && Number.isFinite(Number(latitude)) ? Number(latitude) : null;
    const lng = longitude != null && longitude !== "" && Number.isFinite(Number(longitude)) ? Number(longitude) : null;
    const existing = await db.queryOne(
        `SELECT id FROM mkt_event WHERE LOWER(name) = LOWER($1) AND event_date IS NOT DISTINCT FROM $2`,
        [trimmed, date]
    );
    if (existing) {
        return existing.id;
    }
    const row = await db.queryOne(
        `INSERT INTO mkt_event (name, location_label, event_date, created_by, image_url, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
            trimmed.slice(0, 200),
            locationLabel ? String(locationLabel).slice(0, 200) : null,
            date,
            createdBy,
            imageUrl ? String(imageUrl).slice(0, 500) : null,
            lat,
            lng,
        ]
    );
    return row.id;
}

export async function setEventAttendance(eventId, vendorId, attending) {
    if (attending) {
        await db.query(
            `INSERT INTO mkt_event_vendor (event_id, vendor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [eventId, vendorId]
        );
    } else {
        await db.query(`DELETE FROM mkt_event_vendor WHERE event_id = $1 AND vendor_id = $2`, [eventId, vendorId]);
    }
}

// Buyer event page: the event + attending vendors.
export async function getEventWithVendors(eventId) {
    const event = await db.queryOne(
        `SELECT id, name, location_label, event_date, image_url, created_by, latitude, longitude,
                (SELECT display_name FROM mkt_vendor WHERE id = mkt_event.created_by) AS created_by_name
         FROM mkt_event WHERE id = $1`,
        [eventId]
    );
    if (!event) {
        return null;
    }
    const vendors = await db.query(
        `SELECT v.id, v.display_name, v.logo_url, v.location_label, v.specialties,
                (SELECT COUNT(*) FROM mkt_listing l WHERE l.vendor_id = v.id AND l.status = 'active' AND NOT l.vendor_only)::int AS listing_count
         FROM mkt_event_vendor ev
         JOIN mkt_vendor v ON v.id = ev.vendor_id AND v.status = 'active'
         WHERE ev.event_id = $1
         ORDER BY v.display_name ASC`,
        [eventId]
    );
    return {
        ...mapEvent(event),
        vendors: vendors.map((v) => ({
            id: v.id,
            displayName: v.display_name,
            logoUrl: v.logo_url || null,
            locationLabel: v.location_label,
            specialties: Array.isArray(v.specialties) ? v.specialties : [],
            listingCount: Number(v.listing_count) || 0,
        })),
    };
}

// Active listings from vendors attending an event (the "searchable at the event" inventory).
export async function listEventInventory(eventId, { query = "", limit = 60 } = {}) {
    const params = [eventId];
    let textClause = "";
    const q = String(query || "").trim();
    if (q.length >= 2) {
        params.push(`%${q}%`);
        textClause = `AND (l.title ILIKE $${params.length} OR l.set_name ILIKE $${params.length})`;
    }
    params.push(Math.min(Number(limit) || 60, 100));
    const rows = await db.query(
        `SELECT l.id, l.kind, l.title, l.set_name, l.card_number, l.price, l.quantity, l.catalog_product_id,
                COALESCE(l.image_url, c.image_url) AS image_url,
                v.id AS vendor_id, v.display_name AS vendor_name
         FROM mkt_event_vendor ev
         JOIN mkt_listing l ON l.vendor_id = ev.vendor_id AND l.status = 'active' AND NOT l.vendor_only
         JOIN mkt_vendor v ON v.id = l.vendor_id AND v.status = 'active'
         LEFT JOIN tcg_cards c ON c.id = l.catalog_product_id
         WHERE ev.event_id = $1 ${textClause}
         ORDER BY l.price ASC
         LIMIT $${params.length}`,
        params
    );
    return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        setName: r.set_name,
        cardNumber: r.card_number,
        price: r.price != null ? Number(r.price) : null,
        quantity: r.quantity,
        catalogProductId: r.catalog_product_id ? String(r.catalog_product_id) : null,
        imageUrl: r.image_url,
        vendor: { id: r.vendor_id, displayName: r.vendor_name },
    }));
}
