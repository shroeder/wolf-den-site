"use client";

import { useState } from "react";

function money(cents) {
    return "$" + (Number(cents || 0) / 100).toFixed(2);
}

function shortId(id) {
    return String(id || "").slice(0, 8).toUpperCase();
}

const FILTERS = [
    { id: "all", label: "All" },
    { id: "unfulfilled", label: "Unfulfilled" },
    { id: "ready", label: "Ready" },
    { id: "shipped", label: "Shipped" },
    { id: "picked_up", label: "Picked up" },
    { id: "cancelled", label: "Cancelled" },
];

export default function ShopOrdersAdminClient({ orders: initial }) {
    const [orders, setOrders] = useState(initial);
    const [filter, setFilter] = useState("all");
    const shown = filter === "all" ? orders : orders.filter((o) => o.fulfillmentStatus === filter);

    async function update(id, patch) {
        const res = await fetch(`/api/admin/shop/orders/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
        });
        if (res.ok) {
            const { order } = await res.json();
            setOrders((os) =>
                os.map((o) =>
                    o.id === id
                        ? { ...o, fulfillmentStatus: order.fulfillment_status, trackingNumber: order.tracking_number || "" }
                        : o
                )
            );
        }
    }

    return (
        <div className="stack reveal">
            <section className="card">
                <h1>Shop Orders</h1>
                <p className="muted">{orders.length} paid order(s). Mark them fulfilled and add tracking.</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {FILTERS.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            className={`pill${filter === f.id ? " lf-game-active" : ""}`}
                            onClick={() => setFilter(f.id)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </section>

            {shown.length === 0 ? (
                <p className="muted">No orders in this view.</p>
            ) : (
                shown.map((o) => <OrderCard key={o.id} order={o} onUpdate={update} />)
            )}
        </div>
    );
}

function OrderCard({ order: o, onUpdate }) {
    const [tracking, setTracking] = useState(o.trackingNumber || "");
    const [busy, setBusy] = useState(false);
    const [labelUrl, setLabelUrl] = useState(o.shippingLabelUrl || "");
    const [labelBusy, setLabelBusy] = useState(false);
    const [labelError, setLabelError] = useState("");
    const isPickup = o.fulfillmentMode === "pickup";

    async function act(patch) {
        setBusy(true);
        await onUpdate(o.id, patch);
        setBusy(false);
    }

    async function buyLabel() {
        setLabelBusy(true);
        setLabelError("");
        try {
            const res = await fetch(`/api/admin/shop/orders/${o.id}/label`, { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setLabelError(data?.error || "Could not buy label.");
                return;
            }
            setLabelUrl(data.labelUrl || "");
            const newTracking = data.trackingCode || tracking;
            if (data.trackingCode) {
                setTracking(data.trackingCode);
            }
            // The label endpoint already marked the order shipped server-side; sync the list row.
            await onUpdate(o.id, { fulfillmentStatus: "shipped", trackingNumber: newTracking });
        } catch {
            setLabelError("Could not buy label.");
        } finally {
            setLabelBusy(false);
        }
    }

    return (
        <section className="card">
            <h2>
                #{shortId(o.id)} · {money(o.totalCents)} · {isPickup ? "Pickup" : "Ship"}
            </h2>
            <p className="muted">
                {o.createdAt ? new Date(o.createdAt).toLocaleString() : ""} ·{" "}
                <strong>{o.fulfillmentStatus.replace("_", " ")}</strong>
            </p>
            <ul>
                {o.items.map((it, i) => (
                    <li key={i}>
                        {it.name || it.itemName || it.title || "Item"} × {it.quantity || 1}
                    </li>
                ))}
            </ul>
            <p className="muted">
                👤 {o.customerName || o.shipping.name || "—"} · {o.customerEmail || o.shipping.email || "—"}
                {o.shipping.phone ? ` · ${o.shipping.phone}` : ""}
                {o.refundAmountCents ? <><br />↩️ Refunded {money(o.refundAmountCents)}{o.cancellationReason ? ` — ${o.cancellationReason}` : ""}</> : null}
                {!isPickup && o.shipping.addressLine1 ? (
                    <>
                        <br />
                        {o.shipping.addressLine1}
                        {o.shipping.addressLine2 ? `, ${o.shipping.addressLine2}` : ""}, {o.shipping.city},{" "}
                        {o.shipping.state} {o.shipping.postalCode}
                    </>
                ) : null}
            </p>
            {o.receiptUrl ? (
                <p>
                    <a href={o.receiptUrl} target="_blank" rel="noreferrer">
                        Square receipt →
                    </a>
                </p>
            ) : null}
            {!isPickup && (o.shippingService || o.shippingCarrier) ? (
                <p className="muted">
                    Shipping: {o.shippingCarrier || ""} {o.shippingService || ""} · {money(o.shippingCents)}
                </p>
            ) : null}
            {labelError ? <p style={{ color: "#f7a6a6" }}>{labelError}</p> : null}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {!isPickup ? (
                    <>
                        {o.hasShipment ? (
                            labelUrl ? (
                                <a className="button primary" href={labelUrl} target="_blank" rel="noreferrer">
                                    Print label →
                                </a>
                            ) : (
                                <button type="button" className="button primary" disabled={labelBusy} onClick={buyLabel}>
                                    {labelBusy ? "Buying…" : "Buy label"}
                                </button>
                            )
                        ) : null}
                        <input
                            type="text"
                            placeholder="Tracking #"
                            value={tracking}
                            onChange={(e) => setTracking(e.target.value)}
                        />
                        <button
                            type="button"
                            className={o.hasShipment ? "pill" : "button primary"}
                            disabled={busy}
                            onClick={() => act({ fulfillmentStatus: "shipped", trackingNumber: tracking })}
                        >
                            Mark shipped
                        </button>
                    </>
                ) : (
                    <>
                        <button type="button" className="pill" disabled={busy} onClick={() => act({ fulfillmentStatus: "ready" })}>
                            Mark ready
                        </button>
                        <button
                            type="button"
                            className="button primary"
                            disabled={busy}
                            onClick={() => act({ fulfillmentStatus: "picked_up" })}
                        >
                            Mark picked up
                        </button>
                    </>
                )}
                <button type="button" className="pill" disabled={busy} onClick={() => act({ fulfillmentStatus: "cancelled" })}>
                    Cancel
                </button>
            </div>
        </section>
    );
}
