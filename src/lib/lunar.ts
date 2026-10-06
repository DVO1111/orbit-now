import catalogue from './lunarOrbiters.json';
import type { Vec3 } from './planets';

export interface OrbiterDef {
  id: string;
  horizonsId: string;
  name: string;
  fullName: string;
  agency: string;
  since: number;
  color: string;
  fact: string;
  /** 'orbiter': in lunar orbit now. 'mission': a past flight that can be replayed. */
  kind: 'orbiter' | 'mission';
  /** Flight window fetched for past missions (ISO dates). */
  window?: { start: string; stop: string };
}

export const ORBITERS = catalogue as OrbiterDef[];
export const ORBITER_BY_ID = new Map(ORBITERS.map((o) => [o.id, o]));

export const MOON_RADIUS_KM = 1737.4;
/** Moon's gravitational parameter, km³/s² */
export const MOON_GM = 4902.8;

/** Moon-centred states on a uniform time grid (from JPL Horizons, ICRF axes). */
export interface OrbiterEphemeris {
  id: string;
  /** UTC ms of the first state */
  start: number;
  stepMs: number;
  /** Flattened [x, y, z, vx, vy, vz] per step: km and km/s */
  states: number[];
}

export interface LunarData {
  generated: string;
  craft: OrbiterEphemeris[];
  errors: { id: string; error: string }[];
}

export interface OrbiterState {
  /** Position relative to the Moon's centre, km (J2000 equatorial) */
  pos: Vec3;
  /** Velocity relative to the Moon, km/s */
  vel: Vec3;
}

export async function loadLunarData(): Promise<LunarData | null> {
  try {
    const res = await fetch('./lunar-orbiters.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = (await res.json()) as LunarData;
    return Array.isArray(data.craft) ? data : null;
  } catch {
    return null;
  }
}

export function coverage(eph: OrbiterEphemeris): [Date, Date] {
  const n = eph.states.length / 6;
  return [new Date(eph.start), new Date(eph.start + (n - 1) * eph.stepMs)];
}

/**
 * State at `date` by cubic Hermite interpolation between the two neighbouring
 * samples (uses both positions and velocities, so a 10-minute grid is good to
 * well under a kilometre even for LRO's 2-hour orbit). Null outside coverage.
 */
export function orbiterState(eph: OrbiterEphemeris, date: Date): OrbiterState | null {
  const n = eph.states.length / 6;
  const f = (date.getTime() - eph.start) / eph.stepMs;
  if (!(f >= 0 && f <= n - 1)) return null;
  const i = Math.min(Math.floor(f), n - 2);
  const s = f - i;
  const h = eph.stepMs / 1000; // seconds
  const a = eph.states;
  const o0 = i * 6;
  const o1 = o0 + 6;

  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  const d00 = 6 * s2 - 6 * s;
  const d10 = 3 * s2 - 4 * s + 1;
  const d01 = -6 * s2 + 6 * s;
  const d11 = 3 * s2 - 2 * s;

  const p = [0, 0, 0];
  const v = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const p0 = a[o0 + k];
    const v0 = a[o0 + 3 + k];
    const p1 = a[o1 + k];
    const v1 = a[o1 + 3 + k];
    p[k] = h00 * p0 + h10 * h * v0 + h01 * p1 + h11 * h * v1;
    v[k] = (d00 * p0 + d01 * p1) / h + d10 * v0 + d11 * v1;
  }
  return { pos: { x: p[0], y: p[1], z: p[2] }, vel: { x: v[0], y: v[1], z: v[2] } };
}

/** Moment of closest approach to the Moon in the data (used to jump to a mission's highlight). */
export function closestApproach(eph: OrbiterEphemeris): { date: Date; distanceKm: number } {
  let best = 0;
  let bestR = Infinity;
  for (let i = 0; i < eph.states.length / 6; i++) {
    const r = Math.hypot(eph.states[i * 6], eph.states[i * 6 + 1], eph.states[i * 6 + 2]);
    if (r < bestR) {
      bestR = r;
      best = i;
    }
  }
  return { date: new Date(eph.start + best * eph.stepMs), distanceKm: bestR };
}

/** Two-body orbital period around the Moon in seconds, or null if not bound. */
export function orbitalPeriodS(st: OrbiterState): number | null {
  const r = Math.hypot(st.pos.x, st.pos.y, st.pos.z);
  const v2 = st.vel.x ** 2 + st.vel.y ** 2 + st.vel.z ** 2;
  const inv = 2 / r - v2 / MOON_GM;
  if (inv <= 0) return null;
  const a = 1 / inv;
  return 2 * Math.PI * Math.sqrt(a ** 3 / MOON_GM);
}
