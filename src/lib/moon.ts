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
