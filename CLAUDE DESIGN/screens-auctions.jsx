// screens-auctions.jsx — Auctions list (filters) + Auction detail (star screen)
const { useState: uSa, useMemo: uM } = React;

function AuctionsScreen({ onAnalyze, watch, toggleWatch }) {
  const [q, setQ] = uSa('');
  const [cat, setCat] = uSa('todos');
  const [risco, setRisco] = uSa('todos');
  const [sort, setSort] = uSa('score');
  const cats = [['todos', 'Todos'], ['eletronicos', 'Eletrônicos'], ['veiculo', 'Veículos'], ['mercadoria', 'Mercadorias'], ['maquinario', 'Maquinário'], ['imovel', 'Imóveis da União']];
  const riscos = [['todos', 'Qualquer risco'], ['baixo', 'Risco baixo'], ['medio', 'Médio'], ['alto', 'Alto']];

  const list = uM(() => {
    let L = LEILOES.filter(l =>
      (cat === 'todos' || l.tipo === cat) &&
      (risco === 'todos' || l.risco === risco) &&
      (q === '' || (l.titulo + l.cidade + l.processo).toLowerCase().includes(q.toLowerCase())));
    L = [...L].sort((a, b) => sort === 'score' ? b.score - a.score : sort === 'desconto' ? (1 - a.minimo / a.avaliacao < 1 - b.minimo / b.avaliacao ? 1 : -1) : a.minimo - b.minimo);
    return L;
  }, [q, cat, risco, sort]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="searchbar" style={{ maxWidth: '100%' }}>
          <Icon name="search" size={18} style={{ color: 'var(--t-low)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por lote, órgão, cidade ou nº do edital…" />
          {q && <button className="btn btn--icon btn--ghost btn--sm" onClick={() => setQ('')}><Icon name="x" size={14} /></button>}
        </div>
        <div className="row between wrap" style={{ gap: 12 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            {cats.map(([v, t]) => <button key={v} className={'chip' + (cat === v ? ' chip--on' : '')} onClick={() => setCat(v)}>{t}</button>)}
            <span style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
            {riscos.map(([v, t]) => <button key={v} className={'chip' + (risco === v ? ' chip--on' : '')} onClick={() => setRisco(v)}>{t}</button>)}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="tiny muted">Ordenar:</span>
            {[['score', 'Score'], ['desconto', 'Desconto'], ['preco', 'Menor preço']].map(([v, t]) =>
              <button key={v} className={'chip' + (sort === v ? ' chip--on' : '')} onClick={() => setSort(v)}>{t}</button>)}
          </div>
        </div>
      </div>

      <div className="row between">
        <span className="small muted"><b className="t-hi num">{list.length}</b> lotes encontrados</span>
        <span className="row tiny muted" style={{ gap: 6 }}><span className="dot pulse" style={{ background: 'var(--accent-ink)' }} />Atualizado em tempo real</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {list.map(l => <LeilaoCard key={l.id} l={l} onAnalyze={onAnalyze} watched={watch.has(l.id)} onWatch={() => toggleWatch(l.id)} />)}
      </div>
      {list.length === 0 && <div className="panel" style={{ padding: 50, textAlign: 'center' }}><Icon name="search" size={32} style={{ color: 'var(--t-low)' }} /><div className="h3" style={{ marginTop: 12 }}>Nenhum lote encontrado</div><p className="muted small">Tente ajustar os filtros.</p></div>}
    </div>
  );
}

/* ---------------- DETAIL (star screen) ---------------- */
function Bar({ label, value, color = 'var(--brand-ink)' }) {
  return (
    <div>
      <div className="row between" style={{ marginBottom: 6 }}><span className="small" style={{ fontWeight: 600 }}>{label}</span><span className="num small muted">{value}/100</span></div>
      <div className="track" style={{ height: 7 }}><i style={{ width: value + '%', background: color, transition: 'width .9s cubic-bezier(.2,.7,.3,1)' }} /></div>
    </div>
  );
}

function AuctionDetail({ leilao: l, onBack, watched, onWatch, onReport }) {
  const desc = Math.round((1 - l.minimo / l.avaliacao) * 100);
  const economia = l.avaliacao - l.minimo;
  const custoTotal = l.minimo + l.divida + Math.round(l.minimo * 0.05);
  const breakdown = [
    ['Documentação e laudo', l.risco === 'baixo' ? 96 : l.risco === 'medio' ? 78 : 60, 'var(--ok)'],
    ['Liquidez de revenda', l.score - 4, 'var(--brand-ink)'],
    ['Logística de retirada', l.ocupado ? 52 : 92, l.ocupado ? 'var(--warn)' : 'var(--ok)'],
    ['Tributos e custos', l.divida > 60000 ? 48 : l.divida > 20000 ? 74 : 90, l.divida > 60000 ? 'var(--danger)' : 'var(--accent-ink)'],
  ];
  const trace = [
    { f: l.fontes[0], t: 'Edital e valor de avaliação', d: '08 jun 2026', ref: l.processo },
    { f: l.fontes[0], t: 'Publicação oficial confirmada', d: '07 jun 2026', ref: l.id },
    { f: l.fontes[l.fontes.length - 1], t: 'Laudo técnico / situação do bem', d: '05 jun 2026', ref: 'Laudo téc. 44.218' },
  ];
  const insights = [
    l.risco === 'baixo' ? 'Documentação completa e sem ônus tributário oculto além do informado no edital.' : 'Há pendências a apurar — leia o parecer antes de ofertar.',
    `Lance mínimo ${desc}% abaixo da avaliação oficial — acima da média do segmento (${desc - 6}%).`,
    l.ocupado ? 'Retirada complexa: orce transporte e prazo de liberação no depósito.' : 'Retirada simples no depósito oficial após a quitação.',
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="row between wrap" style={{ gap: 12 }}>
        <button className="btn btn--ghost btn--sm" onClick={onBack}><Icon name="chevleft" size={16} />Voltar aos lotes</button>
        <div className="row" style={{ gap: 8 }}>
          <button className={'btn btn--sm ' + (watched ? 'btn--accent' : 'btn--ghost')} onClick={onWatch}><Icon name="star" size={15} fill={watched ? 'currentColor' : 'none'} />{watched ? 'Na watchlist' : 'Salvar'}</button>
          <button className="btn btn--ghost btn--sm"><Icon name="doc" size={15} />Edital oficial</button>
          <button className="btn btn--primary btn--sm" onClick={onReport}><Icon name="download" size={15} />Baixar relatório</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'start' }}>
        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="panel" style={{ overflow: 'hidden' }}>
            <div style={{ height: 240, background: l.tipo === 'veiculo' ? 'linear-gradient(135deg,#1e3a5f,#0c2038)' : 'linear-gradient(135deg,#1d3b6e,#0f2344)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="gridbg">
              <Icon name={catIcon(l.tipo)} size={68} style={{ color: 'rgba(255,255,255,.3)' }} sw={1.2} />
              <span className="badge" style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(255,255,255,.94)', color: '#0B2240' }}>{l.cat}</span>
              <div className="row" style={{ gap: 6, position: 'absolute', bottom: 16, left: 16 }}>
                {[1, 2, 3, 4].map(i => <div key={i} style={{ width: 54, height: 38, borderRadius: 7, background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.2)' }} />)}
              </div>
            </div>
            <div style={{ padding: 24 }}>
              <div className="row between wrap" style={{ gap: 12 }}>
                <div>
                  <div className="h1" style={{ fontSize: 25 }}>{l.titulo}</div>
                  <div className="row wrap" style={{ gap: 14, marginTop: 8 }}>
                    <span className="small muted"><Icon name="pin" size={14} style={{ verticalAlign: -3 }} /> {l.cidade}</span>
                    <span className="small muted"><Icon name="building" size={14} style={{ verticalAlign: -3 }} /> {l.vara}</span>
                  </div>
                </div>
                {(() => { const [bc, bl] = riscoBadge(l.risco); return <span className={'badge ' + bc} style={{ fontSize: 13, padding: '7px 13px' }}><Icon name="shieldcheck" size={15} />{bl}</span>; })()}
              </div>
              <p className="muted" style={{ marginTop: 16, fontSize: 14.5, lineHeight: 1.6 }}>{l.desc}</p>
            </div>
          </div>

          {/* AI Analysis */}
          <div className="panel" style={{ padding: 24, position: 'relative', overflow: 'hidden' }}>
            <div className="orb" style={{ width: 160, height: 160, background: 'var(--accent)', top: -50, right: -30, opacity: .22 }} />
            <div className="row" style={{ gap: 12, marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg,var(--brand),var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-md)' }}><Icon name="sparkle" size={20} style={{ color: '#fff' }} fill="#fff" /></div>
              <div><div className="h3">Análise da Fonte.ia</div><div className="tiny muted">Gerada a partir de {l.fontes.length} fontes oficiais · 32s</div></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {insights.map((t, i) => <div key={i} className="row" style={{ gap: 11, alignItems: 'flex-start' }}><Icon name="check" size={18} style={{ color: 'var(--accent-ink)', flex: '0 0 auto', marginTop: 1 }} sw={2.6} /><span className="small" style={{ lineHeight: 1.5 }}>{t}</span></div>)}
            </div>
            <div className="inset" style={{ marginTop: 18, padding: 16, display: 'flex', gap: 12, alignItems: 'center', background: 'color-mix(in srgb,var(--accent) 8%,var(--surface-2))' }}>
              <Icon name="target" size={22} style={{ color: 'var(--accent-ink)' }} />
              <div><div className="small" style={{ fontWeight: 700 }}>Recomendação: {l.score >= 80 ? 'Oportunidade forte' : l.score >= 65 ? 'Vale analisar a fundo' : 'Cautela — leia o parecer'}</div><div className="tiny muted">Lance sugerido até {BRL(Math.round(l.minimo * 1.08))} mantém boa margem.</div></div>
            </div>
          </div>

          {/* Rastreabilidade */}
          <div className="panel" style={{ padding: 24 }}>
            <div className="row between" style={{ marginBottom: 18 }}>
              <div className="h3"><Icon name="link" size={17} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--brand-ink)' }} />Rastreabilidade do dado</div>
              <span className="badge badge--ok"><Icon name="shieldcheck" size={13} />100% verificável</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {trace.map((tr, i) => { const f = fonteById(tr.f); return (
                <div key={i} className="row" style={{ gap: 14, padding: '12px 0', borderTop: i ? '1px solid var(--border)' : 0 }}>
                  <div className="num" style={{ width: 38, height: 38, flex: '0 0 auto', borderRadius: 9, background: f.cor, color: '#fff', fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: 1 }}>{f.sigla}</div>
                  <div style={{ flex: 1 }}>
                    <div className="small" style={{ fontWeight: 600 }}>{tr.t}</div>
                    <div className="tiny muted">{f.nome} · {tr.d} · <span className="num">{tr.ref}</span></div>
                  </div>
                  <button className="btn btn--ghost btn--sm"><Icon name="doc" size={14} />Ver fonte</button>
                </div>
              ); })}
            </div>
          </div>
        </div>

        {/* RIGHT sticky */}
        <div style={{ position: 'sticky', top: 88, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel glass" style={{ padding: 22, boxShadow: 'var(--shadow-lg)' }}>
            <div className="row" style={{ gap: 18, marginBottom: 18 }}>
              <ScoreRing score={l.score} size={92} />
              <div>
                <div className="eyebrow">Score Fonte.ia</div>
                <div className="h3" style={{ marginTop: 4 }}>{l.score >= 80 ? 'Confiável' : l.score >= 65 ? 'Atenção' : 'Risco elevado'}</div>
                <div className="tiny muted" style={{ marginTop: 2 }}>Quanto maior, mais seguro o arremate.</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>{breakdown.map(([lb, v, c]) => <Bar key={lb} label={lb} value={v} color={c} />)}</div>
          </div>

          <div className="panel" style={{ padding: 22 }}>
            <div className="row between" style={{ marginBottom: 14 }}>
              <div><div className="tiny muted">Lance mínimo · {l.praca}</div><div className="num display" style={{ fontSize: 28, marginTop: 2 }}>{BRL(l.minimo)}</div></div>
              <span className="badge badge--accent num" style={{ fontSize: 13, padding: '6px 11px' }}>-{desc}%</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[['Avaliação oficial', BRL(l.avaliacao)], ['Tributos / custos', BRL(l.divida)], ['Taxa do leilão (5%)', BRL(Math.round(l.minimo * 0.05))]].map(([k, v], i) =>
                <div key={k} className="row between" style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}><span className="small muted">{k}</span><span className="num small" style={{ fontWeight: 600 }}>{v}</span></div>)}
              <div className="row between" style={{ padding: '12px 0 4px', borderTop: '2px solid var(--border-2)', marginTop: 4 }}><span className="small" style={{ fontWeight: 700 }}>Custo total estimado</span><span className="num" style={{ fontWeight: 800, fontSize: 16 }}>{BRL(custoTotal)}</span></div>
            </div>
            <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'color-mix(in srgb,var(--accent) 12%,transparent)', border: '1px solid color-mix(in srgb,var(--accent) 28%,transparent)' }}>
              <div className="row between"><span className="small" style={{ fontWeight: 700, color: 'var(--accent-ink)' }}><Icon name="wallet" size={15} style={{ verticalAlign: -3 }} /> Economia potencial</span><span className="num t-accent" style={{ fontWeight: 800, fontSize: 18 }}>{BRL(economia)}</span></div>
            </div>
            <button className="btn btn--primary btn--lg btn--block" style={{ marginTop: 16 }}><Icon name="external" size={17} />Ir para o lance oficial</button>
          </div>

          <div className="panel" style={{ padding: 20 }}>
            <div className="h3" style={{ marginBottom: 14, fontSize: 14 }}>Datas & prazos</div>
            <div className="row between" style={{ padding: '9px 0' }}><span className="small muted"><Icon name="clock" size={14} style={{ verticalAlign: -3 }} /> Encerramento</span><span className="small" style={{ fontWeight: 700 }}>{l.dataFim} · {l.hora}</span></div>
            <div className="inset" style={{ padding: 12, marginTop: 8, textAlign: 'center', background: 'color-mix(in srgb,var(--warn) 10%,var(--surface-2))' }}>
              <span className="small" style={{ fontWeight: 700, color: 'var(--warn)' }}><Icon name="clock" size={14} style={{ verticalAlign: -2 }} /> Encerra em 6 dias — prazo do edital</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AuctionsScreen, AuctionDetail });
