import type { SimClock } from '../lib/clock';

const RATES: { label: string; rate: number }[] = [
  { label: '−1 wk/s', rate: -604_800 },
  { label: '−1 day/s', rate: -86_400 },
  { label: '−1 h/s', rate: -3_600 },
  { label: 'Real time', rate: 1 },
  { label: '1 min/s', rate: 60 },
  { label: '1 h/s', rate: 3_600 },
  { label: '1 day/s', rate: 86_400 },
  { label: '1 wk/s', rate: 604_800 },
];

function toLocalInput(d: Date): string {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

interface Props {
  clock: SimClock;
  date: Date;
  onChange: () => void;
}

export function TimeControls({ clock, date, onChange }: Props) {
  const live = clock.isLive();
  const act = (fn: () => void) => () => {
    fn();
    onChange();
  };

  return (
    <div className="time-controls panel">
      <div className="time-readout">
        <span className={`live-dot ${live ? 'on' : ''}`} title={live ? 'Showing the current moment' : 'Simulated time'} />
        <div>
          <div className="time-date">{date.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</div>
          <div className="time-clock">
            {date.toLocaleTimeString()} <span className="muted">· {date.toISOString().slice(11, 19)} UTC</span>
          </div>
        </div>
      </div>

      <div className="time-buttons">
        <button onClick={act(() => clock.setPaused(!clock.paused))} aria-label={clock.paused ? 'Play' : 'Pause'}>
          {clock.paused ? '▶' : '❚❚'}
        </button>
        <select
          value={clock.rate}
          onChange={(e) => {
            clock.setRate(Number(e.target.value));
            if (clock.paused) clock.setPaused(false);
            onChange();
          }}
          aria-label="Speed"
        >
          {RATES.map((r) => (
            <option key={r.rate} value={r.rate}>
              {r.label}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          aria-label="Jump to date"
          value={toLocalInput(date)}
          onChange={(e) => {
            const d = new Date(e.target.value);
            if (!Number.isNaN(d.getTime())) {
              clock.set(d);
              onChange();
            }
          }}
        />
        <button className={live ? 'primary' : 'accent'} onClick={act(() => clock.goLive())} disabled={live}>
          Now
        </button>
      </div>
    </div>
  );
}
