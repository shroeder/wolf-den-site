import { ImageResponse } from "next/og";

import { db } from "@/lib/db";
import { getPublicProfileByAlias } from "@/lib/marketplace/profile.js";

// Dynamic share card for a public member profile — the "hero card" rendered as a 1200×630 image so a
// shared profile link (Discord / iMessage / X) shows a rich, on-brand preview instead of a bare URL.
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Wolf Den member card";

const GOLD = "#d4af37";
const BG = "#0e0e13";

// Only a real raster sprite (PNG) renders reliably in Satori; DiceBear SVGs / data URIs don't, so we fall
// back to a gold monogram when there's no sprite.
function usableSprite(url) {
    if (!url || typeof url !== "string") return null;
    if (!/^https?:\/\//i.test(url)) return null;
    if (/\.svg(\?|$)/i.test(url)) return null;
    return url;
}

export default async function Image({ params }) {
    const { alias } = await params;
    const profile = await getPublicProfileByAlias(alias).catch(() => null);

    if (!profile) {
        return new ImageResponse(
            (
                <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: BG, color: "#fff", fontSize: 60, fontWeight: 800 }}>
                    <div style={{ display: "flex", color: GOLD, fontSize: 34, letterSpacing: 6 }}>🐺 THE WOLF DEN</div>
                    <div style={{ display: "flex", marginTop: 18 }}>Marketplace</div>
                </div>
            ),
            { ...size }
        );
    }

    const spriteRow = await db.queryOne(`SELECT avatar_sprite_url, avatar_sprite_flip FROM mkt_buyer WHERE id = $1`, [profile.id]).catch(() => null);
    const sprite = usableSprite(spriteRow?.avatar_sprite_url);
    const spriteFlip = sprite ? spriteRow?.avatar_sprite_flip === true : false;
    const name = profile.displayLabel || "Member";
    const handle = profile.alias ? `@${profile.alias}` : "";
    const lvl = profile.level?.level ?? profile.level ?? 1;
    const badges = (profile.displayBadges || profile.badges || []).slice(0, 3);
    const initial = (name || "?").slice(0, 1).toUpperCase();

    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    background: `radial-gradient(1200px 600px at 80% -10%, #241d0a 0%, ${BG} 55%)`,
                    color: "#fff",
                    padding: 64,
                    fontFamily: "sans-serif",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", color: GOLD, fontSize: 32, fontWeight: 800, letterSpacing: 6 }}>
                    🐺 THE WOLF DEN
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
                    <div
                        style={{
                            width: 260,
                            height: 260,
                            borderRadius: 32,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                            border: `6px solid ${GOLD}`,
                            background: "linear-gradient(135deg, #2a2a33, #15151b)",
                            boxShadow: "0 0 60px rgba(212,175,55,0.35)",
                            flexShrink: 0,
                        }}
                    >
                        {sprite ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={sprite} width={260} height={260} style={{ objectFit: "cover", transform: spriteFlip ? "scaleX(-1)" : undefined }} alt="" />
                        ) : (
                            <div style={{ display: "flex", fontSize: 150, fontWeight: 900, color: GOLD }}>{initial}</div>
                        )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                        <div style={{ display: "flex", fontSize: 76, fontWeight: 900, lineHeight: 1.05 }}>{name}</div>
                        {handle ? <div style={{ display: "flex", fontSize: 38, color: "#9aa4b2", marginTop: 6 }}>{handle}</div> : null}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                marginTop: 24,
                                alignSelf: "flex-start",
                                background: GOLD,
                                color: "#161616",
                                fontSize: 34,
                                fontWeight: 900,
                                padding: "10px 26px",
                                borderRadius: 999,
                                letterSpacing: 2,
                            }}
                        >
                            LEVEL {lvl}
                        </div>
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: 16 }}>
                        {badges.length
                            ? badges.map((b) => (
                                  <div
                                      key={b.slug}
                                      style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 12,
                                          background: "rgba(255,255,255,0.06)",
                                          border: `2px solid ${b.color || GOLD}`,
                                          borderRadius: 16,
                                          padding: "10px 20px",
                                          fontSize: 30,
                                          fontWeight: 700,
                                      }}
                                  >
                                      <span style={{ fontSize: 34 }}>{b.icon || "🏅"}</span>
                                      <span>{b.label}</span>
                                  </div>
                              ))
                            : <div style={{ display: "flex", fontSize: 30, color: "#9aa4b2" }}>A member of the pack</div>}
                    </div>
                    <div style={{ display: "flex", fontSize: 28, color: "#9aa4b2" }}>wolfdengamingmn.com</div>
                </div>
            </div>
        ),
        { ...size }
    );
}
