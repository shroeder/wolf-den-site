"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── DEN QUEST — THE 3D CLIENT ────────────────────────────────────────────────────────────────────────────────
// Your Wolf Den account, a low-poly world, and everyone else who is in it.
//
// ⚠️ THE SIMULATION IS IMPORTED FROM THE SERVER'S OWN FOLDER, NOT COPIED. `@sim/*` and `@rtclient/*` alias
// straight into gameserver/. The decision record's closing line is "the sim is one module" -- the predictor
// here runs the identical stepPlayer the authoritative server runs, so prediction cannot drift from truth by
// construction rather than by discipline. A copy under src/ would compile just as well and be wrong within a
// week.
//
// ⚠️ three.js AND THE NETCODE ARE BOTH IMPORTED INSIDE THE EFFECT. ~600KB that must never land in the shared
// bundle for a page most members will never open.
//
// ⚠️ AND THE TICKET IS FETCHED FROM THIS ORIGIN. That is the entire reason this page lives on the Wolf Den
// domain rather than on denquestonline.com: the session cookie is host-only, so a client served from another
// registrable domain gets a 401 and no amount of netcode fixes it.

const EYE_HEIGHT = 1.62;
const CAM_ELEV = 30 * Math.PI / 180;      // the house angle, same as the walk lab
const CAM_DIST = 11.0;
const CAM_AIM_RAISE = 2.4;

