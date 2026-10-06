import { describe, expect, it } from 'vitest';
import { makeProjector } from './projection';

const view = { az: 90, alt: 20, fov: 90, roll: 0, width: 1000, height: 800 };

describe('sky projection', () => {
  const p = makeProjector(view);
  it('puts the viewing direction at the screen centre', () => {
    const c = p(20, 90)!;
    expect(c.x).toBeCloseTo(500, 6);
    expect(c.y).toBeCloseTo(400, 6);
    expect(c.z).toBeCloseTo(1, 6);
  });
  it('higher altitude is higher on screen, and south is to the right when facing east', () => {
    expect(p(40, 90)!.y).toBeLessThan(400);
    expect(p(20, 120)!.x).toBeGreaterThan(500);
  });
  it('the vertical field of view fills the screen height', () => {
    expect(p(20 + 45, 90)!.y).toBeCloseTo(0, 6);
    expect(p(20 - 45, 90)!.y).toBeCloseTo(800, 6);
  });
  it('drops points directly behind', () => {
    expect(p(-20, 270)).toBeNull();
  });
  it('rolling the screen rotates the sky', () => {
    const rolled = makeProjector({ ...view, roll: 90 });
    const q = rolled(40, 90)!;
    expect(q.y).toBeCloseTo(400, 6);
    expect(q.x).not.toBeCloseTo(500, 0);
  });
});
