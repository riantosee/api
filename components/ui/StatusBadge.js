export default function StatusBadge({ status, responseTime }) {
  const map = {
    online:   { label: 'ONLINE',   cls: 'online' },
    warning:  { label: 'SLOW',     cls: 'warning' },
    down:     { label: 'DOWN',     cls: 'down' },
    unknown:  { label: 'UNKNOWN',  cls: 'unknown' },
    disabled: { label: 'DISABLED', cls: 'disabled' },
  };
  const { label, cls } = map[status] || map.unknown;

  return (
    <span className={`badge badge-${cls}`}>
      <span className={`dot dot-${cls}`} />
      {label}
      {responseTime > 0 && status !== 'disabled' && (
        <span style={{ opacity: 0.7, fontWeight: 400 }}>{responseTime}ms</span>
      )}
    </span>
  );
}