export default function DenQuest({ serverUrl }) {
    const hostRef = useRef(null);
    const apiRef = useRef(null);
    const [status, setStatus] = useState("connecting");
    const [error, setError] = useState(null);
    const [hud, setHud] = useState({ hp: 100, players: 1, ping: 0, name: "" });
    const [log, setLog] = useState([]);
    const [touch, setTouch] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined" && window.matchMedia) {
            setTouch(window.matchMedia("(pointer: coarse)").matches);
        }
    }, []);

    const note = useCallback((t) => setLog((p) => [t, ...p].slice(0, 4)), []);

    useEffect(() => {
        let cancelled = false;
        let cleanup = () => {};

        (async () => {
            // ── 1. WHO ARE YOU ───────────────────────────────────────────────────────────────────
            const res = await fetch("/api/marketplace/rt-ticket", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ zone: "ashfall-1" }),
            }).catch(() => null);
            if (!res?.ok) {
                if (!cancelled) setError(res?.status === 401 ? "Sign in to play." : "Could not get a ticket.");
                return;
            }
            const { ticket } = await res.json();
            if (cancelled) return;

            const [THREE, { GLTFLoader }, { createClient }, protocol, world] = await Promise.all([
                import("three"),
                import("three/examples/jsm/loaders/GLTFLoader.js"),
                import("@rtclient/net.js"),
                import("@sim/protocol.js"),
                import("@sim/world.js"),
            ]);
            if (cancelled || !hostRef.current) return;

            const { FLAG, WORLD, PLAYER, EVENT } = protocol;
            const { facingToRadians } = world;

            // ── 2. THE SCENE ─────────────────────────────────────────────────────────────────────
            const host = hostRef.current;
            const SKY = 0x7d9099;
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(SKY);
            scene.fog = new THREE.Fog(SKY, 26, 90);

            const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 260);
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFShadowMap;
            renderer.toneMapping = THREE.NoToneMapping;
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.domElement.style.display = "block";
            host.appendChild(renderer.domElement);

            const key = new THREE.DirectionalLight(0xffffff, 2.15);
            key.position.set(14, 26, 10);
            key.castShadow = true;
            key.shadow.mapSize.set(2048, 2048);
            key.shadow.camera.left = -30; key.shadow.camera.right = 30;
            key.shadow.camera.top = 30; key.shadow.camera.bottom = -30;
            key.shadow.camera.far = 90;
            key.shadow.bias = -0.0012;
            const fill = new THREE.DirectionalLight(0xffffff, 0.55);
            fill.position.set(-16, 10, 8);
            const rim = new THREE.DirectionalLight(0xffffff, 0.75);
            rim.position.set(-6, 14, -18);
            scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.46));

            const ground = new THREE.Mesh(
                new THREE.CircleGeometry(160, 64).rotateX(-Math.PI / 2),
                new THREE.MeshStandardMaterial({ color: 0x36442a, roughness: 0.95 })
            );
            ground.receiveShadow = true;
            scene.add(ground);

            // ── 3. THE MODELS ────────────────────────────────────────────────────────────────────
            const loader = new GLTFLoader();
            const load = (url) => new Promise((ok) => loader.load(url, (g) => ok(g.scene), undefined, () => ok(null)));
            const [playerProto, goblinProto, treeProto, rockProto] = await Promise.all([
                load("/models/lp/player.glb"), load("/models/lp/goblin.glb"),
                load("/models/lp/tree.glb"), load("/models/lp/rock.glb"),
            ]);
            if (cancelled) return;
            if (!playerProto) { setError("Models did not load."); return; }

            const shadowed = (n) => { n.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return n; };

            // ⚠️ SCENERY IS PLACED FROM A SEEDED HASH, NOT Math.random. Every client must draw the same
            //    forest or "meet me by the tree" means nothing, and the server does not send scenery --
            //    it is not simulated, so it has to be reproducible from the position alone.
            const hash = (n) => {
                let h = Math.imul(n ^ 0x9e3779b9, 2654435761);
                h = (h ^ (h >>> 15)) >>> 0;
                return h / 4294967296;
            };
            const dressing = new THREE.Group();
            for (let i = 0; i < 90; i += 1) {
                const a = hash(i) * Math.PI * 2;
                const r = 18 + hash(i + 977) * 70;
                const isTree = hash(i + 55) > 0.42;
                const proto = isTree ? treeProto : rockProto;
                if (!proto) continue;
                const node = shadowed(proto.clone(true));
                node.position.set(
                    WORLD.spawn.x + Math.cos(a) * r,
                    0,
                    WORLD.spawn.y + Math.sin(a) * r
                );
                node.rotation.y = hash(i + 311) * Math.PI * 2;
                node.scale.setScalar(0.9 + hash(i + 733) * 0.25);
                dressing.add(node);
            }
            scene.add(dressing);

            // ── 4. THE CONNECTION ────────────────────────────────────────────────────────────────
            const ws = new WebSocket(serverUrl);
            ws.binaryType = "arraybuffer";
            const client = createClient({
                send: (d) => ws.readyState === 1 && ws.send(d),
                now: () => performance.now(),
            });
            ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "ticket", ticket })));
            ws.addEventListener("message", (ev) => {
                const bin = ev.data instanceof ArrayBuffer;
                client.onMessage(bin ? new Uint8Array(ev.data) : ev.data, bin);
                if (!bin) {
                    try {
                        const m = JSON.parse(ev.data);
                        if (m.type === "welcome") { setStatus("playing"); setHud((h) => ({ ...h, name: m.you?.name || "" })); }
                        if (m.type === "denied") setError("That sign-in could not be verified. Reload to try again.");
                    } catch { /* ignore */ }
                }
            });
            ws.addEventListener("close", () => !cancelled && setStatus("disconnected"));
            ws.addEventListener("error", () => !cancelled && setStatus("disconnected"));

            // ── 5. AVATARS, CREATED AND REMOVED AS PEOPLE COME AND GO ─────────────────────────────
            const avatars = new Map();
            const nameSprite = (text) => {
                const c = document.createElement("canvas");
                c.width = 256; c.height = 64;
                const g = c.getContext("2d");
                g.font = "600 30px ui-monospace, monospace";
                g.textAlign = "center";
                g.fillStyle = "rgba(10,20,22,.55)";
                g.fillRect(0, 12, 256, 40);
                g.fillStyle = "#dff0ec";
                g.fillText(String(text).slice(0, 16), 128, 42);
                const tex = new THREE.CanvasTexture(c);
                tex.colorSpace = THREE.SRGBColorSpace;
                const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
                s.scale.set(2.6, 0.65, 1);
                return s;
            };

            function avatarFor(id, isEnemy) {
                let a = avatars.get(id);
                if (a) return a;
                const proto = isEnemy ? goblinProto : playerProto;
                if (!proto) return null;
                const node = shadowed(proto.clone(true));
                const group = new THREE.Group();
                group.add(node);
                if (!isEnemy) {
                    const tag = nameSprite(id === client.state.playerId ? "you" : `#${id}`);
                    tag.position.y = 2.25;
                    group.add(tag);
                }
                scene.add(group);
                a = { group, node, isEnemy };
                avatars.set(id, a);
                return a;
            }

            // ── 6. FLOATING DAMAGE, FROM EVENTS AND NOTHING ELSE ─────────────────────────────────
            const floaters = [];
            let seenEvents = 0;

            // ── 7. THE LOOP ──────────────────────────────────────────────────────────────────────
            const keys = new Set();
            const onKey = (e, down) => {
                const k = e.key.toLowerCase();
                if (["w", "a", "s", "d", " ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
                    e.preventDefault();
                    if (down) keys.add(k); else keys.delete(k);
                }
            };
            const kd = (e) => onKey(e, true);
            const ku = (e) => onKey(e, false);
            window.addEventListener("keydown", kd);
            window.addEventListener("keyup", ku);

            let camYaw = 0;
            const stick = { on: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
            const look = { on: false, id: null, lx: 0 };
            const el = renderer.domElement;
            el.style.touchAction = "none";
            const down = (e) => {
                const rect = el.getBoundingClientRect();
                if (e.pointerType === "touch" && (e.clientX - rect.left) < rect.width * 0.45 && !stick.on) {
                    stick.on = true; stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY;
                } else if (!look.on) {
                    look.on = true; look.id = e.pointerId; look.lx = e.clientX;
                }
                el.setPointerCapture?.(e.pointerId);
            };
            const move = (e) => {
                if (stick.on && e.pointerId === stick.id) {
                    stick.dx = Math.max(-1, Math.min(1, (e.clientX - stick.ox) / 54));
                    stick.dy = Math.max(-1, Math.min(1, (e.clientY - stick.oy) / 54));
                } else if (look.on && e.pointerId === look.id) {
                    camYaw -= (e.clientX - look.lx) * 0.006;
                    look.lx = e.clientX;
                }
            };
            const up = (e) => {
                if (e.pointerId === stick.id) { stick.on = false; stick.dx = 0; stick.dy = 0; }
                if (e.pointerId === look.id) look.on = false;
            };
            const tap = (e) => { if (e.pointerType === "touch" && (e.clientX - el.getBoundingClientRect().left) >= el.clientWidth * 0.45) keys.add("__tapswing"); };
            el.addEventListener("pointerdown", down);
            el.addEventListener("pointermove", move);
            el.addEventListener("pointerup", up);
            el.addEventListener("pointercancel", up);
            el.addEventListener("pointerdown", tap);

            const resize = () => {
                const w = host.clientWidth || 640;
                const h = Math.round(Math.min(Math.max(w * 0.58, 320), window.innerHeight * 0.76));
                renderer.setSize(w, h);
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
            };
            resize();
            const ro = new ResizeObserver(resize);
            ro.observe(host);

            let raf = 0;
            let last = performance.now();
            let hudAt = 0;
            const tmp = new THREE.Vector3();

            const frame = (nowMs) => {
                raf = requestAnimationFrame(frame);
                const dtMs = Math.min(nowMs - last, 100);
                last = nowMs;

                // ── INPUT, RELATIVE TO THE CAMERA ────────────────────────────────────────
                // ⚠️ WASD IS CAMERA-RELATIVE, NOT WORLD-RELATIVE. "Forward" has to mean away
                //    from the camera or swinging the view makes the controls lie. The server
                //    receives the same four booleans either way -- the rotation happens here,
                //    before prediction, so the server and the predictor agree on what was
                //    pressed.
                let ix = 0;
                let iy = 0;
                if (keys.has("a") || keys.has("arrowleft")) ix -= 1;
                if (keys.has("d") || keys.has("arrowright")) ix += 1;
                if (keys.has("w") || keys.has("arrowup")) iy -= 1;
                if (keys.has("s") || keys.has("arrowdown")) iy += 1;
                if (stick.on) { ix += stick.dx; iy += stick.dy; }
                const cos = Math.cos(camYaw);
                const sin = Math.sin(camYaw);
                const wx = ix * cos - iy * sin;
                const wy = ix * sin + iy * cos;
                const attack = keys.has(" ") || keys.delete("__tapswing");

                client.sendInput({
                    left: wx < -0.3, right: wx > 0.3,
                    forward: wy < -0.3, back: wy > 0.3,
                    attack, dtMs,
                });

                // ── EVENTS → FLOATERS ────────────────────────────────────────────────────
                const evs = client.state.events;
                for (let i = seenEvents; i < evs.length; i += 1) {
                    const e = evs[i];
                    if (e.event !== EVENT.HIT) continue;
                    const at = client.renderPosition(e.targetId);
                    if (at) floaters.push({ x: at.x, y: at.y, amount: e.amount, crit: e.crit, born: nowMs, mine: e.actorId === client.state.playerId });
                    if (e.targetId === client.state.playerId) note(`hit for ${e.amount}`);
                }
                seenEvents = evs.length;

                // ── DRAW EVERY ENTITY ────────────────────────────────────────────────────
                const live = new Set();
                let players = 0;
                for (const [id, ent] of client.state.authoritative) {
                    const pos = client.renderPosition(id);
                    if (!pos) continue;
                    const isEnemy = (ent.flags & FLAG.IS_ENEMY) !== 0;
                    const dead = (ent.flags & FLAG.DEAD) !== 0;
                    const a = avatarFor(id, isEnemy);
                    if (!a) continue;
                    live.add(id);
                    if (!isEnemy) players += 1;
                    a.group.visible = !dead;
                    a.group.position.set(pos.x, 0, pos.y);
                    a.node.rotation.y = facingToRadians(pos.facing ?? ent.facing ?? 0);
                }
                for (const [id, a] of avatars) {
                    if (live.has(id)) continue;
                    scene.remove(a.group);
                    avatars.delete(id);
                }

                // ── FLOATERS ─────────────────────────────────────────────────────────────
                for (let i = floaters.length - 1; i >= 0; i -= 1) {
                    const f = floaters[i];
                    const age = nowMs - f.born;
                    if (age > 1100) { floaters.splice(i, 1); continue; }
                    if (!f.sprite) {
                        const c = document.createElement("canvas");
                        c.width = 128; c.height = 64;
                        const g = c.getContext("2d");
                        g.font = `700 ${f.crit ? 44 : 34}px ui-monospace, monospace`;
                        g.textAlign = "center";
                        g.fillStyle = f.crit ? "#ffd98a" : (f.mine ? "#ffe3e3" : "#ff9c9c");
                        g.fillText(`-${f.amount}`, 64, 46);
                        const tex = new THREE.CanvasTexture(c);
                        tex.colorSpace = THREE.SRGBColorSpace;
                        f.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
                        f.sprite.scale.set(2.2, 1.1, 1);
                        scene.add(f.sprite);
                    }
                    f.sprite.position.set(f.x, 2.1 + age * 0.0016, f.y);
                    f.sprite.material.opacity = Math.max(0, 1 - age / 1100);
                    if (age > 1090) scene.remove(f.sprite);
                }

                // ── CAMERA ───────────────────────────────────────────────────────────────
                const me = client.state.predicted;
                camera.position.set(
                    me.x + Math.sin(camYaw) * Math.cos(CAM_ELEV) * CAM_DIST,
                    EYE_HEIGHT + Math.sin(CAM_ELEV) * CAM_DIST,
                    me.y + Math.cos(camYaw) * Math.cos(CAM_ELEV) * CAM_DIST
                );
                tmp.set(me.x, EYE_HEIGHT + CAM_AIM_RAISE, me.y);
                camera.lookAt(tmp);

                if (nowMs - hudAt > 250) {
                    hudAt = nowMs;
                    setHud((h) => ({ ...h, hp: Math.round(me.hp ?? 0), players }));
                }
                renderer.render(scene, camera);
            };
            raf = requestAnimationFrame(frame);

            apiRef.current = { client };

            cleanup = () => {
                cancelAnimationFrame(raf);
                ro.disconnect();
                window.removeEventListener("keydown", kd);
                window.removeEventListener("keyup", ku);
                el.removeEventListener("pointerdown", down);
                el.removeEventListener("pointermove", move);
                el.removeEventListener("pointerup", up);
                el.removeEventListener("pointercancel", up);
                el.removeEventListener("pointerdown", tap);
                try { ws.close(); } catch { /* already gone */ }
                renderer.dispose();
                scene.traverse((o) => {
                    if (o.isMesh || o.isSprite) {
                        o.geometry?.dispose?.();
                        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose?.());
                    }
                });
                if (el.parentNode === host) host.removeChild(el);
                apiRef.current = null;
            };
        })();

        return () => { cancelled = true; cleanup(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverUrl]);

    return (
        <div className="stack" style={{ gap: 10 }}>
            <div ref={hostRef} style={{
                width: "100%", borderRadius: 10, overflow: "hidden",
                background: "#7d9099", minHeight: 320, position: "relative",
            }} />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 14 }}>
                <span style={{
                    padding: "3px 10px", borderRadius: 999,
                    background: hud.hp > 40 ? "rgba(127,211,196,.18)" : "rgba(232,160,160,.2)",
                }}>
                    HP <strong>{hud.hp}</strong>
                </span>
                <span className="muted">· {hud.players} in the zone</span>
                {hud.name && <span className="muted">· you are <strong>{hud.name}</strong></span>}
                {status !== "playing" && <span className="muted">· {status}</span>}
            </div>

            {error && <p style={{ color: "#e8a0a0", margin: 0 }}>{error}</p>}
            {log.length > 0 && (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>{log.join(" · ")}</p>
            )}

            <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                {touch
                    ? "Drag the left of the screen to move, the right to turn the camera, tap the right to swing."
                    : "WASD to move, drag to turn the camera, space to swing."}
                {" "}Goblins hit back — at 0 HP you respawn where you came in.
            </p>
        </div>
    );
}
