import { describe, expect, it } from 'vitest';
import { MOONS, displayMoonDistance, moonOffsetKm, moonsOf, planetPole } from './moons';
import { PLANET_BY_ID } from './planets';

const DATE = new Date('2026-10-06T12:00:00Z');
const len = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z;

describe('planetary moons', () => {
  it('puts every moon at about its real distance from its planet', () => {
    for (const m of MOONS) {
      const r = len(moonOffsetKm(m, DATE));
      // The Moon's orbit is eccentric (e≈0.055); the Galilean moons are nearly circular.
      expect(Math.abs(r - m.aKm) / m.aKm, m.name).toBeLessThan(0.07);
    }
  });

  it('keeps regular moons in their planet\'s equatorial plane', () => {
    for (const m of MOONS.filter((x) => x.model !== 'earth')) {
      const v = moonOffsetKm(m, DATE);
      const sinLat = dot(v, planetPole(m.parent, DATE)) / len(v);
      expect(Math.abs(sinLat), m.name).toBeLessThan(Math.sin((2 * Math.PI) / 180)); // within 2°
    }
  });

  it('moves the Galilean moons by the right angle in an hour', () => {
    const io = MOONS.find((m) => m.id === 'io')!;
    const a = moonOffsetKm(io, DATE);
    const b = moonOffsetKm(io, new Date(DATE.getTime() + 3_600_000));
    const deg = (Math.acos(dot(a, b) / (len(a) * len(b))) * 180) / Math.PI;
    expect(deg).toBeCloseTo(360 / (1.769 * 24), 0); // ~8.5° per hour
  });

  it('draws moons in order and outside the planet and rings', () => {
    for (const parent of ['mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
      const p = PLANET_BY_ID.get(parent)!;
      const ds = moonsOf(parent).sort((a, b) => a.aKm - b.aKm).map((m) => displayMoonDistance(parent, m.aKm));
      expect(ds[0]).toBeGreaterThan(p.displayRadius);
      for (let i = 1; i < ds.length; i++) expect(ds[i]).toBeGreaterThan(ds[i - 1]);
    }
    const saturn = PLANET_BY_ID.get('saturn')!;
    expect(displayMoonDistance('saturn', 2.27 * saturn.radiusKm)).toBeLessThan(displayMoonDistance('saturn', 185_539));
  });
});
