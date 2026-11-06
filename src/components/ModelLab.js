"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── THE MODEL LAB ────────────────────────────────────────────────────────────────────────────────────────────
// A real-time 3D viewport with a clip mixer. A walk cycle is the thing a still picture is worst at; a BLEND is
// the thing a VIDEO is worst at, because what you need to feel is whether a transition holds at a given
// duration — which means a slider and your own hand on it.
//
// ⚠️ EVERY CLIP RIDES IN ONE GLB. Two files cannot cross-fade: an AnimationMixer blends actions that share a
// skeleton, so all four clips are exported into hero.glb against the same 53-bone rig.
//
// ⚠️ three.js IS IMPORTED DYNAMICALLY, INSIDE THE EFFECT. It is ~600KB and must never land in the shared
// bundle for a page nobody else can open.

// loop: a state that holds until something replaces it. oneShot: a reaction that plays once and hands control
// back to whatever was running.
const MODELS = [
    {
        id: "hero", label: "Hero", url: "/models/hero.glb",
        note: "MPFB body, 53-bone rig, IK-authored clips baked to bone keys. Each plate is cut from the "
            + "hero's own surface and thickened, so it fits exactly and inherits the bone weights of the "
            + "flesh underneath it.",
        // Equipment is one skeleton and several meshes. Equipping is showing
        // a node; removing is hiding it. Nothing is re-skinned at runtime.
        equip: [
            { id: "cuirass", label: "Cuirass", nodes: ["Cuirass"] },
            { id: "pauldrons", label: "Pauldrons", nodes: ["Pauldron_L", "Pauldron_R"] },
            { id: "greaves", label: "Greaves", nodes: ["Greave_L", "Greave_R"] },
            { id: "shield", label: "Shield", nodes: ["Shield"] },
            { id: "pickaxe", label: "Pickaxe", nodes: ["Pickaxe"] },
        ],
        clips: [
            { id: "Idle", label: "Idle", kind: "loop", hint: "Relaxed stand" },
            { id: "Walk", label: "Walk", kind: "loop", hint: "Locomotion, 1.28 u/s" },
            { id: "Run", label: "Run", kind: "loop", hint: "4.67 u/s, 38% of the cycle airborne" },
            { id: "Brace", label: "Brace", kind: "loop", hint: "Shield guard",
                kit: { on: ["shield"], off: ["pickaxe"] } },
            { id: "Impact", label: "Impact", kind: "oneShot", hint: "Takes a hit, returns to guard",
                kit: { on: ["shield"], off: ["pickaxe"] } },
            // ⚠️ MINE IS BACK, BUT ON PROBATION. Pulled 2026-11-05 when Luke saw a hand apparently
            // growing out of the hero's abdomen from across the room. The wrist clamp in build-walk
            // has since taken this clip's left wrist from 69 degrees to 49 (and Brace from 75 to 45),
            // which is a real fix for a real defect -- but it did NOT change what that render looks
            // like, so it is probably not the thing Luke saw.
            //
            // Four hypotheses were measured and all four were wrong: bone placement (both hands track
            // the shaft a constant 0.252 apart for all 40 frames), stray vertex weights (farthest vert
            // on hand_l is 0.192 from the bone, normal falloff), wrist angle (clamped, no visual
            // change), and torso penetration (hand_l never closer than 0.185 to the spine axis).
            //
            // ⚠️ SO IT GOES BACK IN THE LAB TO BE JUDGED IN 3D, NOT IN STILLS. Two separate calls were
            // blown today reading single-azimuth renders -- an arm declared missing that was merely
            // behind the torso, and a grip declared fine that was not. The lab orbits; a PNG does not.
            { id: "Mine", label: "Mine", kind: "oneShot", hint: "Two-handed pickaxe strike into the ground",
                kit: { on: ["pickaxe"], off: ["shield"] } },
        ],
    },
    {
        id: "dragon", label: "Dragon", url: "/models/dragon.glb",
        note: "Built from a joint graph: the mesh is inflated from it and the 109-bone rig is generated from "
            + "the same graph, so a bone cannot sit outside the limb it drives.",
        clips: [
            { id: "Idle", label: "Idle", kind: "loop", hint: "Grounded. Breath, head drift, slow tail wander" },
            { id: "Fly", label: "Fly", kind: "loop", hint: "Airborne. Asymmetric stroke, forearm and hand lag" },
            { id: "Roar", label: "Roar", kind: "oneShot", hint: "Anticipate, attack, sustain, settle" },
        ],
    },
];
const BLENDS = [0, 0.08, 0.2, 0.45];

