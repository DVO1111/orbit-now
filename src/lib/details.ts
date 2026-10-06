import * as A from 'astronomy-engine';
import { KM_PER_AU, PLANET_BY_ID, magnitude, skyPosition, sunDistanceAU } from './planets';
import { moonInfo } from './moon';
import { GROUP_BY_ID, periodMinutes, propagateSat, type Satellite } from './satellites';

export interface Details {
  title: string;
  subtitle: string;
  rows: [string, string][];
  fact?: string;
  warning?: string;
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

export function describe(id: string, date: Date, satsById: Map<string, Satellite>): Details | null {
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
    return { title: planet.name, subtitle: 'Planet', rows, fact: planet.fact };
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
