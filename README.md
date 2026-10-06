# 🪐 Orbit Now

**Where is everything in space, right now?** Orbit Now is a 3D web app for space-science lovers that shows the
current positions of the planets, the Moon and thousands of Earth-orbiting satellites. You can also move time
forwards or backwards to watch them move.

## Features

- **Solar system view**: the Sun and all eight planets at their real current positions, computed with
  [Astronomy Engine](https://github.com/cosinekitty/astronomy) (accurate to about an arcminute). Orbits are drawn as
  well. Distances are compressed and planets enlarged so everything fits on one screen.
- **Planetary moons**: 21 major moons, including the Moon, Phobos and Deimos, Jupiter's Galilean moons, Titan and
  Saturn's other big moons, Uranus's five major moons, and Triton. Zoom in on a planet to see its moon system drawn
  in the planet's real equatorial plane, along with Saturn's rings at their real tilt. Earth's Moon and Jupiter's
  four big moons are at their computed positions. For the others, the orbit's size, period and tilt are real, but
  where each moon is along its orbit is approximate.
- **Earth & Moon view (true scale)**: a rotating Earth, the Moon at its real distance and orientation, sunlight from
  the real Sun direction, and live satellites.
- **Live satellites**: orbital elements (TLEs) from [CelesTrak](https://celestrak.org), propagated in the browser with
  SGP4 ([satellite.js](https://github.com/shashwatak/satellite-js)). Includes space stations, the brightest
  satellites, science missions, GPS/Galileo, weather, geostationary satellites and (optionally) Starlink.
  Click any dot to see its ground position, altitude, speed and an orbit trace.
- **Details for every body**: distance from Earth and Sun, light travel time, right ascension and declination,
  constellation, brightness, Moon phase, and the next full and new moons.
- **Time machine**: pause, rewind, speed up (up to 1 week per second), or jump to any date. **Now** brings you back to
  the present.
- Works on phones. Satellite data is cached for 2 hours to respect CelesTrak's usage guidelines. If CelesTrak can't
  be reached, a small, clearly labelled offline sample is shown instead.

## Getting started

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # unit tests (orbital maths sanity checks)
npm run build     # production build in dist/
```

## Deploying

`.github/workflows/deploy.yml` builds, tests and deploys to **GitHub Pages** on every push to `main`.
To turn it on, go to *Settings → Pages* and set **Source** to **GitHub Actions**.
The build uses relative paths, so `dist/` can also be hosted on Netlify, Vercel, Cloudflare Pages or any static host.

## Project layout

```
src/
  lib/
    planets.ts      planet catalogue, heliocentric positions, sky coordinates
    moon.ts         Moon position, phase, Sun direction
    moons.ts        planetary moon catalogue, positions and display scaling
    satellites.ts   CelesTrak fetching/caching, TLE parsing, SGP4 propagation
    details.ts      text shown in the info panel
    clock.ts        simulation clock (pause / speed / jump)
  scene/
    SpaceScene.ts   three.js renderer for both views, picking, camera follow
  components/       React UI (object list, info panel, time controls)
```

## Accuracy notes

- Planet and Moon positions come from Astronomy Engine's VSOP87/ELP-based models. They are good to well under a
  degree for thousands of years either side of today.
- Satellite positions are only as fresh as their TLEs. They are accurate to a few km near the element epoch and get
  worse over days to weeks. The app warns you when the time shown is far from the epoch.
- In the solar-system view the sizes and distances are *not to scale*. The Earth & Moon view is true scale.

## Ideas / roadmap

- Spacecraft in lunar orbit and deep space (LRO, Artemis, JWST, Voyagers) via JPL Horizons ephemerides
- "What's overhead?": use your location for ISS pass predictions and planet rise/set times
- Exact positions for Saturn, Uranus, Neptune and Mars moons (e.g. from JPL mean elements or Horizons)
- Dwarf planets, comets and asteroids
- Planet textures and an optional true-scale toggle

## Credits

Satellite data: [CelesTrak](https://celestrak.org) (Dr. T.S. Kelso). Earth and Moon textures: from the
[three.js](https://threejs.org) examples. Ephemerides: [Astronomy Engine](https://github.com/cosinekitty/astronomy).

MIT licensed.
