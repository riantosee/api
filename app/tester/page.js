'use client';
import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar from '../../components/layout/Navbar';

/* ── Category → background image mapping ─────────────────────── */
const CAT_BG = {
  anime:   'https://files.catbox.moe/7ipdhn.jpg',
  manga:   'https://files.catbox.moe/r404th.jpg',
  manhua:  'https://files.catbox.moe/pqmjmo.jpg',
  donghua: 'https://files.catbox.moe/rc9ubf.jpg',
  system:  null,
};

/* ── Preset list ─────────────────────────────────────────────── */
const PRESETS = [
  { g: 'anime',   label: 'Anime',   items: [
    { label: 'Search Anime',   method: 'GET', path: '/api/anime/search',   params: 'q=naruto\nprovider=jikan-anime\npage=1' },
    { label: 'Trending Anime', method: 'GET', path: '/api/anime/trending', params: 'provider=jikan-anime' },
  ]},
  { g: 'manga',   label: 'Manga',   items: [
    { label: 'Search Manga',   method: 'GET', path: '/api/manga/search',   params: 'q=naruto' },
{ label: 'Latest Manga',   method: 'GET', path: '/api/manga/latest',   params: 'page=1' },
{ label: 'Popular Manga',   method: 'GET', path: '/api/manga/popular',   params: 'page=1' },
  ]},
  { g: 'manhua',  label: 'Manhua',  items: [
    { label: 'Search Manhua/Manhwa',  method: 'GET', path: '/api/manhua/search',  params: 'q=solo leveling' },
{ label: 'Popular Manhua/Manhwa', method: 'GET', path: '/api/manhua/popular', params: '' },
{ label: 'Latest Manhua/Manhwa',  method: 'GET', path: '/api/manhua/latest',  params: '' },
{ label: 'Project Manhua/Manhwa', method: 'GET', path: '/api/manhua/project', params: 'page=1' },
{ label: 'Detail Manhua/Manhwa', method: 'GET', path: '/api/manhua/detail', params: 'slug=only-i-have-an-ex-grade-summon' },
{ label: 'Chapter Manhua/Manhwa', method: 'GET', path: '/api/manhua/chapter', params: 'slug=only-i-have-an-ex-grade-summon-chapter-16' },
  ]},
  { g: 'donghua', label: 'Donghua', items: [
    { label: 'Search Donghua',   method: 'GET', path: '/api/donghua/search',          params: 'q=battle through the heavens' },
    { label: 'Latest Donghua',   method: 'GET', path: '/api/donghua/latest', },
    { label: 'Popular Donghua',  method: 'GET', path: '/api/donghua/popular',  },
    { label: 'Detail Donghua',   method: 'GET', path: '/api/donghua/detail',   params: 'slug=renegade-immortal-episode-135-subtitle-indonesia' },
    { label: 'Episodes Donghua', method: 'GET', path: '/api/donghua/episodes', params: 'slug=renegade-immortal' },
{ label: 'Schedule Donghua', method: 'GET', path: '/api/donghua/schedule', params: '' },
{ label: 'Genres Donghua', method: 'GET', path: '/api/donghua/genres', params: 'genre=action' },
  ]},
  { g: 'system',  label: 'System',  items: [
    { label: 'All Statuses',   method: 'GET', path: '/api/status',  params: '' },
    { label: 'Force Refresh',  method: 'GET', path: '/api/status',  params: 'refresh=true' },
    { label: 'Error Log',      method: 'GET', path: '/api/health',  params: 'mode=errors' },
    { label: 'Uptime Summary', method: 'GET', path: '/api/health',  params: 'mode=summary' },
  ]},
];

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

