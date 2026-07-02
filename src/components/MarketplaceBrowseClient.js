"use client";

import "leaflet/dist/leaflet.css";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

// Default view: south metro of the Twin Cities / Montgomery area — the Wolf Den's recruiting turf.
const MN_SOUTH_METRO = [44.66, -93.42];
const DEFAULT_ZOOM = 10;
const BRAND = "#D4AF37";

function monthYear(iso) {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime())
        ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
        : null;
}

// Great-circle distance in miles (for "near me" sorting).
function distanceMiles(a, b) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 3958.8;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

export default function MarketplaceBrowseClient({ vendors }) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef({});
    const [myLoc, setMyLoc] = useState(null);
    const [locating, setLocating] = useState(false);
    const [locError, setLocError] = useState("");

    const located = vendors.filter((v) => v.latitude != null && v.longitude != null);

    // Vendor list, sorted by distance once we know where the buyer is.
    const sortedVendors = useMemo(() => {
        if (!myLoc) {
            return vendors;
        }

        return [...vendors]
            .map((v) => ({
                ...v,
                distance:
                    v.latitude != null && v.longitude != null
                        ? distanceMiles(myLoc, { lat: v.latitude, lng: v.longitude })
                        : null,
            }))
            .sort((a, b) => {
                if (a.distance == null) return 1;
                if (b.distance == null) return -1;
                return a.distance - b.distance;
            });
    }, [vendors, myLoc]);

    // Initialise the Leaflet map once (client-only; dynamic import keeps it out of SSR).
    useEffect(() => {
        let cancelled = false;
        let map;

        (async () => {
            const L = (await import("leaflet")).default;

            if (cancelled || !containerRef.current || mapRef.current) {
                return;
            }

            map = L.map(containerRef.current).setView(MN_SOUTH_METRO, DEFAULT_ZOOM);
            mapRef.current = map;
            markersRef.current = {};

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "&copy; OpenStreetMap contributors",
                maxZoom: 19,
            }).addTo(map);

            const points = [];

            located.forEach((v) => {
                const marker = L.circleMarker([v.latitude, v.longitude], {
                    radius: 9,
                    color: BRAND,
                    weight: 2,
                    fillColor: BRAND,
                    fillOpacity: 0.85,
                }).addTo(map);

                marker.bindPopup(
                    `<strong>${v.displayName}</strong><br/>${v.locationLabel || ""}<br/>` +
                        `${v.listingCount} listing${v.listingCount === 1 ? "" : "s"}<br/>` +
                        `<a href="/marketplace/vendor/${v.id}">View inventory →</a>`
                );

                markersRef.current[v.id] = marker;
                points.push([v.latitude, v.longitude]);
            });

            // Frame actual vendors when present, but never zoom out past the south-metro default so the
            // map stays anchored on Luke's area.
            if (points.length === 1) {
                map.setView(points[0], Math.max(DEFAULT_ZOOM, 11));
            } else if (points.length > 1) {
                map.fitBounds(points, { padding: [40, 40], maxZoom: 11 });
                if (map.getZoom() < 8) {
                    map.setView(MN_SOUTH_METRO, DEFAULT_ZOOM);
                }
            }

            // The map lives in a grid column now; recalc its size after layout so tiles fill correctly.
            setTimeout(() => map.invalidateSize(), 0);
        })();

        return () => {
            cancelled = true;
            if (map) {
                map.remove();
                mapRef.current = null;
            }
        };
    }, [located]);

    function locateMe() {
        if (!navigator.geolocation) {
            setLocError("Location isn't available in this browser.");
            return;
        }

        setLocating(true);
        setLocError("");

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setMyLoc(loc);
                setLocating(false);
                if (mapRef.current) {
                    mapRef.current.setView([loc.lat, loc.lng], 9);
                }
            },
            () => {
                setLocating(false);
                setLocError("Couldn't get your location.");
            }
        );
    }

    // Hovering a vendor card highlights its map pin (and vice versa), so the list and map correlate.
    function highlightVendor(id) {
        const marker = markersRef.current[id];
        if (!marker) return;
        marker.setStyle({ radius: 14, fillOpacity: 1, weight: 3 });
        marker.bringToFront?.();
        marker.openPopup();
    }

    function resetVendor(id) {
        const marker = markersRef.current[id];
        if (!marker) return;
        marker.setStyle({ radius: 9, fillOpacity: 0.85, weight: 2 });
        marker.closePopup();
    }

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Browse Vendors</h1>
                <p>
                    See which vendors are near you and browse their full online catalog. Pick a vendor to view
                    everything they have in stock.
                </p>
                <div className="mkt-browse-actions">
                    <button type="button" className="button primary" onClick={locateMe} disabled={locating}>
                        {locating ? "Locating..." : "📍 Find vendors near me"}
                    </button>
                    <Link href="/marketplace" className="pill">
                        Search by item instead
                    </Link>
                </div>
                {locError ? <p className="muted">{locError}</p> : null}
            </section>

            <div className="mkt-browse-split">
                <section className="card mkt-browse-map-card">
                    <div ref={containerRef} className="mkt-map" />
                </section>

                <section className="card mkt-browse-list-card">
                    <h2>Vendors{vendors.length ? ` (${vendors.length})` : ""}</h2>
                {vendors.length === 0 ? (
                    <p className="muted">No vendors with inventory yet.</p>
                ) : (
                    <ul className="mkt-vendor-grid">
                        {sortedVendors.map((v) => (
                            <li key={v.id}>
                                <Link
                                    href={`/marketplace/vendor/${v.id}`}
                                    className="mkt-vendor-card"
                                    onMouseEnter={() => highlightVendor(v.id)}
                                    onMouseLeave={() => resetVendor(v.id)}
                                >
                                    <div className="mkt-vendor-card-top">
                                        <span className="mkt-vendor-name">
                                            {v.logoUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={v.logoUrl} alt="" className="mkt-vendor-logo mkt-vendor-logo-sm" />
                                            ) : null}
                                            ✓ {v.displayName}
                                        </span>
                                        <span className="mkt-offer-meta">
                                            {v.locationLabel || v.region || "Location TBD"}
                                            {v.distance != null ? ` · ${v.distance.toFixed(0)} mi away` : ""}
                                        </span>
                                    </div>
                                    {v.previewImages && v.previewImages.length > 0 ? (
                                        <div className="mkt-vendor-previews">
                                            {v.previewImages.slice(0, 4).map((img, i) => (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img key={i} src={img} alt="" className="mkt-vendor-preview" loading="lazy" />
                                            ))}
                                        </div>
                                    ) : null}
                                    <div className="mkt-vendor-card-foot">
                                        <span className="mkt-trust-badge">✓ Verified</span>
                                        <span className="mkt-trust-item">
                                            {v.listingCount} listing{v.listingCount === 1 ? "" : "s"}
                                        </span>
                                        {monthYear(v.memberSince) ? (
                                            <span className="mkt-trust-item">Since {monthYear(v.memberSince)}</span>
                                        ) : null}
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
                </section>
            </div>
        </div>
    );
}
