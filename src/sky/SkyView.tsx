import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SimClock } from '../lib/clock';
import type { DescribeContext } from '../lib/details';
import { GROUP_BY_ID, type Satellite } from '../lib/satellites';
import {
  CONSTELLATIONS, CONSTELLATION_LINES, STARS, bodiesInSky, brightnessWords, compassPoint, horizonRotation, pointingHint,
  predictPasses, satellitesInSky, skyDarkness, starColor, toAltAz, type AltAz, type BodyInSky, type Pass, type SatInSky,
  type SkyLocation,
} from '../lib/sky/sky';
import { InfoPanel } from '../components/InfoPanel';
import { makeProjector, type Projector, type View } from './projection';
import { hasOrientation, requestOrientationPermission, watchPointing } from './orientation';
import { skyDetails } from './skyDetails';

const CITIES: SkyLocation[] = [
  { label: 'Lagos', lat: 6.524, lon: 3.379, heightM: 40 },
  { label: 'Abuja', lat: 9.058, lon: 7.495, heightM: 476 },
  { label: 'Nairobi', lat: -1.292, lon: 36.822, heightM: 1795 },
  { label: 'Cairo', lat: 30.044, lon: 31.236, heightM: 23 },
  { label: 'London', lat: 51.507, lon: -0.128, heightM: 11 },
  { label: 'New York', lat: 40.713, lon: -74.006, heightM: 10 },
  { label: 'Los Angeles', lat: 34.052, lon: -118.244, heightM: 89 },
  { label: 'São Paulo', lat: -23.551, lon: -46.633, heightM: 760 },
  { label: 'New Delhi', lat: 28.614, lon: 77.209, heightM: 216 },
  { label: 'Tokyo', lat: 35.676, lon: 139.65, heightM: 40 },
  { label: 'Sydney', lat: -33.869, lon: 151.209, heightM: 58 },
];

const LOC_KEY = 'sky:location';

function loadLocation(): SkyLocation | null {
  try {
    const raw = localStorage.getItem(LOC_KEY);
    return raw ? (JSON.parse(raw) as SkyLocation) : null;
  } catch {
    return null;
  }
}

function saveLocation(loc: SkyLocation) {
  try {
    localStorage.setItem(LOC_KEY, JSON.stringify(loc));
  } catch {
    // Private mode etc. Not fatal.
  }
}

const fmtLatLon = (l: SkyLocation) =>
  `${Math.abs(l.lat).toFixed(2)}°${l.lat >= 0 ? 'N' : 'S'} ${Math.abs(l.lon).toFixed(2)}°${l.lon >= 0 ? 'E' : 'W'}`;

interface Hit {
  id: string;
  x: number;
  y: number;
  r: number;
  name: string;
}

interface Props {
  clock: SimClock;
  sats: Satellite[];
  ctx: DescribeContext;
  showList: boolean;
}

