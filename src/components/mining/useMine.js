"use client";

import { useCallback, useRef, useState } from "react";

import { clink } from "@/components/mining/kit";

// ── THE MINE'S STATE ─────────────────────────────────────────────────────────────────────────────────────────
// Every server call and every piece of transient UI state, in one place. The three tabs are views onto this —
// they take what they need as props and own no server logic of their own, so there is exactly one answer to
// "what happens when you climb out" rather than one per screen.

export function useMine(initial) {
    const [state, setState] = useState(initial);
    const [msg, setMsg] = useState(null);
    const [busy, setBusy] = useState(false);
    const [tab, setTab] = useState("descend");

    // Descent
    const [card, setCard] = useState(null);      // the last thing the tunnel turned up
    const [wrap, setWrap] = useState(null);      // surfaced / collapsed summary

    // The face
    const [breaking, setBreaking] = useState(false); // the swing minigame is up
    const [crack, setCrack] = useState(null);
    const [floats, setFloats] = useState([]);
    const [shake, setShake] = useState(0);
    const floatId = useRef(0);

    // The smeltery
    const [forge, setForge] = useState(null);        // { tier, stack } while the heat game is up
    const [smelting, setSmelting] = useState(null);  // { stage, ore, parts, partTier, oreArt }

    const post = useCallback(async (body) => {
        const r = await fetch("/api/marketplace/mining", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).catch(() => null);
        return r ? await r.json().catch(() => null) : null;
    }, []);
    const say = useCallback((m) => { setMsg(m); setTimeout(() => setMsg(null), 2400); }, []);

    // ── THE DESCENT ── push-your-luck. Start a trip, keep going, or climb out with what you have.
    const startTrip = useCallback(async () => {
        if (busy) return;
        setBusy(true); setCard(null); setWrap(null);
        const r = await post({ action: "trip" });
        setBusy(false);
        if (r?.unlocked && r?.ok !== false) setState(r);
        else say(r?.error === "no_trips" ? "No trips left today — three a day." : r?.error === "run_in_progress" ? "You're already down there." : "Couldn't start.");
    }, [busy, post, say]);

    const goDeeper = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        const r = await post({ action: "descend" });
        setBusy(false);
        if (!r?.ok) { say("Couldn't go deeper."); return; }
        setState(r);
        if (r.collapsed) {
            setCard(null);
            setWrap({ collapsed: true, depth: r.depth, lost: r.lost, seam: r.seam, lostTier: r.lostTier || null });
            clink(0.2);
            try { navigator.vibrate?.([40, 60, 40, 60, 120]); } catch { /* no haptics */ }
        } else {
            setCard({ ...r.found, label: r.card?.label, depth: r.depth, k: Date.now() });
            clink(r.found?.kind === "gear" || r.found?.kind === "chest" ? 1 : r.found?.kind === "nothing" ? 0.2 : 0.6);
        }
    }, [busy, post, say]);

    const surface = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        const r = await post({ action: "surface" });
        setBusy(false);
        if (!r?.ok) { say("Couldn't climb out."); return; }
        setState(r);
        setCard(null);
        setWrap({ collapsed: false, paid: r.paid || [], seam: r.seam });
        clink(1);
    }, [busy, post, say]);

    // A seam is gone or spent, so the only way to another one is back down the tunnel. This used to call a
    // `prospect()` that no longer exists — surfacing a seam on demand was the OLD survey, and removing it left
    // two live calls to a function that was never declared.
    const backToTunnel = useCallback((autoStart = false) => {
        setTab("descend");
        if (autoStart) startTrip();
    }, [startTrip]);

    // ── THE SWING ────────────────────────────────────────────────────────────────────────────────────────────
    const onSwing = useCallback(async (d) => {
        const r = await post({ action: "swing", nodeId: state.node?.id, dist: d });
        if (!r?.ok) {
            if (r?.error === "out_of_swings") say("You're out of swings for today.");
            else if (r?.error === "node_gone") { say("That seam collapsed — head back down for another."); backToTunnel(); }
            else if (r?.error !== "too_fast") say("That swing didn't land.");
            return r;
        }
        clink(r.grade === "pixel" ? 1 : r.grade === "perfect" ? 0.8 : r.grade === "great" ? 0.6 : 0.35);
        setShake((n) => n + 1);
        const id = (floatId.current += 1);
        setFloats((f) => [...f.slice(-5), { id, dmg: r.damage, grade: r.grade }]);
        setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 900);
        setState((s) => ({
            ...s,
            swings: { ...s.swings, left: r.swingsLeft, used: (s.swings?.allowance ?? 0) - r.swingsLeft },
            node: s.node ? { ...s.node, hp: r.hp, pct: r.pct } : null,
        }));
        if (r.cracked) {
            setCrack(r.cracked);
            try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* no window */ }
            const fresh = await fetch("/api/marketplace/mining", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
            if (fresh?.unlocked) setState((s) => ({ ...fresh, node: s.node ? { ...s.node, hp: 0, pct: 0 } : null }));
        }
        return r;
    }, [post, state.node?.id, say, backToTunnel]);

    // ── THE SMELT ── played, not pressed. Opening the furnace starts the heat climbing; the pour is yours to time.
    const smelt = useCallback((tier) => {
        const stack = (state.ore || []).find((o) => o.tier === tier);
        if (!stack?.canSmelt || smelting || forge) return;
        setForge({ tier, stack });
    }, [state.ore, smelting, forge]);

    // The pour landed. Send the heat we read and play the result back.
    const pour = useCallback(async (heat, stack) => {
        setForge(null);
        setSmelting({ stage: "load", oreArt: stack.art, oreName: stack.name, color: stack.color, partTier: stack.partTier, parts: stack.canSmelt, ore: stack.canSmelt * stack.smeltCost });
        const r = await post({ action: "smelt", tier: stack.tier, batches: stack.canSmelt, heat });
        setTimeout(() => setSmelting((v) => (v ? { ...v, stage: "burn" } : v)), 420);
        setTimeout(() => {
            if (r?.unlocked && r?.ok !== false) {
                setState(r);
                setSmelting((v) => (v ? { ...v, stage: "done", result: r.smelted } : v));
                clink(r.smelted?.band === "perfect" ? 1 : r.smelted?.band === "hot" ? 0.7 : 0.35);
                try { window.dispatchEvent(new Event("wolfden-hud-refresh")); } catch { /* no window */ }
            } else { setSmelting(null); say(r?.error === "not_enough_ore" ? "Not enough ore." : "Couldn't smelt that."); }
        }, 1400);
    }, [post, say]);

    const upgrade = useCallback(async (track) => {
        if (busy) return;
        setBusy(true);
        const r = await post({ action: "upgrade", track });
        setBusy(false);
        if (r?.unlocked) setState(r);
        else say(r?.error === "not_enough_gold" ? "Not enough gold." : r?.error === "maxed" ? "Already at max." : "Couldn't upgrade.");
    }, [busy, post, say]);

    const tripsLeft = state.trips?.left ?? 0;
    const node = state.node;

    return {
        state, node, msg, busy, tab, setTab, tripsLeft,
        // descent
        card, wrap, setWrap, startTrip, goDeeper, surface, backToTunnel,
        // face
        breaking, setBreaking, crack, setCrack, floats, shake, onSwing,
        // smeltery
        forge, setForge, smelting, setSmelting, smelt, pour,
        upgrade,
    };
}
