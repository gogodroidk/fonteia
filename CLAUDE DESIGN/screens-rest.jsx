// screens-rest.jsx — Alertas, Relatórios, Fontes, Conta (tabbed settings)
const { useState: rsS, useEffect: rsE } = React;

/* ─── ALERTAS (watchlist + notifications) ─── */
function AlertasScreen({ watch, toggleWatch, onAnalyze }) {
  const saved = LEILOES.filter(l => watch.has(l.id));
  const visible = saved.length ? saved : LEILOES.slice(0, 3);
  const [alerts, setAlerts] = rsS({ edital: true, push: true, sms: false, score: true, queda: true });
  const Toggle = ({ k, t, d }) => (
    <div className="row between" style={{ padding: '13px 0', borderTop: '1px solid var(--border)' }}>
      <div><div style={{ fontSize: 14, fontWeight: 600 }}>{t}</div><div style={{ fontSize: 12.5, color: 'var(--t-mid)', marginTop: 2 }}>{d}</div></div>
      <div className={'switch' + (alerts[k] ? ' on' : '')} onClick={() => setAlerts(a => ({ ...a, [k]: !a[k] }))}><i /></div>
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>{saved.length ? `${saved.length} lotes acompanhados` : 'Lotes sugeridos'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(l => {
            const desc = Math.round((1 - l.minimo / l.avaliacao) * 100);
            const scoreColor = l.score >= 80 ? 'var(--ok)' : l.score >= 65 ? 'var(--warn)' : 'var(--danger)';
            return (
              <div key={l.id} className="panel" style={{ padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 11, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={catIcon(l.tipo)} size={20} style={{ color: 'var(--t-mid)' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{l.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--t-low)', marginTop: 3 }}>{l.vara} · encerra {l.dataFim}</div>
                  <div className="row" style={{ gap: 10, marginTop: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{BRL(l.minimo)}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-ink)' }}>−{desc}%</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: scoreColor }}>Score {l.score}</span>
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn--soft btn--sm" onClick={() => onAnalyze(l)}>Analisar</button>
                  <button className="btn btn--icon btn--ghost btn--sm" onClick={() => toggleWatch(l.id)} title="Remover">
                    <Icon name="star" size={15} fill={watch.has(l.id) ? 'var(--accent-ink)' : 'none'} style={{ color: watch.has(l.id) ? 'var(--accent-ink)' : 'var(--t-mid)' }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="panel" style={{ padding: 22, position: 'sticky', top: 80 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Configurar alertas</div>
        <div style={{ fontSize: 13, color: 'var(--t-mid)', marginBottom: 2 }}>Avisos automáticos de novos editais.</div>
        <Toggle k="edital" t="Novo edital publicado" d="Quando um órgão publica um novo lote." />
        <Toggle k="push" t="Notificação no navegador" d="Alerta imediato assim que o edital sair." />
        <Toggle k="sms" t="SMS" d="Apenas lotes da lista acompanhada." />
        <Toggle k="queda" t="Reavaliação de valor" d="Quando o lance mínimo de um lote cai." />
        <Toggle k="score" t="Score acima de 80" d="Somente lotes com risco classificado baixo." />
        <div style={{ marginTop: 16, padding: 13, borderRadius: 11, background: 'color-mix(in srgb,var(--warn) 8%,var(--surface-2))', border: '1px solid color-mix(in srgb,var(--warn) 22%,transparent)', fontSize: 13, fontWeight: 600, color: 'var(--warn)', display: 'flex', gap: 9, alignItems: 'center' }}>
          <Icon name="clock" size={16} />{saved.length > 0 ? `${saved.length} lote(s) encerram esta semana.` : 'Nenhum lote acompanhado ainda.'}
        </div>
      </div>
    </div>
  );
}

/* ─── RELATÓRIOS ─── */
function RelatoriosScreen({ onAnalyze, onUpgrade }) {
  const reps = [
    { l: LEILOES[0], d: '12 jun 2026' },
    { l: LEILOES[1], d: '11 jun 2026' },
    { l: LEILOES[2], d: '09 jun 2026' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row between wrap" style={{ gap: 12 }}>
        <div style={{ fontSize: 14, color: 'var(--t-mid)', maxWidth: 560 }}>Relatórios gerados com rastreabilidade de fonte. Use o botão "Relatório PDF" dentro de qualquer lote para gerar e imprimir.</div>
        <button className="btn btn--primary" onClick={onUpgrade}><Icon name="plus" size={15} />Novo relatório</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }} className="panel">
        {reps.map(({ l, d }, i) => {
          const desc = Math.round((1 - l.minimo / l.avaliacao) * 100);
          return (
            <div key={l.id} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '16px 20px', borderTop: i ? '1px solid var(--border)' : 0 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, gap: 1 }}>
                <div style={{ height: 3, width: 26, borderRadius: 2, background: 'linear-gradient(90deg,#0B2240,#1D5FE0 70%,#14BBA4)' }} />
                <Icon name="file" size={18} style={{ color: 'var(--t-mid)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{l.titulo}</div>
                <div style={{ fontSize: 12, color: 'var(--t-low)', marginTop: 3 }}>{d} · <span style={{ fontFamily: 'monospace' }}>{l.id}</span> · Score {l.score}</div>
              </div>
              <div className="row" style={{ gap: 7 }}>
                <span className="badge badge--ok" style={{ fontSize: 11 }}>Completo</span>
                <button className="btn btn--ghost btn--sm" onClick={() => onAnalyze(l)}><Icon name="eye" size={14} />Ver lote</button>
                <button className="btn btn--soft btn--sm" onClick={() => window.print()}><Icon name="download" size={14} />PDF</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── FONTES ─── */
function FontesScreen() {
  const rows = FONTES.map((f, i) => ({
    ...f,
    registros: [128400, 96200, 74100, 41200, 33800][i],
    sync: ['agora', '2 min', '5 min', '12 min', '18 min'][i],
    ok: i !== 3,
  }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="panel" style={{ padding: 26 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Por que confiar</div>
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.02em', maxWidth: 560, lineHeight: 1.2 }}>Cada número tem uma origem verificável.<br />Nenhum dado é inferido.</div>
        <div className="row" style={{ gap: 36, marginTop: 20 }}>
          <div><div style={{ fontSize: 32, fontWeight: 900 }}><CountUp value={373700} /></div><div style={{ fontSize: 13, color: 'var(--t-mid)' }}>registros indexados</div></div>
          <div><div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent-ink)' }}>5</div><div style={{ fontSize: 13, color: 'var(--t-mid)' }}>fontes conectadas</div></div>
          <div><div style={{ fontSize: 32, fontWeight: 900 }}>100%</div><div style={{ fontSize: 13, color: 'var(--t-mid)' }}>governamentais</div></div>
        </div>
      </div>
      <div className="panel" style={{ overflow: 'hidden' }}>
        <div className="row between" style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Fontes conectadas</div>
          <span className="row" style={{ gap: 7, fontSize: 12.5, color: 'var(--t-low)' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} className="pulse" />Sincronizando em tempo real</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'inherit' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Órgão','Sigla','Registros','Última atualização','Status'].map((h, i) => (
              <th key={i} style={{ padding: '11px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-low)', letterSpacing: '.07em', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map((f, i) => (
              <tr key={f.id} style={{ borderTop: i ? '1px solid var(--border)' : 0 }}>
                <td style={{ padding: '15px 20px' }}>
                  <div className="row" style={{ gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: f.cor, color: '#fff', fontWeight: 800, fontSize: 9.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{f.sigla}</div>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{f.nome}</span>
                  </div>
                </td>
                <td style={{ padding: '15px 20px' }}><span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700 }}>{f.sigla}</span></td>
                <td style={{ padding: '15px 20px' }}><span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>{f.registros.toLocaleString('pt-BR')}</span></td>
                <td style={{ padding: '15px 20px', fontSize: 13.5, color: 'var(--t-mid)' }}>há {f.sync}</td>
                <td style={{ padding: '15px 20px' }}>
                  {f.ok
                    ? <span className="badge badge--ok"><Icon name="check" size={11} sw={2.8} />Ativa</span>
                    : <span className="badge badge--info"><Icon name="clock" size={11} />Sincronizando</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── CONTA (tabbed: perfil, assinatura, api, segurança, notif, privacidade) ─── */
function ContaScreen({ theme, setTheme, plan, onUpgrade }) {
  const [tab, setTab] = rsS('perfil');
  const [org, setOrg] = rsS({ rfb: true, pgfn: true, spu: true, detran: false, compras: true });
  const [notif, setNotif] = rsS({ edital: true, push: true, sms: false, resumo: true });
  const [copied, setCopied] = rsS(false);
  const TABS = [['perfil','Perfil'],['assinatura','Assinatura'],['api','API'],['notif','Notificações'],['orgaos','Órgãos'],['aparencia','Aparência'],['seguranca','Segurança']];
  const copyKey = () => { try { navigator.clipboard.writeText('fia_live_8a2f4c7e91b03f9a'); } catch {} setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const TRow = ({ label, val }) => (
    <div className="row between" style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13.5, color: 'var(--t-mid)' }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{val}</span>
    </div>
  );
  const Toggle = ({ state, set, k, t, d }) => (
    <div className="row between" style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
      <div><div style={{ fontSize: 14, fontWeight: 600 }}>{t}</div>{d && <div style={{ fontSize: 12.5, color: 'var(--t-mid)', marginTop: 2 }}>{d}</div>}</div>
      <div className={'switch' + (state[k] ? ' on' : '')} onClick={() => set(v => ({ ...v, [k]: !v[k] }))}><i /></div>
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 20, alignItems: 'start' }}>
      <div className="panel" style={{ padding: 8, position: 'sticky', top: 80 }}>
        {TABS.map(([v, t]) => (
          <button key={v} onClick={() => setTab(v)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 12px', borderRadius: 9, border: 0, cursor: 'pointer', font: 'inherit', fontSize: 13.5, fontWeight: tab === v ? 700 : 500, background: tab === v ? 'color-mix(in srgb,var(--brand) 10%,transparent)' : 'transparent', color: tab === v ? 'var(--brand-ink)' : 'var(--t-mid)', textAlign: 'left', marginBottom: 2 }}>
            {t}
          </button>
        ))}
      </div>
      <div>
        {tab === 'perfil' && (
          <div className="panel" style={{ padding: 26 }}>
            <div className="row" style={{ gap: 16, marginBottom: 24 }}>
              <div className="avatar" style={{ width: 60, height: 60, fontSize: 22 }}>JV</div>
              <div><div style={{ fontWeight: 800, fontSize: 18 }}>João Vitor Mendes</div><div style={{ color: 'var(--t-mid)', fontSize: 14, marginTop: 3 }}>joao.mendes@email.com</div><span className="badge badge--accent" style={{ marginTop: 8 }}>Plano Avaliação</span></div>
            </div>
            <TRow label="Telefone" val="(11) 9 8842-1190" />
            <TRow label="CPF" val="***.418.220-**" />
            <TRow label="Membro desde" val="Junho 2026" />
            <TRow label="Órgãos monitorados" val="RFB, PGFN e SPU" />
            <button className="btn btn--ghost" style={{ marginTop: 16 }}><Icon name="settings" size={15} />Editar perfil</button>
          </div>
        )}
        {tab === 'assinatura' && (
          <div className="panel" style={{ padding: 26 }}>
            <div className="row between" style={{ marginBottom: 18 }}><div style={{ fontWeight: 700, fontSize: 15 }}>Plano atual</div><span className="badge badge--accent">Avaliação gratuita</span></div>
            <div className="bar" style={{ marginBottom: 8 }}><i style={{ width: '40%' }} /></div>
            <div style={{ fontSize: 13, color: 'var(--t-mid)', marginBottom: 22 }}>2 de 5 análises utilizadas</div>
            <div style={{ padding: 20, borderRadius: 14, background: 'linear-gradient(135deg,var(--brand),#13294d)', color: '#fff', marginBottom: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Profissional — R$ 197/mês</div>
              <div style={{ fontSize: 13, opacity: .85, marginTop: 5, lineHeight: 1.5 }}>Análises ilimitadas, alertas de editais e relatórios PDF com rastreabilidade completa.</div>
              <button className="btn btn--accent" onClick={onUpgrade} style={{ marginTop: 14 }}><Icon name="zap" size={15} fill="currentColor" />Assinar agora</button>
            </div>
            <TRow label="Método de pagamento" val="Não cadastrado" />
            <TRow label="Próxima cobrança" val="—" />
            <TRow label="Garantia" val="7 dias, reembolso integral" />
          </div>
        )}
        {tab === 'api' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="panel" style={{ padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Chave de API</div>
              <div style={{ fontSize: 13, color: 'var(--t-mid)', marginBottom: 16 }}>Disponível no plano Corporativo. Integre dados oficiais ao seu sistema.</div>
              <div className="inset" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <Icon name="lock" size={17} style={{ color: 'var(--t-mid)' }} />
                <span style={{ fontFamily: 'monospace', fontSize: 13.5, flex: 1, minWidth: 180 }}>fia_live_8a2f••••••••••••3f9a</span>
                <button className="btn btn--soft btn--sm" onClick={copyKey}><Icon name={copied ? 'check' : 'doc'} size={13} />{copied ? 'Copiada' : 'Copiar'}</button>
                <button className="btn btn--ghost btn--sm"><Icon name="settings" size={13} />Regenerar</button>
              </div>
              <div className="row between" style={{ marginTop: 14 }}><span style={{ fontSize: 13, color: 'var(--t-mid)' }}>Endpoint base</span><code style={{ fontSize: 12.5, background: 'var(--surface-2)', padding: '4px 9px', borderRadius: 7, border: '1px solid var(--border)' }}>https://api.fonte.ia/v1</code></div>
            </div>
            <div className="panel" style={{ padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Endpoints disponíveis</div>
              {[['GET','/lotes','Lista lotes com filtros'],['GET','/lotes/:id','Detalhes e score do lote'],['GET','/lotes/:id/rastreabilidade','Cadeia de fontes oficiais'],['GET','/fontes','Órgãos conectados'],['POST','/webhooks','Registrar endpoint de alerta']].map(([m,p,d],i) => (
                <div key={i} className="row" style={{ gap: 12, padding: '11px 0', borderTop: '1px solid var(--border)' }}>
                  <span className="badge badge--info num" style={{ minWidth: 42, justifyContent: 'center', fontSize: 11 }}>{m}</span>
                  <code style={{ fontSize: 13, fontWeight: 600 }}>{p}</code>
                  <span style={{ fontSize: 13, color: 'var(--t-mid)', marginLeft: 'auto' }}>{d}</span>
                </div>
              ))}
              <button className="btn btn--ghost" style={{ marginTop: 14, width: '100%' }}><Icon name="external" size={14} />Documentação da API</button>
            </div>
          </div>
        )}
        {tab === 'notif' && (
          <div className="panel" style={{ padding: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Notificações</div>
            <div style={{ fontSize: 13, color: 'var(--t-mid)', marginBottom: 4 }}>Como você quer ser avisado dos editais.</div>
            <Toggle state={notif} set={setNotif} k="edital" t="Novos editais" d="Quando um órgão publica um novo lote." />
            <Toggle state={notif} set={setNotif} k="push" t="Push no navegador" d="Alerta imediato de novos lotes." />
            <Toggle state={notif} set={setNotif} k="sms" t="SMS" d="Apenas lotes da lista de alertas." />
            <Toggle state={notif} set={setNotif} k="resumo" t="Resumo semanal" d="Os melhores lotes da semana, por e-mail." />
          </div>
        )}
        {tab === 'orgaos' && (
          <div className="panel" style={{ padding: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Órgãos monitorados</div>
            <div style={{ fontSize: 13, color: 'var(--t-mid)', marginBottom: 8 }}>Escolha quais fontes acompanhar.</div>
            {FONTES.map((f, i) => (
              <div key={f.id} className="row between" style={{ padding: '13px 0', borderTop: i ? '1px solid var(--border)' : 0 }}>
                <div className="row" style={{ gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: f.cor, color: '#fff', fontWeight: 800, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{f.sigla}</div>
                  <div><div style={{ fontSize: 14, fontWeight: 600 }}>{f.nome}</div><div style={{ fontSize: 11.5, color: 'var(--t-low)', marginTop: 1 }}>{f.sigla}</div></div>
                </div>
                <div className={'switch' + (org[f.id] ? ' on' : '')} onClick={() => setOrg(v => ({ ...v, [f.id]: !v[f.id] }))}><i /></div>
              </div>
            ))}
          </div>
        )}
        {tab === 'aparencia' && (
          <div className="panel" style={{ padding: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Tema</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[['light','Claro','sun'],['dark','Escuro','moon']].map(([v,t,ic]) => (
                <button key={v} onClick={() => setTheme(v)} style={{ padding: 18, textAlign: 'left', cursor: 'pointer', borderRadius: 13, border: `2px solid ${theme === v ? 'var(--brand-ink)' : 'var(--border)'}`, background: theme === v ? 'color-mix(in srgb,var(--brand) 8%,transparent)' : 'var(--surface)', boxShadow: theme === v ? '0 0 0 3px var(--ring)' : 'none', transition: 'all .18s' }}>
                  <div className="row between" style={{ marginBottom: 10 }}><Icon name={ic} size={18} style={{ color: theme === v ? 'var(--brand-ink)' : 'var(--t-mid)' }} />{theme === v && <Icon name="check" size={16} style={{ color: 'var(--brand-ink)' }} sw={2.5} />}</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{t}</div>
                  <div style={{ height: 28, borderRadius: 7, marginTop: 10, background: v === 'dark' ? 'linear-gradient(135deg,#0E1626,#16223A)' : 'linear-gradient(135deg,#fff,#EEF2F8)', border: '1px solid var(--border)' }} />
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === 'seguranca' && (
          <div className="panel" style={{ padding: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Segurança</div>
            {[['lock','Alterar senha'],['shield','Verificação em 2 etapas'],['eye','Sessões ativas']].map(([ic, t]) => (
              <button key={t} className="btn btn--ghost btn--block" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="row" style={{ gap: 10 }}><Icon name={ic} size={15} />{t}</span>
                <Icon name="chevright" size={15} />
              </button>
            ))}
            <button className="btn btn--ghost btn--block" style={{ justifyContent: 'flex-start', marginTop: 8, color: 'var(--danger)' }}><Icon name="logout" size={15} />Sair da conta</button>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { AlertasScreen, RelatoriosScreen, FontesScreen, ContaScreen });
