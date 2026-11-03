// Offline product photography of the Blender meshes; never imported by the app.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export function createCardRenderer(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(1400, 1400);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  renderer.setClearColor(0x000000, 0);
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.57, 1.57, 1.57, -1.57, .1, 40);
  // Almost frontal: the entire cover is legible, with just enough fore edge
  // and top edge visible to distinguish the binding and page count.
  camera.position.set(2.8, 3.1, 10);
  camera.lookAt(0, 1.22, .17);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentMap = pmrem.fromScene(environment, .04);
  scene.environment = environmentMap.texture;
  scene.environmentIntensity = .35;
  environment.dispose(); pmrem.dispose();
  const key = new THREE.DirectionalLight(0xfff4e3, 1.7);
  key.position.set(-3, 7, 4);
  scene.add(key, new THREE.HemisphereLight(0xfffcf1, 0x8e8875, .65));
  // A broad studio contact shadow keeps attention on the cover and does not
  // introduce a long cast shadow outside the product frame.
  const shadow = document.createElement("canvas");
  shadow.width = shadow.height = 256;
  const context = shadow.getContext("2d");
  const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 124);
  gradient.addColorStop(0, "rgba(55, 45, 30, .3)");
  gradient.addColorStop(.45, "rgba(55, 45, 30, .13)");
  gradient.addColorStop(1, "rgba(55, 45, 30, 0)");
  context.fillStyle = gradient; context.fillRect(0, 0, 256, 256);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.45), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadow), transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI/2; floor.position.set(0, .001, .12); scene.add(floor);
  const book = new THREE.Group();
  book.rotation.x = Math.PI/2;
  book.position.y = 1.225;
  scene.add(book);
  const loader = new GLTFLoader(), textureLoader = new THREE.TextureLoader();
  const models = new Map(), textures = new Map();
  let active;
  return async function renderCard(binding, pages, language) {
    const key = `${binding}-${pages}`;
    if (!models.has(key)) {
      const root = (await loader.loadAsync(`/landing/models/${key}.glb`)).scene;
      root.traverse(obj => {
        if (!obj.isMesh) return;
        obj.castShadow = true;
        for (const mat of [].concat(obj.material)) {
          mat.envMapIntensity = .65;
          if (mat.name === "Cover artwork") mat.roughness = binding === "hard" ? .48 : .62;
        }
      });
      models.set(key, root);
    }
    if (!textures.has(language)) {
      const texture = await textureLoader.loadAsync(`/landing/book-classic-cover-${language}.webp`);
      texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      textures.set(language, texture);
    }
    if (active) book.remove(active);
    active = models.get(key);
    active.traverse(obj => { if (obj.isMesh) for (const mat of [].concat(obj.material)) if (mat.name === "Cover artwork") { mat.map = textures.get(language); mat.needsUpdate = true; } });
    book.add(active);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  };
}
