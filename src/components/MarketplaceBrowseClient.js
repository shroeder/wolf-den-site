"use client";

import "leaflet/dist/leaflet.css";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const US_CENTER = [39.8, -98.6];
const BRAND = "#D4AF37";

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

            map = L.map(containerRef.current).setView(US_CENTER, 4);
            mapRef.current = map;

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

                points.push([v.latitude, v.longitude]);
            });

            if (points.length === 1) {
                map.setView(points[0], 9);
            } else if (points.length > 1) {
                map.fitBounds(points, { padding: [40, 40], maxZoom: 10 });
            }
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

            <section className="card">
                <div ref={containerRef} className="mkt-map" />
            </section>

            <section className="card">
                <h2>Vendors{vendors.length ? ` (${vendors.length})` : ""}</h2>
                {vendors.length === 0 ? (
                    <p className="muted">No vendors with inventory yet.</p>
                ) : (
                    <ul className="mkt-vendor-list">
                        {sortedVendors.map((v) => (
                            <li key={v.id} className="mkt-vendor-row">
                                <Link href={`/marketplace/vendor/${v.id}`} className="mkt-vendor-link">
                                    <span className="mkt-vendor-name">{v.displayName}</span>
                                    <span className="mkt-offer-meta">
                                        {v.locationLabel || v.region || "Location TBD"}
                                        {v.distance != null ? ` · ${v.distance.toFixed(0)} mi away` : ""}
                                    </span>
                                </Link>
                                <span className="mkt-offer-meta">
                                    {v.listingCount} listing{v.listingCount === 1 ? "" : "s"}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
