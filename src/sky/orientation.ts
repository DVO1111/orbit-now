/**
 * Turns the phone's orientation sensors into "where is the back camera
 * pointing" (azimuth/altitude) plus how far the screen is rolled, so the
 * sky chart can follow the phone like Flightradar24's AR view.
 *
 * W3C DeviceOrientation: R = Rz(alpha) · Rx(beta) · Ry(gamma) maps device
 * axes (x right, y top of screen, z out of the screen) to Earth axes
 * (x east, y north, z up) when alpha is measured from north.
 */

type M3 = number[][];
type V3 = [number, number, number];

const rad = Math.PI / 180;

function mul(a: M3, b: M3): M3 {
  return a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
}
const apply = (m: M3, v: V3): V3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

export interface Pointing {
  az: number;
  alt: number;
  /** Screen roll in degrees, clockwise positive. */
  roll: number;
}

/** Pure maths, exported for tests: sensor angles (degrees) → pointing. */
export function pointingFromAngles(alpha: number, beta: number, gamma: number, screenAngle = 0): Pointing {
  const [a, b, g] = [alpha * rad, beta * rad, gamma * rad];
  const Rz: M3 = [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
  const Rx: M3 = [[1, 0, 0], [0, Math.cos(b), -Math.sin(b)], [0, Math.sin(b), Math.cos(b)]];
  const Ry: M3 = [[Math.cos(g), 0, Math.sin(g)], [0, 1, 0], [-Math.sin(g), 0, Math.cos(g)]];
  const R = mul(mul(Rz, Rx), Ry);
  const [e, n, u] = apply(R, [0, 0, -1]); // out of the back camera
  const alt = Math.asin(Math.max(-1, Math.min(1, u))) / rad;
  const az = ((Math.atan2(e, n) / rad) % 360 + 360) % 360;

  // Which way is "up" on the screen, given the screen may be in landscape.
  const t = screenAngle * rad;
  const up = apply(R, [-Math.sin(t), Math.cos(t), 0]);
  // Reference frame for a level view in this direction.
  const fwd: V3 = [e, n, u];
  const right: V3 = [Math.cos(az * rad), -Math.sin(az * rad), 0];
  const levelUp: V3 = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  const dot = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const roll = Math.atan2(dot(up, right), dot(up, levelUp)) / rad;
  return { az, alt, roll };
}

interface OrientationEventWithCompass extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

/** Does this browser have orientation sensors at all? */
export function hasOrientation(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

/** iOS needs an explicit permission prompt from a tap. Returns false if refused. */
export async function requestOrientationPermission(): Promise<boolean> {
  const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof DOE?.requestPermission === 'function') {
    try {
      return (await DOE.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Start listening. Calls `onPointing` with a smoothed direction. Returns a
 * stop function. `onNoCompass` fires if the device gives tilt but no compass.
 */
export function watchPointing(onPointing: (p: Pointing) => void, onNoCompass: () => void): () => void {
  let smoothed: { f: V3; az: number; alt: number; roll: number } | null = null;
  let gotAbsolute = false;
  let warned = false;

  const handle = (e: OrientationEventWithCompass, absolute: boolean) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    let alpha = e.alpha;
    if (typeof e.webkitCompassHeading === 'number') {
      alpha = (360 - e.webkitCompassHeading) % 360; // iOS: true compass heading
      absolute = true;
    }
    if (absolute) gotAbsolute = true;
    else if (gotAbsolute) return; // prefer the absolute stream once we have it
    else if (!warned) {
      warned = true;
      onNoCompass();
    }
    const screenAngle = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
    const p = pointingFromAngles(alpha, e.beta, e.gamma, screenAngle);

    // Smooth on the unit vector (no 359°→0° jumps), and the roll separately.
    const f: V3 = [Math.cos(p.alt * rad) * Math.sin(p.az * rad), Math.cos(p.alt * rad) * Math.cos(p.az * rad), Math.sin(p.alt * rad)];
    const k = 0.25;
    if (!smoothed) smoothed = { f, ...p };
    else {
      smoothed.f = smoothed.f.map((c, i) => c + (f[i] - c) * k) as V3;
      let dr = p.roll - smoothed.roll;
      if (dr > 180) dr -= 360;
      if (dr < -180) dr += 360;
      smoothed.roll += dr * k;
    }
    const [x, y, z] = smoothed.f;
    const len = Math.hypot(x, y, z);
    onPointing({
      az: ((Math.atan2(x, y) / rad) % 360 + 360) % 360,
      alt: Math.asin(z / len) / rad,
      roll: smoothed.roll,
    });
  };

  const abs = (e: Event) => handle(e as OrientationEventWithCompass, true);
  const rel = (e: Event) => handle(e as OrientationEventWithCompass, false);
  window.addEventListener('deviceorientationabsolute', abs);
  window.addEventListener('deviceorientation', rel);
  return () => {
    window.removeEventListener('deviceorientationabsolute', abs);
    window.removeEventListener('deviceorientation', rel);
  };
}
