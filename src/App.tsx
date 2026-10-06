import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SpaceScene, type ViewMode } from './scene/SpaceScene';
import { SimClock } from './lib/clock';
import { describe } from './lib/details';
import { ORBITERS, loadLunarData, type LunarData } from './lib/lunar';
import { SAT_GROUPS, loadGroup, mergeGroups, type Satellite, type TleSource } from './lib/satellites';
import { TimeControls } from './components/TimeControls';
import { InfoPanel } from './components/InfoPanel';
import { ObjectList } from './components/ObjectList';

/** Which view an object lives in (Earth appears in both). */
function viewFor(id: string, current: ViewMode): ViewMode {
  if (id === 'earth' || id === 'moon') return current;
  if (id.startsWith('sat:') || id.startsWith('lunar:')) return 'earth';
  return 'solar';
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SpaceScene | null>(null);
  const clock = useMemo(() => new SimClock(), []);
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const [view, setView] = useState<ViewMode>('solar');
  const [selected, setSelected] = useState<string | null>(null);
  const [showList, setShowList] = useState(() => window.innerWidth > 800);

  const [enabledGroups, setEnabledGroups] = useState(() => new Set(SAT_GROUPS.filter((g) => g.defaultOn).map((g) => g.id)));
  const [groupData, setGroupData] = useState<Record<string, Satellite[]>>({});
  const [sources, setSources] = useState<Record<string, TleSource>>({});
  const [loading, setLoading] = useState(false);
  const [lunarData, setLunarData] = useState<LunarData | null | undefined>(undefined);

  const viewRef = useRef(view);
  viewRef.current = view;

  const select = useCallback((id: string | null) => {
    setSelected(id);
    const scene = sceneRef.current;
    if (!scene) return;
    if (id) {
      const v = viewFor(id, viewRef.current);
      if (v !== viewRef.current) {
        scene.setView(v);
        setView(v);
      }
    }
    scene.select(id);
  }, []);

  // Create the 3D scene once.
  useEffect(() => {
    const scene = new SpaceScene(mountRef.current!, {
      getDate: () => clock.now(),
      onSelect: (id) => select(id),
    });
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [clock, select]);

  // Refresh the text UI a few times per second.
  useEffect(() => {
    const t = setInterval(refresh, 250);
    return () => clearInterval(t);
  }, [refresh]);

  // Fetch any newly-enabled satellite groups.
  useEffect(() => {
    const missing = [...enabledGroups].filter((g) => !(g in groupData));
    if (missing.length === 0) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(missing.map((g) => loadGroup(g).then((r) => [g, r] as const))).then((results) => {
      if (cancelled) return;
      setGroupData((d) => ({ ...d, ...Object.fromEntries(results.map(([g, r]) => [g, r.sats])) }));
      setSources((s) => ({ ...s, ...Object.fromEntries(results.map(([g, r]) => [g, r.source])) }));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabledGroups, groupData]);

  const sats = useMemo(
    () => mergeGroups(SAT_GROUPS.filter((g) => enabledGroups.has(g.id)).map((g) => groupData[g.id] ?? [])),
    [enabledGroups, groupData],
  );
  const satsById = useMemo(() => new Map(sats.map((s) => [s.id, s])), [sats]);

  // Lunar orbiter ephemerides are fetched from JPL Horizons at build time.
  useEffect(() => {
    loadLunarData().then(setLunarData);
  }, []);
  const lunar = useMemo(() => {
    const eph = new Map((lunarData?.craft ?? []).map((c) => [c.id, c]));
    return ORBITERS.filter((d) => eph.has(d.id)).map((def) => ({ def, eph: eph.get(def.id)! }));
  }, [lunarData]);
  const lunarById = useMemo(() => new Map(lunar.map((l) => [l.def.id, l])), [lunar]);
  useEffect(() => {
    sceneRef.current?.setOrbiters(lunar);
  }, [lunar]);
  const activeSources = useMemo(
    () => Object.fromEntries(Object.entries(sources).filter(([g]) => enabledGroups.has(g))),
    [sources, enabledGroups],
  );

  useEffect(() => {
    sceneRef.current?.setSatellites(sats);
    if (selected?.startsWith('sat:') && !satsById.has(selected.slice(4))) select(null);
  }, [sats, satsById, selected, select]);

  const toggleGroup = (id: string) =>
    setEnabledGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const switchView = (v: ViewMode) => {
    sceneRef.current?.setView(v);
    setView(v);
    if (selected && viewFor(selected, v) !== v) select(null);
  };

  const date = clock.now();
  const details = selected
    ? describe(selected, date, {
        satsById,
        lunarById,
        lunarGenerated: lunarData ? new Date(lunarData.generated) : null,
      })
    : null;

  return (
    <div className="app">
      <div className="viewport" ref={mountRef} />

      <header className="topbar panel">
        <button className="icon" onClick={() => setShowList((s) => !s)} aria-label="Toggle object list">
          ☰
        </button>
        <h1>
          Orbit<span>Now</span>
        </h1>
        <div className="segmented" role="tablist">
          <button className={view === 'solar' ? 'active' : ''} onClick={() => switchView('solar')}>
            Solar<span className="wide-only"> system</span>
          </button>
          <button className={view === 'earth' ? 'active' : ''} onClick={() => switchView('earth')}>
            Earth<span className="wide-only"> &amp; Moon</span>
          </button>
        </div>
        <button className="icon" onClick={() => sceneRef.current?.resetCamera()} aria-label="Reset camera" title="Reset camera">
          ⟲
        </button>
      </header>

      {showList && (
        <ObjectList
          selected={selected}
          onSelect={(id) => {
            select(id);
            if (window.innerWidth <= 800) setShowList(false);
          }}
          sats={sats}
          enabledGroups={enabledGroups}
          onToggleGroup={toggleGroup}
          loading={loading}
          sources={activeSources}
          orbiters={lunar.map((l) => l.def)}
          lunarStatus={lunarData === undefined ? 'loading' : lunar.length ? 'ok' : 'missing'}
        />
      )}

      <InfoPanel details={details} onClose={() => select(null)} />

      <TimeControls clock={clock} date={date} onChange={refresh} />

      <div className="hint muted small">
        {view === 'solar'
          ? 'Distances compressed & planets enlarged so everything fits. Drag to orbit · scroll to zoom · click a body.'
          : 'True scale (1 unit = 1000 km). Satellites from CelesTrak, propagated with SGP4. Click a dot to identify it.'}
      </div>
    </div>
  );
}
