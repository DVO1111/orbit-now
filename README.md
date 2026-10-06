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
- **Lunar orbiters**: LRO (NASA), Chandrayaan-2 (ISRO), Danuri (KARI) and CAPSTONE, shown around the Moon with
  their orbits, altitude, speed and period. Trajectories come from [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/).
  Horizons can't be called from a browser, so the build fetches them (`npm run fetch:lunar`), and CI rebuilds the site
  every day. A spacecraft Horizons has no data for is simply left out.
- **Artemis replays**: Artemis I (2022) and Artemis II (2026, crewed) with their full Earth–Moon flight paths from
  JPL Horizons. Pick one in the **Moon** tab and the time machine jumps to its lunar flyby.
- **Chang'e landing sites**: Chang'e 3, 4, 5 and 6 marked on the Moon, which is oriented with the IAU rotation model
  (libration included), so far-side sites really are on the far side. China doesn't publish orbit data for its
  lunar spacecraft (such as the Queqiao relays), so JPL has none and they aren't shown in orbit.
- **My sky (location-anchored)**: your actual sky from where you stand, like Flightradar24's AR view but for the
  heavens. ~2,850 naked-eye stars with constellation figures, the Sun, Moon (with phase) and planets, and every loaded
  satellite, all for your exact location and time. Tap anything to identify it and get "face east-southeast and look
  34° up". On phones, **Point at sky** follows your compass and tilt (with an optional **camera** overlay), and an
  arrow at the screen edge guides you to whatever you picked. The **Up now** list shows planets above your horizon,
  the brightest stars, satellites overhead (and whether they're sunlit, so you can see them), and the next ISS and
  Tiangong passes. Open it directly at `#sky`.
- **🔭 Telescope mode** (in My sky): zoom on the Moon, the ISS or a planet and watch it move in real time, like
  looking through an undriven telescope. Everything is at its true apparent size: the Moon as a lit sphere with its
  real surface, phase and libration, Saturn with its rings at today's tilt, Jupiter with its four big moons. **Hold
  still** lets the target drift out of view (Earth's spin, ~15″ per second for planets, or the ISS's own 7.66 km/s);
  **Follow** tracks it like a motorised mount. A readout gives the drift speed, how long it takes to cross the view,
  and why it moves. If a target is down, it offers to jump to its best dark-sky moment or the ISS's next visible pass.
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
npm run fetch:lunar   # optional: download lunar orbiter trajectories into public/
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
    lunar.ts        lunar orbiter / mission catalogue (lunarOrbiters.json) and trajectory interpolation
    landingSites.ts Chang'e landing sites
    details.ts      text shown in the info panel
    clock.ts        simulation clock (pause / speed / jump)
  scene/
    SpaceScene.ts   three.js renderer for both views, picking, camera follow
  lib/sky/
    sky.ts          horizon coordinates for stars, planets and satellites; pass prediction
    skyData.json    star catalogue (mag ≤ 5.5) and constellation lines
  sky/
    SkyView.tsx     the "My sky" section (canvas sky chart, location, AR pointing, camera)
    orientation.ts  phone compass/tilt → pointing direction
    projection.ts   stereographic sky projection
    telescope.ts    true-size rendering (Moon sphere, Saturn's rings, Jupiter's moons, ISS) and drift maths
  components/       React UI (object list, info panel, time controls)
scripts/
  fetch-lunar.mjs   downloads lunar orbiter trajectories from JPL Horizons
```

To add another lunar spacecraft, add an entry with its Horizons ID to `src/lib/lunarOrbiters.json` (give past missions
a `window`). To find an ID, run the **Look up spacecraft in JPL Horizons** workflow from the Actions tab.

## Accuracy notes

- Planet and Moon positions come from Astronomy Engine's VSOP87/ELP-based models. They are good to well under a
  degree for thousands of years either side of today.
- Satellite positions are only as fresh as their TLEs. They are accurate to a few km near the element epoch and get
  worse over days to weeks. The app warns you when the time shown is far from the epoch.
- Lunar orbiter positions are interpolated from 10-minute JPL Horizons samples, so they are accurate to well under
  1 km. The data covers 2 days before to 6 days after each daily build; outside that window the spacecraft are hidden.
- In My sky, star and planet positions agree with Astronomy Engine's full topocentric calculation to within 0.02°
  (checked by tests), including atmospheric refraction. Phone pointing is only as good as the phone's compass:
  wave it in a figure 8 to calibrate, and keep away from metal.
- In the solar-system view the sizes and distances are *not to scale*. The Earth & Moon view is true scale.

## Ideas / roadmap

- Deep-space spacecraft (JWST, Voyagers) via JPL Horizons
- Exact positions for Saturn, Uranus, Neptune and Mars moons (e.g. from JPL mean elements or Horizons)
- Dwarf planets, comets and asteroids
- Planet textures and an optional true-scale toggle

## Credits

Satellite data: [CelesTrak](https://celestrak.org) (Dr. T.S. Kelso). Star catalogue and constellation lines: from
[d3-celestial](https://github.com/ofrohn/d3-celestial) © 2015 Olaf Frohn (BSD-3-Clause), based on the Yale Bright
Star and Hipparcos catalogues. Earth and Moon textures: from the
[three.js](https://threejs.org) examples. Ephemerides: [Astronomy Engine](https://github.com/cosinekitty/astronomy).

MIT licensed.
