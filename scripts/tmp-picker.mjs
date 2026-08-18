import { readFileSync, writeFileSync } from "node:fs";

const p = "src/components/FishingScene.js";
let s = readFileSync(p, "utf8");

// ── 1. THE CAST TAKES A BAIT ─────────────────────────────────────────────────────────────────────────────────
const oldCast = `    const cast = useCallback(async () => {
        if (busy) return;
        setBusy(true); setErr(null); setResult(null);
        const res = await onCast({ sky }).catch(() => null);`;
const newCast = `    // ── BAIT FIRST, THEN THE WATER ───────────────────────────────────────────────────────────────────────
    // Luke: "when you decide you wanna fish, you first select a bait if you have one, or you say skip
    // baiting, and then it goes on to the actual fishing minigame."
    //
    // The picker is a STEP, not a setting — it opens on the tap that would have cast, and closes into the
    // cast. Nothing is remembered between casts: a bait is spent, so carrying a silent default would spend
    // your best one on a cast you did not think about.
    const [picking, setPicking] = useState(false);
    const baits = Array.isArray(fishing?.baits) ? fishing.baits : [];

    const cast = useCallback(async (bait = null) => {
        if (busy) return;
        setPicking(false);
        setBusy(true); setErr(null); setResult(null);
        const res = await onCast({ sky, bait }).catch(() => null);`;
if (!s.includes(oldCast)) throw new Error("cast callback not found");
s = s.replace(oldCast, newCast);
s = s.replace("    }, [busy, onCast, reportMiss, sfx, sky]);", "    }, [busy, onCast, reportMiss, sfx, sky]);");

// ── 2. THE BUTTON OPENS THE PICKER WHEN THERE IS ANYTHING TO PICK ────────────────────────────────────────────
const oldBtn = `                                <button type="button" className="fish-cta" disabled={busy || casts.left <= 0} onClick={cast}>
                                    {casts.left <= 0 ? "Out of casts today" : busy ? "Casting…" : "Cast the line 🎣"}
                                </button>`;
const newBtn = `                                <button type="button" className="fish-cta" disabled={busy || casts.left <= 0}
                                    onClick={() => (baits.length ? setPicking(true) : cast(null))}>
                                    {casts.left <= 0 ? "Out of casts today" : busy ? "Casting…" : baits.length ? "Bait up 🎣" : "Cast the line 🎣"}
                                </button>`;
if (!s.includes(oldBtn)) throw new Error("cast button not found");
s = s.replace(oldBtn, newBtn);

// ── 3. THE PICKER ITSELF ─────────────────────────────────────────────────────────────────────────────────────
const anchor = `                        {err ? <p className="fish-err">{err}</p> : null}`;
const picker = `                        {/* ── THE BAIT STEP ── every row states what it buys, in the same words the Kitchen
                            used when it cooked it: the tilt comes off the bait itself, so the picker cannot
                            advertise a boost the cast does not apply. */}
                        {picking ? (
                            <div className="fish-bait" role="dialog" aria-label="Choose a bait">
                                <p className="fish-bait-head">What are you putting on the hook?</p>
                                <div className="fish-bait-list">
                                    {baits.map((b) => (
                                        <button key={b.id} type="button" className={\`fish-bait-row is-\${b.rarity}\`}
                                            disabled={busy} onClick={() => cast(b.id)}>
                                            {b.sprite
                                                // eslint-disable-next-line @next/next/no-img-element
                                                ? <img src={b.sprite} alt="" className="fish-bait-art" draggable="false" />
                                                : <span className="fish-bait-art" aria-hidden="true">🪱</span>}
                                            <span className="fish-bait-name">
                                                <b>{b.name}</b>
                                                <em>{b.blurb}</em>
                                            </span>
                                            <span className="fish-bait-num">
                                                <b>+{b.tilt.toFixed(1)}</b>
                                                <em>rarity · {b.qty} left</em>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                                <button type="button" className="fish-ghost" disabled={busy} onClick={() => cast(null)}>
                                    Skip baiting — cast the bare hook
                                </button>
                            </div>
                        ) : null}
                        {err ? <p className="fish-err">{err}</p> : null}`;
if (!s.includes(anchor)) throw new Error("err anchor not found");
s = s.replace(anchor, picker);

// ── 4. STYLE ─────────────────────────────────────────────────────────────────────────────────────────────────
const cssAnchor = "                .fish-err {";
const css = `                .fish-bait { margin: 0 0 10px; padding: 10px; border-radius: 14px; background: rgba(6,14,20,0.72);
                    border: 1px solid rgba(120,200,255,0.28); }
                .fish-bait-head { margin: 0 0 8px; font-size: 12.5px; font-weight: 800; color: #cfe8ff; text-align: center; }
                .fish-bait-list { display: grid; gap: 6px; max-height: 42vh; overflow-y: auto; margin-bottom: 8px; }
                .fish-bait-row { display: flex; align-items: center; gap: 9px; width: 100%; padding: 7px 9px; cursor: pointer;
                    border-radius: 11px; text-align: left; background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.14); color: #eaf2f8; }
                .fish-bait-row:hover:not(:disabled) { background: rgba(120,200,255,0.14); border-color: rgba(120,200,255,0.5); }
                .fish-bait-row:disabled { opacity: .5; cursor: default; }
                .fish-bait-art { width: 34px; height: 34px; object-fit: contain; flex: none; font-size: 24px; text-align: center; }
                .fish-bait-name { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; }
                .fish-bait-name b { font-size: 13px; }
                .fish-bait-name em { font-style: normal; font-size: 10.5px; color: #9fb4c4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .fish-bait-num { display: flex; flex-direction: column; align-items: flex-end; flex: none; }
                .fish-bait-num b { font-size: 14px; color: #8fe3ff; }
                .fish-bait-num em { font-style: normal; font-size: 10px; color: #7f95a6; }
                /* The ladder is legible at a glance: a mythic bait should not look like a dough ball. */
                .fish-bait-row.is-rare { border-color: rgba(120,200,255,0.4); }
                .fish-bait-row.is-epic { border-color: rgba(201,162,255,0.5); }
                .fish-bait-row.is-legendary { border-color: rgba(255,215,94,0.55); }
                .fish-bait-row.is-mythic { border-color: rgba(255,158,196,0.65); box-shadow: 0 0 14px rgba(255,158,196,0.2); }
`;
if (!s.includes(cssAnchor)) throw new Error("css anchor not found");
s = s.replace(cssAnchor, css + cssAnchor);
writeFileSync(p, s);
console.log("bait picker wired into the fishing flow");
