import * as A from 'astronomy-engine';
import { ecfToLookAngles, eciToEcf, gstime, propagate, shadowFraction } from 'satellite.js';
import type { Satellite } from '../satellites';
import data from './skyData.json';

/** Where the user is standing. */
export interface SkyLocation {
  lat: number;
  lon: number;
  /** metres above sea level */
  heightM: number;
  label: string;
}

/** A direction on the sky as seen by the observer. Azimuth: 0 = north, 90 = east. */
export interface AltAz {
  alt: number;
  az: number;
}

// --- Star catalogue -----------------------------------------------------------

export interface Star {
  index: number;
  /** J2000 unit vector (equatorial) */
  x: number;
  y: number;
  z: number;
  mag: number;
  /** B−V colour index (blue < 0 … red > 1.5) */
  bv: number;
  name: string;
  constellation: string;
}

type StarRow = [number, number, number, number, string?, string?];

const toUnit = (raDeg: number, decDeg: number) => {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  return { x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z: Math.sin(dec) };
};

export const STARS: Star[] = (data.stars as StarRow[]).map((r, index) => ({
  index,
  ...toUnit(r[0], r[1]),
  mag: r[2],
  bv: r[3],
  name: r[4] ?? '',
  constellation: r[5] ?? '',
}));

export const CONSTELLATION_NAMES = new Map(data.constellations.map((c) => [c.id, c.name]));
export const CONSTELLATIONS = data.constellations.map((c) => ({ ...c, ...toUnit(c.ra, c.dec) }));
/** Stick-figure polylines as J2000 unit vectors. */
export const CONSTELLATION_LINES = (data.lines as [number, number][][]).map((seg) => seg.map(([ra, dec]) => toUnit(ra, dec)));

/** Approximate star colour from its B−V index. */
export function starColor(bv: number): string {
  if (bv < -0.1) return '#9bb0ff';
  if (bv < 0.15) return '#cad7ff';
  if (bv < 0.45) return '#f8f7ff';
  if (bv < 0.7) return '#fff4ea';
  if (bv < 1.1) return '#ffd2a1';
  return '#ffb46b';
}

// --- Coordinate transforms ------------------------------------------------------

export function observerOf(loc: SkyLocation): A.Observer {
  return new A.Observer(loc.lat, loc.lon, loc.heightM);
}

/**
 * Rotation from J2000 equatorial to the observer's horizon frame for one
 * instant. Applying one matrix to every star is far faster than calling
 * Horizon() thousands of times per frame. Precession and nutation are
 * included; refraction is added afterwards.
 */
export function horizonRotation(date: Date, loc: SkyLocation): A.RotationMatrix {
  return A.Rotation_EQJ_HOR(date, observerOf(loc));
}

/** J2000 unit vector → altitude/azimuth (degrees), with atmospheric refraction. */
export function toAltAz(rot: A.RotationMatrix, v: { x: number; y: number; z: number }): AltAz {
  const r = rot.rot;
  // Horizon frame: x = north, y = west, z = zenith.
  const n = r[0][0] * v.x + r[1][0] * v.y + r[2][0] * v.z;
  const w = r[0][1] * v.x + r[1][1] * v.y + r[2][1] * v.z;
  const u = r[0][2] * v.x + r[1][2] * v.y + r[2][2] * v.z;
  const geomAlt = (Math.asin(Math.max(-1, Math.min(1, u))) * 180) / Math.PI;
  let az = (Math.atan2(-w, n) * 180) / Math.PI;
  if (az < 0) az += 360;
  return { alt: geomAlt + A.Refraction('normal', geomAlt), az };
}

// --- Solar-system bodies --------------------------------------------------------

export interface SkyBody {
  id: string;
  name: string;
  body: A.Body;
  color: string;
}

export const SKY_BODIES: SkyBody[] = [
  { id: 'sun', name: 'Sun', body: A.Body.Sun, color: '#ffd166' },
  { id: 'moon', name: 'Moon', body: A.Body.Moon, color: '#e2e8f0' },
  { id: 'mercury', name: 'Mercury', body: A.Body.Mercury, color: '#cbd5e1' },
  { id: 'venus', name: 'Venus', body: A.Body.Venus, color: '#fde68a' },
  { id: 'mars', name: 'Mars', body: A.Body.Mars, color: '#fb923c' },
  { id: 'jupiter', name: 'Jupiter', body: A.Body.Jupiter, color: '#fcd9a8' },
  { id: 'saturn', name: 'Saturn', body: A.Body.Saturn, color: '#fde68a' },
  { id: 'uranus', name: 'Uranus', body: A.Body.Uranus, color: '#99f6e4' },
  { id: 'neptune', name: 'Neptune', body: A.Body.Neptune, color: '#93c5fd' },
];

export interface BodyInSky extends SkyBody, AltAz {
  mag: number;
  /** Fraction lit (Moon, inner planets) */
  phase: number;
}

