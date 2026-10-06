/**
 * Stereographic projection of the sky around a viewing direction, the
 * projection planetarium apps use: circles stay circles (the horizon is
 * a circle or straight line) and shapes look right near the edges.
 */
export interface View {
  /** Centre of the screen */
  az: number;
  alt: number;
  /** Vertical field of view, degrees */
  fov: number;
  /** Screen roll, degrees */
  roll: number;
  width: number;
  height: number;
}

export interface Projected {
  x: number;
  y: number;
  /** cos of the angle from the screen centre (1 = dead centre, < 0 = behind you) */
  z: number;
}

const rad = Math.PI / 180;

export function makeProjector(view: View) {
  const a0 = Math.min(Math.max(view.alt, -89.9), 89.9) * rad;
  const z0 = view.az * rad;
  // East-North-Up basis: forward, right, up of the camera.
  const f = [Math.cos(a0) * Math.sin(z0), Math.cos(a0) * Math.cos(z0), Math.sin(a0)];
  const r = [Math.cos(z0), -Math.sin(z0), 0];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const scale = view.height / 2 / (2 * Math.tan((view.fov * rad) / 4));
  const cr = Math.cos(view.roll * rad);
  const sr = Math.sin(view.roll * rad);
  const cx = view.width / 2;
  const cy = view.height / 2;

  /** Project an alt/az (degrees). Returns null for points nearly behind the viewer. */
  return function project(alt: number, az: number): Projected | null {
    const ca = Math.cos(alt * rad);
    const v = [ca * Math.sin(az * rad), ca * Math.cos(az * rad), Math.sin(alt * rad)];
    const z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
    if (z < -0.95) return null;
    const x = v[0] * r[0] + v[1] * r[1];
    const y = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
    const k = (2 / (1 + z)) * scale;
    const px = x * k;
    const py = y * k;
    // Screen roll (clockwise positive) rotates the sky the other way.
    return { x: cx + px * cr + py * sr, y: cy + px * sr - py * cr, z };
  };
}

export type Projector = ReturnType<typeof makeProjector>;
