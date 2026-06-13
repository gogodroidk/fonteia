// app-shell.jsx v2 — adult, clean sidebar + topbar + paywall
const { useState: uS2, useEffect: uE2 } = React;

const NAV = [
  { id: 'painel',    label: 'Painel',      icon: 'grid'     },
  { id: 'lotes',     label: 'Lotes',       icon: 'layers'   },
  { id: 'alertas',   label: 'Alertas',     icon: 'bell'     },
  { id: 'relatorios',label: 'Relatórios',  icon: 'file'     },
  { id: 'fontes',    label: 'Fontes',      icon: 'database' },
];
const NAV2 = [
  { id: 'conta',     label: 'Conta',       icon: 'user'     },
];

function Sidebar({ route, setRoute, plan, usesLeft, onUpgrade, collapsed, onToggle }) {
  const NavItem = ({ it }) => {
    const on = route === it.id || (it.id === 'lotes' && route === 'detalhe');
    return (
      <button onClick={() => setRoute(it.id)} title={collapsed ? it.label : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 11, width: '100%',
          padding: collapsed ? '12px 14px' : '10px 13px', justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius: 11, border: '1px solid transparent', cursor: 'pointer', position: 'relative',
          background: on ? 'color-mix(in srgb,var(--brand) 10%,transparent)' : 'transparent',
          color: on ? 'var(--brand-ink)' : 'var(--t-mid)',
          font: 'inherit', fontWeight: on ? 700 : 500, fontSize: 14, letterSpacing: on ? 0 : '.002em',
          transition: 'all .15s',
        }}
        onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}
      >
        {on && <span style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, background: 'var(--brand-ink)' }} />}
        <Icon name={it.icon} size={18} sw={on ? 2.1 : 1.7} />
        {!collapsed && <span>{it.label}</span>}
      </button>
    );
  };

  return (
    <aside style={{
      width: collapsed ? 68 : 232, flex: '0 0 auto', borderRight: '1px solid var(--border)',
      background: 'var(--surface)', display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0, transition: 'width .22s', zIndex: 20, overflow: 'hidden',
    }}>
      {/* logo */}
      <div style={{ padding: collapsed ? '20px 0' : '20px 18px 16px', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start', alignItems: 'center' }}>
        {collapsed
          ? <FSymbol v="node" s={28} ink="var(--t-hi)" accent="var(--accent-ink)" />
          : <LockupH symS={26} wordS={20} ink="var(--t-hi)" accent="var(--accent-ink)" sub="var(--t-low)" />}
      </div>

      {/* main nav */}
      <nav style={{ padding: collapsed ? '0 10px' : '0 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {NAV.map(it => <NavItem key={it.id} it={it} />)}
      </nav>

      <div style={{ flex: 1 }} />

      {/* secondary nav */}
      <nav style={{ padding: collapsed ? '0 10px' : '0 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {NAV2.map(it => <NavItem key={it.id} it={it} />)}
      </nav>

      {/* usage meter */}
      <div style={{ padding: collapsed ? '14px 10px' : '14px 14px', marginTop: 6 }}>
        {plan === 'free'
          ? collapsed
            ? <button className="btn btn--accent btn--icon btn--sm" onClick={onUpgrade} title="Plano" style={{ width: '100%', borderRadius: 10 }}><Icon name="zap" size={16} fill="currentColor" /></button>
            : <div style={{ padding: 13, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-hi)' }}>Plano Avaliação</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-ink)' }}>{usesLeft}/5</span>
                </div>
                <div className="bar"><i style={{ width: ((5 - usesLeft) / 5 * 100) + '%', background: usesLeft <= 1 ? 'var(--danger)' : undefined }} /></div>
                <button className="btn btn--accent btn--sm btn--block" onClick={onUpgrade} style={{ marginTop: 10, fontSize: 12 }}>
                  <Icon name="zap" size={13} fill="currentColor" />Ampliar acesso
                </button>
              </div>
          : !collapsed && <div style={{ padding: '10px 12px', borderRadius: 10, background: 'color-mix(in srgb,var(--accent) 10%,transparent)', border: '1px solid color-mix(in srgb,var(--accent) 24%,transparent)', fontSize: 12, fontWeight: 600, color: 'var(--accent-ink)' }}>
              <Icon name="check" size={13} sw={2.5} style={{ verticalAlign: -2 }} /> Profissional ativo
            </div>
        }
      </div>

      {/* collapse toggle */}
      <button onClick={onToggle} title={collapsed ? 'Expandir' : 'Recolher'} style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--t-low)', padding: 8, borderRadius: 8, width: '100%' }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--t-hi)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--t-low)'}>
        <Icon name={collapsed ? 'chevright' : 'chevleft'} size={16} />
      </button>
    </aside>
  );
}

function Topbar({ route, theme, setTheme, onSearch, onUpgrade, plan, onBell, bellUnread }) {
  const titles = {
    painel: 'Painel', lotes: 'Lotes', detalhe: 'Análise do lote',
    alertas: 'Alertas', relatorios: 'Relatórios', fontes: 'Fontes', conta: 'Conta',
  };
  const user = (() => { try { return JSON.parse(localStorage.getItem('fonteia_user')) || null; } catch { return null; } })();
  const initials = user ? user.name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase() : 'JV';
  return (
    <header className="no-print" style={{
      height: 62, borderBottom: '1px solid var(--border)',
      background: 'var(--glass)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
      position: 'sticky', top: 0, zIndex: 15,
      display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px',
    }}>
      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--t-hi)' }}>{titles[route] || 'Fonte.ia'}</div>
      <div style={{ flex: 1, maxWidth: 400, marginLeft: 'auto' }}>
        <div className="searchbar" onClick={onSearch} style={{ cursor: 'pointer' }}>
          <Icon name="search" size={16} style={{ color: 'var(--t-low)' }} />
          <input placeholder="Buscar lote, órgão ou edital…" readOnly style={{ cursor: 'pointer', fontSize: 13.5 }} />
          <span className="kbd" style={{ fontSize: 11 }}>⌘K</span>
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <ThemeToggle theme={theme} setTheme={setTheme} />
        <button className="btn btn--icon btn--ghost" style={{ position: 'relative' }} onClick={onBell} title="Notificações">
          <Icon name="bell" size={18} />
          {bellUnread > 0 && <span style={{ position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: 5, background: 'var(--danger)', border: '2px solid var(--surface)' }} />}
        </button>
        {plan === 'free' && <button className="btn btn--accent btn--sm no-print" onClick={onUpgrade} style={{ marginLeft: 4, fontSize: 13 }}><Icon name="zap" size={14} fill="currentColor" />Profissional</button>}
        <div className="avatar" style={{ width: 36, height: 36, fontSize: 13, marginLeft: 4, cursor: 'pointer' }} title={user ? user.name : 'Conta'}>{initials}</div>
      </div>
    </header>
  );
}

/* ---- MODAL base ---- */
function Modal({ open, onClose, children, max = 460 }) {
  uE2(() => { const h = e => { if (e.key === 'Escape') onClose(); }; if (open) window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(4,8,18,.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className="panel elevated" style={{ width: '100%', maxWidth: max, boxShadow: 'var(--shadow-xl)', animation: 'rise .3s cubic-bezier(.2,.7,.3,1)' }}>{children}</div>
    </div>
  );
}

/* ---- PAYWALL ---- */
function Paywall({ open, onClose, onChoose, trigger }) {
  return (
    <Modal open={open} onClose={onClose} max={820}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr' }}>
        <div style={{ padding: '32px 30px 28px', background: 'var(--surface-2)', borderRadius: 'var(--r-xl) 0 0 var(--r-xl)', position: 'relative', overflow: 'hidden' }}>
          <div className="orb" style={{ width: 200, height: 160, background: 'var(--accent)', top: -40, right: -20, opacity: .2 }} />
          <span className="badge badge--info" style={{ marginBottom: 16 }}><Icon name="lock" size={12} />Limite de avaliação atingido</span>
          <div className="h1" style={{ fontSize: 23, marginBottom: 12 }}>{trigger || 'Você já conhece a análise.'}<br />Amplie o acesso.</div>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.65, marginBottom: 22 }}>Você utilizou suas <b className="t-hi">5 análises de avaliação</b> gratuitas. O plano Profissional libera análises ilimitadas de qualquer lote governamental, sem restrição.</p>
          {['Análises ilimitadas de lotes', 'Alertas de novos editais', 'Relatórios com rastreabilidade'].map(t => (
            <div key={t} className="row" style={{ gap: 10, marginBottom: 10 }}><Icon name="check" size={16} style={{ color: 'var(--accent-ink)' }} sw={2.6} /><span className="small" style={{ lineHeight: 1.4 }}>{t}</span></div>
          ))}
        </div>
        <div style={{ padding: '32px 26px 28px' }}>
          <div className="row between" style={{ marginBottom: 8 }}><div className="eyebrow">Profissional</div><button className="btn btn--icon btn--ghost btn--sm" onClick={onClose}><Icon name="x" size={15} /></button></div>
          <div className="row" style={{ alignItems: 'baseline', gap: 5, margin: '8px 0 4px' }}>
            <span className="display num" style={{ fontSize: 42, whiteSpace: 'nowrap' }}>R$&nbsp;197</span>
            <span className="muted" style={{ fontWeight: 600 }}>/mês</span>
          </div>
          <div className="small muted" style={{ marginBottom: 18, lineHeight: 1.5 }}>Cancelamento a qualquer momento. Menor que a taxa de um único lote mal analisado.</div>
          <button className="btn btn--accent btn--lg btn--block" onClick={() => onChoose('pro')} style={{ marginBottom: 10 }}><Icon name="zap" size={16} fill="currentColor" />Assinar o Profissional</button>
          <button className="btn btn--ghost btn--block" onClick={() => onChoose('plans')} style={{ marginBottom: 16 }}>Ver todos os planos</button>
          <div className="inset" style={{ padding: 12, display: 'flex', gap: 9, alignItems: 'center' }}>
            <Icon name="shieldcheck" size={18} style={{ color: 'var(--accent-ink)' }} />
            <span className="tiny muted"><b className="t-hi">Garantia de 7 dias.</b> Reembolso integral sem questionamentos.</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ---- SEARCH MODAL ---- */
function SearchModal({ open, onClose, onPick }) {
  const [q, setQ] = uS2('');
  const list = LEILOES.filter(l => q === '' || (l.titulo + l.vara + l.processo + l.cidade).toLowerCase().includes(q.toLowerCase()));
  uE2(() => { if (open) setQ(''); }, [open]);
  return (
    <Modal open={open} onClose={onClose} max={540}>
      <div className="searchbar" style={{ border: 0, borderBottom: '1px solid var(--border)', borderRadius: 0, padding: '4px 18px' }}>
        <Icon name="search" size={19} style={{ color: 'var(--t-low)' }} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar lote, órgão, edital…" style={{ padding: '16px 0', fontSize: 15 }} />
        <span className="kbd">esc</span>
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto', padding: 8 }}>
        {list.map(l => (
          <button key={l.id} onClick={() => { onPick(l); onClose(); }}
            style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: '11px 12px', border: 0, background: 'transparent', cursor: 'pointer', borderRadius: 10, textAlign: 'left', font: 'inherit', transition: 'background .14s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <Icon name={catIcon(l.tipo)} size={17} style={{ color: 'var(--t-mid)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="small" style={{ fontWeight: 600 }}>{l.titulo}</div>
              <div className="tiny muted">{l.vara} · {l.processo}</div>
            </div>
            <span className="num small" style={{ fontWeight: 700 }}>{BRL(l.minimo)}</span>
          </button>
        ))}
        {list.length === 0 && <div className="muted small" style={{ padding: 24, textAlign: 'center' }}>Nenhum lote encontrado.</div>}
      </div>
    </Modal>
  );
}

/* ---- TOAST ---- */
function Toast({ msg, show }) {
  if (!show) return null;
  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 120 }}>
      <div className="elevated" style={{ borderRadius: 12, padding: '12px 18px', display: 'flex', gap: 10, alignItems: 'center', boxShadow: 'var(--shadow-xl)' }}>
        <Icon name="check" size={16} style={{ color: 'var(--accent-ink)' }} sw={2.6} />
        <span className="small" style={{ fontWeight: 600 }}>{msg}</span>
      </div>
    </div>
  );
}

