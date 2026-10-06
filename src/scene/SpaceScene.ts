import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { PLANETS, compressVec, helioEcliptic, orbitPath, type Vec3 } from '../lib/planets';
import { moonPositionKm, sunDirection } from '../lib/moon';
import {
  MOON_BY_ID, MOONS, displayMoonDistance, displayMoonRadius, moonOffsetKm, moonsOf, planetPole, type MoonDef,
} from '../lib/moons';
import { GROUP_BY_ID, periodMinutes, propagateSat, siderealAngle, type Satellite } from '../lib/satellites';

export type ViewMode = 'solar' | 'earth';

interface Callbacks {
  getDate: () => Date;
  onSelect: (id: string | null) => void;
}

/** Earth view: 1 scene unit = 1000 km. */
const KM = 1 / 1000;
const EARTH_R = 6371 * KM;
const MOON_R = 1737.4 * KM;

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/';

/** Ecliptic / equatorial (x, y, z) → three.js (x, z, −y), so the reference plane is horizontal. */
function toThree(v: Vec3, scale = 1, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(v.x * scale, v.z * scale, -v.y * scale);
}

function makeStars(radius: number, count = 4000): THREE.Points {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pos.set([radius * s * Math.cos(t), radius * u, radius * s * Math.sin(t)], i * 3);
    const b = 0.4 + Math.random() * 0.6;
    const tint = Math.random();
    col.set([b * (tint > 0.8 ? 1 : 0.85), b * 0.9, b * (tint < 0.2 ? 1 : 0.9)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(
    g,
    new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true, depthWrite: false }),
  );
}

function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Display position of a moon relative to its planet in the compressed solar view. */
function moonDisplayPos(m: MoonDef, date: Date, out = new THREE.Vector3()): THREE.Vector3 {
  const v = moonOffsetKm(m, date);
  const r = Math.hypot(v.x, v.y, v.z);
  return toThree(v, displayMoonDistance(m.parent, r) / r, out);
}

interface PlanetSystem {
  group: THREE.Group;
  mesh: THREE.Mesh;
  /** Moon orbit lines; only shown when the camera is near the planet. */
  moonLayer: THREE.Group;
  moonLabels: CSS2DObject[];
  nearDistance: number;
}

interface ViewState {
  scene: THREE.Scene;
  labels: CSS2DRenderer;
  camPos: THREE.Vector3;
  target: THREE.Vector3;
  minDistance: number;
  maxDistance: number;
}

export class SpaceScene {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private raf = 0;
  private view: ViewMode = 'solar';
  private views: Record<ViewMode, ViewState>;
  private selected: string | null = null;
  private followLast: THREE.Vector3 | null = null;
  private pointerDown: { x: number; y: number } | null = null;
  private resizeObserver: ResizeObserver;

  // Solar view
  private solarObjects = new Map<string, THREE.Object3D>();
  private planetSystems = new Map<string, PlanetSystem>();

  // Earth view
  private earth!: THREE.Mesh;
  private moon!: THREE.Mesh;
  private sunLight!: THREE.DirectionalLight;
  private satPoints!: THREE.Points;
  private sats: Satellite[] = [];
  private satIndex = new Map<string, number>();
  private satPositions = new Float32Array(0);
  private lastSatUpdate = -Infinity;
  private selectedMarker!: THREE.Mesh;
  private selectedLabel!: CSS2DObject;
  private satOrbit!: THREE.Line;
  private lastOrbitUpdate = -Infinity;

