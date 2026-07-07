/**
 * types.ts — contrato da edge function `dossie` (Raio-X 360°).
 *
 * GET /functions/v1/dossie?cnpj=...
 *
 * Espelha exatamente o payload combinado com o backend (outro agente constrói a
 * function em paralelo). Qualquer mudança aqui deve ser coordenada — este é o
 * contrato, não uma suposição.
 *
 * No plano free, o servidor já corta o dado antes de responder: `flags` chegam
 * com `locked:true` (sem `explicacao`) e `sections[].items` vem com no máximo 3
 * itens mesmo que `total` seja maior. O front NUNCA re-implementa esse corte —
 * apenas apresenta o que o servidor mandou (ver `use-plan.ts`, gate real é lá).
 */

export type Severity = "alta" | "media" | "baixa";

export interface DossieHeaderSocio {
  nome: string;
  qualificacao: string;
}

export interface DossieHeader {
  razaoSocial: string;
  cnae: string;
  situacao: string;
  qsa: DossieHeaderSocio[];
}

export interface DossieFlag {
  id: string;
  titulo: string;
  severity: Severity;
  /** Ausente (ou "") quando `locked === true` — plano free não vê o motivo. */
  explicacao?: string;
  locked: boolean;
}

export interface DossieEvidence {
  source: string;
  url: string;
  collected_at: string;
}

export type SectionStatus = "ok" | "vazio" | "evidencia_insuficiente";

export interface DossieSectionItem {
  /** O shape exato varia por seção; tratamos como registro livre e projetamos campos comuns. */
  [key: string]: unknown;
}

export interface DossieSection {
  status: SectionStatus;
  total: number;
  items: DossieSectionItem[];
  evidence?: DossieEvidence;
}

/** Chaves de seção na ordem em que o produto vende a história (ver page.tsx). */
export type SectionKey =
  | "sancoes"
  | "contratos"
  | "licitacoes"
  | "leiloes_arrematados"
  | "ceap"
  | "marcas"
  | "transferencias"
  | "ambiental"
  | "fiscal"
  | "juridico";

export type DossieSections = Partial<Record<SectionKey, DossieSection>>;

export interface DossiePayload {
  cnpj: string;
  header: DossieHeader;
  flags: DossieFlag[];
  sections: DossieSections;
  generated_at: string;
}

/** Metadados de apresentação de cada seção (título, ícone via string, ordem de venda). */
export interface SectionMeta {
  key: SectionKey;
  title: string;
  /** Rótulo do chip de contagem no topo (mais curto que o título). */
  chipLabel: string;
}

export const SECTION_ORDER: SectionMeta[] = [
  { key: "sancoes", title: "Sanções", chipLabel: "Sanções" },
  { key: "contratos", title: "Contratos públicos", chipLabel: "Contratos" },
  { key: "licitacoes", title: "Licitações", chipLabel: "Licitações" },
  { key: "leiloes_arrematados", title: "Leilões arrematados", chipLabel: "Leilões" },
  { key: "ceap", title: "Despesas parlamentares (CEAP)", chipLabel: "CEAP" },
  { key: "marcas", title: "Marcas (INPI)", chipLabel: "Marcas" },
  { key: "transferencias", title: "Transferências federais", chipLabel: "Transferências" },
  { key: "ambiental", title: "Ambiental (IBAMA)", chipLabel: "Ambiental" },
  { key: "fiscal", title: "Fiscal", chipLabel: "Fiscal" },
  { key: "juridico", title: "Jurídico (CNJ)", chipLabel: "Jurídico" },
];
