'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '../components/layout/Navbar';

const CATEGORIES = [
  {
    key: 'anime',
    label: 'Anime',
    sub: 'Japanese Animation',
    count: '3 providers',
    img: 'https://files.catbox.moe/7ipdhn.jpg',
  },
  {
    key: 'manga',
    label: 'Manga',
    sub: 'Japanese Comics',
    count: '2 providers',
    img: 'https://files.catbox.moe/r404th.jpg',
  },
  {
    key: 'manhua',
    label: 'Manhua',
    sub: 'Chinese Comics',
    count: '2 providers',
    img: 'https://files.catbox.moe/pqmjmo.jpg',
  },
  {
    key: 'donghua',
    label: 'Donghua',
    sub: 'Chinese Animation',
    count: '1 provider',
    img: 'https://files.catbox.moe/rc9ubf.jpg',
  },
];

const TICKER_ITEMS = [
  'ANIME SEARCH', '—', 'MANGA SEARCH', '—', 'MANHUA SEARCH', '—', 'DONGHUA SEARCH', '—',
  'LIVE HEALTH CHECK', '—', 'RATE LIMITING', '—', 'AUTO RETRY', '—', 'REDIS CACHE', '—',
  'API TESTER', '—', 'STATUS PAGE', '—', 'ERROR LOGGING', '—', 'VERCEL READY', '—',
];

function useScrollProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const fn = () => {
      const el = document.documentElement;
      setPct((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100 || 0);
    };
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);
  return pct;
}

function syntaxHighlight(obj) {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, m => {
    let cls = 'json-number';
    if (/^"/.test(m)) cls = /:$/.test(m) ? 'json-key' : 'json-string';
    else if (/true|false/.test(m)) cls = 'json-bool';
    else if (/null/.test(m)) cls = 'json-null';
    return `<span class="${cls}">${m}</span>`;
  });
}

