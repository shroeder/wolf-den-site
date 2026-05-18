"use client";

import { useEffect, useState } from "react";

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
});

const formatCurrency = (value) => currencyFormatter.format(Number(value || 0));
const formatDate = (value) => (value ? dateFormatter.format(new Date(value)) : "-");
const getRowKey = (item) => `${item.name}-${item.imageUrl || "no-image"}`;

const loadJson = async (url) => {
    const response = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
    });

    if (response.status === 401) {
        const error = new Error("Unauthorized");
        error.status = 401;
        throw error;
    }

    if (!response.ok) {
        throw new Error("Request failed");
    }

    return response.json();
};

export default function ConsignmentPortalClient({ slug, displayName, consignmentRate, initialAuthenticated }) {
    const [password, setPassword] = useState("");
    const [inventory, setInventory] = useState([]);
    const [sales, setSales] = useState([]);
    const [payouts, setPayouts] = useState([]);
    const [summary, setSummary] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);
    const [isLoading, setIsLoading] = useState(initialAuthenticated);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSavingPreferences, setIsSavingPreferences] = useState(false);
    const [nightlyReportsEnabled, setNightlyReportsEnabled] = useState(true);
    const [error, setError] = useState("");

    const totalRevenue = Number(summary?.totalRevenue ?? sales.reduce((sum, entry) => sum + Number(entry.revenue || 0), 0));
    const totalRefunds = Number(summary?.totalRefunds ?? sales.reduce((sum, entry) => sum + Number(entry.refundedRevenue || 0), 0));
    const resolvedRate = Number(summary?.payoutRate ?? consignmentRate);
    const totalPaid = Number(summary?.totalPaid ?? payouts.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
    const estimatedPayout = Number(summary?.estimatedPayout ?? Math.max(0, totalRevenue * resolvedRate - totalPaid));
    const totalUnitsInStock = Number(summary?.unitsInStock ?? inventory.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0));

    useEffect(() => {
        if (!initialAuthenticated) {
            return;
        }

        let active = true;

        const loadDashboard = async () => {
            setIsLoading(true);
            setError("");

            try {
                const dashboard = await loadJson("/api/consignment/dashboard");

                if (!active) {
                    return;
                }

                setInventory(Array.isArray(dashboard?.inventory) ? dashboard.inventory : []);
                setSales(Array.isArray(dashboard?.sales) ? dashboard.sales : []);
                setPayouts(Array.isArray(dashboard?.payouts) ? dashboard.payouts : []);
                setSummary(dashboard?.summary || null);
                setNightlyReportsEnabled(Boolean(dashboard?.consignor?.nightlyReportsEnabled ?? true));
                setIsAuthenticated(true);
            } catch (fetchError) {
                if (!active) {
                    return;
                }

                if (fetchError.status === 401) {
                    setIsAuthenticated(false);
                    setInventory([]);
                    setSales([]);
                    setPayouts([]);
                    setSummary(null);
                    setNightlyReportsEnabled(true);
                } else {
                    setError("Unable to load portal data right now.");
                }
            } finally {
                if (active) {
                    setIsLoading(false);
                }
            }
        };

        loadDashboard();

        return () => {
            active = false;
        };
    }, [initialAuthenticated]);

    const handleSignIn = async (event) => {
        event.preventDefault();
        setIsSubmitting(true);
        setError("");

        try {
            const response = await fetch("/api/consignment/auth", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "same-origin",
                body: JSON.stringify({ slug, password }),
            });

            if (response.status === 401) {
                setError("Incorrect password.");
                return;
            }

            if (!response.ok) {
                throw new Error("Auth failed");
            }

            setPassword("");
            setIsLoading(true);

            const dashboard = await loadJson("/api/consignment/dashboard");

            setInventory(Array.isArray(dashboard?.inventory) ? dashboard.inventory : []);
            setSales(Array.isArray(dashboard?.sales) ? dashboard.sales : []);
            setPayouts(Array.isArray(dashboard?.payouts) ? dashboard.payouts : []);
            setSummary(dashboard?.summary || null);
            setNightlyReportsEnabled(Boolean(dashboard?.consignor?.nightlyReportsEnabled ?? true));
            setIsAuthenticated(true);
        } catch {
            setError("Unable to sign in right now.");
        } finally {
            setIsSubmitting(false);
            setIsLoading(false);
        }
    };

    const handleNightlyReportsToggle = async (event) => {
        const nextValue = event.target.checked;

        setIsSavingPreferences(true);
        setError("");

        try {
            const response = await fetch("/api/consignment/preferences", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "same-origin",
                body: JSON.stringify({ nightlyReportsEnabled: nextValue }),
            });

            if (!response.ok) {
                throw new Error("preferences_failed");
            }

            const payload = await response.json();

            setNightlyReportsEnabled(Boolean(payload?.nightlyReportsEnabled));
        } catch {
            setError("Unable to update email report preference right now.");
        } finally {
            setIsSavingPreferences(false);
        }
    };

    return (
        <div className="consignment-portal stack compact">
            <section className="consignment-hero card reveal">
                <p className="eyebrow">Consignment Portal</p>
                <h1>{displayName}</h1>
                <p className="lead consignment-lead">
                    View live inventory, sold items, revenue totals, and estimated payout.
                </p>
            </section>

            {!isAuthenticated ? (
                <section className="card consignment-auth">
                    <h2>Portal Sign In</h2>
                    <p className="secondary">Enter the password for this consignor portal. Access stays scoped to {displayName} on the server.</p>
                    <form className="consignment-auth-form" onSubmit={handleSignIn}>
                        <label htmlFor="consignment-password">Password</label>
                        <input
                            id="consignment-password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            required
                        />
                        <button className="button primary" type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Signing in..." : "Open Dashboard"}
                        </button>
                    </form>
                    {error ? <p className="consignment-error">{error}</p> : null}
                </section>
            ) : null}

            {isAuthenticated ? (
                <>
                    {error ? <p className="consignment-error">{error}</p> : null}

                    <section className="grid three-col">
                        <article className="card consignment-stat">
                            <span className="consignment-stat-label">Net Revenue</span>
                            <strong>{formatCurrency(totalRevenue)}</strong>
                        </article>
                        <article className="card consignment-stat">
                            <span className="consignment-stat-label">Consignment Rate</span>
                            <strong>{Math.round(resolvedRate * 100)}%</strong>
                        </article>
                        <article className="card consignment-stat">
                            <span className="consignment-stat-label">Current Owed</span>
                            <strong>{formatCurrency(estimatedPayout)}</strong>
                        </article>
                    </section>

                    <section className="grid two-col">
                        <article className="card consignment-stat">
                            <span className="consignment-stat-label">Estimated Payout (Gross)</span>
                            <strong>{formatCurrency(summary?.estimatedPayoutGross ?? totalRevenue * resolvedRate)}</strong>
                        </article>
                        <article className="card consignment-stat">
                            <span className="consignment-stat-label">Paid Out To Date</span>
                            <strong>{formatCurrency(totalPaid)}</strong>
                        </article>
                    </section>

                    {totalRefunds > 0 ? (
                        <section className="grid two-col">
                            <article className="card consignment-stat">
                                <span className="consignment-stat-label">Gross Revenue</span>
                                <strong>{formatCurrency((summary?.totalGrossRevenue ?? totalRevenue + totalRefunds))}</strong>
                            </article>
                            <article className="card consignment-stat">
                                <span className="consignment-stat-label">Refunds / Returns</span>
                                <strong>−{formatCurrency(totalRefunds)}</strong>
                            </article>
                        </section>
                    ) : null}

                    <section className="grid two-col">
                        <article className="card consignment-stat">
                            <span className="consignment-stat-label">Catalog Items</span>
                            <strong>{inventory.length}</strong>
                        </article>
                        <article className="card consignment-stat">
                            <span className="consignment-stat-label">Units In Stock</span>
                            <strong>{totalUnitsInStock}</strong>
                        </article>
                    </section>

                    <section className="card consignment-preferences">
                        <h2>Email Reports</h2>
                        <p className="secondary">Receive a nightly email with items sold that day and your currently owed amount.</p>
                        <label className="consignment-toggle-row" htmlFor="nightly-reports-enabled">
                            <span>Nightly consignment email report</span>
                            <input
                                id="nightly-reports-enabled"
                                type="checkbox"
                                checked={nightlyReportsEnabled}
                                onChange={handleNightlyReportsToggle}
                                disabled={isSavingPreferences}
                            />
                        </label>
                    </section>

                    <section className="card consignment-table-card">
                        <div className="consignment-section-heading">
                            <div>
                                <h2>Payout History</h2>
                                <p className="secondary">Manual payouts and branded receipts are stored here for recall.</p>
                            </div>
                        </div>
                        <div className="consignment-table-wrap consignment-table-scroll">
                            <table className="consignment-table">
                                <thead>
                                    <tr>
                                        <th>Paid At</th>
                                        <th>Amount</th>
                                        <th>Method</th>
                                        <th>Receipt</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payouts.length ? payouts.map((entry) => (
                                        <tr key={entry.id}>
                                            <td>{formatDate(entry.paidAt)}</td>
                                            <td>{formatCurrency(entry.amount)}</td>
                                            <td>{entry.paymentMethod || "manual"}</td>
                                            <td>
                                                <a className="button ghost consignment-receipt-link" href={`/api/consignment/payouts/${entry.id}/receipt`} target="_blank" rel="noreferrer">
                                                    View Receipt
                                                </a>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan="4" className="consignment-empty">No payouts recorded yet.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="card consignment-table-card">
                        <div className="consignment-section-heading">
                            <div>
                                <h2>Sales</h2>
                                <p className="secondary">Completed orders from the configured lookback window, filtered server-side to this consignor’s items only.</p>
                            </div>
                        </div>
                        <div className="consignment-table-wrap consignment-table-scroll">
                            <table className="consignment-table">
                                <thead>
                                    <tr>
                                        <th>Image</th>
                                        <th>Name</th>
                                        <th>Qty Sold</th>
                                        {sales.some((item) => item.quantityReturned > 0) ? <th>Qty Returned</th> : null}
                                        <th>Net Revenue</th>
                                        <th>Last Sold</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sales.length ? sales.map((item) => (
                                        <tr key={`${getRowKey(item)}-${item.lastSoldAt || "never"}`}>
                                            <td>
                                                {item.imageUrl ? (
                                                    <img
                                                        className="consignment-item-thumb"
                                                        src={item.imageUrl}
                                                        alt={item.name}
                                                        loading="lazy"
                                                        width="44"
                                                        height="44"
                                                    />
                                                ) : (
                                                    <div className="consignment-item-thumb consignment-item-thumb-placeholder" aria-hidden="true" />
                                                )}
                                            </td>
                                            <td>{item.name}</td>
                                            <td>{item.quantitySold}</td>
                                            {sales.some((s) => s.quantityReturned > 0) ? <td>{item.quantityReturned || 0}</td> : null}
                                            <td>{formatCurrency(item.revenue)}</td>
                                            <td>{formatDate(item.lastSoldAt)}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={sales.some((item) => item.quantityReturned > 0) ? 6 : 5} className="consignment-empty">
                                                No completed sales found in the current lookback window.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="card consignment-table-card">
                        <div className="consignment-section-heading">
                            <div>
                                <h2>Inventory</h2>
                                <p className="secondary">Current Square catalog items assigned to this consignor category.</p>
                            </div>
                            {isLoading ? <span className="secondary">Refreshing...</span> : null}
                        </div>
                        <div className="consignment-table-wrap consignment-table-scroll">
                            <table className="consignment-table">
                                <thead>
                                    <tr>
                                        <th>Image</th>
                                        <th>Name</th>
                                        <th>Price</th>
                                        <th>Qty In Stock</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inventory.length ? inventory.map((item) => (
                                        <tr key={`${getRowKey(item)}-${item.price}`}>
                                            <td>
                                                {item.imageUrl ? (
                                                    <img
                                                        className="consignment-item-thumb"
                                                        src={item.imageUrl}
                                                        alt={item.name}
                                                        loading="lazy"
                                                        width="44"
                                                        height="44"
                                                    />
                                                ) : (
                                                    <div className="consignment-item-thumb consignment-item-thumb-placeholder" aria-hidden="true" />
                                                )}
                                            </td>
                                            <td>{item.name}</td>
                                            <td>{formatCurrency(item.price)}</td>
                                            <td>{item.quantity}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan="4" className="consignment-empty">No inventory found for this consignor.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            ) : null}
        </div>
    );
}