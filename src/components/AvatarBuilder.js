"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import ThemedSelect from "@/components/ThemedSelect";
import {
    AVATAR_STYLES,
    STYLE_KEYS,
    avatarUrlFor,
    humanizeAvatarLabel,
    sanitizeAvatarConfig,
    styleFields,
} from "@/lib/marketplace/avatar-options.js";

// A fresh default config for a style.
const defaultFor = (styleKey) => ({ ...AVATAR_STYLES[styleKey].default });

function randomFor(styleKey) {
    const cfg = { style: styleKey };
    for (const f of styleFields(styleKey)) {
        if (f.optional && Math.random() < 0.35) {
            cfg[f.key] = "none";
        } else {
            cfg[f.key] = f.values[Math.floor(Math.random() * f.values.length)];
        }
    }
    return cfg;
}

// Build your avatar: pick an art set, then customize its native options. Live preview renders via our own
// /api/marketplace/avatar route. Save stores the config; "Use a photo instead" clears it.
export default function AvatarBuilder({ current = null }) {
    const router = useRouter();
    const [config, setConfig] = useState(() => sanitizeAvatarConfig(current || AVATAR_STYLES[STYLE_KEYS[0]].default));
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");

    const styleKey = config.style;
    const fields = useMemo(() => styleFields(styleKey), [styleKey]);
    const colors = fields.filter((f) => f.type === "color");
    const selects = fields.filter((f) => f.type === "enum");
    const previewUrl = useMemo(() => avatarUrlFor(config), [config]);

    function set(field, value) {
        setConfig((c) => ({ ...c, [field]: value }));
        setMsg("");
    }
    function switchStyle(key) {
        if (key === styleKey) return;
        setConfig(defaultFor(key));
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
                <div className="avatar-presets">
                    <span className="avatar-ctrl-label">Art style</span>
                    <div className="avatar-preset-row">
                        {STYLE_KEYS.map((key) => (
                            <button
                                key={key}
                                type="button"
                                className={`btn-ghost avatar-style-btn${key === styleKey ? " is-selected" : ""}`}
                                onClick={() => switchStyle(key)}
                                disabled={busy}
                                aria-pressed={key === styleKey}
                            >
                                {AVATAR_STYLES[key].label}
                            </button>
                        ))}
                    </div>
                    <button type="button" className="btn-ghost avatar-builder-random" onClick={() => setConfig(randomFor(styleKey))} disabled={busy}>
                        🎲 Surprise me
                    </button>
                </div>
            </div>

            <div className="avatar-builder-controls">
                {colors.map(({ key, label, values }) => (
                    <div className="avatar-ctrl" key={key}>
                        <span className="avatar-ctrl-label">{label}</span>
                        <div className="avatar-swatches">
                            {values.map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    className={`avatar-swatch${config[key] === v ? " is-selected" : ""}`}
                                    style={{ background: `#${v}` }}
                                    onClick={() => set(key, v)}
                                    aria-label={`${label}: #${v}`}
                                    aria-pressed={config[key] === v}
                                    title={`#${v}`}
                                />
                            ))}
                        </div>
                    </div>
                ))}

                <div className="avatar-selects">
                    {selects.map(({ key, label, values, optional }) => (
                        <label className="avatar-ctrl" key={key}>
                            <span className="avatar-ctrl-label">{label}</span>
                            <ThemedSelect
                                block
                                value={config[key]}
                                onChange={(v) => set(key, v)}
                                ariaLabel={label}
                                options={[
                                    ...(optional ? [{ value: "none", label: "None" }] : []),
                                    ...values.map((v) => ({ value: v, label: humanizeAvatarLabel(v) })),
                                ]}
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
