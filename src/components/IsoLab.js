"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── THE ISOMETRIC LAB ────────────────────────────────────────────────────────────────────────────────────────
// Tap the ground, the hero walks there, and stops. That is the whole feature, and almost all of the work is in
// the three places it can look wrong:
//
//   SKATING     the Walk clip is authored at one speed. Move the body at any other and the feet slide across
//               the floor. Measured in Blender: each foot travels 0.6392 units relative to the hips per step,
//               and the cycle is 24 frames at 24fps, so one loop carries the body two steps -- 1.2784 units
//               per second. Rather than force the body to that number, the clip's timeScale is driven FROM
//               the speed actually achieved each frame, so the contract holds at any speed including the
//               ramps.
//   PIVOTING    a character that changes heading instantly reads as a sprite being dragged. He turns at a
//               capped rate, and his forward speed scales with how well he is facing where he is going.
//   THE SEAM    Walk and Idle are separate clips; cutting between them is visible. They cross-fade, and the
//               fade is shorter leaving Idle than entering it, because starting to move should feel immediate
//               and stopping should settle.
//
// ⚠️ THE HERO FACES +Z HERE. He is built facing -Y in Blender, and the glTF Y-up conversion maps Blender
// (x, y, z) to (x, z, -y) -- so -Y becomes +Z. three.js's own convention is that forward is -Z, so every
// heading in this file is atan2(dx, dz) and NOT the atan2(dx, -dz) you would write for a stock object.

const MODEL_URL = "/models/hero.glb";

// Measured, not chosen. See SKATING above.
const CLIP_SPEED = 1.2784;        // world units per second at timeScale 1
const TURN_RATE = 6.0;            // rad/s
const ARRIVE = 0.12;              // close enough
const EASE_IN = 0.30;             // seconds from standstill to full speed
const SLOW_FROM = 0.55;           // start easing down this far out
const BOUNDS = 7.0;               // keep him on the grid

const AZIMUTHS = [45, 135, 225, 315];
const ZOOMS = [4.2, 6.0, 8.5];

