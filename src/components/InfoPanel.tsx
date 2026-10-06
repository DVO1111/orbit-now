import type { Details } from '../lib/details';

interface Props {
  details: Details | null;
  onClose: () => void;
}

export function InfoPanel({ details, onClose }: Props) {
  if (!details) return null;
  return (
    <aside className="info panel">
      <button className="close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <h2>{details.title}</h2>
      <div className="muted subtitle">{details.subtitle}</div>
      {details.warning && <div className="warning">{details.warning}</div>}
      <dl>
        {details.rows.map(([k, v]) => (
          <div key={k} className="row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {details.fact && <p className="fact">💡 {details.fact}</p>}
      {details.note && <p className="muted small note">ⓘ {details.note}</p>}
    </aside>
  );
}
