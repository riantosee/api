'use client';
import { useEffect, useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import { useStatus } from '../../hooks/useStatus';

function UptimeBars({ history = [] }) {
  const bars = [...Array(30)].map((_, i) => {
    const h = history[history.length - 1 - i];
    if (!h) return 'empty';
    return h.status === 'online' || h.status === 'warning' ? h.status : 'down';
  }).reverse();
  const c = { online:'var(--green)', warning:'var(--yellow)', down:'var(--red)', empty:'var(--border)' };
  return (
    <div style={{ display:'flex', gap:2, alignItems:'flex-end', height:20 }}>
      {bars.map((s, i) => (
        <div key={i} style={{ flex:1, height: s==='down'?20:s==='warning'?14:10, background:c[s], opacity:s==='empty'?.25:.75, transition:'height .2s' }} />
      ))}
    </div>
  );
}

export default function StatusPage() {
  const { statuses, summary, loading, lastUpdated, refresh } = useStatus(30000);
  const [histories, setHistories] = useState({});
  const [uptimes, setUptimes] = useState({});

  useEffect(() => {
    fetch('/api/health?mode=summary').then(r=>r.json()).then(j => {
      if (j.status==='success') { const m={}; (j.data||[]).forEach(u => m[u.id]=u.uptime); setUptimes(m); }
    }).catch(()=>{});
  }, []);

  useEffect(() => {
    statuses.forEach(s => {
      if (histories[s.id]) return;
      fetch(`/api/health?mode=history&id=${s.id}`).then(r=>r.json()).then(j => {
        if (j.status==='success') setHistories(p => ({ ...p, [s.id]: j.data?.history||[] }));
      }).catch(()=>{});
    });
  }, [statuses]);

  const cats = ['anime','manga','manhua','donghua'];
  const overallGood = summary && summary.down === 0;
  const overallDeg  = summary && summary.down > 0;

  return (
    <>
      <Navbar />
      <div className="page" style={{ background:'var(--bg)' }}>

        {/* ── Banner ─────────────────────────────────── */}
        <div style={{ borderBottom:'1px solid var(--border)', padding:'60px 48px' }}>
          <div className="label" style={{ marginBottom:12 }}>System Status</div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:24 }}>
            <h1 className="display" style={{ fontSize:'clamp(48px,9vw,100px)', color: overallDeg?'var(--red)': overallGood?'var(--green)':'var(--white)' }}>
              {overallDeg ? 'Degraded' : overallGood ? 'Operational' : 'Loading…'}
            </h1>
            <div style={{ display:'flex', gap:32 }}>
              {[
                {l:'Online',   v:summary?.online  ??'—', c:'var(--green)'},
                {l:'Warning',  v:summary?.warning ??'—', c:'var(--yellow)'},
                {l:'Down',     v:summary?.down    ??'—', c:'var(--red)'},
                {l:'Disabled', v:summary?.disabled??'—', c:'var(--white3)'},
              ].map(x => (
                <div key={x.l} style={{ textAlign:'right' }}>
                  <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:36, color:x.c, lineHeight:1 }}>{x.v}</div>
                  <div className="label" style={{ marginTop:4 }}>{x.l}</div>
                </div>
              ))}
            </div>
          </div>
          {lastUpdated && <p style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--white3)', marginTop:16, letterSpacing:'0.1em' }}>
            UPDATED {lastUpdated.toLocaleTimeString()} · AUTO-REFRESH 30S
          </p>}
        </div>

        {/* ── Per-category ───────────────────────────── */}
        {loading
          ? <div style={{ display:'flex', justifyContent:'center', padding:80 }}><span className="spinner" style={{ width:28,height:28 }} /></div>
          : cats.map(cat => {
              const apis = statuses.filter(s => s.category === cat);
              if (!apis.length) return null;
              return (
                <div key={cat} style={{ borderBottom:'1px solid var(--border)' }}>
                  {/* Category header */}
                  <div style={{ padding:'20px 48px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16 }}>
                    <span className="display" style={{ fontSize:13, color:'var(--white3)' }}>{cat.toUpperCase()}</span>
                    <span style={{ width:1, height:14, background:'var(--border2)' }} />
                    <span className="label">{apis.length} providers</span>
                  </div>

                  {/* API rows */}
                  {apis.map(api => (
                    <div key={api.id} style={{ padding:'24px 48px', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:12 }}>
                        <div style={{ display:'flex', alignItems:'baseline', gap:16 }}>
                          <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:20, textTransform:'uppercase' }}>{api.label}</span>
                          <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--white3)' }}>{api.provider}</span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:20 }}>
                          {uptimes[api.id] !== undefined && (
                            <div style={{ textAlign:'right' }}>
                              <div style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:24, lineHeight:1, color: uptimes[api.id]>95?'var(--green)':uptimes[api.id]>80?'var(--yellow)':'var(--red)' }}>
                                {uptimes[api.id]}%
                              </div>
                              <div className="label" style={{ marginTop:2 }}>Uptime</div>
                            </div>
                          )}
                          <span className={`badge badge-${api.status}`}>
                            <span className={`dot dot-${api.status}`} />{api.status}
                            {api.response_time > 0 && <span style={{ opacity:.6 }}>{api.response_time}ms</span>}
                          </span>
                        </div>
                      </div>
                      <UptimeBars history={histories[api.id]||[]} />
                      <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'var(--font-mono)', fontSize:9, color:'var(--white3)', marginTop:6, letterSpacing:'0.1em' }}>
                        <span>30 CHECKS AGO</span><span>NOW</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
        }

        <div style={{ padding:'32px 48px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
          <span className="sec-num">.03</span>
          <button className="btn btn-ghost btn-sm" onClick={refresh}>↻ Refresh</button>
        </div>
      </div>
    </>
  );
}
