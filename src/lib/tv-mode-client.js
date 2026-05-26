"use client";

import { useCallback, useEffect, useState } from "react";

const TV_MODE_STORAGE_KEY = "wolfden-tv-mode";
const TV_MODE_EVENT = "wolfden-tv-mode-change";

function applyTvModeClass(enabled) {
    if (typeof document === "undefined") {
        return;
    }

    document.documentElement.classList.toggle("tv-mode", enabled);
    document.body.classList.toggle("tv-mode", enabled);
}

export function isTvModeEnabled() {
    if (typeof window === "undefined") {
        return false;
    }

    try {
        return window.localStorage.getItem(TV_MODE_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

export function setTvModeEnabled(enabled) {
    if (typeof window === "undefined") {
        return;
    }

    const normalized = Boolean(enabled);

    try {
        window.localStorage.setItem(TV_MODE_STORAGE_KEY, normalized ? "1" : "0");
    } catch {
        // Ignore storage failures so the UI can still toggle for this session.
    }

    applyTvModeClass(normalized);
    window.dispatchEvent(new CustomEvent(TV_MODE_EVENT, { detail: { enabled: normalized } }));
}

export function useTvMode() {
    const [enabled, setEnabled] = useState(() => isTvModeEnabled());

    useEffect(() => {
        applyTvModeClass(enabled);

        const sync = () => {
            const syncedValue = isTvModeEnabled();
            setEnabled(syncedValue);
            applyTvModeClass(syncedValue);
        };

        window.addEventListener(TV_MODE_EVENT, sync);
        window.addEventListener("storage", sync);

        return () => {
            window.removeEventListener(TV_MODE_EVENT, sync);
            window.removeEventListener("storage", sync);
        };
    }, [enabled]);

    const setMode = useCallback((nextValue) => {
        setTvModeEnabled(nextValue);
    }, []);

    return [enabled, setMode];
}
