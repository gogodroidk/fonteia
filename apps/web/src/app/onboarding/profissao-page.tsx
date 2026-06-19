/**
 * Onboarding por Profissão — Fonte.ia
 *
 * Exporta: OnboardingProfissaoPage (named export, default também)
 * Rota sugerida: /onboarding/profissao
 *
 * Fluxo:
 *   Passo 0 — Boas-vindas + qual é sua área? (profissão)
 *   Passo 1 — O que você quer? (objetivo)
 *   Passo 2 — Cidade / região? (texto livre, opcional)
 *   Passo 3 — Plano personalizado (estático, sem IA)
 *
 * Sem libs novas. Sem chamadas de IA. Sem tabelas no banco.
 * Salva perfil em localStorage (key: fonteia.perfil).
 */

import { useState, useCallback } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronRight,
  FileSearch,
  Gavel,
  Globe,
  Landmark,
  Leaf,
  MapPin,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import {
  type ObjetivoId,
  type PerfilOnboarding,
  type PlanoUso,
  type ProfissaoId,
  gerarPlano,
  salvarPerfil,
} from "../../lib/onboarding-profissao";

// ─── Dados das opções ──────────────────────────────────────────────────────

const PROFISSOES: {
  id: ProfissaoId;
  icon: React.ElementType;
  titulo: string;
  desc: string;
  /** Dica curta exibida assim que o usuário seleciona a profissão */
  hint: string;
}[] = [
  {
    id: "advogado",
    icon: Scale,
    titulo: "Advogado(a)",
    desc: "Consultoria, due diligence ou contencioso.",
    hint: "Recomendamos começar por: Empresas — confira sanções CEIS/CNEP antes de aceitar um cliente.",
  },
  {
    id: "contador",
    icon: BookOpen,
    titulo: "Contador(a)",
    desc: "Captação de clientes e compliance contábil.",
    hint: "Recomendamos começar por: Empresas — filtre por CNAE e cidade para prospectar clientes qualificados.",
  },
  {
    id: "despachante",
    icon: Briefcase,
    titulo: "Despachante",
    desc: "Regularização e documentação empresarial.",
    hint: "Recomendamos começar por: Empresas — situação cadastral e sócios sem precisar do site da Receita.",
  },
  {
    id: "vendedor",
    icon: TrendingUp,
    titulo: "Vendedor B2B / Prestador",
    desc: "Vendo produto ou serviço para empresas.",
    hint: "Recomendamos começar por: Licitações — encontre editais abertos no seu nicho antes da concorrência.",
  },
  {
    id: "empresario",
    icon: Building2,
    titulo: "Empresário(a)",
    desc: "Gestão estratégica e expansão de negócios.",
    hint: "Recomendamos começar por: Licitações — monitore concorrentes e oportunidades no seu setor.",
  },
  {
    id: "compliance",
    icon: BadgeCheck,
    titulo: "Compliance / Auditoria",
    desc: "Gestão de risco e due diligence corporativa.",
    hint: "Recomendamos começar por: Empresas — cheque fornecedores em CEIS/CNEP/CEPIM com um clique.",
  },
  {
    id: "jornalista",
    icon: Globe,
    titulo: "Jornalista / Transparência",
    desc: "Investigação e dados de interesse público.",
    hint: "Recomendamos começar por: Política — cruze políticos com empresas e contratos públicos.",
  },
  {
    id: "comprador_leilao",
    icon: Gavel,
    titulo: "Comprador de leilão",
    desc: "Arrematação de lotes judiciais e da Receita.",
    hint: "Recomendamos começar por: Lotes — radar de oportunidades com score, prazo e Raio-X com IA.",
  },
  {
    id: "outro",
    icon: Users,
    titulo: "Outro",
    desc: "Meu perfil não está na lista acima.",
    hint: "Recomendamos começar por: Empresas ou Licitações — os módulos mais usados na plataforma.",
  },
];

const OBJETIVOS: {
  id: ObjetivoId;
  icon: React.ElementType;
  titulo: string;
  desc: string;
}[] = [
  { id: "vender_mais",         icon: TrendingUp, titulo: "Vender mais",           desc: "Encontrar clientes e oportunidades de negócio." },
  { id: "avaliar_risco",       icon: Target,     titulo: "Avaliar risco",          desc: "Due diligence de empresas, sócios e contratos." },
  { id: "acompanhar_politica", icon: Landmark,   titulo: "Acompanhar política",    desc: "Mandatos, gastos públicos e transparência." },
  { id: "achar_leiloes",       icon: Gavel,      titulo: "Achar leilões",          desc: "Lotes judiciais e da Receita com score de oportunidade." },
  { id: "monitorar_empresas",  icon: FileSearch, titulo: "Monitorar empresas",     desc: "CNPJ, sócios, sanções e alterações cadastrais." },
];

