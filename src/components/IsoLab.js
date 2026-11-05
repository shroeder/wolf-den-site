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

// Measured, not chosen -- `_stride.py` prints these. See SKATING above.
// The run is not a fast walk: 38% of its cycle has both feet off the ground,
// which is what a duty factor below 0.5 means and what makes it a run.
const GAIT = { Walk: 1.2784, Run: 4.6710 };
const UP_AT = 3.00;               // actual speed at which Walk becomes Run
const DOWN_AT = 2.30;             // and back. The gap is hysteresis: one
                                  // threshold would flutter between the two
                                  // clips for as long as he held that speed.
const TURN_RATE = 6.0;            // rad/s
const ARRIVE = 0.12;              // close enough
const EASE_IN = 0.30;             // seconds from standstill to full speed
const APPROACH = 2.6;             // target speed is distance x this, so he
                                  // sheds run -> walk -> stop on his own
// ⚠️ ANY LIMIT MEASURED FROM THE WORLD ORIGIN SHRINKS AS HE WALKS AWAY FROM
// IT. The first version clamped taps to 7 units from (0,0), so the further he
// got the less of the visible floor would accept a tap -- it read as the
// controls going stiff rather than as a boundary, because the boundary was
// off-screen. The floor is endless now (it follows him) and the only clamp
// left is relative to the HERO, far outside anything on screen, and exists
// solely so a grazing ray cannot return a destination a mile away.
const REACH = 60.0;

