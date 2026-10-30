"use client";

import Link from "next/link";
import { useState } from "react";

import { redeemUrl } from "@/lib/marketplace/redeem-link";

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

    // ── ⚠️ THE CODE STAFF SCAN TO FIND THIS ORDER ────────────────────────────────────────────────
    // Luke: "People should be able to show their QR code for their order and it should pull them up
    // right away into the right section of the apps."
    //
    // What it replaces: a member reading a confirmation number off their phone while staff type it
    // into a search. Same mechanism as the vault code -- it identifies, it does not act, and every
    // verb behind the screen it opens is separately admin-authenticated.
    //
    // ⚠️ PICKUP ONLY, AND ONLY WHILE THERE IS SOMETHING TO COLLECT. A shipping order is not collected
    // at a counter, and an order already picked up or cancelled has nothing for staff to do -- a code
    // offered there is a member queueing to be told no.
    const canShowQr = order.fulfillmentMode === "pickup" && !isCancelled && !isFulfilled;
    const [qr, setQr] = useState(null);
    const [qrBusy, setQrBusy] = useState(false);

    async function showPickupQr() {
        setQrBusy(true);
        try {
            const res = await fetch("/api/marketplace/handoff", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind: "order", orderId: order.id }),
            });
            const d = await res.json().catch(() => null);
            if (!res.ok || !d?.ok) throw new Error("no code");
            const QRCode = (await import("qrcode")).default;
            const img = await QRCode.toDataURL(redeemUrl("order", d.token), { width: 320, margin: 1 }).catch(() => null);
            setQr({ img });
        } catch {
            setMsg("Couldn't make a pickup code just now.");
        } finally {
            setQrBusy(false);
        }
    }

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

            {canShowQr ? (
                <button type="button" className="vt-qr-btn" style={{ marginTop: 8 }}
                    onClick={showPickupQr} disabled={qrBusy}>
                    {qrBusy ? "One moment…" : "Show pickup code"}
                </button>
            ) : null}
            {qr ? (
                /* The same overlay the vault uses, for the same reason: it is held up to another person
                   at arm's length in a shop. Reusing the class keeps one look for one gesture. */
                <div className="vt-qr" role="dialog" aria-label="Show this to staff">
                    <div className="vt-qr-card">
                        <span className="vt-qr-eyebrow">Show this to staff</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {qr.img ? <img src={qr.img} alt="" width={260} height={260} /> : null}
                        <p>They&rsquo;ll scan it to pull up this order.</p>
                        <button type="button" onClick={() => setQr(null)}>Done</button>
                    </div>
                </div>
            ) : null}
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
