'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/',          num: '01', label: 'Home',       sub: 'Landing' },
  { href: '/dashboard', num: '02', label: 'Dashboard',  sub: 'Admin' },
  { href: '/status',    num: '03', label: 'Status',     sub: 'Health' },
  { href: '/tester',    num: '04', label: 'API Tester', sub: 'Tools' },
  { href: '/discover',  num: '05', label: 'Discover',   sub: 'Explore' },
  { href: '/docs',      num: '06', label: 'Docs',       sub: 'Reference' },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hov, setHov] = useState(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const currentSub = NAV_ITEMS.find(n => n.href === pathname)?.sub ?? 'API PLATFORM';

  return (
    <>
      <style>{`
        @media (max-width: 600px) {
          .nav-center-label { display: none !important; }
          .overlay-right-panel { display: none !important; }
          .overlay-grid { grid-template-columns: 1fr !important; }
          .overlay-nav { padding: 24px 24px !important; border-right: none !important; }
        }
      `}</style>

      {/* ── Top bar ──────────────────────────────────────────── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 clamp(16px, 4vw, 48px)',
        borderBottom: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`,
        background: scrolled ? 'rgba(12,12,12,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(14px)' : 'none',
        transition: 'all .3s',
      }}>

        {/* Stacked logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'grid', gridTemplateColumns: '1fr 1fr', width: 34, lineHeight: 1, flexShrink: 0 }}>
          {['AN', 'GA', 'IM', 'TE'].map((c, i) => (
            <span key={i} style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 13, letterSpacing: '0.04em', color: 'var(--white)', lineHeight: 1.25 }}>{c}</span>
          ))}
        </Link>

        {/* Center label — hidden on small mobile */}
        <span className="nav-center-label" style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--white3)',
        }}>
          {currentSub}
        </span>

        {/* Menu button */}
        <button
          onClick={() => setOpen(o => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          style={{
            background: 'none', border: '1px solid var(--border2)',
            color: 'var(--white)', fontFamily: 'var(--font-mono)',
            fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
            padding: '7px 14px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'border-color .2s, background .2s', flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--white)'; e.currentTarget.style.background = 'var(--white4)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'none'; }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 14 }}>
            <span style={{ height: 1, background: 'var(--white)', display: 'block', transform: open ? 'translateY(5px) rotate(45deg)' : 'none', transition: 'transform .25s', transformOrigin: 'center' }} />
            <span style={{ height: 1, background: 'var(--white)', display: 'block', opacity: open ? 0 : 1, transition: 'opacity .15s' }} />
            <span style={{ height: 1, background: 'var(--white)', display: 'block', transform: open ? 'translateY(-5px) rotate(-45deg)' : 'none', transition: 'transform .25s', transformOrigin: 'center' }} />
          </span>
          {open ? 'Close' : 'Menu'}
        </button>
      </header>

      {/* ── Full-screen overlay ───────────────────────────────── */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 190,
        background: 'var(--bg)',
        pointerEvents: open ? 'all' : 'none',
        opacity: open ? 1 : 0,
        transition: 'opacity .3s ease',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>
        {/* Spacer for top bar */}
        <div style={{ height: 60, borderBottom: '1px solid var(--border)', flexShrink: 0 }} />

        {/* Grid: nav list + info panel */}
        <div className="overlay-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0 }}>

          {/* Nav list */}
          <nav className="overlay-nav" style={{
            borderRight: '1px solid var(--border)',
            padding: 'clamp(24px,5vw,40px) clamp(24px,5vw,48px)',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
          }}>
            {NAV_ITEMS.map((item, i) => (
              <Link key={item.href} href={item.href}
                onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
                style={{
                  display: 'flex', alignItems: 'baseline', gap: 16,
                  padding: 'clamp(10px,2vw,14px) 0',
                  borderBottom: '1px solid var(--border)',
                  textDecoration: 'none',
                  paddingLeft: hov === i ? 10 : 0,
                  transition: 'padding-left .2s',
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--white3)', letterSpacing: '0.08em', minWidth: 22 }}>
                  .{item.num}
                </span>
                <span style={{
                  fontFamily: 'var(--font-display)', fontWeight: 900,
                  fontSize: 'clamp(22px,5vw,52px)', textTransform: 'uppercase',
                  color: pathname === item.href ? 'var(--white)' : hov === i ? 'var(--white)' : 'var(--white3)',
                  lineHeight: 1, transition: 'color .15s',
                }}>
                  {item.label}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--white3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginLeft: 'auto', flexShrink: 0 }}>
                  {item.sub}
                </span>
              </Link>
            ))}
          </nav>

          {/* Right info panel — hidden on small mobile */}
          <div className="overlay-right-panel" style={{
            padding: 'clamp(24px,5vw,40px) clamp(24px,5vw,48px)',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div>
              <div className="label" style={{ marginBottom: 12 }}>Platform</div>
              <div style={{
                fontFamily: 'var(--font-display)', fontWeight: 900,
                fontSize: 'clamp(48px,8vw,108px)', lineHeight: 0.88,
                color: 'var(--border2)', textTransform: 'uppercase',
                letterSpacing: '-0.02em', userSelect: 'none',
              }}>
                ANIME<br />GATE
              </div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 10 }}>Quick Endpoints</div>
              {['/api/status', '/api/anime/search?q=naruto', '/api/manga/search?q=one+piece'].map(ep => (
                <div key={ep} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--white3)', padding: '8px 0', borderBottom: '1px solid var(--border)', wordBreak: 'break-all' }}>{ep}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ padding: '16px clamp(20px,5vw,48px)', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
          <span className="label">© 2024 AnimeGateway</span>
          <span className="label">v1.0 — Production Ready</span>
        </div>
      </div>
    </>
  );
}
