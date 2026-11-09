"use client";

import { useEffect, useRef, useState } from "react";

// ── THE WALK LAB ─────────────────────────────────────────────────────────────────────────────────────────────
// Walk the low-poly set from a RuneScape camera: over the shoulder, 30 degrees above the ground, orbiting a
// player who is himself one of the models.
//
// ⚠️ THE AVATAR IS THE RULER, AND HE IS IN EVERY FRAME. That is the reason to be in third person rather than
// first: the model lab shows one object filling a frame, which is the view in which everything looks correctly
// sized -- it is the view that CANNOT show a scale error. Here the 1.85 m man stands next to whatever you are
// looking at, always, and an object that reads wrong reads wrong immediately.
//
// ⚠️ 30 DEGREES IS NOT A PREFERENCE, IT IS WHAT THE MODELS ARE JUDGED AT. A first-person pass at eye height
// said the 4 m tree was fine. Dropping the camera to 30 showed it side-on against the horizon and it read as a
// shrub -- the trunk went to 3.5 m because of this view. Change the angle and you change what passes, so the
// angle is a constant with a name rather than a number typed into a camera call.
//
// ⚠️ EVERY MODEL IN THE MANIFEST GETS PLACED, whether the layout below knows about it or not. Anything without
// a hand-authored spot lands in a row beside the spawn. A model you cannot walk to is a model that does not
// exist, and this repo has shipped a screen with no door twice.
//
// ⚠️ three.js IS IMPORTED DYNAMICALLY, INSIDE THE EFFECT. ~600KB, owner-only page, must never land in the
// shared bundle.

const WALK = 2.8;                  // m/s
const RUN = 5.6;
const WORLD_R = 34;                // clamped well inside the fog, so its far edge is never a wall you reach
const SPAWN = { x: 0, z: 9.5, yaw: 0 };

const CAM_ELEV = 30 * Math.PI / 180;   // the house angle
const CAM_ELEV_MIN = 10 * Math.PI / 180;
const CAM_ELEV_MAX = 62 * Math.PI / 180;
// 11, not 9.5: with the aim raised enough to put the horizon in frame, the bottom edge sat
// within a degree of the avatar's feet and clipped them. Pulling the camera back buys the
// margin without touching the 30 degrees.
const CAM_DIST = 11.0;
const CAM_LOOK_Y = 1.05;           // chest height on the avatar, not his feet

// ⚠️ THE CAMERA IS AIMED ABOVE THE AVATAR, OR THERE IS NO SKY IN THE PICTURE.
// Elevation and aim are two different things and conflating them cost a whole frame: a camera SITTING at
// 30 degrees and AIMED at the avatar's chest has its entire 40-degree field below the horizontal, so the
// horizon is never in shot. The first iso render was a solid rectangle of grass with the 5.5 m trees
// sliced off at the top -- it read as a pit, and it would have read as "the trees are too tall" to
// anyone judging the models from it. Raising the aim point tilts the frame up without moving the camera,
// so the 30 degrees Luke asked for is still exactly where the camera sits.
const CAM_AIM_RAISE = 2.4;

