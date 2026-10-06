// Helpers for NASA/JPL Horizons vector tables. Plain JS so the Node fetch
// script can use them without a build step.

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';

/** TDB − UTC in seconds (TT − TAI = 32.184 s, plus 37 leap seconds since 2017). */
export const TDB_MINUS_UTC_S = 69.184;

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

/** Horizons wants 'YYYY-MM-DD HH:MM' (UT when TIME_TYPE=UT). */
export function horizonsTime(ms) {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

export function vectorsUrl(target, startMs, stopMs, stepMinutes) {
  const params = {
    format: 'json',
    COMMAND: `'${target}'`,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'VECTORS',
    CENTER: "'500@301'", // centre of the Moon
    REF_PLANE: 'FRAME', // ICRF equatorial, same frame as the app's EQJ vectors
    REF_SYSTEM: 'ICRF',
    VEC_TABLE: '2', // position + velocity
    VEC_LABELS: 'NO',
    CSV_FORMAT: 'YES',
    OUT_UNITS: 'KM-S',
    TIME_TYPE: 'UT',
    START_TIME: `'${horizonsTime(startMs)}'`,
    STOP_TIME: `'${horizonsTime(stopMs)}'`,
    STEP_SIZE: `'${stepMinutes}m'`,
  };
  // encodeURIComponent (not URLSearchParams) so spaces become %20, as in the Horizons docs.
  const q = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `${API}?${q}`;
}

/**
 * Parse the CSV block between $$SOE and $$EOE.
 * Returns { times: number[] (UTC ms), states: number[][] ([x,y,z,vx,vy,vz] km, km/s) }
 * or throws with the Horizons message when there is no table.
 */
export function parseVectors(result) {
  const soe = result.indexOf('$$SOE');
  const eoe = result.indexOf('$$EOE');
  if (soe < 0 || eoe < 0) {
    const msg = result.split('\n').map((l) => l.trim()).filter(Boolean).slice(-6).join(' | ');
    throw new Error(msg || 'no ephemeris table in response');
  }
  // The column header before $$SOE says whether the JD column is TDB or UT.
  const isTdb = /JDTDB/.test(result.slice(0, soe)) && !/JDUT/.test(result.slice(0, soe));
  const times = [];
  const states = [];
  for (const line of result.slice(soe + 5, eoe).split('\n')) {
    const cols = line.split(',').map((c) => c.trim());
    if (cols.length < 8) continue;
    const jd = Number(cols[0]);
    const nums = cols.slice(2, 8).map(Number);
    if (!Number.isFinite(jd) || nums.some((n) => !Number.isFinite(n))) continue;
    let ms = (jd - 2440587.5) * 86_400_000;
    if (isTdb) ms -= TDB_MINUS_UTC_S * 1000;
    times.push(Math.round(ms / 1000) * 1000);
    states.push(nums);
  }
  if (times.length < 2) throw new Error('ephemeris table has fewer than 2 rows');
  return { times, states };
}

/**
 * Horizons reports coverage limits like
 * 'No ephemeris for target "X" after A.D. 2026-OCT-15 00:00:00.0000 TDB'.
 * Returns { kind: 'after' | 'prior', ms } or null.
 */
export function parseCoverageLimit(message) {
  const m = /(after|prior to) A\.D\. (\d{4})-([A-Z]{3})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?/.exec(message);
  if (!m || !(m[3] in MONTHS)) return null;
  const ms = Date.UTC(+m[2], MONTHS[m[3]], +m[4], +m[5], +m[6], +(m[7] ?? 0));
  return { kind: m[1] === 'after' ? 'after' : 'prior', ms };
}

/**
 * Fetch a Moon-centred state table for one spacecraft, shrinking the window
 * if Horizons says it only has data for part of it.
 */
export async function fetchLunarVectors(target, startMs, stopMs, stepMinutes, fetchImpl = fetch) {
  const stepMs = stepMinutes * 60_000;
  let start = startMs;
  let stop = stopMs;
  let lastError = 'unknown error';
  for (let attempt = 0; attempt < 4; attempt++) {
    if (stop - start < 2 * stepMs) break;
    const res = await fetchImpl(vectorsUrl(target, start, stop, stepMinutes));
    const body = await res.json().catch(() => ({}));
    const text = body.result ?? body.error ?? `HTTP ${res.status}`;
    try {
      return parseVectors(text);
    } catch (e) {
      lastError = e.message;
      const limit = parseCoverageLimit(text);
      if (!limit) break;
      // Snap inward to the step grid, with a margin for TDB/UT differences.
      if (limit.kind === 'after') stop = Math.floor((limit.ms - 10 * 60_000) / stepMs) * stepMs;
      else start = Math.ceil((limit.ms + 10 * 60_000) / stepMs) * stepMs;
    }
  }
  throw new Error(lastError);
}

/** Round a state table so the JSON stays small (1 m and 1 mm/s precision). */
export function packStates(states) {
  return states.flatMap(([x, y, z, vx, vy, vz]) => [
    +x.toFixed(3), +y.toFixed(3), +z.toFixed(3), +vx.toFixed(6), +vy.toFixed(6), +vz.toFixed(6),
  ]);
}