export default function Home() {
  const scrollPct = useScrollProgress();
  const [statuses, setStatuses] = useState([]);
  const [hov, setHov] = useState(null);

  useEffect(() => {
    fetch('/api/status')
      .then(r => r.json())
      .then(j => { if (j.status === 'success') setStatuses(j.data?.apis || []); })
      .catch(() => {});
  }, []);

  const online = statuses.filter(s => s.status === 'online').length;
  const total  = statuses.length;
  const tickerStr = TICKER_ITEMS.join('  ');

  return (
    <>
      <Navbar />

      {/* Fixed decorative chrome — desktop only */}
      <div className="side-socials">
        <a href="https://github.com" target="_blank" rel="noreferrer" className="side-link">GitHub</a>
        <a href="/docs" className="side-link">Docs</a>
      </div>
      <div className="scroll-indicator">
        <div className="scroll-bar">
          <div className="scroll-prog" style={{ height: `${scrollPct}%` }} />
        </div>
        <span className="scroll-label">Scroll</span>
      </div>

      <main style={{ background: 'var(--bg)' }}>

        {/* ══ .01  HERO ═════════════════════════════════════════ */}
        <section style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'clamp(100px,12vw,160px) clamp(20px,5vw,48px) clamp(40px,6vw,80px)' }}>

            {/* Platform label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'clamp(24px,4vw,40px)' }}>
              <span className="label">API Platform</span>
              <span style={{ width: 28, height: 1, background: 'var(--border2)' }} />
              {total > 0 && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', letterSpacing: '0.1em' }}>
                  {online}/{total} ONLINE
                </span>
              )}
            </div>

            {/* Giant headline */}
            <h1 className="display" style={{ fontSize: 'clamp(56px,14vw,180px)', color: 'var(--white)', marginBottom: 0, lineHeight: 0.88 }}>
              Anime
            </h1>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 'clamp(20px,4vw,32px)' }}>
              <h1 className="display" style={{ fontSize: 'clamp(56px,14vw,180px)', color: 'var(--white)' }}>
                Gate
              </h1>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--white3)', marginBottom: 'clamp(8px,2vw,20px)', letterSpacing: '0.1em' }}>v1.0</span>
            </div>

            <div style={{ width: '100%', height: 1, background: 'var(--border)', marginBottom: 'clamp(20px,4vw,32px)' }} />

            {/* Sub row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
              <p style={{ fontSize: 'clamp(13px,2vw,15px)', color: 'var(--white2)', fontWeight: 300, maxWidth: 420, lineHeight: 1.7 }}>
                Unified gateway for anime, manga, manhua & donghua — with real-time health monitoring, smart caching, and a built-in API tester.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                <Link href="/tester" className="btn btn-fill">Try API Tester →</Link>
                <Link href="/docs" className="btn">Documentation</Link>
              </div>
            </div>
          </div>

          <div style={{ padding: '14px clamp(20px,5vw,48px)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span className="sec-num">.01</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', letterSpacing: '0.1em' }}>STREAMING CONTENT API GATEWAY</span>
          </div>
        </section>

        {/* ══ Ticker ═════════════════════════════════════════════ */}
        <div className="ticker-wrap">
          <div className="ticker-track">
            {[...Array(3)].map((_, ri) => (
              <span key={ri} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--white3)', paddingRight: 48 }}>
                {tickerStr}&nbsp;&nbsp;&nbsp;
              </span>
            ))}
          </div>
        </div>

        {/* ══ .02  CATEGORIES with BG images ════════════════════ */}
        <section style={{ borderBottom: '1px solid var(--border)' }}>
          {/* Responsive grid: 4 cols desktop → 2×2 tablet → 1 col mobile */}
          <style>{`
            .cat-grid { display: grid; grid-template-columns: repeat(4, 1fr); }
            .cat-item { border-right: 1px solid var(--border); }
            .cat-item:last-child { border-right: none; }
            @media(max-width:900px){
              .cat-grid { grid-template-columns: repeat(2,1fr); }
              .cat-item:nth-child(2) { border-right: none; }
              .cat-item:nth-child(3) { border-top: 1px solid var(--border); }
            }
            @media(max-width:480px){
              .cat-grid { grid-template-columns: 1fr; }
              .cat-item { border-right: none !important; border-top: 1px solid var(--border); }
              .cat-item:first-child { border-top: none; }
            }
          `}</style>
          <div className="cat-grid">
            {CATEGORIES.map((cat, i) => (
              <Link
                key={cat.key}
                href={`/tester?path=/api/${cat.key}/search`}
                className="cat-item"
                onMouseEnter={() => setHov(i)}
                onMouseLeave={() => setHov(null)}
                style={{
                  position: 'relative',
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  minHeight: 'clamp(220px, 28vw, 360px)',
                  overflow: 'hidden',
                }}
              >
                {/* Background image */}
                <div style={{
                  position: 'absolute', inset: 0,
                  backgroundImage: `url(${cat.img})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: hov === i ? 'brightness(0.35) grayscale(0.3)' : 'brightness(0.18) grayscale(0.6)',
                  transition: 'filter .4s ease',
                }} />

                {/* Gradient overlay */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(to top, rgba(12,12,12,0.95) 0%, rgba(12,12,12,0.3) 60%, transparent 100%)',
                }} />

                {/* Content */}
                <div style={{ position: 'relative', padding: 'clamp(16px,3vw,28px)' }}>
                  <div className="display" style={{
                    fontSize: 'clamp(24px,4vw,44px)',
                    color: hov === i ? 'var(--white)' : 'var(--white2)',
                    transition: 'color .2s',
                    marginBottom: 4,
                  }}>
                    {cat.label}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--white3)', letterSpacing: '0.12em', marginBottom: 12 }}>
                    {cat.sub}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--white3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      {cat.count}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: hov === i ? 'var(--white)' : 'var(--white3)', transition: 'color .2s' }}>→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div style={{ padding: '14px clamp(20px,5vw,48px)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span className="sec-num">.02</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', letterSpacing: '0.1em' }}>CONTENT CATEGORIES</span>
          </div>
        </section>

        {/* ══ .03  LIVE STATUS ══════════════════════════════════ */}
        <section style={{ borderBottom: '1px solid var(--border)' }}>
          <div style={{ padding: 'clamp(40px,7vw,80px) clamp(20px,5vw,48px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 'clamp(28px,5vw,48px)', flexWrap: 'wrap', gap: 20 }}>
              <div>
                <div className="label" style={{ marginBottom: 10 }}>Live Status</div>
                <h2 className="display" style={{ fontSize: 'clamp(32px,6vw,72px)' }}>API Health</h2>
              </div>
              <div style={{ display: 'flex', gap: 'clamp(16px,4vw,40px)', flexWrap: 'wrap' }}>
                {[
                  { v: statuses.filter(s => s.status === 'online').length,  l: 'Online',  c: 'var(--green)' },
                  { v: statuses.filter(s => s.status === 'warning').length, l: 'Warning', c: 'var(--yellow)' },
                  { v: statuses.filter(s => s.status === 'down').length,    l: 'Down',    c: 'var(--red)' },
                ].map(x => (
                  <div key={x.l} style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(28px,5vw,40px)', color: x.c, lineHeight: 1 }}>{x.v}</div>
                    <div className="label" style={{ marginTop: 4 }}>{x.l}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {statuses.slice(0, 6).map((api, i) => (
                <div key={api.id} style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px,2vw,20px)', padding: '14px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', minWidth: 22 }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(14px,2.5vw,18px)', textTransform: 'uppercase', minWidth: 120 }}>{api.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', minWidth: 56 }}>{api.category}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', minWidth: 52 }}>
                    {api.response_time > 0 ? `${api.response_time}ms` : '—'}
                  </span>
                  <span className={`badge badge-${api.status}`}>
                    <span className={`dot dot-${api.status}`} />{api.status}
                  </span>
                </div>
              ))}
              {statuses.length === 0 && (
                <div style={{ padding: '40px 0', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--white3)' }}>Loading…</div>
              )}
            </div>

            <div style={{ marginTop: 28, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/status" className="btn">Full Status Page →</Link>
              <Link href="/dashboard" className="btn btn-ghost">Dashboard</Link>
            </div>
          </div>

          <div style={{ padding: '14px clamp(20px,5vw,48px)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span className="sec-num">.03</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', letterSpacing: '0.1em' }}>LIVE HEALTH MONITORING</span>
          </div>
        </section>

        {/* ══ .04  ENDPOINTS ═════════════════════════════════════ */}
        <section style={{ borderBottom: '1px solid var(--border)' }}>
          <div style={{ padding: 'clamp(40px,7vw,80px) clamp(20px,5vw,48px)' }}>
            <div className="label" style={{ marginBottom: 10 }}>API Reference</div>
            <h2 className="display" style={{ fontSize: 'clamp(32px,6vw,72px)', marginBottom: 'clamp(28px,5vw,48px)' }}>Endpoints</h2>

            {[
              { m: 'GET', path: '/api/anime/search',   desc: 'Search anime across providers',  p: '?q=naruto&provider=jikan-anime' },
              { m: 'GET', path: '/api/anime/trending', desc: 'Get top airing anime',           p: '?provider=jikan-anime' },
              { m: 'GET', path: '/api/manga/search',   desc: 'Search manga on MangaDex',       p: '?q=one+piece' },
              { m: 'GET', path: '/api/manhua/search',  desc: 'Search manhua',                  p: '?q=solo+leveling' },
              { m: 'GET', path: '/api/donghua/search', desc: 'Search donghua',                 p: '?q=btth' },
              { m: 'GET', path: '/api/status',         desc: 'All API health statuses',        p: '' },
            ].map(e => (
              <div key={e.path} style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px,2vw,20px)', padding: '14px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, color: 'var(--white)', background: 'var(--surface)', padding: '3px 8px', border: '1px solid var(--border2)', letterSpacing: '0.1em', minWidth: 40, textAlign: 'center', flexShrink: 0 }}>{e.m}</span>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(11px,2vw,13px)', color: 'var(--white)', flex: 1, minWidth: 160, wordBreak: 'break-all' }}>{e.path}</code>
                <span style={{ fontSize: 13, color: 'var(--white3)', flex: 1, minWidth: 140 }}>{e.desc}</span>
                <Link href={`/tester?path=${encodeURIComponent(e.path + e.p)}`} className="btn btn-sm btn-ghost" style={{ flexShrink: 0 }}>Try →</Link>
              </div>
            ))}
          </div>

          <div style={{ padding: '14px clamp(20px,5vw,48px)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span className="sec-num">.04</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', letterSpacing: '0.1em' }}>AVAILABLE ENDPOINTS</span>
          </div>
        </section>

        {/* ══ .05  RESPONSE FORMAT ══════════════════════════════ */}
        <section style={{ borderBottom: '1px solid var(--border)' }}>
          <style>{`
            .resp-grid { display: grid; grid-template-columns: 1fr 1fr; }
            .resp-left { border-right: 1px solid var(--border); }
            @media(max-width:700px){ .resp-grid { grid-template-columns: 1fr; } .resp-left { border-right: none; border-bottom: 1px solid var(--border); } }
          `}</style>
          <div className="resp-grid">
            <div className="resp-left" style={{ padding: 'clamp(32px,6vw,64px) clamp(20px,5vw,48px)' }}>
              <div className="label" style={{ marginBottom: 12, color: 'var(--green)' }}>Success</div>
              <pre className="code-block" dangerouslySetInnerHTML={{ __html: syntaxHighlight({ status: 'success', source: 'jikan-anime', data: ['...'], metadata: { total: 25, page: 1, from_cache: false } }) }} />
            </div>
            <div style={{ padding: 'clamp(32px,6vw,64px) clamp(20px,5vw,48px)' }}>
              <div className="label" style={{ marginBottom: 12, color: 'var(--red)' }}>Error</div>
              <pre className="code-block" dangerouslySetInnerHTML={{ __html: syntaxHighlight({ status: 'error', code: 429, message: 'Rate limit exceeded', details: { retry_after: 42 } }) }} />
            </div>
          </div>

          <div style={{ padding: '14px clamp(20px,5vw,48px)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span className="sec-num">.05</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', letterSpacing: '0.1em' }}>RESPONSE CONTRACTS</span>
          </div>
        </section>

        {/* ══ Footer ════════════════════════════════════════════ */}
        <footer style={{ padding: 'clamp(28px,5vw,48px) clamp(20px,5vw,48px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div className="display" style={{ fontSize: 'clamp(20px,5vw,60px)', color: 'var(--border2)' }}>ANIMEGATE</div>
          <div style={{ textAlign: 'right' }}>
            <div className="label" style={{ marginBottom: 4 }}>The End</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--white3)' }}>Next.js 14 · Vercel Ready</div>
          </div>
        </footer>
      </main>
    </>
  );
}
