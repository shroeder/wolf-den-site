"use client";

import { useEffect, useRef, useState } from "react";

// ── THE WALK LAB ─────────────────────────────────────────────────────────────────────────────────────────────
// A first-person walk around the low-poly set, at the player's own eye height.
//
// ⚠️ EYE HEIGHT IS 1.6 m AND THAT IS THE WHOLE POINT. The model lab shows one object filling a frame, which is
// the view in which everything looks correctly sized -- it is the view that CANNOT show a scale error. Standing
// under the tree at the height of the man who is 1.85 m is the view that can. If an object reads wrong here,
// the object is wrong, not the camera.
//
// ⚠️ EVERY MODEL IN THE MANIFEST GETS PLACED, whether the layout below knows about it or not. Anything without
// a hand-authored spot lands in a row beside the spawn. A model you cannot walk to is a model that does not
// exist, and the repo has shipped a screen with no door twice; this is the same mistake wearing a different
// hat. Add models/goblin_chief.py, run lp:make, and he is standing here with no edit to this file.
//
// ⚠️ three.js IS IMPORTED DYNAMICALLY, INSIDE THE EFFECT. ~600KB, owner-only page, must never land in the
// shared bundle.

const EYE = 1.6;
const WALK = 2.7;                 // m/s. A person walks at about 1.4; this is a lab, not a simulation.
const RUN = 5.4;
const WORLD_R = 34;               // you cannot walk past this, so the fog is never a wall you reach
// ⚠️ yaw 0 FACES THE CAMP, NOT Math.PI. A three.js camera already looks down -Z, so the obvious
// "turn it round to face the scene" is the thing that turns it AWAY: the first shot of this lab
// spawned with the player's nose in a tree trunk, with the whole camp behind him.
const SPAWN = { x: 0, z: 9.5, yaw: 0 };

// ── THE CAMP ─────────────────────────────────────────────────────────────────────────────────────────────────
// Hand-authored, because an arrangement is content. The smithy is a smithy because the furnace and the anvil
// are two metres apart, not because they are both in the manifest.
const LAYOUT = [
    { id: "furnace", x: -3.4, z: -2.6, yaw: 0.35 },
    { id: "anvil", x: -1.5, z: -1.0, yaw: -0.5 },
    { id: "chest", x: -5.1, z: 0.2, yaw: 0.8 },
    { id: "fire", x: 1.6, z: 2.4, yaw: 0 },
    // Off the spawn's sight line on purpose: at x=0.9 he stood dead centre five metres ahead
    // with his back to you, and the camp was behind him.
    { id: "player", x: -3.2, z: 5.4, yaw: 2.2 },
    { id: "goblin", x: 5.2, z: -2.4, yaw: -1.9 },
    { id: "goblin", x: 6.8, z: -0.6, yaw: -2.4 },
    { id: "rock", x: 4.6, z: 3.6, yaw: 0.6 },
    { id: "rock", x: -0.9, z: 0.4, yaw: 2.1 },
    { id: "rock", x: 4.2, z: -1.0, yaw: 4.0 },
    { id: "tree", x: -9.0, z: -7.0, yaw: 0.3 },
    { id: "tree", x: 7.5, z: -8.5, yaw: 1.2 },
    { id: "tree", x: -12.5, z: 3.0, yaw: 2.4 },
    { id: "tree", x: 11.0, z: 4.5, yaw: 3.3 },
    { id: "tree", x: -6.5, z: 11.0, yaw: 4.6 },
    { id: "tree", x: 4.0, z: 13.5, yaw: 5.2 },
    { id: "tree", x: -17.0, z: -9.0, yaw: 1.9 },
    { id: "tree", x: 16.0, z: -5.0, yaw: 0.9 },
    { id: "tree", x: 0.5, z: -13.0, yaw: 2.8 },
    { id: "tree", x: -14.0, z: 14.0, yaw: 5.9 },
    { id: "rock", x: -8.0, z: 6.5, yaw: 1.1 },
    { id: "rock", x: 9.5, z: 8.0, yaw: 3.7 },
    { id: "rock", x: -15.0, z: -2.0, yaw: 5.0 },
];

// Deterministic, so the world is the same place every visit and "the goblin by the second tree" means
// something. A seeded hash, not Math.random.
const jitter = (seed) => {
    let h = seed * 2654435761 % 2147483647;
    h = (h ^ (h >> 13)) * 1274126177 % 2147483647;
    return ((h % 1000) / 1000) * 2 - 1;
};

