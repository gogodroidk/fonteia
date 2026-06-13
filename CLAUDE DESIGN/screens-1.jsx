// screens-1.jsx — Overview, Auctions list, Auction detail (the star screen)
const { useState: uS, useEffect: uE } = React;

const catIcon = (t) => t === 'veiculo' ? 'car' : t === 'imovel' ? 'building' : t === 'maquinario' ? 'settings' : 'layers';
const fonteById = (id) => FONTES.find(f => f.id === id);

function ScoreRing({ score, size = 64 }) {
  const color = score >= 80 ? 'var(--ok)' : score >= 65 ? 'var(--warn)' : 'var(--danger)';
  return (
    <Ring value={score} size={size} sw={size > 80 ? 9 : 7} color={color}>
      <div style={{ textAlign: 'center', lineHeight: 1 }}>
        <div className="num" style={{ fontWeight: 800, fontSize: size > 80 ? 28 : 19, color }}>{score}</div>
        {size > 80 && <div className="tiny muted" style={{ marginTop: 2 }}>score</div>}
      </div>
    </Ring>
  );
}

function FonteDots({ ids, size = 22 }) {
  return (
    <div style={{ display: 'flex' }}>
      {ids.map((id, i) => { const f = fonteById(id); return (
        <div key={id} title={f.nome} className="num" style={{ width: size, height: size, borderRadius: 7, marginLeft: i ? -6 : 0, background: f.cor, color: '#fff', fontSize: size * .34, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--surface)', boxShadow: 'var(--shadow-sm)' }}>{f.sigla[0]}</div>
      ); })}
    </div>
  );
}

/* ---------------- Featured 3D opportunity card ---------------- */
function Featured3D({ leilao, onAnalyze }) {
  const [tx, setTx] = uS({ x: 0, y: 0 });
  const desc = Math.round((1 - leilao.minimo / leilao.avaliacao) * 100);
  const economia = leilao.avaliacao - leilao.minimo;
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTx({ x: ((e.clientX - r.left) / r.width - .5) * 12, y: -((e.clientY - r.top) / r.height - .5) * 10 });
  };
  return (
    <div className="scene" onMouseMove={move} onMouseLeave={() => setTx({ x: 0, y: 0 })}
      style={{ position: 'relative', minHeight: 290 }}>
      <div className="orb" style={{ width: 260, height: 200, background: 'var(--brand)', top: 10, left: 60, opacity: .22 }} />
      <div className="orb" style={{ width: 200, height: 180, background: 'var(--accent)', bottom: -20, right: 30, opacity: .2 }} />
      <div className="tilt panel glass" style={{
        transform: `rotateY(${tx.x}deg) rotateX(${tx.y}deg)`, padding: 26, position: 'relative',
        boxShadow: 'var(--shadow-xl)', overflow: 'hidden',
      }}>
        <div className="row between wrap" style={{ gap: 16, marginBottom: 20 }}>
          <div>
            <span className="badge badge--accent" style={{ marginBottom: 10 }}><Icon name="sparkle" size={12} fill="currentColor" />Destaque da Fonte.ia</span>
            <div className="h2" style={{ fontSize: 23, marginTop: 4 }}>{leilao.titulo}</div>
            <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
              <span className="small muted"><Icon name="pin" size={14} style={{ verticalAlign: -3, marginRight: 3 }} />{leilao.cidade}</span>
              <span className="small muted"><Icon name="clock" size={14} style={{ verticalAlign: -3, marginRight: 3 }} />Encerra {leilao.dataFim}</span>
            </div>
          </div>
          <div style={{ transform: 'translateZ(50px)' }}><ScoreRing score={leilao.score} size={92} /></div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
          <div className="inset" style={{ padding: 14 }}>
            <div className="tiny muted" style={{ marginBottom: 4 }}>Lance mínimo</div>
            <div className="num" style={{ fontWeight: 800, fontSize: 19 }}>{BRL(leilao.minimo)}</div>
          </div>
          <div className="inset" style={{ padding: 14 }}>
            <div className="tiny muted" style={{ marginBottom: 4 }}>Avaliação</div>
            <div className="num" style={{ fontWeight: 700, fontSize: 19, color: 'var(--t-mid)', textDecoration: 'line-through' }}>{BRL(leilao.avaliacao)}</div>
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: 'color-mix(in srgb,var(--accent) 14%,transparent)', border: '1px solid color-mix(in srgb,var(--accent) 30%,transparent)', transform: 'translateZ(30px)' }}>
            <div className="tiny" style={{ marginBottom: 4, color: 'var(--accent-ink)', fontWeight: 700 }}>Economia potencial</div>
            <div className="num t-accent" style={{ fontWeight: 800, fontSize: 19 }}>{BRL(economia)}</div>
          </div>
        </div>
        <div className="row between wrap" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <FonteDots ids={leilao.fontes} />
            <span className="tiny muted">Verificado em <b className="t-hi">{leilao.fontes.length} fontes oficiais</b></span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="badge badge--info num"><Icon name="trend" size={13} />-{desc}% abaixo</span>
            <button className="btn btn--primary" onClick={() => onAnalyze(leilao)}>Analisar agora <Icon name="arrow" size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ s, color }) {
  const up = s.delta >= 0;
  return (
    <div className="card card--pad card--hover" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row between">
        <span className="small muted" style={{ fontWeight: 600 }}>{s.label}</span>
        <span className={'badge ' + (up ? 'badge--ok' : 'badge--danger') + ' num'}><Icon name={up ? 'arrowup' : 'trenddown'} size={12} sw={2.4} />{up ? '+' : ''}{s.delta}%</span>
      </div>
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div className="display" style={{ fontSize: 30 }}>
          {s.prefix || ''}<CountUp value={s.value} dec={s.suffix === 'M' ? 1 : 0} />{s.suffix || ''}
        </div>
        <Spark data={s.spark} color={color} w={92} h={36} />
      </div>
    </div>
  );
}

