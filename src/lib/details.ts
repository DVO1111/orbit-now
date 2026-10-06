import * as A from 'astronomy-engine';
import { KM_PER_AU, PLANET_BY_ID, magnitude, skyPosition, sunDistanceAU } from './planets';
import { moonInfo } from './moon';
import { MOON_BY_ID, moonOffsetKm, moonsOf } from './moons';
import { moonPositionKm } from './moon';
import { MOON_RADIUS_KM, coverage, orbitalPeriodS, orbiterState, type OrbiterDef, type OrbiterEphemeris } from './lunar';
import { GROUP_BY_ID, periodMinutes, propagateSat, type Satellite } from './satellites';

export interface Details {
  title: string;
  subtitle: string;
  rows: [string, string][];
  fact?: string;
  warning?: string;
  note?: string;
}

const LIGHT_KM_S = 299_792.458;

export const fmt = {
  num: (n: number, digits = 0) => n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }),
  ra: (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    const s = Math.round(((hours - h) * 60 - m) * 60);
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  },
  dec: (deg: number) => {
    const sign = deg < 0 ? '−' : '+';
    const a = Math.abs(deg);
    const d = Math.floor(a);
    const m = Math.round((a - d) * 60);
    return `${sign}${d}° ${String(m).padStart(2, '0')}′`;
  },
  lightTime: (km: number) => {
    const s = km / LIGHT_KM_S;
    if (s < 60) return `${s.toFixed(1)} s`;
    if (s < 3600) return `${(s / 60).toFixed(1)} min`;
    return `${(s / 3600).toFixed(2)} h`;
  },
  latLon: (lat: number, lon: number) =>
    `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`,
  date: (d: Date) => d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
};

function skyRows(body: A.Body, date: Date): [string, string][] {
  const sky = skyPosition(body, date);
  const km = sky.distAU * KM_PER_AU;
  return [
    ['Distance from Earth', `${fmt.num(sky.distAU, 3)} AU · ${fmt.num(km / 1e6, 1)} million km`],
    ['Light travel time', fmt.lightTime(km)],
    ['Right ascension', fmt.ra(sky.ra)],
    ['Declination', fmt.dec(sky.dec)],
    ['Constellation', sky.constellation],
  ];
}

export interface DescribeContext {
  satsById: Map<string, Satellite>;
  lunarById: Map<string, { def: OrbiterDef; eph: OrbiterEphemeris }>;
  lunarGenerated: Date | null;
}

