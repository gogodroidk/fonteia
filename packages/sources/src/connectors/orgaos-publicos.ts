// Conector dos ÓRGÃOS PÚBLICOS — derivado das licitações que já coletamos do PNCP.
//
// Diferente dos outros conectores (IBGE, Câmara, PNCP), este NÃO bate em API
// externa: ele DERIVA a lista de órgãos públicos distintos a partir das entidades
// `bidding_opportunity` (licitações) já presentes no banco. Cada licitação traz o
// órgão contratante (razão social + CNPJ + UF); aqui agregamos os órgãos únicos.
//
// Por isso a "fonte" é interna: sourceId = "orgaos-publicos". A chave estável de
// cada órgão é o CNPJ (14 chars alfanuméricos) quando houver; senão, um slug do
// nome — para que dois registros do mesmo órgão sem CNPJ não dupliquem.
//
// Estratégia: igual ao conector de municípios — achatamos/normalizamos um objeto
// estável guardado em entities.attributes (kind = organization).

import { normalizeCnpj } from "@fonteia/domain";

/** Identificador da fonte gravado em cada item. Fonte interna (derivada do PNCP). */
export const ORGAOS_PUBLICOS_SOURCE_ID = "orgaos-publicos";

// ---------------------------------------------------------------------------
// Entrada crua = um subset dos attributes de uma licitação (bidding_opportunity).
// É o que o conector recebe de cada licitação para extrair o órgão.
// ---------------------------------------------------------------------------

export interface BiddingOrgaoRaw {
  /** Razão social / nome do órgão contratante (attributes.orgao). */
  orgao?: string;
  /** CNPJ do órgão (14 chars alfanuméricos, sem máscara) (attributes.orgaoCnpj). */
  orgaoCnpj?: string;
  /** Sigla da UF do órgão (attributes.uf). "" quando ausente. */
  uf?: string;
  /** Nome da UF do órgão (attributes.ufNome). "" quando ausente. */
  ufNome?: string;
  /** Nº de licitações onde o órgão aparece (preenchido na agregação). */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Órgão público normalizado — o que o produto lê (guardado em entities.attributes).
// Campos claros em camelCase; chave estável = CNPJ (14 dígitos) ou slug do nome.
// ---------------------------------------------------------------------------

export interface OrgaoPublico {
  /** Id estável = CNPJ (14 chars alfanuméricos) quando houver; senão, slug do nome. */
  id: string;
  sourceId: string;
  /** CNPJ do órgão (14 chars alfanuméricos, sem máscara). "" quando ausente. */
  cnpj: string;
  /** Razão social / nome do órgão (ex.: "MUNICIPIO DE ITABUNA"). */
  nome: string;
  /** Sigla da UF (ex.: "BA"). "" quando ausente. */
  uf: string;
  /** Nome da UF (ex.: "Bahia"). "" quando ausente. */
  ufNome: string;
  /** Quantas licitações deste órgão já vimos no PNCP. */
  licitacoesCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Slug estável de um nome de órgão (sem acento, minúsculo, hífens). Usado como
 * chave quando o órgão não tem CNPJ — evita duplicar o mesmo órgão sem documento.
 */
export function slugifyOrgao(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/**
 * Agrega uma lista de "órgãos crus" (um por licitação) nos órgãos públicos
 * distintos. Dedup por CNPJ (preferencial) ou slug do nome, somando a contagem
 * de licitações. Descarta itens sem nome E sem CNPJ (lixo).
 */
export function aggregateOrgaos(items: BiddingOrgaoRaw[]): OrgaoPublico[] {
  const byKey = new Map<string, OrgaoPublico>();

  for (const raw of items) {
    const cnpj = normalizeCnpj(raw.orgaoCnpj);
    const nome = (raw.orgao ?? "").trim();
    if (cnpj === "" && nome === "") continue;

    const id = cnpj !== "" ? cnpj : `nome:${slugifyOrgao(nome)}`;
    if (id === "nome:") continue;

    const existing = byKey.get(id);
    if (existing) {
      existing.licitacoesCount += 1;
      // Completa campos vazios se uma ocorrência posterior trouxer mais dados.
      if (existing.nome === "" && nome !== "") existing.nome = nome;
      if (existing.uf === "" && (raw.uf ?? "").trim() !== "") existing.uf = (raw.uf ?? "").trim();
      if (existing.ufNome === "" && (raw.ufNome ?? "").trim() !== "") {
        existing.ufNome = (raw.ufNome ?? "").trim();
      }
      continue;
    }

    byKey.set(id, {
      id,
      sourceId: ORGAOS_PUBLICOS_SOURCE_ID,
      cnpj,
      nome,
      uf: (raw.uf ?? "").trim(),
      ufNome: (raw.ufNome ?? "").trim(),
      licitacoesCount: 1,
    });
  }

  return Array.from(byKey.values());
}
