// Loaded only when the public binding preview approaches the viewport.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export function createBookScene(host, onReady, onFailure) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-2, 2, 1.7, -1.7, .1, 60);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentMap = pmrem.fromScene(environment, .04);
  scene.environment = environmentMap.texture;
  scene.environmentIntensity = .35;
  environment.dispose();
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xfff4e3, 1.7);
  key.position.set(-3, 7, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: .1, far: 20 });
  key.shadow.bias = -.0004;
  key.shadow.normalBias = .015;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 8;
  scene.add(key, new THREE.HemisphereLight(0xfffcf1, 0x8e8875, .65));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: 0x514939, opacity: .18 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const pivot = new THREE.Group();
  scene.add(pivot);
  const loader = new GLTFLoader();
  const textures = new THREE.TextureLoader();
  const models = new Map();
  const maps = new Map();
  let active = null, dead = false, lost = false, frame = 0, sequence = 0;
  let yaw = 0, targetYaw = 0, elevation = 5.9, targetElevation = 5.9;
  let dragging = null, visible = true, lastFrame = 0;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  function draw() {
    frame = 0;
    if (dead || lost || !visible) return;
    const now = performance.now();
    const factor = reduced.matches ? 1 : 1 - Math.exp(-Math.max(16, now-lastFrame) / 65);
    lastFrame = now;
    yaw += (targetYaw - yaw) * factor;
    elevation += (targetElevation - elevation) * factor;
    pivot.rotation.y = yaw;
    camera.position.set(3.8, elevation, 5.2);
    camera.lookAt(0, .12, 0);
    if (Math.abs(targetYaw-yaw) < .001 && Math.abs(targetElevation-elevation) < .001) renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    canvas.dataset.angle = yaw.toFixed(2);
    if (Math.abs(targetYaw-yaw) > .001 || Math.abs(targetElevation-elevation) > .001) invalidate();
  }
  function invalidate() { if (!dead && !frame && visible) frame = requestAnimationFrame(draw); }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    const aspect = width / height;
    // Keep the same physical scale for every cover and page count.
    const span = aspect < 1 ? 3.7 : 3.28;
    camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
    camera.top = span / 2; camera.bottom = -span / 2;
    camera.updateProjectionMatrix();
    invalidate();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) invalidate(); });
  visibility.observe(host);
  function disposeModel(root) {
    root.traverse(obj => { if (obj.isMesh) { obj.geometry.dispose(); for (const mat of [].concat(obj.material)) mat.dispose(); } });
  }
  async function modelFor(cover, pages) {
    const key = `${cover}-${pages}`;
    if (!models.has(key)) models.set(key, loader.loadAsync(`/landing/models/${key}.glb`).then(gltf => {
      const root = gltf.scene;
      root.traverse(obj => {
        if (!obj.isMesh) return;
        obj.castShadow = true;
        obj.receiveShadow = false;
        for (const mat of [].concat(obj.material)) {
          mat.envMapIntensity = .65;
          // The imported mesh retains Blender's page curvature and separate boards.
          if (mat.name === "Cover artwork") { mat.roughness = cover === "hard" ? .48 : .62; }
        }
      });
      if (dead) disposeModel(root);
      return root;
    }));
    return models.get(key);
  }
  async function textureFor(language) {
    if (!maps.has(language)) maps.set(language, textures.loadAsync(`/landing/book-classic-cover-${language}.webp`).then(texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      if (dead) texture.dispose();
      return texture;
    }));
    return maps.get(language);
  }
  async function update(cover, pages, language) {
    const request = ++sequence;
    try {
      const [root, texture] = await Promise.all([modelFor(cover, pages), textureFor(language)]);
      if (dead || lost || request !== sequence) return;
      root.traverse(obj => { if (obj.isMesh) for (const mat of [].concat(obj.material)) if (mat.name === "Cover artwork") { mat.map = texture; mat.needsUpdate = true; } });
      if (active) pivot.remove(active);
      active = root;
      pivot.add(root);
      renderer.shadowMap.needsUpdate = true;
      resize();
      // Ready means the selected model, localized texture and first frame are available.
      cancelAnimationFrame(frame);
      draw();
      canvas.dataset.model = `${cover}-${pages}`;
      canvas.dataset.language = language;
      onReady();
    } catch (error) { if (!dead && request === sequence) onFailure(); }
  }
  function pointerDown(event) {
    if (event.button !== 0) return;
    dragging = { x: event.clientX, yaw: targetYaw, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
  }
  function pointerMove(event) {
    if (!dragging || dragging.id !== event.pointerId) return;
    targetYaw = dragging.yaw + (event.clientX - dragging.x) * .012;
    invalidate();
  }
  function pointerUp() { dragging = null; canvas.classList.remove("is-dragging"); }
  function contextLost(event) { event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0; onFailure(); }
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("webglcontextlost", contextLost);
  resize();
  return {
    update,
    view(side) { lastFrame = performance.now(); targetYaw = 0; targetElevation = side ? 1.65 : 5.9; invalidate(); },
    rotate(delta) { lastFrame = performance.now(); targetYaw += delta; invalidate(); },
    dispose() {
      dead = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect(); visibility.disconnect();
      for (const pending of models.values()) pending.then(disposeModel).catch(() => {});
      for (const pending of maps.values()) pending.then(texture => texture.dispose()).catch(() => {});
      floor.geometry.dispose(); floor.material.dispose(); environmentMap.dispose();
      key.shadow.map?.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
