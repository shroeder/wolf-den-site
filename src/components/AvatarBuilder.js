"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import ThemedSelect from "@/components/ThemedSelect";
import {
    ACCESSORIES,
    AVATAR_FIELDS,
    BACKGROUND_COLORS,
    CLOTHES_COLORS,
    CLOTHINGS,
    DEFAULT_AVATAR,
    EYEBROWS,
    EYES,
    FACIAL_HAIR,
    FACIAL_HAIR_COLORS,
    HAIR_COLORS,
    HAIR_TOPS,
    MOUTHS,
    SKIN_COLORS,
    avatarUrlFor,
    humanizeAvatarLabel,
} from "@/lib/marketplace/avatar-options.js";

const SELECTS = [
    { field: "top", label: "Hair", values: HAIR_TOPS },
    { field: "clothing", label: "Outfit", values: CLOTHINGS },
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
    { field: "clothesColor", label: "Outfit color", values: CLOTHES_COLORS },
    { field: "backgroundColor", label: "Background", values: BACKGROUND_COLORS },
];

function randomAvatar() {
    const cfg = {};
    for (const [field, values] of Object.entries(AVATAR_FIELDS)) {
        cfg[field] = values[Math.floor(Math.random() * values.length)];
    }
    return cfg;
}

// Build your "vanilla" avatar (base identity — skin, hair, face, basic clothes). Live preview renders via
// our own /api/marketplace/avatar route. Save stores the config; "Use a photo instead" clears it.
export default function AvatarBuilder({ current = null }) {
    const router = useRouter();
    const [config, setConfig] = useState(() => ({ ...DEFAULT_AVATAR, ...(current || {}) }));
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");

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
            <div className="avatar-builder-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="avatar-builder-img" src={previewUrl} alt="Avatar preview" width={140} height={140} />
                <button type="button" className="btn-ghost avatar-builder-random" onClick={() => setConfig(randomAvatar())} disabled={busy}>
                    🎲 Surprise me
                </button>
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
                <button type="button" className="btn-ghost" onClick={() => save(null, "Switched back to your photo.")} disabled={busy}>
                    Use a photo instead
                </button>
            </div>
            {msg ? <p className="shop-payment-success" style={{ marginTop: 8 }}>{msg}</p> : null}
            {err ? <p className="shop-payment-error" style={{ marginTop: 8 }}>{err}</p> : null}
        </div>
    );
}
