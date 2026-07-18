"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { FNM_EVENTLINK_URL, GAMES } from "@/lib/marketplace/games.js";

// Two-in-one onboarding + targeted CTA on the profile hub:
//  1. If the member hasn't said what they play yet, show a tasteful "What do you play?" chip picker.
//  2. Once they've answered (or already had) Magic, show the Friday Night Magic sign-up CTA — the whole
//     point: registering in the Companion app builds the store's standing with Wizards for future allocations.
// Shows nothing for members who play other games (targeted) or who dismissed the FNM CTA.
export default function GameInterestsCta({ interests = null, fnmDismissed = false }) {
    const router = useRouter();
    const answered = Array.isArray(interests);
    const [picked, setPicked] = useState(() => new Set(interests || []));
    const [mode, setMode] = useState(answered ? "cta" : "ask"); // "ask" | "cta" | "done"
    const [dismissed, setDismissed] = useState(fnmDismissed);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const playsMagic = picked.has("magic");

    function toggle(id) {
        setPicked((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    async function save() {
        if (busy) return;
        setBusy(true);
        setErr("");
        try {
            const r = await fetch("/api/marketplace/game-interests", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ interests: [...picked] }),
            });
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                setErr(d?.error || "Couldn't save.");
                return;
            }
            setMode(picked.has("magic") ? "cta" : "done");
            router.refresh();
        } catch {
            setErr("Couldn't save.");
        } finally {
            setBusy(false);
        }
    }

    async function dismissFnm() {
        setDismissed(true);
        try {
            await fetch("/api/marketplace/game-interests", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ dismissFnm: true }),
            });
            router.refresh();
        } catch {
            /* best-effort */
        }
    }

    // --- Onboarding chip picker ---
    if (mode === "ask") {
        return (
            <section className="card game-ask">
                <h2 style={{ marginTop: 0 }}>🎮 What do you play?</h2>
                <p className="muted" style={{ marginTop: 0 }}>Pick your games so we can point you to the right events and drops.</p>
                <div className="game-chips">
                    {GAMES.map((g) => {
                        const on = picked.has(g.id);
                        return (
                            <button type="button" key={g.id} onClick={() => toggle(g.id)} className={`game-chip${on ? " is-on" : ""}`} aria-pressed={on}>
                                <span aria-hidden="true">{g.emoji}</span> {g.label}
                            </button>
                        );
                    })}
                </div>
                {err ? <p style={{ color: "#ff6b6b", fontSize: "0.85rem" }}>{err}</p> : null}
                <div className="game-ask-actions">
                    <button type="button" className="button primary" onClick={save} disabled={busy || picked.size === 0}>
                        {busy ? "Saving…" : "Save"}
                    </button>
                    <button type="button" className="pill" onClick={save} disabled={busy}>Skip</button>
                </div>
            </section>
        );
    }

    // --- Friday Night Magic sign-up CTA (Magic players only) ---
    if (mode === "cta" && playsMagic && !dismissed) {
        return (
            <section className="card fnm-cta">
                <button type="button" className="fnm-cta-dismiss" onClick={dismissFnm} aria-label="Dismiss">×</button>
                <div className="fnm-cta-body">
                    <span className="fnm-cta-eyebrow">🔵 Friday Night Magic</span>
                    <h2 style={{ margin: "2px 0 4px" }}>Playing this Friday? Register your seat.</h2>
                    <p className="muted" style={{ margin: "0 0 12px" }}>
                        Sign up in the Wizards Companion app so we can plan the night — and every registration helps The Wolf Den
                        earn better product allocations from Wizards. Two minutes, big help. 🐺
                    </p>
                    <a href={FNM_EVENTLINK_URL} target="_blank" rel="noreferrer" className="button primary">
                        Register in the Companion app →
                    </a>
                </div>
            </section>
        );
    }

    return null;
}
