/**
 * CerebroGuide — onboarding amigável para leigos no módulo Cérebro.
 *
 * Explica em português simples o que é o Cérebro, como usar em 3 passos,
 * oferece exemplos clicáveis e uma legenda de cores. Pode ser dispensado
 * (localStorage) e reaberto.
 *
 * Props:
 *   onExample(query)  — chamado quando o usuário clica em um chip de exemplo
 *   defaultOpen?      — se true, ignora o estado do localStorage e exibe aberto
 *
 * SSG-safe: sem acesso a window/document/localStorage no módulo ou na 1ª
 * renderização síncrona. Todos os acessos ficam dentro de useEffect.
 */

import { useEffect, useId, useState } from "react";
import { MousePointerClick, Search, Share2, X } from "lucide-react";

/* ─── tipos ─── */
export interface CerebroGuideProps {
  /** Chamado quando o usuário clica em um chip de exemplo. O valor é um nome ou CNPJ. */
  onExample: (query: string) => void;
  /**
   * Se true, exibe o guia aberto independente do localStorage.
   * Omitir = usa localStorage para lembrar se já foi dispensado.
   */
  defaultOpen?: boolean | undefined;
}

/* ─── dados estáticos ─── */
const PASSOS = [
  {
    numero: 1,
    icone: Search,
    titulo: "Digite um nome ou CNPJ",
    descricao: "Pode ser o nome de uma empresa, uma pessoa, uma marca ou uma prefeitura.",
  },
  {
    numero: 2,
    icone: Share2,
    titulo: "Veja o mapa de conexões",
    descricao: "O Cérebro monta um grafo visual ligando a entidade a contratos, sócios, processos, sanções e muito mais.",
  },
  {
    numero: 3,
    icone: MousePointerClick,
    titulo: "Clique em um ponto para ver detalhes",
    descricao: "Cada nó abre uma ficha com as informações e o link para a fonte oficial.",
  },
] as const;

interface Exemplo {
  rotulo: string;
  valor: string;
}

const EXEMPLOS: Exemplo[] = [
  { rotulo: "Banco do Brasil", valor: "Banco do Brasil" },
  { rotulo: "Petrobras", valor: "Petrobras" },
  { rotulo: "Magazine Luiza", valor: "Magazine Luiza" },
  { rotulo: "Prefeitura de São Paulo", valor: "Prefeitura de São Paulo" },
  { rotulo: "Vivo (CNPJ)", valor: "02558157000162" },
];

const LS_KEY = "fonteia.cerebro.guideSeen";

/* ─── estilos scoped ─── */
const GUIDE_STYLES = `
.cerebro-guide-section {
  container-type: inline-size;
}

.cerebro-guide-card {
  padding: 20px 22px 18px;
  box-shadow: var(--shadow-md);
}

.cerebro-guide-steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cerebro-guide-step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.cerebro-guide-step-num {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand), var(--accent));
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
}

.cerebro-guide-step-icon {
  flex-shrink: 0;
  color: var(--accent-ink);
  margin-top: 3px;
}

.cerebro-guide-step-body {
  flex: 1;
  min-width: 0;
}

.cerebro-guide-step-title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--t-hi);
  margin: 0 0 2px;
  line-height: 1.3;
}

.cerebro-guide-step-desc {
  font-size: 12.5px;
  color: var(--t-mid);
  margin: 0;
  line-height: 1.5;
}

.cerebro-guide-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.cerebro-guide-chip-btn {
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 13px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--t-mid);
  cursor: pointer;
  transition: border-color 0.18s, color 0.18s, background 0.18s;
  white-space: nowrap;
  min-height: 40px;
  font-family: var(--font);
  line-height: 1;
}

.cerebro-guide-chip-btn:hover,
.cerebro-guide-chip-btn:focus-visible {
  border-color: var(--brand-ink);
  color: var(--brand-ink);
  background: color-mix(in srgb, var(--brand) 8%, var(--surface));
  outline: none;
}

.cerebro-guide-chip-btn:focus-visible {
  box-shadow: 0 0 0 3px var(--ring);
}

.cerebro-guide-chip-btn:active {
  transform: scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .cerebro-guide-chip-btn {
    transition: none;
  }
}

.cerebro-guide-reopen-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--t-mid);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 8px 14px;
  cursor: pointer;
  transition: border-color 0.18s, color 0.18s;
  min-height: 40px;
  font-family: var(--font);
  line-height: 1;
}

.cerebro-guide-reopen-btn:hover,
.cerebro-guide-reopen-btn:focus-visible {
  border-color: var(--border-2);
  color: var(--t-hi);
  outline: none;
}

.cerebro-guide-reopen-btn:focus-visible {
  box-shadow: 0 0 0 3px var(--ring);
}

@media (prefers-reduced-motion: reduce) {
  .cerebro-guide-reopen-btn {
    transition: none;
  }
}

@container (min-width: 540px) {
  .cerebro-guide-steps {
    flex-direction: row;
    align-items: stretch;
  }

  .cerebro-guide-step {
    flex: 1;
    flex-direction: column;
    gap: 8px;
  }

  .cerebro-guide-step-icon {
    margin-top: 0;
  }
}
`;

