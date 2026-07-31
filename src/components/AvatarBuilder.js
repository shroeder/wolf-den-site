"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import ThemedSelect from "@/components/ThemedSelect";
import {
    ACCESSORIES,
    AVATAR_FIELDS,
    BACKGROUND_COLORS,
    CLOTHES_COLORS,
    CLOTHINGS,
    CLOTHING_GRAPHICS,
    DEFAULT_AVATAR,
    EYEBROWS,
    EYES,
    FACIAL_HAIR,
    FACIAL_HAIR_COLORS,
    HAIR_COLORS,
    MOUTHS,
    SKIN_COLORS,
    avatarUrlFor,
    humanizeAvatarLabel,
} from "@/lib/marketplace/avatar-options.js";

const SELECTS = [
    { field: "top", label: "Hair / Hat", values: AVATAR_FIELDS.top },
    { field: "clothing", label: "Outfit", values: CLOTHINGS },
    { field: "clothingGraphic", label: "Shirt design", values: CLOTHING_GRAPHICS },
    { field: "eyes", label: "Eyes", values: EYES },
    { field: "eyebrows", label: "Eyebrows", values: EYEBROWS },
    { field: "mouth", label: "Mouth", values: MOUTHS },
    { field: "facialHair", label: "Facial hair", values: FACIAL_HAIR },
    { field: "accessories", label: "Glasses", values: ACCESSORIES },
];
const SWATCHES = [
    { field: "skinColor", label: "Skin", values: SKIN_COLORS },
    { field: "hairColor", label: "Hair color", values: HAIR_COLORS },
    { field: "facialHairColor", label: "Beard color", values: FACIAL_HAIR_COLORS },
    { field: "hatColor", label: "Hat color", values: CLOTHES_COLORS },
    { field: "clothesColor", label: "Outfit color", values: CLOTHES_COLORS },
    { field: "accessoriesColor", label: "Glasses color", values: CLOTHES_COLORS },
    { field: "backgroundColor", label: "Background", values: BACKGROUND_COLORS },
];

function randomAvatar() {
    const cfg = {};
    for (const [field, values] of Object.entries(AVATAR_FIELDS)) {
        cfg[field] = values[Math.floor(Math.random() * values.length)];
    }
    return cfg;
}

// Quick starting looks so it's obvious you're not stuck as one gender. These just set hair/clothing/face
// as a jumping-off point — every field is still fully customizable afterward.
const FEM_HAIR = ["bob", "bun", "curly", "curvy", "straight01", "straight02", "straightAndStrand", "longButNotTooLong", "miaWallace", "bigHair", "frida"];
const MASC_HAIR = ["shortFlat", "shortRound", "shortWaved", "shortCurly", "theCaesar", "theCaesarAndSidePart", "sides", "shavedSides", "fro", "frizzle", "shaggy", "shaggyMullet"];
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
function presetLook(kind) {
    if (kind === "fem") {
        return { top: pickOne(FEM_HAIR), facialHair: "none", eyebrows: "defaultNatural", clothing: pickOne(["shirtScoopNeck", "shirtVNeck", "collarAndSweater", "blazerAndShirt"]) };
    }
    return { top: pickOne(MASC_HAIR), facialHair: pickOne(["none", "none", "beardLight", "beardMedium", "moustacheFancy"]), eyebrows: "default", clothing: pickOne(["shirtCrewNeck", "hoodie", "blazerAndShirt", "collarAndSweater"]) };
}