// ── THE CAMP ─────────────────────────────────────────────────────────────────────────────────────────────────
// Hand-authored, because an arrangement is content. The smithy is a smithy because the furnace and the anvil
// are two metres apart, not because they are both in the manifest.
//
// No `player` entry: he is the avatar now, and a second one standing in the field was a duplicate of the thing
// you are driving.
const LAYOUT = [
    { id: "furnace", x: -3.4, z: -2.6, yaw: 0.35 },
    { id: "anvil", x: -1.5, z: -1.0, yaw: -0.5 },
    { id: "chest", x: -5.1, z: 0.2, yaw: 0.8 },
    { id: "fire", x: 1.6, z: 2.4, yaw: 0 },
    { id: "goblin", x: 5.2, z: -2.4, yaw: -1.9 },
    { id: "goblin", x: 6.8, z: -0.6, yaw: -2.4 },
    { id: "rock", x: 4.6, z: 3.6, yaw: 0.6 },
    { id: "rock", x: -0.9, z: 0.4, yaw: 2.1 },
    { id: "rock", x: 4.2, z: -1.0, yaw: 4.0 },
    { id: "rock", x: -8.0, z: 6.5, yaw: 1.1 },
    { id: "rock", x: 9.5, z: 8.0, yaw: 3.7 },
    { id: "rock", x: -15.0, z: -2.0, yaw: 5.0 },
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

    // ⚠️ ASKED AT MOUNT, NOT ON THE FIRST TOUCH. The control hint is read BEFORE anyone touches anything, so
    // deriving "is this a phone" from the first pointerdown tells every phone to press WASD until it stops
    // needing to be told. `pointer: coarse` is the right question -- not the width, because a phone in
    // landscape is wider than any phone breakpoint and would answer "desktop".
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
            scene.fog = new THREE.Fog(SKY, 22, 64);

            // ⚠️ A NARROWER FIELD OF VIEW THAN FIRST PERSON WANTED. At 70 degrees a 30-degree elevation still
            // looks like a wide-angle shot from the hip. 40 flattens the perspective enough to read as the
            // isometric-ish view the style is built for, without going fully orthographic -- which would be
            // literally isometric and would take away every depth cue the moment you walk behind something.
            const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            // ⚠️ NOT PCFSoftShadowMap. three.js 0.187 removed it and silently substitutes PCFShadowMap with a
            // console warning, so the named setting was a lie.
            renderer.shadowMap.type = THREE.PCFShadowMap;
            // The same exposure the Blender filmer uses -- see harness/shot.py. A lab that tone maps the glb
            // differently from the renders is a lab whose verdict does not transfer.
            renderer.toneMapping = THREE.NoToneMapping;
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.domElement.style.display = "block";
            host.appendChild(renderer.domElement);

            const key = new THREE.DirectionalLight(0xffffff, 2.15);
            key.position.set(14, 26, 10);
            key.castShadow = true;
            key.shadow.mapSize.set(2048, 2048);
            key.shadow.camera.left = -28; key.shadow.camera.right = 28;
            key.shadow.camera.top = 28; key.shadow.camera.bottom = -28;
            key.shadow.camera.far = 80;
            key.shadow.bias = -0.0012;
            const fill = new THREE.DirectionalLight(0xffffff, 0.55);
            fill.position.set(-16, 10, 8);
            const rim = new THREE.DirectionalLight(0xffffff, 0.75);
            rim.position.set(-6, 14, -18);
            // Ambient lifted from the filmer's 0.30: a single object on a turntable is never inside
            // another object's shadow, and a forest of 5.5 m trees is almost entirely shadow.
            scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.46));

            const ground = new THREE.Mesh(
                new THREE.CircleGeometry(80, 48).rotateX(-Math.PI / 2),
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

            // Anything the layout does not mention still has to be reachable. The avatar counts as placed.
            const placed = new Set(LAYOUT.map((p) => p.id).concat(["player"]));
            const orphans = manifest.models.filter((m) => !placed.has(m.id));
            const spots = LAYOUT.concat(orphans.map((m, i) => ({
                id: m.id, x: -4 + i * 2.4, z: 5.5, yaw: 0,
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
                });
            });

            // ── THE AVATAR ───────────────────────────────────────────────────────────────────────────
            const avatar = protos.get("player")?.clone(true);
            if (avatar) {
                avatar.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
                scene.add(avatar);
            }

            const pos = { x: SPAWN.x, z: SPAWN.z };
            let facing = SPAWN.yaw;
            let camYaw = 0;
            let camElev = CAM_ELEV;
            let camDist = CAM_DIST;

            function home() {
                pos.x = SPAWN.x; pos.z = SPAWN.z;
                facing = SPAWN.yaw; camYaw = 0; camElev = CAM_ELEV; camDist = CAM_DIST;
            }

            const keys = new Set();
            const stick = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
            const look = { active: false, id: null, lx: 0, ly: 0 };
            const el = renderer.domElement;
            el.style.touchAction = "none";
            el.style.cursor = "grab";

            const onKey = (e, isDown) => {
                const k = e.key.toLowerCase();
                if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"]
                    .includes(k)) {
                    e.preventDefault();
                    if (isDown) keys.add(k); else keys.delete(k);
                }
                if (isDown && k === "r") home();
            };
            const kd = (e) => onKey(e, true);
            const ku = (e) => onKey(e, false);
            window.addEventListener("keydown", kd);
            window.addEventListener("keyup", ku);

            const onDown = (e) => {
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
            const onMove = (e) => {
                if (stick.active && e.pointerId === stick.id) {
                    stick.dx = Math.max(-1, Math.min(1, (e.clientX - stick.ox) / 56));
                    stick.dy = Math.max(-1, Math.min(1, (e.clientY - stick.oy) / 56));
                } else if (look.active && e.pointerId === look.id) {
                    camYaw -= (e.clientX - look.lx) * 0.006;
                    camElev = Math.max(CAM_ELEV_MIN, Math.min(CAM_ELEV_MAX,
                        camElev + (e.clientY - look.ly) * 0.004));
                    look.lx = e.clientX; look.ly = e.clientY;
                }
            };
            const onUp = (e) => {
                if (e.pointerId === stick.id) { stick.active = false; stick.dx = 0; stick.dy = 0; }
                if (e.pointerId === look.id) { look.active = false; el.style.cursor = "grab"; }
            };
            const onWheel = (e) => {
                e.preventDefault();
                camDist = Math.max(3.5, Math.min(24, camDist + e.deltaY * 0.006));
            };
            el.addEventListener("pointerdown", onDown);
            el.addEventListener("pointermove", onMove);
            el.addEventListener("pointerup", onUp);
            el.addEventListener("pointercancel", onUp);
            el.addEventListener("wheel", onWheel, { passive: false });

            const resize = () => {
                const w = host.clientWidth || 600;
                // Short-landscape as well as narrow: a phone on its side is WIDER than any phone breakpoint,
                // so the cap is against the window height, not only the width.
                const h = Math.round(Math.min(Math.max(w * 0.62, 300), window.innerHeight * 0.74));
                // ⚠️ setSize WITHOUT the third argument. updateStyle=false leaves the canvas with no CSS size,
                // so it displays at its ATTRIBUTE size -- which setPixelRatio has already multiplied by the
                // device ratio. On a 2x screen that was a viewport twice as tall as its box.
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
                    // ⚠️ MOVEMENT IS RELATIVE TO THE CAMERA, NOT TO THE AVATAR. In an orbiting third-person
                    // view "forward" means away from the camera; relative to the avatar's own facing it would
                    // mean something different every time you swung the camera round, which is unusable.
                    const fx = -Math.sin(camYaw);
                    const fz = -Math.cos(camYaw);
                    const mx = (fx * fwd - fz * strafe) / mag;
                    const mz = (fz * fwd + fx * strafe) / mag;
                    const speed = (keys.has("shift") ? RUN : WALK) * Math.min(mag, 1) * dt;
                    let nx = pos.x + mx * speed;
                    let nz = pos.z + mz * speed;

                    // Push out of anything you walked into rather than stopping dead. Sliding along a surface
                    // is the difference between a walk and a cage.
                    for (const o of solids) {
                        const dx = nx - o.x;
                        const dz = nz - o.z;
                        const d = Math.hypot(dx, dz);
                        const min = o.r + 0.34;
                        if (d < min && d > 0.0001) {
                            nx = o.x + (dx / d) * min;
                            nz = o.z + (dz / d) * min;
                        }
                    }
                    const out = Math.hypot(nx, nz);
                    if (out > WORLD_R) { nx = (nx / out) * WORLD_R; nz = (nz / out) * WORLD_R; }
                    pos.x = nx; pos.z = nz;

                    // The model's front face is -Z after the glTF Y-up conversion, so atan2(-mx, -mz) points
                    // it along the direction of travel. Eased, so a reversal is a turn and not a snap.
                    const want = Math.atan2(-mx, -mz);
                    let diff = ((want - facing + Math.PI) % (Math.PI * 2)) - Math.PI;
                    if (diff < -Math.PI) diff += Math.PI * 2;
                    facing += diff * Math.min(1, dt * 12);
                }

                if (avatar) {
                    avatar.position.set(pos.x, 0, pos.z);
                    avatar.rotation.y = facing;
                }

                camera.position.set(
                    pos.x + Math.sin(camYaw) * Math.cos(camElev) * camDist,
                    CAM_LOOK_Y + Math.sin(camElev) * camDist,
                    pos.z + Math.cos(camYaw) * Math.cos(camElev) * camDist
                );
                camera.lookAt(pos.x, CAM_LOOK_Y + CAM_AIM_RAISE, pos.z);

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

            apiRef.current = { home };

            cleanup = () => {
                cancelAnimationFrame(raf);
                ro.disconnect();
                window.removeEventListener("keydown", kd);
                window.removeEventListener("keyup", ku);
                el.removeEventListener("pointerdown", onDown);
                el.removeEventListener("pointermove", onMove);
                el.removeEventListener("pointerup", onUp);
                el.removeEventListener("pointercancel", onUp);
                el.removeEventListener("wheel", onWheel);
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
                background: "#7d9099", minHeight: 300,
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
                    ? "Drag the left side to walk, the right side to swing the camera."
                    : "WASD or arrows to walk, shift to run, drag to swing the camera, wheel to zoom, R to respawn."}
                <br />
                The camera sits 30° above the ground and the man you are driving is 1.85 m, so he is a ruler
                standing beside everything you look at. Every model in the manifest is placed; anything the
                camp layout does not know about stands in a row at the spawn.
            </p>
        </div>
    );
}
