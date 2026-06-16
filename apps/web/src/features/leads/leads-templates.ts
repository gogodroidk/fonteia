/**
 * leads-templates.ts — Fonte.ia
 *
 * Gera mensagens prontas (WhatsApp + e-mail) via template estático.
 * Sem IA — texto fixo preenchido com os dados do lead.
 */

import type { Lead } from "./leads-api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatValor(valorGlobal: number): string {
  if (valorGlobal <= 0) return "";
  return valorGlobal.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function formatData(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

// ─── Templates ───────────────────────────────────────────────────────────────

export interface MensagemPronta {
  whatsapp: string;
  email: { assunto: string; corpo: string };
}

/**
 * Gera mensagens prontas para o lead.
 * @param lead Dados do contrato/lead
 * @param servicoLabel Nome do serviço que o remetente oferece
 */
export function gerarMensagens(lead: Lead, servicoLabel: string): MensagemPronta {
  const empresa = lead.razaoSocial;
  const orgao = lead.orgao;
  const valorStr = formatValor(lead.valorGlobal);
  const dataStr = formatData(lead.dataVigenciaInicio);
  const local =
    lead.municipio && lead.uf
      ? `${lead.municipio}/${lead.uf}`
      : lead.uf
        ? lead.uf
        : "Brasil";

  const contexto = valorStr
    ? `Recentemente, vi que a ${empresa} assinou um contrato público com ${orgao}${dataStr ? ` em ${dataStr}` : ""} no valor de ${valorStr}.`
    : `Recentemente, vi que a ${empresa} assinou um contrato público com ${orgao}${dataStr ? ` em ${dataStr}` : ""}.`;

  // ── WhatsApp ──────────────────────────────────────────────────────────────

  const whatsapp = `Olá! Tudo bem?

${contexto}

Sou especialista em *${servicoLabel}* e atendo empresas fornecedoras do governo em ${local}.

Esse tipo de contrato geralmente cria demandas específicas que podemos resolver rapidamente. Posso te mostrar como em 15 minutos?

Fico à disposição!`;

  // ── E-mail ────────────────────────────────────────────────────────────────

  const assunto = `${servicoLabel} — oportunidade para a ${empresa}`;

  const corpo = `Prezado(a) responsável pela ${empresa},

${contexto}

Parabéns pela conquista! Contratos com órgãos públicos trazem grandes oportunidades — e também desafios específicos que exigem atenção.

Sou especialista em ${servicoLabel} e trabalho com empresas fornecedoras do governo na região de ${local}. Acredito que posso agregar valor neste momento.

Posso apresentar como em uma conversa rápida de 15 minutos?

Fico à disposição para agendar conforme sua conveniência.

Atenciosamente,
[Seu nome]
[Empresa]
[Telefone]`;

  return { whatsapp, email: { assunto, corpo } };
}