export default function WalkLab() {
    const hostRef = useRef(null);
    const apiRef = useRef(null);
    const [error, setError] = useState(null);
    const [ready, setReady] = useState(false);
    const [near, setNear] = useState(null);
    const [locked, setLocked] = useState(false);
    // ⚠️ ASKED AT MOUNT, NOT ON THE FIRST TOUCH. The control hint is read BEFORE anyone touches
    // anything, so deriving "is this a phone" from the first pointerdown means every phone is told
    // to press WASD until it stops needing to be told. `pointer: coarse` is the question that
    // actually matters here -- not the width, because a phone in landscape is wider than any phone
    // breakpoint and would answer "desktop".
    const [touch, setTouch] = useState(false);
    useEffect(() => {
        if (typeof window !== "undefined" && window.matchMedia) {
            setTouch(window.matchMedia("(pointer: coarse)").matches);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        let cleanup = () => {};

        (async () => {
            const res = await fetch("/models/lp/manifest.json", { cache: "no-store" }).catch(() => null);
            if (!res?.ok) {
                if (!cancelled) setError("No manifest. Run `npm run lp:make`.");
                return;
            }
            const manifest = await res.json();
            if (cancelled || !hostRef.current) return;

            const THREE = await import("three");
            const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
            if (cancelled || !hostRef.current) return;

            const host = hostRef.current;
            const SKY = 0x7d9099;
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(SKY);
            // Fog, so the edge of a finite ground plane is never visible. The walk is clamped well inside it.
            scene.fog = new THREE.Fog(SKY, 16, 52);

            const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 160);
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            // ⚠️ NOT PCFSoftShadowMap. three.js 0.187 removed it and silently substitutes
            // PCFShadowMap with a console warning, so the named setting was a lie.
            renderer.shadowMap.type = THREE.PCFShadowMap;
            // The same exposure the Blender filmer uses -- see harness/shot.py. A lab that tone maps the glb
            // differently from the renders is a lab whose verdict does not transfer.
            renderer.toneMapping = THREE.NoToneMapping;
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.domElement.style.display = "block";
            host.appendChild(renderer.domElement);

            const key = new THREE.DirectionalLight(0xffffff, 2.15);
            key.position.set(14, 18, 10);
            key.castShadow = true;
            key.shadow.mapSize.set(2048, 2048);
            key.shadow.camera.left = -26; key.shadow.camera.right = 26;
            key.shadow.camera.top = 26; key.shadow.camera.bottom = -26;
            key.shadow.camera.far = 70;
            key.shadow.bias = -0.0012;
            const fill = new THREE.DirectionalLight(0xffffff, 0.55);
            fill.position.set(-16, 10, 8);
            const rim = new THREE.DirectionalLight(0xffffff, 0.75);
            rim.position.set(-6, 14, -18);
            scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.3));

            const ground = new THREE.Mesh(
                new THREE.CircleGeometry(70, 48).rotateX(-Math.PI / 2),
                new THREE.MeshStandardMaterial({ color: 0x36442a, roughness: 0.95 })
            );
            ground.receiveShadow = true;
            scene.add(ground);

            // ── LOAD EACH MODEL ONCE, CLONE THE REST ─────────────────────────────────────────────────
            const loader = new GLTFLoader();
            const byId = new Map(manifest.models.map((m) => [m.id, m]));
            const protos = new Map();
            await Promise.all(manifest.models.map((m) => new Promise((resolve) => {
                loader.load(m.url, (g) => { protos.set(m.id, g.scene); resolve(); },
                    undefined, () => resolve());
            })));
            if (cancelled) return;
            if (!protos.size) { setError("No models loaded."); return; }

            // Anything the layout does not mention still has to be reachable.
            const placed = new Set(LAYOUT.map((p) => p.id));
            const orphans = manifest.models.filter((m) => !placed.has(m.id));
            const spots = LAYOUT.concat(orphans.map((m, i) => ({
                id: m.id, x: -4 + i * 2.2, z: 6.0, yaw: 0, orphan: true,
            })));

            const solids = [];
            spots.forEach((spot, i) => {
                const proto = protos.get(spot.id);
                if (!proto) return;
                const node = proto.clone(true);
                node.position.set(spot.x, 0, spot.z);
                node.rotation.y = spot.yaw;
                // Scenery varies ±10% so a stand of the same tree does not read as a row of clones. The
                // MODEL is still exactly the metres the gate measured; this is set dressing on top of it.
                const vary = (spot.id === "tree" || spot.id === "rock") ? 1 + jitter(i + 1) * 0.1 : 1;
                node.scale.setScalar(vary);
                node.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
                scene.add(node);

                const box = new THREE.Box3().setFromObject(node);
                const r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
                solids.push({
                    x: spot.x, z: spot.z,
                    // You bump into a trunk, not into a canopy: a tree's collision is its stem. Everything
                    // else blocks at 80% of its own footprint, which stops you standing inside the furnace.
                    r: (spot.id === "tree" ? 0.34 : r * 0.8) * vary,
                    label: byId.get(spot.id)?.label || spot.id,
                    orphan: Boolean(spot.orphan),
                });
            });

            // ── THE WALK ─────────────────────────────────────────────────────────────────────────────
            const pos = { x: SPAWN.x, z: SPAWN.z };
            let yaw = SPAWN.yaw;
            let pitch = -0.04;
            const keys = new Set();
            const stick = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
            const look = { active: false, id: null, lx: 0, ly: 0 };

            const el = renderer.domElement;
            el.style.touchAction = "none";
            el.style.cursor = "grab";

            const onKey = (e, down) => {
                const k = e.key.toLowerCase();
                if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"]
                    .includes(k)) {
                    e.preventDefault();
                    if (down) keys.add(k); else keys.delete(k);
                }
                if (down && k === "r") { pos.x = SPAWN.x; pos.z = SPAWN.z; yaw = SPAWN.yaw; pitch = -0.04; }
            };
            const kd = (e) => onKey(e, true);
            const ku = (e) => onKey(e, false);
            window.addEventListener("keydown", kd);
            window.addEventListener("keyup", ku);

            // ⚠️ POINTER LOCK IS OPTIONAL, NOT THE ONLY WAY TO LOOK. Dragging works whether or not the
            // pointer is locked, and on touch it is the only thing that works at all. A lab that demands a
            // click-to-capture before it responds reads as broken on a phone.
            const onLockChange = () => setLocked(document.pointerLockElement === el);
            document.addEventListener("pointerlockchange", onLockChange);
            const onClick = () => {
                if (!("ontouchstart" in window) && document.pointerLockElement !== el) {
                    el.requestPointerLock?.();
                }
            };
            el.addEventListener("click", onClick);

            const onMove = (e) => {
                if (document.pointerLockElement === el) {
                    yaw -= e.movementX * 0.0022;
                    pitch = Math.max(-1.35, Math.min(1.35, pitch - e.movementY * 0.0022));
                }
            };
            window.addEventListener("mousemove", onMove);

            const down = (e) => {
                setTouch(e.pointerType === "touch");
                const rect = el.getBoundingClientRect();
                const leftHalf = (e.clientX - rect.left) < rect.width * 0.45;
                if (e.pointerType === "touch" && leftHalf && !stick.active) {
                    stick.active = true; stick.id = e.pointerId;
                    stick.ox = e.clientX; stick.oy = e.clientY; stick.dx = 0; stick.dy = 0;
                } else if (!look.active) {
                    look.active = true; look.id = e.pointerId;
                    look.lx = e.clientX; look.ly = e.clientY;
                    el.style.cursor = "grabbing";
                }
                el.setPointerCapture?.(e.pointerId);
            };
            const move = (e) => {
                if (stick.active && e.pointerId === stick.id) {
                    stick.dx = Math.max(-1, Math.min(1, (e.clientX - stick.ox) / 56));
                    stick.dy = Math.max(-1, Math.min(1, (e.clientY - stick.oy) / 56));
                } else if (look.active && e.pointerId === look.id) {
                    yaw -= (e.clientX - look.lx) * 0.005;
                    pitch = Math.max(-1.35, Math.min(1.35, pitch - (e.clientY - look.ly) * 0.005));
                    look.lx = e.clientX; look.ly = e.clientY;
                }
            };
            const up = (e) => {
                if (e.pointerId === stick.id) { stick.active = false; stick.dx = 0; stick.dy = 0; }
                if (e.pointerId === look.id) { look.active = false; el.style.cursor = "grab"; }
            };
            el.addEventListener("pointerdown", down);
            el.addEventListener("pointermove", move);
            el.addEventListener("pointerup", up);
            el.addEventListener("pointercancel", up);

            const resize = () => {
                const w = host.clientWidth || 600;
                // Short-landscape as well as narrow: a phone on its side is WIDER than any phone breakpoint,
                // and a 72%-of-width viewport on a 760x390 screen is taller than the screen.
                const h = Math.round(Math.min(Math.max(w * 0.62, 300), window.innerHeight * 0.74));
                // ⚠️ setSize WITHOUT the third argument. Passing updateStyle=false leaves the canvas
                // with no CSS size, so it displays at its ATTRIBUTE size -- which setPixelRatio has
                // already multiplied by the device ratio. On a 2x screen the viewport came out twice
                // as tall as the box that was meant to hold it, with the whole scene shoved off the
                // bottom of the frame and a camera aspect that no longer matched what was on screen.
                renderer.setSize(w, h);
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
            };
            resize();
            const ro = new ResizeObserver(resize);
            ro.observe(host);

            let raf = 0;
            let last = performance.now();
            let sinceLabel = 0;
            const tick = (now) => {
                raf = requestAnimationFrame(tick);
                const dt = Math.min((now - last) / 1000, 0.08);
                last = now;

                let fwd = 0;
                let strafe = 0;
                if (keys.has("w") || keys.has("arrowup")) fwd += 1;
                if (keys.has("s") || keys.has("arrowdown")) fwd -= 1;
                if (keys.has("a") || keys.has("arrowleft")) strafe -= 1;
                if (keys.has("d") || keys.has("arrowright")) strafe += 1;
                if (stick.active) { fwd -= stick.dy; strafe += stick.dx; }

                const mag = Math.hypot(fwd, strafe);
                if (mag > 0.01) {
                    const speed = (keys.has("shift") ? RUN : WALK) * Math.min(mag, 1) * dt;
                    const f = fwd / mag;
                    const s = strafe / mag;
                    let nx = pos.x + (Math.sin(yaw) * -f + Math.cos(yaw) * s) * speed;
                    let nz = pos.z + (Math.cos(yaw) * -f - Math.sin(yaw) * s) * speed;

                    // Push out of anything you walked into, rather than stopping dead. Sliding along a
                    // surface is the difference between a walk and a cage.
                    for (const o of solids) {
                        const dx = nx - o.x;
                        const dz = nz - o.z;
                        const d = Math.hypot(dx, dz);
                        const min = o.r + 0.32;
                        if (d < min && d > 0.0001) {
                            nx = o.x + (dx / d) * min;
                            nz = o.z + (dz / d) * min;
                        }
                    }
                    const out = Math.hypot(nx, nz);
                    if (out > WORLD_R) { nx = (nx / out) * WORLD_R; nz = (nz / out) * WORLD_R; }
                    pos.x = nx; pos.z = nz;
                }

                camera.position.set(pos.x, EYE, pos.z);
                camera.rotation.set(pitch, yaw, 0, "YXZ");

                sinceLabel += dt;
                if (sinceLabel > 0.2) {
                    sinceLabel = 0;
                    let best = null;
                    let bestD = 4.5;
                    for (const o of solids) {
                        const d = Math.hypot(pos.x - o.x, pos.z - o.z) - o.r;
                        if (d < bestD) { bestD = d; best = o; }
                    }
                    setNear(best ? best.label : null);
                }

                renderer.render(scene, camera);
            };
            raf = requestAnimationFrame(tick);
            setReady(true);

            apiRef.current = {
                home() { pos.x = SPAWN.x; pos.z = SPAWN.z; yaw = SPAWN.yaw; pitch = -0.04; },
                orphans: orphans.map((m) => m.label),
            };

            cleanup = () => {
                cancelAnimationFrame(raf);
                ro.disconnect();
                window.removeEventListener("keydown", kd);
                window.removeEventListener("keyup", ku);
                window.removeEventListener("mousemove", onMove);
                document.removeEventListener("pointerlockchange", onLockChange);
                el.removeEventListener("click", onClick);
                el.removeEventListener("pointerdown", down);
                el.removeEventListener("pointermove", move);
                el.removeEventListener("pointerup", up);
                el.removeEventListener("pointercancel", up);
                if (document.pointerLockElement === el) document.exitPointerLock?.();
                renderer.dispose();
                scene.traverse((o) => {
                    if (o.isMesh) {
                        o.geometry?.dispose();
                        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose());
                    }
                });
                if (el.parentNode === host) host.removeChild(el);
                apiRef.current = null;
            };
        })();

        return () => { cancelled = true; cleanup(); };
    }, []);

    return (
        <div className="stack" style={{ gap: 10 }}>
            <div ref={hostRef} style={{
                width: "100%", borderRadius: 10, overflow: "hidden",
                background: "#7d9099", minHeight: 300, position: "relative",
            }} />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <button type="button" onClick={() => apiRef.current?.home()} style={{
                    padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                    border: "1px solid rgba(255,255,255,.18)", background: "transparent",
                    color: "inherit", fontSize: 14,
                }}>
                    Back to spawn
                </button>
                <span className="muted" style={{ fontSize: 14 }}>
                    {near ? <strong>{near}</strong> : (ready ? "—" : "loading…")}
                </span>
            </div>

            {error && <p style={{ color: "#e8a0a0", margin: 0 }}>{error}</p>}

            <p className="muted" style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
                {touch
                    ? "Drag the left side to walk, the right side to look."
                    : "WASD or arrows to walk, shift to run, drag (or click to capture the mouse) to look, R to respawn."}
                {locked && " — Esc releases the mouse."}
                <br />
                Eye height is 1.6 m against a 1.85 m player, so what you are judging here is scale. Every model
                in the manifest is placed; anything the camp layout does not know about stands in a row at the
                spawn.
            </p>
        </div>
    );
}
