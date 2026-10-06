import * as A from 'astronomy-engine';
import type { Vec3 } from './planets';

/** Geocentric Moon position in km, J2000 equatorial (EQJ) coordinates. */
export function moonPositionKm(date: Date): Vec3 {
  const v = A.GeoMoon(date);
  return { x: v.x * A.KM_PER_AU, y: v.y * A.KM_PER_AU, z: v.z * A.KM_PER_AU };
}

/** Unit vector from Earth toward the Sun, J2000 equatorial coordinates. */
export function sunDirection(date: Date): Vec3 {
  const v = A.GeoVector(A.Body.Sun, date, false);
  const r = v.Length();
  return { x: v.x / r, y: v.y / r, z: v.z / r };
}

export function moonPhaseName(phaseDeg: number): string {
  const names = [
    'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
    'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent',
  ];
  const idx = Math.floor(((phaseDeg + 22.5) % 360) / 45);
  return names[idx];
}

export interface MoonInfo {
  distanceKm: number;
  phaseDeg: number;
  phaseName: string;
  illuminatedPct: number;
  nextFull: Date;
  nextNew: Date;
}

export function moonInfo(date: Date): MoonInfo {
  const p = moonPositionKm(date);
  const phaseDeg = A.MoonPhase(date);
  return {
    distanceKm: Math.hypot(p.x, p.y, p.z),
    phaseDeg,
    phaseName: moonPhaseName(phaseDeg),
    illuminatedPct: A.Illumination(A.Body.Moon, date).phase_fraction * 100,
    nextFull: A.SearchMoonPhase(180, date, 40)!.date,
    nextNew: A.SearchMoonPhase(0, date, 40)!.date,
  };
}

export interface BodyAxes {
  /** Toward selenographic lat 0°, lon 0° (the mean sub-Earth point) */
  x: Vec3;
  /** Toward lat 0°, lon 90° E */
  y: Vec3;
  /** Lunar north pole */
  z: Vec3;
}

/**
 * The Moon's body-fixed axes in J2000 equatorial coordinates, from the IAU
 * rotation model (pole direction + prime-meridian angle W).
 */
export function moonBodyAxes(date: Date): BodyAxes {
  const ax = A.RotationAxis(A.Body.Moon, date);
  const z = { x: ax.north.x, y: ax.north.y, z: ax.north.z };
  // Ascending node of the lunar equator on the ICRF equator; W is measured from here.
  const nx = -z.y;
  const ny = z.x;
  const nl = Math.hypot(nx, ny);
  const node = { x: nx / nl, y: ny / nl, z: 0 };
  const q = { x: z.y * node.z - z.z * node.y, y: z.z * node.x - z.x * node.z, z: z.x * node.y - z.y * node.x };
  const w = (ax.spin * Math.PI) / 180;
  const c = Math.cos(w);
  const s = Math.sin(w);
  const x = { x: c * node.x + s * q.x, y: c * node.y + s * q.y, z: c * node.z + s * q.z };
  const y = { x: z.y * x.z - z.z * x.y, y: z.z * x.x - z.x * x.z, z: z.x * x.y - z.y * x.x };
  return { x, y, z };
}
