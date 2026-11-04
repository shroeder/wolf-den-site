"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── THE MODEL LAB ────────────────────────────────────────────────────────────────────────────────────────────
// A real-time 3D viewport for the rigged hero, so an animation can be JUDGED instead of described. A walk
// cycle is the thing a still picture is worst at: contact, down, pass and up all look fine frozen and only
// read as wrong once they are moving at 24fps.
//
// ⚠️ three.js IS IMPORTED DYNAMICALLY, INSIDE THE EFFECT. It is ~600KB and it must never land in the shared
// bundle for a page nobody else visits — this lab is owner-gated and the import has to be too. A top-level
// `import * as THREE` would be pulled into the route chunk whether or not the viewport ever mounts.
//
// ⚠️ AND THE MODEL IS DRACO-COMPRESSED. MPFB builds a body out of morph targets, so the raw export carried 32
// shape keys and weighed 10MB; baking them down took it to 258KB. The decoder lives in /public/draco because
// a CDN path would be blocked and would be a third-party dependency on a page that has none.

const MODEL_URL = "/models/hero-walk.glb";
const SPEEDS = [0.25, 0.5, 1, 1.5];

export default function ModelLab() {
    const hostRef = useRef(null);
    const apiRef = useRef(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState(null);
    const [playing, setPlaying] = useState(true);
    const [speed, setSpeed] = useState(1);
    const [wireframe, setWireframe] = useState(false);
    const [info, setInfo] = useState(null);

    useEffect(() => {
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
            const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            host.appendChild(renderer.domElement);

            // Three lights, same shape as the Blender setup, so what renders here matches what renders there.
            const key = new THREE.DirectionalLight(0xfff2e6, 2.6);
            key.position.set(2.6, 3.4, 2.4);
            key.castShadow = true;
            key.shadow.mapSize.set(1024, 1024);
            key.shadow.camera.near = 0.5;
            key.shadow.camera.far = 20;
            key.shadow.camera.left = key.shadow.camera.bottom = -3;
            key.shadow.camera.right = key.shadow.camera.top = 3;
            scene.add(key);
            const fill = new THREE.DirectionalLight(0xbfd6e6, 0.75);
            fill.position.set(-3.2, 1.8, 1.6);
            scene.add(fill);
            const rim = new THREE.DirectionalLight(0xffd9a8, 1.5);
            rim.position.set(-1.2, 2.4, -3.2);
            scene.add(rim);
            scene.add(new THREE.HemisphereLight(0x5e7a8a, 0x241c18, 0.5));

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

            let mixer = null;
            let meshes = [];
            const clock = new THREE.Clock();

            loader.load(
                MODEL_URL,
                (gltf) => {
                    if (cancelled) return;
                    const root = gltf.scene;
                    root.traverse((o) => {
                        if (o.isMesh) {
                            o.castShadow = true;
                            o.frustumCulled = false;   // a skinned mesh's bounds do not follow its bones
                            meshes.push(o);
                        }
                    });

                    // Frame the model from its own bounds rather than hardcoding a camera distance, so a
                    // re-export at a different scale still arrives centred.
                    const box = new THREE.Box3().setFromObject(root);
                    const size = box.getSize(new THREE.Vector3());
                    const centre = box.getCenter(new THREE.Vector3());
                    root.position.y -= box.min.y;
                    scene.add(root);

                    const h = size.y || 1.8;
                    controls.target.set(0, h * 0.52, 0);
                    camera.position.set(h * 0.95, h * 0.72, h * 1.45);
                    controls.update();

                    const clip = gltf.animations?.[0] || null;
                    if (clip) {
                        mixer = new THREE.AnimationMixer(root);
                        const action = mixer.clipAction(clip);
                        action.setLoop(THREE.LoopRepeat, Infinity);
                        action.play();
                    }

                    let tris = 0;
                    meshes.forEach((m) => { tris += (m.geometry.index?.count || m.geometry.attributes.position.count) / 3; });
                    setInfo({
                        tris: Math.round(tris),
                        bones: root.getObjectsByProperty("isBone", true).length,
                        clip: clip ? clip.name : "none",
                        seconds: clip ? clip.duration.toFixed(2) : "0",
                    });
                    setReady(true);
                },
                undefined,
                (e) => { if (!cancelled) setError(String(e?.message || e || "failed to load")); },
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
                const dt = clock.getDelta();
                const api = apiRef.current;
                if (mixer && api?.playing) mixer.update(dt * api.speed);
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
                        o.geometry?.dispose?.();
                        const m = o.material;
                        (Array.isArray(m) ? m : [m]).forEach((x) => x?.dispose?.());
                    }
                });
                if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
            };
            apiRef.current = { ...(apiRef.current || {}), meshes };
        })().catch((e) => { if (!cancelled) setError(String(e?.message || e)); });

        return () => { cancelled = true; cleanup(); };
    }, []);

    // The render loop reads playback state from a ref so changing speed never re-runs the whole setup effect.
    useEffect(() => {
        apiRef.current = { ...(apiRef.current || {}), playing, speed };
    }, [playing, speed]);

    useEffect(() => {
        const meshes = apiRef.current?.meshes || [];
        meshes.forEach((m) => {
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mat) => { if (mat) mat.wireframe = wireframe; });
        });
    }, [wireframe, ready]);

    const reset = useCallback(() => { setPlaying(true); setSpeed(1); setWireframe(false); }, []);

    return (
        <div className="lab">
            <div className="stage" ref={hostRef}>
                {!ready && !error ? <p className="hint">Loading the hero…</p> : null}
                {error ? <p className="hint err">Could not load the model: {error}</p> : null}
            </div>

            <div className="bar">
                <button type="button" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
                    {playing ? "Pause" : "Play"}
                </button>
                <div className="speeds" role="group" aria-label="Playback speed">
                    {SPEEDS.map((s) => (
                        <button key={s} type="button" className={s === speed ? "on" : ""}
                            onClick={() => setSpeed(s)} aria-pressed={s === speed}>
                            {s}x
                        </button>
                    ))}
                </div>
                <button type="button" onClick={() => setWireframe((w) => !w)} aria-pressed={wireframe}>
                    {wireframe ? "Solid" : "Wireframe"}
                </button>
                <button type="button" onClick={reset}>Reset</button>
            </div>

            {info ? (
                <dl className="facts">
                    <div><dt>Triangles</dt><dd>{info.tris.toLocaleString()}</dd></div>
                    <div><dt>Bones</dt><dd>{info.bones}</dd></div>
                    <div><dt>Clip</dt><dd>{info.clip}</dd></div>
                    <div><dt>Length</dt><dd>{info.seconds}s</dd></div>
                </dl>
            ) : null}

            <p className="muted note">
                Drag to orbit, scroll to zoom, right-drag to pan. The walk is a 24-frame cycle keyed on four
                stations — contact, down, pass and up — mirrored for the second stride.
            </p>

            <style jsx>{`
                .lab { display: flex; flex-direction: column; gap: 12px; }
                .stage {
                    position: relative;
                    width: 100%;
                    aspect-ratio: 4 / 3;
                    max-height: 72vh;
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
                .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
                .speeds { display: flex; gap: 4px; }
                button {
                    font: inherit;
                    font-size: 14px;
                    padding: 7px 13px;
                    border-radius: 7px;
                    border: 1px solid rgba(255, 255, 255, 0.14);
                    background: rgba(255, 255, 255, 0.05);
                    color: #dce8ea;
                    cursor: pointer;
                    min-height: 38px;
                }
                button:hover { background: rgba(255, 255, 255, 0.1); }
                button.on {
                    background: #2e8f86;
                    border-color: #39b3a7;
                    color: #04120f;
                    font-weight: 600;
                }
                button:focus-visible { outline: 2px solid #45d6c6; outline-offset: 2px; }
                .facts {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
                    gap: 8px;
                    margin: 0;
                }
                .facts > div {
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px solid rgba(255, 255, 255, 0.07);
                    border-radius: 8px;
                    padding: 8px 11px;
                }
                dt { font-size: 11px; letter-spacing: 0.07em; text-transform: uppercase; color: #8fa6ae; }
                dd { margin: 2px 0 0; font-size: 17px; font-variant-numeric: tabular-nums; }
                .note { font-size: 13px; margin: 0; }
            `}</style>
        </div>
    );
}