/* ── Main tester component (needs useSearchParams → Suspense) ── */
function TesterContent() {
  const sp = useSearchParams();

  const [method,   setMethod]   = useState('GET');
  const [path,     setPath]     = useState(sp.get('path') || '/api/status');
  const [params,   setParams]   = useState('');
  const [headers,  setHeaders]  = useState('X-API-Key: ');
  const [response, setResponse] = useState(null);
  const [status,   setStatus]   = useState(null);
  const [elapsed,  setElapsed]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [history,  setHistory]  = useState([]);

  /* which category is active (drives background) */
  const [activeCat, setActiveCat] = useState('system');
  /* mobile: sidebar open */
  const [sideOpen, setSideOpen] = useState(false);

  /* parse preset path on mount */
  useEffect(() => {
    const raw = sp.get('path') || '';
    if (!raw) return;
    const url = new URL(raw, 'http://x');
    setPath(url.pathname);
    const pairs = [];
    url.searchParams.forEach((v, k) => pairs.push(`${k}=${v}`));
    setParams(pairs.join('\n'));
    /* try to detect category from path */
    const cat = PRESETS.find(p => p.items.some(i => i.path === url.pathname));
    if (cat) setActiveCat(cat.g);
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

  function applyPreset(item, cat) {
    setMethod(item.method);
    setPath(item.path);
    setParams(item.params || '');
    setActiveCat(cat);
    setSideOpen(false); /* close sidebar on mobile after selecting */
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
    status === null ? 'var(--white3)'
    : status >= 200 && status < 300 ? 'var(--green)'
    : status >= 400 && status < 500 ? 'var(--yellow)'
    : 'var(--red)';

  const bgImg = CAT_BG[activeCat];

  return (
    <>
      <style>{`
        /* ── layout ───────────────────────────────── */
        .tester-wrap {
          display: grid;
          grid-template-columns: 220px 1fr;
          min-height: calc(100vh - 60px);
        }
        .tester-sidebar {
          border-right: 1px solid var(--border);
          position: sticky;
          top: 60px;
          height: calc(100vh - 60px);
          overflow-y: auto;
          padding: 20px 16px;
          transition: background-image 0.5s ease;
          background-size: cover;
          background-position: center;
        }
        .tester-main { display: flex; flex-direction: column; min-width: 0; }

        /* ── mobile ──────────────────────────────── */
        @media(max-width: 700px) {
          .tester-wrap { grid-template-columns: 1fr; }

          .tester-sidebar {
            position: fixed;
            top: 60px; left: 0; right: 0; bottom: 0;
            z-index: 150;
            height: auto;
            max-height: calc(100vh - 60px);
            transform: translateX(-100%);
            transition: transform .28s ease, background-image 0.5s ease;
            padding: 20px 20px;
            background-color: var(--bg);
          }
          .tester-sidebar.open {
            transform: translateX(0);
          }

          .sidebar-toggle {
            display: flex !important;
          }
        }
        @media(min-width: 701px) {
          .sidebar-toggle { display: none !important; }
        }
      `}</style>

      <div className="tester-wrap">

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <aside
          className={`tester-sidebar${sideOpen ? ' open' : ''}`}
          style={{
            backgroundImage: bgImg ? `url(${bgImg})` : 'none',
          }}
        >
          {/* Dark overlay so text stays readable over bg image */}
          <div style={{
            position: 'absolute', inset: 0,
            background: bgImg
              ? 'linear-gradient(to bottom, rgba(12,12,12,0.88) 0%, rgba(12,12,12,0.96) 100%)'
              : 'transparent',
            pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            {PRESETS.map(group => (
              <div key={group.g} style={{ marginBottom: 20 }}>
                <div className="label" style={{ marginBottom: 8, color: activeCat === group.g ? 'var(--white2)' : 'var(--white3)' }}>
                  {group.label}
                </div>
                {group.items.map(item => (
                  <button
                    key={item.label}
                    className={`btn btn-ghost btn-sm`}
                    style={{
                      width: '100%',
                      justifyContent: 'flex-start',
                      marginBottom: 4,
                      textAlign: 'left',
                      borderColor: (activeCat === group.g && path === item.path)
                        ? 'var(--white2)' : 'var(--border)',
                      color: (activeCat === group.g && path === item.path)
                        ? 'var(--white)' : 'var(--white3)',
                    }}
                    onClick={() => applyPreset(item, group.g)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}

            {/* History */}
            {history.length > 0 && (
              <>
                <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />
                <div className="label" style={{ marginBottom: 8 }}>History</div>
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
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────────── */}
        <div className="tester-main">

          {/* Mobile toolbar: toggle sidebar + current category indicator */}
          <div className="sidebar-toggle" style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--bg2)',
          }}>
            <button
              className="btn btn-sm"
              style={{ flexShrink: 0 }}
              onClick={() => setSideOpen(o => !o)}
            >
              {sideOpen ? '✕ Close' : '☰ Presets'}
            </button>
            {activeCat !== 'system' && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'var(--white3)',
              }}>
                {activeCat}
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

          {/* Params + Headers — stacked on mobile */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', borderBottom: '1px solid var(--border)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div className="label" style={{ marginBottom: 6, fontSize: 9 }}>Query Params (key=value per line)</div>
              <textarea
                className="input-box"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, resize: 'vertical', minHeight: 72, lineHeight: 1.7 }}
                value={params}
                onChange={e => setParams(e.target.value)}
                placeholder={'q=naruto\npage=1\nprovider=jikan-anime'}
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
          <div style={{ flex: 1, padding: '16px 16px', position: 'relative', minHeight: 280 }}>

            {/* Response bg image (subtle, blurred) */}
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
              {/* Response header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, textTransform: 'uppercase' }}>Response</span>
                  {status !== null && (
                    <>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 12,
                        color: statusColor,
                        background: `${statusColor}18`,
                        padding: '3px 9px',
                        border: `1px solid ${statusColor}40`,
                      }}>{status}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--white3)' }}>{elapsed}ms</span>
                    </>
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

              {/* Response body */}
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
                    {activeCat !== 'system' ? activeCat.toUpperCase() : 'TEST'}
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

/* ── Page wrapper ───────────────────────────────────────────── */
export default function TesterPage() {
  return (
    <>
      <Navbar />
      <div className="page" style={{ background: 'var(--bg)', paddingTop: 60 }}>
        {/* Page header */}
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
