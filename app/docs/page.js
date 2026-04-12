import Navbar from '../../components/layout/Navbar';
import Link from 'next/link';

const ENDPOINTS = [
  { g: 'Anime', items: [
    { m: 'GET', path: '/api/anime/search',   params: [{ n: 'q', req: true, d: 'Search query (e.g. naruto)' }, { n: 'provider', req: false, d: 'jikan-anime | consumet-anime | anilist-anime' }, { n: 'page', req: false, d: 'Page number (default: 1)' }] },
    { m: 'GET', path: '/api/anime/trending', params: [{ n: 'provider', req: false, d: 'jikan-anime' }, { n: 'page', req: false, d: 'Page number' }] },
  ]},
  { g: 'Manga', items: [
    { m: 'GET', path: '/api/manga/search',   params: [{ n: 'q', req: true, d: 'Search query' }, { n: 'provider', req: false, d: 'mangadex | consumet-manga' }] },
  ]},
  { g: 'Manhua', items: [
    { m: 'GET', path: '/api/manhua/search',  params: [{ n: 'q', req: true, d: 'Search query' }, { n: 'provider', req: false, d: 'manganato-manhua' }] },
  ]},
  { g: 'Donghua', items: [
    { m: 'GET', path: '/api/donghua/search', params: [{ n: 'q', req: true, d: 'Search query' }, { n: 'provider', req: false, d: 'consumet-donghua' }] },
  ]},
  { g: 'System (Public)', items: [
    { m: 'GET', path: '/api/status',  params: [{ n: 'id', req: false, d: 'Specific API id to query' }, { n: 'refresh', req: false, d: 'true = force live re-check' }] },
    { m: 'GET', path: '/api/health', params: [{ n: 'mode', req: false, d: 'summary | errors | history' }, { n: 'id', req: false, d: 'API id (required for history mode)' }] },
  ]},
];

