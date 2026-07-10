"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useRef, useState } from "react";

const MN_SOUTH_METRO = [44.45, -93.55];
const DEFAULT_ZOOM = 9;

// Vendor-portal supply-vs-demand map: vendor pins + buyer-demand heat, tap a hot area for what's
// searched/wanted + open buy orders there. Data comes in as props (server-fetched) so the map isn't
// racing a client fetch, and the map is only created once its container reports a real width — the
// robust pattern for Leaflet inside tabs/cards (a zero/stale width is what corrupts tile layout).
export default function MarketplaceDemandMap({ vendors = [], demand = [], vendorLat = null, vendorLng = null }) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const demandLayerRef = useRef(null);
    const [showDemand, setShowDemand] = useState(true);
    const [mapReady, setMapReady] = useState(false);

    const located = useMemo(() => (vendors || []).filter((v) => v.lat != null && v.lng != null), [vendors]);
    const hasVendorLoc = vendorLat != null && vendorLng != null;

    useEffect(() => {
        let cancelled = false;
        let map;
        let observer;

        const build = async () => {
            const L = (await import("leaflet")).default;
            if (cancelled || !containerRef.current || mapRef.current) return;

            map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
                hasVendorLoc ? [vendorLat, vendorLng] : MN_SOUTH_METRO,
                hasVendorLoc ? 10 : DEFAULT_ZOOM
            );
            mapRef.current = map;

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "&copy; OpenStreetMap contributors",
                maxZoom: 19,
            }).addTo(map);

            const points = [];
            located.forEach((v) => {
                L.circleMarker([v.lat, v.lng], {
                    radius: 9,
                    color: "#ffffff",
                    weight: 2,
                    fillColor: "#2563EB",
                    fillOpacity: 0.95,
                })
                    .addTo(map)
                    .bindPopup(
                        `<strong>${v.name}</strong><br/>${v.locationLabel || v.region || ""}<br/>` +
                            `${v.listingCount} listing${v.listingCount === 1 ? "" : "s"}<br/>` +
                            `<a href="/marketplace/vendor/${v.id}">View inventory →</a>`
                    );
                points.push([v.lat, v.lng]);
            });

            if (hasVendorLoc) {
                L.circleMarker([vendorLat, vendorLng], {
                    radius: 11,
                    color: "#ffffff",
                    weight: 3,
                    fillColor: "#16A34A",
                    fillOpacity: 1,
                })
                    .addTo(map)
                    .bindPopup("<strong>You are here</strong>");
            } else if (points.length === 1) {
                map.setView(points[0], Math.max(DEFAULT_ZOOM, 11));
            } else if (points.length > 1) {
                map.fitBounds(points, { padding: [40, 40], maxZoom: 11 });
                if (map.getZoom() < 8) map.setView(MN_SOUTH_METRO, DEFAULT_ZOOM);
            }

            map.invalidateSize();
            if (!cancelled) setMapReady(true);
        };

        // Create the map only once the container has a real, laid-out width; then keep it sized.
        if (typeof ResizeObserver !== "undefined" && containerRef.current) {
            observer = new ResizeObserver((entries) => {
                const width = entries[0]?.contentRect?.width || 0;
                if (width > 0 && !mapRef.current) {
                    build();
                } else if (mapRef.current) {
                    mapRef.current.invalidateSize();
                }
            });
            observer.observe(containerRef.current);
        } else {
            build();
        }

        return () => {
            cancelled = true;
            setMapReady(false);
            if (observer) observer.disconnect();
            if (map) {
                map.remove();
                mapRef.current = null;
            }
        };
    }, [located, hasVendorLoc, vendorLat, vendorLng]);

    // Buyer-demand heat layer, managed separately so toggling it doesn't rebuild the map.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return undefined;
        let cancelled = false;

        (async () => {
            const L = (await import("leaflet")).default;
            if (cancelled) return;
            if (demandLayerRef.current) {
                map.removeLayer(demandLayerRef.current);
                demandLayerRef.current = null;
            }
            if (!showDemand || demand.length === 0) return;

            const maxW = Math.max(...demand.map((d) => d.weight), 1);
            const group = L.layerGroup();
            demand.forEach((d) => {
                const t = d.weight / maxW;
                const circle = L.circle([d.lat, d.lng], {
                    radius: 1200 + 4500 * t,
                    color: "#EA580C",
                    weight: 1,
                    fillColor: "#F97316",
                    fillOpacity: 0.3 + 0.4 * t,
                });
                circle.on("click", async () => {
                    L.popup().setLatLng([d.lat, d.lng]).setContent("Loading demand…").openOn(map);
                    try {
                        const [demandRes, ordersRes] = await Promise.all([
                            fetch(`/api/marketplace/map/demand?lat=${d.lat}&lng=${d.lng}&radiusKm=15`),
                            fetch(`/api/marketplace/buy-orders?lat=${d.lat}&lng=${d.lng}&radiusKm=25&limit=8`),
                        ]);
                        const data = demandRes.ok ? await demandRes.json() : {};
                        const orderData = ordersRes.ok ? await ordersRes.json() : {};
                        // searches come back as { term, weight } objects — pull the term string.
                        const searches = (data.searches || [])
                            .map((s) => (typeof s === "string" ? s : s?.term))
                            .filter(Boolean)
                            .slice(0, 6);
                        const products = (data.products || []).slice(0, 6);
                        const orders = (orderData.orders || []).slice(0, 6);
                        const buyOrdersHtml = orders.length
                            ? `<em>🛒 Buy orders:</em><br/>${orders
                                  .map((o) => `• ${o.name}${o.maxPrice != null ? ` — up to $${Number(o.maxPrice).toFixed(2)}` : ""}`)
                                  .join("<br/>")}<br/>`
                            : "";
                        const html =
                            `<strong>What buyers want near here</strong><br/>` +
                            buyOrdersHtml +
                            (searches.length ? `<em>Searches:</em> ${searches.join(", ")}<br/>` : "") +
                            (products.length
                                ? `<em>Most-wanted:</em><br/>${products.map((p) => `• ${p.name}`).join("<br/>")}`
                                : searches.length || orders.length
                                  ? ""
                                  : "No recent activity.");
                        if (!cancelled) L.popup().setLatLng([d.lat, d.lng]).setContent(html).openOn(map);
                    } catch {
                        if (!cancelled) L.popup().setLatLng([d.lat, d.lng]).setContent("Couldn't load demand.").openOn(map);
                    }
                });
                group.addLayer(circle);
            });
            group.addTo(map);
            demandLayerRef.current = group;
        })();

        return () => {
            cancelled = true;
        };
    }, [demand, showDemand, mapReady]);

    return (
        <section className="card">
            <h2>Demand map</h2>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
                🔵 Vendors &nbsp;·&nbsp; 🟠 Buyer demand — tap an orange area to see what&rsquo;s being searched &amp; wanted
                there. Spot the gaps you could fill.
            </p>
            {demand.length > 0 ? (
                <div style={{ marginBottom: 8 }}>
                    <button type="button" className="pill" onClick={() => setShowDemand((s) => !s)}>
                        {showDemand ? "🔥 Hide buyer demand" : "🔥 Show buyer demand"}
                    </button>
                </div>
            ) : null}
            <div ref={containerRef} className="mkt-map" />
        </section>
    );
}