export default function ModelLab() {
    const hostRef = useRef(null);
    const apiRef = useRef(null);
    const blendRef = useRef(0.2);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState(null);
    const [playing, setPlaying] = useState(true);
    const [speed, setSpeed] = useState(1);
    const [blend, setBlend] = useState(0.2);
    const [current, setCurrent] = useState("Idle");
    const [log, setLog] = useState([]);
    const [info, setInfo] = useState(null);
    const [modelId, setModelId] = useState("hero");
    const [equipped, setEquipped] = useState(() => ["cuirass", "pauldrons", "greaves", "shield"]);
    const model = MODELS.find((m) => m.id === modelId) || MODELS[0];
    const CLIPS = model.clips;

    useEffect(() => { blendRef.current = blend; }, [blend]);
    const note = useCallback((t) => setLog((p) => [t, ...p].slice(0, 5)), []);

    useEffect(() => {
        // Switching models tears the whole viewport down and rebuilds it. The alternative -- swapping the
        // root inside a live scene -- means hand-disposing one skeleton's geometry while a mixer still holds
        // actions against it, and that is where leaks live.
        setReady(false);
        setError(null);
        setInfo(null);
        setCurrent("Idle");
        setEquipped((MODELS.find((m) => m.id === modelId) || MODELS[0]).equip
            ? (MODELS.find((m) => m.id === modelId) || MODELS[0]).equip.map((e) => e.id) : []);
        let cancelled = false;
        let cleanup = () => {};

        (async () => {
            const THREE = await import("three");
            const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
            const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");
            const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
            if (cancelled || !hostRef.current) return;

            const host = hostRef.current;
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x11181c);

            const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            host.appendChild(renderer.domElement);

            // ⚠️ KEEP THE KEY LOW AND FRONTAL. A light high overhead carves a shadow under the pectoral, and
            // on a pale untextured body that crease reads as the underside of a breast.
            const key = new THREE.DirectionalLight(0xfff2e6, 2.3);
            key.position.set(2.2, 1.5, 3.4);
            key.castShadow = true;
            key.shadow.mapSize.set(1024, 1024);
            key.shadow.camera.near = 0.5;
            key.shadow.camera.far = 20;
            key.shadow.camera.left = key.shadow.camera.bottom = -3;
            key.shadow.camera.right = key.shadow.camera.top = 3;
            scene.add(key);
            const fill = new THREE.DirectionalLight(0xbfd6e6, 0.85);
            fill.position.set(-3.2, 1.2, 2.4);
            scene.add(fill);
            const rim = new THREE.DirectionalLight(0xffd9a8, 1.1);
            rim.position.set(-1.0, 1.8, -3.2);
            scene.add(rim);
            scene.add(new THREE.HemisphereLight(0x5e7a8a, 0x241c18, 0.28));

            const grid = new THREE.GridHelper(8, 16, 0x2f4248, 0x1b282d);
            grid.position.y = 0.001;
            scene.add(grid);
            const floor = new THREE.Mesh(
                new THREE.CircleGeometry(4, 48).rotateX(-Math.PI / 2),
                new THREE.ShadowMaterial({ opacity: 0.32 }),
            );
            floor.receiveShadow = true;
            scene.add(floor);

            const controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.08;
            controls.minDistance = 1.2;
            controls.maxDistance = 12;
            controls.maxPolarAngle = Math.PI * 0.49;

            const draco = new DRACOLoader();
            draco.setDecoderPath("/draco/");
            const loader = new GLTFLoader();
            loader.setDRACOLoader(draco);
            const clock = new THREE.Clock();

            loader.load(
                model.url,
                (gltf) => {
                    if (cancelled) return;
                    const root = gltf.scene;
                    const meshes = [];
                    root.traverse((o) => {
                        if (o.isMesh) {
                            o.castShadow = true;
                            o.frustumCulled = false;   // a skinned mesh's bounds do not follow its bones
                            meshes.push(o);
                        }
                    });

                    const box = new THREE.Box3().setFromObject(root);
                    const size = box.getSize(new THREE.Vector3());
                    root.position.y -= box.min.y;
                    scene.add(root);

                    // ⚠️ LEAVE REAL MARGIN. At h*1.45 the frustum showed only ~1.2x the model height, so on a
                    // narrow phone viewport the figure arrived cropped at the shoulders and thighs.
                    // ⚠️ FRAME ON THE LARGEST DIMENSION, NOT ON HEIGHT. The hero is tall and narrow so
                    // height is his size; the dragon is three times wider than it is tall, and framing that
                    // on size.y puts both wingtips outside the frustum.
                    const h = Math.max(size.x, size.y, size.z) || 1.8;
                    controls.target.set(0, (size.y || h) * 0.50, 0);
                    camera.position.set(h * 0.70, h * 0.52, h * 1.45);
                    controls.update();

                    const mixer = new THREE.AnimationMixer(root);
                    const actions = {};
                    gltf.animations.forEach((c) => {
                        const spec = CLIPS.find((x) => x.id === c.name);
                        const a = mixer.clipAction(c);
                        if (spec && spec.kind === "oneShot") {
                            a.setLoop(THREE.LoopOnce, 1);
                            a.clampWhenFinished = true;
                        } else {
                            a.setLoop(THREE.LoopRepeat, Infinity);
                        }
                        actions[c.name] = a;
                    });

                    const first = actions.Idle || Object.values(actions)[0];
                    first.play();

                    const api = {
                        mixer, actions, meshes, root,
                        activeId: first.getClip().name,
                        fallbackId: first.getClip().name,   // where a one-shot hands back to
                    };

                    // ── THE BLEND ───────────────────────────────────────────────────────────────────
                    // crossFadeFrom with warping maps time between two clips of different length, which
                    // is what makes a transition read as one continuous body rather than a cut.
                    //
                    // A CANCEL is the same call with a shorter duration. There is no separate stop path,
                    // and that is exactly why interrupting feels continuous instead of snapping — the
                    // outgoing clip keeps playing while its weight falls away.
                    api.play = (id, seconds) => {
                        const next = actions[id];
                        if (!next) return;
                        const prev = actions[api.activeId];
                        const spec = CLIPS.find((x) => x.id === id);
                        if (spec && spec.kind === "oneShot") {
                            if (api.activeId !== id) api.fallbackId = api.activeId;
                        } else {
                            api.fallbackId = id;
                        }
                        next.reset();
                        next.enabled = true;
                        next.setEffectiveTimeScale(1);
                        next.setEffectiveWeight(1);
                        next.play();
                        if (prev && prev !== next && seconds > 0) {
                            next.crossFadeFrom(prev, seconds, true);
                        } else if (prev && prev !== next) {
                            prev.stop();
                        }
                        api.activeId = id;
                    };

                    mixer.addEventListener("finished", (e) => {
                        const doneId = e.action.getClip().name;
                        if (doneId !== api.activeId) return;   // already cancelled into something else
                        const back = api.fallbackId || "Idle";
                        api.play(back, Math.min(0.25, blendRef.current || 0.12));
                        setCurrent(back);
                        note(`${doneId} finished → ${back}`);
                    });

                    apiRef.current = Object.assign({}, apiRef.current || {}, api);

                    let tris = 0;
                    meshes.forEach((m) => {
                        tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
                    });
                    setInfo({
                        tris: Math.round(tris),
                        bones: root.getObjectsByProperty("isBone", true).length,
                        clips: gltf.animations.length,
                    });
                    setReady(true);
                },
                undefined,
                (e) => { if (!cancelled) setError(String((e && e.message) || e || "failed to load")); },
            );

            const resize = () => {
                const w = host.clientWidth || 1;
                const hgt = host.clientHeight || 1;
                camera.aspect = w / hgt;
                camera.updateProjectionMatrix();
                renderer.setSize(w, hgt, false);
            };
            resize();
            const ro = new ResizeObserver(resize);
            ro.observe(host);

            let raf = 0;
            const tick = () => {
                raf = requestAnimationFrame(tick);
                // ⚠️ CLAMPED, OR A STALL EATS A WHOLE ONE-SHOT. getDelta() returns the entire stalled
                // interval, so one frame after a backgrounded tab, an alt-tab, a GC pause or a devtools
                // breakpoint arrives with a multi-second dt — and a single mixer.update that big steps
                // clean past the end of a 1.7s clip. The swing never draws a frame: "Mine finished"
                // fires immediately and the body is back in Idle before anybody saw it move.
                //
                // Found 2026-11-05 trying to film the Mine clip at 0.25x, where it should take seven
                // seconds and instead completed between two screenshots, every time. IsoLab — the
                // sibling lab, written in the same batch — has had this clamp and this comment since it
                // shipped; this file just never got it.
                const dt = Math.min(clock.getDelta(), 0.05);   // a backgrounded tab returns a huge delta
                const api = apiRef.current;
                if (api && api.mixer && api.playing !== false) {
                    api.mixer.update(dt * (api.speed === undefined ? 1 : api.speed));
                }
                controls.update();
                renderer.render(scene, camera);
            };
            tick();

            cleanup = () => {
                cancelAnimationFrame(raf);
                ro.disconnect();
                controls.dispose();
                draco.dispose();
                renderer.dispose();
                scene.traverse((o) => {
                    if (o.isMesh) {
                        if (o.geometry) o.geometry.dispose();
                        const m = o.material;
                        (Array.isArray(m) ? m : [m]).forEach((x) => { if (x) x.dispose(); });
                    }
                });
                if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
            };
        })().catch((e) => { if (!cancelled) setError(String((e && e.message) || e)); });

        return () => { cancelled = true; cleanup(); };
    }, [note, model]);

    // ⚠️ SEPARATE EFFECT, AND IT MUST DEPEND ON `ready`. The pieces do not
    // exist until the GLB has loaded, so applying the equipped set from the
    // click handler alone would leave the initial state unapplied.
    useEffect(() => {
        const api = apiRef.current;
        if (!api || !api.root || !model.equip) return;
        model.equip.forEach((e) => {
            const on = equipped.includes(e.id);
            e.nodes.forEach((n) => {
                const o = api.root.getObjectByName(n);
                if (o) o.visible = on;
            });
        });
    }, [equipped, model, ready]);

    const toggleEquip = useCallback((id) => {
        setEquipped((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    }, []);

    // Playback state lives on a ref so changing speed never re-runs the setup effect.
    useEffect(() => {
        apiRef.current = Object.assign({}, apiRef.current || {}, { playing, speed });
    }, [playing, speed]);

    const trigger = useCallback((id) => {
        const api = apiRef.current;
        if (!api || !api.play) return;
        const from = api.activeId;
        const d = blendRef.current;
        api.play(id, d);
        setCurrent(id);
        // ⚠️ THE SHIELD AND THE PICKAXE SHARE A BODY. Both are skinned to
        // hands, so leaving both on means the mining swing is performed with
        // a shield flailing off the off arm. Choosing a clip chooses the
        // loadout it was animated against; the Equip row still overrides.
        const spec = CLIPS.find((x) => x.id === id);
        if (spec && spec.kit) {
            setEquipped((p) => {
                const next = new Set(p);
                (spec.kit.on || []).forEach((k) => next.add(k));
                (spec.kit.off || []).forEach((k) => next.delete(k));
                return [...next];
            });
        }
        const prevSpec = CLIPS.find((x) => x.id === from);
        const cancelled = prevSpec && prevSpec.kind === "oneShot" && id !== from;
        note(`${from} → ${id} over ${d.toFixed(2)}s${cancelled ? `   (cancelled ${from})` : ""}`);
    }, [note, CLIPS]);

    return (
        <div className="lab">
            <div className="stage" ref={hostRef}>
                {!ready && !error ? <p className="hint">Loading…</p> : null}
                {error ? <p className="hint err">Could not load the model: {error}</p> : null}
            </div>

            <div className="row">
                <span className="lbl">Model</span>
                {MODELS.map((m) => (
                    <button key={m.id} type="button" className={m.id === modelId ? "on" : ""}
                        onClick={() => setModelId(m.id)} aria-pressed={m.id === modelId}>
                        {m.label}
                    </button>
                ))}
            </div>

            <div className="row">
                <span className="lbl">Clip</span>
                {CLIPS.map((c) => (
                    <button key={c.id} type="button" title={c.hint}
                        className={c.id === current ? "on" : (c.kind === "oneShot" ? "shot" : "")}
                        onClick={() => trigger(c.id)} aria-pressed={c.id === current}>
                        {c.label}
                    </button>
                ))}
            </div>

            {model.equip ? (
                <div className="row">
                    <span className="lbl">Equip</span>
                    {model.equip.map((e) => (
                        <button key={e.id} type="button"
                            className={equipped.includes(e.id) ? "on" : ""}
                            onClick={() => toggleEquip(e.id)}
                            aria-pressed={equipped.includes(e.id)}>
                            {e.label}
                        </button>
                    ))}
                    <button type="button" className="shot"
                        onClick={() => setEquipped((p) => (p.length ? [] : model.equip.map((x) => x.id)))}>
                        {equipped.length ? "Strip" : "Full kit"}
                    </button>
                </div>
            ) : null}

            <div className="row">
                <span className="lbl">Blend</span>
                {BLENDS.map((b) => (
                    <button key={b} type="button" className={b === blend ? "on" : ""}
                        onClick={() => setBlend(b)} aria-pressed={b === blend}>
                        {b === 0 ? "Snap" : `${b}s`}
                    </button>
                ))}
            </div>

            <div className="row">
                <span className="lbl">Play</span>
                <button type="button" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
                    {playing ? "Pause" : "Play"}
                </button>
                {[0.25, 0.5, 1].map((s) => (
                    <button key={s} type="button" className={s === speed ? "on" : ""}
                        onClick={() => setSpeed(s)} aria-pressed={s === speed}>
                        {s}x
                    </button>
                ))}
            </div>

            {log.length ? (
                <ol className="log">
                    {log.map((l, i) => <li key={`${l}-${i}`} className={i === 0 ? "fresh" : ""}>{l}</li>)}
                </ol>
            ) : null}

            {info ? (
                <dl className="facts">
                    <div><dt>Triangles</dt><dd>{info.tris.toLocaleString()}</dd></div>
                    <div><dt>Bones</dt><dd>{info.bones}</dd></div>
                    <div><dt>Clips</dt><dd>{info.clips}</dd></div>
                </dl>
            ) : null}

            <p className="muted note">
                Drag to orbit, scroll to zoom. Set <strong>Snap</strong> and switch clips to see what a cut
                looks like, then raise the blend and switch again. The amber clip is a one-shot: it plays once
                and hands back to whatever was running, and pressing another clip mid-way cancels it.
                Equip and remove pieces while a clip is playing — they are skinned to the same skeleton, so
                they keep deforming with the body rather than riding along as props.
            </p>
            <p className="muted note">{model.note}</p>

            <style jsx>{`
                .lab { display: flex; flex-direction: column; gap: 10px; }
                .stage {
                    position: relative;
                    width: 100%;
                    aspect-ratio: 4 / 3;
                    max-height: 70vh;
                    border-radius: 10px;
                    overflow: hidden;
                    background: #11181c;
                    border: 1px solid rgba(255, 255, 255, 0.09);
                    touch-action: none;
                }
                .stage :global(canvas) { display: block; width: 100%; height: 100%; }
                .hint {
                    position: absolute; inset: 0; margin: 0;
                    display: flex; align-items: center; justify-content: center;
                    color: #8fa6ae; font-size: 14px; text-align: center; padding: 0 16px;
                }
                .hint.err { color: #e2a0a0; }
                .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
                .lbl {
                    font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
                    color: #8fa6ae; min-width: 44px;
                }
                button {
                    font: inherit; font-size: 14px;
                    padding: 7px 13px; border-radius: 7px;
                    border: 1px solid rgba(255, 255, 255, 0.14);
                    background: rgba(255, 255, 255, 0.05);
                    color: #dce8ea; cursor: pointer; min-height: 38px;
                }
                button:hover { background: rgba(255, 255, 255, 0.1); }
                button.shot { border-color: rgba(255, 170, 90, 0.4); color: #ffcc99; }
                button.on {
                    background: #2e8f86; border-color: #39b3a7;
                    color: #04120f; font-weight: 600;
                }
                button:focus-visible { outline: 2px solid #45d6c6; outline-offset: 2px; }
                .log {
                    list-style: none; margin: 0; padding: 8px 11px;
                    background: rgba(255, 255, 255, 0.035);
                    border: 1px solid rgba(255, 255, 255, 0.07);
                    border-radius: 8px;
                    font-size: 12.5px; line-height: 1.7; color: #8fa6ae;
                    font-variant-numeric: tabular-nums;
                }
                .log .fresh { color: #cfe6e4; }
                .facts {
                    display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
                    gap: 8px; margin: 0;
                }
                .facts > div {
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px solid rgba(255, 255, 255, 0.07);
                    border-radius: 8px; padding: 8px 11px;
                }
                dt { font-size: 11px; letter-spacing: 0.07em; text-transform: uppercase; color: #8fa6ae; }
                dd { margin: 2px 0 0; font-size: 17px; font-variant-numeric: tabular-nums; }
                .note { font-size: 13px; margin: 0; }
            `}</style>
        </div>
    );
}
