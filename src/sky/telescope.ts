import * as A from 'astronomy-engine';
import { moonBodyAxes } from '../lib/moon';
import { horizonRotation, toAltAz, type AltAz, type SkyLocation } from '../lib/sky/sky';
import type { Projector } from './projection';

type V = { x: number; y: number; z: number };
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
const add = (a: V, b: V, k = 1): V => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const scale = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const norm = (a: V): V => scale(a, 1 / Math.hypot(a.x, a.y, a.z));
const cross = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** Real radii in km, for true apparent sizes. */
export const RADIUS_KM: Record<string, number> = {
  sun: 696_340, moon: 1737.4, mercury: 2439.7, venus: 6051.8, mars: 3389.5,
  jupiter: 69_911, saturn: 58_232, uranus: 25_362, neptune: 24_622,
};

/** The field of view (degrees) a telescope view starts at for each target. */
export function telescopeFov(id: string): number {
  if (id === 'moon' || id === 'sun') return 1.2;
  if (id === 'jupiter') return 0.3; // wide enough for the Galilean moons
  if (id === 'saturn') return 0.06;
  if (id === 'venus') return 0.08;
  if (id === 'mars' || id === 'mercury') return 0.04;
  if (id === 'uranus' || id === 'neptune') return 0.03;
  if (id.startsWith('sat:')) return 8;
  return 2;
}

/** Great-circle angle between two sky directions, degrees. */
export function angleBetween(a: AltAz, b: AltAz): number {
  const r = Math.PI / 180;
  const c =
    Math.sin(a.alt * r) * Math.sin(b.alt * r) + Math.cos(a.alt * r) * Math.cos(b.alt * r) * Math.cos((a.az - b.az) * r);
  return Math.acos(Math.max(-1, Math.min(1, c))) / r;
}

export function formatAngleRate(degPerSec: number): string {
  const arcsec = degPerSec * 3600;
  if (arcsec < 120) return `${arcsec.toFixed(1)}″ per second`;
  if (degPerSec < 1) return `${(arcsec / 60).toFixed(1)}′ per second`;
  return `${degPerSec.toFixed(2)}° per second`;
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec)) return 'never';
  if (sec < 1) return 'under a second';
  if (sec < 90) return `${Math.round(sec)} s`;
  if (sec < 5400) return `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s`;
  return `${(sec / 3600).toFixed(1)} h`;
}

/**
 * Local screen mapping around a sky direction (J2000 unit vector): returns the
 * screen point and a Jacobian from tangent-plane radians (along e1, e2) to pixels.
 * This lets us draw discs, rings and moons with the right orientation,
 * including any screen roll.
 */
export function localFrame(dir: V, rot: ReturnType<typeof horizonRotation>, project: Projector) {
  const pole = Math.abs(dir.z) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const e1 = norm(cross(pole, dir));
  const e2 = cross(dir, e1);
  const eps = 1e-5;
  const p0 = toAltAz(rot, dir);
  const q0 = project(p0.alt, p0.az);
  const p1 = toAltAz(rot, norm(add(dir, e1, eps)));
  const p2 = toAltAz(rot, norm(add(dir, e2, eps)));
  const q1 = project(p1.alt, p1.az);
  const q2 = project(p2.alt, p2.az);
  if (!q0 || !q1 || !q2) return null;
  const J = [
    [(q1.x - q0.x) / eps, (q2.x - q0.x) / eps],
    [(q1.y - q0.y) / eps, (q2.y - q0.y) / eps],
  ];
  /** Tangent-plane offset (radians along e1, e2) → screen pixels. */
  const toScreen = (a: number, b: number) => ({ x: q0.x + J[0][0] * a + J[0][1] * b, y: q0.y + J[1][0] * a + J[1][1] * b });
  /** Any small 3-D offset vector → screen, by projecting it onto the tangent plane. */
  const offsetToScreen = (v: V) => toScreen(dot(v, e1), dot(v, e2));
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  /** Screen pixels → tangent-plane radians. */
  const fromScreen = (x: number, y: number) => {
    const dx = x - q0.x;
    const dy = y - q0.y;
    return { a: (J[1][1] * dx - J[0][1] * dy) / det, b: (-J[1][0] * dx + J[0][0] * dy) / det };
  };
  const pxPerRad = Math.sqrt(Math.abs(det));
  return { center: q0, e1, e2, toScreen, offsetToScreen, fromScreen, pxPerRad };
}

