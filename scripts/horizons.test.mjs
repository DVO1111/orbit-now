import { describe, expect, it } from 'vitest';
import { fetchLunarVectors, packStates, parseCoverageLimit, parseVectors, vectorsUrl } from './horizons.mjs';

// Trimmed copy of the shape Horizons returns for a CSV vector table.
const SAMPLE = `*******************************************************************************
Ephemeris / API_USER Tue Oct  6 12:00:00 2026 Pasadena, USA      / Horizons
*******************************************************************************
Target body name: Lunar Reconnaissance Orbiter (spacecraft) (-85)
Center body name: Moon (301)                      {source: DE441}
*******************************************************************************
            JDTDB,            Calendar Date (TDB),                      X,                      Y,                      Z,                     VX,                     VY,                     VZ,
**************************************************************************************************************************************************************************************************
$$SOE
2461320.000800741, A.D. 2026-Oct-06 12:01:09.1840,  1.000000000000000E+03,  1.500000000000000E+03,  2.000000000000000E+02, -1.200000000000000E+00,  8.000000000000000E-01,  1.000000000000000E-01,
2461320.007745185, A.D. 2026-Oct-06 12:11:09.1840,  2.000000000000000E+02,  1.700000000000000E+03,  3.000000000000000E+02, -1.300000000000000E+00,  6.000000000000000E-01,  1.000000000000000E-01,
$$EOE
**************************************************************************************************************************************************************************************************
`;

describe('Horizons parsing', () => {
  it('reads the CSV vector table and converts TDB to UTC', () => {
    const { times, states } = parseVectors(SAMPLE);
    expect(states).toEqual([
      [1000, 1500, 200, -1.2, 0.8, 0.1],
      [200, 1700, 300, -1.3, 0.6, 0.1],
    ]);
    expect(new Date(times[0]).toISOString()).toBe('2026-10-06T12:00:00.000Z');
    expect(times[1] - times[0]).toBe(600_000);
  });

  it('surfaces the Horizons message when there is no table', () => {
    expect(() => parseVectors('No ephemeris for target "X" after A.D. 2026-OCT-08 00:00:00.0000 TDB')).toThrow(/No ephemeris/);
  });

  it('parses coverage limits', () => {
    expect(parseCoverageLimit('No ephemeris for target "X" after A.D. 2026-OCT-08 06:30:00.0000 TDB')).toEqual({
      kind: 'after',
      ms: Date.UTC(2026, 9, 8, 6, 30),
    });
    expect(parseCoverageLimit('... prior to A.D. 2026-JAN-02 00:00:00.0000 TDB')?.kind).toBe('prior');
    expect(parseCoverageLimit('Bad command')).toBeNull();
  });

  it('retries with a shrunk window when coverage ends early', async () => {
    const calls = [];
    const fake = async (url) => {
      calls.push(decodeURIComponent(url));
      const result = calls.length === 1 ? 'No ephemeris for target "X" after A.D. 2026-OCT-08 00:00:00.0000 TDB' : SAMPLE;
      return { status: 200, json: async () => ({ result }) };
    };
    const start = Date.UTC(2026, 9, 6);
    const stop = Date.UTC(2026, 9, 12);
    await fetchLunarVectors('-85', start, stop, 10, fake);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("STOP_TIME='2026-10-07 23:50'");
  });

  it('asks for Moon-centred ICRF vectors in UT', () => {
    const url = decodeURIComponent(vectorsUrl('-85', Date.UTC(2026, 9, 6), Date.UTC(2026, 9, 7), 10));
    expect(url).toContain("CENTER='500@301'");
    expect(url).toContain('REF_PLANE=FRAME');
    expect(url).toContain('TIME_TYPE=UT');
    expect(url).toContain("STEP_SIZE='10m'");
  });

  it('packs states compactly', () => {
    expect(packStates([[1.23456, 2, 3, 0.1234567, 0, 0]])).toEqual([1.235, 2, 3, 0.123457, 0, 0]);
  });
});
