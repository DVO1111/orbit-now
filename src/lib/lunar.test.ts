import { describe, expect, it } from 'vitest';
import { MOON_GM, ORBITERS, coverage, orbitalPeriodS, orbiterState, type OrbiterEphemeris } from './lunar';

// An LRO-like circular polar orbit, 100 km up, sampled every 10 minutes.
const R = 1837.4;
const V = Math.sqrt(MOON_GM / R);
const W = V / R; // rad/s
const START = Date.UTC(2026, 9, 6);
const STEP = 600_000;
const exact = (t: number) => {
  const a = W * ((t - START) / 1000);
  return { pos: [R * Math.cos(a), 0, R * Math.sin(a)], vel: [-V * Math.sin(a), 0, V * Math.cos(a)] };
};
const eph: OrbiterEphemeris = {
  id: 'test',
  start: START,
  stepMs: STEP,
  states: Array.from({ length: 145 }, (_, i) => {
    const e = exact(START + i * STEP);
    return [...e.pos, ...e.vel];
  }).flat(),
};

describe('lunar orbiters', () => {
  it('interpolates a 2-hour orbit to well under a kilometre', () => {
    let worst = 0;
    for (let t = START; t < START + 24 * 3_600_000; t += 97_000) {
      const st = orbiterState(eph, new Date(t))!;
      const e = exact(t);
      worst = Math.max(worst, Math.hypot(st.pos.x - e.pos[0], st.pos.y - e.pos[1], st.pos.z - e.pos[2]));
    }
    expect(worst).toBeLessThan(0.5);
  });

  it('returns exact samples on grid points and null outside coverage', () => {
    const st = orbiterState(eph, new Date(START + 3 * STEP))!;
    expect(st.pos.x).toBeCloseTo(exact(START + 3 * STEP).pos[0], 6);
    expect(orbiterState(eph, new Date(START - 1))).toBeNull();
    expect(orbiterState(eph, new Date(coverage(eph)[1].getTime() + 1))).toBeNull();
  });

  it('recovers the orbital period from a state', () => {
    const period = orbitalPeriodS(orbiterState(eph, new Date(START + 1234_000))!)!;
    expect(period / 60).toBeCloseTo((2 * Math.PI) / W / 60, 0); // ~118 minutes
  });

  it('has a well-formed catalogue', () => {
    for (const o of ORBITERS) {
      expect(o.horizonsId).toMatch(/^-\d+$/);
      expect(o.fact.length).toBeGreaterThan(20);
    }
    expect(new Set(ORBITERS.map((o) => o.id)).size).toBe(ORBITERS.length);
  });
});
