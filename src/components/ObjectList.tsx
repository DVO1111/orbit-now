import { useMemo, useState } from 'react';
import { PLANETS } from '../lib/planets';
import { moonsOf } from '../lib/moons';
import type { OrbiterDef } from '../lib/lunar';
import { LANDING_SITES } from '../lib/landingSites';
import { SAT_GROUPS, type Satellite, type TleSource } from '../lib/satellites';

interface Props {
  selected: string | null;
  onSelect: (id: string) => void;
  sats: Satellite[];
  enabledGroups: Set<string>;
  onToggleGroup: (id: string) => void;
  loading: boolean;
  sources: Record<string, TleSource>;
  orbiters: OrbiterDef[];
  missionDates: Record<string, Date>;
  lunarStatus: 'loading' | 'ok' | 'missing';
}

const MAX_RESULTS = 60;

export function ObjectList({
  selected, onSelect, sats, enabledGroups, onToggleGroup, loading, sources, orbiters, missionDates, lunarStatus,
}: Props) {
  const lunarItem = (o: OrbiterDef, extra: string) => (
    <li key={o.id}>
      <button className={selected === `lunar:${o.id}` ? 'selected' : ''} onClick={() => onSelect(`lunar:${o.id}`)}>
        <span className="swatch" style={{ background: o.color }} />
        {o.name} <span className="muted small">· {extra}</span>
      </button>
    </li>
  );
  const missions = orbiters.filter((o) => o.kind === 'mission');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'bodies' | 'moon' | 'sats'>('bodies');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? sats.filter((s) => s.name.toLowerCase().includes(q) || s.id === q) : sats;
    return list.slice(0, MAX_RESULTS);
  }, [sats, query]);

  const usingSample = Object.values(sources).includes('sample');

  return (
    <nav className="objects panel">
      <div className="tabs">
        <button className={tab === 'bodies' ? 'active' : ''} onClick={() => setTab('bodies')}>
          Planets
        </button>
        <button className={tab === 'moon' ? 'active' : ''} onClick={() => setTab('moon')}>
          Moon
        </button>
        <button className={tab === 'sats' ? 'active' : ''} onClick={() => setTab('sats')}>
          Satellites {sats.length > 0 && <span className="badge">{sats.length.toLocaleString()}</span>}
        </button>
      </div>

      {tab === 'bodies' ? (
        <ul className="list">
          {[{ id: 'sun', name: 'Sun', color: '#ffcc55' }, ...PLANETS].flatMap((b) => [
            <li key={b.id}>
              <button className={selected === b.id ? 'selected' : ''} onClick={() => onSelect(b.id)}>
                <span className="swatch" style={{ background: b.color }} />
                {b.name}
              </button>
            </li>,
            ...moonsOf(b.id).map((m) => (
              <li key={m.id} className="sub">
                <button className={selected === m.id ? 'selected' : ''} onClick={() => onSelect(m.id)}>
                  <span className="swatch" style={{ background: m.color }} />
                  {m.name}
                </button>
              </li>
            )),
          ])}
        </ul>
      ) : tab === 'moon' ? (
        <div className="list">
          <ul className="list-plain">
            <li>
              <button className={selected === 'moon' ? 'selected' : ''} onClick={() => onSelect('moon')}>
                <span className="swatch" style={{ background: '#cbd5e1' }} />
                The Moon
              </button>
            </li>
          </ul>
          <div className="section-title">Orbiting the Moon</div>
          {lunarStatus === 'ok' ? (
            <ul className="list-plain">
              {orbiters.filter((o) => o.kind !== 'mission').map((o) => lunarItem(o, o.agency))}
            </ul>
          ) : (
            <div className="muted small">
              {lunarStatus === 'loading' ? 'Loading lunar orbiters…' : 'Lunar orbiter data is not available right now.'}
            </div>
          )}
          {missions.length > 0 && (
            <>
              <div className="section-title">Past Moon missions · replay</div>
              <ul className="list-plain">
                {missions.map((o) =>
                  lunarItem(o, missionDates[o.id]?.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) ?? o.agency),
                )}
              </ul>
            </>
          )}
          <div className="section-title">On the Moon · Chang'e landers</div>
          <ul className="list-plain">
            {LANDING_SITES.map((s) => (
              <li key={s.id}>
                <button className={selected === `site:${s.id}` ? 'selected' : ''} onClick={() => onSelect(`site:${s.id}`)}>
                  <span className="swatch" style={{ background: s.color }} />
                  {s.name} <span className="muted small">· {s.landed.slice(0, 4)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="groups">
            {SAT_GROUPS.map((g) => (
              <label key={g.id} className="chip" style={{ borderColor: enabledGroups.has(g.id) ? g.color : undefined }}>
                <input type="checkbox" checked={enabledGroups.has(g.id)} onChange={() => onToggleGroup(g.id)} />
                <span className="swatch" style={{ background: g.color }} />
                {g.label}
              </label>
            ))}
          </div>
          {loading && <div className="muted small">Loading orbital elements…</div>}
          {usingSample && (
            <div className="warning small">
              Couldn't reach CelesTrak — showing approximate sample satellites, not live positions.
            </div>
          )}
          <input
            className="search"
            type="search"
            placeholder="Search by name or NORAD id (e.g. ISS)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="list">
            {matches.map((s) => (
              <li key={s.id}>
                <button className={selected === `sat:${s.id}` ? 'selected' : ''} onClick={() => onSelect(`sat:${s.id}`)}>
                  <span className="swatch" style={{ background: SAT_GROUPS.find((g) => g.id === s.group)?.color }} />
                  {s.name}
                </button>
              </li>
            ))}
            {matches.length === MAX_RESULTS && <li className="muted small">Refine your search to see more…</li>}
          </ul>
        </>
      )}
    </nav>
  );
}