/* ---- NOTIFICATIONS PANEL ---- */
function NotificationsPanel({ open, onClose }) {
  const NOTIFS = [
    { id: 1, type: 'edital', icon: 'layers', color: 'var(--brand-ink)', title: 'Novo edital publicado', desc: 'RFB — Santos publicou 3 novos lotes de eletrônicos.', time: 'há 8 min', unread: true },
    { id: 2, type: 'prazo', icon: 'clock', color: 'var(--warn)', title: 'Lote encerrando em breve', desc: 'Lote RFB-0042-87 encerra em 6 dias · 18 jun às 14:00.', time: 'há 1h', unread: true },
    { id: 3, type: 'score', icon: 'shieldcheck', color: 'var(--ok)', title: 'Score alto detectado', desc: 'Novo lote PGFN-0455-72 com score 91 — risco baixo.', time: 'há 3h', unread: true },
    { id: 4, type: 'relatorio', icon: 'file', color: 'var(--accent-ink)', title: 'Relatório gerado', desc: 'Relatório do lote RFB-0118-31 foi gerado com sucesso.', time: 'ontem', unread: false },
    { id: 5, type: 'sistema', icon: 'database', color: 'var(--t-mid)', title: 'Fontes atualizadas', desc: 'PGFN sincronizou 1.240 novos registros.', time: 'ontem', unread: false },
  ];
  const [notifs, setNotifs] = uS2(NOTIFS);
  const markAll = () => setNotifs(n => n.map(x => ({ ...x, unread: false })));
  uE2(() => { const h = e => { if (e.key === 'Escape') onClose(); }; if (open) window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open]);
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 98, background: 'rgba(4,8,18,.35)' }} />
      <div style={{
        position: 'fixed', top: 62, right: 16, zIndex: 99, width: 360, maxHeight: 520,
        background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 16,
        boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'rise .25s cubic-bezier(.2,.7,.3,1)',
      }}>
        <div className="row between" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Notificações</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="link tiny" onClick={markAll} style={{ fontSize: 12.5 }}>Marcar todas como lidas</button>
            <button className="btn btn--icon btn--ghost btn--sm" onClick={onClose} style={{ width: 28, height: 28 }}><Icon name="x" size={14} /></button>
          </div>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {notifs.map((n, i) => (
            <div key={n.id} style={{ display: 'flex', gap: 13, padding: '14px 18px', borderTop: i ? '1px solid var(--border)' : 0, background: n.unread ? 'color-mix(in srgb,var(--brand) 5%,transparent)' : 'transparent', cursor: 'pointer', transition: 'background .14s' }}
              onClick={() => setNotifs(ns => ns.map(x => x.id === n.id ? { ...x, unread: false } : x))}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = n.unread ? 'color-mix(in srgb,var(--brand) 5%,transparent)' : 'transparent'}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={n.icon} size={17} style={{ color: n.color }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: n.unread ? 700 : 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                  {n.title}
                  {n.unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--brand-ink)', display: 'inline-block' }} />}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--t-mid)', marginTop: 3, lineHeight: 1.45 }}>{n.desc}</div>
                <div style={{ fontSize: 11.5, color: 'var(--t-low)', marginTop: 5 }}>{n.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { NotificationsPanel });
