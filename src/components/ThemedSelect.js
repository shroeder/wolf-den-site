"use client";

import { useEffect, useRef, useState } from "react";

// A dark, compact, on-brand dropdown to replace native <select> (whose mobile OS picker is a huge
// white full-screen list that clashes with the theme). Keyboard + click-outside + scroll supported.
export default function ThemedSelect({ value, onChange, options, ariaLabel, className = "", block = false, disabled = false }) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const selected = options.find((o) => String(o.value) === String(value));

    return (
        <div className={`ts-wrap${block ? " ts-block" : ""} ${className}`} ref={wrapRef}>
            <button
                type="button"
                className="ts-button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={ariaLabel}
                disabled={disabled}
                onClick={() => !disabled && setOpen((v) => !v)}
            >
                <span className="ts-value">{selected?.label ?? "Select"}</span>
                <svg className={`ts-caret${open ? " ts-caret-open" : ""}`} width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            {open && (
                <ul className="ts-menu" role="listbox" aria-label={ariaLabel}>
                    {options.map((o) => (
                        <li
                            key={String(o.value)}
                            role="option"
                            aria-selected={String(o.value) === String(value)}
                            className={`ts-option${String(o.value) === String(value) ? " ts-option-active" : ""}`}
                            onClick={() => {
                                onChange(o.value);
                                setOpen(false);
                            }}
                        >
                            {o.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