export default function IsoLab() {
    const hostRef = useRef(null);
    const apiRef = useRef(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState(null);
    const [azimuth, setAzimuth] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [follow, setFollow] = useState(true);
    const [hud, setHud] = useState({ state: "Idle", speed: 0, dist: 0 });

    useEffect(() => {
        const api = apiRef.current;
        if (api) { api.azimuth = AZIMUTHS[azimuth]; api.view = ZOOMS[zoom]; api.follow = follow; }
    }, [azimuth, zoom, follow]);

    useEffect(() => {
        let cancelled = false;
        let cleanup = () => {};

        (async () => {
            const THREE = await import("three");
            const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
            const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");
            if (cancelled || !hostRef.current) return;

            const host = hostRef.current;
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0e1418);
            scene.fog = new THREE.Fog(0x0e1418, 16, 30);

            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            host.appendChild(renderer.domElement);

            // Keyed low and frontal for the same reason as the model lab: a high key carves a shadow under
            // the pectoral that reads as a breast on an untextured body.
            const key = new THREE.DirectionalLight(0xfff0dd, 2.1);
            key.position.set(4, 6, 5);
            key.castShadow = true;
            key.shadow.mapSize.set(2048, 2048);
            key.shadow.camera.near = 0.5;
            key.shadow.camera.far = 40;
            key.shadow.camera.left = key.shadow.camera.bottom = -10;
            key.shadow.camera.right = key.shadow.camera.top = 10;
            key.shadow.bias = -0.0015;
            scene.add(key, key.target);
            scene.add(new THREE.DirectionalLight(0x9ec4de, 0.55).translateX(-6).translateY(3).translateZ(-4));
            scene.add(new THREE.HemisphereLight(0x5d7d91, 0x1a1512, 0.45));

            const ground = new THREE.Mesh(
                new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
                new THREE.MeshStandardMaterial({ color: 0x27333a, roughness: 0.95 }),
            );
            ground.receiveShadow = true;
            scene.add(ground);
            const grid = new THREE.GridHelper(32, 32, 0x44606c, 0x2b3a42);
            grid.position.y = 0.002;
            scene.add(grid);

            // The destination marker. Without something on the floor the tap has no feedback and every
            // mis-tap reads as the controls being broken rather than as a missed tap.
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(0.17, 0.26, 32).rotateX(-Math.PI / 2),
                new THREE.MeshBasicMaterial({ color: 0x4ad6c4, transparent: true, opacity: 0.9 }),
            );
            ring.position.y = 0.01;
            ring.visible = false;
            scene.add(ring);

            const draco = new DRACOLoader();
            draco.setDecoderPath("/draco/");
            const loader = new GLTFLoader();
            loader.setDRACOLoader(draco);
            const clock = new THREE.Clock();
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const ray = new THREE.Raycaster();
            const ndc = new THREE.Vector2();
            const hit = new THREE.Vector3();

            loader.load(MODEL_URL, (gltf) => {
                if (cancelled) return;
                const model = gltf.scene;
                model.traverse((o) => {
                    if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
                });
                // Drop the model so its feet sit on y=0, then never touch its transform again -- the rig
                // group below is what moves, so the offset cannot drift.
                const box = new THREE.Box3().setFromObject(model);
                model.position.y -= box.min.y;
                const rig = new THREE.Group();
                rig.add(model);
                scene.add(rig);

                const mixer = new THREE.AnimationMixer(model);
                const actions = {};
                gltf.animations.forEach((c) => {
                    const a = mixer.clipAction(c);
                    a.setLoop(THREE.LoopRepeat, Infinity);
                    actions[c.name] = a;
                });
                const walk = actions.Walk;
                const idle = actions.Idle;
                if (!walk || !idle) { setError("hero.glb has no Walk/Idle clip"); return; }
                idle.play();

                apiRef.current = Object.assign({}, apiRef.current || {}, {
                    rig, mixer, walk, idle, camera, ring, key, plane, ray, ndc, hit,
                    target: null, moving: false, speed: 0,
                    azimuth: AZIMUTHS[azimuth], view: ZOOMS[zoom], follow: true,
                    look: new THREE.Vector3(0, 0.9, 0),
                });
                setReady(true);
            }, undefined, (e) => {
                if (!cancelled) setError(String((e && e.message) || e || "failed to load"));
            });

            // ── INPUT ── pointer events cover mouse and touch with one path. Holding and dragging keeps
            // re-targeting, which on a phone is the difference between tapping repeatedly and steering.
            const pick = (ev) => {
                const api = apiRef.current;
                if (!api) return;
                const r = renderer.domElement.getBoundingClientRect();
                ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1,
                    -((ev.clientY - r.top) / r.height) * 2 + 1);
                ray.setFromCamera(ndc, camera);
                if (!ray.ray.intersectPlane(plane, hit)) return;
                const d = Math.hypot(hit.x, hit.z);
                if (d > BOUNDS) { hit.x *= BOUNDS / d; hit.z *= BOUNDS / d; }
                api.target = { x: hit.x, z: hit.z };
                api.ring.position.set(hit.x, 0.01, hit.z);
                api.ring.visible = true;
            };
            let dragging = false;
            const down = (e) => { dragging = true; renderer.domElement.setPointerCapture(e.pointerId); pick(e); };
            const move = (e) => { if (dragging) pick(e); };
            const up = (e) => {
                dragging = false;
                try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
            };
            renderer.domElement.addEventListener("pointerdown", down);
            renderer.domElement.addEventListener("pointermove", move);
            renderer.domElement.addEventListener("pointerup", up);
            renderer.domElement.addEventListener("pointercancel", up);

            const resize = () => {
                const w = host.clientWidth || 1;
                const h = host.clientHeight || 1;
                const api = apiRef.current;
                const view = (api && api.view) || ZOOMS[zoom];
                const aspect = w / h;
                camera.left = -view * aspect;
                camera.right = view * aspect;
                camera.top = view;
                camera.bottom = -view;
                camera.updateProjectionMatrix();
                renderer.setSize(w, h, false);
            };
            resize();
            const ro = new ResizeObserver(resize);
            ro.observe(host);

            let raf = 0;
            let lastView = ZOOMS[zoom];
            let hudAt = 0;
            const tick = () => {
                raf = requestAnimationFrame(tick);
                const dt = Math.min(clock.getDelta(), 0.05);   // a backgrounded tab returns a huge delta
                const api = apiRef.current;
                if (!api || !api.rig) { renderer.render(scene, camera); return; }

                const { rig, target } = api;
                let dist = 0;
                let step = 0;
                if (target) {
                    const dx = target.x - rig.position.x;
                    const dz = target.z - rig.position.z;
                    dist = Math.hypot(dx, dz);
                    if (dist > ARRIVE) {
                        // ── TURN ── capped, and shortest way round.
                        const want = Math.atan2(dx, dz);
                        let diff = want - rig.rotation.y;
                        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
                        const cap = TURN_RATE * dt;
                        rig.rotation.y += Math.max(-cap, Math.min(cap, diff));

                        // ── SPEED ── eased in from rest, eased down on approach, and scaled by how well
                        // he faces the target so a hard turn becomes a pivot rather than a sideways slide.
                        // The floor of 0.3 keeps him stepping through the turn; at 0 the walk clip would
                        // freeze mid-stride, which looks like a bug.
                        const align = Math.max(0.3, Math.cos(diff));
                        const near = dist < SLOW_FROM ? 0.45 + 0.55 * (dist / SLOW_FROM) : 1;
                        const want_s = CLIP_SPEED * align * near;
                        api.speed += (want_s - api.speed) * Math.min(1, dt / EASE_IN);
                        step = Math.min(api.speed * dt, dist);
                        rig.position.x += Math.sin(rig.rotation.y) * step;
                        rig.position.z += Math.cos(rig.rotation.y) * step;
                    } else {
                        api.target = null;
                        api.ring.visible = false;
                        api.speed = 0;
                    }
                } else {
                    api.speed = 0;
                }

                const moving = step > 0.0001;
                if (moving !== api.moving) {
                    api.moving = moving;
                    const [to, from, secs] = moving
                        ? [api.walk, api.idle, 0.14]      // starting should feel immediate
                        : [api.idle, api.walk, 0.26];     // stopping should settle
                    to.reset().setEffectiveWeight(1).play();
                    // ⚠️ NO WARPING. crossFadeFrom's third argument re-times both clips so their
                    // durations match during the fade, which is right in the model lab and wrong here:
                    // Walk is 24 frames and Idle is 48, so warping would run the walk at double rate for
                    // the length of the fade and fight the anti-skate below for control of the same
                    // property. The timeScale has one owner.
                    to.crossFadeFrom(from, secs, false);
                }
                // ⚠️ THE ANTI-SKATE. Drive the clip from the distance actually covered this frame, not from
                // the speed we asked for -- they differ on the last frame before arrival and during the ramps.
                if (moving) {
                    api.walk.setEffectiveTimeScale(
                        Math.max(0.2, Math.min(1.8, (step / dt) / CLIP_SPEED)));
                }
                api.mixer.update(dt);

                // ── CAMERA ── fixed isometric angle, optionally trailing him. 35.264 degrees is the true
                // isometric elevation: the one where the three axes project to equal lengths.
                if (api.follow) api.look.lerp(new THREE.Vector3(rig.position.x, 0.9, rig.position.z), 1 - Math.pow(0.002, dt));
                else api.look.lerp(new THREE.Vector3(0, 0.9, 0), 1 - Math.pow(0.02, dt));
                const a = (api.azimuth * Math.PI) / 180;
                const e = Math.atan(1 / Math.SQRT2);
                const D = 24;
                camera.position.set(
                    api.look.x + D * Math.cos(e) * Math.sin(a),
                    api.look.y + D * Math.sin(e),
                    api.look.z + D * Math.cos(e) * Math.cos(a));
                camera.lookAt(api.look);
                key.position.set(api.look.x + 5, 9, api.look.z + 4);
                key.target.position.copy(api.look);
                key.target.updateMatrixWorld();
                if (api.view !== lastView) { lastView = api.view; resize(); }

                if (api.ring.visible) {
                    const p = 1 + 0.08 * Math.sin(clock.elapsedTime * 7);
                    api.ring.scale.set(p, 1, p);
                }
                renderer.render(scene, camera);

                hudAt += dt;
                if (hudAt > 0.12) {
                    hudAt = 0;
                    setHud({ state: moving ? "Walk" : "Idle", speed: step / dt, dist });
                }
            };
            tick();

            cleanup = () => {
                cancelAnimationFrame(raf);
                ro.disconnect();
                renderer.domElement.removeEventListener("pointerdown", down);
                renderer.domElement.removeEventListener("pointermove", move);
                renderer.domElement.removeEventListener("pointerup", up);
                renderer.domElement.removeEventListener("pointercancel", up);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const recentre = useCallback(() => {
        const api = apiRef.current;
        if (!api || !api.rig) return;
        api.rig.position.set(0, 0, 0);
        api.target = null;
        api.ring.visible = false;
    }, []);

    return (
        <div className="lab">
            <div className="stage" ref={hostRef}>
                {!ready && !error ? <p className="hint">Loading…</p> : null}
                {error ? <p className="hint err">Could not load the model: {error}</p> : null}
                {ready ? <p className="tip">Tap the ground. Hold and drag to steer.</p> : null}
            </div>

            <div className="row">
                <span className="lbl">Camera</span>
                <button type="button" onClick={() => setAzimuth((a) => (a + 1) % AZIMUTHS.length)}>
                    Rotate {AZIMUTHS[azimuth]}°
                </button>
                {ZOOMS.map((z, i) => (
                    <button key={z} type="button" className={i === zoom ? "on" : ""}
                        onClick={() => setZoom(i)} aria-pressed={i === zoom}>
                        {i === 0 ? "Close" : i === 1 ? "Mid" : "Wide"}
                    </button>
                ))}
                <button type="button" className={follow ? "on" : ""}
                    onClick={() => setFollow((f) => !f)} aria-pressed={follow}>
                    Follow
                </button>
                <button type="button" onClick={recentre}>Recentre</button>
            </div>

            <dl className="facts">
                <div><dt>State</dt><dd>{hud.state}</dd></div>
                <div><dt>Speed</dt><dd>{hud.speed.toFixed(2)} u/s</dd></div>
                <div><dt>To target</dt><dd>{hud.dist.toFixed(2)} u</dd></div>
                <div><dt>Clip speed</dt><dd>{CLIP_SPEED} u/s</dd></div>
            </dl>

            <p className="muted note">
                The hero moves in a straight line — there is no obstacle avoidance and nothing to avoid, so
                &ldquo;pathing&rdquo; here is steering, not a search. The number that matters is{" "}
                <strong>Speed</strong> against <strong>Clip speed</strong>: the walk cycle was authored at
                1.2784 u/s (measured in Blender — 0.6392 units of foot travel per step, two steps per 1s loop),
                and the clip&apos;s playback rate is driven from the distance actually covered each frame, so
                the feet stay planted through the acceleration ramp and the turn.
            </p>

            <style jsx>{`
                .lab { display: flex; flex-direction: column; gap: 10px; }
                .stage {
                    position: relative;
                    width: 100%;
                    aspect-ratio: 4 / 3;
                    max-height: 72vh;
                    border-radius: 10px;
                    overflow: hidden;
                    background: #0e1418;
                    border: 1px solid rgba(255, 255, 255, 0.09);
                    touch-action: none;
                    cursor: crosshair;
                }
                .stage :global(canvas) { display: block; width: 100%; height: 100%; }
                .hint {
                    position: absolute; inset: 0; margin: 0;
                    display: flex; align-items: center; justify-content: center;
                    color: #8fa6ae; font-size: 14px; text-align: center; padding: 0 16px;
                }
                .hint.err { color: #e2a0a0; }
                .tip {
                    position: absolute; left: 10px; bottom: 9px; margin: 0;
                    font-size: 12px; color: #7f98a2; pointer-events: none;
                    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
                }
                .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
                .lbl {
                    font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
                    color: #8fa6ae; min-width: 54px;
                }
                button {
                    font: inherit; font-size: 14px;
                    padding: 7px 13px; border-radius: 7px;
                    border: 1px solid rgba(255, 255, 255, 0.14);
                    background: rgba(255, 255, 255, 0.05);
                    color: #dce8ea; cursor: pointer; min-height: 38px;
                }
                button:hover { background: rgba(255, 255, 255, 0.1); }
                button.on {
                    background: #2e8f86; border-color: #39b3a7;
                    color: #04120f; font-weight: 600;
                }
                button:focus-visible { outline: 2px solid #45d6c6; outline-offset: 2px; }
                .facts {
                    display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
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
