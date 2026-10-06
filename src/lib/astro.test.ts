import { describe, expect, it } from 'vitest';
import * as A from 'astronomy-engine';
import { PLANETS, compressAU, helioEcliptic, skyPosition } from './planets';
import { moonInfo, moonPhaseName, moonPositionKm } from './moon';
import { mergeGroups, parseTle, periodMinutes, propagateSat } from './satellites';
import { SAMPLE_TLE } from './sampleTle';

const DATE = new Date('2026-10-06T12:00:00Z');

describe('planets', () => {
  it('puts Earth about 1 AU from the Sun, in the ecliptic plane', () => {
    const e = helioEcliptic(A.Body.Earth, DATE);
    expect(Math.hypot(e.x, e.y, e.z)).toBeCloseTo(1, 1);
    expect(Math.abs(e.z)).toBeLessThan(1e-3);
  });

  it('keeps planets in order after distance compression', () => {
    const r = PLANETS.map((p) => {
      const v = helioEcliptic(p.body, DATE);
      return compressAU(Math.hypot(v.x, v.y, v.z));
    });
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThan(r[i - 1]);
  });

  it('gives a sane sky position for Mars', () => {
    const s = skyPosition(A.Body.Mars, DATE);
    expect(s.ra).toBeGreaterThanOrEqual(0);
    expect(s.ra).toBeLessThan(24);
    expect(Math.abs(s.dec)).toBeLessThan(30);
    expect(s.distAU).toBeGreaterThan(0.3);
    expect(s.distAU).toBeLessThan(2.7);
    expect(s.constellation.length).toBeGreaterThan(0);
  });
});

describe('moon', () => {
  it('is between perigee and apogee distance', () => {
    const p = moonPositionKm(DATE);
    const d = Math.hypot(p.x, p.y, p.z);
    expect(d).toBeGreaterThan(356_000);
    expect(d).toBeLessThan(407_000);
  });

  it('names phases', () => {
    expect(moonPhaseName(0)).toBe('New Moon');
    expect(moonPhaseName(90)).toBe('First Quarter');
    expect(moonPhaseName(180)).toBe('Full Moon');
    expect(moonPhaseName(350)).toBe('New Moon');
  });

  it('finds upcoming full and new moons within a month', () => {
    const m = moonInfo(DATE);
    for (const d of [m.nextFull, m.nextNew]) {
      expect(d.getTime()).toBeGreaterThan(DATE.getTime());
      expect(d.getTime() - DATE.getTime()).toBeLessThan(30 * 86_400_000);
    }
  });
});

describe('satellites', () => {
  const sats = parseTle(SAMPLE_TLE, 'stations');

  it('parses the sample element sets', () => {
    expect(sats.map((s) => s.name)).toContain('ISS (ZARYA)');
    expect(sats.find((s) => s.name === 'ISS (ZARYA)')!.id).toBe('25544');
  });

  it('propagates the ISS to low Earth orbit', () => {
    const iss = sats.find((s) => s.id === '25544')!;
    const st = propagateSat(iss, DATE)!;
    expect(st.altKm).toBeGreaterThan(300);
    expect(st.altKm).toBeLessThan(500);
    expect(st.speedKmS).toBeCloseTo(7.66, 0);
    expect(Math.abs(st.latDeg)).toBeLessThanOrEqual(51.7);
    expect(periodMinutes(iss)).toBeCloseTo(92.9, 0);
  });

  it('puts a geostationary satellite near 35,786 km', () => {
    const goes = sats.find((s) => s.name === 'GOES 18')!;
    expect(propagateSat(goes, DATE)!.altKm).toBeCloseTo(35_786, -2);
  });

  it('dedupes satellites across groups', () => {
    expect(mergeGroups([sats, sats]).length).toBe(sats.length);
  });

  it('ignores junk input', () => {
    expect(parseTle('hello\nworld', 'x')).toEqual([]);
  });
});

describe('moon orientation', () => {
  it('keeps the near side facing Earth (sub-Earth point within libration limits)', async () => {
    const { moonBodyAxes } = await import('./moon');
    for (let d = 0; d < 30; d += 3) {
      const date = new Date(DATE.getTime() + d * 86_400_000);
      const m = moonPositionKm(date);
      const r = Math.hypot(m.x, m.y, m.z);
      const toEarth = { x: -m.x / r, y: -m.y / r, z: -m.z / r };
      const ax = moonBodyAxes(date);
      const dot = (a: typeof toEarth) => a.x * toEarth.x + a.y * toEarth.y + a.z * toEarth.z;
      const lon = (Math.atan2(dot(ax.y), dot(ax.x)) * 180) / Math.PI;
      const lat = (Math.asin(dot(ax.z)) * 180) / Math.PI;
      expect(Math.abs(lon)).toBeLessThan(9); // libration in longitude ≤ ~8°
      expect(Math.abs(lat)).toBeLessThan(8); // libration in latitude ≤ ~7°
    }
  });
});
