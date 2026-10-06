import * as A from 'astronomy-engine';
import { PLANET_BY_ID, type Vec3 } from './planets';

/**
 * How a moon's position is computed:
 * - 'earth':    Earth's Moon, full lunar theory (accurate).
 * - 'jupiter':  Galilean moons, Astronomy Engine's L1.2 theory (accurate).
 * - 'circular': circular orbit with the real size and period in the planet's
 *               real equatorial plane. Where along the orbit it is shown is
 *               approximate, because no ephemeris for these moons runs offline.
 */
export type MoonModel = 'earth' | 'jupiter' | 'circular';

export interface MoonDef {
  id: string;
  name: string;
  parent: string;
  radiusKm: number;
  /** Mean distance from the planet's centre, km */
  aKm: number;
  periodDays: number;
  retrograde?: boolean;
  model: MoonModel;
  color: string;
  fact: string;
}

export const MOONS: MoonDef[] = [
  {
    id: 'moon', name: 'Moon', parent: 'earth', radiusKm: 1737.4, aKm: 384_400, periodDays: 27.3217, model: 'earth', color: '#cbd5e1',
    fact: 'The Moon drifts about 3.8 cm farther from Earth every year.',
  },
  {
    id: 'phobos', name: 'Phobos', parent: 'mars', radiusKm: 11.1, aKm: 9_376, periodDays: 0.31891, model: 'circular', color: '#8b7d6b',
    fact: 'Orbits faster than Mars spins, so it rises in the west. It is spiralling inward and will break apart in ~50 million years.',
  },
  {
    id: 'deimos', name: 'Deimos', parent: 'mars', radiusKm: 6.2, aKm: 23_458, periodDays: 1.26244, model: 'circular', color: '#a39887',
    fact: 'One of the smallest moons known, only about 12 km across. Its escape velocity is ~5.6 m/s.',
  },
  {
    id: 'io', name: 'Io', parent: 'jupiter', radiusKm: 1821.6, aKm: 421_700, periodDays: 1.769, model: 'jupiter', color: '#e8d44d',
    fact: 'The most volcanically active world in the solar system, with over 400 active volcanoes.',
  },
  {
    id: 'europa', name: 'Europa', parent: 'jupiter', radiusKm: 1560.8, aKm: 671_034, periodDays: 3.551, model: 'jupiter', color: '#c9b79c',
    fact: 'Hides a salty ocean under its ice shell, which may hold twice as much water as all of Earth\'s oceans.',
  },
  {
    id: 'ganymede', name: 'Ganymede', parent: 'jupiter', radiusKm: 2634.1, aKm: 1_070_412, periodDays: 7.155, model: 'jupiter', color: '#9c8f80',
    fact: 'The largest moon in the solar system. It is bigger than Mercury and is the only moon with its own magnetic field.',
  },
  {
    id: 'callisto', name: 'Callisto', parent: 'jupiter', radiusKm: 2410.3, aKm: 1_882_709, periodDays: 16.689, model: 'jupiter', color: '#6b6258',
    fact: 'The most heavily cratered object in the solar system. Its surface is about 4 billion years old.',
  },
  {
    id: 'mimas', name: 'Mimas', parent: 'saturn', radiusKm: 198.2, aKm: 185_539, periodDays: 0.942, model: 'circular', color: '#b8b8b8',
    fact: 'Its giant Herschel crater makes it look like the Death Star.',
  },
  {
    id: 'enceladus', name: 'Enceladus', parent: 'saturn', radiusKm: 252.1, aKm: 238_042, periodDays: 1.370, model: 'circular', color: '#f1f5f9',
    fact: 'Shoots geysers of water from a subsurface ocean out of its south pole. They feed Saturn\'s E ring.',
  },
  {
    id: 'tethys', name: 'Tethys', parent: 'saturn', radiusKm: 531.1, aKm: 294_672, periodDays: 1.888, model: 'circular', color: '#d6d3d1',
    fact: 'Made almost entirely of water ice, and scarred by Ithaca Chasma, a canyon ~2,000 km long.',
  },
  {
    id: 'dione', name: 'Dione', parent: 'saturn', radiusKm: 561.4, aKm: 377_415, periodDays: 2.737, model: 'circular', color: '#cfcfcf',
    fact: 'Covered in bright ice cliffs hundreds of metres high.',
  },
  {
    id: 'rhea', name: 'Rhea', parent: 'saturn', radiusKm: 763.8, aKm: 527_068, periodDays: 4.518, model: 'circular', color: '#bdbdbd',
    fact: 'Saturn\'s second-largest moon. It has a very thin oxygen and carbon dioxide atmosphere.',
  },
  {
    id: 'titan', name: 'Titan', parent: 'saturn', radiusKm: 2574.7, aKm: 1_221_865, periodDays: 15.945, model: 'circular', color: '#e3a857',
    fact: 'The only moon with a thick atmosphere, and it has lakes of liquid methane. NASA\'s Dragonfly drone is headed there.',
  },
  {
    id: 'iapetus', name: 'Iapetus', parent: 'saturn', radiusKm: 734.5, aKm: 3_560_854, periodDays: 79.331, model: 'circular', color: '#8d7b68',
    fact: 'Two-toned: one hemisphere is as dark as coal and the other as bright as snow.',
  },
  {
    id: 'miranda', name: 'Miranda', parent: 'uranus', radiusKm: 235.8, aKm: 129_858, periodDays: 1.413, model: 'circular', color: '#a8a29e',
    fact: 'Home to Verona Rupes, possibly the tallest cliff in the solar system at ~20 km.',
  },
  {
    id: 'ariel', name: 'Ariel', parent: 'uranus', radiusKm: 578.9, aKm: 190_930, periodDays: 2.520, model: 'circular', color: '#d4d4d8',
    fact: 'The brightest of Uranus\'s moons, with a young surface crossed by deep valleys.',
  },
  {
    id: 'umbriel', name: 'Umbriel', parent: 'uranus', radiusKm: 584.7, aKm: 265_982, periodDays: 4.144, model: 'circular', color: '#71717a',
    fact: 'The darkest of Uranus\'s large moons. Its one bright feature is a ring called the "Fluorescent Cheerio".',
  },
  {
    id: 'titania', name: 'Titania', parent: 'uranus', radiusKm: 788.4, aKm: 436_282, periodDays: 8.706, model: 'circular', color: '#b4a99a',
    fact: 'Uranus\'s largest moon. Like most of Uranus\'s moons, it is named after a character from Shakespeare.',
  },
  {
    id: 'oberon', name: 'Oberon', parent: 'uranus', radiusKm: 761.4, aKm: 583_449, periodDays: 13.463, model: 'circular', color: '#9f8f80',
    fact: 'The outermost of Uranus\'s major moons, covered in old impact craters.',
  },
  {
    id: 'proteus', name: 'Proteus', parent: 'neptune', radiusKm: 210, aKm: 117_647, periodDays: 1.122, model: 'circular', color: '#78716c',
    fact: 'Is about as large as a body can be without gravity pulling it into a sphere.',
  },
  {
    id: 'triton', name: 'Triton', parent: 'neptune', radiusKm: 1353.4, aKm: 354_759, periodDays: 5.877, retrograde: true, model: 'circular', color: '#e7d8d0',
    fact: 'Orbits backwards, so it is probably a captured Kuiper-belt object. It has nitrogen geysers.',
  },
];