// --- The Moon, rendered as a lit sphere with the real surface and libration ----------

let moonTex: { w: number; h: number; data: Uint8ClampedArray } | null = null;
let moonTexState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';

function loadMoonTexture() {
  if (moonTexState !== 'idle') return;
  moonTexState = 'loading';
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      moonTex = { w: img.width, h: img.height, data: g.getImageData(0, 0, img.width, img.height).data };
      moonTexState = 'ready';
    } catch {
      moonTexState = 'failed';
    }
  };
  img.onerror = () => (moonTexState = 'failed');
  img.src = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/moon_1024.jpg';
}

const moonCache = { canvas: null as HTMLCanvasElement | null, key: '', at: 0 };

/**
 * Draw the Moon at its true apparent size: each pixel is a point on the lunar
 * sphere (orthographic), coloured from the surface map using the IAU
 * orientation (so libration and tilt are real) and lit by the Sun (phase).
 */
export function drawMoonDisc(
  ctx: CanvasRenderingContext2D,
  date: Date,
  loc: SkyLocation,
  rot: ReturnType<typeof horizonRotation>,
  project: Projector,
) {
  loadMoonTexture();
  const obs = new A.Observer(loc.lat, loc.lon, loc.heightM);
  const eq = A.Equator(A.Body.Moon, date, obs, false, true);
  const m = norm(eq.vec);
  const distKm = eq.dist * A.KM_PER_AU;
  const angR = Math.asin(RADIUS_KM.moon / distKm);
  const frame = localFrame(m, rot, project);
  if (!frame) return;
  const rPx = angR * frame.pxPerRad;
  const c = frame.center;
  if (rPx < 3 || c.x < -rPx || c.y < -rPx || c.x > ctx.canvas.clientWidth + rPx || c.y > ctx.canvas.clientHeight + rPx) return;

  // Re-render the sphere a few times a second (the view's orientation changes slowly).
  const size = Math.min(420, Math.max(16, Math.round(rPx * 2)));
  const key = `${size}|${moonTexState}`;
  const now = performance.now();
  if (!moonCache.canvas || moonCache.key !== key || now - moonCache.at > 300) {
    moonCache.key = key;
    moonCache.at = now;
    const cv = moonCache.canvas ?? document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d')!;
    const img = g.createImageData(size, size);
    const axes = moonBodyAxes(date);
    const sun = norm(A.GeoVector(A.Body.Sun, date, true));
    const toObserver = scale(m, -1);
    // Screen axes of the offscreen image (pixels right/down) → tangent-plane radians.
    const half = size / 2;
    const k = rPx / half;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const sx = c.x + (px + 0.5 - half) * k;
        const sy = c.y + (py + 0.5 - half) * k;
        const t = frame.fromScreen(sx, sy);
        const a = t.a / angR;
        const b = t.b / angR;
        const rr = a * a + b * b;
        if (rr > 1) continue;
        const n = add(add(scale(frame.e1, a), frame.e2, b), toObserver, Math.sqrt(1 - rr));
        const lit = Math.max(0, dot(n, sun));
        let shade = Math.min(1, lit * 1.25) + 0.035; // a touch of earthshine
        let r = 190;
        let gg = 190;
        let bl = 185;
        if (moonTex) {
          const lon = Math.atan2(dot(n, axes.y), dot(n, axes.x));
          const lat = Math.asin(Math.max(-1, Math.min(1, dot(n, axes.z))));
          const u = Math.floor(((0.5 + lon / (2 * Math.PI)) % 1) * moonTex.w);
          const v = Math.floor((0.5 - lat / Math.PI) * (moonTex.h - 1));
          const i = (v * moonTex.w + u) * 4;
          r = moonTex.data[i];
          gg = moonTex.data[i + 1];
          bl = moonTex.data[i + 2];
          shade *= 1.15;
        }
        const o = (py * size + px) * 4;
        img.data[o] = r * shade;
        img.data[o + 1] = gg * shade;
        img.data[o + 2] = bl * shade;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    moonCache.canvas = cv;
  }
  ctx.drawImage(moonCache.canvas!, c.x - rPx, c.y - rPx, rPx * 2, rPx * 2);
}

// --- Planets at true size ---------------------------------------------------------------

