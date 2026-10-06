// Downloads Moon-centred ephemerides for spacecraft in lunar orbit from
// NASA/JPL Horizons and writes public/lunar-orbiters.json.
//
// Horizons doesn't allow browser (CORS) requests, so this runs at build time
// (CI rebuilds the site daily) or by hand with `npm run fetch:lunar`.
//
// Usage: node scripts/fetch-lunar.mjs [--days-before 2] [--days-after 6]

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchLunarVectors, packStates } from './horizons.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'lunar-orbiters.json');

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const DAYS_BEFORE = arg('--days-before', 2);
const DAYS_AFTER = arg('--days-after', 6);
const STEP_MIN = 10;

const catalogue = JSON.parse(await readFile(join(root, 'src', 'lib', 'lunarOrbiters.json'), 'utf8'));

const stepMs = STEP_MIN * 60_000;
const now = Date.now();
const start = Math.floor((now - DAYS_BEFORE * 86_400_000) / stepMs) * stepMs;
const stop = Math.ceil((now + DAYS_AFTER * 86_400_000) / stepMs) * stepMs;

const craft = [];
const errors = [];
for (const def of catalogue) {
  try {
    const { times, states } = await fetchLunarVectors(def.horizonsId, start, stop, STEP_MIN);
    // The app interpolates on a uniform grid, so insist on one.
    for (let i = 1; i < times.length; i++) {
      if (times[i] - times[i - 1] !== stepMs) throw new Error(`non-uniform step at row ${i}`);
    }
    craft.push({ id: def.id, start: times[0], stepMs, states: packStates(states) });
    // Altitude range as a sanity check on units and centre (LRO should be roughly 20–200 km).
    const alts = states.map(([x, y, z]) => Math.hypot(x, y, z) - 1737.4);
    console.log(
      `✓ ${def.name.padEnd(16)} ${times.length} states  ${new Date(times[0]).toISOString()} → ${new Date(times.at(-1)).toISOString()}` +
        `  altitude ${Math.round(Math.min(...alts))}–${Math.round(Math.max(...alts))} km`,
    );
  } catch (e) {
    errors.push({ id: def.id, error: String(e.message).slice(0, 300) });
    console.log(`✗ ${def.name.padEnd(16)} ${e.message}`);
  }
}

await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ generated: new Date(now).toISOString(), source: 'NASA/JPL Horizons', craft, errors }));
console.log(`Wrote ${out} (${craft.length}/${catalogue.length} spacecraft)`);