function OverviewScreen({ onAnalyze, setRoute }) {
  const featured = LEILOES[0];
  const hot = LEILOES.slice(1, 5);
  const trend = dseries(3, 16, 700, 90);
  const cols = ['var(--brand-ink)', 'var(--accent-ink)', '#7C5CFC', '#E0A93B'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div className="rise">
        <div className="row between wrap" style={{ gap: 12 }}>
          <div>
            <div className="h1">Bom dia, João Vitor</div>
            <p className="muted" style={{ marginTop: 6, fontSize: 14.5 }}>12 de junho · <b className="t-accent">14 novos editais</b> publicados pelos órgãos que você acompanha.</p>
          </div>
          <button className="btn btn--ghost" onClick={() => setRoute('auctions')}><Icon name="search" size={17} />Explorar lotes</button>
        </div>
      </div>

      <div className="grid rise" style={{ gridTemplateColumns: 'repeat(4,1fr)', animationDelay: '.05s' }}>
        {Object.entries(OVERVIEW_STATS).map(([k, s], i) => <StatCard key={k} s={s} color={cols[i]} />)}
      </div>

      <div className="grid rise" style={{ gridTemplateColumns: '1.45fr 1fr', alignItems: 'start', animationDelay: '.1s' }}>
        <Featured3D leilao={featured} onAnalyze={onAnalyze} />
        <div className="panel card--pad" style={{ padding: 22 }}>
          <div className="row between" style={{ marginBottom: 4 }}>
            <div><div className="eyebrow">Tendência</div><div className="h3" style={{ marginTop: 4 }}>Oportunidades mapeadas</div></div>
            <span className="badge badge--ok num"><Icon name="arrowup" size={12} sw={2.4} />+23%</span>
          </div>
          <div style={{ margin: '16px 0 4px' }}><AreaChart data={trend} h={150} /></div>
          <div className="row between tiny muted"><span>30 mai</span><span>hoje</span></div>
          <hr className="divide" style={{ margin: '18px 0' }} />
          <div className="row between">
            <div><div className="tiny muted">Economia média por arremate</div><div className="num" style={{ fontWeight: 800, fontSize: 22, marginTop: 2 }}>38%</div></div>
            <div><div className="tiny muted">Tempo médio de análise</div><div className="num t-accent" style={{ fontWeight: 800, fontSize: 22, marginTop: 2 }}>32 s</div></div>
          </div>
        </div>
      </div>

      <div className="rise" style={{ animationDelay: '.15s' }}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <div className="h2">Em destaque <span className="badge badge--neutral" style={{ verticalAlign: 3 }}><span className="dot pulse" style={{ background: 'var(--accent-ink)' }} />ao vivo</span></div>
          <button className="link small" onClick={() => setRoute('auctions')}>Ver todos os 1.284 →</button>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
          {hot.map(l => <LeilaoCard key={l.id} l={l} onAnalyze={onAnalyze} />)}
        </div>
      </div>
    </div>
  );
}

function LeilaoCard({ l, onAnalyze, onWatch, watched }) {
  const desc = Math.round((1 - l.minimo / l.avaliacao) * 100);
  const [bc, bl] = riscoBadge(l.risco);
  return (
    <div className="card card--hover" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 116, background: l.tipo === 'veiculo' ? 'linear-gradient(135deg,#1e3a5f,#0f2942)' : 'linear-gradient(135deg,#1d3b6e,#13294d)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={catIcon(l.tipo)} size={42} style={{ color: 'rgba(255,255,255,.32)' }} sw={1.4} />
        <span className="badge" style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(255,255,255,.92)', color: '#0B2240' }}>{l.cat}</span>
        <span className={'badge ' + bc} style={{ position: 'absolute', top: 12, right: 12, background: l.risco === 'baixo' ? 'rgba(16,185,129,.95)' : l.risco === 'medio' ? 'rgba(245,158,11,.95)' : 'rgba(239,68,68,.95)', color: '#fff' }}>{bl}</span>
        <span className="badge num" style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(6,10,20,.6)', color: '#fff', backdropFilter: 'blur(6px)' }}><Icon name="eye" size={12} />{l.visitas}</span>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div>
          <div className="h3" style={{ fontSize: 15.5 }}>{l.titulo}</div>
          <div className="tiny muted" style={{ marginTop: 4 }}><Icon name="pin" size={12} style={{ verticalAlign: -2 }} /> {l.cidade}</div>
        </div>
        <div className="row between" style={{ marginTop: 'auto' }}>
          <div>
            <div className="tiny muted">Lance mínimo</div>
            <div className="num" style={{ fontWeight: 800, fontSize: 17 }}>{BRL(l.minimo)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="badge badge--accent num"><Icon name="trend" size={12} />-{desc}%</span>
            <div className="tiny muted" style={{ marginTop: 4 }}>Encerra {l.dataFim}</div>
          </div>
        </div>
        <div className="row between" style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div className="row" style={{ gap: 8 }}><ScoreRing score={l.score} size={38} /><span className="tiny muted">verif.<br />{l.fontes.length} fontes</span></div>
          <button className="btn btn--soft btn--sm" onClick={() => onAnalyze(l)}>Analisar <Icon name="arrow" size={14} /></button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OverviewScreen, LeilaoCard, ScoreRing, FonteDots, catIcon, fonteById });