/** Topocentric J2000 direction and distance (km) of a body. */
export function bodyVector(body: A.Body, date: Date, loc: SkyLocation) {
  const eq = A.Equator(body, date, new A.Observer(loc.lat, loc.lon, loc.heightM), false, true);
  return { dir: norm(eq.vec), distKm: eq.dist * A.KM_PER_AU, vecAU: eq.vec };
}

/** Saturn's rings (outer 2.27 R, inner 1.24 R) at their real tilt, drawn behind and in front of the planet. */
export function drawSaturn(
  ctx: CanvasRenderingContext2D,
  frame: NonNullable<ReturnType<typeof localFrame>>,
  angR: number,
  dir: V,
  date: Date,
  color: string,
) {
  const n = A.RotationAxis(A.Body.Saturn, date).north;
  const pole = norm({ x: n.x, y: n.y, z: n.z });
  const u1 = norm(cross(pole, dir));
  const u2 = cross(pole, u1);
  const ringPath = (front: boolean | null) => {
    ctx.beginPath();
    for (const [radius, reverse] of [[2.27, false], [1.24, true]] as const) {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= 96; i++) {
        const t = (i / 96) * Math.PI * 2;
        const v = add(scale(u1, Math.cos(t)), u2, Math.sin(t));
        // Points on the near side have a component toward the observer (−dir).
        if (front !== null && dot(v, dir) < 0 !== front) continue;
        pts.push(frame.offsetToScreen(scale(v, radius * angR)));
      }
      if (reverse) pts.reverse();
      pts.forEach((p, i) => (i === 0 && !reverse ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    }
    ctx.closePath();
  };
  ctx.fillStyle = 'rgba(222, 205, 160, 0.75)';
  ringPath(null);
  ctx.fill('evenodd');
  drawDisc(ctx, frame, angR, color, pole, date);
  ctx.fillStyle = 'rgba(222, 205, 160, 0.85)';
  ringPath(true);
  ctx.fill();
}

/** A planet disc with faint bands along its equator. */
export function drawDisc(
  ctx: CanvasRenderingContext2D,
  frame: NonNullable<ReturnType<typeof localFrame>>,
  angR: number,
  color: string,
  pole: V | null,
  _date: Date,
) {
  const c = frame.center;
  const r = angR * frame.pxPerRad;
  const g = ctx.createRadialGradient(c.x - r * 0.3, c.y - r * 0.3, r * 0.1, c.x, c.y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, shadeColor(color, 0.55));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fill();
  if (pole && r > 12) {
    // Cloud bands: lines of constant latitude, seen from the side.
    const ps = frame.offsetToScreen(scale(pole, angR));
    const ang = Math.atan2(ps.y - c.y, ps.x - c.x);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(c.x, c.y);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(120, 72, 40, 0.25)';
    for (const f of [-0.45, -0.18, 0.2, 0.42]) ctx.fillRect(f * r - r * 0.05, -r, r * 0.1, r * 2);
    ctx.restore();
  }
}

function shadeColor(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Jupiter's four big moons as they appear around it. */
export function galileanMoons(date: Date, jupiterVecAU: V) {
  const jm = A.JupiterMoons(date);
  return (['io', 'europa', 'ganymede', 'callisto'] as const).map((id) => ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    dir: norm(add(jupiterVecAU, jm[id])),
  }));
}

/** The ISS at its true angular size: a long truss with four pairs of solar wings. */
export function drawStation(ctx: CanvasRenderingContext2D, x: number, y: number, lengthPx: number, headingRad: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(headingRad + Math.PI / 2); // truss is perpendicular to the direction of flight
  const L = Math.max(lengthPx, 6);
  ctx.fillStyle = color;
  ctx.fillRect(-L / 2, -L * 0.025, L, L * 0.05); // truss
  ctx.fillStyle = '#c084fc';
  for (const s of [-1, 1]) {
    for (const off of [0.32, 0.45]) {
      ctx.fillRect(s * off * L - L * 0.05, -L * 0.33, L * 0.1, L * 0.3);
      ctx.fillRect(s * off * L - L * 0.05, L * 0.03, L * 0.1, L * 0.3);
    }
  }
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(-L * 0.06, -L * 0.18, L * 0.12, L * 0.36); // modules
  ctx.restore();
}

/** Where in my sky a J2000 direction is. */
export function dirToAltAz(dir: V, date: Date, loc: SkyLocation): AltAz {
  return toAltAz(horizonRotation(date, loc), dir);
}
