"use client";

import Link from "next/link";
import { useState } from "react";

const money = (cents) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);

const shortId = (id) => String(id || "").slice(0, 8).toUpperCase();

// Buyer-facing status label. Payment is already captured (these are completed orders); this reflects
// where the ORDER is in fulfillment.
function statusLabel(o) {
    if (o.fulfillmentStatus === "cancelled") return "Cancelled";
    if (o.fulfillmentStatus === "shipped") return "Shipped";
    if (o.fulfillmentStatus === "picked_up") return "Picked up";
    if (o.fulfillmentStatus === "ready") return o.fulfillmentMode === "pickup" ? "Ready for pickup" : "Ready";
    return "Order received";
}

function OrderCard({ order }) {
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");
    const [requested, setRequested] = useState(Boolean(order.cancellationRequestedAt));
    const [open, setOpen] = useState(false);

    const isCancelled = order.fulfillmentStatus === "cancelled";
    const isFulfilled = ["shipped", "picked_up"].includes(order.fulfillmentStatus);
    const canRequest = !isCancelled && !isFulfilled && !requested;

    async function requestCancel() {
        setBusy(true);
        setMsg("");
        try {
            const res = await fetch(`/api/shop/orders/${order.id}/request-cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMsg(data?.error || "Could not send your request.");
                return;
            }
            setRequested(true);
            setOpen(false);
            setMsg("Cancellation request sent — we'll review it and be in touch.");
        } catch {
            setMsg("Could not send your request.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0 }}>Order #{shortId(order.id)}</h2>
                <span className="pill">{statusLabel(order)}</span>
            </div>
            <p className="secondary" style={{ marginTop: 4 }}>
                {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ""} ·{" "}
                {order.fulfillmentMode === "pickup" ? "Local pickup" : "Shipping"} · {money(order.totalCents)}
            </p>

            <ul>
                {order.items.map((it, i) => (
                    <li key={i}>
                        {it.name || it.itemName || it.title || "Item"} × {it.quantity || 1}
                    </li>
                ))}
            </ul>

            {order.trackingNumber ? (
                <p className="secondary">
                    📦 {order.shippingCarrier || ""} {order.shippingService || ""} · Tracking:{" "}
                    <strong>{order.trackingNumber}</strong>
                </p>
            ) : null}

            {isCancelled ? (
                <p className="secondary">
                    This order was cancelled{order.cancellationReason ? ` — ${order.cancellationReason}` : ""}.
                    {order.refundAmountCents ? ` ${money(order.refundAmountCents)} was refunded.` : ""}
                </p>
            ) : null}

            {order.receiptUrl ? (
                <p>
                    <a href={order.receiptUrl} target="_blank" rel="noreferrer">
                        View payment receipt →
                    </a>
                </p>
            ) : null}

            {requested && !isCancelled ? (
                <p className="secondary">🙋 Cancellation requested — pending review by the shop.</p>
            ) : null}

            {canRequest ? (
                open ? (
                    <div className="stack" style={{ gap: 6, maxWidth: 420 }}>
                        <textarea
                            rows={2}
                            placeholder="Why do you want to cancel? (optional)"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                        <div style={{ display: "flex", gap: 8 }}>
                            <button type="button" className="pill" disabled={busy} onClick={requestCancel}>
                                {busy ? "Sending…" : "Send cancellation request"}
                            </button>
                            <button type="button" className="pill" onClick={() => setOpen(false)}>
                                Never mind
                            </button>
                        </div>
                    </div>
                ) : (
                    <button type="button" className="pill" onClick={() => setOpen(true)}>
                        Request cancellation
                    </button>
                )
            ) : null}

            {msg ? <p className="secondary">{msg}</p> : null}
        </section>
    );
}

export default function ShopOrdersClient({ orders, email }) {
    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>My Orders</h1>
                <p className="secondary">Signed in as {email}</p>
            </section>

            {/* Transparency: all sales are final; cancellations are requests the shop may decline. */}
            <section className="card">
                <p className="secondary" style={{ margin: 0 }}>
                    <strong>Please order carefully.</strong> All sales are final. Once an order is placed, it&apos;s
                    confirmed and payment is captured. You can <strong>request</strong> a cancellation below, but
                    approving it and issuing any refund is at The Wolf Den&apos;s sole discretion — a request is not a
                    guarantee, and orders already shipped or picked up can&apos;t be cancelled.
                </p>
            </section>

            {orders.length === 0 ? (
                <section className="card">
                    <p className="secondary">
                        You have no orders yet. <Link href="/shop">Browse the shop →</Link>
                    </p>
                </section>
            ) : (
                orders.map((o) => <OrderCard key={o.id} order={o} />)
            )}
        </div>
    );
}
