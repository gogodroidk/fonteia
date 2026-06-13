/**
 * ComoDarLance — explica em português leigo os passos REAIS para participar de
 * um leilão de mercadorias da Receita Federal (SLE). Painel inline expansível
 * (default) ou modal acessível. As regras variam por edital — sempre confirmar.
 *
 * Fontes (jun/2026): Receita Federal "Como Participar" (gov.br); portal SLE;
 * passo a passo de habilitação (gov.br nível prata/ouro, e-CAC); regras de DARF
 * e retirada. Não inventa exigências específicas — fala em termos gerais.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CheckSquare, ChevronDown, ChevronUp, ExternalLink, X } from "lucide-react";
import { useFocusTrap } from "../hooks/use-focus-trap";

export interface ComoDarLanceProps {
  sourceUrl: string;
  variant?: "inline" | "modal";
  open?: boolean;
  onClose?: (() => void) | undefined;
}

interface Passo {
  numero: number;
  titulo: string;
  descricao: string;
  aviso?: string | undefined;
}

const PASSOS: Passo[] = [
  {
    numero: 1,
    titulo: "Ter conta gov.br no nível certo",
    descricao:
      "Para acessar o sistema de leilão (SLE), você precisa de uma conta gov.br nível Prata ou Ouro. " +
      "Bronze não basta. Pessoa física: CPF regular e maior de 18 anos. Pessoa jurídica: CNPJ regular, " +
      "e o representante também precisa de conta gov.br Prata/Ouro.",
    aviso:
      "Alguns editais exigem certificado digital (e-CPF/e-CNPJ) além da conta gov.br. Confira no edital do lote.",
  },
  {
    numero: 2,
    titulo: "Habilitar-se no portal do leilão (SLE)",
    descricao:
      "Acesse o Sistema de Leilão Eletrônico da Receita pelo e-CAC ou pelo portal e faça a habilitação " +
      "com seu CPF/CNPJ ANTES do prazo de encerramento das propostas. Sem habilitação, o sistema não aceita lance.",
  },
  {
    numero: 3,
    titulo: "Ler o edital e conferir o prazo",
    descricao:
      "Cada lote tem um edital próprio: quem pode participar (PF/PJ), valor mínimo, datas de visita, prazo " +
      "final da proposta, local e prazo de retirada, e encargos. Leia completo antes de qualquer lance.",
    aviso:
      "Os dados aqui na Fonte.ia vêm da fonte oficial, mas o edital publicado no SLE é o que prevalece em divergência.",
  },
  {
    numero: 4,
    titulo: "Registrar a proposta/lance eletrônico",
    descricao:
      "Dentro do prazo, registre sua proposta no SLE. Essa fase costuma ser sigilosa (você não vê os lances dos " +
      "outros). Se ficar entre as maiores, pode ser convocado para uma fase de lances ao vivo — depende do edital.",
  },
  {
    numero: 5,
    titulo: "Pagar o DARF e retirar no prazo",
    descricao:
      "Vencendo, o pagamento é por DARF. Em geral exige-se um sinal (ex.: 20%) em poucos dias úteis e o restante " +
      "em prazo complementar. A retirada no pátio/recinto costuma ter prazo (ex.: até 30 dias) — o frete e a " +
      "remoção são por sua conta.",
    aviso:
      "Não retirar no prazo pode levar à perda do bem e do valor pago. Confira prazos e encargos exatos no edital.",
  },
];

function PassoItem({ passo }: { passo: Passo }) {
  return (
    <li
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-2)",
        padding: "var(--s-3) var(--s-4)",
        background: "var(--n-50)",
        border: "1px solid var(--n-100)",
        borderRadius: "var(--r-md)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-3)" }}>
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "var(--g-500)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.78rem",
            fontWeight: 800,
            marginTop: 1,
          }}
        >
          {passo.numero}
        </span>
        <strong style={{ fontSize: "0.92rem", color: "var(--n-900)", lineHeight: 1.35, paddingTop: 3 }}>
          {passo.titulo}
        </strong>
      </div>
      <p
        style={{
          margin: 0,
          marginLeft: "calc(26px + var(--s-3))",
          fontSize: "0.86rem",
          lineHeight: 1.6,
          color: "var(--n-700)",
        }}
      >
        {passo.descricao}
      </p>
      {passo.aviso !== undefined ? (
        <div
          role="note"
          style={{
            marginLeft: "calc(26px + var(--s-3))",
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--s-2)",
            padding: "var(--s-2) var(--s-3)",
            borderRadius: "var(--r-sm)",
            background: "var(--color-warning-bg)",
            border: "1px solid var(--color-warning)",
          }}
        >
          <AlertTriangle aria-hidden="true" size={13} style={{ flexShrink: 0, marginTop: 2, color: "var(--color-warning)" }} />
          <span style={{ fontSize: "0.8rem", lineHeight: 1.5, color: "var(--n-700)" }}>{passo.aviso}</span>
        </div>
      ) : null}
    </li>
  );
}

function Conteudo({ sourceUrl, onClose }: { sourceUrl: string; onClose?: (() => void) | undefined }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
      <div>
        <span className="section-label">Como funciona na prática</span>
        <h3 style={{ marginTop: "var(--s-1)", display: "flex", alignItems: "center", gap: "var(--s-2)", fontSize: "1rem" }}>
          <CheckSquare aria-hidden="true" size={16} />
          Passo a passo para dar lance
        </h3>
        <p style={{ margin: "var(--s-2) 0 0", fontSize: "0.84rem", color: "var(--n-500)", lineHeight: 1.5 }}>
          Fluxo geral dos leilões de mercadorias da Receita Federal (SLE).{" "}
          <strong>As regras variam por edital</strong> — confirme tudo no documento oficial antes de participar.
        </p>
      </div>

      <ol
        aria-label="Passos para participar do leilão"
        style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--s-3)" }}
      >
        {PASSOS.map((passo) => (
          <PassoItem key={passo.numero} passo={passo} />
        ))}
      </ol>

      <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap", alignItems: "center" }}>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="primary-button"
          style={{ display: "inline-flex", alignItems: "center", gap: "var(--s-2)", minHeight: 44 }}
        >
          <ExternalLink aria-hidden="true" size={15} />
          Abrir portal oficial
        </a>
        {onClose !== undefined ? (
          <button className="ghost-button" type="button" onClick={onClose} style={{ minHeight: 44 }}>
            Fechar
          </button>
        ) : null}
      </div>
    </div>
  );
}

function InlinePanel({ sourceUrl }: { sourceUrl: string }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = "como-dar-lance-panel";
  const triggerId = "como-dar-lance-trigger";

  return (
    <section className="lot-detail-header" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <button
        id={triggerId}
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          width: "100%",
          justifyContent: "space-between",
          padding: "var(--s-4) var(--s-5)",
          borderRadius: expanded ? "var(--r-lg) var(--r-lg) 0 0" : "var(--r-lg)",
          border: "1px solid var(--n-200)",
          background: "var(--n-50)",
          fontWeight: 600,
          fontSize: "0.92rem",
          color: "var(--n-900)",
          display: "flex",
          alignItems: "center",
          gap: "var(--s-2)",
          minHeight: 44,
          textAlign: "left",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", flex: 1 }}>
          <CheckSquare aria-hidden="true" size={16} style={{ color: "var(--g-600)", flexShrink: 0 }} />
          Como dar lance neste leilão — passo a passo
        </span>
        {expanded ? (
          <ChevronUp aria-hidden="true" size={16} style={{ flexShrink: 0, color: "var(--n-400)" }} />
        ) : (
          <ChevronDown aria-hidden="true" size={16} style={{ flexShrink: 0, color: "var(--n-400)" }} />
        )}
      </button>

      {expanded ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={triggerId}
          style={{
            padding: "var(--s-4) var(--s-5)",
            border: "1px solid var(--n-200)",
            borderTop: "none",
            borderRadius: "0 0 var(--r-lg) var(--r-lg)",
            background: "var(--surface, #fff)",
          }}
        >
          <Conteudo sourceUrl={sourceUrl} onClose={() => setExpanded(false)} />
        </div>
      ) : null}
    </section>
  );
}

function Modal({ sourceUrl, open, onClose }: { sourceUrl: string; open: boolean; onClose: () => void }) {
  const containerRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="alert-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Como dar lance — passo a passo"
    >
      <div ref={containerRef} className="alert-modal" style={{ maxWidth: 600, width: "100%", maxHeight: "90dvh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--s-4)" }}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Como dar lance — passo a passo</h2>
          <button
            type="button"
            className="ghost-button"
            onClick={onClose}
            aria-label="Fechar"
            style={{ padding: "var(--s-2)", minWidth: 44, minHeight: 44, flexShrink: 0 }}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <Conteudo sourceUrl={sourceUrl} onClose={onClose} />
      </div>
    </div>
  );
}

export function ComoDarLance({ sourceUrl, variant = "inline", open = false, onClose }: ComoDarLanceProps) {
  if (variant === "modal") {
    return <Modal sourceUrl={sourceUrl} open={open} onClose={onClose ?? (() => undefined)} />;
  }
  return <InlinePanel sourceUrl={sourceUrl} />;
}
