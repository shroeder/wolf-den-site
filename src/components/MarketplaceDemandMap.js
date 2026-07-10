"use client";

import { useEffect, useRef, useState } from "react";

const MN_SOUTH_METRO = [44.45, -93.55];
const DEFAULT_ZOOM = 9;

// Self-contained supply-vs-demand map for the vendor portal: vendor pins + buyer-demand heat, tap a
// hot area to see what's being searched/wanted there. Fetches its own data from the map endpoints.
export default function MarketplaceDemandMap({ vendorLat = null, vendorLng = null } = {}) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const demandLayerRef = useRef(null);
    const [vendors, setVendors] = useState([]);
    const [demand, setDemand] = useState([]);
    const [showDemand, setShowDemand] = useState(true);
    const [mapReady, setMapReady] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [dbg, setDbg] = useState("b8 …");

    useEffect(() => {
        let cancelled = false;
        fetch("/api/marketplace/map")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (cancelled) return;
                if (d) {
                    setVendors(Array.isArray(d.vendors) ? d.vendors : []);
                    setDemand(Array.isArray(d.demand) ? d.demand : []);
                }
                setLoaded(true);
            })
            .catch(() => setLoaded(true));
        return () => {
            cancelled = true;
        };
    }, []);

    // Init the map once data is loaded (client-only; dynamic import keeps Leaflet out of SSR).
    useEffect(() => {
        if (!loaded) return undefined;
        let cancelled = false;
        let map;
        let resizeObs;
        (async () => {
            const L = (await import("leaflet")).default;
            if (cancelled || !containerRef.current || mapRef.current) return;
            const hasVendorLoc = vendorLat != null && vendorLng != null;
            // Create the map ALREADY at its final center/zoom — never pan after init. A post-init
            // setView reloads tiles for a new area, and if the container is mid-resize the old tiles
            // linger, which is what produced the split/stale-tile render on mobile.
            map = L.map(containerRef.current, { scrollWheelZoom: false })
                .setView(hasVendorLoc ? [vendorLat, vendorLng] : MN_SOUTH_METRO, hasVendorLoc ? 10 : DEFAULT_ZOOM);
            mapRef.current = map;
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "&copy; OpenStreetMap contributors",
                maxZoom: 19,
            }).addTo(map);
            const points = [];
            vendors.forEach((v) => {
                if (v.lat == null || v.lng == null) return;
                const marker = L.circleMarker([v.lat, v.lng], {
                    radius: 9,
                    color: "#ffffff",
                    weight: 2,
                    fillColor: "#2563EB",
                    fillOpacity: 0.95,
                }).addTo(map);
                marker.bindPopup(
                    `<strong>${v.name}</strong><br/>${v.locationLabel || v.region || ""}<br/>` +
                        `${v.listingCount} listing${v.listingCount === 1 ? "" : "s"}<br/>` +
                        `<a href="/marketplace/vendor/${v.id}">View inventory →</a>`
                );
                points.push([v.lat, v.lng]);
            });
            // "You are here" — a distinct green marker when we know the vendor's location.
            if (vendorLat != null && vendorLng != null) {
                L.circleMarker([vendorLat, vendorLng], {
                    radius: 11,
                    color: "#ffffff",
                    weight: 3,
                    fillColor: "#16A34A",
                    fillOpacity: 1,
                }).addTo(map).bindPopup("<strong>You are here</strong>");
            }

            // Only frame the vendor pins when we DON'T already know the vendor's own location (that
            // already centered the map above). This is the sole place bounds are set — no later pan.
            if (!hasVendorLoc) {
                if (points.length === 1) {
                    map.setView(points[0], Math.max(DEFAULT_ZOOM, 11));
                } else if (points.length > 1) {
                    map.fitBounds(points, { padding: [40, 40], maxZoom: 11 });
                    if (map.getZoom() < 8) map.setView(MN_SOUTH_METRO, DEFAULT_ZOOM);
                }
            }

            // Re-measure ONLY (never re-center) so tiles fill the real container size once the tabbed
            // card has finished laying out. Retried across frames + on any later container resize.
            const remeasure = () => {
                if (cancelled || !mapRef.current) return;
                mapRef.current.invalidateSize();
                const el = containerRef.current;
                const size = mapRef.current.getSize?.() || { x: 0, y: 0 };
                if (el) setDbg(`b8 cont ${el.clientWidth}×${el.clientHeight} · map ${Math.round(size.x)}×${Math.round(size.y)}`);
            };
            requestAnimationFrame(remeasure);
            setTimeout(remeasure, 200);
            setTimeout(remeasure, 600);
            if (typeof ResizeObserver !== "undefined" && containerRef.current) {
                resizeObs = new ResizeObserver(remeasure);
                resizeObs.observe(containerRef.current);
            }

            if (!cancelled) setMapReady(true);
        })();
        return () => {
            cancelled = true;
            setMapReady(false);
            if (resizeObs) {
                resizeObs.disconnect();
                resizeObs = undefined;
            }
            if (map) {
                map.remove();
                mapRef.current = null;
            }
        };
    }, [loaded, vendors, vendorLat, vendorLng]);

    // Demand heatmap: orange circles weighted by buyer activity; click to see what's wanted there.
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
                        // Searches/most-wanted + the actual open buy orders in this area (app parity).
                        const [demandRes, ordersRes] = await Promise.all([
                            fetch(`/api/marketplace/map/demand?lat=${d.lat}&lng=${d.lng}&radiusKm=15`),
                            fetch(`/api/marketplace/buy-orders?lat=${d.lat}&lng=${d.lng}&radiusKm=25&limit=8`),
                        ]);
                        const data = demandRes.ok ? await demandRes.json() : {};
                        const orderData = ordersRes.ok ? await ordersRes.json() : {};
                        const searches = (data.searches || []).slice(0, 6);
                        const products = (data.products || []).slice(0, 6);
                        const orders = (orderData.orders || []).slice(0, 6);
                        const buyOrdersHtml = orders.length
                            ? `<em>🛒 Buy orders:</em><br/>${orders
                                  .map(
                                      (o) =>
                                          `• ${o.name}${o.maxPrice != null ? ` — up to $${Number(o.maxPrice).toFixed(2)}` : ""}`
                                  )
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
            <p className="muted" style={{ fontSize: "0.7rem", opacity: 0.6 }}>{dbg}</p>
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
