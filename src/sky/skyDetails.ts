import * as A from 'astronomy-engine';
import { describe, fmt, type DescribeContext, type Details } from '../lib/details';
import {
  CONSTELLATION_NAMES, STARS, SKY_BODIES, brightnessWords, horizonRotation, observerOf, pointingHint, predictPasses,
  satellitesInSky, skyDarkness, toAltAz, type AltAz, type SkyLocation,
} from '../lib/sky/sky';

const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const dayTime = (d: Date, now: Date) =>
  d.toDateString() === now.toDateString() ? time(d) : `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time(d)}`;

function starColourWords(bv: number): string {
  if (bv < 0) return 'blue-white';
  if (bv < 0.3) return 'white';
  if (bv < 0.6) return 'yellow-white';
  if (bv < 0.9) return 'yellow';
  if (bv < 1.4) return 'orange';
  return 'red-orange';
}

function lookRows(p: AltAz): [string, string][] {
  return [['Where to look', pointingHint(p)]];
}

// Pass predictions are slow-ish (a day at 20 s steps), so cache them per object, place and hour.
const passCache = new Map<string, ReturnType<typeof predictPasses>>();

export function skyDetails(id: string, date: Date, loc: SkyLocation, ctx: DescribeContext): Details | null {
  const obs = observerOf(loc);
  const sunEq = A.Equator(A.Body.Sun, date, obs, true, true);
  const sunAlt = A.Horizon(date, obs, sunEq.ra, sunEq.dec).altitude;
  const dark = skyDarkness(sunAlt);

  if (id.startsWith('star:')) {
    const s = STARS[Number(id.slice(5))];
    if (!s) return null;
    const p = toAltAz(horizonRotation(date, loc), s);
    const con = CONSTELLATION_NAMES.get(s.constellation) ?? s.constellation;
    return {
      title: s.name || `A star in ${con || 'the sky'}`,
      subtitle: `Star${con ? ` · ${con}` : ''}`,
      rows: [
        ...lookRows(p),
        ['Brightness', `magnitude ${s.mag.toFixed(1)}, ${brightnessWords(s.mag)}`],
        ['Colour', starColourWords(s.bv)],
      ],
      fact: 'Stars twinkle because they are tiny points of light. Planets are tiny discs, so they usually shine steadily.',
      warning: dark === 'day' ? "It's daytime where you are, so stars are hidden by the bright sky." : undefined,
    };
  }

  const body = SKY_BODIES.find((b) => b.id === id);
  if (body) {
    const eq = A.Equator(body.body, date, obs, true, true);
    const hor = A.Horizon(date, obs, eq.ra, eq.dec, 'normal');
    const base = describe(id, date, ctx);
    const rows: [string, string][] = lookRows({ alt: hor.altitude, az: hor.azimuth });
    const rise = A.SearchRiseSet(body.body, obs, +1, date, 2);
    const set = A.SearchRiseSet(body.body, obs, -1, date, 2);
    if (rise) rows.push(['Next rise', dayTime(rise.date, date)]);
    if (set) rows.push(['Next set', dayTime(set.date, date)]);
    if (body.body !== A.Body.Sun) {
      const mag = A.Illumination(body.body, date).mag;
      rows.push(['Brightness', `magnitude ${mag.toFixed(1)}, ${brightnessWords(mag)}`]);
    }
    const warning =
      hor.altitude < 0
        ? `Below your horizon right now${rise ? `. It rises at ${dayTime(rise.date, date)}` : ''}.`
        : body.body !== A.Body.Sun && body.body !== A.Body.Moon && dark === 'day'
          ? 'Above your horizon, but the daytime sky hides it.'
          : undefined;
    return {
      title: base?.title ?? body.name,
      subtitle: base?.subtitle ?? '',
      rows: [...rows, ...(base?.rows ?? []).filter(([k]) => !['Right ascension', 'Declination', 'Brightness'].includes(k))],
      fact:
        body.body === A.Body.Sun
          ? 'Never look directly at the Sun, with or without binoculars.'
          : ['venus', 'jupiter', 'mars', 'saturn', 'mercury'].includes(body.id)
            ? 'Tip: planets shine with a steady light and drift slowly against the stars from night to night.'
            : base?.fact,
      warning: body.body === A.Body.Sun && hor.altitude > 0 ? 'Never look directly at the Sun.' : warning,
    };
  }

  if (id.startsWith('sat:')) {
    const sat = ctx.satsById.get(id.slice(4));
    const base = describe(id, date, ctx);
    if (!sat || !base) return base;
    const now = satellitesInSky([sat], date, loc, -90)[0];
    const rows: [string, string][] = [];
    let answer = 'Unknown';
    if (now) {
      rows.push(...lookRows(now));
      rows.push(['Distance from you', `${fmt.num(now.rangeKm)} km`]);
      if (now.alt < 0) answer = 'No, it is below your horizon';
      else if (!now.sunlit) answer = "No, it is in Earth's shadow";
      else if (dark === 'day') answer = 'No, the daytime sky is too bright';
      else answer = 'Yes: a steady, non-blinking dot moving across the stars';
      rows.push(['Visible to the eye now?', answer]);
    }
    const key = `${sat.id}|${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}|${Math.floor(date.getTime() / 3_600_000)}`;
    if (!passCache.has(key)) passCache.set(key, predictPasses(sat, date, loc, 24));
    const passes = (passCache.get(key) ?? []).filter((p) => p.set.getTime() > date.getTime()).slice(0, 3);
    for (const [i, p] of passes.entries()) {
      rows.push([
        i === 0 ? 'Next passes (24 h)' : '',
        `${dayTime(p.rise, date)}: rises ${compass(p.riseAz)}, highest ${Math.round(p.peakAlt)}° ${compass(p.peakAz)}${p.visible ? ' · visible ✓' : ''}`,
      ]);
    }
    if (!passes.length) rows.push(['Next passes (24 h)', 'None more than 10° up']);
    return { ...base, rows: [...rows, ...base.rows] };
  }

  return null;
}

function compass(az: number) {
  const pts = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return pts[Math.round(az / 45) % 8];
}