export function SkyView({ clock, sats, ctx, showList }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [loc, setLoc] = useState<SkyLocation | null>(loadLocation);
  const [picking, setPicking] = useState(() => !loadLocation());
  const [locStatus, setLocStatus] = useState('');
  const [manual, setManual] = useState('');

  const [selected, setSelected] = useState<string | null>(null);
  const [arMode, setArMode] = useState(false);
  const [camera, setCamera] = useState(false);
  const [lines, setLines] = useState(true);
  const [arMsg, setArMsg] = useState('');
  const [centerName, setCenterName] = useState('');
  const [, setTick] = useState(0);

  // Mutable state the draw loop reads without re-rendering React.
  const view = useRef({ az: 180, alt: 35, fov: 100, roll: 0 });
  const hits = useRef<Hit[]>([]);
  const st = useRef({ loc, selected, lines, camera, sats });
  st.current = { loc, selected, lines, camera, sats };

  const chooseLocation = useCallback((l: SkyLocation) => {
    setLoc(l);
    saveLocation(l);
    setPicking(false);
    setLocStatus('');
  }, []);

  const useMyLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocStatus('This browser cannot share your location. Pick a city or type coordinates.');
      return;
    }
    setLocStatus('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (p) =>
        chooseLocation({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          heightM: p.coords.altitude ?? 0,
          label: 'My location',
        }),
      (e) =>
        setLocStatus(
          e.code === e.PERMISSION_DENIED
            ? 'Location permission was denied. Pick a city or type coordinates instead.'
            : 'Could not get your location. Pick a city or type coordinates.',
        ),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 },
    );
  }, [chooseLocation]);

  // Ask for the location straight away on first visit.
  useEffect(() => {
    if (!loadLocation()) useMyLocation();
  }, [useMyLocation]);

  // ----------------------------------------------------------------- phone pointing (AR)
  useEffect(() => {
    if (!arMode) return;
    let got = false;
    const stop = watchPointing(
      (p) => {
        got = true;
        view.current.az = p.az;
        view.current.alt = p.alt;
        view.current.roll = p.roll;
      },
      () => setArMsg('No compass found, so directions may be off. Calibrate by moving your phone in a figure 8.'),
    );
    const t = setTimeout(() => {
      if (!got) setArMsg('No motion sensors detected. Pointing mode needs a phone or tablet.');
    }, 2500);
    return () => {
      stop();
      clearTimeout(t);
      view.current.roll = 0;
    };
  }, [arMode]);

  const toggleAr = async () => {
    if (arMode) {
      setArMode(false);
      setArMsg('');
      return;
    }
    if (!(await requestOrientationPermission())) {
      setArMsg('Motion & orientation access was not allowed.');
      return;
    }
    setArMsg('Hold your phone up and point it at the sky.');
    setArMode(true);
  };

  // ----------------------------------------------------------------- camera overlay
  useEffect(() => {
    if (!camera) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        view.current.fov = 60; // roughly a phone camera's field of view
      })
      .catch(() => {
        setArMsg('Camera not available or permission denied.');
        setCamera(false);
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camera]);

  // ----------------------------------------------------------------- drawing
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx2d = canvas.getContext('2d')!;
    let raf = 0;
    let bodies: BodyInSky[] = [];
    let satPos: SatInSky[] = [];
    let lastBodies = -Infinity;
    let lastSats = -Infinity;
    let lastCenter = '';

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { loc, selected, lines, camera, sats } = st.current;
      const dpr = Math.min(window.devicePixelRatio, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2d.clearRect(0, 0, w, h);
      if (!loc || w === 0) return;

      const date = clock.now();
      const nowMs = performance.now();
      if (nowMs - lastBodies > 120) {
        bodies = bodiesInSky(date, loc);
        lastBodies = nowMs;
      }
      if (nowMs - lastSats > (sats.length > 500 ? 300 : 60)) {
        satPos = satellitesInSky(sats, date, loc, -1);
        lastSats = nowMs;
      }
      const sun = bodies.find((b) => b.id === 'sun');
      const darkness = skyDarkness(sun?.alt ?? -90);
      const v: View = { ...view.current, width: w, height: h };
      const project = makeProjector(v);
      const rot = horizonRotation(date, loc);
      const scaleBoost = Math.max(1, 90 / v.fov) ** 0.5;
      const newHits: Hit[] = [];

      // Sky colour by sun altitude (skipped over the camera picture).
      if (!camera) {
        const sunAlt = sun?.alt ?? -90;
        const tDay = Math.min(1, Math.max(0, (sunAlt + 12) / 18)); // -12° → night, +6° → day
        const top = mix([3, 6, 18], [40, 100, 170], tDay);
        const bottom = mix([8, 14, 32], [120, 170, 215], tDay);
        const g = ctx2d.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, rgb(top));
        g.addColorStop(1, rgb(bottom));
        ctx2d.fillStyle = g;
        ctx2d.fillRect(0, 0, w, h);
      }
      const starAlpha = darkness === 'night' ? 1 : darkness === 'twilight' ? 0.75 : 0.25;

      // Constellation figures.
      if (lines) {
        ctx2d.strokeStyle = `rgba(125, 170, 255, ${0.28 * starAlpha + 0.05})`;
        ctx2d.lineWidth = 1;
        ctx2d.beginPath();
        for (const seg of CONSTELLATION_LINES) {
          let prev: ReturnType<Projector> = null;
          for (const pt of seg) {
            const p = toAltAz(rot, pt);
            const q = project(p.alt, p.az);
            if (q && prev && q.z > -0.3 && prev.z > -0.3) {
              ctx2d.moveTo(prev.x, prev.y);
              ctx2d.lineTo(q.x, q.y);
            }
            prev = q;
          }
        }
        ctx2d.stroke();
        if (v.fov < 140) {
          ctx2d.font = '11px system-ui, sans-serif';
          ctx2d.fillStyle = `rgba(147, 180, 255, ${0.45 * starAlpha + 0.1})`;
          ctx2d.textAlign = 'center';
          for (const c of CONSTELLATIONS) {
            const p = toAltAz(rot, c);
            if (p.alt < 2) continue;
            const q = project(p.alt, p.az);
            if (q && q.z > 0.2) ctx2d.fillText(c.name.toUpperCase(), q.x, q.y);
          }
        }
      }

      // Stars.
      const magLimit = v.fov > 120 ? 4.8 : v.fov > 70 ? 5.3 : 5.5;
      const nameLimit = v.fov > 120 ? 1.0 : v.fov > 70 ? 1.6 : v.fov > 40 ? 2.6 : 4;
      ctx2d.textAlign = 'left';
      ctx2d.font = '11px system-ui, sans-serif';
      for (const s of STARS) {
        if (s.mag > magLimit) break; // catalogue is sorted by brightness
        const p = toAltAz(rot, s);
        if (p.alt < -1) continue;
        const q = project(p.alt, p.az);
        if (!q || q.x < -10 || q.y < -10 || q.x > w + 10 || q.y > h + 10) continue;
        const r = Math.max(0.6, (3.4 - 0.55 * s.mag) * scaleBoost * 0.8);
        ctx2d.globalAlpha = starAlpha * Math.min(1, 1.4 - s.mag / 6);
        ctx2d.fillStyle = starColor(s.bv);
        ctx2d.beginPath();
        ctx2d.arc(q.x, q.y, r, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.globalAlpha = 1;
        if (s.name && s.mag <= nameLimit) {
          ctx2d.fillStyle = `rgba(226, 232, 240, ${0.75 * starAlpha + 0.15})`;
          ctx2d.fillText(s.name, q.x + r + 3, q.y + 3);
        }
        if (s.mag < 4) newHits.push({ id: `star:${s.index}`, x: q.x, y: q.y, r: r + 2, name: s.name || 'Star' });
      }

      // Satellites.
      for (const s of satPos) {
        if (s.alt < 0) continue;
        const q = project(s.alt, s.az);
        if (!q || q.z < 0) continue;
        const isSel = selected === `sat:${s.sat.id}`;
        const visible = s.sunlit && darkness !== 'day';
        const color = GROUP_BY_ID.get(s.sat.group)?.color ?? '#fff';
        ctx2d.globalAlpha = visible ? 1 : 0.45;
        ctx2d.fillStyle = visible ? color : '#64748b';
        ctx2d.save();
        ctx2d.translate(q.x, q.y);
        ctx2d.rotate(Math.PI / 4);
        const size = s.sat.group === 'stations' ? 4.5 : 3;
        ctx2d.fillRect(-size / 2, -size / 2, size, size);
        ctx2d.restore();
        ctx2d.globalAlpha = 1;
        if (s.sat.group === 'stations' || isSel || (v.fov < 50 && visible)) {
          ctx2d.fillStyle = visible ? color : '#94a3b8';
          ctx2d.fillText(shortSatName(s.sat.name), q.x + 6, q.y - 5);
        }
        newHits.push({ id: `sat:${s.sat.id}`, x: q.x, y: q.y, r: 6, name: s.sat.name });
      }

      // Selected satellite: its path over the next 10 minutes.
      if (selected?.startsWith('sat:')) {
        const sat = sats.find((s) => `sat:${s.id}` === selected);
        if (sat) {
          ctx2d.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx2d.setLineDash([4, 4]);
          ctx2d.beginPath();
          let started = false;
          for (let i = 0; i <= 60; i++) {
            const t = new Date(date.getTime() + i * 10_000);
            const p = satellitesInSky([sat], t, loc, -90)[0];
            const q = p && p.alt > -1 ? project(p.alt, p.az) : null;
            if (q && q.z > -0.3) {
              if (started) ctx2d.lineTo(q.x, q.y);
              else ctx2d.moveTo(q.x, q.y);
              started = true;
            } else started = false;
          }
          ctx2d.stroke();
          ctx2d.setLineDash([]);
        }
      }

      // Sun, Moon and planets: always labelled.
      ctx2d.font = '600 12px system-ui, sans-serif';
      for (const b of bodies) {
        if (b.alt < -1) continue;
        const q = project(b.alt, b.az);
        if (!q || q.z < -0.3) continue;
        const r =
          b.id === 'sun' ? 12 * scaleBoost : b.id === 'moon' ? 10 * scaleBoost : Math.max(3, (4.5 - 0.5 * b.mag) * scaleBoost * 0.8);
        if (b.id === 'sun') {
          const g = ctx2d.createRadialGradient(q.x, q.y, r * 0.5, q.x, q.y, r * 4);
          g.addColorStop(0, 'rgba(255, 220, 120, 0.6)');
          g.addColorStop(1, 'rgba(255, 220, 120, 0)');
          ctx2d.fillStyle = g;
          ctx2d.beginPath();
          ctx2d.arc(q.x, q.y, r * 4, 0, Math.PI * 2);
          ctx2d.fill();
        }
        ctx2d.fillStyle = b.color;
        ctx2d.beginPath();
        ctx2d.arc(q.x, q.y, r, 0, Math.PI * 2);
        ctx2d.fill();
        if (b.id === 'moon') drawMoonShadow(ctx2d, q.x, q.y, r, b.phase, sun, b, project);
        ctx2d.fillStyle = b.color;
        ctx2d.fillText(b.name, q.x + r + 4, q.y + 4);
        newHits.push({ id: b.id, x: q.x, y: q.y, r: r + 6, name: b.name });
      }

      // Ground: everything below the horizon (a circle or line in this projection).
      drawGround(ctx2d, project, v, camera);

      // Cardinal points on the horizon.
      ctx2d.font = '700 13px system-ui, sans-serif';
      ctx2d.textAlign = 'center';
      for (let az = 0; az < 360; az += 45) {
        const q = project(0, az);
        if (!q || q.z < 0) continue;
        const main = az % 90 === 0;
        ctx2d.fillStyle = az === 0 ? '#f87171' : main ? '#e2e8f0' : '#94a3b8';
        ctx2d.fillText(compassPoint(az), q.x, q.y + 18);
      }

      // Selection ring, or an arrow at the screen edge pointing to it.
      const selHit = selected ? newHits.find((x) => x.id === selected) : undefined;
      if (selHit && selHit.x > 0 && selHit.y > 0 && selHit.x < w && selHit.y < h) {
        ctx2d.strokeStyle = '#7dd3fc';
        ctx2d.lineWidth = 2;
        ctx2d.beginPath();
        ctx2d.arc(selHit.x, selHit.y, selHit.r + 8, 0, Math.PI * 2);
        ctx2d.stroke();
      } else if (selected) {
        const target = selectedAltAz(selected, bodies, satPos, rot);
        const name =
          bodies.find((b) => b.id === selected)?.name ??
          satPos.find((x) => `sat:${x.sat.id}` === selected)?.sat.name ??
          (selected.startsWith('star:') ? STARS[Number(selected.slice(5))]?.name || 'Star' : 'Target');
        if (target) drawEdgeArrow(ctx2d, v, target, shortSatName(name));
      }

      // In pointing mode, say what is at the centre of the screen.
      let centre = '';
      if (view.current.roll !== 0 || document.body.dataset.skyAr === '1') {
        let best = 40;
        for (const hit of newHits) {
          const d = Math.hypot(hit.x - w / 2, hit.y - h / 2);
          if (d < best && (hit.id.startsWith('star:') ? hit.name !== 'Star' : true)) {
            best = d;
            centre = hit.name;
          }
        }
        ctx2d.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx2d.lineWidth = 1.5;
        ctx2d.beginPath();
        ctx2d.arc(w / 2, h / 2, 22, 0, Math.PI * 2);
        ctx2d.stroke();
      }
      if (centre !== lastCenter) {
        lastCenter = centre;
        setCenterName(centre);
      }

      hits.current = newHits;
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [clock]);

  useEffect(() => {
    document.body.dataset.skyAr = arMode ? '1' : '0';
    return () => {
      delete document.body.dataset.skyAr;
    };
  }, [arMode]);

  // ----------------------------------------------------------------- dragging / zoom / tapping
  useEffect(() => {
    const canvas = canvasRef.current!;
    const pointers = new Map<number, { x: number; y: number }>();
    let downAt: { x: number; y: number } | null = null;
    let pinch = 0;

    const degPerPx = () => view.current.fov / canvas.clientHeight;
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      downAt = { x: e.clientX, y: e.clientY };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) zoom(pinch / d);
        pinch = d;
        return;
      }
      if (document.body.dataset.skyAr === '1') return; // the phone drives the view
      const k = degPerPx();
      view.current.az = (((view.current.az - (e.clientX - prev.x) * k) % 360) + 360) % 360;
      view.current.alt = Math.max(-20, Math.min(89.9, view.current.alt + (e.clientY - prev.y) * k));
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6 && pointers.size === 0) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        let best: Hit | null = null;
        let bestD = 26;
        for (const hit of hits.current) {
          const d = Math.hypot(hit.x - x, hit.y - y) - hit.r;
          if (d < bestD) {
            bestD = d;
            best = hit;
          }
        }
        setSelected(best?.id ?? null);
      }
      downAt = null;
    };
    const zoom = (f: number) => {
      view.current.fov = Math.max(15, Math.min(150, view.current.fov * f));
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(Math.exp(e.deltaY * 0.001));
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Refresh the text panels once a second.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  /** Turn the (non-AR) view toward something from the list. */
  const lookAt = (id: string, p: AltAz | null) => {
    setSelected(id);
    if (p && !arMode) {
      view.current.az = p.az;
      // On phones the info panel covers the lower half, so put the target in the upper part.
      const lift = window.innerWidth <= 800 ? 0.22 * view.current.fov : 0;
      view.current.alt = Math.max(-5, Math.min(80, p.alt - lift));
    }
  };

  const date = clock.now();
  const upNow = useUpNow(loc, date, sats);
  const details = selected && loc ? skyDetails(selected, date, loc, ctx) : null;

  return (
    <div className="sky" ref={wrapRef}>
      <video ref={videoRef} className={`sky-video ${camera ? 'on' : ''}`} autoPlay playsInline muted />
      <canvas ref={canvasRef} className="sky-canvas" />

      {loc && (
        <button className="sky-loc panel" onClick={() => setPicking(true)} title="Change location">
          📍 {loc.label} <span className="muted small">{fmtLatLon(loc)}</span>
        </button>
      )}

      {centerName && <div className="sky-centre panel">You're pointing at: <b>{centerName}</b></div>}
      {arMsg && (
        <div className="sky-msg panel small" onClick={() => setArMsg('')}>
          {arMsg}
        </div>
      )}

      <div className="sky-tools">
        {hasOrientation() && (
          <button className={arMode ? 'accent' : ''} onClick={toggleAr}>
            📱 {arMode ? 'Stop pointing' : 'Point at sky'}
          </button>
        )}
        <button className={camera ? 'accent' : ''} onClick={() => setCamera((c) => !c)}>
          📷 Camera
        </button>
        <button className={lines ? 'accent' : ''} onClick={() => setLines((l) => !l)} title="Constellation lines">
          ✦ Lines
        </button>
      </div>

      {showList && loc && (
        <nav className="objects panel sky-list">
          <div className="section-title">Up now over {loc.label}</div>
          <ul className="list-plain">
            {upNow.bodies.map((b) => (
              <li key={b.id}>
                <button className={selected === b.id ? 'selected' : ''} onClick={() => lookAt(b.id, b)}>
                  <span className="swatch" style={{ background: b.color }} />
                  {b.name}
                  <span className="muted small">
                    · {compassPoint(b.az)} {Math.round(b.alt)}° up
                  </span>
                </button>
              </li>
            ))}
            {!upNow.bodies.length && <li className="muted small">No planets above your horizon right now.</li>}
          </ul>
          {upNow.passes.length > 0 && (
            <>
              <div className="section-title">Space station passes · next 24 h</div>
              <ul className="list-plain">
                {upNow.passes.map(({ sat, pass }) => (
                  <li key={`${sat.id}-${pass.rise.getTime()}`}>
                    <button onClick={() => lookAt(`sat:${sat.id}`, { alt: pass.peakAlt, az: pass.peakAz })}>
                      <span className="swatch" style={{ background: pass.visible ? '#facc15' : '#64748b' }} />
                      {shortSatName(sat.name)}
                      <span className="muted small">
                        · {pass.rise.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}, {Math.round(pass.peakAlt)}° up
                        {pass.visible ? ' · visible' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="section-title">Satellites overhead · {upNow.satsUp} above you</div>
          <ul className="list-plain">
            {upNow.satsVisible.map((s) => (
              <li key={s.sat.id}>
                <button className={selected === `sat:${s.sat.id}` ? 'selected' : ''} onClick={() => lookAt(`sat:${s.sat.id}`, s)}>
                  <span className="swatch" style={{ background: GROUP_BY_ID.get(s.sat.group)?.color }} />
                  {shortSatName(s.sat.name)}
                  <span className="muted small">
                    · {compassPoint(s.az)} {Math.round(s.alt)}°{s.sunlit ? '' : ' · in shadow'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="section-title">Brightest stars up</div>
          <ul className="list-plain">
            {upNow.stars.map((s) => (
              <li key={s.index}>
                <button className={selected === `star:${s.index}` ? 'selected' : ''} onClick={() => lookAt(`star:${s.index}`, s)}>
                  <span className="swatch" style={{ background: starColor(s.bv) }} />
                  {s.name}
                  <span className="muted small">
                    · {compassPoint(s.az)} {Math.round(s.alt)}° · {brightnessWords(s.mag).split(',')[0]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small sky-tip">
            How to tell them apart: planets shine steadily, stars twinkle, satellites are steady dots that glide across
            the sky in a few minutes. Planes blink.
          </p>
        </nav>
      )}

      <InfoPanel details={details} onClose={() => setSelected(null)} />
      {details && selected && (
        <div className="sky-howto panel small">
          🧭 {(() => {
            const row = details.rows.find(([k]) => k === 'Where to look');
            return row ? row[1] : pointingHint({ alt: -1, az: 0 });
          })()}
        </div>
      )}

      {picking && (
        <div className="sky-picker-wrap">
          <div className="sky-picker panel">
            <h2>Where are you?</h2>
            <p className="muted small">Your sky depends on where you stand on Earth. Your location stays on this device.</p>
            <button className="accent wide" onClick={useMyLocation}>
              📍 Use my location
            </button>
            {locStatus && <div className="small sky-status">{locStatus}</div>}
            <div className="section-title">Or pick a city</div>
            <div className="groups">
              {CITIES.map((c) => (
                <button key={c.label} className="chip" onClick={() => chooseLocation(c)}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="section-title">Or enter coordinates</div>
            <form
              className="sky-manual"
              onSubmit={(e) => {
                e.preventDefault();
                const m = manual.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
                const lat = m ? Number(m[1]) : NaN;
                const lon = m ? Number(m[2]) : NaN;
                if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || Number.isNaN(lat) || Number.isNaN(lon)) {
                  setLocStatus('Type latitude, longitude. For example: 6.52, 3.38');
                  return;
                }
                chooseLocation({ lat, lon, heightM: 0, label: 'Custom place' });
              }}
            >
              <input placeholder="latitude, longitude (e.g. 6.52, 3.38)" value={manual} onChange={(e) => setManual(e.target.value)} />
              <button type="submit">Go</button>
            </form>
            {loc && (
              <button className="link small" onClick={() => setPicking(false)}>
                Keep {loc.label}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- helpers

function useUpNow(loc: SkyLocation | null, date: Date, sats: Satellite[]) {
  const passKey = loc ? `${loc.lat},${loc.lon}|${Math.floor(date.getTime() / 600_000)}|${sats.length}` : '';
  const passes = useMemo(() => {
    if (!loc) return [] as { sat: Satellite; pass: Pass }[];
    const stations = sats.filter((s) => s.group === 'stations' && /ISS \(ZARYA\)|CSS \(TIANHE\)|TIANGONG/i.test(s.name));
    return stations
      .flatMap((sat) => predictPasses(sat, date, loc, 24).map((pass) => ({ sat, pass })))
      .sort((a, b) => a.pass.rise.getTime() - b.pass.rise.getTime())
      .slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passKey]);
  if (!loc) return { bodies: [], stars: [], satsVisible: [], satsUp: 0, passes };
  const bodies = bodiesInSky(date, loc)
    .filter((b) => b.alt > 0)
    .sort((a, b) => a.mag - b.mag);
  const rot = horizonRotation(date, loc);
  const stars = STARS.filter((s) => s.name)
    .slice(0, 60)
    .map((s) => ({ ...s, ...toAltAz(rot, s) }))
    .filter((s) => s.alt > 5)
    .slice(0, 8);
  const up = satellitesInSky(sats, date, loc, 10);
  const satsVisible = up.sort((a, b) => Number(b.sunlit) - Number(a.sunlit) || b.alt - a.alt).slice(0, 8);
  return { bodies, stars, satsVisible, satsUp: up.length, passes: passes.filter((p) => p.pass.set > date) };
}

function shortSatName(name: string) {
  return name.replace(/\s*\(ZARYA\)/, '').replace(/^CSS \(TIANHE\)$/, 'Tiangong');
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c: number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

function selectedAltAz(
  id: string,
  bodies: BodyInSky[],
  sats: SatInSky[],
  rot: ReturnType<typeof horizonRotation>,
): AltAz | null {
  const b = bodies.find((x) => x.id === id);
  if (b) return b;
  if (id.startsWith('sat:')) return sats.find((s) => `sat:${s.sat.id}` === id) ?? null;
  if (id.startsWith('star:')) {
    const s = STARS[Number(id.slice(5))];
    return s ? toAltAz(rot, s) : null;
  }
  return null;
}

/** Arrow at the screen edge showing which way to turn to find the selected object. */
function drawEdgeArrow(ctx: CanvasRenderingContext2D, v: View, target: AltAz, name: string) {
  const w = v.width;
  const h = v.height;
  // Direction in screen space: use the projection's local axes via a small step toward the target.
  let dAz = ((target.az - v.az + 540) % 360) - 180;
  const dAlt = target.alt - v.alt;
  dAz *= Math.cos((v.alt * Math.PI) / 180);
  const r = (v.roll * Math.PI) / 180;
  const dx = dAz * Math.cos(r) - dAlt * Math.sin(r);
  const dy = -(dAz * Math.sin(r) + dAlt * Math.cos(r));
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const m = 44;
  const t = Math.min((w / 2 - m) / Math.abs(ux || 1e-6), (h / 2 - m) / Math.abs(uy || 1e-6));
  const x = w / 2 + ux * t;
  const y = h / 2 + uy * t;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(uy, ux));
  ctx.fillStyle = '#7dd3fc';
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-8, -10);
  ctx.lineTo(-8, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#7dd3fc';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${name} →`, Math.min(Math.max(x - ux * 40, 60), w - 60), Math.min(Math.max(y - uy * 30, 20), h - 10));
}

/** Shade the Moon's dark part, with the lit side facing the Sun. */
function drawMoonShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  litFraction: number,
  sun: BodyInSky | undefined,
  moon: BodyInSky,
  project: Projector,
) {
  if (!sun) return;
  const s = project(sun.alt, sun.az);
  const angle = s ? Math.atan2(s.y - y, s.x - x) : 0;
  const k = 1 - 2 * litFraction; // terminator ellipse: +1 new, -1 full
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  // Dark half is on the side away from the Sun (negative x).
  ctx.arc(0, 0, r, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.ellipse(0, 0, Math.abs(k) * r, r, 0, (3 * Math.PI) / 2, Math.PI / 2, k < 0);
  ctx.fill();
  ctx.restore();
  void moon;
}

/** Fill the ground (below 0° altitude). In stereographic projection the horizon is a circle or a line. */
function drawGround(ctx: CanvasRenderingContext2D, project: Projector, v: View, camera: boolean) {
  const w = v.width;
  const h = v.height;
  const a = project(0, v.az);
  const b = project(0, v.az + 90);
  const c = project(0, v.az - 90);
  const test = project(-5, v.az);
  if (!a || !b || !c || !test) return;
  ctx.save();
  ctx.beginPath();
  const det = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(det) < 1e-3) {
    // Horizon is a straight line through b and c: fill the side containing `test`.
    const nx = -(c.y - b.y);
    const ny = c.x - b.x;
    const side = Math.sign((test.x - b.x) * nx + (test.y - b.y) * ny);
    const far = 4 * (w + h);
    const len = Math.hypot(nx, ny);
    const ox = (nx / len) * far * side;
    const oy = (ny / len) * far * side;
    const dx = ((c.x - b.x) / Math.hypot(c.x - b.x, c.y - b.y)) * far;
    const dy = ((c.y - b.y) / Math.hypot(c.x - b.x, c.y - b.y)) * far;
    ctx.moveTo(b.x - dx, b.y - dy);
    ctx.lineTo(b.x + dx, b.y + dy);
    ctx.lineTo(b.x + dx + ox, b.y + dy + oy);
    ctx.lineTo(b.x - dx + ox, b.y - dy + oy);
    ctx.closePath();
  } else {
    const a2 = a.x * a.x + a.y * a.y;
    const b2 = b.x * b.x + b.y * b.y;
    const c2 = c.x * c.x + c.y * c.y;
    const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / det;
    const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / det;
    const rad = Math.hypot(a.x - ux, a.y - uy);
    const inside = Math.hypot(test.x - ux, test.y - uy) < rad;
    if (inside) ctx.arc(ux, uy, rad, 0, Math.PI * 2);
    else {
      ctx.rect(-10, -10, w + 20, h + 20);
      ctx.arc(ux, uy, rad, 0, Math.PI * 2, true);
    }
  }
  if (!camera) {
    ctx.fillStyle = 'rgba(10, 20, 14, 0.94)';
    ctx.fill('evenodd');
  }
  ctx.strokeStyle = 'rgba(134, 239, 172, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}