export function describe(id: string, date: Date, ctx: DescribeContext): Details | null {
  const { satsById } = ctx;
  if (id === 'sun') {
    return {
      title: 'Sun',
      subtitle: 'G-type main-sequence star',
      rows: [...skyRows(A.Body.Sun, date), ['Radius', '696,340 km']],
      fact: 'The Sun holds 99.86% of all the mass in the solar system.',
    };
  }

  if (id === 'moon') {
    const m = moonInfo(date);
    const sky = skyPosition(A.Body.Moon, date);
    return {
      title: 'Moon',
      subtitle: "Earth's natural satellite",
      rows: [
        ['Distance from Earth', `${fmt.num(m.distanceKm)} km`],
        ['Light travel time', fmt.lightTime(m.distanceKm)],
        ['Phase', `${m.phaseName} (${m.illuminatedPct.toFixed(0)}% lit)`],
        ['Next full moon', fmt.date(m.nextFull)],
        ['Next new moon', fmt.date(m.nextNew)],
        ['Right ascension', fmt.ra(sky.ra)],
        ['Declination', fmt.dec(sky.dec)],
        ['Constellation', sky.constellation],
      ],
      fact: 'The Moon drifts about 3.8 cm farther from Earth every year.',
    };
  }

  const planet = PLANET_BY_ID.get(id);
  if (planet) {
    const rows: [string, string][] = [
      ['Distance from Sun', `${fmt.num(sunDistanceAU(planet.body, date), 3)} AU`],
    ];
    if (planet.body !== A.Body.Earth) {
      rows.push(...skyRows(planet.body, date));
      const mag = magnitude(planet.body, date);
      if (mag !== null) rows.push(['Brightness', `magnitude ${mag.toFixed(1)}`]);
    }
    rows.push(
      ['Radius', `${fmt.num(planet.radiusKm)} km`],
      ['Year length', planet.periodDays < 1000 ? `${fmt.num(planet.periodDays, 1)} days` : `${fmt.num(planet.periodDays / 365.25, 1)} years`],
      ['Known moons', String(planet.moons)],
    );
    const shown = moonsOf(planet.id).map((m) => m.name);
    if (shown.length) rows.push(['Moons shown', shown.join(', ')]);
    return { title: planet.name, subtitle: 'Planet', rows, fact: planet.fact };
  }

  const moon = MOON_BY_ID.get(id);
  if (moon) {
    const parent = PLANET_BY_ID.get(moon.parent)!;
    const off = moonOffsetKm(moon, date);
    const fromPlanet = Math.hypot(off.x, off.y, off.z);
    // Earth distance: planet's geocentric vector (rotated to the ecliptic) plus the moon's offset.
    const g = A.RotateVector(A.Rotation_EQJ_ECL(), A.GeoVector(parent.body, date, true));
    const fromEarth = Math.hypot(g.x * KM_PER_AU + off.x, g.y * KM_PER_AU + off.y, g.z * KM_PER_AU + off.z);
    const period = moon.periodDays < 2 ? `${fmt.num(moon.periodDays * 24, 1)} hours` : `${fmt.num(moon.periodDays, 2)} days`;
    return {
      title: moon.name,
      subtitle: `Moon of ${parent.name}`,
      rows: [
        [`Distance from ${parent.name}`, `${fmt.num(fromPlanet)} km (${fmt.num(fromPlanet / parent.radiusKm, 1)} ${parent.name} radii)`],
        ['Distance from Earth', `${fmt.num(fromEarth / KM_PER_AU, 3)} AU · ${fmt.num(fromEarth / 1e6, 1)} million km`],
        ['Light travel time', fmt.lightTime(fromEarth)],
        ['Orbital period', `${period}${moon.retrograde ? ' (retrograde)' : ''}`],
        ['Radius', `${fmt.num(moon.radiusKm, moon.radiusKm < 100 ? 1 : 0)} km`],
      ],
      fact: moon.fact,
      note:
        moon.model === 'circular'
          ? 'The orbit size, period and tilt are real, but where the moon is along its orbit is approximate.'
          : undefined,
    };
  }

  if (id.startsWith('lunar:')) {
    const entry = ctx.lunarById.get(id.slice(6));
    if (!entry) return null;
    const { def, eph } = entry;
    const st = orbiterState(eph, date);
    const [from, to] = coverage(eph);
    const details: Details = {
      title: def.name,
      subtitle: `${def.agency} · orbiting the Moon since ${def.since}`,
      rows: [],
      fact: def.fact,
      note: `Positions from NASA/JPL Horizons${ctx.lunarGenerated ? `, updated ${fmt.date(ctx.lunarGenerated)}` : ''}.`,
    };
    if (def.fullName !== def.name) details.rows.push(['Mission', def.fullName]);
    if (!st) {
      details.warning = `No trajectory data for this date. Data covers ${fmt.date(from)} to ${fmt.date(to)}. Press "Now" to come back.`;
      return details;
    }
    const r = Math.hypot(st.pos.x, st.pos.y, st.pos.z);
    const speed = Math.hypot(st.vel.x, st.vel.y, st.vel.z);
    const m = moonPositionKm(date);
    const fromEarth = Math.hypot(m.x + st.pos.x, m.y + st.pos.y, m.z + st.pos.z);
    const period = orbitalPeriodS(st);
    details.rows.push(
      ['Altitude above the Moon', `${fmt.num(r - MOON_RADIUS_KM)} km`],
      ['Speed (relative to the Moon)', `${fmt.num(speed, 2)} km/s (${fmt.num(speed * 3600)} km/h)`],
      ['Distance from Earth', `${fmt.num(fromEarth)} km`],
      ['Light travel time', fmt.lightTime(fromEarth)],
    );
    if (period) {
      const min = period / 60;
      details.rows.push(['Orbital period', min < 600 ? `≈ ${fmt.num(min)} min` : `≈ ${fmt.num(min / 1440, 1)} days`]);
    }
    return details;
  }

  if (id.startsWith('sat:')) {
    const sat = satsById.get(id.slice(4));
    if (!sat) return null;
    const st = propagateSat(sat, date);
    const ageDays = Math.abs(date.getTime() - sat.epoch.getTime()) / 86_400_000;
    const period = periodMinutes(sat);
    const details: Details = {
      title: sat.name,
      subtitle: `${GROUP_BY_ID.get(sat.group)?.label ?? sat.group} · NORAD ${sat.id}`,
      rows: st
        ? [
            ['Over', fmt.latLon(st.latDeg, st.lonDeg)],
            ['Altitude', `${fmt.num(st.altKm)} km`],
            ['Speed', `${fmt.num(st.speedKmS, 2)} km/s (${fmt.num(st.speedKmS * 3600)} km/h)`],
            ['Orbital period', period < 120 ? `${period.toFixed(1)} min` : `${(period / 60).toFixed(2)} h`],
            ['Orbits per day', fmt.num(1440 / period, 2)],
            ['Elements epoch', fmt.date(sat.epoch)],
          ]
        : [['Status', 'Propagation failed (decayed or bad elements)']],
    };
    if (ageDays > 14) {
      details.warning = `Orbital elements are ${Math.round(ageDays)} days from the shown time — the position may be off by a lot.`;
    }
    return details;
  }

  return null;
}
