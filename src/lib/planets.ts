import * as A from 'astronomy-engine';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlanetInfo {
  id: string;
  name: string;
  body: A.Body;
  color: string;
  /** Display radius in the compressed solar-system scene. */
  displayRadius: number;
  radiusKm: number;
  periodDays: number;
  moons: number;
  fact: string;
}

export const PLANETS: PlanetInfo[] = [
  {
    id: 'mercury', name: 'Mercury', body: A.Body.Mercury, color: '#a8a29e', displayRadius: 0.45,
    radiusKm: 2439.7, periodDays: 87.969, moons: 0,
    fact: 'The smallest planet. A day on Mercury (sunrise to sunrise) lasts 176 Earth days.',
  },
  {
    id: 'venus', name: 'Venus', body: A.Body.Venus, color: '#e9c46a', displayRadius: 0.8,
    radiusKm: 6051.8, periodDays: 224.701, moons: 0,
    fact: 'The hottest planet (~465 °C), and it spins backwards compared with most planets.',
  },
  {
    id: 'earth', name: 'Earth', body: A.Body.Earth, color: '#3b82f6', displayRadius: 0.85,
    radiusKm: 6371.0, periodDays: 365.256, moons: 1,
    fact: 'Home. The only place we know of with life, and liquid water on its surface.',
  },
  {
    id: 'mars', name: 'Mars', body: A.Body.Mars, color: '#dc6b3f', displayRadius: 0.6,
    radiusKm: 3389.5, periodDays: 686.98, moons: 2,
    fact: 'Home to Olympus Mons, the tallest volcano in the solar system (~22 km high).',
  },
  {
    id: 'jupiter', name: 'Jupiter', body: A.Body.Jupiter, color: '#d4a373', displayRadius: 1.9,
    radiusKm: 69911, periodDays: 4332.59, moons: 95,
    fact: 'More than twice as massive as all the other planets combined. The Great Red Spot is a storm wider than Earth.',
  },
  {
    id: 'saturn', name: 'Saturn', body: A.Body.Saturn, color: '#e9d8a6', displayRadius: 1.6,
    radiusKm: 58232, periodDays: 10759.22, moons: 146,
    fact: 'Its rings are mostly water ice and span ~280,000 km, yet are often only ~10 m thick.',
  },
  {
    id: 'uranus', name: 'Uranus', body: A.Body.Uranus, color: '#94d2bd', displayRadius: 1.15,
    radiusKm: 25362, periodDays: 30688.5, moons: 28,
    fact: 'Tilted 98°, it rolls around the Sun on its side.',
  },
  {
    id: 'neptune', name: 'Neptune', body: A.Body.Neptune, color: '#4f7cff', displayRadius: 1.1,
    radiusKm: 24622, periodDays: 60195, moons: 16,
    fact: 'Has the fastest winds measured in the solar system, over 2,000 km/h.',
  },
];

export const PLANET_BY_ID = new Map(PLANETS.map((p) => [p.id, p]));

const EQJ_TO_ECL = A.Rotation_EQJ_ECL();

/** Heliocentric position in AU, J2000 ecliptic coordinates. */
export function helioEcliptic(body: A.Body, date: Date): Vec3 {
  const v = A.RotateVector(EQJ_TO_ECL, A.HelioVector(body, date));
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * Compress distances so the outer planets fit on screen together with the inner
 * ones. Order and direction are preserved; only the radius is squashed.
 */
export function compressAU(rAU: number): number {
  return 20 * Math.pow(rAU, 0.45);
}

export function compressVec(v: Vec3): Vec3 {
  const r = Math.hypot(v.x, v.y, v.z);
  if (r === 0) return { x: 0, y: 0, z: 0 };
  const k = compressAU(r) / r;
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

/** Points along one full orbit, starting at `date` (heliocentric ecliptic AU). */
export function orbitPath(body: A.Body, periodDays: number, date: Date, samples = 360): Vec3[] {
  const pts: Vec3[] = [];
  const start = date.getTime();
  for (let i = 0; i <= samples; i++) {
    const t = new Date(start + (i / samples) * periodDays * 86_400_000);
    pts.push(helioEcliptic(body, t));
  }
  return pts;
}

export interface SkyPosition {
  /** Right ascension, hours */
  ra: number;
  /** Declination, degrees */
  dec: number;
  /** Distance from Earth, AU */
  distAU: number;
  constellation: string;
}

const GEOCENTER = new A.Observer(0, 0, 0);

/** Apparent geocentric sky position (of-date equator, with aberration). */
export function skyPosition(body: A.Body, date: Date): SkyPosition {
  const eq = A.Equator(body, date, GEOCENTER, true, true);
  // Constellation boundaries are defined in J2000 coordinates.
  const j2000 = A.Equator(body, date, GEOCENTER, false, true);
  return {
    ra: eq.ra,
    dec: eq.dec,
    distAU: eq.dist,
    constellation: A.Constellation(j2000.ra, j2000.dec).name,
  };
}

export function magnitude(body: A.Body, date: Date): number | null {
  if (body === A.Body.Earth) return null;
  try {
    return A.Illumination(body, date).mag;
  } catch {
    return null;
  }
}

export function sunDistanceAU(body: A.Body, date: Date): number {
  if (body === A.Body.Sun) return 0;
  return A.HelioVector(body, date).Length();
}

export const KM_PER_AU = A.KM_PER_AU;
