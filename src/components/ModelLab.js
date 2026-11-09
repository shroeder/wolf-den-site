"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── THE MODEL LAB ────────────────────────────────────────────────────────────────────────────────────────────
// A real-time viewport over the low-poly set. Reset to ground on 2026-11-09, along with the pipeline behind it:
// the MPFB hero, the 109-bone dragon and the clip mixer are gone, and what is here is a turntable over flat
// -shaded models of a few hundred triangles each.
//
// ⚠️ THE MODEL LIST IS FETCHED, NOT TYPED. It comes from /models/lp/manifest.json, which scripts/lowpoly/make.py
// WRITES as it exports each glb. The pipeline this replaced kept the same list in two places -- a python table
// in the harness and a javascript array in this file -- and they drifted, so the harness photographed a
// character that does not ship. Add scripts/lowpoly/models/goblin.py, run `npm run lp:make`, and the goblin is
// in this lab with its real triangle count. There is no array here to forget to update.
//
// ⚠️ three.js IS IMPORTED DYNAMICALLY, INSIDE THE EFFECT. It is ~600KB and must never land in the shared bundle
// for a page nobody else can open.

const BG = 0x2f3a33;

export default function ModelLab() {
    const hostRef = useRef(null);
    const apiRef = useRef(null);
    const [manifest, setManifest] = useState(null);
    const [modelId, setModelId] = useState(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState(null);
    const [spin, setSpin] = useState(true);
    const [wire, setWire] = useState(false);
    const [withRuler, setWithRuler] = useState(true);
    const [stats, setStats] = useState(null);

    // ── THE MANIFEST ─────────────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        fetch("/models/lp/manifest.json", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`manifest ${r.status}`))))
            .then((j) => {
                if (cancelled) return;
                setManifest(j);
                setModelId((prev) => prev || j.models?.[0]?.id || null);
            })
            .catch((e) => !cancelled && setError(`No manifest: ${e.message}. Run \`npm run lp:make\`.`));
        return () => { cancelled = true; };
    }, []);

    const model = manifest?.models?.find((m) => m.id === modelId) || null;

    // ── THE VIEWPORT ─────────────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!model) return undefined;
        setReady(false);
        setError(null);
        setStats(null);
        let cancelled = false;
        let cleanup = () => {};

        (async () => {
            const THREE = await import("three");
            const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
            const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
            if (cancelled || !hostRef.current) return;

            const host = hostRef.current;
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(BG);

            const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            // ⚠️ THE SAME EXPOSURE THE FILMER USES. Blender's harness renders these at a key of 2.15 suns with
            // a Standard view transform precisely so a 0.36 brown reads as a 0.36 brown; a lab that then tone
            // maps the same glb differently is a lab whose verdict does not transfer. NoToneMapping is the
            // three.js spelling of "Standard".
            renderer.toneMapping = THREE.NoToneMapping;
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            host.appendChild(renderer.domElement);

            // Key / fill / rim, in the same places and the same ratios as scripts/lowpoly/harness/shot.py.
            const key = new THREE.DirectionalLight(0xffffff, 2.15);
            key.position.set(3.4, 3.4, 4.2);
            key.castShadow = true;
            key.shadow.mapSize.set(1024, 1024);
            key.shadow.camera.left = -6; key.shadow.camera.right = 6;
            key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
            const fill = new THREE.DirectionalLight(0xffffff, 0.55);
            fill.position.set(-4.2, 2.2, 3.0);
            const rim = new THREE.DirectionalLight(0xffffff, 0.75);
            rim.position.set(-1.4, 3.6, -4.4);
            scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.3));

            const ground = new THREE.Mesh(
                new THREE.CircleGeometry(14, 32).rotateX(-Math.PI / 2),
                new THREE.MeshStandardMaterial({ color: 0x36442a, roughness: 0.95 })
            );
            ground.receiveShadow = true;
            scene.add(ground);
            const grid = new THREE.GridHelper(14, 14, 0x55684a, 0x44563c);
            grid.position.y = 0.002;
            scene.add(grid);

            const controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.target.set(0, 0.9, 0);
            controls.minDistance = 1.2;
            controls.maxDistance = 30;
            // Below the floor there is nothing to see and it is the fastest way to get lost.
            controls.maxPolarAngle = Math.PI * 0.49;

            const pivot = new THREE.Group();
            scene.add(pivot);

            const loader = new GLTFLoader();
            const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));

            let root = null;
            let ruler = null;

            const frame = (height) => {
                const d = Math.max(height * 2.1, 2.4);
                camera.position.set(d * 0.55, height * 0.75 + 0.5, d * 0.78);
                controls.target.set(0, height * 0.45, 0);
                controls.update();
            };

            try {
                const gltf = await load(model.url);
                if (cancelled) return;
                root = gltf.scene;
                let tris = 0;
                const mats = new Set();
                root.traverse((o) => {
                    if (!o.isMesh) return;
                    o.castShadow = true;
                    o.receiveShadow = true;
                    const g = o.geometry;
                    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
                    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
                });
                pivot.add(root);

                const box = new THREE.Box3().setFromObject(root);
                const height = box.max.y - box.min.y;
                frame(height);
                setStats({ tris: Math.round(tris), materials: mats.size, height });

                // ── THE RULER ────────────────────────────────────────────────────────────────────────
                // The player, standing beside whatever else is loaded. Scale is the one error a solo
                // render cannot show: everything fills its own frame and therefore looks right. Off by
                // default only for the player himself, who would otherwise stand next to a clone.
                if (model.id !== "player") {
                    const p = manifest.models.find((m) => m.id === "player");
                    if (p) {
                        const rg = await load(p.url);
                        if (cancelled) return;
                        ruler = rg.scene;
                        ruler.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
                        const w = Math.max(box.max.x - box.min.x, 0.6);
                        ruler.position.x = -(w / 2 + 0.75);
                        scene.add(ruler);
                    }
                }

                if (cancelled) return;
                setReady(true);
            } catch (e) {
                if (!cancelled) setError(`${model.url} did not load: ${e.message}`);
                return;
            }

            const resize = () => {
                const w = host.clientWidth || 600;
                const h = Math.round(Math.min(Math.max(w * 0.72, 320), 620));
                renderer.setSize(w, h, false);
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
            };
            resize();
            const ro = new ResizeObserver(resize);
            ro.observe(host);

            let raf = 0;
            let last = performance.now();
            const tick = (now) => {
                raf = requestAnimationFrame(tick);
                const dt = Math.min((now - last) / 1000, 0.1);
                last = now;
                if (apiRef.current?.spin) pivot.rotation.y += dt * 0.55;
                controls.update();
                renderer.render(scene, camera);
            };
            raf = requestAnimationFrame(tick);

            apiRef.current = {
                spin: true,
                setWire(on) {
                    [root, ruler].forEach((r) => r?.traverse((o) => {
                        if (!o.isMesh) return;
                        (Array.isArray(o.material) ? o.material : [o.material])
                            .forEach((m) => { m.wireframe = on; });
                    }));
                },
                setRuler(on) { if (ruler) ruler.visible = on; },
            };

            cleanup = () => {
                cancelAnimationFrame(raf);
                ro.disconnect();
                controls.dispose();
                renderer.dispose();
                scene.traverse((o) => {
                    if (o.isMesh) {
                        o.geometry?.dispose();
                        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose());
                    }
                });
                if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
                apiRef.current = null;
            };
        })();

        return () => { cancelled = true; cleanup(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [model?.id, model?.url]);

    useEffect(() => { if (apiRef.current) apiRef.current.spin = spin; }, [spin, ready]);
    useEffect(() => { apiRef.current?.setWire(wire); }, [wire, ready]);
    useEffect(() => { apiRef.current?.setRuler(withRuler); }, [withRuler, ready]);

    const pill = useCallback((on) => ({
        padding: "6px 12px", borderRadius: 999, cursor: "pointer",
        border: on ? "1px solid #8fb07a" : "1px solid rgba(255,255,255,.18)",
        background: on ? "rgba(143,176,122,.22)" : "transparent",
        color: "inherit", fontSize: 14,
    }), []);

    return (
        <div className="stack" style={{ gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(manifest?.models || []).map((m) => (
                    <button key={m.id} type="button" style={pill(m.id === modelId)}
                        onClick={() => setModelId(m.id)}>
                        {m.label}
                    </button>
                ))}
            </div>

            <div ref={hostRef} style={{
                width: "100%", borderRadius: 10, overflow: "hidden",
                background: "#2f3a33", minHeight: 320,
            }} />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" style={pill(spin)} onClick={() => setSpin((v) => !v)}>
                    {spin ? "Spinning" : "Still"}
                </button>
                <button type="button" style={pill(wire)} onClick={() => setWire((v) => !v)}>
                    Wireframe
                </button>
                {model?.id !== "player" && (
                    <button type="button" style={pill(withRuler)} onClick={() => setWithRuler((v) => !v)}>
                        Player for scale
                    </button>
                )}
            </div>

            {error && <p style={{ color: "#e8a0a0", margin: 0 }}>{error}</p>}

            {model && (
                <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                    <strong>{model.label}</strong> — {model.note}
                    <br />
                    {stats
                        ? `${stats.tris} triangles (budget ${model.budget}) · ${stats.materials} flat colours · ${stats.height.toFixed(2)} m`
                        : "loading…"}
                    {manifest && ` · the player is ${manifest.style.player_height} m`}
                </div>
            )}
        </div>
    );
}