function SectionNum({ n, label }) {
  return (
    <div style={{ padding: '14px 0', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 48 }}>
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

export default function DocsPage() {
  return (
    <>
      <Navbar />
      <div className="page" style={{ background: 'var(--bg)' }}>

        {/* Header */}
        <div style={{ borderBottom: '1px solid var(--border)', padding: 'clamp(24px,5vw,40px) clamp(20px,5vw,48px) 28px' }}>
          <div className="label" style={{ marginBottom: 10 }}>Reference</div>
          <h1 className="display" style={{ fontSize: 'clamp(36px,7vw,80px)' }}>Documentation</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', marginTop: 10, letterSpacing: '0.1em', maxWidth: 500 }}>
            RATE LIMIT: 60 REQ/MIN PER IP — 200 REQ/MIN WITH API KEY (X-API-KEY HEADER)
          </p>
        </div>

        <div style={{ padding: 'clamp(32px,6vw,56px) clamp(20px,5vw,48px)' }}>

          {/* ── Quick Start ──────────────────────────────────── */}
          <div className="label" style={{ marginBottom: 16 }}>Quick Start</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 1, marginBottom: 0 }}>
            {[
              { l: 'cURL', code: `curl "https://your-domain.com/api/anime/search?q=naruto"` },
              { l: 'JavaScript (fetch)', code: `const res = await fetch('/api/anime/search?q=naruto');
const { status, data, metadata } = await res.json();
console.log(data);` },
              { l: 'With API Key', code: `fetch('/api/anime/search?q=naruto', {
  headers: { 'X-API-Key': 'your-key-here' }
})` },
              { l: 'Python', code: `import requests
r = requests.get(
  'https://your-domain.com/api/anime/search',
  params={'q': 'naruto'}
)
print(r.json())` },
            ].map(x => (
              <div key={x.l} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 20 }}>
                <div className="label" style={{ marginBottom: 8 }}>{x.l}</div>
                <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--white2)', fontWeight: 300, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{x.code}</pre>
              </div>
            ))}
          </div>

          <SectionNum n=".01" label="GETTING STARTED" />

          {/* ── Add new provider ─────────────────────────────── */}
          <div style={{ marginTop: 32 }}>
            <div className="label" style={{ marginBottom: 12 }}>Adding a New API Provider</div>
            <p style={{ color: 'var(--white2)', fontSize: 14, lineHeight: 1.7, marginBottom: 12 }}>
              Open <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)', background: 'var(--bg3)', padding: '2px 6px', fontSize: 12 }}>lib/api-registry.js</code> and add a new object to the array. No other files need to be changed — the health checker, status page, dashboard, and tester all auto-detect it.
            </p>
            <CodeBox code={`// lib/api-registry.js
{
  id: 'my-new-provider',          // unique, snake_case
  category: 'anime',              // anime | manga | manhua | donghua
  provider: 'my-provider',        // short provider name
  label: 'My New Provider',       // display name
  baseUrl: 'https://api.example.com',
  endpoints: {
    search: '/search?q={query}',  // {placeholders} replaced automatically
    info:   '/info/{id}',
  },
  rateLimit: { requests: 60, window: 60 },
  timeout: 8000,                  // ms
  enabled: true,
  tags: ['sub', 'hd'],
}`} />
          </div>

          <SectionNum n=".02" label="ADDING PROVIDERS" />

          {/* ── Endpoint reference ───────────────────────────── */}
          <div style={{ marginTop: 32 }}>
            <div className="label" style={{ marginBottom: 20 }}>Endpoint Reference</div>
            {ENDPOINTS.map(group => (
              <div key={group.g} style={{ marginBottom: 40 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, textTransform: 'uppercase', color: 'var(--white2)', marginBottom: 12 }}>{group.g}</div>
                {group.items.map(ep => (
                  <div key={ep.path} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 'clamp(16px,3vw,24px)', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--white)', background: 'var(--surface)', padding: '4px 10px', border: '1px solid var(--border2)', letterSpacing: '0.1em', flexShrink: 0 }}>{ep.m}</span>
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(12px,2vw,14px)', color: 'var(--white)', wordBreak: 'break-all' }}>{ep.path}</code>
                      <Link href={`/tester?path=${encodeURIComponent(ep.path)}`} className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', flexShrink: 0 }}>Try →</Link>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12, minWidth: 400 }}>
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
                  </div>
                ))}
              </div>
            ))}
          </div>

          <SectionNum n=".03" label="ENDPOINT REFERENCE" />

          {/* ── Admin Security Guide ─────────────────────────── */}
          <div style={{ marginTop: 32 }}>
            <div className="label" style={{ marginBottom: 12 }}>Admin Security</div>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderLeft: '3px solid var(--white)', padding: 'clamp(16px,3vw,28px)', marginBottom: 20 }}>
              <p style={{ color: 'var(--white2)', fontSize: 14, lineHeight: 1.75, marginBottom: 0 }}>
                Admin endpoints (<code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--white)' }}>/api/admin/*</code>) are protected by a secret key. Without it, all admin actions return <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--red)' }}>401 Unauthorized</code>. The secret is never stored in the frontend or exposed in any API response.
              </p>
            </div>

            {[
              {
                step: '1', title: 'Generate a strong secret',
                body: 'Use a random 32+ character string. You can generate one with:',
                code: `# macOS / Linux
openssl rand -hex 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
              },
              {
                step: '2', title: 'Set it as an environment variable',
                body: 'Add it to your deployment environment — never commit it to version control:',
                code: `# .env.local (local dev — never commit this file)
ADMIN_SECRET=your-generated-secret-here

# On Vercel:
# Dashboard → Project → Settings → Environment Variables
# Name: ADMIN_SECRET
# Value: your-generated-secret-here`,
              },
              {
                step: '3', title: 'Use it in the Dashboard',
                body: 'Go to /dashboard and enter the secret in the "Admin Secret" field at the top. The controls (Enable/Disable, Re-check) will unlock. The secret is only held in memory and never sent anywhere except as a request header to your own server.',
                code: null,
              },
              {
                step: '4', title: 'Use it via API directly',
                body: 'When calling admin endpoints from your own code, send the secret in the X-Admin-Secret header:',
                code: `curl -X POST https://your-domain.com/api/admin/restart \\
  -H "Content-Type: application/json" \\
  -H "X-Admin-Secret: your-secret-here" \\
  -d '{"id":"jikan-anime"}'`,
              },
            ].map(s => (
              <div key={s.step} style={{ marginBottom: 28, paddingBottom: 28, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', marginBottom: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', minWidth: 20 }}>{s.step}.</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, textTransform: 'uppercase' }}>{s.title}</span>
                </div>
                <p style={{ color: 'var(--white2)', fontSize: 13, lineHeight: 1.7, marginBottom: s.code ? 0 : 0, paddingLeft: 36 }}>{s.body}</p>
                {s.code && <div style={{ paddingLeft: 36 }}><CodeBox code={s.code} /></div>}
              </div>
            ))}
          </div>

          <SectionNum n=".04" label="ADMIN SECURITY" />

          {/* ── Error codes ───────────────────────────────────── */}
          <div style={{ marginTop: 32 }}>
            <div className="label" style={{ marginBottom: 16 }}>Error Codes</div>
            {[
              [400, 'Bad Request',        'Missing or invalid query parameters'],
              [401, 'Unauthorized',       'Invalid or missing X-Admin-Secret header'],
              [403, 'Forbidden',          'Admin access not configured on server'],
              [404, 'Not Found',          'Provider or resource does not exist'],
              [429, 'Rate Limited',       'Too many requests. Check the Retry-After response header.'],
              [500, 'Internal Error',     'Gateway internal error'],
              [502, 'Bad Gateway',        'All upstream providers failed after retries'],
              [503, 'Service Unavailable','Provider is disabled by admin'],
            ].map(([code, label, desc]) => (
              <div key={code} style={{ display: 'flex', alignItems: 'baseline', gap: 'clamp(12px,3vw,24px)', padding: '14px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(18px,3vw,24px)', color: 'var(--red)', minWidth: 48 }}>{code}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(13px,2vw,15px)', textTransform: 'uppercase', minWidth: 160 }}>{label}</span>
                <span style={{ color: 'var(--white3)', fontSize: 13, fontWeight: 300 }}>{desc}</span>
              </div>
            ))}
          </div>

          <SectionNum n=".05" label="ERROR REFERENCE" />
        </div>

        <div style={{ padding: '14px clamp(20px,5vw,48px)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span className="sec-num">.06</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--white3)', letterSpacing: '0.12em' }}>DOCUMENTATION</span>
        </div>
      </div>
    </>
  );
}