  constructor(private container: HTMLElement, private cb: Callbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x02030a);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.001, 1e6);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.views = {
      solar: this.buildSolar(),
      earth: this.buildEarth(),
    };
    for (const v of Object.values(this.views)) {
      v.labels.domElement.className = 'label-layer';
      container.appendChild(v.labels.domElement);
    }

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointerup', this.onPointerUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.applyView();
    this.loop();
  }

  // ---------------------------------------------------------------- building

  private label(text: string, id: string, className = ''): CSS2DObject {
    const div = document.createElement('div');
    div.className = `label ${className}`;
    div.textContent = text;
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cb.onSelect(id);
    });
    return new CSS2DObject(div);
  }

  private buildSolar(): ViewState {
    const scene = new THREE.Scene();
    scene.add(makeStars(3000));
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));
    const sunLight = new THREE.PointLight(0xffffff, 3, 0, 0);
    scene.add(sunLight);

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(3, 48, 24),
      new THREE.MeshBasicMaterial({ color: 0xffcc55 }),
    );
    sun.userData.id = 'sun';
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: dotTexture(), color: 0xffaa33, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    glow.scale.setScalar(16);
    sun.add(glow);
    const sunLabel = this.label('Sun', 'sun', 'label-sun');
    sunLabel.position.set(0, 3.6, 0);
    sun.add(sunLabel);
    scene.add(sun);
    this.solarObjects.set('sun', sun);

    const now = new Date();
    for (const p of PLANETS) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(p.displayRadius, 32, 16),
        new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.9 }),
      );
      mesh.userData.id = p.id;
      const lbl = this.label(p.name, p.id);
      lbl.position.set(0, p.displayRadius + 0.6, 0);
      mesh.add(lbl);

      // The group holds the planet plus anything that must not spin with it (rings, moons).
      const group = new THREE.Group();
      group.add(mesh);
      scene.add(group);
      this.solarObjects.set(p.id, mesh);

      if (p.id === 'saturn') {
        // Main rings span ~1.24–2.27 Saturn radii, drawn on the same scale as the moons.
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(
            displayMoonDistance('saturn', 1.24 * p.radiusKm),
            displayMoonDistance('saturn', 2.27 * p.radiusKm),
            96,
          ),
          new THREE.MeshBasicMaterial({ color: 0xd9c89a, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }),
        );
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), toThree(planetPole('saturn', now)));
        group.add(ring);
      }

      const moonLayer = new THREE.Group();
      group.add(moonLayer);
      const moonLabels: CSS2DObject[] = [];
      const moons = moonsOf(p.id);
      for (const m of moons) {
        const r = displayMoonRadius(m);
        const moonMesh = new THREE.Mesh(
          new THREE.SphereGeometry(r, 20, 10),
          new THREE.MeshStandardMaterial({ color: m.color, roughness: 1 }),
        );
        moonMesh.userData.id = m.id;
        const ml = this.label(m.name, m.id, 'label-moon');
        ml.position.set(0, r + 0.15, 0);
        moonMesh.add(ml);
        moonLabels.push(ml);
        group.add(moonMesh);
        this.solarObjects.set(m.id, moonMesh);

        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 128; i++) {
          pts.push(moonDisplayPos(m, new Date(now.getTime() + (i / 128) * m.periodDays * 86_400_000)));
        }
        moonLayer.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: m.color, transparent: true, opacity: 0.3 }),
          ),
        );
      }
      const extent = moons.length ? Math.max(...moons.map((m) => displayMoonDistance(p.id, m.aKm))) : p.displayRadius;
      this.planetSystems.set(p.id, { group, mesh, moonLayer, moonLabels, nearDistance: extent * 12 });

      const path = orbitPath(p.body, p.periodDays, now, 256).map((v) => toThree(compressVec(v)));
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(path),
        new THREE.LineBasicMaterial({ color: p.color, transparent: true, opacity: 0.35 }),
      );
      scene.add(line);
    }

    return {
      scene,
      labels: new CSS2DRenderer(),
      camPos: new THREE.Vector3(0, 70, 110),
      target: new THREE.Vector3(),
      minDistance: 2,
      maxDistance: 1500,
    };
  }

  private buildEarth(): ViewState {
    const scene = new THREE.Scene();
    scene.add(makeStars(50_000));
    scene.add(new THREE.AmbientLight(0xffffff, 0.08));
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2.6);
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    const earthMat = new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.85 });
    loader.load(TEXTURE_BASE + 'earth_atmos_2048.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      earthMat.map = t;
      earthMat.color.set(0xffffff);
      earthMat.needsUpdate = true;
    });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 96, 48), earthMat);
    this.earth.userData.id = 'earth';
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_R * 1.025, 64, 32),
      new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.12, side: THREE.BackSide }),
    );
    scene.add(atmo);
    scene.add(this.earth);
    const earthLabel = this.label('Earth', 'earth');
    earthLabel.position.set(0, EARTH_R * 1.25, 0);
    scene.add(earthLabel);

    const moonMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 1 });
    loader.load(TEXTURE_BASE + 'moon_1024.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      moonMat.map = t;
      moonMat.color.set(0xffffff);
      moonMat.needsUpdate = true;
    });
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 64, 32), moonMat);
    this.moon.userData.id = 'moon';
    const moonLabel = this.label('Moon', 'moon');
    moonLabel.position.set(0, MOON_R * 1.6, 0);
    this.moon.add(moonLabel);
    scene.add(this.moon);

    // Moon's orbit, sampled over one sidereal month.
    const now = Date.now();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 256; i++) {
      pts.push(toThree(moonPositionKm(new Date(now + (i / 256) * 27.32 * 86_400_000)), KM));
    }
    scene.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x8892b0, transparent: true, opacity: 0.35 }),
      ),
    );

    // Satellites as one point cloud.
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
    this.satPoints = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 6, sizeAttenuation: false, vertexColors: true, map: dotTexture(), transparent: true, alphaTest: 0.2, depthWrite: false,
      }),
    );
    this.satPoints.frustumCulled = false;
    scene.add(this.satPoints);

    this.selectedMarker = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }),
    );
    this.selectedMarker.visible = false;
    this.selectedLabel = this.label('', '', 'label-sat');
    this.selectedMarker.add(this.selectedLabel);
    scene.add(this.selectedMarker);

    this.satOrbit = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }),
    );
    this.satOrbit.visible = false;
    this.satOrbit.frustumCulled = false;
    scene.add(this.satOrbit);

    return {
      scene,
      labels: new CSS2DRenderer(),
      camPos: new THREE.Vector3(30, 18, 40),
      target: new THREE.Vector3(),
      minDistance: 0.02,
      maxDistance: 2500,
    };
  }

  // ---------------------------------------------------------------- public API

  setView(view: ViewMode) {
    if (view === this.view) return;
    const cur = this.views[this.view];
    cur.camPos.copy(this.camera.position);
    cur.target.copy(this.controls.target);
    this.view = view;
    this.followLast = null;
    this.applyView();
  }

  setSatellites(sats: Satellite[]) {
    this.sats = sats;
    this.satIndex = new Map(sats.map((s, i) => [s.id, i]));
    const n = sats.length;
    this.satPositions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const c = new THREE.Color();
    sats.forEach((s, i) => {
      c.set(GROUP_BY_ID.get(s.group)?.color ?? '#ffffff');
      colors.set([c.r, c.g, c.b], i * 3);
    });
    const g = this.satPoints.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(this.satPositions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.lastSatUpdate = -Infinity;
    this.lastOrbitUpdate = -Infinity;
  }

  /** Highlight an object; with `focus`, also fly the camera to it. */
  select(id: string | null, focus = true) {
    this.selected = id;
    this.followLast = null;
    this.lastOrbitUpdate = -Infinity;
    const sat = id?.startsWith('sat:') ? this.sats[this.satIndex.get(id.slice(4)) ?? -1] : undefined;
    this.selectedLabel.element.textContent = sat?.name ?? '';
    if (!id || !focus) return;

    // Make sure positions reflect the current time (the view may have just switched).
    const date = this.cb.getDate();
    if (this.view === 'solar') this.updateSolar(date);
    else this.updateEarth(date);
    const pos = this.objectPosition(id);
    if (!pos) return;
    const size = this.objectSize(id);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.lengthSq() === 0) dir.set(0, 0.4, 1).normalize();
    this.controls.target.copy(pos);
    this.camera.position.copy(pos).addScaledVector(dir, size);
    this.followLast = pos.clone();
  }

  resetCamera() {
    const fresh = this.view === 'solar' ? new THREE.Vector3(0, 70, 110) : new THREE.Vector3(30, 18, 40);
    this.selected = null;
    this.followLast = null;
    this.controls.target.set(0, 0, 0);
    this.camera.position.copy(fresh);
    this.cb.onSelect(null);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    for (const v of Object.values(this.views)) v.labels.domElement.remove();
  }

  // ---------------------------------------------------------------- internals

  private applyView() {
    const v = this.views[this.view];
    for (const [k, other] of Object.entries(this.views)) {
      other.labels.domElement.style.display = k === this.view ? '' : 'none';
    }
    this.camera.position.copy(v.camPos);
    this.controls.target.copy(v.target);
    this.controls.minDistance = v.minDistance;
    this.controls.maxDistance = v.maxDistance;
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    for (const v of Object.values(this.views)) v.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private objectSize(id: string): number {
    if (id === 'sun') return 25;
    if (this.view === 'earth') {
      if (id === 'earth') return EARTH_R * 5;
      if (id === 'moon') return MOON_R * 8;
      return 3; // satellites: ~3000 km away
    }
    const m = MOON_BY_ID.get(id);
    if (m) return Math.max(displayMoonRadius(m) * 25, 2);
    const p = PLANETS.find((x) => x.id === id);
    return p ? p.displayRadius * 25 : 10;
  }

  private objectPosition(id: string): THREE.Vector3 | null {
    if (this.view === 'solar') {
      const o = this.solarObjects.get(id);
      return o ? o.getWorldPosition(new THREE.Vector3()) : null;
    }
    if (id === 'earth') return this.earth.position.clone();
    if (id === 'moon') return this.moon.position.clone();
    if (id.startsWith('sat:')) {
      const i = this.satIndex.get(id.slice(4));
      if (i === undefined) return null;
      const st = propagateSat(this.sats[i], this.cb.getDate());
      return st ? toThree(st.eci, KM) : null;
    }
    return null;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const date = this.cb.getDate();
    if (this.view === 'solar') this.updateSolar(date);
    else this.updateEarth(date);

    // Keep the camera riding along with the selected object.
    if (this.selected && this.followLast) {
      const pos = this.objectPosition(this.selected);
      if (pos) {
        const delta = pos.clone().sub(this.followLast);
        this.camera.position.add(delta);
        this.controls.target.add(delta);
        this.followLast.copy(pos);
      }
    }

    this.controls.update();
    const v = this.views[this.view];
    this.renderer.render(v.scene, this.camera);
    v.labels.render(v.scene, this.camera);
  };

  private updateSolar(date: Date) {
    for (const p of PLANETS) {
      const sys = this.planetSystems.get(p.id)!;
      toThree(compressVec(helioEcliptic(p.body, date)), 1, sys.group.position);
      sys.mesh.rotation.y = ((date.getTime() / 86_400_000) * 2 * Math.PI) % (2 * Math.PI);
      // Moon names and orbits only when zoomed in on this planet, to keep the overview clean.
      const near = this.camera.position.distanceTo(sys.group.position) < sys.nearDistance;
      sys.moonLayer.visible = near;
      for (const l of sys.moonLabels) l.visible = near;
    }
    for (const m of MOONS) moonDisplayPos(m, date, this.solarObjects.get(m.id)!.position);
  }

  private updateEarth(date: Date) {
    // Earth's rotation: texture longitude 0 sits on +X, so rotate by sidereal angle.
    this.earth.rotation.y = siderealAngle(date);

    toThree(moonPositionKm(date), KM, this.moon.position);
    this.moon.lookAt(0, 0, 0);
    this.moon.rotateY(-Math.PI / 2); // keep the near side facing Earth

    const sun = toThree(sunDirection(date));
    this.sunLight.position.copy(sun.multiplyScalar(1000));

    const nowMs = performance.now();
    // Large catalogues are expensive to propagate, so throttle them.
    const interval = this.sats.length > 2000 ? 200 : this.sats.length > 300 ? 60 : 0;
    if (nowMs - this.lastSatUpdate >= interval) {
      this.lastSatUpdate = nowMs;
      const tmp = new THREE.Vector3();
      for (let i = 0; i < this.sats.length; i++) {
        const st = propagateSat(this.sats[i], date);
        if (st) toThree(st.eci, KM, tmp);
        else tmp.set(0, 0, 0); // hidden inside Earth
        this.satPositions[i * 3] = tmp.x;
        this.satPositions[i * 3 + 1] = tmp.y;
        this.satPositions[i * 3 + 2] = tmp.z;
      }
      const attr = this.satPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.needsUpdate = true;
    }

    const satId = this.selected?.startsWith('sat:') ? this.selected.slice(4) : null;
    const satIdx = satId ? this.satIndex.get(satId) : undefined;
    const selPos = satIdx !== undefined ? this.objectPosition(this.selected!) : null;
    if (satIdx !== undefined && selPos) {
      this.selectedMarker.position.copy(selPos);
      const camDist = this.camera.position.distanceTo(this.selectedMarker.position);
      this.selectedMarker.scale.setScalar(Math.max(camDist * 0.012, 0.02));
      this.selectedMarker.visible = true;

      if (nowMs - this.lastOrbitUpdate > 500) {
        this.lastOrbitUpdate = nowMs;
        const sat = this.sats[satIdx];
        const periodMs = periodMinutes(sat) * 60_000;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 180; i++) {
          const st = propagateSat(sat, new Date(date.getTime() + (i / 180 - 0.5) * periodMs));
          if (st) pts.push(toThree(st.eci, KM));
        }
        this.satOrbit.geometry.dispose();
        this.satOrbit.geometry = new THREE.BufferGeometry().setFromPoints(pts);
        (this.satOrbit.material as THREE.LineBasicMaterial).color.set(GROUP_BY_ID.get(sat.group)?.color ?? '#fff');
        this.satOrbit.visible = true;
      }
    } else {
      this.selectedMarker.visible = false;
      this.satOrbit.visible = false;
    }
  }

  // ---------------------------------------------------------------- picking

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDown = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent) => {
    const start = this.pointerDown;
    this.pointerDown = null;
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return; // was a drag

    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);

    if (this.view === 'earth' && this.sats.length) {
      // Threshold in world units ≈ 8 px at the target distance.
      const dist = this.camera.position.distanceTo(this.controls.target);
      const worldPerPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / rect.height;
      this.raycaster.params.Points = { threshold: worldPerPx * 8 };
      const hits = this.raycaster.intersectObject(this.satPoints);
      const earthHit = this.raycaster.intersectObject(this.earth)[0];
      const hit = hits.find((h) => !earthHit || h.distance < earthHit.distance);
      if (hit && hit.index !== undefined) {
        this.cb.onSelect(`sat:${this.sats[hit.index].id}`);
        return;
      }
    }

    const meshes =
      this.view === 'solar' ? [...this.solarObjects.values()] : [this.earth, this.moon];
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (hit?.object.userData.id) this.cb.onSelect(hit.object.userData.id);
  };
}
