"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import BadgeArt from "@/components/BadgeArt";

// Badge pills for a member profile. Each pill is tappable: it opens a detail sheet showing the badge's
// art, what it's for / how it's earned (description), and WHEN this member earned it (awarded_at). The
// sheet is portaled to <body> so a transformed/overflow-clipped ancestor can't cut it off.
function earnedLabel(awardedAt) {
    if (!awardedAt) return null;
    const d = new Date(awardedAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });
}

export default function UserBadges({ badges }) {
    const [detail, setDetail] = useState(null);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!badges || badges.length === 0) return null;

    const earned = detail ? earnedLabel(detail.awarded_at) : null;

    return (
        <div className="user-badges">
            {badges.map((b) => (
                <button
                    type="button"
                    key={b.slug}
                    className="user-badge"
                    style={{ background: b.color || "#333" }}
                    title={b.description || b.label}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDetail(b); }}
                >
                    {b.icon ? (
                        <span className="user-badge-icon">
                            <BadgeArt slug={b.slug} icon={b.icon} />
                        </span>
                    ) : null}
                    {b.label}
                </button>
            ))}

            {mounted && detail
                ? createPortal(
                      <div
                          className="badge-sheet-overlay"
                          onClick={() => setDetail(null)}
                          role="presentation"
                          style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.72)", padding: "18px" }}
                      >
                          <div className="card badge-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340, width: "100%", textAlign: "center" }}>
                              <span className="badge-sheet-art" style={{ display: "inline-flex", width: 96, height: 96, borderRadius: 18, background: detail.color || "#333", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", boxShadow: "0 8px 22px rgba(0,0,0,0.5)" }}>
                                  {detail.icon ? <BadgeArt slug={detail.slug} icon={detail.icon} /> : null}
                              </span>
                              <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#f4e4bc" }}>{detail.label}</div>
                              {detail.description ? (
                                  <p className="muted" style={{ margin: "8px 0 0", lineHeight: 1.4 }}>{detail.description}</p>
                              ) : null}
                              <div className="badge-sheet-earned" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", fontSize: "0.85rem" }}>
                                  {earned ? <><span className="muted">Earned</span> <strong style={{ color: "#ffd75e" }}>{earned}</strong></> : <span className="muted">Earned badge</span>}
                              </div>
                              <button type="button" className="pill" style={{ marginTop: 16 }} onClick={() => setDetail(null)}>Close</button>
                          </div>
                      </div>,
                      document.body
                  )
                : null}
        </div>
    );
}