/* ─── componente principal ─── */
export function CerebroGuide({ onExample, defaultOpen }: CerebroGuideProps) {
  const headingId = useId();

  // Inicializa como "aberto" por segurança (SSG) — useEffect corrige depois
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Se defaultOpen foi passado como true, ignora localStorage
    if (defaultOpen === true) {
      setOpen(true);
      return;
    }
    // Lê localStorage para saber se já foi dispensado
    try {
      const seen = localStorage.getItem(LS_KEY);
      if (seen === "1") {
        setOpen(false);
      }
    } catch {
      // localStorage pode estar bloqueado (modo privativo restrito)
    }
  }, [defaultOpen]);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(LS_KEY, "1");
    } catch {
      // silencia erro de localStorage bloqueado
    }
  }

  function reopen() {
    setOpen(true);
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      // silencia
    }
  }

  // Durante SSR/SSG, renderiza o guia completo para não bloquear SEO.
  // Após montar, aplica a lógica de localStorage.
  const showFull = !mounted || open;

  if (!showFull) {
    return (
      <section aria-label="Como usar o Cérebro" className="cerebro-guide-section">
        <style>{GUIDE_STYLES}</style>
        <button
          type="button"
          className="cerebro-guide-reopen-btn"
          onClick={reopen}
          aria-label="Reabrir guia — Como usar o Cérebro"
        >
          <Search size={14} aria-hidden="true" />
          Como funciona?
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label="Como usar o Cérebro"
      aria-labelledby={headingId}
      className="cerebro-guide-section"
    >
      <style>{GUIDE_STYLES}</style>

      <div className="panel cerebro-guide-card">
        {/* Cabeçalho */}
        <div
          className="row between"
          style={{ gap: 12, marginBottom: 6, flexWrap: "wrap" }}
        >
          <div>
            <p className="eyebrow" style={{ margin: "0 0 4px" }}>
              Guia rápido
            </p>
            <h2
              id={headingId}
              className="h2"
              style={{ margin: 0, fontSize: 18 }}
            >
              O que é o Cérebro?
            </h2>
          </div>

          <button
            type="button"
            className="btn btn--icon btn--soft btn--sm"
            onClick={dismiss}
            aria-label="Fechar guia"
            style={{ flexShrink: 0, minWidth: 40, minHeight: 40 }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Descrição */}
        <p
          style={{
            margin: "0 0 16px",
            fontSize: 14,
            color: "var(--t-mid)",
            lineHeight: 1.6,
            maxWidth: 560,
          }}
        >
          É um mapa visual que conecta uma empresa, pessoa ou marca a{" "}
          <strong style={{ color: "var(--t-hi)", fontWeight: 700 }}>tudo</strong>{" "}
          que existe sobre ela nos dados públicos do Brasil. Você digita um nome
          ou CNPJ e vê as ligações — sócios, contratos, processos, sanções e
          muito mais.
        </p>

        {/* 3 passos */}
        <ol
          className="cerebro-guide-steps"
          aria-label="Como usar em 3 passos"
          style={{ marginBottom: 16 }}
        >
          {PASSOS.map((passo) => {
            const Icone = passo.icone;
            return (
              <li key={passo.numero} className="cerebro-guide-step">
                <span
                  className="cerebro-guide-step-num"
                  aria-hidden="true"
                >
                  {passo.numero}
                </span>
                <Icone
                  size={16}
                  aria-hidden="true"
                  className="cerebro-guide-step-icon"
                />
                <div className="cerebro-guide-step-body">
                  <p className="cerebro-guide-step-title">{passo.titulo}</p>
                  <p className="cerebro-guide-step-desc">{passo.descricao}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Chips de exemplo */}
        <div style={{ marginBottom: 14 }}>
          <p
            className="small"
            style={{
              margin: "0 0 8px",
              fontWeight: 700,
              color: "var(--t-mid)",
            }}
          >
            Experimente:
          </p>
          <div className="cerebro-guide-chips" role="list">
            {EXEMPLOS.map((ex) => (
              <div key={ex.rotulo} role="listitem">
                <button
                  type="button"
                  className="cerebro-guide-chip-btn"
                  onClick={() => onExample(ex.valor)}
                  aria-label={`Pesquisar por ${ex.rotulo}`}
                >
                  {ex.rotulo}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Legenda de cores */}
        <div
          className="inset"
          style={{ padding: "8px 12px" }}
        >
          <p
            className="tiny muted"
            style={{ margin: 0, lineHeight: 1.6 }}
          >
            <strong style={{ color: "var(--t-mid)", fontWeight: 700 }}>
              Cada cor é um tipo de informação;
            </strong>{" "}
            cada linha é uma ligação. Linhas tracejadas são ligações indiretas
            (mesma cidade, mesmo nome).
          </p>
        </div>

        {/* Botão de dispensar */}
        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={dismiss}
          >
            Entendi
          </button>
        </div>
      </div>
    </section>
  );
}

export default CerebroGuide;
