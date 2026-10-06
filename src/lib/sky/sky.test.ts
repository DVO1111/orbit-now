import { describe, expect, it } from 'vitest';
import * as A from 'astronomy-engine';
import {
  STARS, bodiesInSky, compassPoint, horizonRotation, pointingHint, predictPasses, satellitesInSky, toAltAz, type SkyLocation,
} from './sky';
import { parseTle } from '../satellites';
import { SAMPLE_TLE } from '../sampleTle';

const LONDON: SkyLocation = { lat: 51.5, lon: -0.13, heightM: 20, label: 'London' };
const LAGOS: SkyLocation = { lat: 6.52, lon: 3.38, heightM: 40, label: 'Lagos' };
const DATE = new Date('2026-10-06T21:00:00Z');
const star = (name: string) => STARS.find((s) => s.name === name)!;

describe('sky positions', () => {
  it('has the bright named stars', () => {
    expect(STARS.length).toBeGreaterThan(2500);
    for (const n of ['Sirius', 'Vega', 'Polaris', 'Betelgeuse', 'Canopus']) expect(star(n), n).toBeTruthy();
  });

  it('puts Polaris at an altitude equal to your latitude, due north', () => {
    for (const loc of [LONDON, LAGOS]) {
      const p = toAltAz(horizonRotation(DATE, loc), star('Polaris'));
      expect(Math.abs(p.alt - loc.lat)).toBeLessThan(1.2);
      expect(Math.min(p.az, 360 - p.az)).toBeLessThan(2);
    }
  });

  it('agrees with Astronomy Engine Horizon() for every bright star', () => {
    const rot = horizonRotation(DATE, LONDON);
    const obs = new A.Observer(LONDON.lat, LONDON.lon, LONDON.heightM);
    for (const s of STARS.slice(0, 40)) {
      const fast = toAltAz(rot, s);
      // Same star via Horizon(): J2000 → of-date equator first.
      const eqd = A.RotateVector(A.Rotation_EQJ_EQD(DATE), new A.Vector(s.x, s.y, s.z, A.MakeTime(DATE)));
      const sph = A.EquatorFromVector(eqd);
      const slow = A.Horizon(DATE, obs, sph.ra, sph.dec, 'normal');
      expect(Math.abs(fast.alt - slow.altitude), s.name).toBeLessThan(0.02);
      const dAz = Math.abs(((fast.az - slow.azimuth + 540) % 360) - 180);
      if (slow.altitude < 85) expect(dAz, s.name).toBeLessThan(0.05);
    }
  });

  it('puts the Sun in the south at local noon in London and up in the day', () => {
    const noon = new Date('2026-10-06T11:52:00Z');
    const sun = bodiesInSky(noon, LONDON).find((b) => b.id === 'sun')!;
    expect(sun.az).toBeGreaterThan(170);
    expect(sun.az).toBeLessThan(190);
    expect(sun.alt).toBeGreaterThan(25);
    const midnight = bodiesInSky(new Date('2026-10-06T23:52:00Z'), LONDON).find((b) => b.id === 'sun')!;
    expect(midnight.alt).toBeLessThan(-20);
  });

  it('gives planets real magnitudes', () => {
    const venus = bodiesInSky(DATE, LAGOS).find((b) => b.id === 'venus')!;
    expect(venus.mag).toBeLessThan(-3);
  });
});

describe('satellites in the sky', () => {
  const iss = parseTle(SAMPLE_TLE, 'stations').find((s) => s.id === '25544')!;

  it('finds ISS passes with rise before peak before set', () => {
    const passes = predictPasses(iss, new Date('2026-10-06T00:00:00Z'), LONDON, 24);
    expect(passes.length).toBeGreaterThan(0);
    for (const p of passes) {
      expect(p.rise.getTime()).toBeLessThanOrEqual(p.peak.getTime());
      expect(p.peak.getTime()).toBeLessThanOrEqual(p.set.getTime());
      expect(p.peakAlt).toBeGreaterThanOrEqual(10);
      expect(p.set.getTime() - p.rise.getTime()).toBeLessThan(15 * 60_000);
    }
  });

  it('reports the ISS overhead at its pass peak', () => {
    const p = predictPasses(iss, new Date('2026-10-06T00:00:00Z'), LONDON, 24)[0];
    const now = satellitesInSky([iss], p.peak, LONDON, 0);
    expect(now).toHaveLength(1);
    expect(now[0].alt).toBeCloseTo(p.peakAlt, 3);
  });
});

describe('wording', () => {
  it('names compass points', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(112.5)).toBe('ESE');
    expect(compassPoint(359)).toBe('N');
    expect(pointingHint({ alt: 34, az: 112 })).toBe('Face east-southeast (112°) and look 34° up');
    expect(pointingHint({ alt: 20, az: 45 })).toBe('Face north-east (45°) and look 20° up');
  });
});
