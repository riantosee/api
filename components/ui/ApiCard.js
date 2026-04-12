'use client';
import StatusBadge from './StatusBadge';

const CATEGORY_COLORS = {
  anime:   'var(--cyan)',
  manga:   'var(--violet)',
  manhua:  'var(--pink)',
  donghua: 'var(--yellow)',
};

export default function ApiCard({ api, onToggle, onRestart, loading }) {
  const color = CATEGORY_COLORS[api.category] || 'var(--text2)';
  return (
    <div
      className="glass"
      style={{
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        borderTop: `2px solid ${color}`,
        opacity: api.enabled === false ? 0.6 : 1,
        transition: 'opacity 0.3s',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: 4,
            }}
          >
            {api.category}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 15,
              color: 'var(--text)',
            }}
          >
            {api.label}
          </div>
          <div
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginTop: 2 }}
          >
            {api.provider}
          </div>
        </div>
        <StatusBadge status={api.status} responseTime={api.response_time} />
      </div>

      {/* Tags */}
      {api.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {api.tags.map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
        </div>
      )}

      {/* Last checked */}
      {api.last_checked && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>
          Checked {new Date(api.last_checked).toLocaleTimeString()}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button
          className={`btn btn-sm ${api.enabled ? 'btn-danger' : 'btn-success'}`}
          onClick={() => onToggle?.(api.id, !api.enabled)}
          disabled={loading}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          {api.enabled ? 'Disable' : 'Enable'}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onRestart?.(api.id)}
          disabled={loading || !api.enabled}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Re-check'}
        </button>
      </div>
    </div>
  );
}
