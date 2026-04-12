'use client';
import { useState, useCallback, useRef } from 'react';
import Navbar from '../../components/layout/Navbar';
import Link from 'next/link';

const CATEGORIES = [
  { key:'anime',   label:'Anime',   provider:'jikan-anime' },
  { key:'manga',   label:'Manga',   provider:'mangadex' },
  { key:'manhua',  label:'Manhua',  provider:'manganato-manhua' },
  { key:'donghua', label:'Donghua', provider:'consumet-donghua' },
];

function useDebounce(fn, ms) {
  const timer = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), ms);
  }, [fn, ms]);
}

export default function DiscoverPage() {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('anime');
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});
  const [searched, setSearched] = useState(false);

  const doSearch = useCallback(async (q, cats) => {
    if (!q.trim()) return;
    setSearched(true);
    const toLookup = cats || CATEGORIES.map(c => c.key);
    await Promise.allSettled(
      toLookup.map(async catKey => {
        const cat = CATEGORIES.find(c => c.key === catKey);
        if (!cat) return;
        setLoading(p => ({ ...p, [catKey]: true }));
        try {
          const res = await fetch(`/api/${catKey}/search?q=${encodeURIComponent(q)}&provider=${cat.provider}`);
          const json = await res.json();
          setResults(p => ({ ...p, [catKey]: json.status === 'success' ? json.data : [] }));
        } catch {
          setResults(p => ({ ...p, [catKey]: [] }));
        } finally {
          setLoading(p => ({ ...p, [catKey]: false }));
        }
      })
    );
  }, []);

  const debouncedSearch = useDebounce(q => doSearch(q), 600);

  function handleChange(e) {
    setQuery(e.target.value);
    debouncedSearch(e.target.value);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') doSearch(query);
  }

  const currentResults = results[activeTab] || [];
  const isLoading = loading[activeTab];

  return (
    <>
      <Navbar />
      <div className="page" style={{ background:'var(--bg)' }}>

        {/* Hero search */}
        <div style={{ borderBottom:'1px solid var(--border)', padding:'64px 48px 48px' }}>
          <div className="label" style={{ marginBottom:12 }}>Discover</div>
          <h1 className="display" style={{ fontSize:'clamp(48px,9vw,100px)', marginBottom:40 }}>Search All</h1>

          {/* Big search input */}
          <div style={{ position:'relative', maxWidth:720 }}>
            <span style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', fontFamily:'var(--font-mono)', fontSize:18, color:'var(--white3)', pointerEvents:'none' }}>→</span>
            <input
              style={{
                background:'transparent', border:'none', borderBottom:'2px solid var(--white)',
                color:'var(--white)', fontFamily:'var(--font-display)', fontWeight:900,
                fontSize:'clamp(24px,4vw,48px)', textTransform:'uppercase', letterSpacing:'-0.01em',
                padding:'12px 48px 12px 36px', width:'100%', outline:'none',
                transition:'border-color .2s',
              }}
              placeholder="NARUTO…"
              value={query}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            {(loading.anime || loading.manga || loading.manhua || loading.donghua) && (
              <span className="spinner" style={{ position:'absolute', right:0, top:'50%', transform:'translateY(-50%)' }} />
            )}
          </div>

          <p style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--white3)', marginTop:12, letterSpacing:'0.1em' }}>
            TYPE TO SEARCH ACROSS ANIME · MANGA · MANHUA · DONGHUA
          </p>
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ padding:'0 48px' }}>
          {CATEGORIES.map(cat => {
            const count = results[cat.key]?.length;
            return (
              <button key={cat.key} className={`tab ${activeTab===cat.key?'active':''}`} onClick={() => setActiveTab(cat.key)}>
                {cat.label}
                {count !== undefined && <span style={{ marginLeft:6, fontFamily:'var(--font-mono)', fontSize:9, color:'var(--white3)' }}>({count})</span>}
                {loading[cat.key] && <span className="spinner" style={{ width:10,height:10,marginLeft:6 }} />}
              </button>
            );
          })}
        </div>

        {/* Results */}
        <div style={{ padding:'32px 48px', minHeight:400 }}>
          {!searched ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:300, gap:12 }}>
              <div className="display" style={{ fontSize:'clamp(48px,8vw,96px)', color:'var(--border2)', userSelect:'none' }}>SEARCH</div>
              <p className="label">Type something to discover content</p>
            </div>
          ) : isLoading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:60 }}><span className="spinner" style={{ width:28,height:28 }} /></div>
          ) : currentResults.length === 0 ? (
            <div style={{ padding:'48px 0', fontFamily:'var(--font-mono)', fontSize:12, color:'var(--white3)' }}>
              No results for "{query}" in {activeTab}
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {currentResults.slice(0,20).map((item, i) => {
                const title = item.title || item.title_english || item.attributes?.title?.en || 'Unknown';
                const meta  = [item.type, item.year, item.status, item.score && `★ ${item.score}`].filter(Boolean).join(' · ');
                const genres = item.genres?.slice(0,3) || item.tags?.slice(0,3) || [];
                return (
                  <div key={item.id || i} style={{ display:'flex', alignItems:'center', gap:20, padding:'18px 0', borderBottom:'1px solid var(--border)', flexWrap:'wrap' }}>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--white3)', minWidth:24 }}>{String(i+1).padStart(2,'0')}</span>
                    <div style={{ flex:1, minWidth:180 }}>
                      <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:18, textTransform:'uppercase', lineHeight:1.2 }}>{title}</div>
                      {meta && <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--white3)', marginTop:4, letterSpacing:'0.06em' }}>{meta}</div>}
                    </div>
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                      {genres.map(g => <span key={g} className="tag">{g}</span>)}
                    </div>
                    <Link href={`/tester?path=/api/${activeTab}/search&q=${encodeURIComponent(title)}`} className="btn btn-ghost btn-sm">
                      Test API →
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding:'16px 48px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
          <span className="sec-num">.05</span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--white3)', letterSpacing:'0.12em' }}>UNIFIED CONTENT DISCOVERY</span>
        </div>
      </div>
    </>
  );
}