// Build your "vanilla" avatar (base identity — skin, hair, face, basic clothes). Live preview renders via
// our own /api/marketplace/avatar route. Save stores the config (the build-your-own avatar is the only path).
// The illustrated hero SPRITE is drawn free the first time and costs gold to redraw after that — see
// buyHeroRedraw. Saving the avatar itself is always free.
export default function AvatarBuilder({ current = null }) {
    const router = useRouter();
    const [config, setConfig] = useState(() => ({ ...DEFAULT_AVATAR, ...(current || {}) }));
    const [busy, setBusy] = useState(false);
    // What a redraw would cost right now. Fetched once — the price only moves when you buy one.
    const [quote, setQuote] = useState(null);
    useEffect(() => {
        let alive = true;
        fetch("/api/marketplace/avatar", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "redrawQuote" }),
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (alive && d && !d.error) setQuote(d); })
            .catch(() => { /* the button just stays hidden */ });
        return () => { alive = false; };
    }, []);

    const redraw = async () => {
        if (busy) return;
        setBusy(true); setErr(null); setMsg(null);
        try {
            const r = await fetch("/api/marketplace/avatar", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "redraw" }),
            });
            const d = await r.json().catch(() => ({}));
            if (d?.ok) {
                setMsg("Hero redrawn.");
                setQuote((q) => (q ? { ...q, cost: d.nextCost ?? q.cost, gold: d.gold ?? q.gold, canAfford: (d.gold ?? 0) >= (d.nextCost ?? 0) } : q));
                try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* ok */ }
            } else {
                setErr(d?.error === "not_enough_gold" ? "Not enough gold for a redraw." : "Couldn't redraw right now.");
            }
        } catch { setErr("Couldn't redraw right now."); } finally { setBusy(false); }
    };

    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");
    // The site header is sticky+opaque, so a preview stuck at top:0 slides behind it and the avatar's head
    // gets clipped. Measure the header and stick the preview just below it (recompute on resize/rotate).
    const [headerH, setHeaderH] = useState(0);
    useEffect(() => {
        const measure = () => setHeaderH(document.querySelector(".site-header")?.offsetHeight || 0);
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, []);

    const previewUrl = useMemo(() => avatarUrlFor(config), [config]);

    function set(field, value) {
        setConfig((c) => ({ ...c, [field]: value }));
        setMsg("");
    }

    async function save(next, okMsg) {
        setBusy(true);
        setMsg("");
        setErr("");
        try {
            const r = await fetch("/api/marketplace/avatar", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ config: next }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || "Could not save your avatar.");
            setMsg(okMsg);
            router.refresh();
        } catch (e) {
            setErr(e?.message || "Could not save your avatar.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="avatar-builder">
            <div className="avatar-builder-preview" style={headerH ? { top: headerH + 8 } : undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="avatar-builder-img" src={previewUrl} alt="Avatar preview" width={140} height={140} />
                <div className="avatar-presets">
                    <span className="avatar-ctrl-label">Start from a look</span>
                    <div className="avatar-preset-row">
                        <button type="button" className="btn-ghost" onClick={() => setConfig((c) => ({ ...c, ...presetLook("fem") }))} disabled={busy}>♀ Feminine</button>
                        <button type="button" className="btn-ghost" onClick={() => setConfig((c) => ({ ...c, ...presetLook("masc") }))} disabled={busy}>♂ Masculine</button>
                        <button type="button" className="btn-ghost" onClick={() => setConfig(randomAvatar())} disabled={busy}>🎲 Surprise me</button>
                    </div>
                    <span className="muted" style={{ fontSize: "0.78rem" }}>Just a starting point — change any hair, face, or outfit below.</span>
                </div>
            </div>

            <div className="avatar-builder-controls">
                {SWATCHES.map(({ field, label, values }) => (
                    <div className="avatar-ctrl" key={field}>
                        <span className="avatar-ctrl-label">{label}</span>
                        <div className="avatar-swatches">
                            {values.map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    className={`avatar-swatch${config[field] === v ? " is-selected" : ""}${v === "none" ? " is-none" : ""}`}
                                    style={v === "none" ? undefined : { background: `#${v}` }}
                                    onClick={() => set(field, v)}
                                    aria-label={`${label}: ${v === "none" ? "None" : `#${v}`}`}
                                    aria-pressed={config[field] === v}
                                    title={v === "none" ? "None" : `#${v}`}
                                />
                            ))}
                        </div>
                    </div>
                ))}

                <div className="avatar-selects">
                    {SELECTS.map(({ field, label, values }) => (
                        <label className="avatar-ctrl" key={field}>
                            <span className="avatar-ctrl-label">{label}</span>
                            <ThemedSelect
                                block
                                value={config[field]}
                                onChange={(v) => set(field, v)}
                                ariaLabel={label}
                                options={values.map((v) => ({ value: v, label: humanizeAvatarLabel(v) }))}
                            />
                        </label>
                    ))}
                </div>
            </div>

            <div className="avatar-builder-actions">
                <button type="button" className="btn-gold" onClick={() => save(config, "Avatar saved.")} disabled={busy}>
                    {busy ? "Saving…" : "Save avatar"}
                </button>
                {/* Redrawing the hero SPRITE is a separate, paid action. Saving the avatar is free and always
                    was; what costs gold is having the illustrated hero re-rendered from it. That used to happen
                    on its own after any gear change, once a day, with nobody deciding it was worth doing. */}
                {quote && !quote.firstIsFree ? (
                    <button
                        type="button"
                        className="btn-ghost"
                        onClick={redraw}
                        disabled={busy || !quote.canAfford}
                        title={quote.canAfford ? "Re-render your hero sprite from the current avatar" : "Not enough gold"}
                    >
                        {busy ? "Drawing…" : `🎨 Redraw hero · 🪙 ${quote.cost.toLocaleString()}`}
                    </button>
                ) : null}
            </div>
            {quote && !quote.firstIsFree && !quote.canAfford ? (
                <p className="muted" style={{ marginTop: 6, fontSize: "0.8rem" }}>
                    You have 🪙 {quote.gold.toLocaleString()} — a redraw costs {quote.cost.toLocaleString()}.
                </p>
            ) : null}
            {quote?.firstIsFree ? (
                <p className="muted" style={{ marginTop: 6, fontSize: "0.8rem" }}>
                    Your first hero sprite is drawn free once you save.
                </p>
            ) : null}
            {msg ? <p className="shop-payment-success" style={{ marginTop: 8 }}>{msg}</p> : null}
            {err ? <p className="shop-payment-error" style={{ marginTop: 8 }}>{err}</p> : null}
        </div>
    );
}
