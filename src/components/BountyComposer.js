"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BOUNTY_TYPES, MIN_BOUNTY } from "@/lib/marketplace/bounty-types";

const ERR = {
    bad_type: "Pick a bounty type.",
    title_required: "Add a short title.",
    bad_amount: `Bounty must be at least ${MIN_BOUNTY} gold.`,
    not_enough_gold: "You don't have enough gold for that.",
    create_failed: "Something went wrong — try again.",
    not_signed_in: "Sign in to post a bounty.",
};

// Create-a-bounty form: type, title, description, images, gold amount, and solo/group mode. Reserves the
// gold on submit.
export default function BountyComposer({ gold = 0 }) {
    const router = useRouter();
    const [type, setType] = useState("");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [mode, setMode] = useState("single");
    const [amount, setAmount] = useState("");
    const [images, setImages] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    async function onFile(e) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (images.length >= 6) { setErr("Up to 6 images."); return; }
        setUploading(true);
        setErr(null);
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch("/api/marketplace/bounties/image", { method: "POST", body: fd }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (r?.ok && d?.url) setImages((prev) => [...prev, d.url]);
        else setErr(d?.error || "Upload failed.");
        setUploading(false);
    }

    async function submit(e) {
        e.preventDefault();
        setErr(null);
        const amt = Math.floor(Number(amount) || 0);
        if (!type) return setErr("Pick a bounty type.");
        if (!title.trim()) return setErr("Add a short title.");
        if (amt < MIN_BOUNTY) return setErr(`Bounty must be at least ${MIN_BOUNTY} gold.`);
        if (gold != null && amt > gold) return setErr("You don't have that much gold.");
        setBusy(true);
        const r = await fetch("/api/marketplace/bounties", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ type, title: title.trim(), description: description.trim() || null, images, rewardGold: amt, mode }),
        }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        setBusy(false);
        if (r?.ok && d?.ok && d.id) { router.push(`/marketplace/bounties/${d.id}`); return; }
        setErr(ERR[d?.error] || "Couldn't post the bounty.");
    }

    const amt = Math.floor(Number(amount) || 0);
    return (
        <section className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <h1 style={{ margin: 0 }}>🎯 Post a bounty</h1>
                <Link href="/marketplace/bounties" className="pill">← Board</Link>
            </div>
            <p className="muted" style={{ marginTop: 4 }}>Attach your gold — it&apos;s reserved until you complete the bounty (paid to your helper) or take it down (refunded). Expires in 14 days.</p>

            <form onSubmit={submit} className="stack" style={{ gap: 14, marginTop: 8 }}>
                <div>
                    <label className="bounty-field-label">Type</label>
                    <div className="bounty-type-grid">
                        {BOUNTY_TYPES.map((t) => (
                            <button type="button" key={t.id} className={`bounty-type-chip${type === t.id ? " is-selected" : ""}`} onClick={() => setType(t.id)} title={t.blurb}>
                                <span aria-hidden="true">{t.icon}</span> {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="bounty-field-label" htmlFor="b-title">Title</label>
                    <input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Teach me Lorcana this week" maxLength={120} required />
                </div>

                <div>
                    <label className="bounty-field-label" htmlFor="b-desc">Details <span className="muted">(optional)</span></label>
                    <textarea id="b-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What do you need? When / where works? Any specifics?" rows={4} maxLength={2000} />
                </div>

                <div>
                    <label className="bounty-field-label">Photos <span className="muted">(optional, up to 6)</span></label>
                    <div className="bounty-image-row">
                        {images.map((url, i) => (
                            <div key={url} className="bounty-image-thumb">
                                <img src={url} alt="" />
                                <button type="button" aria-label="Remove" onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}>×</button>
                            </div>
                        ))}
                        {images.length < 6 ? (
                            <label className="bounty-image-add">
                                {uploading ? "…" : "+ Add"}
                                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} disabled={uploading} hidden />
                            </label>
                        ) : null}
                    </div>
                </div>

                <div>
                    <label className="bounty-field-label">Who can fulfill it?</label>
                    <div className="bounty-mode-toggle">
                        <button type="button" className={`bounty-mode-opt${mode === "single" ? " is-selected" : ""}`} onClick={() => setMode("single")}>
                            🙋 One person <span className="muted">— a single helper gets the whole reward</span>
                        </button>
                        <button type="button" className={`bounty-mode-opt${mode === "group" ? " is-selected" : ""}`} onClick={() => setMode("group")}>
                            👥 A group <span className="muted">— reward splits between everyone who helped</span>
                        </button>
                    </div>
                </div>

                <div>
                    <label className="bounty-field-label" htmlFor="b-amt">Reward (your gold)</label>
                    <input id="b-amt" type="number" inputMode="numeric" min={MIN_BOUNTY} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`${MIN_BOUNTY}+`} />
                    <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.8rem" }}>
                        💰 You have {gold.toLocaleString()} gold{amt > 0 ? ` · reserving ${amt.toLocaleString()}` : ""}.
                    </p>
                </div>

                {err ? <p style={{ color: "#e66", margin: 0 }}>{err}</p> : null}
                <button type="submit" className="btn-gold" disabled={busy || uploading} style={{ width: "100%" }}>
                    {busy ? "Posting…" : `Post bounty${amt >= MIN_BOUNTY ? ` · reserve 💰 ${amt.toLocaleString()}` : ""}`}
                </button>
            </form>
        </section>
    );
}
