'use client';
import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar from '../../components/layout/Navbar';

// ─────────────────────────────────────────────────────────────────
// CATEGORY CONFIG — tambah entry baru di sini untuk provider baru
// ─────────────────────────────────────────────────────────────────
const CAT_BG = {
  'anime-v1'   : 'https://files.catbox.moe/7ipdhn.jpg',
  'anime-v2'   : 'https://files.catbox.moe/7ipdhn.jpg',
  'manga-v1'   : 'https://files.catbox.moe/r404th.jpg',
  'manhua-v1'  : 'https://files.catbox.moe/pqmjmo.jpg',
  'donghua-v1' : 'https://files.catbox.moe/rc9ubf.jpg',
  'donghua-v2' : 'https://files.catbox.moe/rc9ubf.jpg',
  'system'     : null,
};

// ─────────────────────────────────────────────────────────────────
// PRESETS — struktur: category → version → items
// Untuk tambah provider baru: tambah object baru di CATEGORIES
// ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    id      : 'anime',
    label   : 'Anime',
    versions: [
      {
        id      : 'anime-v1',
        label   : 'v1 · Samehadaku',
        provider: 'samehadaku',
        items   : [
          { label: 'Search',        method: 'GET', path: '/api/anime/search',    params: 'q=naruto' },
          { label: 'Latest Episode',method: 'GET', path: '/api/anime/latest',    params: 'page=1' },
          { label: 'Popular',       method: 'GET', path: '/api/anime/popular',   params: '' },
          { label: 'List Genre',    method: 'GET', path: '/api/anime/listgenre', params: '' },
          { label: 'Jadwal Rilis',  method: 'GET', path: '/api/anime/schedule',  params: 'day=monday' },
          { label: 'Batch',         method: 'GET', path: '/api/anime/batch',     params: 'page=1' },
          { label: 'Detail',        method: 'GET', path: '/api/anime/detail',    params: 'slug=one-punch-man' },
          { label: 'Watch',         method: 'GET', path: '/api/anime/watch',     params: 'slug=one-punch-man-episode-12' },
        ],
      },
      {
        id      : 'anime-v2',
        label   : 'v2 · Otakudesu',
        provider: 'otakudesu',
        items   : [
          { label: 'Search',        method: 'GET', path: '/api/v2/anime/search',  params: 'q=naruto' },
          { label: 'Latest Episode',method: 'GET', path: '/api/v2/anime/latest',  params: 'page=1' },
          { label: 'Popular',       method: 'GET', path: '/api/v2/anime/popular', params: '' },
          { label: 'Detail',        method: 'GET', path: '/api/v2/anime/detail',  params: 'slug=one-punch-man' },
          { label: 'Watch',         method: 'GET', path: '/api/v2/anime/watch',   params: 'slug=one-punch-man-episode-12' },
        ],
      },
    ],
  },
  {
    id      : 'manga',
    label   : 'Manga',
    versions: [
      {
        id      : 'manga-v1',
        label   : 'v1 · Komikstation',
        provider: 'komikstation',
        items   : [
          { label: 'Search',     method: 'GET', path: '/api/manga/search',    params: 'q=naruto' },
          { label: 'Latest',     method: 'GET', path: '/api/manga/latest',    params: 'page=1' },
          { label: 'Popular',    method: 'GET', path: '/api/manga/popular',   params: 'page=1' },
          { label: 'New Series', method: 'GET', path: '/api/manga/new',       params: 'page=1' },
          { label: 'List Genre', method: 'GET', path: '/api/manga/listgenre', params: '' },
          { label: 'A-Z',        method: 'GET', path: '/api/manga/az',        params: 'page=1' },
          { label: 'Detail',     method: 'GET', path: '/api/manga/detail',    params: 'slug=one-punch-man' },
          { label: 'Read',       method: 'GET', path: '/api/manga/read',      params: 'slug=one-punch-man-chapter-228' },
        ],
      },
    ],
  },
  {
    id      : 'manhua',
    label   : 'Manhua',
    versions: [
      {
        id      : 'manhua-v1',
        label   : 'v1 · Manhwaland',
        provider: 'manhwaland',
        items   : [
          { label: 'Search',  method: 'GET', path: '/api/manhua/search',  params: 'q=solo leveling' },
          { label: 'Popular', method: 'GET', path: '/api/manhua/popular', params: '' },
          { label: 'Latest',  method: 'GET', path: '/api/manhua/latest',  params: '' },
          { label: 'Project', method: 'GET', path: '/api/manhua/project', params: 'page=1' },
          { label: 'Detail',  method: 'GET', path: '/api/manhua/detail',  params: 'slug=only-i-have-an-ex-grade-summon' },
          { label: 'Chapter', method: 'GET', path: '/api/manhua/chapter', params: 'slug=only-i-have-an-ex-grade-summon-chapter-16' },
        ],
      },
    ],
  },
  {
    id      : 'donghua',
    label   : 'Donghua',
    versions: [
      {
        id      : 'donghua-v1',
        label   : 'v1 · donghuafilm',
        provider: 'donghuafilm',
        items   : [
          { label: 'Search',   method: 'GET', path: '/api/donghua/search',   params: 'q=battle through the heavens' },
          { label: 'Latest',   method: 'GET', path: '/api/donghua/latest',   params: '' },
          { label: 'Popular',  method: 'GET', path: '/api/donghua/popular',  params: '' },
          { label: 'Detail',   method: 'GET', path: '/api/donghua/detail',   params: 'slug=renegade-immortal-episode-135-subtitle-indonesia' },
          { label: 'Episodes', method: 'GET', path: '/api/donghua/episodes', params: 'slug=renegade-immortal' },
          { label: 'Schedule', method: 'GET', path: '/api/donghua/schedule', params: '' },
          { label: 'Genres',   method: 'GET', path: '/api/donghua/genres',   params: 'genre=action' },
        ],
      },
      {
        id      : 'donghua-v2',
        label   : 'v2 · Provider B',
        provider: 'providerB',
        items   : [
          { label: 'Search',  method: 'GET', path: '/api/v2/donghua/search',  params: 'q=naruto' },
          { label: 'Latest',  method: 'GET', path: '/api/v2/donghua/latest',  params: '' },
          { label: 'Popular', method: 'GET', path: '/api/v2/donghua/popular', params: '' },
        ],
      },
    ],
  },
  {
    id      : 'system',
    label   : 'System',
    versions: [
      {
        id      : 'system',
        label   : 'System',
        provider: '',
        items   : [
          { label: 'All Statuses',   method: 'GET', path: '/api/status', params: '' },
          { label: 'Force Refresh',  method: 'GET', path: '/api/status', params: 'refresh=true' },
          { label: 'Error Log',      method: 'GET', path: '/api/health', params: 'mode=errors' },
          { label: 'Uptime Summary', method: 'GET', path: '/api/health', params: 'mode=summary' },
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
function syntaxHighlight(json) {
  if (typeof json !== 'string') json = JSON.stringify(json, null, 2);
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    m => {
      let cls = 'json-number';
      if (/^"/.test(m)) cls = /:$/.test(m) ? 'json-key' : 'json-string';
      else if (/true|false/.test(m)) cls = 'json-bool';
      else if (/null/.test(m)) cls = 'json-null';
      return `<span class="${cls}">${m}</span>`;
    }
  );
}

// ─────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────
function TesterContent() {
  const sp = useSearchParams();

  const [method,      setMethod]      = useState('GET');
  const [path,        setPath]        = useState(sp.get('path') || '/api/status');
  const [params,      setParams]      = useState('');
  const [headers,     setHeaders]     = useState('X-API-Key: ');
  const [response,    setResponse]    = useState(null);
  const [status,      setStatus]      = useState(null);
  const [elapsed,     setElapsed]     = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [history,     setHistory]     = useState([]);
  const [sideOpen,    setSideOpen]    = useState(false);

  // Active category & version
  const [activeCatId, setActiveCatId] = useState('system');
  const [activeVerId, setActiveVerId] = useState('system');

  // Expand/collapse category di sidebar
  const [expandedCats, setExpandedCats] = useState({ system: true });

  useEffect(() => {
    const raw = sp.get('path') || '';
    if (!raw) return;
    const url = new URL(raw, 'http://x');
    setPath(url.pathname);
    const pairs = [];
    url.searchParams.forEach((v, k) => pairs.push(`${k}=${v}`));
    setParams(pairs.join('\n'));
  }, []);

  function buildUrl() {
    const p = params.split('\n').map(l => l.trim()).filter(l => l.includes('=')).reduce((a, l) => {
      const i = l.indexOf('='); a[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return a;
    }, {});
    const qs = new URLSearchParams(p).toString();
    return qs ? `${path}?${qs}` : path;
  }

  function parseHeaders() {
    return headers.split('\n').map(l => l.trim()).filter(l => l.includes(':')).reduce((a, l) => {
      const i = l.indexOf(':'); const k = l.slice(0, i).trim(); const v = l.slice(i + 1).trim();
      if (k && v) a[k] = v; return a;
    }, {});
  }

  function applyPreset(item, catId, verId) {
    setMethod(item.method);
    setPath(item.path);
    setParams(item.params || '');
    setActiveCatId(catId);
    setActiveVerId(verId);
    setSideOpen(false);
  }

  function toggleCat(catId) {
    setExpandedCats(prev => ({ ...prev, [catId]: !prev[catId] }));
    setActiveCatId(catId);
  }

  const send = useCallback(async () => {
    setLoading(true); setResponse(null); setStatus(null); setElapsed(null);
    const url = buildUrl();
    const t = Date.now();
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...parseHeaders() },
      });
      const ms = Date.now() - t;
      const json = await res.json();
      setStatus(res.status); setElapsed(ms); setResponse(json);
      setHistory(h => [{ url, status: res.status, ms, time: new Date().toLocaleTimeString() }, ...h].slice(0, 20));
    } catch (err) {
      setStatus(0); setElapsed(Date.now() - t); setResponse({ error: err.message });
    } finally { setLoading(false); }
  }, [method, path, params, headers]);

  const statusColor =
    status === null             ? 'var(--white3)'
    : status >= 200 && status < 300 ? 'var(--green)'
    : status >= 400 && status < 500 ? 'var(--yellow)'
    : 'var(--red)';

  const bgImg = CAT_BG[activeVerId] || null;

  const sidebarStyle = {
    ...(bgImg
      ? {
          backgroundImage   : `linear-gradient(rgba(12,12,12,0.91) 0%, rgba(12,12,12,0.97) 100%), url(${bgImg})`,
          backgroundSize    : 'auto, cover',
          backgroundPosition: 'top, center',
          backgroundRepeat  : 'repeat, no-repeat',
          backgroundAttachment: 'local, local',
        }
      : {}),
    backgroundColor: '#0c0c0c',
  };

  // Active version object
  const activeVer = CATEGORIES
    .flatMap(c => c.versions)
    .find(v => v.id === activeVerId);

  return (
    <>
      <style>{`
        .tester-wrap {
          display: grid;
          grid-template-columns: 230px 1fr;
          min-height: calc(100vh - 60px);
        }
        .tester-sidebar {
          border-right: 1px solid var(--border);
          position: sticky;
          top: 60px;
          height: calc(100vh - 60px);
          overflow-y: auto;
          padding: 16px 12px;
        }
        .tester-main { display: flex; flex-direction: column; min-width: 0; }
        .sidebar-toggle { display: none; }

        /* version tab strip */
        .ver-tabs {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          margin: 4px 0 8px 12px;
        }
        .ver-tab {
          font-family: var(--font-mono);
          font-size: 9px;
          padding: 3px 8px;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--white3);
          cursor: pointer;
          letter-spacing: 0.04em;
          transition: all .15s;
        }
        .ver-tab.active {
          border-color: var(--white2);
          color: var(--white);
          background: rgba(255,255,255,0.06);
        }

        /* cat header */
        .cat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 4px;
          cursor: pointer;
          user-select: none;
          border-radius: 2px;
        }
        .cat-header:hover { background: rgba(255,255,255,0.04); }

        @media (max-width: 700px) {
          .tester-wrap { grid-template-columns: 1fr; }
          .tester-sidebar {
            position: fixed;
            top: 60px; left: 0; right: 0; bottom: 0;
            z-index: 150;
            height: auto;
            max-height: calc(100vh - 60px);
            overflow-y: auto;
            padding: 16px;
            transform: translateX(-100%);
            transition: transform .28s ease;
          }
          .tester-sidebar.open { transform: translateX(0); }
          .sidebar-toggle { display: flex !important; }
        }
      `}</style>

      <div className="tester-wrap">

        {/* ── Sidebar ─────────────────────────────── */}
        <aside
          className={`tester-sidebar${sideOpen ? ' open' : ''}`}
          style={sidebarStyle}
        >
          {CATEGORIES.map(cat => {
            const isExpanded = expandedCats[cat.id];
            const isCatActive = activeCatId === cat.id;

            return (
              <div key={cat.id} style={{ marginBottom: 6 }}>

                {/* Category header — klik untuk expand/collapse */}
                <div
                  className="cat-header"
                  onClick={() => toggleCat(cat.id)}
                >
                  <span className="label" style={{
                    color: isCatActive ? 'var(--white)' : 'var(--white3)',
                    fontSize: 10,
                    letterSpacing: '0.1em',
                  }}>
                    {cat.label.toUpperCase()}
                  </span>
                  <span style={{ color: 'var(--white4)', fontSize: 10 }}>
                    {isExpanded ? '▾' : '▸'}
                  </span>
                </div>

                {/* Version tabs */}
                {isExpanded && cat.versions.length > 1 && (
                  <div className="ver-tabs">
                    {cat.versions.map(ver => (
                      <button
                        key={ver.id}
                        className={`ver-tab${activeVerId === ver.id ? ' active' : ''}`}
                        onClick={() => {
                          setActiveCatId(cat.id);
                          setActiveVerId(ver.id);
                        }}
                      >
                        {ver.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Endpoint items — hanya tampil versi aktif */}
                {isExpanded && cat.versions.map(ver => {
                  const isVerActive = activeVerId === ver.id || cat.versions.length === 1;
                  if (!isVerActive && cat.versions.length > 1) return null;

                  return (
                    <div key={ver.id} style={{ marginBottom: 4 }}>
                      {/* Label provider jika hanya 1 versi */}
                      {cat.versions.length === 1 && ver.provider && (
                        <div style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 8,
                          color: 'var(--white4)',
                          letterSpacing: '0.08em',
                          padding: '2px 4px 4px',
                        }}>
                          {ver.provider.toUpperCase()}
                        </div>
                      )}

                      {ver.items.map(item => (
                        <button
                          key={item.label + item.path}
                          className="btn btn-ghost btn-sm"
                          style={{
                            width: '100%',
                            justifyContent: 'flex-start',
                            marginBottom: 3,
                            textAlign: 'left',
                            borderColor: (activeVerId === ver.id && path === item.path)
                              ? 'var(--white2)' : 'var(--border)',
                            color: (activeVerId === ver.id && path === item.path)
                              ? 'var(--white)' : 'var(--white3)',
                          }}
                          onClick={() => applyPreset(item, cat.id, ver.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* History */}
          {history.length > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />
              <div className="label" style={{ marginBottom: 8, fontSize: 9 }}>HISTORY</div>
              {history.map((h, i) => (
                <div
                  key={i}
                  onClick={() => { setPath(h.url.split('?')[0]); setSideOpen(false); }}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9,
                    padding: '6px 0', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    color: h.status >= 200 && h.status < 300 ? 'var(--green)' : 'var(--red)',
                    display: 'flex', justifyContent: 'space-between', gap: 6,
                  }}
                >
                  <span>{h.status}</span>
                  <span style={{ color: 'var(--white3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.url}</span>
                  <span style={{ color: 'var(--white3)', flexShrink: 0 }}>{h.ms}ms</span>
                </div>
              ))}
            </>
          )}
        </aside>

        {/* ── Main ────────────────────────────────── */}
        <div className="tester-main">

          {/* Mobile toolbar */}
          <div className="sidebar-toggle" style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border)',
            alignItems: 'center',
            gap: 10,
            background: 'var(--bg2)',
          }}>
            <button className="btn btn-sm" style={{ flexShrink: 0 }} onClick={() => setSideOpen(o => !o)}>
              {sideOpen ? '✕ Close' : '☰ Presets'}
            </button>
            {activeVer && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--white3)' }}>
                {activeVer.label}
              </span>
            )}
          </div>

          {/* URL bar */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg)' }}>
            <select
              className="input"
              value={method}
              onChange={e => setMethod(e.target.value)}
              style={{ width: 74, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500, color: 'var(--white)', flexShrink: 0 }}
            >
              <option>GET</option>
              <option>POST</option>
            </select>
            <input
              className="input"
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13, minWidth: 0 }}
              value={path}
              onChange={e => setPath(e.target.value)}
              placeholder="/api/anime/search"
              onKeyDown={e => e.key === 'Enter' && send()}
            />
            <button
              className="btn btn-fill"
              onClick={send}
              disabled={loading}
              style={{ minWidth: 90, justifyContent: 'center', flexShrink: 0 }}
            >
              {loading ? <span className="spinner" /> : '▶ Send'}
            </button>
          </div>

          {/* Params + Headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', borderBottom: '1px solid var(--border)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div className="label" style={{ marginBottom: 6, fontSize: 9 }}>Query Params (key=value per line)</div>
              <textarea
                className="input-box"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, resize: 'vertical', minHeight: 72, lineHeight: 1.7 }}
                value={params}
                onChange={e => setParams(e.target.value)}
                placeholder={'q=naruto\npage=1'}
              />
            </div>
            <div style={{ padding: '14px 16px' }}>
              <div className="label" style={{ marginBottom: 6, fontSize: 9 }}>Headers (key: value per line)</div>
              <textarea
                className="input-box"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, resize: 'vertical', minHeight: 72, lineHeight: 1.7 }}
                value={headers}
                onChange={e => setHeaders(e.target.value)}
                placeholder="X-API-Key: your-key"
              />
            </div>
          </div>

          {/* URL preview */}
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', background: 'var(--bg2)', overflow: 'hidden' }}>
            <span className="label" style={{ flexShrink: 0 }}>URL:</span>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--white2)', overflow: 'auto', whiteSpace: 'nowrap' }}>
              {buildUrl()}
            </code>
          </div>

          {/* Response area */}
          <div style={{ flex: 1, padding: '16px', position: 'relative', minHeight: 280 }}>
            {bgImg && (
              <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: `url(${bgImg})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'brightness(0.06) grayscale(0.5)',
                transition: 'background-image .5s ease',
                pointerEvents: 'none',
              }} />
            )}

            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, textTransform: 'uppercase' }}>Response</span>
                  {status !== null && (
                    <>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 12,
                        color: statusColor, background: `${statusColor}18`,
                        padding: '3px 9px', border: `1px solid ${statusColor}40`,
                      }}>{status}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--white3)' }}>{elapsed}ms</span>
                    </>
                  )}
                  {/* Provider badge */}
                  {activeVer?.provider && (
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9,
                      color: 'var(--white4)', letterSpacing: '0.1em',
                      border: '1px solid var(--border)', padding: '2px 7px',
                    }}>
                      {activeVer.provider.toUpperCase()}
                    </span>
                  )}
                </div>
                {response && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(response, null, 2));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                )}
              </div>

              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: 200, gap: 14 }}>
                  <span className="spinner" style={{ width: 24, height: 24 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--white3)' }}>Sending…</span>
                </div>
              ) : response ? (
                <pre
                  className="code-block"
                  style={{ maxHeight: 'clamp(240px, 50vh, 500px)' }}
                  dangerouslySetInnerHTML={{ __html: syntaxHighlight(JSON.stringify(response, null, 2)) }}
                />
              ) : (
                <div style={{
                  minHeight: 200,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px dashed var(--border)',
                  flexDirection: 'column', gap: 8,
                }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,6vw,40px)', fontWeight: 900, color: 'var(--white4)', letterSpacing: '-0.01em' }}>
                    {activeCatId !== 'system' ? activeCatId.toUpperCase() : 'TEST'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--white3)' }}>
                    Hit ▶ Send to run the request
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function TesterPage() {
  return (
    <>
      <Navbar />
      <div className="page" style={{ background: 'var(--bg)', paddingTop: 60 }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: 'clamp(20px,4vw,32px) clamp(20px,5vw,48px)' }}>
          <div className="label" style={{ marginBottom: 8 }}>Tools</div>
          <h1 className="display" style={{ fontSize: 'clamp(32px,7vw,72px)' }}>API Tester</h1>
          <p style={{ color: 'var(--white3)', fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 6, letterSpacing: '0.1em' }}>
            POSTMAN-STYLE TESTING — DIRECTLY IN THE BROWSER
          </p>
        </div>

        <Suspense fallback={
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <span className="spinner" style={{ width: 28, height: 28 }} />
          </div>
        }>
          <TesterContent />
        </Suspense>

        <div style={{ padding: '14px clamp(20px,5vw,48px)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span className="sec-num">.04</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', letterSpacing: '0.12em' }}>API TESTING TOOL</span>
        </div>
      </div>
    </>
  );
}
