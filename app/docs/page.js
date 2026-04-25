import Navbar from '../../components/layout/Navbar';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────
// ENDPOINT REFERENCE — sesuai struktur CATEGORIES di page tester
// ─────────────────────────────────────────────────────────────────
const ENDPOINTS = [
  { g: 'Anime', versions: [
    { label: 'v1 · Samehadaku', items: [
      { m: 'GET', path: '/api/anime/search',    params: [{ n: 'q', req: true, d: 'Keyword pencarian (contoh: naruto)' }, { n: 'page', req: false, d: 'Nomor halaman (default: 1)' }] },
      { m: 'GET', path: '/api/anime/latest',    params: [{ n: 'page', req: false, d: 'Nomor halaman (default: 1)' }] },
      { m: 'GET', path: '/api/anime/popular',   params: [{ n: 'page', req: false, d: 'Nomor halaman (default: 1)' }] },
      { m: 'GET', path: '/api/anime/listgenre', params: [] },
      { m: 'GET', path: '/api/anime/schedule',  params: [{ n: 'day', req: false, d: 'Monday | Tuesday | Wednesday | Thursday | Friday | Saturday | Sunday' }] },
      { m: 'GET', path: '/api/anime/batch',     params: [{ n: 'page', req: false, d: 'Nomor halaman (default: 1)' }] },
      { m: 'GET', path: '/api/anime/detail',    params: [{ n: 'slug', req: true, d: 'Slug anime (contoh: one-punch-man)' }] },
      { m: 'GET', path: '/api/anime/watch',     params: [{ n: 'slug', req: true, d: 'Slug episode (contoh: one-punch-man-episode-12)' }, { n: 'mirror', req: false, d: 'Nomor mirror/server (default: semua)' }] },
    ]},
    { label: 'v2 · Otakudesu', items: [
      { m: 'GET', path: '/api/v2/anime/search',  params: [{ n: 'q', req: true, d: 'Keyword pencarian' }, { n: 'page', req: false, d: 'Nomor halaman (default: 1)' }] },
      { m: 'GET', path: '/api/v2/anime/latest',  params: [{ n: 'page', req: false, d: 'Nomor halaman (default: 1)' }] },
      { m: 'GET', path: '/api/v2/anime/popular', params: [{ n: 'page', req: false, d: 'Nomor halaman (default: 1)' }] },
      { m: 'GET', path: '/api/v2/anime/detail',  params: [{ n: 'slug', req: true, d: 'Slug anime' }] },
      { m: 'GET', path: '/api/v2/anime/watch',   params: [{ n: 'slug', req: true, d: 'Slug episode' }] },
    ]},
  ]},
  { g: 'Manga', versions: [
    { label: 'v1 · Komikstation', items: [
      { m: 'GET', path: '/api/manga/search',    params: [{ n: 'q', req: true, d: 'Keyword pencarian' }, { n: 'page', req: false, d: 'Nomor halaman (default: 1)' }] },
      { m: 'GET', path: '/api/manga/latest',    params: [{ n: 'page', req: false, d: 'Nomor halaman (default: 1)' }] },
      { m: 'GET', path: '/api/manga/popular',   params: [{ n: 'page', req: false, d: 'Nomor halaman (default: 1)' }] },
      { m: 'GET', path: '/api/manga/new',       params: [{ n: 'page', req: false, d: 'Nomor halaman (default: 1)' }] },
      { m: 'GET', path: '/api/manga/listgenre', params: [] },
      { m: 'GET', path: '/api/manga/az',        params: [{ n: 'page', req: false, d: 'Nomor halaman (default: 1)' }] },
      { m: 'GET', path: '/api/manga/detail',    params: [{ n: 'slug', req: true, d: 'Slug manga (contoh: one-punch-man)' }] },
      { m: 'GET', path: '/api/manga/read',      params: [{ n: 'slug', req: true, d: 'Slug chapter (contoh: one-punch-man-chapter-228)' }] },
    ]},
  ]},
  { g: 'Manhua', versions: [
    { label: 'v1 · Manhwaland', items: [
      { m: 'GET', path: '/api/manhua/search',  params: [{ n: 'q', req: true, d: 'Keyword pencarian' }] },
      { m: 'GET', path: '/api/manhua/popular', params: [] },
      { m: 'GET', path: '/api/manhua/latest',  params: [] },
      { m: 'GET', path: '/api/manhua/project', params: [{ n: 'page', req: false, d: 'Nomor halaman (default: 1)' }] },
      { m: 'GET', path: '/api/manhua/detail',  params: [{ n: 'slug', req: true, d: 'Slug manhua/manhwa' }] },
      { m: 'GET', path: '/api/manhua/chapter', params: [{ n: 'slug', req: true, d: 'Slug chapter' }] },
    ]},
  ]},
  { g: 'Donghua', versions: [
    { label: 'v1 · Kuramanime', items: [
      { m: 'GET', path: '/api/donghua/search',   params: [{ n: 'q', req: true, d: 'Keyword pencarian' }] },
      { m: 'GET', path: '/api/donghua/latest',   params: [] },
      { m: 'GET', path: '/api/donghua/popular',  params: [] },
      { m: 'GET', path: '/api/donghua/detail',   params: [{ n: 'slug', req: true, d: 'Slug episode donghua' }] },
      { m: 'GET', path: '/api/donghua/episodes', params: [{ n: 'slug', req: true, d: 'Slug donghua' }] },
      { m: 'GET', path: '/api/donghua/schedule', params: [] },
      { m: 'GET', path: '/api/donghua/genres',   params: [{ n: 'genre', req: false, d: 'Filter genre (contoh: action)' }] },
    ]},
    { label: 'v2 · Provider B', items: [
      { m: 'GET', path: '/api/v2/donghua/search',  params: [{ n: 'q', req: true, d: 'Keyword pencarian' }] },
      { m: 'GET', path: '/api/v2/donghua/latest',  params: [] },
      { m: 'GET', path: '/api/v2/donghua/popular', params: [] },
    ]},
  ]},
  { g: 'System', versions: [
    { label: 'Public', items: [
      { m: 'GET', path: '/api/status', params: [{ n: 'refresh', req: false, d: 'true = force re-check semua provider' }] },
      { m: 'GET', path: '/api/health', params: [{ n: 'mode', req: false, d: 'summary | errors | history' }] },
    ]},
  ]},
];

