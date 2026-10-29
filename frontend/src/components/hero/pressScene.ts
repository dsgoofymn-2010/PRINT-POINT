import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PLATES, SHEET_H, SHEET_W, drawPlate, loadPlateFonts } from './plates';

export interface PressScene {
  /** 0 = sheet still printing, 1 = plates fully separated. */
  setProgress(p: number): void;
  /** Pointer in -1..1 on both axes; tilts the whole scene a little. */
  setPointer(x: number, y: number): void;
  /** The printer's ready light follows the shop's real open state. */
  setOpen(open: boolean | null): void;
  setRunning(on: boolean): void;
  dispose(): void;
}

const PAPER = 0xf6f3ec;
const SW = 1.5;
const SH = SW * (SHEET_H / SHEET_W);
const SLOT_Y = 1.0;
const SLOT_Z = -0.5;

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export async function mountPressScene(canvas: HTMLCanvasElement, opts: { textureScale: number }): Promise<PressScene> {
  await loadPlateFonts();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  // Opaque paper ground: the plates multiply onto it the way ink multiplies onto stock.
  renderer.setClearColor(PAPER, 1);
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  const target = new THREE.Vector3(0, 2.15, 0.3);
  const camDir = new THREE.Vector3(0.1, 0.3, 1).normalize();

  scene.add(new THREE.HemisphereLight(0xffffff, 0xe6dfd0, 1.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3, 6, 5);
  scene.add(key);

  const root = new THREE.Group();
  scene.add(root);

  // Printer
  const plastic = new THREE.MeshStandardMaterial({ color: 0xece7dc, roughness: 0.55 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xded7c8, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d1c22, roughness: 0.5 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(3.4, 1.0, 2.3, 4, 0.14), plastic);
  body.position.set(0, 0.5, 0);
  const lid = new THREE.Mesh(new RoundedBoxGeometry(2.9, 0.06, 1.3, 2, 0.03), trim);
  lid.position.set(0, 1.0, 0.35);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.12), dark);
  slot.position.set(0, 1.0, SLOT_Z);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.02), dark);
  panel.position.set(-0.3, 0.62, 1.16);
  const tray = new THREE.Mesh(new RoundedBoxGeometry(2.3, 0.05, 0.8, 2, 0.02), trim);
  tray.position.set(0, 0.24, 1.45);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x3a3a40, emissive: 0x000000, roughness: 0.3 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), ledMat);
  led.position.set(1.3, 0.62, 1.17);
  root.add(body, lid, slot, panel, tray, led);

  // Soft contact shadow under the machine
  const sh = document.createElement('canvas');
  sh.width = sh.height = 128;
  const shc = sh.getContext('2d')!;
  const grad = shc.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(40,30,20,0.32)');
  grad.addColorStop(1, 'rgba(40,30,20,0)');
  shc.fillStyle = grad;
  shc.fillRect(0, 0, 128, 128);
  const shadowTex = new THREE.CanvasTexture(sh);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 3.8),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.002, 0.2);
  root.add(shadow);

  // Sheet: pivots on its bottom edge so it rises straight out of the slot.
  const clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -SLOT_Y)];
  const sheet = new THREE.Group();
  root.add(sheet);
  const sheetGeo = new THREE.PlaneGeometry(SW, SH);
  sheetGeo.translate(0, SH / 2, 0);
  const paper = new THREE.Mesh(
    sheetGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 1, side: THREE.DoubleSide, clippingPlanes: clip }),
  );
  sheet.add(paper);

  const textures: THREE.Texture[] = [shadowTex];
  const plates = PLATES.map((id, i) => {
    const tex = new THREE.CanvasTexture(drawPlate(id, opts.textureScale));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    textures.push(tex);
    const m = new THREE.Mesh(
      sheetGeo,
      new THREE.MeshBasicMaterial({
        map: tex,
        blending: THREE.MultiplyBlending,
        premultipliedAlpha: true,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
        clippingPlanes: clip,
      }),
    );
    m.renderOrder = 10 + i;
    sheet.add(m);
    return m;
  });

  let progress = 0;
  let shown = -1;
  const pointer = { x: 0, y: 0, cx: 0, cy: 0 };
  let running = true;
  let raf = 0;
  let width = 0;
  let height = 0;

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || (w === width && h === height)) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Fit the machine plus the lifted sheet in whatever box the layout gives us.
    const v = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hf = Math.atan(Math.tan(v) * camera.aspect);
    // Portrait boxes crop the printer's ends so the sheet stays big enough to read.
    const narrow = window.innerWidth < 1024; // below lg the scene sits under the text, full width
    // Aim left of the printer: the separated plates fan out to that side.
    target.x = narrow ? -0.45 : -0.6;
    const dist = Math.max((narrow ? 2.05 : 3.3) / Math.tan(hf), 2.7 / Math.tan(v));
    camera.position.copy(target).addScaledVector(camDir, dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    shown = -1;
  };

  const layout = (p: number) => {
    const t = 0.14 + 0.86 * p; // the first frame already shows a sheet half out
    const feed = smooth(0, 0.34, t);
    const lift = smooth(0.3, 0.58, t);
    const split = smooth(0.55, 1, t);
    sheet.position.set(-0.35 * split, SLOT_Y - SH + feed * SH + lift * 0.6, SLOT_Z + lift * 1.2 - split * 0.4);
    sheet.rotation.set(-0.08 * lift, -0.2 * lift - 0.62 * split, 0.03 * lift);
    plates.forEach((m, i) => {
      const k = i + 1;
      m.position.set(split * 0.12 * k, split * 0.04 * k, 0.003 * k + split * 0.62 * k);
    });
  };

  const frame = () => {
    raf = 0;
    if (!running) return;
    resize();
    pointer.cx += (pointer.x - pointer.cx) * 0.08;
    pointer.cy += (pointer.y - pointer.cy) * 0.08;
    root.rotation.y = pointer.cx * 0.22;
    root.rotation.x = pointer.cy * 0.07;
    const settled = Math.abs(pointer.x - pointer.cx) < 0.001 && Math.abs(pointer.y - pointer.cy) < 0.001;
    if (shown !== progress || !settled) {
      layout(progress);
      renderer.render(scene, camera);
      shown = progress;
    }
    if (!settled) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (running && !raf) raf = requestAnimationFrame(frame);
  };

  const ro = new ResizeObserver(kick);
  ro.observe(canvas);
  resize();
  layout(0);
  renderer.render(scene, camera);

  return {
    setProgress(p) {
      progress = Math.min(1, Math.max(0, p));
      kick();
    },
    setPointer(x, y) {
      pointer.x = x;
      pointer.y = y;
      kick();
    },
    setOpen(open) {
      ledMat.color.set(open ? 0x2fbf71 : 0x3a3a40);
      ledMat.emissive.set(open ? 0x1f9e58 : 0x000000);
      shown = -1;
      kick();
    },
    setRunning(on) {
      running = on;
      if (on) {
        shown = -1;
        kick();
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    dispose() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      textures.forEach((t) => t.dispose());
      renderer.dispose();
    },
  };
}
