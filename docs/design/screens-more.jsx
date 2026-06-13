// screens-more.jsx — Sources, Reports, Watchlist, Account, Settings
const { useState: uSm } = React;

/* ---------------- SOURCES & TRACEABILITY ---------------- */
function SourcesScreen() {
  const rows = FONTES.map((f, i) => ({ ...f, registros: [128400, 96200, 74100, 41200, 33800][i], sync: ['agora', '2 min', '5 min', '12 min', '18 min'][i], status: i === 3 ? 'sync' : 'ok' }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="panel" style={{ padding: 26, position: 'relative', overflow: 'hidden' }}>
        <div className="orb" style={{ width: 220, height: 180, background: 'var(--brand)', top: -40, right: 40, opacity: .25 }} />
        <div className="row between wrap" style={{ gap: 16 }}>
          <div style={{ maxWidth: 540 }}>
            <span className="eyebrow">Por que confiar</span>
            <div className="h1" style={{ fontSize: 24, marginTop: 8 }}>Todo dado vem de uma fonte oficial — e você vê de onde.</div>
            <p className="muted" style={{ marginTop: 10, fontSize: 14.5, lineHeight: 1.6 }}>A Fonte.ia cruza Receita Federal, PGFN, Patrimônio da União e demais órgãos oficiais em tempo real. Nada é "achismo": cada número tem origem rastreável e auditável.</p>
          </div>
          <div className="row" style={{ gap: 26 }}>
            <div><div className="display" style={{ fontSize: 32 }}><CountUp value={373700} /></div><div className="tiny muted">registros indexados</div></div>
            <div><div className="display t-accent" style={{ fontSize: 32 }}>5</div><div className="tiny muted">fontes conectadas</div></div>
          </div>
        </div>
      </div>
      <div className="panel" style={{ overflow: 'hidden' }}>
        <div className="row between" style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}><div className="h3">Fontes conectadas</div><span className="row tiny muted" style={{ gap: 6 }}><span className="dot pulse" style={{ background: 'var(--ok)' }} />Sincronizando ao vivo</span></div>
        {rows.map((f, i) => (
          <div key={f.id} className="row between" style={{ padding: '16px 22px', borderTop: i ? '1px solid var(--border)' : 0 }}>
            <div className="row" style={{ gap: 14 }}>
              <div className="num" style={{ width: 44, height: 44, borderRadius: 11, background: f.cor, color: '#fff', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{f.sigla}</div>
              <div><div className="small" style={{ fontWeight: 700 }}>{f.nome}</div><div className="tiny muted num">{f.registros.toLocaleString('pt-BR')} registros · sync há {f.sync}</div></div>
            </div>
            <div className="row" style={{ gap: 12 }}>
              {f.status === 'ok' ? <span className="badge badge--ok"><Icon name="check" size={12} sw={3} />Verificada</span> : <span className="badge badge--info"><Icon name="clock" size={12} />Sincronizando</span>}
              <div className="switch on"><i /></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- REPORTS ---------------- */
function ReportsScreen({ onUpgrade }) {
  const reps = [
    { t: 'Lote 42 — Smartphones e notebooks (RFB)', d: '12 jun 2026', tag: 'Completo', score: 94 },
    { t: 'Toyota Hilux SW4 2023 — importada (RFB)', d: '11 jun 2026', tag: 'Completo', score: 88 },
    { t: 'Maquinário industrial CNC (RFB)', d: '09 jun 2026', tag: 'Completo', score: 79 },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row between wrap" style={{ gap: 12 }}>
        <p className="muted small" style={{ maxWidth: 500 }}>Relatórios em PDF com selo de fonte oficial, prontos pra anexar em pareceres e apresentar a clientes.</p>
        <button className="btn btn--primary" onClick={onUpgrade}><Icon name="plus" size={16} />Novo relatório</button>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {reps.map((r, i) => (
          <div key={i} className="card card--hover" style={{ overflow: 'hidden' }}>
            <div style={{ padding: 18, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ height: 5, width: 64, borderRadius: 4, background: 'linear-gradient(90deg,#0B2240,#1D5FE0 70%,#14BBA4)', marginBottom: 14 }} />
              <LockupH symS={20} wordS={15} ink="var(--t-hi)" accent="var(--accent-ink)" sub="var(--t-low)" />
              <div className="tiny muted" style={{ marginTop: 14 }}>Relatório de rastreabilidade</div>
              {[80, 60, 90].map((w, j) => <div key={j} className="skeleton" style={{ height: 6, width: w + '%', marginTop: 7 }} />)}
            </div>
            <div style={{ padding: 16 }}>
              <div className="small" style={{ fontWeight: 700 }}>{r.t}</div>
              <div className="row between" style={{ marginTop: 10 }}>
                <span className="tiny muted">{r.d} · <span className="badge badge--ok" style={{ fontSize: 10 }}>{r.tag}</span></span>
                <div className="row" style={{ gap: 6 }}><button className="btn btn--icon btn--ghost btn--sm" style={{ width: 32, height: 32 }}><Icon name="eye" size={15} /></button><button className="btn btn--icon btn--soft btn--sm" style={{ width: 32, height: 32 }}><Icon name="download" size={15} /></button></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- WATCHLIST & ALERTS ---------------- */
function WatchlistScreen({ watch, toggleWatch, onAnalyze }) {
  const saved = LEILOES.filter(l => watch.has(l.id));
  const list = saved.length ? saved : LEILOES.slice(0, 2);
  const [alerts, setAlerts] = uSm({ praca: true, regiao: true, queda: true, score: false });
  const AlertRow = ({ k, t, s }) => (
    <div className="row between" style={{ padding: '14px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 360 }}><div className="small" style={{ fontWeight: 600 }}>{t}</div><div className="tiny muted">{s}</div></div>
      <div className={'switch' + (alerts[k] ? ' on' : '')} onClick={() => setAlerts(a => ({ ...a, [k]: !a[k] }))}><i /></div>
    </div>
  );
  return (
    <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="h3">{saved.length ? `${saved.length} lotes salvos` : 'Sugestões para acompanhar'}</div>
        {list.map(l => {
          const desc = Math.round((1 - l.minimo / l.avaliacao) * 100);
          return (
            <div key={l.id} className="card card--hover" style={{ padding: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: 12, flex: '0 0 auto', background: l.tipo === 'veiculo' ? 'linear-gradient(135deg,#1e3a5f,#0f2942)' : 'linear-gradient(135deg,#1d3b6e,#13294d)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={catIcon(l.tipo)} size={26} style={{ color: 'rgba(255,255,255,.4)' }} /></div>
              <div style={{ flex: 1 }}>
                <div className="small" style={{ fontWeight: 700 }}>{l.titulo}</div>
                <div className="tiny muted" style={{ marginTop: 3 }}><Icon name="pin" size={12} style={{ verticalAlign: -2 }} /> {l.cidade} · encerra {l.dataFim}</div>
                <div className="row" style={{ gap: 8, marginTop: 8 }}><span className="num" style={{ fontWeight: 800 }}>{BRL(l.minimo)}</span><span className="badge badge--accent num">-{desc}%</span></div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn--soft btn--sm" onClick={() => onAnalyze(l)}>Analisar</button>
                <button className="btn btn--icon btn--ghost btn--sm" onClick={() => toggleWatch(l.id)} title="Remover"><Icon name="star" size={16} fill="currentColor" style={{ color: 'var(--accent-ink)' }} /></button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="panel" style={{ padding: 22 }}>
        <div className="row" style={{ gap: 10, marginBottom: 6 }}><Icon name="bell" size={18} style={{ color: 'var(--brand-ink)' }} /><div className="h3">Alertas inteligentes</div></div>
        <p className="tiny muted">Avisamos antes de o prazo do edital encerrar.</p>
        <AlertRow k="praca" t="Novo edital de leilão" s="Quando um órgão publica um novo lote." />
        <AlertRow k="regiao" t="Novo lote no órgão que sigo" s="Receita Federal, PGFN e SPU." />
        <AlertRow k="queda" t="Reavaliação de valor" s="Avise quando o lance mínimo cair." />
        <AlertRow k="score" t="Score acima de 85" s="Só os lotes mais seguros." />
        <div className="inset" style={{ marginTop: 16, padding: 14, display: 'flex', gap: 10, alignItems: 'center', background: 'color-mix(in srgb,var(--warn) 9%,var(--surface-2))' }}>
          <Icon name="clock" size={18} style={{ color: 'var(--warn)' }} />
          <span className="tiny"><b>3 lotes</b> da sua watchlist encerram nesta semana.</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- ACCOUNT ---------------- */
function AccountScreen({ usesLeft, onUpgrade }) {
  const used = 5 - usesLeft;
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1.3fr', alignItems: 'start' }}>
      <div className="panel" style={{ padding: 24 }}>
        <div className="row" style={{ gap: 16 }}>
          <div className="avatar" style={{ width: 64, height: 64, fontSize: 24 }}>JV</div>
          <div><div className="h3" style={{ fontSize: 18 }}>João Vitor Mendes</div><div className="small muted">joao.mendes@email.com</div><span className="badge badge--accent" style={{ marginTop: 8 }}>Plano Avaliação</span></div>
        </div>
        <hr className="divide" style={{ margin: '20px 0' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[['Telefone', '(11) 9 8842-1190'], ['CPF', '***.418.220-**'], ['Membro desde', 'Junho 2026'], ['Órgãos monitorados', 'RFB, PGFN e SPU']].map(([k, v]) =>
            <div key={k} className="row between" style={{ padding: '11px 0', borderTop: '1px solid var(--border)' }}><span className="small muted">{k}</span><span className="small" style={{ fontWeight: 600 }}>{v}</span></div>)}
        </div>
        <button className="btn btn--ghost btn--block" style={{ marginTop: 18 }}><Icon name="settings" size={16} />Editar perfil</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="panel" style={{ padding: 24, position: 'relative', overflow: 'hidden' }}>
          <div className="orb" style={{ width: 180, height: 140, background: 'var(--accent)', top: -40, right: -20, opacity: .25 }} />
          <div className="row between" style={{ marginBottom: 16 }}><div className="h3">Seu uso</div><span className="badge badge--neutral">ciclo atual</span></div>
          <div className="row between" style={{ marginBottom: 8 }}><span className="small muted">Análises usadas</span><span className="num small" style={{ fontWeight: 700 }}>{used} de 5</span></div>
          <div className="bar" style={{ height: 10, marginBottom: 18 }}><i style={{ width: (used / 5) * 100 + '%' }} /></div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="inset" style={{ padding: 14 }}><div className="tiny muted">Economia mapeada</div><div className="num display" style={{ fontSize: 22 }}>R$ 1,2M</div></div>
            <div className="inset" style={{ padding: 14 }}><div className="tiny muted">Relatórios gerados</div><div className="num display" style={{ fontSize: 22 }}>3</div></div>
          </div>
          <div style={{ marginTop: 18, padding: 18, borderRadius: 14, background: 'linear-gradient(135deg,var(--brand),#13294d)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
            <div className="row between wrap" style={{ gap: 12 }}>
              <div><div style={{ fontWeight: 800, fontSize: 17 }}>Assine o ilimitado</div><div style={{ fontSize: 13, opacity: .85, marginTop: 4 }}>Você já mapeou potenciais R$ 1,2M em economia. Imagine sem limite.</div></div>
              <button className="btn btn--accent" onClick={onUpgrade}><Icon name="zap" size={16} fill="currentColor" />Ver planos</button>
            </div>
          </div>
        </div>
        <div className="panel" style={{ padding: 24 }}>
          <div className="h3" style={{ marginBottom: 14 }}>Faturamento</div>
          <div className="inset" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
            <Icon name="wallet" size={22} style={{ color: 'var(--t-mid)' }} />
            <div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>Nenhum método de pagamento</div><div className="tiny muted">Adicione ao escolher um plano.</div></div>
            <button className="btn btn--soft btn--sm" onClick={onUpgrade}>Adicionar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- SETTINGS (deep, tabbed) ---------------- */
function SettingsScreen({ theme, setTheme }) {
  const [tab, setTab] = uSm('geral');
  const [s, setS] = uSm({ email: true, push: true, sms: false, resumo: true, novoEdital: true, queda: true });
  const [org, setOrg] = uSm({ rfb: true, pgfn: true, spu: true, detran: false, compras: true });
  const [ufs, setUfs] = uSm(['SP', 'MG', 'PR']);
  const [minScore, setMinScore] = uSm(60);
  const [copied, setCopied] = uSm(false);
  const copyKey = () => { try { navigator.clipboard.writeText('fia_live_8a2f4c7e91b03f9a'); } catch (e) {} setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const toggleUf = (u) => setUfs(a => a.includes(u) ? a.filter(x => x !== u) : [...a, u]);
  const TABS = [['geral', 'Geral', 'settings'], ['notif', 'Notificações', 'bell'], ['api', 'API & Integrações', 'database'], ['orgaos', 'Órgãos & filtros', 'layers'], ['seguranca', 'Segurança', 'shield'], ['privacidade', 'Privacidade & dados', 'lock'], ['faturamento', 'Faturamento', 'wallet']];
  const Toggle = ({ k, t, d }) => (
    <div className="row between" style={{ padding: '14px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 440 }}><div className="small" style={{ fontWeight: 600 }}>{t}</div><div className="tiny muted">{d}</div></div>
      <div className={'switch' + (s[k] ? ' on' : '')} onClick={() => setS(v => ({ ...v, [k]: !v[k] }))}><i /></div>
    </div>
  );
  const Sec = ({ title, sub, children }) => (
    <div className="panel" style={{ padding: 24, marginBottom: 16 }}>
      <div className="h3" style={{ marginBottom: sub ? 4 : 14 }}>{title}</div>
      {sub && <p className="tiny muted" style={{ marginBottom: 12 }}>{sub}</p>}
      {children}
    </div>
  );
  return (
    <div className="grid set-grid" style={{ gridTemplateColumns: '236px 1fr', gap: 20, alignItems: 'start' }}>
      <div className="panel" style={{ padding: 10, position: 'sticky', top: 88 }}>
        {TABS.map(([v, t, ic]) => (
          <button key={v} onClick={() => setTab(v)} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '11px 12px', borderRadius: 10, border: 0, cursor: 'pointer', font: 'inherit', fontSize: 13.5, fontWeight: tab === v ? 700 : 600, background: tab === v ? 'color-mix(in srgb,var(--brand) 12%,transparent)' : 'transparent', color: tab === v ? 'var(--brand-ink)' : 'var(--t-mid)', textAlign: 'left', marginBottom: 2 }}>
            <Icon name={ic} size={18} />{t}
          </button>
        ))}
      </div>
      <div>
        {tab === 'geral' && (<>
          <Sec title="Aparência" sub="Escolha como a Fonte.ia se apresenta.">
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[['light', 'Claro', 'sun'], ['dark', 'Escuro', 'moon']].map(([v, t, ic]) => (
                <button key={v} onClick={() => setTheme(v)} className="card" style={{ padding: 16, textAlign: 'left', cursor: 'pointer', borderColor: theme === v ? 'var(--brand-ink)' : 'var(--border)', boxShadow: theme === v ? '0 0 0 3px var(--ring)' : 'var(--shadow-sm)' }}>
                  <div className="row between"><Icon name={ic} size={20} style={{ color: theme === v ? 'var(--brand-ink)' : 'var(--t-mid)' }} />{theme === v && <Icon name="check" size={17} style={{ color: 'var(--brand-ink)' }} sw={2.6} />}</div>
                  <div className="small" style={{ fontWeight: 700, marginTop: 10 }}>{t}</div>
                  <div style={{ height: 34, borderRadius: 8, marginTop: 8, background: v === 'dark' ? 'linear-gradient(135deg,#0E1626,#16223A)' : 'linear-gradient(135deg,#fff,#EEF2F8)', border: '1px solid var(--border)' }} />
                </button>
              ))}
            </div>
          </Sec>
          <Sec title="Idioma & região">
            <div className="row between" style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}><span className="small" style={{ fontWeight: 600 }}>Idioma</span><span className="chip chip--on">Português (BR)</span></div>
            <div className="row between" style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}><span className="small" style={{ fontWeight: 600 }}>Moeda</span><span className="chip">Real (R$)</span></div>
            <div className="row between" style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}><span className="small" style={{ fontWeight: 600 }}>Fuso horário</span><span className="chip">GMT−3 · Brasília</span></div>
          </Sec>
        </>)}
        {tab === 'notif' && (
          <Sec title="Notificações" sub="Como você quer ser avisado dos editais.">
            <Toggle k="novoEdital" t="Novos editais" d="Quando um órgão publica um novo leilão." />
            <Toggle k="email" t="E-mail" d="Resumo diário e alertas importantes." />
            <Toggle k="push" t="Push no navegador" d="Alertas de novos lotes em tempo real." />
            <Toggle k="sms" t="SMS" d="Apenas lotes da watchlist encerrando." />
            <Toggle k="queda" t="Reavaliação de valor" d="Quando o lance mínimo de um lote cai." />
            <Toggle k="resumo" t="Resumo semanal" d="Os melhores lotes da semana, por e-mail." />
          </Sec>
        )}
        {tab === 'api' && (<>
          <Sec title="Chave de API" sub="Integre os dados oficiais da Fonte.ia ao seu sistema.">
            <div className="inset" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Icon name="lock" size={18} style={{ color: 'var(--t-mid)' }} />
              <span className="num small" style={{ flex: 1, fontWeight: 600, letterSpacing: '.02em', minWidth: 180 }}>fia_live_8a2f••••••••••••3f9a</span>
              <button className="btn btn--soft btn--sm" onClick={copyKey}><Icon name={copied ? 'check' : 'doc'} size={14} />{copied ? 'Copiada' : 'Copiar'}</button>
              <button className="btn btn--ghost btn--sm"><Icon name="settings" size={14} />Regenerar</button>
            </div>
            <div className="row between wrap" style={{ marginTop: 14, gap: 8 }}><span className="small muted">Endpoint base</span><span className="num small chip">https://api.fonte.ia/v1</span></div>
          </Sec>
          <Sec title="Uso da API" sub="Disponível no plano Corporativo · renova todo dia 1º.">
            <div className="row between" style={{ marginBottom: 8 }}><span className="small muted">Requisições neste ciclo</span><span className="num small" style={{ fontWeight: 700 }}>3.214 / 10.000</span></div>
            <div className="bar" style={{ height: 9 }}><i style={{ width: '32%' }} /></div>
          </Sec>
          <Sec title="Endpoints disponíveis">
            {[['GET', '/lotes', 'Lista lotes com filtros'], ['GET', '/lotes/:id', 'Detalhe e score do lote'], ['GET', '/lotes/:id/rastreabilidade', 'Cadeia de fontes oficiais'], ['GET', '/fontes', 'Órgãos conectados']].map(([m, p, d], i) => (
              <div key={i} className="row" style={{ gap: 12, padding: '11px 0', borderTop: '1px solid var(--border)' }}>
                <span className="badge badge--info num" style={{ minWidth: 42, justifyContent: 'center' }}>{m}</span>
                <span className="num small" style={{ fontWeight: 600 }}>{p}</span>
                <span className="tiny muted" style={{ marginLeft: 'auto', textAlign: 'right' }}>{d}</span>
              </div>
            ))}
            <button className="btn btn--ghost btn--block" style={{ marginTop: 14 }}><Icon name="external" size={15} />Ver documentação da API</button>
          </Sec>
          <Sec title="Webhooks" sub="Receba editais novos direto no seu endpoint.">
            <div className="row wrap" style={{ gap: 8 }}><input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="https://seusistema.com/webhooks/fonteia" /><button className="btn btn--primary">Adicionar</button></div>
          </Sec>
        </>)}
        {tab === 'orgaos' && (<>
          <Sec title="Órgãos monitorados" sub="Escolha de quais fontes oficiais receber lotes.">
            {FONTES.map((f, i) => (
              <div key={f.id} className="row between" style={{ padding: '12px 0', borderTop: i ? '1px solid var(--border)' : 0 }}>
                <div className="row" style={{ gap: 12 }}><div className="num" style={{ width: 34, height: 34, borderRadius: 9, background: f.cor, color: '#fff', fontWeight: 800, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{f.sigla}</div><span className="small" style={{ fontWeight: 600 }}>{f.nome}</span></div>
                <div className={'switch' + (org[f.id] ? ' on' : '')} onClick={() => setOrg(v => ({ ...v, [f.id]: !v[f.id] }))}><i /></div>
              </div>
            ))}
          </Sec>
          <Sec title="Estados de interesse" sub="Receba alertas só dos estados que importam.">
            <div className="row wrap" style={{ gap: 8 }}>{['SP', 'RJ', 'MG', 'PR', 'SC', 'RS', 'BA', 'DF'].map(u => <button key={u} className={'chip' + (ufs.includes(u) ? ' chip--on' : '')} onClick={() => toggleUf(u)}>{u}</button>)}</div>
          </Sec>
          <Sec title="Filtros padrão" sub="Aplicados sempre que você abre os lotes.">
            <div className="row between" style={{ marginBottom: 10 }}><span className="small" style={{ fontWeight: 600 }}>Score mínimo exibido</span><span className="num small t-accent" style={{ fontWeight: 800 }}>{minScore}</span></div>
            <input type="range" min="0" max="100" value={minScore} onChange={e => setMinScore(+e.target.value)} style={{ width: '100%', accentColor: 'var(--brand)' }} />
          </Sec>
        </>)}
        {tab === 'seguranca' && (
          <Sec title="Segurança">
            <button className="btn btn--ghost btn--block" style={{ justifyContent: 'space-between' }}><span className="row" style={{ gap: 10 }}><Icon name="lock" size={16} />Alterar senha</span><Icon name="chevright" size={16} /></button>
            <button className="btn btn--ghost btn--block" style={{ justifyContent: 'space-between', marginTop: 10 }}><span className="row" style={{ gap: 10 }}><Icon name="shield" size={16} />Verificação em 2 etapas</span><span className="badge badge--ok">Ativa</span></button>
            <button className="btn btn--ghost btn--block" style={{ justifyContent: 'space-between', marginTop: 10 }}><span className="row" style={{ gap: 10 }}><Icon name="eye" size={16} />Sessões ativas</span><span className="tiny muted">2 dispositivos</span></button>
            <button className="btn btn--ghost btn--block" style={{ justifyContent: 'flex-start', marginTop: 10, color: 'var(--danger)' }}><Icon name="logout" size={16} />Sair da conta</button>
          </Sec>
        )}
        {tab === 'privacidade' && (
          <Sec title="Privacidade & dados" sub="Você controla seus dados.">
            <button className="btn btn--ghost btn--block" style={{ justifyContent: 'space-between' }}><span className="row" style={{ gap: 10 }}><Icon name="download" size={16} />Exportar meus dados</span><Icon name="chevright" size={16} /></button>
            <div className="row between" style={{ padding: '14px 0', borderTop: '1px solid var(--border)', marginTop: 10 }}><div><div className="small" style={{ fontWeight: 600 }}>Histórico de análises</div><div className="tiny muted">Manter pelos últimos 12 meses.</div></div><span className="chip">12 meses</span></div>
            <button className="btn btn--ghost btn--block" style={{ justifyContent: 'flex-start', marginTop: 10, color: 'var(--danger)' }}><Icon name="x" size={16} />Excluir minha conta</button>
          </Sec>
        )}
        {tab === 'faturamento' && (<>
          <Sec title="Plano atual">
            <div className="row between"><div><div className="small" style={{ fontWeight: 700 }}>Avaliação (gratuito)</div><div className="tiny muted">5 análises · sem cartão</div></div><span className="badge badge--accent">Free</span></div>
          </Sec>
          <Sec title="Método de pagamento">
            <div className="inset" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}><Icon name="wallet" size={22} style={{ color: 'var(--t-mid)' }} /><div style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>Nenhum método cadastrado</div><div className="tiny muted">Adicione ao assinar um plano.</div></div><button className="btn btn--soft btn--sm">Adicionar</button></div>
          </Sec>
          <Sec title="Histórico de faturas">
            <div className="muted small" style={{ padding: '14px 0', textAlign: 'center' }}>Nenhuma fatura ainda.</div>
          </Sec>
        </>)}
      </div>
    </div>
  );
}

Object.assign(window, { SourcesScreen, ReportsScreen, WatchlistScreen, AccountScreen, SettingsScreen });
