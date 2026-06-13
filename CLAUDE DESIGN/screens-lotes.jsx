// screens-lotes.jsx — Lotes (table list) + Detalhe (AI chat, PDF, direct link)
const { useState: slS, useEffect: slE, useRef: slR } = React;

/* ─── list ─── */
function LotesScreen({ onAnalyze }) {
  const [q, setQ] = slS('');
  const [tipo, setTipo] = slS('todos');
  const [risco, setRisco] = slS('todos');
  const [sort, setSort] = slS('score');
  const tipos = [['todos','Todos'],['eletronicos','Eletrônicos'],['veiculo','Veículos'],['mercadoria','Mercadorias'],['maquinario','Maquinário'],['imovel','Imóveis']];
  const riscos = [['todos','Todos'],['baixo','Baixo'],['medio','Médio'],['alto','Alto']];

  const list = React.useMemo(() => {
    let L = LEILOES.filter(l =>
      (tipo === 'todos' || l.tipo === tipo) &&
      (risco === 'todos' || l.risco === risco) &&
      (q === '' || (l.titulo + l.vara + l.processo + l.cidade + l.id).toLowerCase().includes(q.toLowerCase())));
    return [...L].sort((a,b) => sort==='score' ? b.score-a.score : sort==='desconto' ? (1-a.minimo/a.avaliacao)<(1-b.minimo/b.avaliacao)?1:-1 : a.minimo-b.minimo);
  }, [q, tipo, risco, sort]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* filter bar */}
      <div className="panel" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="searchbar">
          <Icon name="search" size={16} style={{ color: 'var(--t-low)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por lote, órgão, edital ou cidade…" />
          {q && <button className="btn btn--icon btn--ghost btn--sm" onClick={() => setQ('')} style={{ width: 28, height: 28 }}><Icon name="x" size={13} /></button>}
        </div>
        <div className="row between wrap" style={{ gap: 10 }}>
          <div className="row wrap" style={{ gap: 7 }}>
            {tipos.map(([v,t]) => <button key={v} className={'chip' + (tipo===v?' chip--on':'')} onClick={() => setTipo(v)} style={{ fontSize: 12.5, padding: '7px 12px' }}>{t}</button>)}
            <div style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
            {riscos.map(([v,t]) => <button key={v} className={'chip' + (risco===v?' chip--on':'')} onClick={() => setRisco(v)} style={{ fontSize: 12.5, padding: '7px 12px' }}>{t}</button>)}
          </div>
          <div className="row" style={{ gap: 7 }}>
            <span style={{ fontSize: 12, color: 'var(--t-low)', fontWeight: 600 }}>Ordenar:</span>
            {[['score','Score'],['desconto','Desconto'],['preco','Menor valor']].map(([v,t]) =>
              <button key={v} className={'chip'+(sort===v?' chip--on':'')} onClick={() => setSort(v)} style={{ fontSize: 12.5, padding: '7px 12px' }}>{t}</button>)}
          </div>
        </div>
      </div>

      <div className="row between">
        <span style={{ fontSize: 13, color: 'var(--t-mid)' }}><b style={{ color: 'var(--t-hi)', fontVariantNumeric: 'tabular-nums' }}>{list.length}</b> lotes encontrados</span>
        <span className="row" style={{ gap: 6, fontSize: 12, color: 'var(--t-low)' }}><span style={{ width: 7, height: 7, borderRadius: 50, background: 'var(--accent-ink)', display: 'inline-block' }} className="pulse" />Atualizado em tempo real</span>
      </div>

      {/* table */}
      {list.length > 0 ? (
        <div className="panel" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'inherit' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Lote / Órgão','Tipo','Avaliação','Lance mínimo','Desconto','Score','Encerramento',''].map((h,i) => (
                  <th key={i} style={{ padding: '12px 16px', textAlign: i >= 2 && i <= 5 ? 'right' : 'left', fontWeight: 700, fontSize: 11, color: 'var(--t-low)', letterSpacing: '.07em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((l, i) => {
                const desc = Math.round((1 - l.minimo / l.avaliacao) * 100);
                const scoreColor = l.score >= 80 ? 'var(--ok)' : l.score >= 65 ? 'var(--warn)' : 'var(--danger)';
                const f = fonteById(l.fontes[0]);
                return (
                  <tr key={l.id} style={{ borderTop: i ? '1px solid var(--border)' : 0, cursor: 'pointer', transition: 'background .12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => onAnalyze(l)}>
                    <td style={{ padding: '14px 16px', minWidth: 200 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{l.titulo}</div>
                      <div className="row" style={{ gap: 7, marginTop: 4 }}>
                        <div style={{ width: 20, height: 20, borderRadius: 5, background: f.cor, color: '#fff', fontSize: 7.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{f.sigla.slice(0,3)}</div>
                        <span style={{ fontSize: 11.5, color: 'var(--t-low)' }}>{l.processo}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}><span style={{ fontSize: 12.5, color: 'var(--t-mid)', fontWeight: 600 }}>{l.cat}</span></td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}><span style={{ fontSize: 13, color: 'var(--t-mid)', fontVariantNumeric: 'tabular-nums' }}>{BRL(l.avaliacao)}</span></td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}><span style={{ fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{BRL(l.minimo)}</span></td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}><span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--accent-ink)' }}>−{desc}%</span></td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}><span style={{ fontWeight: 800, fontSize: 14, color: scoreColor }}>{l.score}</span></td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}><span style={{ fontSize: 12.5, color: 'var(--t-mid)' }}>{l.dataFim}</span></td>
                    <td style={{ padding: '14px 14px' }}><button className="btn btn--soft btn--sm" onClick={e => { e.stopPropagation(); onAnalyze(l); }}>Analisar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel" style={{ padding: 48, textAlign: 'center' }}>
          <Icon name="search" size={28} style={{ color: 'var(--t-low)' }} />
          <div style={{ fontWeight: 700, marginTop: 12 }}>Nenhum lote encontrado</div>
          <p className="muted small" style={{ marginTop: 4 }}>Ajuste os filtros e tente novamente.</p>
        </div>
      )}
    </div>
  );
}

/* ─── AI CHAT ─── */
function ChatPanel({ lote }) {
  const [msgs, setMsgs] = slS([{ role: 'assistant', text: `Olá. Analisei o lote **${lote.id}** — ${lote.titulo}. Pode perguntar sobre risco, custo total, logística de retirada ou qualquer aspecto do edital.` }]);
  const [input, setInput] = slS('');
  const [loading, setLoading] = slS(false);
  const endRef = slR(null);
  const desc = Math.round((1 - lote.minimo / lote.avaliacao) * 100);

  slE(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [msgs]);

  const send = async () => {
    const txt = input.trim(); if (!txt || loading) return;
    setInput(''); setLoading(true);
    const userMsg = { role: 'user', text: txt };
    setMsgs(m => [...m, userMsg]);
    try {
      const context = `Você é um especialista em leilões governamentais da Fonte.ia by Olli. Responda de forma objetiva e profissional, sem introduções desnecessárias. Use no máximo 3 parágrafos.

DADOS DO LOTE:
ID: ${lote.id} | Descrição: ${lote.titulo}
Órgão: ${lote.vara} | Edital: ${lote.processo}
Avaliação oficial: ${BRL(lote.avaliacao)} | Lance mínimo: ${BRL(lote.minimo)} | Desconto: ${desc}%
Score Fonte.ia: ${lote.score}/100 | Risco: ${lote.risco}
Tributos estimados: ${BRL(lote.divida)} | Retirada complexa: ${lote.ocupado ? 'Sim' : 'Não'}
Encerramento: ${lote.dataFim} às ${lote.hora}
Descrição técnica: ${lote.desc}

PERGUNTA: ${txt}`;
      const reply = await window.claude.complete(context);
      setMsgs(m => [...m, { role: 'assistant', text: reply }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Não foi possível processar a consulta no momento. Tente novamente.' }]);
    }
    setLoading(false);
  };

  const quickQ = ['Qual o custo total estimado?', 'Há risco de tributação adicional?', 'Qual lance máximo recomendado?'];

  return (
    <div className="chat-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,var(--brand),var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="sparkle" size={16} fill="#fff" style={{ color: '#fff' }} />
        </div>
        <div><div style={{ fontWeight: 700, fontSize: 14 }}>Assistente Fonte.ia</div><div style={{ fontSize: 11.5, color: 'var(--t-low)' }}>Pergunte sobre este lote</div></div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
            {m.role === 'assistant' && <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,var(--brand),var(--accent))', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}><Icon name="sparkle" size={13} fill="#fff" style={{ color: '#fff' }} /></div>}
            <div style={{ maxWidth: '82%', padding: '10px 13px', borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px', background: m.role === 'user' ? 'var(--brand)' : 'var(--surface-2)', color: m.role === 'user' ? '#fff' : 'var(--t-hi)', fontSize: 13.5, lineHeight: 1.6, fontWeight: 400 }}>
              {m.text.split('**').map((s, j) => j % 2 === 1 ? <b key={j}>{s}</b> : s)}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,var(--brand),var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="sparkle" size={13} fill="#fff" style={{ color: '#fff' }} /></div>
            <div style={{ display: 'flex', gap: 5, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: '12px 12px 12px 4px' }}>
              {[0,1,2].map(j => <span key={j} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--t-low)', animation: `pulse-ring 1.2s ${j*.18}s infinite` }} />)}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* quick questions */}
      {msgs.length <= 1 && (
        <div style={{ padding: '0 14px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {quickQ.map(q => (
            <button key={q} onClick={() => { setInput(q); setTimeout(send, 50); }} style={{ fontSize: 12, padding: '6px 11px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--t-mid)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, transition: 'all .14s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-ink)'; e.currentTarget.style.color = 'var(--brand-ink)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t-mid)'; }}>{q}</button>
          ))}
        </div>
      )}

      <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()} placeholder="Faça uma pergunta…" className="input" style={{ flex: 1, padding: '10px 13px', fontSize: 13.5, borderRadius: 10 }} disabled={loading} />
          <button className="btn btn--primary" onClick={send} disabled={loading || !input.trim()} style={{ padding: '10px 14px', borderRadius: 10 }}><Icon name="arrow" size={16} /></button>
        </div>
      </div>
    </div>
  );
}

/* ─── PDF PRINT ─── */
function PrintReport({ lote }) {
  if (!lote) return null;
  const desc = Math.round((1 - lote.minimo / lote.avaliacao) * 100);
  const custoTotal = lote.minimo + lote.divida + Math.round(lote.minimo * 0.05);
  const economia = lote.avaliacao - lote.minimo;
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  return (
    <div className="print-report">
      <div className="report-header">
        <div>
          <div className="report-title">Fonte.ia — Relatório de lote</div>
          <div className="report-sub">by Olli · {today} · Dado rastreável a fontes oficiais</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '9pt', color: '#5A6B82' }}>
          <div style={{ fontWeight: 800, fontSize: '14pt', color: '#0B2240' }}>{lote.score}/100</div>
          <div>Score Fonte.ia</div>
        </div>
      </div>

      <div className="report-section">
        <div className="report-section-title">Identificação do lote</div>
        <div className="report-row"><span>{lote.titulo}</span></div>
        <div className="report-row"><span>ID do lote</span><b>{lote.id}</b></div>
        <div className="report-row"><span>Órgão responsável</span><b>{lote.vara}</b></div>
        <div className="report-row"><span>Nº do edital</span><b>{lote.processo}</b></div>
        <div className="report-row"><span>Cidade</span><b>{lote.cidade}</b></div>
        <div className="report-row"><span>Encerramento</span><b>{lote.dataFim} às {lote.hora}</b></div>
      </div>

      <div className="report-section">
        <div className="report-section-title">Resumo financeiro</div>
        <div className="report-row"><span>Avaliação oficial</span><b>{BRL(lote.avaliacao)}</b></div>
        <div className="report-row"><span>Lance mínimo</span><b>{BRL(lote.minimo)}</b></div>
        <div className="report-row"><span>Desconto sobre avaliação</span><b>−{desc}%</b></div>
        <div className="report-row"><span>Tributos e ônus estimados</span><b>{BRL(lote.divida)}</b></div>
        <div className="report-row"><span>Taxa do leilão (5%)</span><b>{BRL(Math.round(lote.minimo * 0.05))}</b></div>
        <div className="report-row" style={{ fontWeight: 800, borderTop: '1pt solid #0B2240', marginTop: 4, paddingTop: 6 }}><b>Custo total estimado</b><b>{BRL(custoTotal)}</b></div>
        <div className="report-row"><span>Economia potencial</span><b style={{ color: '#0E9885' }}>{BRL(economia)}</b></div>
      </div>

      <div className="report-section">
        <div className="report-section-title">Descrição técnica</div>
        <p style={{ fontSize: '10pt', lineHeight: 1.6, color: '#333' }}>{lote.desc}</p>
      </div>

      <div className="report-section">
        <div className="report-section-title">Fontes oficiais consultadas</div>
        {lote.fontes.map(fid => { const f = fonteById(fid); return (
          <div key={fid} className="report-row"><span>{f.nome}</span><b>{f.sigla}</b></div>
        ); })}
      </div>

      <div className="report-footer">
        <span>Fonte.ia by Olli · fonte.ia</span>
        <span>Este relatório é gerado a partir de dados públicos oficiais e não constitui assessoria jurídica ou financeira.</span>
        <span>{today}</span>
      </div>
    </div>
  );
}

/* ─── DETAIL ─── */
function LoteDetalhe({ lote: l, onBack, watched, onWatch, onFlash }) {
  const desc = Math.round((1 - l.minimo / l.avaliacao) * 100);
  const custoTotal = l.minimo + l.divida + Math.round(l.minimo * 0.05);
  const economia = l.avaliacao - l.minimo;
  const scoreColor = l.score >= 80 ? 'var(--ok)' : l.score >= 65 ? 'var(--warn)' : 'var(--danger)';
  const [bc, bl] = riscoBadge(l.risco);
  const breakdown = [
    ['Documentação e laudo', l.risco === 'baixo' ? 96 : l.risco === 'medio' ? 78 : 55, 'var(--ok)'],
    ['Liquidez de revenda', l.score - 4, 'var(--brand-ink)'],
    ['Logística de retirada', l.ocupado ? 50 : 94, l.ocupado ? 'var(--warn)' : 'var(--ok)'],
    ['Tributos e custos', l.divida > 60000 ? 46 : l.divida > 20000 ? 73 : 91, l.divida > 60000 ? 'var(--danger)' : 'var(--accent-ink)'],
  ];

  const doPrint = () => { onFlash('Abrindo relatório para impressão…'); setTimeout(() => window.print(), 400); };
  const officialLink = l.linkOficial || 'https://www.gov.br/receitafederal/pt-br/servicos/leilao';

  return (
    <>
      <PrintReport lote={l} />
      <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* breadcrumb + actions */}
        <div className="row between wrap" style={{ gap: 12 }}>
          <button className="btn btn--ghost btn--sm" onClick={onBack}><Icon name="chevleft" size={15} />Voltar aos lotes</button>
          <div className="row" style={{ gap: 8 }}>
            <button className={'btn btn--sm ' + (watched ? 'btn--accent' : 'btn--ghost')} onClick={onWatch}><Icon name="star" size={14} fill={watched ? 'currentColor' : 'none'} />{watched ? 'Salvo' : 'Salvar'}</button>
            <button className="btn btn--ghost btn--sm" onClick={doPrint}><Icon name="download" size={14} />Relatório PDF</button>
            <a href={officialLink} target="_blank" rel="noopener" className="btn btn--primary btn--sm"><Icon name="external" size={14} />Participar do leilão</a>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 18, alignItems: 'start' }}>
          {/* LEFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* header card */}
            <div className="panel" style={{ padding: 24 }}>
              <div className="row between wrap" style={{ gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
                    <span className={'badge ' + bc}><Icon name="shieldcheck" size={13} />{bl}</span>
                    <span className="badge badge--neutral">{l.cat}</span>
                    <span className="badge badge--neutral" style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{l.id}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.15 }}>{l.titulo}</div>
                  <div className="row wrap" style={{ gap: 16, marginTop: 10 }}>
                    <span style={{ fontSize: 13.5, color: 'var(--t-mid)', display: 'flex', gap: 5, alignItems: 'center' }}><Icon name="building" size={14} />{l.vara}</span>
                    <span style={{ fontSize: 13.5, color: 'var(--t-mid)', display: 'flex', gap: 5, alignItems: 'center' }}><Icon name="pin" size={14} />{l.cidade}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-.03em', color: scoreColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{l.score}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--t-low)', marginTop: 4, fontWeight: 600 }}>Score / 100</div>
                </div>
              </div>
              <p style={{ fontSize: 14, color: 'var(--t-mid)', lineHeight: 1.65, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>{l.desc}</p>
            </div>

            {/* financial breakdown */}
            <div className="panel" style={{ padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Resumo financeiro</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'inherit' }}>
                <tbody>
                  {[
                    ['Avaliação oficial', BRL(l.avaliacao), 'var(--t-mid)'],
                    ['Lance mínimo', BRL(l.minimo), 'var(--t-hi)'],
                    ['Desconto sobre avaliação', `−${desc}%`, 'var(--accent-ink)'],
                    ['Tributos e ônus estimados', BRL(l.divida), l.divida > 50000 ? 'var(--danger)' : 'var(--t-hi)'],
                    ['Taxa do leilão (5%)', BRL(Math.round(l.minimo * 0.05)), 'var(--t-mid)'],
                  ].map(([k, v, c], i) => (
                    <tr key={k} style={{ borderTop: i ? '1px solid var(--border)' : 0 }}>
                      <td style={{ padding: '11px 0', fontSize: 14, color: 'var(--t-mid)' }}>{k}</td>
                      <td style={{ padding: '11px 0', fontSize: 14, fontWeight: 700, textAlign: 'right', color: c, fontVariantNumeric: 'tabular-nums' }}>{v}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border-2)' }}>
                    <td style={{ padding: '14px 0', fontSize: 15, fontWeight: 800 }}>Custo total estimado</td>
                    <td style={{ padding: '14px 0', fontSize: 17, fontWeight: 900, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{BRL(custoTotal)}</td>
                  </tr>
                  <tr style={{ background: 'color-mix(in srgb,var(--accent) 8%,transparent)', borderRadius: 10 }}>
                    <td style={{ padding: '12px 10px', fontSize: 14, fontWeight: 700, color: 'var(--accent-ink)', borderRadius: '8px 0 0 8px' }}>Economia potencial</td>
                    <td style={{ padding: '12px 10px', fontSize: 16, fontWeight: 900, textAlign: 'right', color: 'var(--accent-ink)', fontVariantNumeric: 'tabular-nums', borderRadius: '0 8px 8px 0' }}>{BRL(economia)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* risk breakdown */}
            <div className="panel" style={{ padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Análise de risco</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {breakdown.map(([label, val, color]) => (
                  <div key={label}>
                    <div className="row between" style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{val}/100</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                      <div style={{ width: val + '%', height: '100%', borderRadius: 999, background: color, transition: 'width .9s cubic-bezier(.2,.7,.3,1)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* sources */}
            <div className="panel" style={{ padding: 24 }}>
              <div className="row between" style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Rastreabilidade da informação</div>
                <span className="badge badge--ok"><Icon name="shieldcheck" size={12} />Dados verificados</span>
              </div>
              {l.fontes.map((fid, i) => { const f = fonteById(fid); return (
                <div key={fid} className="row between" style={{ padding: '12px 0', borderTop: i ? '1px solid var(--border)' : 0, alignItems: 'center', gap: 14 }}>
                  <div className="row" style={{ gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 9, background: f.cor, color: '#fff', fontWeight: 800, fontSize: 9.5, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: 1.1, flexShrink: 0 }}>{f.sigla}</div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{f.nome}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--t-low)', marginTop: 2 }}>{l.processo}</div>
                    </div>
                  </div>
                  <a href={l.linkOficial || '#'} target="_blank" rel="noopener" className="btn btn--ghost btn--sm" style={{ fontSize: 12 }}>
                    <Icon name="external" size={13} />Ver fonte
                  </a>
                </div>
              ); })}
            </div>

          </div>

          {/* RIGHT: sticky sidebar */}
          <div style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* dates */}
            <div className="panel" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Prazo do edital</div>
              <div className="row between" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--t-mid)' }}>Encerramento</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{l.dataFim}</span>
              </div>
              <div className="row between">
                <span style={{ fontSize: 13, color: 'var(--t-mid)' }}>Horário</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{l.hora}</span>
              </div>
              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'color-mix(in srgb,var(--warn) 10%,var(--surface-2))', border: '1px solid color-mix(in srgb,var(--warn) 24%,transparent)', fontSize: 12.5, fontWeight: 600, color: 'var(--warn)' }}>
                <Icon name="clock" size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Encerra em 6 dias
              </div>
              <a href={officialLink} target="_blank" rel="noopener" className="btn btn--primary btn--lg btn--block" style={{ marginTop: 14 }}>
                <Icon name="external" size={16} />Participar do leilão
              </a>
              <button className="btn btn--ghost btn--block" style={{ marginTop: 8 }} onClick={doPrint}>
                <Icon name="download" size={15} />Gerar relatório PDF
              </button>
            </div>

            {/* AI chat */}
            <div style={{ height: 480 }}>
              <ChatPanel lote={l} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { LotesScreen, LoteDetalhe, ChatPanel, PrintReport });