// three.js lights are physical since r155, so a point light's intensity is in
// candela and does not compare to the directional key's number at all. Rather
// than pick one and hope, the lamp has a dial.
const LAMP = [{ k: "Dim", v: 14 }, { k: "Warm", v: 34 }, { k: "Blaze", v: 78 }];
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
    const [sun, setSun] = useState(true);
    const [lampOn, setLampOn] = useState(true);
    const [lampLvl, setLampLvl] = useState(1);
    const [placing, setPlacing] = useState(false);
    const [maxGait, setMaxGait] = useState("Run");
    const [hud, setHud] = useState({ state: "Idle", speed: 0, dist: 0 });

    useEffect(() => {
        const api = apiRef.current;
        if (!api) return;
        api.azimuth = AZIMUTHS[azimuth];
        api.view = ZOOMS[zoom];
        api.follow = follow;
        api.placing = placing;
        api.maxGait = maxGait;
        api.lampOn = lampOn;
        api.lampWatts = LAMP[lampLvl].v;
        api.sun = sun;
        if (api.key) api.key.intensity = sun ? 2.1 : 0.12;
        if (api.flame) api.flame.visible = lampOn;
        if (api.bulb) api.bulb.visible = lampOn;
    }, [azimuth, zoom, follow, sun, lampOn, lampLvl, placing, maxGait, ready]);

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
            // ⚠️ FOG IS MEASURED FROM THE CAMERA, AND AN ISO CAMERA IS FAR AWAY. At
            // near 16 / far 30 with the camera parked 24 units back, the hero himself sat at 57% fog --
            // every surface in the scene was being mixed more than half way to the background colour,
            // which reads as "the lighting is bad" and is not. The band now starts past him and only
            // catches the far edge of the grid.
            scene.fog = new THREE.Fog(0x0e1418, 27, 52);

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
                new THREE.PlaneGeometry(220, 220).rotateX(-Math.PI / 2),
                new THREE.MeshStandardMaterial({ color: 0x27333a, roughness: 0.95 }),
            );
            ground.receiveShadow = true;
            scene.add(ground);
            const grid = new THREE.GridHelper(72, 72, 0x44606c, 0x2b3a42);
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

            // ── THE LAMP ── a real point light with a body you can see, so its shadows have an
            // obvious source. Shadow-casting point lights render six faces, which is why there is
            // exactly one of them.
            const lamp = new THREE.Group();
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.045, 0.075, 1.5, 10),
                new THREE.MeshStandardMaterial({ color: 0x1d2328, roughness: 0.6, metalness: 0.7 }),
            );
            post.position.y = 0.75;
            post.castShadow = true;
            const bulb = new THREE.Mesh(
                new THREE.SphereGeometry(0.15, 20, 14),
                new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
            );
            bulb.position.y = 1.62;
            const flame = new THREE.PointLight(0xffb46a, 34, 18, 2);
            flame.position.y = 1.62;
            flame.castShadow = true;
            flame.shadow.mapSize.set(512, 512);   // x6 faces; this one opens on a phone
            flame.shadow.bias = -0.004;
            lamp.add(post, bulb, flame);
            lamp.position.set(2.5, 0, -2.5);
            scene.add(lamp);

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
                const idle = actions.Idle;
                if (!idle || !actions.Walk || !actions.Run) {
                    setError("hero.glb is missing an Idle, Walk or Run clip");
                    return;
                }
                idle.play();

                apiRef.current = Object.assign({}, apiRef.current || {}, {
                    rig, mixer, actions, idle, camera, ring, key, plane, ray, ndc, hit,
                    gait: "Idle",
                    lamp, flame, bulb, placing: false, sun: true, lampOn: true, lampWatts: LAMP[1].v,
                    maxGait: "Run",
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
                if (api.placing) {
                    api.lamp.position.set(hit.x, 0, hit.z);
                    return;
                }
                const dx = hit.x - api.rig.position.x;
                const dz = hit.z - api.rig.position.z;
                const d = Math.hypot(dx, dz);
                const k = d > REACH ? REACH / d : 1;
                const tx = api.rig.position.x + dx * k;
                const tz = api.rig.position.z + dz * k;
                api.target = { x: tx, z: tz };
                api.ring.position.set(tx, 0.01, tz);
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

                        // ── SPEED ── target is proportional to what is left to cover, capped at
                        // the fastest gait allowed. That single line gives the whole approach for
                        // free: he cruises at a run, passes down through walking pace as he nears,
                        // and arrives slowly, without any of it being scripted. Scaled by how well
                        // he faces the target so a hard turn is a pivot and not a sideways slide --
                        // floored at 0.3, because at 0 the clip would freeze mid-stride and read as
                        // a bug rather than a turn.
                        const align = Math.max(0.3, Math.cos(diff));
                        const top = GAIT[api.maxGait || "Run"];   // `cap` is the turn limiter above
                        const want_s = Math.min(top, Math.max(0.42 * GAIT.Walk, dist * APPROACH)) * align;
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

                // ── GAIT ── chosen from the speed actually achieved, not from the distance
                // remaining. Those differ during the acceleration ramp and through every turn, and
                // picking on distance makes him break into a run while still standing still.
                const actual = step / dt;
                let gait = "Idle";
                if (step > 0.0001) {
                    const run = api.gait === "Run" ? actual > DOWN_AT : actual > UP_AT;
                    gait = run && (api.maxGait || "Run") === "Run" ? "Run" : "Walk";
                }
                if (gait !== api.gait) {
                    const from = api.actions[api.gait] || api.idle;
                    const to = api.actions[gait] || api.idle;
                    // Leaving a standstill should feel immediate; arriving at one should settle.
                    const secs = gait === "Idle" ? 0.26 : (api.gait === "Idle" ? 0.14 : 0.20);
                    to.reset().setEffectiveWeight(1).play();
                    // ⚠️ NO WARPING -- see the note on the anti-skate below. Warping re-times both
                    // clips to match durations, and the timeScale has exactly one owner here.
                    if (to !== from) to.crossFadeFrom(from, secs, false);
                    api.gait = gait;
                }
                // ⚠️ THE ANTI-SKATE. Drive the clip from the distance actually covered this frame,
                // against THAT GAIT's own authored speed -- they differ on the last frame before
                // arrival and all through the ramps.
                if (gait !== "Idle") {
                    api.actions[gait].setEffectiveTimeScale(
                        Math.max(0.2, Math.min(1.8, actual / GAIT[gait])));
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
                // ── THE FLOOR FOLLOWS ── an unlit flat plane can be moved under the camera without
                // anyone seeing it move, and the grid is snapped to whole cells so its lines stay put.
                // Together that is an endless floor, which is what makes removing the clamp safe.
                ground.position.set(api.look.x, 0, api.look.z);
                grid.position.set(Math.round(api.look.x), 0.002, Math.round(api.look.z));
                if (api.view !== lastView) { lastView = api.view; resize(); }

                // A steady point light reads as a bulb; a flickering one reads as a flame. Cheap,
                // and it is the difference between "there is a light here" and "there is a fire here".
                if (api.lampOn) {
                    const fl = 0.86 + 0.14 * Math.sin(clock.elapsedTime * 11.3)
                        * Math.sin(clock.elapsedTime * 4.1);
                    api.flame.intensity = (api.lampWatts || 34) * fl;
                    api.bulb.material.color.setRGB(1, 0.84 * fl + 0.1, 0.62 * fl);
                }

                if (api.ring.visible) {
                    const p = 1 + 0.08 * Math.sin(clock.elapsedTime * 7);
                    api.ring.scale.set(p, 1, p);
                }
                renderer.render(scene, camera);

                hudAt += dt;
                if (hudAt > 0.12) {
                    hudAt = 0;
                    setHud({ state: gait, speed: actual, dist });
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
                {ready ? (
                    <p className="tip">
                        {placing ? "Tap to drop the lamp." : "Tap the ground. Hold and drag to steer."}
                    </p>
                ) : null}
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

            <div className="row">
                <span className="lbl">Gait</span>
                {["Walk", "Run"].map((g) => (
                    <button key={g} type="button" className={maxGait === g ? "on" : ""}
                        onClick={() => setMaxGait(g)} aria-pressed={maxGait === g}>
                        {g === "Walk" ? "Walk only" : "Up to run"}
                    </button>
                ))}
            </div>

            <div className="row">
                <span className="lbl">Light</span>
                <button type="button" className={sun ? "on" : ""}
                    onClick={() => setSun((v) => !v)} aria-pressed={sun}>Sun</button>
                <button type="button" className={lampOn ? "on" : ""}
                    onClick={() => setLampOn((v) => !v)} aria-pressed={lampOn}>Lamp</button>
                {LAMP.map((l, i) => (
                    <button key={l.k} type="button" className={i === lampLvl ? "on" : ""}
                        onClick={() => { setLampLvl(i); setLampOn(true); }}
                        aria-pressed={i === lampLvl}>{l.k}</button>
                ))}
                <button type="button" className={placing ? "on" : ""}
                    onClick={() => setPlacing((v) => !v)} aria-pressed={placing}>
                    {placing ? "Tap to place lamp" : "Move lamp"}
                </button>
            </div>

            <dl className="facts">
                <div><dt>State</dt><dd>{hud.state}</dd></div>
                <div><dt>Speed</dt><dd>{hud.speed.toFixed(2)} u/s</dd></div>
                <div><dt>To target</dt><dd>{hud.dist.toFixed(2)} u</dd></div>
                <div><dt>Clip speed</dt><dd>{hud.state === "Idle" ? "—" : `${GAIT[hud.state]} u/s`}</dd></div>
            </dl>

            <p className="muted note">
                Turn the <strong>Sun</strong> off to see the lamp on its own — it is a shadow-casting point
                light, so walking him past it swings his shadow round. The floor is endless: it follows the
                camera and the grid snaps to whole cells, so there is nowhere he cannot be sent.
                The hero moves in a straight line — there is no obstacle avoidance and nothing to avoid, so
                &ldquo;pathing&rdquo; here is steering, not a search. The number that matters is{" "}
                <strong>Speed</strong> against <strong>Clip speed</strong>: the walk was authored at 1.2784
                u/s and the run at 4.6710, both measured in Blender rather than chosen, and each clip&apos;s
                playback rate is driven from the distance actually covered each frame — so the feet stay
                planted through the acceleration ramp, the turn, and the hand-over between gaits. He picks
                the gait from the speed he is actually making, and his target speed is simply proportional
                to the distance left, which is what sheds run → walk → stop on the approach without any of
                it being scripted.
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