/** Topocentric position (parallax, aberration, refraction) of the Sun, Moon and planets. */
export function bodiesInSky(date: Date, loc: SkyLocation): BodyInSky[] {
  const obs = observerOf(loc);
  return SKY_BODIES.map((b) => {
    const eq = A.Equator(b.body, date, obs, true, true);
    const hor = A.Horizon(date, obs, eq.ra, eq.dec, 'normal');
    let mag = -26.7;
    let phase = 1;
    if (b.body !== A.Body.Sun) {
      const ill = A.Illumination(b.body, date);
      mag = ill.mag;
      phase = ill.phase_fraction;
    }
    return { ...b, alt: hor.altitude, az: hor.azimuth, mag, phase };
  });
}

/** Sun altitude decides how dark the sky is. */
export function skyDarkness(sunAlt: number): 'day' | 'twilight' | 'night' {
  if (sunAlt > -0.8) return 'day';
  if (sunAlt > -12) return 'twilight';
  return 'night';
}

// --- Satellites -------------------------------------------------------------------

export interface SatInSky extends AltAz {
  sat: Satellite;
  rangeKm: number;
  /** In sunlight (so it can reflect sunlight down to you). */
  sunlit: boolean;
}

const DEG = 180 / Math.PI;

function sunEciAU(date: Date) {
  const s = A.GeoVector(A.Body.Sun, date, false);
  return { x: s.x, y: s.y, z: s.z };
}

/** Where each satellite is in your sky right now (only those above `minAlt`). */
export function satellitesInSky(sats: Satellite[], date: Date, loc: SkyLocation, minAlt = -2): SatInSky[] {
  const gd = { latitude: loc.lat / DEG, longitude: loc.lon / DEG, height: loc.heightM / 1000 };
  const gmst = gstime(date);
  const sun = sunEciAU(date);
  const out: SatInSky[] = [];
  for (const sat of sats) {
    const pv = propagate(sat.satrec, date);
    if (!pv || typeof pv.position !== 'object') continue;
    const look = ecfToLookAngles(gd, eciToEcf(pv.position, gmst));
    const alt = look.elevation * DEG;
    if (alt < minAlt) continue;
    out.push({
      sat,
      alt,
      az: ((look.azimuth * DEG) % 360 + 360) % 360,
      rangeKm: look.rangeSat,
      sunlit: shadowFraction(sun, pv.position) < 0.5,
    });
  }
  return out;
}

export interface Pass {
  rise: Date;
  riseAz: number;
  peak: Date;
  peakAlt: number;
  peakAz: number;
  set: Date;
  setAz: number;
  /** Sunlit while your sky is dark at some point of the pass: you can see it with your eyes. */
  visible: boolean;
}

/** Next passes above `minAlt` within `hours`, scanning every 20 s. */
export function predictPasses(sat: Satellite, from: Date, loc: SkyLocation, hours = 24, minAlt = 10): Pass[] {
  const gd = { latitude: loc.lat / DEG, longitude: loc.lon / DEG, height: loc.heightM / 1000 };
  const obs = observerOf(loc);
  const step = 20_000;
  const passes: Pass[] = [];
  let cur: Pass | null = null;
  for (let t = from.getTime(); t < from.getTime() + hours * 3_600_000; t += step) {
    const date = new Date(t);
    const pv = propagate(sat.satrec, date);
    if (!pv || typeof pv.position !== 'object') continue;
    const look = ecfToLookAngles(gd, eciToEcf(pv.position, gstime(date)));
    const alt = look.elevation * DEG;
    const az = ((look.azimuth * DEG) % 360 + 360) % 360;
    if (alt > 0) {
      if (!cur) cur = { rise: date, riseAz: az, peak: date, peakAlt: alt, peakAz: az, set: date, setAz: az, visible: false };
      if (alt > cur.peakAlt) Object.assign(cur, { peak: date, peakAlt: alt, peakAz: az });
      cur.set = date;
      cur.setAz = az;
      if (!cur.visible && alt > minAlt && shadowFraction(sunEciAU(date), pv.position) < 0.5) {
        const sunEq = A.Equator(A.Body.Sun, date, obs, true, true);
        if (A.Horizon(date, obs, sunEq.ra, sunEq.dec).altitude < -6) cur.visible = true;
      }
    } else if (cur) {
      if (cur.peakAlt >= minAlt) passes.push(cur);
      cur = null;
    }
  }
  return passes;
}

// --- Helpers for people -------------------------------------------------------------

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const WORDS: Record<string, string> = { N: 'north', E: 'east', S: 'south', W: 'west' };

export function compassPoint(az: number): string {
  return POINTS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
}

/** "Face east-southeast (112°) and look 34° up" */
export function pointingHint({ alt, az }: AltAz): string {
  const p = compassPoint(az);
  const words = p.split('').map((c) => WORDS[c]).join('-').replace(/^(\w+)-(\w+)-(\w+)$/, '$1-$2$3');
  if (alt < 0) return `Below your horizon, toward the ${words}`;
  if (alt > 80) return 'Almost straight overhead';
  return `Face ${words} (${Math.round(az)}°) and look ${Math.round(alt)}° up`;
}

/** How bright, in everyday words. */
export function brightnessWords(mag: number): string {
  if (mag < -3) return 'extremely bright, brighter than any star';
  if (mag < -1) return 'very bright';
  if (mag < 1) return 'bright, easy to see even in a city';
  if (mag < 2.5) return 'easy to see';
  if (mag < 4) return 'visible away from bright lights';
  if (mag < 6) return 'faint, needs a dark sky';
  return 'too faint for the naked eye';
}