// ─────────────────────────────────────────────────────────────────
// RESPONSE FORMAT — standar semua endpoint
// ─────────────────────────────────────────────────────────────────
const RESPONSE_EXAMPLE = `{
  "status"  : "success",
  "source"  : "gateway",
  "data"    : { ... },          // hasil dari provider
  "metadata": {
    "total"     : 1,
    "page"      : 1,
    "from_cache": false,
    "timestamp" : "2026-04-25T17:52:05.604Z"
  }
}`;

// ─────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────
function SectionNum({ n, label }) {
  return (
    <div style={{ padding: '14px 0', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 56 }}>
      <span className="sec-num">{n}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', letterSpacing: '0.12em' }}>{label}</span>
    </div>
  );
}

function CodeBox({ code }) {
  return (
    <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--white2)', fontWeight: 300, lineHeight: 1.85, background: 'var(--bg)', border: '1px solid var(--border)', padding: '20px 24px', overflowX: 'auto', marginTop: 12 }}>
      {code}
    </pre>
  );
}

function VersionBadge({ label }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 9,
      color: 'var(--white3)', border: '1px solid var(--border)',
      padding: '2px 8px', letterSpacing: '0.08em',
      marginBottom: 12, display: 'inline-block',
    }}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────
export default function DocsPage() {
  return (
    <>
      <Navbar />
      <div className="page" style={{ background: 'var(--bg)' }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{ borderBottom: '1px solid var(--border)', padding: 'clamp(24px,5vw,40px) clamp(20px,5vw,48px) 28px' }}>
          <div className="label" style={{ marginBottom: 10 }}>Reference</div>
          <h1 className="display" style={{ fontSize: 'clamp(36px,7vw,80px)' }}>Documentation</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', marginTop: 10, letterSpacing: '0.1em', maxWidth: 500 }}>
            ANIME · MANGA · MANHUA · DONGHUA — MULTI PROVIDER API GATEWAY
          </p>
        </div>

        <div style={{ padding: 'clamp(32px,6vw,56px) clamp(20px,5vw,48px)' }}>

          {/* ── Overview ─────────────────────────────────────── */}
          <div className="label" style={{ marginBottom: 16 }}>Overview</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 1, marginBottom: 0 }}>
            {[
              { label: 'Base URL',       value: 'https://your-domain.com' },
              { label: 'Format',         value: 'JSON — semua response' },
              { label: 'Auth',           value: 'X-API-Key header (opsional)' },
              { label: 'Rate Limit',     value: '60 req/min · 200 req/min with key' },
              { label: 'Caching',        value: '2–60 menit tergantung endpoint' },
              { label: 'Multi Provider', value: 'v1, v2, dst per kategori' },
            ].map(x => (
              <div key={x.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '18px 20px' }}>
                <div className="label" style={{ marginBottom: 6, fontSize: 9 }}>{x.label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--white2)' }}>{x.value}</div>
              </div>
            ))}
          </div>

          <SectionNum n=".01" label="OVERVIEW" />

          {/* ── Response Format ───────────────────────────────── */}
          <div style={{ marginTop: 32 }}>
            <div className="label" style={{ marginBottom: 12 }}>Response Format</div>
            <p style={{ color: 'var(--white2)', fontSize: 14, lineHeight: 1.7, marginBottom: 0 }}>
              Semua endpoint mengembalikan format JSON yang konsisten. Field <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--white)', background: 'var(--bg)', padding: '1px 5px' }}>data</code> berisi hasil dari provider, sedangkan <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--white)', background: 'var(--bg)', padding: '1px 5px' }}>metadata</code> berisi info cache dan paginasi.
            </p>
            <CodeBox code={RESPONSE_EXAMPLE} />

            {/* Cache info */}
            <div style={{ marginTop: 20, background: 'var(--bg2)', border: '1px solid var(--border)', borderLeft: '3px solid var(--white)', padding: 'clamp(14px,3vw,24px)' }}>
              <div className="label" style={{ marginBottom: 10, fontSize: 9 }}>Cache Duration per Endpoint</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                {[
                  { ep: 'search / popular / batch', ttl: '10 menit' },
                  { ep: 'latest / watch',            ttl: '5–10 menit' },
                  { ep: 'detail',                    ttl: '10 menit' },
                  { ep: 'schedule',                  ttl: '10 menit' },
                  { ep: 'genres / listgenre',        ttl: '1 jam' },
                ].map(x => (
                  <div key={x.ep} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--white3)' }}>{x.ep}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--white2)', flexShrink: 0 }}>{x.ttl}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <SectionNum n=".02" label="RESPONSE FORMAT" />

          {/* ── Endpoint Reference ────────────────────────────── */}
          <div style={{ marginTop: 32 }}>
            <div className="label" style={{ marginBottom: 20 }}>Endpoint Reference</div>
            {ENDPOINTS.map(group => (
              <div key={group.g} style={{ marginBottom: 48 }}>
                {/* Category title */}
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, textTransform: 'uppercase', color: 'var(--white2)', marginBottom: 16 }}>
                  {group.g}
                </div>

                {group.versions.map(ver => (
                  <div key={ver.label} style={{ marginBottom: 24 }}>
                    <VersionBadge label={ver.label} />

                    {ver.items.map(ep => (
                      <div key={ep.path} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 'clamp(14px,3vw,22px)', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: ep.params.length > 0 ? 16 : 0, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--white)', background: 'var(--surface)', padding: '4px 10px', border: '1px solid var(--border2)', letterSpacing: '0.1em', flexShrink: 0 }}>{ep.m}</span>
                          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(12px,2vw,14px)', color: 'var(--white)', wordBreak: 'break-all' }}>{ep.path}</code>
                          <Link
                            href={`/tester?path=${encodeURIComponent(ep.path)}`}
                            className="btn btn-ghost btn-sm"
                            style={{ marginLeft: 'auto', flexShrink: 0 }}
                          >
                            Try →
                          </Link>
                        </div>

                        {ep.params.length > 0 && (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12, minWidth: 360 }}>
                              <thead>
                                <tr>{['Parameter', 'Required', 'Description'].map(h => (
                                  <th key={h} style={{ textAlign: 'left', padding: '6px 12px', color: 'var(--white3)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                                ))}</tr>
                              </thead>
                              <tbody>
                                {ep.params.map(p => (
                                  <tr key={p.n} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '10px 12px', color: 'var(--white)', fontWeight: 400 }}>{p.n}</td>
                                    <td style={{ padding: '10px 12px', color: p.req ? 'var(--green)' : 'var(--white3)' }}>{p.req ? '✓ yes' : 'optional'}</td>
                                    <td style={{ padding: '10px 12px', color: 'var(--white2)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>{p.d}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <SectionNum n=".03" label="ENDPOINT REFERENCE" />

          {/* ── Error Codes ───────────────────────────────────── */}
          <div style={{ marginTop: 32 }}>
            <div className="label" style={{ marginBottom: 16 }}>Error Codes</div>
            {[
              [400, 'Bad Request',         'Parameter query tidak lengkap atau tidak valid'],
              [401, 'Unauthorized',        'API key tidak valid atau tidak disertakan'],
              [404, 'Not Found',           'Anime / manga / episode tidak ditemukan'],
              [429, 'Rate Limited',        'Terlalu banyak request. Cek header Retry-After'],
              [500, 'Internal Error',      'Error internal pada gateway'],
              [502, 'Bad Gateway',         'Semua provider gagal diakses'],
              [503, 'Service Unavailable', 'Provider sedang dinonaktifkan'],
            ].map(([code, label, desc]) => (
              <div key={code} style={{ display: 'flex', alignItems: 'baseline', gap: 'clamp(12px,3vw,24px)', padding: '14px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(18px,3vw,24px)', color: 'var(--red)', minWidth: 48 }}>{code}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(13px,2vw,15px)', textTransform: 'uppercase', minWidth: 160 }}>{label}</span>
                <span style={{ color: 'var(--white3)', fontSize: 13, fontWeight: 300 }}>{desc}</span>
              </div>
            ))}
          </div>

          <SectionNum n=".04" label="ERROR REFERENCE" />

          {/* ── Contact ───────────────────────────────────────── */}
          <div style={{ marginTop: 32 }}>
            <div className="label" style={{ marginBottom: 16 }}>Contact & Support</div>
            <p style={{ color: 'var(--white2)', fontSize: 14, lineHeight: 1.75, marginBottom: 24, maxWidth: 560 }}>
              Ada pertanyaan, bug, atau ingin request fitur? Hubungi owner melalui salah satu platform di bawah.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 1 }}>
              {[
                {
                  platform : 'Telegram',
                  handle   : '@your_telegram_id',
                  link     : 'https://t.me/your_telegram_id',
                  note     : 'Respon lebih cepat via Telegram',
                },
                {
                  platform : 'Discord',
                  handle   : 'your_discord_username',
                  link     : null,
                  note     : 'Username Discord — add friend dulu',
                },
              ].map(c => (
                <div key={c.platform} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 'clamp(16px,3vw,24px)' }}>
                  <div className="label" style={{ marginBottom: 8, fontSize: 9 }}>{c.platform.toUpperCase()}</div>
                  {c.link ? (
                    <a
                      href={c.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--white)', textDecoration: 'none', display: 'block', marginBottom: 6 }}
                    >
                      {c.handle} ↗
                    </a>
                  ) : (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--white)', marginBottom: 6 }}>
                      {c.handle}
                    </div>
                  )}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white4)' }}>{c.note}</div>
                </div>
              ))}
            </div>
          </div>

          <SectionNum n=".05" label="CONTACT" />
        </div>

        {/* Footer */}
        <div style={{ padding: '14px clamp(20px,5vw,48px)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span className="sec-num">.06</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', letterSpacing: '0.12em' }}>DOCUMENTATION</span>
        </div>
      </div>
    </>
  );
}
