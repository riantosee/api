'use client';
import { useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import { useStatus, useErrorLog } from '../../hooks/useStatus';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function DashboardPage() {
  const { statuses, summary, loading, lastUpdated, refresh } = useStatus(30000);
  const { logs } = useErrorLog();
  const [actionLoading, setActionLoading] = useState({});
  const [tab, setTab] = useState('apis');
  const [filterCat, setFilterCat] = useState('all');
  const [adminSecret, setAdminSecret] = useState('');
  const [authError, setAuthError] = useState('');

  function adminHeaders() {
    return { 'Content-Type': 'application/json', 'X-Admin-Secret': adminSecret };
  }

  async function handleToggle(id, enabled) {
    setAuthError('');
    setActionLoading(p => ({ ...p, [id]: true }));
    try {
      const res = await fetch('/api/admin/toggle', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ id, enabled }) });
      const json = await res.json();
      if (!res.ok) setAuthError(json.message || 'Admin auth failed');
      else await refresh();
    } finally {
      setActionLoading(p => ({ ...p, [id]: false }));
    }
  }

  async function handleRestart(id) {
    setAuthError('');
    setActionLoading(p => ({ ...p, [id]: true }));
    try {
      const res = await fetch('/api/admin/restart', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ id }) });
      const json = await res.json();
      if (!res.ok) setAuthError(json.message || 'Admin auth failed');
      else await refresh();
    } finally {
      setActionLoading(p => ({ ...p, [id]: false }));
    }
  }

  const cats = ['all', 'anime', 'manga', 'manhua', 'donghua'];
  const filtered = filterCat === 'all' ? statuses : statuses.filter(s => s.category === filterCat);
  const perfData = statuses.filter(s => s.response_time > 0).map(s => ({ name: s.provider, time: s.response_time }));

  const STATS = [
    { l: 'Total APIs', v: summary?.total   ?? '—', c: 'var(--white)' },
    { l: 'Online',     v: summary?.online  ?? '—', c: 'var(--green)' },
    { l: 'Warning',    v: summary?.warning ?? '—', c: 'var(--yellow)' },
    { l: 'Down',       v: summary?.down    ?? '—', c: 'var(--red)' },
  ];

  return (
    <>
      <Navbar />
      <div className="page" style={{ background: 'var(--bg)' }}>

        {/* Header */}
        <div style={{ borderBottom: '1px solid var(--border)', padding: 'clamp(24px,5vw,40px) clamp(20px,5vw,48px) 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div className="label" style={{ marginBottom: 10 }}>Admin</div>
              <h1 className="display" style={{ fontSize: 'clamp(36px,7vw,80px)' }}>Dashboard</h1>
              {lastUpdated && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', marginTop: 8, letterSpacing: '0.1em' }}>
                  UPDATED {lastUpdated.toLocaleTimeString()} · AUTO-REFRESH 30S
                </p>
              )}
            </div>
            <button className="btn" onClick={refresh} style={{ alignSelf: 'flex-start' }}>↻ Refresh</button>
          </div>
        </div>

        {/* ── Admin secret input ──────────────────────────────── */}
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px clamp(20px,5vw,48px)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Admin Secret
          </span>
          <input
            type="password"
            className="input-box"
            placeholder="Enter ADMIN_SECRET to enable controls…"
            value={adminSecret}
            onChange={e => { setAdminSecret(e.target.value); setAuthError(''); }}
            style={{ maxWidth: 340, fontFamily: 'var(--font-mono)', fontSize: 12 }}
          />
          {authError && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)', letterSpacing: '0.06em' }}>
              ✗ {authError}
            </span>
          )}
          {!authError && adminSecret && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', letterSpacing: '0.06em' }}>
              ✓ Secret set
            </span>
          )}
        </div>

        {/* Stats bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid var(--border)' }}>
          {STATS.map((s, i) => (
            <div key={s.l} style={{ padding: 'clamp(16px,3vw,28px) clamp(16px,4vw,40px)', borderRight: i < 3 ? '1px solid var(--border)' : 'none' }}>
              <div className="stat-label">{s.l}</div>
              <div className="stat-value" style={{ color: s.c, fontSize: 'clamp(28px,5vw,40px)' }}>{loading ? '…' : s.v}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ padding: '0 clamp(20px,5vw,48px)', overflowX: 'auto' }}>
          {[['apis', 'APIs'], ['performance', 'Performance'], ['errors', 'Error Log']].map(([k, l]) => (
            <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        <div style={{ padding: 'clamp(24px,5vw,40px) clamp(20px,5vw,48px)' }}>

          {/* ── APIs tab ──────────────────────────────────────── */}
          {tab === 'apis' && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                {cats.map(c => (
                  <button key={c} className={`btn btn-sm ${filterCat === c ? 'btn-fill' : 'btn-ghost'}`}
                    onClick={() => setFilterCat(c)} style={{ textTransform: 'capitalize' }}>{c}</button>
                ))}
              </div>
              {loading
                ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" style={{ width: 28, height: 28 }} /></div>
                : <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {filtered.map((api, i) => (
                      <div key={api.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', minWidth: 22 }}>{String(i + 1).padStart(2, '0')}</span>
                        <div style={{ flex: 1, minWidth: 140 }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(14px,2vw,18px)', textTransform: 'uppercase' }}>{api.label}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', letterSpacing: '0.08em' }}>{api.provider} · {api.category}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {api.tags?.slice(0, 2).map(t => <span key={t} className="tag">{t}</span>)}
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', minWidth: 48 }}>
                          {api.response_time > 0 ? `${api.response_time}ms` : '—'}
                        </span>
                        <span className={`badge badge-${api.status}`}>
                          <span className={`dot dot-${api.status}`} />{api.status}
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-sm"
                            style={{ borderColor: api.enabled ? 'rgba(239,68,68,.4)' : 'rgba(34,197,94,.4)', color: api.enabled ? 'var(--red)' : 'var(--green)' }}
                            onClick={() => handleToggle(api.id, !api.enabled)}
                            disabled={!!actionLoading[api.id] || !adminSecret}
                            title={!adminSecret ? 'Enter admin secret first' : ''}
                          >
                            {api.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button className="btn btn-sm btn-ghost"
                            onClick={() => handleRestart(api.id)}
                            disabled={!!actionLoading[api.id] || !api.enabled || !adminSecret}
                            title={!adminSecret ? 'Enter admin secret first' : ''}
                          >
                            {actionLoading[api.id] ? <span className="spinner" /> : 'Re-check'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </>
          )}

          {/* ── Performance tab ────────────────────────────────── */}
          {tab === 'performance' && (
            <div>
              <div style={{ marginBottom: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', letterSpacing: '0.1em' }}>
                RESPONSE TIME BY PROVIDER (ms)
              </div>
              <div style={{ border: '1px solid var(--border)', padding: '24px 24px 0', background: 'var(--bg2)' }}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={perfData} margin={{ top: 0, right: 0, bottom: 44, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: 'var(--white3)', fontSize: 9, fontFamily: 'var(--font-mono)' }} angle={-35} textAnchor="end" />
                    <YAxis tick={{ fill: 'var(--white3)', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 11, borderRadius: 0 }} formatter={v => [`${v}ms`, 'Response Time']} />
                    <Bar dataKey="time" fill="var(--white2)" radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Error log tab ───────────────────────────────────── */}
          {tab === 'errors' && (
            <div>
              <div style={{ marginBottom: 20, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', letterSpacing: '0.1em' }}>
                ERROR LOG — {logs.length} ENTRIES
              </div>
              {logs.length === 0
                ? <div style={{ padding: '48px 0', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--white3)' }}>✓ No errors recorded</div>
                : logs.map(log => (
                  <div key={log.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--border)', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)', marginBottom: 4, letterSpacing: '0.08em' }}>
                        [{log.category?.toUpperCase()}] {log.api_id}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--white2)' }}>{log.message}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', marginTop: 4, wordBreak: 'break-all' }}>{log.endpoint}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', whiteSpace: 'nowrap' }}>
                      {new Date(log.time).toLocaleString()}
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>

        <div style={{ padding: '14px clamp(20px,5vw,48px)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <span className="sec-num">.02</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', letterSpacing: '0.12em' }}>ADMIN DASHBOARD</span>
        </div>
      </div>
    </>
  );
}
