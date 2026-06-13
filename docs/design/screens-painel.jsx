// screens-painel.jsx — Painel (overview): clean adult metrics + recent lots table
const { useState: spS, useEffect: spE } = React;

function MetricCard({ label, value, prefix='', suffix='', delta, color, spark }) {
  const up = delta >= 0;
  return (
    <div className="card card--pad" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '20px 22px' }}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-mid)', lineHeight: 1.3 }}>{label}</span>
        {delta !== undefined && <span className={'badge num ' + (up ? 'badge--ok' : 'badge--danger')} style={{ fontSize: 11 }}><Icon name={up ? 'arrowup' : 'trenddown'} size={11} sw={2.5} />{up ? '+' : ''}{delta}%</span>}
      </div>
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.025em', fontVariantNumeric: 'tabular-nums' }}>
          {prefix}<CountUp value={value} dec={suffix === 'M' ? 1 : 0} />{suffix}
        </div>
        {spark && <Spark data={spark} color={color || 'var(--brand-ink)'} w={80} h={30} />}
      </div>
    </div>
  );
}

function PainelScreen({ onAnalyze, setRoute }) {
  const cols = ['var(--brand-ink)', 'var(--accent-ink)', '#7C5CFC', '#C98A2E'];
  const recent = LEILOES.slice(0, 6);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* metrics */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {Object.entries(OVERVIEW_STATS).map(([k, s], i) => (
          <MetricCard key={k} label={s.label} value={s.value} prefix={s.prefix || ''} suffix={s.suffix || ''} delta={s.delta} color={cols[i]} spark={s.spark} />
        ))}
      </div>

      {/* main content */}
      <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr', gap: 18, alignItems: 'start' }}>

        {/* recent lots table */}
        <div>
          <div className="row between" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-.01em' }}>Últimos lotes publicados</div>
            <button className="btn btn--ghost btn--sm" onClick={() => setRoute('lotes')}>Ver todos</button>
          </div>
          <div className="panel" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'inherit' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Lote', 'Órgão', 'Tipo', 'Lance mín.', 'Desconto', 'Score', ''].map((h, i) => (
                    <th key={i} style={{ padding: '12px 16px', textAlign: i >= 3 ? 'right' : 'left', fontWeight: 700, fontSize: 11.5, color: 'var(--t-low)', letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((l, i) => {
                  const desc = Math.round((1 - l.minimo / l.avaliacao) * 100);
                  const [bc] = riscoBadge(l.risco);
                  return (
                    <tr key={l.id} style={{ borderTop: i ? '1px solid var(--border)' : 0, transition: 'background .14s', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => onAnalyze(l)}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{l.titulo.length > 28 ? l.titulo.slice(0, 28) + '…' : l.titulo}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--t-low)', marginTop: 2, fontFamily: 'monospace' }}>{l.id}</div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 20, height: 20, borderRadius: 5, background: fonteById(l.fontes[0]).cor, color: '#fff', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: 0 }}>{fonteById(l.fontes[0]).sigla.slice(0,3)}</div>
                          <span style={{ fontSize: 12.5, color: 'var(--t-mid)' }}>{fonteById(l.fontes[0]).sigla}</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-mid)' }}>{l.cat}</span></td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 13.5 }}>{BRL(l.minimo)}</span></td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}><span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-ink)' }}>-{desc}%</span></td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: l.score >= 80 ? 'var(--ok)' : l.score >= 65 ? 'var(--warn)' : 'var(--danger)' }}>{l.score}</span>
                      </td>
                      <td style={{ padding: '14px 14px', textAlign: 'right' }}>
                        <button className="btn btn--soft btn--sm" onClick={e => { e.stopPropagation(); onAnalyze(l); }}>Analisar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* trend chart */}
          <div className="panel" style={{ padding: 22 }}>
            <div className="row between" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Lotes mapeados — 30 dias</div>
              <span className="badge badge--ok num" style={{ fontSize: 11 }}><Icon name="arrowup" size={11} sw={2.5} />+23%</span>
            </div>
            <AreaChart data={dseries(3, 18, 700, 100)} h={120} />
            <div className="row between tiny muted" style={{ marginTop: 6 }}><span>14 mai</span><span>hoje</span></div>
          </div>

          {/* score distribution */}
          <div className="panel" style={{ padding: 22 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Distribuição de risco</div>
            {[['Risco baixo', 58, 'var(--ok)'], ['Risco médio', 30, 'var(--warn)'], ['Risco alto', 12, 'var(--danger)']].map(([l, v, c]) => (
              <div key={l} style={{ marginBottom: 12 }}>
                <div className="row between" style={{ marginBottom: 5 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{l}</span><span style={{ fontSize: 13, fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums' }}>{v}%</span></div>
                <div className="track"><i style={{ width: v + '%', background: c, transition: 'width 1s' }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PainelScreen });
