import { describe, expect, it } from 'vitest';
import { pointingFromAngles } from './orientation';

const near = (a: number, b: number, tol = 0.5) => expect(Math.abs(((a - b + 540) % 360) - 180)).toBeLessThan(tol);

describe('phone pointing', () => {
  it('upright phone facing north looks at the northern horizon', () => {
    const p = pointingFromAngles(0, 90, 0);
    expect(p.alt).toBeCloseTo(0, 5);
    near(p.az, 0);
    expect(p.roll).toBeCloseTo(0, 5);
  });

  it('alpha turns counter-clockwise: alpha 90 faces west', () => {
    near(pointingFromAngles(90, 90, 0).az, 270);
    near(pointingFromAngles(270, 90, 0).az, 90);
  });

  it('tilting the top back raises the view', () => {
    expect(pointingFromAngles(0, 135, 0).alt).toBeCloseTo(45, 5);
  });

  it('a phone lying face up points its camera at the ground', () => {
    expect(pointingFromAngles(0, 0, 0).alt).toBeCloseTo(-90, 5);
  });

  it('gamma on an upright phone turns it left/right without rolling', () => {
    const p = pointingFromAngles(0, 90, 30);
    near(p.az, 330);
    expect(p.roll).toBeCloseTo(0, 5);
  });

  it('landscape screens keep the horizon level', () => {
    expect(pointingFromAngles(0, 90, 0, 90).roll).toBeCloseTo(-90, 3);
  });
});
