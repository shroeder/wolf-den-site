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
    const [summary, setSummary] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);
    const [isLoading, setIsLoading] = useState(initialAuthenticated);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");

    const totalRevenue = Number(summary?.totalRevenue ?? sales.reduce((sum, entry) => sum + Number(entry.revenue || 0), 0));
    const totalRefunds = Number(summary?.totalRefunds ?? sales.reduce((sum, entry) => sum + Number(entry.refundedRevenue || 0), 0));
    const resolvedRate = Number(summary?.payoutRate ?? consignmentRate);
    const estimatedPayout = Number(summary?.estimatedPayout ?? totalRevenue * resolvedRate);
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
                setSummary(dashboard?.summary || null);
                setIsAuthenticated(true);
            } catch (fetchError) {
                if (!active) {
                    return;
                }

                if (fetchError.status === 401) {
                    setIsAuthenticated(false);
                    setInventory([]);
                    setSales([]);
                    setSummary(null);
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
            setSummary(dashboard?.summary || null);
            setIsAuthenticated(true);
        } catch {
            setError("Unable to sign in right now.");
        } finally {
            setIsSubmitting(false);
            setIsLoading(false);
        }
    };

    return (
        <div className="consignment-portal stack compact">
            <section className="consignment-hero card reveal">
                <p className="eyebrow">Consignment Portal</p>
                <h1>{displayName}</h1>
                <p className="lead consignment-lead">
                    View live inventory, sold items, revenue totals, and estimated payout without exposing Square data or dashboard access.
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
                            <span className="consignment-stat-label">Estimated Payout</span>
                            <strong>{formatCurrency(estimatedPayout)}</strong>
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

                    <section className="card consignment-table-card">
                        <div className="consignment-section-heading">
                            <div>
                                <h2>Inventory</h2>
                                <p className="secondary">Current Square catalog items assigned to this consignor category.</p>
                            </div>
                            {isLoading ? <span className="secondary">Refreshing...</span> : null}
                        </div>
                        <div className="consignment-table-wrap">
                            <table className="consignment-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Price</th>
                                        <th>Qty In Stock</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inventory.length ? inventory.map((item) => (
                                        <tr key={`${item.name}-${item.price}`}>
                                            <td>{item.name}</td>
                                            <td>{formatCurrency(item.price)}</td>
                                            <td>{item.quantity}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan="3" className="consignment-empty">No inventory found for this consignor.</td>
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
                        <div className="consignment-table-wrap">
                            <table className="consignment-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Qty Sold</th>
                                        {sales.some((item) => item.quantityReturned > 0) ? <th>Qty Returned</th> : null}
                                        <th>Net Revenue</th>
                                        <th>Last Sold</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sales.length ? sales.map((item) => (
                                        <tr key={`${item.name}-${item.lastSoldAt || "never"}`}>
                                            <td>{item.name}</td>
                                            <td>{item.quantitySold}</td>
                                            {sales.some((s) => s.quantityReturned > 0) ? <td>{item.quantityReturned || 0}</td> : null}
                                            <td>{formatCurrency(item.revenue)}</td>
                                            <td>{formatDate(item.lastSoldAt)}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan="4" className="consignment-empty">No completed sales found in the current lookback window.</td>
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