"use client";

import { useState } from "react";

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const MAX_PREVIEW_ROWS = 100;

function formatPrice(value) {
    return value === null || value === undefined ? "—" : priceFormatter.format(Number(value));
}

export default function VendorImportClient({ onImported }) {
    const [csv, setCsv] = useState("");
    const [fileName, setFileName] = useState("");
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState(null);

    function onFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        setResult(null);
        setPreview(null);

        const reader = new FileReader();
        reader.onload = () => setCsv(String(reader.result || ""));
        reader.readAsText(file);
    }

    async function runPreview() {
        setLoading(true);
        setError("");
        setResult(null);

        try {
            const response = await fetch("/api/marketplace/vendor/import/preview", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ csv }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || "Could not read that file.");
            }

            setPreview(data);
        } catch (err) {
            setError(err?.message || "Could not read that file.");
        } finally {
            setLoading(false);
        }
    }

    async function commit() {
        if (!preview) return;
        const rows = preview.rows.filter((r) => r.matchType !== "skip");
        if (rows.length === 0) return;

        setCommitting(true);
        setError("");

        try {
            const response = await fetch("/api/marketplace/vendor/import/commit", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ rows }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || "Import failed.");
            }

            setResult(data);
            setPreview(null);
            setCsv("");
            setFileName("");
            onImported();
        } catch (err) {
            setError(err?.message || "Import failed.");
        } finally {
            setCommitting(false);
        }
    }

    const importable = preview ? preview.rows.filter((r) => r.matchType !== "skip") : [];
    const skipped = preview ? preview.rows.filter((r) => r.matchType === "skip") : [];

    return (
        <div className="mkt-import">
            <p className="muted">
                Upload a TCGplayer seller export (CSV). We match each row to the catalog by its TCGplayer Id — you
                set the prices in the file.
            </p>

            <div className="mkt-import-controls">
                <input type="file" accept=".csv,text/csv" onChange={onFile} />
                {fileName ? <span className="mkt-offer-meta">{fileName}</span> : null}
                <button type="button" className="button primary" onClick={runPreview} disabled={loading || !csv.trim()}>
                    {loading ? "Reading..." : "Preview"}
                </button>
            </div>

            <details className="mkt-import-paste">
                <summary>…or paste CSV text</summary>
                <textarea
                    rows={5}
                    value={csv}
                    onChange={(e) => {
                        setCsv(e.target.value);
                        setFileName("");
                    }}
                    placeholder="Paste the CSV contents here"
                />
            </details>

            {error ? <p className="muted">{error}</p> : null}

            {result ? (
                <p className="statement-copy">
                    Imported {result.created} listing{result.created === 1 ? "" : "s"}
                    {result.failed ? ` (${result.failed} skipped)` : ""}.
                </p>
            ) : null}

            {preview ? (
                <div className="mkt-import-preview">
                    <p>
                        <strong>{preview.summary.importable}</strong> importable
                        {" "}({preview.summary.inCatalog} matched to catalog, {preview.summary.snapshot} as-is)
                        {preview.summary.skipped ? `, ${preview.summary.skipped} skipped` : ""}.
                    </p>

                    {importable.length > 0 ? (
                        <button type="button" className="button primary" onClick={commit} disabled={committing}>
                            {committing ? "Importing..." : `Import ${importable.length} listing${importable.length === 1 ? "" : "s"}`}
                        </button>
                    ) : null}

                    <ul className="mkt-admin-list mkt-import-list">
                        {importable.slice(0, MAX_PREVIEW_ROWS).map((r) => (
                            <li key={r.index} className="mkt-admin-row">
                                <div className="mkt-admin-info">
                                    <strong>{r.title}</strong>
                                    <span className="mkt-offer-meta">
                                        {r.kind}
                                        {r.condition ? ` · ${r.condition}` : ""}
                                        {r.setName ? ` · ${r.setName}` : ""}
                                        {r.matchType === "snapshot" ? " · not in catalog" : ""}
                                    </span>
                                </div>
                                <span className="mkt-offer-meta">
                                    {formatPrice(r.price)} · ×{r.quantity}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {importable.length > MAX_PREVIEW_ROWS ? (
                        <p className="muted">…and {importable.length - MAX_PREVIEW_ROWS} more will import too.</p>
                    ) : null}

                    {skipped.length > 0 ? (
                        <details className="mkt-import-skipped">
                            <summary>{skipped.length} row(s) skipped</summary>
                            <ul className="mkt-admin-list">
                                {skipped.slice(0, MAX_PREVIEW_ROWS).map((r) => (
                                    <li key={r.index} className="mkt-admin-row">
                                        <div className="mkt-admin-info">
                                            <strong>{r.title || "(no name)"}</strong>
                                            <span className="muted">{r.reasons.join(", ")}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
