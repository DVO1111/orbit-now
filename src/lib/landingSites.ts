export interface LandingSite {
  id: string;
  name: string;
  agency: string;
  /** Selenographic latitude / longitude, degrees (east positive) */
  lat: number;
  lon: number;
  region: string;
  landed: string;
  color: string;
  fact: string;
}

/** Chang'e landers. Their positions on the surface are public, unlike China's orbit data. */
export const LANDING_SITES: LandingSite[] = [
  {
    id: 'change3', name: "Chang'e 3", agency: 'CNSA', lat: 44.12, lon: -19.51, region: 'Mare Imbrium',
    landed: '2013-12-14', color: '#f87171',
    fact: 'The first soft landing on the Moon since 1976. It carried the Yutu ("Jade Rabbit") rover.',
  },
  {
    id: 'change4', name: "Chang'e 4", agency: 'CNSA', lat: -45.44, lon: 177.6, region: 'Von Kármán crater (far side)',
    landed: '2019-01-03', color: '#fb7185',
    fact: 'The first spacecraft ever to land on the far side of the Moon. It talks to Earth through the Queqiao relay satellite, and its Yutu-2 rover has driven for years.',
  },
  {
    id: 'change5', name: "Chang'e 5", agency: 'CNSA', lat: 43.06, lon: -51.92, region: 'Mons Rümker, Oceanus Procellarum',
    landed: '2020-12-01', color: '#f43f5e',
    fact: 'Brought 1,731 g of lunar rock and soil back to Earth, the first lunar samples returned since 1976.',
  },
  {
    id: 'change6', name: "Chang'e 6", agency: 'CNSA', lat: -41.64, lon: -153.99, region: 'Apollo basin (far side)',
    landed: '2024-06-02', color: '#e11d48',
    fact: 'Returned the first-ever samples from the far side of the Moon: 1,935 g from the South Pole–Aitken basin.',
  },
];

export const SITE_BY_ID = new Map(LANDING_SITES.map((s) => [s.id, s]));

/** Unit vector in the Moon's body frame (x: lon 0, y: lon 90° E, z: north). */
export function siteBodyVector(site: LandingSite) {
  const la = (site.lat * Math.PI) / 180;
  const lo = (site.lon * Math.PI) / 180;
  return { x: Math.cos(la) * Math.cos(lo), y: Math.cos(la) * Math.sin(lo), z: Math.sin(la) };
}