export const MOON_BY_ID = new Map(MOONS.map((m) => [m.id, m]));

export function moonsOf(planetId: string): MoonDef[] {
  return MOONS.filter((m) => m.parent === planetId);
}

const EQJ_TO_ECL = A.Rotation_EQJ_ECL();

function eqjToEcl(x: number, y: number, z: number): Vec3 {
  const v = A.RotateVector(EQJ_TO_ECL, new A.Vector(x, y, z, new A.AstroTime(0)));
  return { x: v.x, y: v.y, z: v.z };
}

const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a: Vec3): Vec3 => {
  const r = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / r, y: a.y / r, z: a.z / r };
};

/** Two unit vectors spanning the planet's equatorial plane (J2000 ecliptic). */
function equatorBasis(parent: string, date: Date): [Vec3, Vec3] {
  const body = PLANET_BY_ID.get(parent)!.body;
  const n = A.RotationAxis(body, date).north;
  const pole = norm(eqjToEcl(n.x, n.y, n.z));
  const u = norm(cross({ x: 0, y: 0, z: 1 }, pole)); // ascending node on the ecliptic
  return [u, cross(pole, u)];
}

const J2000_MS = Date.UTC(2000, 0, 1, 12);

/** Moon position relative to its planet, km, J2000 ecliptic coordinates. */
export function moonOffsetKm(moon: MoonDef, date: Date): Vec3 {
  if (moon.model === 'earth') {
    const v = A.GeoMoon(date);
    return eqjToEcl(v.x * A.KM_PER_AU, v.y * A.KM_PER_AU, v.z * A.KM_PER_AU);
  }
  if (moon.model === 'jupiter') {
    const s = A.JupiterMoons(date)[moon.id as 'io' | 'europa' | 'ganymede' | 'callisto'];
    return eqjToEcl(s.x * A.KM_PER_AU, s.y * A.KM_PER_AU, s.z * A.KM_PER_AU);
  }
  const [u, v] = equatorBasis(moon.parent, date);
  const turns = (date.getTime() - J2000_MS) / 86_400_000 / moon.periodDays;
  const theta = 2 * Math.PI * (turns % 1) * (moon.retrograde ? -1 : 1);
  const c = Math.cos(theta) * moon.aKm;
  const s = Math.sin(theta) * moon.aKm;
  return { x: u.x * c + v.x * s, y: u.y * c + v.y * s, z: u.z * c + v.z * s };
}

/** Pole of the planet's equator (J2000 ecliptic unit vector). Used to tilt Saturn's rings. */
export function planetPole(parent: string, date: Date): Vec3 {
  const n = A.RotationAxis(PLANET_BY_ID.get(parent)!.body, date).north;
  return norm(eqjToEcl(n.x, n.y, n.z));
}

/**
 * How far out (in scene units) each planet's outermost moon is drawn in the
 * compressed solar-system view. Inner planets get less room so the Moon
 * doesn't land on Venus's orbit.
 */
const SYSTEM_EXTENT: Record<string, number> = {
  earth: 2.2, mars: 1.6, jupiter: 6, saturn: 7, uranus: 4.5, neptune: 4.5,
};

/**
 * Map a real planet-centred distance (km) to a display distance. The scale is
 * logarithmic, so moon order is kept and close-in moons don't touch the planet.
 */
export function displayMoonDistance(parent: string, rKm: number): number {
  const p = PLANET_BY_ID.get(parent)!;
  const xMax = Math.max(...moonsOf(parent).map((m) => m.aKm / p.radiusKm));
  const x = Math.max(rKm / p.radiusKm, 1);
  const ext = SYSTEM_EXTENT[parent] ?? p.displayRadius * 4;
  return p.displayRadius + (ext - p.displayRadius) * (Math.log(x) / Math.log(xMax));
}

export function displayMoonRadius(moon: MoonDef): number {
  const p = PLANET_BY_ID.get(moon.parent)!;
  const k = Math.min(Math.max(0.5 * Math.sqrt(moon.radiusKm / p.radiusKm), 0.06), 0.3);
  return Math.max(p.displayRadius * k, 0.05);
}
