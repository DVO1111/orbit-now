import { describe, expect, it } from 'vitest';
import { RADIUS_KM, angleBetween, formatAngleRate, formatDuration, telescopeFov } from './telescope';
import { bodyVector } from './telescope';
import * as A from 'astronomy-engine';

const LAGOS = { lat: 6.524, lon: 3.379, heightM: 40, label: 'Lagos' };

describe('telescope helpers', () => {
  it('measures angles on the sky', () => {
    expect(angleBetween({ alt: 0, az: 0 }, { alt: 0, az: 90 })).toBeCloseTo(90, 6);
    expect(angleBetween({ alt: 10, az: 50 }, { alt: 20, az: 50 })).toBeCloseTo(10, 6);
    expect(angleBetween({ alt: 89.999, az: 0 }, { alt: 89.999, az: 180 })).toBeLessThan(0.01);
  });

  it('formats rates the way an observer would say them', () => {
    expect(formatAngleRate(15 / 3600)).toBe('15.0″ per second');
    expect(formatAngleRate(0.05)).toBe('3.0′ per second');
    expect(formatAngleRate(1.1)).toBe('1.10° per second');
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(130)).toBe('2 min 10 s');
    expect(formatDuration(Infinity)).toBe('never');
  });

  it('frames the Moon so its real ~0.5° disc fills a good part of the view', () => {
    const v = bodyVector(A.Body.Moon, new Date('2026-10-06T21:00:00Z'), LAGOS);
    const diameterDeg = (2 * Math.asin(RADIUS_KM.moon / v.distKm) * 180) / Math.PI;
    expect(diameterDeg).toBeGreaterThan(0.48);
    expect(diameterDeg).toBeLessThan(0.58);
    expect(diameterDeg / telescopeFov('moon')).toBeGreaterThan(0.35);
  });

  it("gives Saturn's real apparent size (~19 arcseconds near opposition)", () => {
    const v = bodyVector(A.Body.Saturn, new Date('2026-10-06T21:00:00Z'), LAGOS);
    const arcsec = 2 * Math.asin(RADIUS_KM.saturn / v.distKm) * (180 / Math.PI) * 3600;
    expect(arcsec).toBeGreaterThan(18);
    expect(arcsec).toBeLessThan(21);
  });
});