// Mapeamento ícone por rota (para o plano final)
const ICONE_ROTA: Record<string, React.ElementType> = {
  "/empresas":   Building2,
  "/licitacoes": Briefcase,
  "/lotes":      Gavel,
  "/juridico":   Scale,
  "/politica":   Landmark,
  "/municipios": MapPin,
  "/ambiental":  Leaf,
  "/alertas":    Bell,
  "/inpi":       BookOpen,
};

const TOTAL_STEPS = 4;

// ─── Componente ────────────────────────────────────────────────────────────

interface Props {
  /** Chamado quando o usuário conclui ou pula o onboarding */
  onFinish: (perfil?: PerfilOnboarding) => void;
  /** Nome opcional para saudação */
  nome?: string;
}

export function OnboardingProfissaoPage({ onFinish, nome }: Props) {
  const [step, setStep] = useState(0);
  const [profissao, setProfissao] = useState<ProfissaoId | null>(null);
  const [objetivo, setObjetivo] = useState<ObjetivoId | null>(null);
  const [cidade, setCidade] = useState("");
  const [plano, setPlano] = useState<PlanoUso | null>(null);

  const primeiroNome = (nome ?? "").split(" ")[0] || null;
  const progressPct = Math.round(((step + 1) / TOTAL_STEPS) * 100);

  const profissaoSelecionada = profissao !== null
    ? PROFISSOES.find((p) => p.id === profissao) ?? null
    : null;

  const avancarParaObjetivo = useCallback(() => {
    if (!profissao) return;
    setStep(1);
  }, [profissao]);

  const avancarParaCidade = useCallback(() => {
    if (!objetivo) return;
    setStep(2);
  }, [objetivo]);

  const gerarEAvancar = useCallback(() => {
    if (!profissao || !objetivo) return;
    const cidadeTrimada = cidade.trim();
    const perfil: PerfilOnboarding = cidadeTrimada
      ? { profissao, objetivo, cidade: cidadeTrimada, criadoEm: new Date().toISOString() }
      : { profissao, objetivo, criadoEm: new Date().toISOString() };
    const p = gerarPlano(perfil);
    salvarPerfil(perfil);
    setPlano(p);
    setStep(3);
  }, [profissao, objetivo, cidade]);

  const concluir = useCallback(() => {
    if (!profissao || !objetivo) {
      onFinish(undefined);
      return;
    }
    const cidadeTrimada = cidade.trim();
    const perfilAtual: PerfilOnboarding = cidadeTrimada
      ? { profissao, objetivo, cidade: cidadeTrimada, criadoEm: new Date().toISOString() }
      : { profissao, objetivo, criadoEm: new Date().toISOString() };
    onFinish(perfilAtual);
  }, [profissao, objetivo, cidade, onFinish]);

  const pular = useCallback(() => {
    onFinish(undefined);
  }, [onFinish]);

  return (
    <div className="onboarding">
      <style>{ESTILOS}</style>

      <div className="onboarding-card">

        {/* ── Cabeçalho ── */}
        <div className="onboarding-head">
          <div className="brand-mark">f</div>
          <div
            className="onboarding-steps"
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={TOTAL_STEPS}
            aria-label={`Passo ${step + 1} de ${TOTAL_STEPS}`}
          >
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={`onb-dot${i <= step ? " active" : ""}`}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>

        {/* ── Barra de progresso ── */}
        <div className="bar" aria-hidden="true" style={{ marginBottom: "24px" }}>
          <i
            style={{
              width: `${progressPct}%`,
              transition: "width 0.35s cubic-bezier(.4,0,.2,1)",
            }}
          />
        </div>

        {/* ══════════════════════════════════════
            PASSO 0 — Boas-vindas + qual é sua área?
            ══════════════════════════════════════ */}
        {step === 0 && (
          <div className="onboarding-body rise" key="step-0">
            <span className="onboarding-eyebrow">
              <Sparkles size={13} aria-hidden="true" />
              Bem-vindo ao Fonte.ia
            </span>

            <h1 className="onboarding-body-h1">
              {primeiroNome ? `${primeiroNome}, o` : "O"} que você faz?
            </h1>

            {/* Mini intro — o que é a Fonte.ia */}
            <div className="onb-intro-banner" role="note" aria-label="O que é o Fonte.ia">
              <p className="onb-intro-lead">
                A Fonte.ia transforma dados públicos do Brasil em respostas rastreáveis —
                com a fonte sempre citada. Veja o que você pode fazer:
              </p>
              <div className="onb-intro-exemplos" role="list">
                <div className="onb-intro-exemplo" role="listitem">
                  <Gavel size={14} aria-hidden="true" className="onb-intro-icon" />
                  <span>Encontrar leilões da Receita com score de oportunidade</span>
                </div>
                <div className="onb-intro-exemplo" role="listitem">
                  <ShieldCheck size={14} aria-hidden="true" className="onb-intro-icon" />
                  <span>Pesquisar empresas, sócios e sanções por CNPJ</span>
                </div>
                <div className="onb-intro-exemplo" role="listitem">
                  <Zap size={14} aria-hidden="true" className="onb-intro-icon" />
                  <span>Analisar editais e licitações com IA — fonte citada</span>
                </div>
              </div>
            </div>

            <p className="onboarding-sub onb-sub-area">
              Escolha sua área para montar um plano sob medida. Leva menos de 1 minuto.
            </p>

            <div
              className="onboarding-options onb-grid"
              role="group"
              aria-label="Selecione sua profissão"
            >
              {PROFISSOES.map(({ id, icon: Icon, titulo, desc }) => (
                <button
                  key={id}
                  type="button"
                  className={`onboarding-option${profissao === id ? " selected" : ""}`}
                  onClick={() => setProfissao(id)}
                  aria-pressed={profissao === id}
                >
                  <div className="onboarding-option-icon" aria-hidden="true">
                    <Icon size={20} />
                  </div>
                  <div>
                    <strong>{titulo}</strong>
                    <span>{desc}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Hint personalizado após escolher profissão */}
            {profissaoSelecionada !== null && (
              <div className="onb-hint" role="note" aria-live="polite">
                <CheckCircle2 size={16} className="onb-hint-icon" aria-hidden="true" />
                <div className="onb-hint-text">
                  <strong>Recomendado para você</strong>
                  {profissaoSelecionada.hint}
                </div>
              </div>
            )}

            <div className="onb-footer">
              <button type="button" className="onb-btn-skip" onClick={pular}>
                Pular
              </button>
              <button
                type="button"
                className="onb-btn-primary"
                style={{ flex: "1", maxWidth: "200px" }}
                disabled={profissao === null}
                onClick={avancarParaObjetivo}
              >
                Continuar <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            PASSO 1 — O que você quer?
            ══════════════════════════════════════ */}
        {step === 1 && (
          <div className="onboarding-body rise" key="step-1">
            <span className="onboarding-eyebrow">
              <Target size={13} aria-hidden="true" />
              Passo 2 de 3
            </span>

            <h1 className="onboarding-body-h1">
              O que você quer aqui?
            </h1>
            <p className="onboarding-sub">
              Isso ajusta o painel para mostrar o que importa pra você. Pode mudar depois.
            </p>

            <div
              className="onboarding-options"
              role="group"
              aria-label="Selecione seu objetivo"
            >
              {OBJETIVOS.map(({ id, icon: Icon, titulo, desc }) => (
                <button
                  key={id}
                  type="button"
                  className={`onboarding-option${objetivo === id ? " selected" : ""}`}
                  onClick={() => setObjetivo(id)}
                  aria-pressed={objetivo === id}
                >
                  <div className="onboarding-option-icon" aria-hidden="true">
                    <Icon size={20} />
                  </div>
                  <div>
                    <strong>{titulo}</strong>
                    <span>{desc}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="onb-footer">
              <button
                type="button"
                className="onb-btn-skip"
                onClick={() => setStep(0)}
              >
                Voltar
              </button>
              <button
                type="button"
                className="onb-btn-primary"
                style={{ flex: "1", maxWidth: "200px" }}
                disabled={objetivo === null}
                onClick={avancarParaCidade}
              >
                Continuar <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            PASSO 2 — Cidade / região
            ══════════════════════════════════════ */}
        {step === 2 && (
          <div className="onboarding-body rise" key="step-2">
            <span className="onboarding-eyebrow">
              <MapPin size={13} aria-hidden="true" />
              Passo 3 de 3
            </span>

            <h1 className="onboarding-body-h1">
              Cidade ou região?
            </h1>
            <p className="onboarding-sub">
              Usamos para filtrar licitações, municípios e leilões próximos a você.
              Campo opcional — pode deixar em branco.
            </p>

            <div className="onb-cidade-wrap">
              <MapPin
                size={16}
                className="onb-cidade-icon"
                aria-hidden="true"
              />
              <input
                className="input onb-cidade-input"
                type="text"
                placeholder="Ex.: São Paulo, Curitiba, Nordeste…"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") gerarEAvancar();
                }}
                maxLength={80}
                aria-label="Cidade ou região (opcional)"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            <p className="onb-honest" style={{ marginTop: "8px", marginBottom: "0" }}>
              Não guardamos sua localização — apenas usamos para personalizar os filtros.
            </p>

            <div className="onb-footer" style={{ marginTop: "var(--s-5)" }}>
              <button
                type="button"
                className="onb-btn-skip"
                onClick={() => setStep(1)}
              >
                Voltar
              </button>
              <button
                type="button"
                className="onb-btn-primary"
                style={{ flex: "1", maxWidth: "240px" }}
                onClick={gerarEAvancar}
              >
                Ver meu plano <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            PASSO 3 — Plano personalizado
            ══════════════════════════════════════ */}
        {step === 3 && plano && (
          <div className="onboarding-body rise" key="step-3">
            <span className="onboarding-eyebrow">
              <Sparkles size={13} aria-hidden="true" />
              Seu plano personalizado
            </span>

            <h1 className="onboarding-body-h1">
              {plano.titulo}
            </h1>
            <p className="onboarding-sub" style={{ marginBottom: "var(--s-4)" }}>
              {plano.descricao}
            </p>

            {/* Resumo de perfil */}
            <div className="onb-summary" role="region" aria-label="Seu perfil">
              <div className="onb-summary-row">
                <span className="onb-summary-label">Perfil</span>
                <span className="onb-summary-value">
                  {PROFISSOES.find((p) => p.id === profissao)?.titulo ?? profissao}
                </span>
              </div>
              <div className="onb-summary-row">
                <span className="onb-summary-label">Objetivo</span>
                <span className="onb-summary-value">
                  {OBJETIVOS.find((o) => o.id === objetivo)?.titulo ?? objetivo}
                </span>
              </div>
              {cidade.trim() && (
                <div className="onb-summary-row">
                  <span className="onb-summary-label">Região</span>
                  <span className="onb-summary-value">{cidade.trim()}</span>
                </div>
              )}
            </div>

            {/* 3 ações concretas */}
            <p className="onb-secao-label">
              <CheckCircle2 size={14} aria-hidden="true" />
              3 primeiros passos para você
            </p>
            <ul className="onb-acoes" aria-label="Ações recomendadas">
              {plano.acoes.map((acao, i) => {
                const IconeRota = ICONE_ROTA[acao.rota] ?? ChevronRight;
                return (
                  <li key={i} className="onb-acao-item">
                    <div className="onb-acao-num" aria-hidden="true">
                      {i + 1}
                    </div>
                    <div className="onb-acao-corpo">
                      <strong>{acao.rotulo}</strong>
                      <span>{acao.detalhe}</span>
                      <a
                        href={acao.rota}
                        className="onb-acao-link"
                        aria-label={`Ir para ${acao.rota}`}
                      >
                        <IconeRota size={13} aria-hidden="true" />
                        {acao.rota}
                        <ChevronRight size={12} aria-hidden="true" />
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Busca recomendada */}
            <div className="onb-destaque onb-destaque--brand" role="note">
              <div className="onb-destaque-label">
                <Target size={13} aria-hidden="true" />
                Busca recomendada
              </div>
              <p className="onb-destaque-texto">{plano.buscaRecomendada.rotulo}</p>
              <a
                href={plano.buscaRecomendada.rota}
                className="onb-acao-link"
                aria-label={`Ir para ${plano.buscaRecomendada.rota}`}
              >
                {(() => {
                  const I = ICONE_ROTA[plano.buscaRecomendada.rota] ?? ChevronRight;
                  return <I size={13} aria-hidden="true" />;
                })()}
                {plano.buscaRecomendada.rota}
                <ChevronRight size={12} aria-hidden="true" />
              </a>
            </div>

            {/* Alerta recomendado */}
            <div className="onb-destaque onb-destaque--accent" role="note">
              <div className="onb-destaque-label">
                <Bell size={13} aria-hidden="true" />
                Alerta recomendado
              </div>
              <p className="onb-destaque-texto">{plano.alertaRecomendado.rotulo}</p>
              <a
                href={plano.alertaRecomendado.rota}
                className="onb-acao-link"
                aria-label={`Ir para ${plano.alertaRecomendado.rota}`}
              >
                {(() => {
                  const I = ICONE_ROTA[plano.alertaRecomendado.rota] ?? ChevronRight;
                  return <I size={13} aria-hidden="true" />;
                })()}
                {plano.alertaRecomendado.rota}
                <ChevronRight size={12} aria-hidden="true" />
              </a>
            </div>

            {/* CTA */}
            <button
              type="button"
              className="onb-btn-primary"
              style={{ marginTop: "var(--s-5)" }}
              onClick={concluir}
            >
              <ArrowRight size={18} aria-hidden="true" />
              Começar agora
            </button>

            <div style={{ textAlign: "center", marginTop: "10px" }}>
              <button
                type="button"
                className="onb-btn-skip"
                onClick={() => setStep(2)}
              >
                Voltar
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default OnboardingProfissaoPage;

// ─── Estilos escopados ────────────────────────────────────────────────────

const ESTILOS = `
  /* ── Onboarding Profissão — estilos escopados (não toca CSS global) ── */

  .onboarding {
    align-items: flex-start !important;
    padding: 16px !important;
  }
  .onboarding-card {
    margin: auto;
  }

  /* Grid 2 colunas para as profissões (telas >= 480 px) */
  .onb-grid {
    display: grid !important;
    grid-template-columns: 1fr 1fr;
    gap: 8px !important;
  }
  @media (max-width: 479px) {
    .onb-grid {
      grid-template-columns: 1fr !important;
    }
  }

  /* Banner de intro — o que é a Fonte.ia */
  .onb-intro-banner {
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--brand) 6%, var(--surface-2));
    border: 1px solid color-mix(in srgb, var(--brand) 18%, transparent);
    padding: 14px 16px;
    margin: 0 0 var(--s-4);
  }
  .onb-intro-lead {
    font-size: 13.5px;
    color: var(--t-mid);
    line-height: 1.5;
    margin: 0 0 10px;
  }
  .onb-intro-exemplos {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .onb-intro-exemplo {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;
    color: var(--t-hi);
    line-height: 1.4;
    font-weight: 500;
  }
  .onb-intro-icon {
    color: var(--brand-ink);
    flex-shrink: 0;
    margin-top: 2px;
  }

  /* Sub separador antes do grid */
  .onb-sub-area {
    margin-top: 0 !important;
    margin-bottom: var(--s-3) !important;
  }

  /* Hint de recomendação após escolha de profissão */
  .onb-hint {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 11px 13px;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--ok) 8%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--ok) 25%, transparent);
    margin-top: 12px;
    animation: onb-hint-in 0.2s ease both;
  }
  @keyframes onb-hint-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .onb-hint-icon {
    color: var(--ok);
    flex-shrink: 0;
    margin-top: 1px;
  }
  .onb-hint-text {
    font-size: 13px;
    color: var(--t-mid);
    line-height: 1.45;
  }
  .onb-hint-text strong {
    display: block;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 3px;
    color: var(--ok);
  }

  /* Campo cidade */
  .onb-cidade-wrap {
    position: relative;
    margin-bottom: 4px;
  }
  .onb-cidade-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--t-low);
    pointer-events: none;
  }
  .onb-cidade-input {
    padding-left: 38px !important;
    font-size: 15px !important;
    width: 100%;
    box-sizing: border-box;
  }

  /* Seção label (antes das ações) */
  .onb-secao-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--t-low);
    margin: 0 0 10px;
  }

  /* Lista de ações */
  .onb-acoes {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--s-4);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .onb-acao-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px;
    border-radius: var(--r-md);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .onb-acao-num {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--brand) 14%, transparent);
    color: var(--brand-ink);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 800;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .onb-acao-corpo {
    flex: 1;
    min-width: 0;
  }
  .onb-acao-corpo strong {
    display: block;
    font-size: 13.5px;
    font-weight: 700;
    color: var(--t-hi);
    line-height: 1.25;
    margin-bottom: 3px;
  }
  .onb-acao-corpo span {
    display: block;
    font-size: 12.5px;
    color: var(--t-mid);
    line-height: 1.45;
    margin-bottom: 7px;
  }
  .onb-acao-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11.5px;
    font-weight: 700;
    color: var(--brand-ink);
    text-decoration: none;
    border-radius: 6px;
    padding: 2px 6px;
    background: color-mix(in srgb, var(--brand) 10%, transparent);
    transition: background 0.15s;
  }
  .onb-acao-link:hover {
    background: color-mix(in srgb, var(--brand) 18%, transparent);
  }
  .onb-acao-link:focus-visible {
    outline: 2px solid var(--ring, var(--brand));
    outline-offset: 2px;
  }

  /* Destaque (busca / alerta) */
  .onb-destaque {
    border-radius: var(--r-md);
    padding: 12px 14px;
    margin-bottom: 10px;
    border: 1px solid var(--border);
  }
  .onb-destaque--brand {
    background: color-mix(in srgb, var(--brand) 7%, var(--surface));
    border-color: color-mix(in srgb, var(--brand) 20%, transparent);
  }
  .onb-destaque--accent {
    background: color-mix(in srgb, var(--accent) 7%, var(--surface));
    border-color: color-mix(in srgb, var(--accent) 20%, transparent);
  }
  .onb-destaque-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--t-low);
    margin-bottom: 5px;
  }
  .onb-destaque--brand .onb-destaque-label { color: var(--brand-ink); }
  .onb-destaque--accent .onb-destaque-label { color: var(--accent-ink); }
  .onb-destaque-texto {
    font-size: 13px;
    font-weight: 600;
    color: var(--t-hi);
    margin: 0 0 7px;
    line-height: 1.35;
  }

  /* Resumo de perfil */
  .onb-summary {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    margin: 0 0 var(--s-4);
  }
  .onb-summary-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .onb-summary-label {
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--t-low);
  }
  .onb-summary-value {
    font-size: 13px;
    font-weight: 700;
    color: var(--accent-ink);
  }

  /* Nota honesta */
  .onb-honest {
    font-size: 12px;
    color: var(--t-low);
    text-align: center;
    line-height: 1.45;
    padding: 0 4px;
    margin: 0 0 var(--s-4);
  }

  /* Botão primário */
  .onb-btn-primary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 52px;
    padding: 14px 20px;
    border-radius: var(--r-md);
    background: linear-gradient(180deg, var(--brand-2), var(--brand));
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    border: 0;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
    -webkit-tap-highlight-color: transparent;
  }
  .onb-btn-primary:hover { opacity: 0.92; }
  .onb-btn-primary:active { transform: scale(0.98); }
  .onb-btn-primary:focus-visible {
    outline: 2px solid var(--ring, var(--brand));
    outline-offset: 3px;
  }
  .onb-btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }

  /* Botão skip / voltar */
  .onb-btn-skip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 8px 12px;
    background: none;
    border: 0;
    color: var(--t-mid);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border-radius: var(--r-md);
    transition: color 0.15s, background 0.15s;
    -webkit-tap-highlight-color: transparent;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .onb-btn-skip:hover { color: var(--t-hi); background: var(--surface-2); }
  .onb-btn-skip:focus-visible {
    outline: 2px solid var(--ring, var(--brand));
    outline-offset: 2px;
  }

  /* Footer de ações */
  .onb-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: var(--s-5);
  }

  /* Dot indicadores de passo */
  .onb-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--border-2);
    transition: background 0.25s, transform 0.2s;
  }
  .onb-dot.active {
    background: var(--brand-ink);
    transform: scale(1.2);
  }

  /* Mobile < 400px */
  @media (max-width: 400px) {
    .onboarding-card { padding: 24px 16px !important; }
    .onb-footer {
      flex-direction: column-reverse;
      align-items: stretch;
      gap: 8px;
    }
    .onb-btn-skip { align-self: center; }
    .onboarding-body-h1 { font-size: 20px !important; }
    .onb-btn-primary { max-width: 100% !important; }
  }

  @media (prefers-reduced-motion: reduce) {
    .onb-btn-primary, .onb-btn-skip { transition: none; }
    .rise { animation: none !important; }
    .onb-dot { transition: none; }
    .onb-acao-link { transition: none; }
    .onb-hint { animation: none; }
    @keyframes onb-hint-in { from { opacity: 1; } }
  }
`;
