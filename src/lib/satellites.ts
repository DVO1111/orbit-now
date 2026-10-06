import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLat,
  degreesLong,
  type SatRec,
} from 'satellite.js';
import { SAMPLE_TLE } from './sampleTle';
import type { Vec3 } from './planets';

export interface SatGroup {
  id: string;
  label: string;
  color: string;
  /** Fetch on startup. */
  defaultOn: boolean;
}

/** CelesTrak GP groups: https://celestrak.org/NORAD/elements/ */
export const SAT_GROUPS: SatGroup[] = [
  { id: 'stations', label: 'Space stations', color: '#ffcc33', defaultOn: true },
  { id: 'visual', label: 'Brightest', color: '#f8fafc', defaultOn: true },
  { id: 'science', label: 'Science', color: '#f472b6', defaultOn: true },
  { id: 'weather', label: 'Weather', color: '#60a5fa', defaultOn: false },
  { id: 'gnss', label: 'Navigation (GPS, Galileo…)', color: '#4ade80', defaultOn: true },
  { id: 'geo', label: 'Geostationary', color: '#a78bfa', defaultOn: false },
  { id: 'starlink', label: 'Starlink (large!)', color: '#94a3b8', defaultOn: false },
];

export const GROUP_BY_ID = new Map(SAT_GROUPS.map((g) => [g.id, g]));

export interface Satellite {
  /** NORAD catalog number */
  id: string;
  name: string;
  group: string;
  satrec: SatRec;
  epoch: Date;
}

export interface SatState {
  /** ECI (TEME) position, km */
  eci: Vec3;
  latDeg: number;
  lonDeg: number;
  altKm: number;
  speedKmS: number;
}

export function parseTle(text: string, group: string): Satellite[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0);
  const sats: Satellite[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('1 ') || !lines[i + 1]?.startsWith('2 ')) continue;
    const name = i > 0 && !lines[i - 1].startsWith('2 ') ? lines[i - 1].trim() : `NORAD ${lines[i].slice(2, 7).trim()}`;
    try {
      const satrec = twoline2satrec(lines[i], lines[i + 1]);
      if (satrec.error) continue;
      sats.push({
        id: String(satrec.satnum).trim(),
        name,
        group,
        satrec,
        epoch: new Date((satrec.jdsatepoch - 2440587.5) * 86_400_000),
      });
    } catch {
      // Skip malformed element sets.
    }
    i++;
  }
  return sats;
}

export function propagateSat(sat: Satellite, date: Date): SatState | null {
  const pv = propagate(sat.satrec, date);
  if (!pv || typeof pv.position !== 'object' || typeof pv.velocity !== 'object') return null;
  const { position: p, velocity: v } = pv;
  if (!Number.isFinite(p.x)) return null;
  const geo = eciToGeodetic(p, gstime(date));
  return {
    eci: { x: p.x, y: p.y, z: p.z },
    latDeg: degreesLat(geo.latitude),
    lonDeg: degreesLong(geo.longitude),
    altKm: geo.height,
    speedKmS: Math.hypot(v.x, v.y, v.z),
  };
}

/** Orbital period in minutes (satrec.no is mean motion in rad/min). */
export function periodMinutes(sat: Satellite): number {
  return (2 * Math.PI) / sat.satrec.no;
}

/** Greenwich mean sidereal time, radians. */
export function siderealAngle(date: Date): number {
  return gstime(date);
}

// --- Fetching -------------------------------------------------------------

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // CelesTrak asks clients not to re-download more than every 2 h.

export type TleSource = 'live' | 'cache' | 'sample';

export interface GroupResult {
  sats: Satellite[];
  source: TleSource;
  fetchedAt: Date | null;
}

function readCache(group: string): { text: string; at: number } | null {
  try {
    const raw = localStorage.getItem(`tle:${group}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(group: string, text: string) {
  try {
    localStorage.setItem(`tle:${group}`, JSON.stringify({ text, at: Date.now() }));
  } catch {
    // Storage full or unavailable (e.g. Starlink group in private mode) — not fatal.
  }
}

export async function loadGroup(group: string): Promise<GroupResult> {
  const cached = readCache(group);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { sats: parseTle(cached.text, group), source: 'cache', fetchedAt: new Date(cached.at) };
  }
  try {
    const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const sats = parseTle(text, group);
    if (sats.length === 0) throw new Error('empty response');
    writeCache(group, text);
    return { sats, source: 'live', fetchedAt: new Date() };
  } catch {
    if (cached) return { sats: parseTle(cached.text, group), source: 'cache', fetchedAt: new Date(cached.at) };
    if (group === 'stations') return { sats: parseTle(SAMPLE_TLE, group), source: 'sample', fetchedAt: null };
    return { sats: [], source: 'sample', fetchedAt: null };
  }
}

/** Merge groups, keeping the first group a satellite appears in. */
export function mergeGroups(results: Satellite[][]): Satellite[] {
  const seen = new Map<string, Satellite>();
  for (const list of results) for (const s of list) if (!seen.has(s.id)) seen.set(s.id, s);
  return [...seen.values()];
}
