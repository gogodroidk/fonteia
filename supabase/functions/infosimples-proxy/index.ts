// Supabase Edge Function: "infosimples-proxy" — proxy server-side para a
// InfoSimples (agregador PAGO por consulta). Construido para ficar DORMENTE ate
// a chave ser configurada, com CACHE-FIRST e TRAVA DE GASTO.
//
// POR QUE EXISTE: a InfoSimples cobra por consulta (~R$0,05-0,20, franquia min.
// R$100/mes). O token NUNCA pode ir ao browser, e uma consulta nunca pode ser
// disparada sem: (1) usuario logado em plano PAGO, (2) cache miss, (3) abaixo do
// teto mensal e do limite diario do usuario. Primeiro caso de uso: INPI / Marcas
// por CNPJ. Estruturado por `kind` p/ somar tribunais/certidoes depois.
//
// AUTH (verify_jwt=false — autorizado aqui dentro, igual a function "fonteia"):
//   - header `apikey` = publishable key do projeto (gate de endpoint publico);
//   - Authorization: Bearer <token de SESSAO> -> getVerifiedUserId (authz real);
//   - RPC my_plan: so plano 'pro'/'corporativo' dispara consulta paga.
//
// SEGREDOS (Supabase -> Edge Functions -> Secrets):
//   INFOSIMPLES_TOKEN          obrigatorio p/ LIGAR. Ausente => 200 configured:false
//                              (DORMENTE: o front cai no comportamento atual).
//   INFOSIMPLES_MONTHLY_CAP    opcional; teto de chamadas 'live'/mes (default 10000).
//   INFOSIMPLES_DAILY_PER_USER opcional; limite de chamadas 'live'/dia por usuario (default 100).
//   INFOSIMPLES_CACHE_TTL_DAYS opcional; frescor do cache em dias (default 60).
//   INFOSIMPLES_TIMEOUT_S      opcional; timeout enviado a InfoSimples em s (default 300).
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  injetados pela plataforma.
//
// DOC InfoSimples (confirmado via WebSearch/WebFetch, jun/2026):
//   endpoint: POST https://api.infosimples.com/api/v2/consultas/inpi/marcas-titular
//   params  : token, cnpj | cpf, pagina, timeout (form-urlencoded)
//   envelope: { code, code_message, header, data_count, data[], errors[], site_receipts[] }
//   codigos : 200 (1 resultado) / 201 (varios) = sucesso; 600..621 = erro
//             (601 token invalido, 605 timeout no site, 612 sem resultado, 618 rate-limit).
//   data[].processos[]: { numero, marca, classe, situacao, tipo, titular, prioridade, registro }

import { getVerifiedUserId, hasValidApiKey } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { fetchWithRetry } from "../_shared/http.ts";

// Chave publica do projeto (vai no bundle do front — publica por design). Mesma
// usada na function "fonteia"; serve de gate de endpoint e de apikey ao my_plan.
const PUBLISHABLE_KEY = "sb_publishable_uojihld8t92MQXo7gXrR3w_WPVn4RkZ";

const PROVIDER = "infosimples";

// Defaults da trava — sobrescreviveis por secret (sem redeploy de logica).
const DEFAULT_MONTHLY_CAP = 10000; // was 400; adjustable via INFOSIMPLES_MONTHLY_CAP secret
const DEFAULT_DAILY_PER_USER = 100; // was 20; adjustable via INFOSIMPLES_DAILY_PER_USER secret
const DEFAULT_CACHE_TTL_DAYS = 60;
const DEFAULT_TIMEOUT_S = 300;

// Cota de cortesia para usuarios trial/free: numero maximo de consultas LIVE
// (nao cache) que podem ser feitas no total, para demonstracao do produto.
// Cache hits nao consomem cota. Sobrescrevivel via INFOSIMPLES_TRIAL_QUOTA.
const DEFAULT_TRIAL_QUOTA = 3;

function envInt(name: string, fallback: number): number {
  const raw = (Deno.env.get(name) ?? "").trim();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Mantem so digitos; devolve "" se nao restarem exatamente 14 (CNPJ). */
function sanitizeCnpj(value: string): string {
  const digits = (value ?? "").replace(/\D+/g, "");
  return digits.length === 14 ? digits : "";
}

// ─── Catalogo de consultas (generico por `kind`) ─────────────────────────────
//
// Cada kind mapeia para: o endpoint da InfoSimples, como montar os params da
// chave de consulta, a validacao da chave, e um normalizador do `data` -> shape
// estavel que o front consome. Adicionar tribunais/certidoes = +1 entrada aqui.

interface LookupDef {
  /** Path completo do endpoint InfoSimples (POST). */
  endpoint: string;
  /** Le os query params da request e devolve { key, params } ou um erro. */
  build: (url: URL) => { key: string; params: Record<string, string> } | { error: string };
  /** Normaliza o envelope.data da InfoSimples p/ um shape estavel do front. */
  normalize: (data: unknown[]) => unknown;
}

interface InpiProcesso {
  numero: string;
  marca: string;
  classe: string;
  situacao: string;
  tipo: string;
  titular: string;
  prioridade: string;
  registro: string;
}

// ─── Shapes estáveis do contrato de saída ─────────────────────────────────────
// O front depende deste contrato — qualquer campo novo é adição, nunca remoção.

type StatusCompliance = "regular" | "irregular" | "atencao" | "indisponivel";

interface ItemRotulo {
  rotulo: string;
  valor: string;
}

interface NormalizedCompliance {
  status: StatusCompliance;
  titulo: string;
  resumo: string;
  itens: ItemRotulo[];
  validade?: string;
  numeroCertidao?: string;
  fonteUrl?: string;
}

interface NormalizedCnpj extends NormalizedCompliance {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  situacaoCadastral: string;
  socios: { nome: string; qualificacao: string }[];
}

// Utilitario de conversao — deve vir antes dos helpers que o chamam.
const asStr = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

// Helper: extrai site_receipt ou site_receipts de um objeto data.
function extractFonteUrl(obj: Record<string, unknown>): string | undefined {
  const r = obj["site_receipt"] ?? obj["site_receipts"];
  if (typeof r === "string" && r) return r;
  if (Array.isArray(r) && typeof r[0] === "string" && r[0]) return r[0] as string;
  return undefined;
}

// Helper: formata uma data ISO/BR para exibição, sem lançar exceção.
function fmtDate(raw: unknown): string {
  const s = asStr(raw);
  if (!s) return "";
  return s;
}

// Helper: cria um ItemRotulo se valor não for vazio; caso contrário retorna null.
function item(rotulo: string, valor: unknown): ItemRotulo | null {
  const v = asStr(valor);
  return v ? { rotulo, valor: v } : null;
}

// Helper: filtra nulls de uma lista de candidatos a ItemRotulo.
function compactItems(...candidates: (ItemRotulo | null)[]): ItemRotulo[] {
  return candidates.filter((c): c is ItemRotulo => c !== null);
}

// Internal registry for CATALOG metadata (populated by genericCnpjLookup).
const _genericMeta = new Map<string, { titulo: string; categoria: string }>();

/**
 * Factory para consultas genéricas que recebem CNPJ como entrada primária.
 * Gera um LookupDef com normalize defensivo que nunca lança exceção.
 * @param opts.org  Segmento org do endpoint InfoSimples (ex: "sefaz/sp")
 * @param opts.slug Slug do endpoint (ex: "certidao-debitos")
 * @param opts.titulo Título legível para exibição no front
 * @param opts.categoria Categoria para o CATALOG
 * @param opts.tipo "sancao" | "certidao" | "cadastro" | "info" — controla inferência de status
 */
function genericCnpjLookup(opts: {
  org: string;
  slug: string;
  titulo: string;
  categoria: string;
  tipo?: "sancao" | "certidao" | "cadastro" | "info";
}): LookupDef {
  const endpoint = `https://api.infosimples.com/api/v2/consultas/${opts.org}/${opts.slug}`;
  const build: LookupDef["build"] = (url) => {
    const cnpj = sanitizeCnpj(url.searchParams.get("cnpj") ?? "");
    if (!cnpj) return { error: "CNPJ inválido: informe os 14 números." };
    return { key: cnpj, params: { cnpj } };
  };
  const normalize: LookupDef["normalize"] = (data): NormalizedCompliance => {
    try {
      const d = (data[0] ?? {}) as Record<string, unknown>;

      // Status: inferido por tipo
      let status: StatusCompliance = "regular";
      if (opts.tipo === "sancao") {
        status = data.length > 0 ? "irregular" : "regular";
      } else if (opts.tipo === "certidao") {
        // Procura por palavras-chave de regularidade / irregularidade em todos os campos escalares
        const allText = Object.values(d)
          .filter((v) => typeof v === "string" || typeof v === "number")
          .map((v) => asStr(v).toLowerCase())
          .join(" ");
        const regularKws = ["negativa", "nada consta", "regular", "isento", "sem débito", "sem debito", "positiva com efeito", "positiva com efeitos"];
        const irregularKws = ["positiva", "consta", "débito", "debito", "irregular", "pendente", "inadimplente"];
        const isRegular = regularKws.some((kw) => allText.includes(kw));
        const isIrregular = irregularKws.some((kw) => allText.includes(kw));
        if (isRegular && !isIrregular) status = "regular";
        else if (isIrregular) status = "irregular";
        else if (data.length === 0) status = "indisponivel";
        else status = "atencao";
      } else {
        // cadastro/info: sempre regular (informacional)
        status = data.length === 0 ? "indisponivel" : "regular";
      }

      // Itens: até 30 campos escalares de data[0]; arrays/objects viram contadores
      const itens: ItemRotulo[] = [];
      for (const [k, v] of Object.entries(d)) {
        if (itens.length >= 30) break;
        if (k === "site_receipt" || k === "site_receipts") continue;
        if (Array.isArray(v)) {
          if (v.length > 0) itens.push({ rotulo: k, valor: `${v.length} registro(s)` });
        } else if (v !== null && typeof v === "object") {
          const entries = Object.entries(v as Record<string, unknown>);
          if (entries.length > 0) itens.push({ rotulo: k, valor: `${entries.length} campo(s)` });
        } else {
          const str = asStr(v);
          if (str) itens.push({ rotulo: k, valor: str });
        }
      }

      // Resumo de 1 linha
      const countMsg = opts.tipo === "sancao"
        ? data.length === 0 ? "Nada consta" : `${data.length} registro(s) encontrado(s)`
        : data.length === 0 ? "Sem dados retornados" : `${data.length} resultado(s)`;
      const resumo = `${opts.titulo}: ${countMsg}`;

      return {
        status,
        titulo: opts.titulo,
        resumo,
        itens,
        fonteUrl: extractFonteUrl(d),
      };
    } catch {
      // normalize nunca lança — fallback seguro
      return {
        status: "indisponivel",
        titulo: opts.titulo,
        resumo: "Erro ao processar resposta.",
        itens: [],
      };
    }
  };
  const def: LookupDef = { endpoint, build, normalize };
  (def as Record<string, unknown>)["_titulo"] = opts.titulo;
  (def as Record<string, unknown>)["_categoria"] = opts.categoria;
  _genericMeta.set(endpoint, { titulo: opts.titulo, categoria: opts.categoria });
  return def;
}

const LOOKUPS: Record<string, LookupDef> = {
  // ─── 1. Receita Federal / CNPJ ──────────────────────────────────────────────
  // Cadastro PJ + QSA (sócios) + situação cadastral.
  // Endpoint: POST https://api.infosimples.com/api/v2/consultas/receita-federal/cnpj
  // Params de entrada: token, cnpj
  // Campos-chave: situacao_cadastral, razao_social, nome_fantasia, capital_social,
  //               atividade_economica, qsa[]{nome, qualificacao}, endereco_*
  // Status: situacao_cadastral "ATIVA" => regular; "SUSPENSA"/"INAPTA" => atencao;
  //         "BAIXADA"/"NULA" => irregular.
  "receita-federal-cnpj": {
    endpoint: "https://api.infosimples.com/api/v2/consultas/receita-federal/cnpj",
    build: (url) => {
      const cnpj = sanitizeCnpj(url.searchParams.get("cnpj") ?? "");
      if (!cnpj) return { error: "CNPJ inválido: informe os 14 números." };
      return { key: cnpj, params: { cnpj } };
    },
    normalize: (data): NormalizedCnpj => {
      const d = (data[0] ?? {}) as Record<string, unknown>;
      const sit = asStr(d["situacao_cadastral"]).toUpperCase();
      let status: StatusCompliance = "indisponivel";
      if (sit === "ATIVA") status = "regular";
      else if (sit === "SUSPENSA" || sit === "INAPTA") status = "atencao";
      else if (sit === "BAIXADA" || sit === "NULA") status = "irregular";
      else if (sit) status = "atencao";

      const rawQsa = Array.isArray(d["qsa"]) ? (d["qsa"] as unknown[]) : [];
      const socios = rawQsa.map((s) => {
        const o = (s ?? {}) as Record<string, unknown>;
        return { nome: asStr(o["nome"]), qualificacao: asStr(o["qualificacao"]) };
      });

      const razaoSocial = asStr(d["razao_social"]);
      const nomeFantasia = asStr(d["nome_fantasia"]);
      const cnpjFormatado = asStr(d["cnpj"]);
      const capital = asStr(d["capital_social"]);
      const porte = asStr(d["porte"]);
      const natureza = asStr(d["natureza_juridica"]);
      const cnae = asStr(d["atividade_economica"]);
      const sitData = asStr(d["situacao_cadastral_data"]);
      const endMun = asStr(d["endereco_municipio"]);
      const endUf = asStr(d["endereco_uf"]);
      const email = asStr(d["email"]);
      const telefone = asStr(d["telefone"]);

      const resumo = sit
        ? `Situação cadastral: ${asStr(d["situacao_cadastral"])}${sitData ? ` (desde ${fmtDate(sitData)})` : ""}`
        : "Sem dados cadastrais";

      const itens = compactItems(
        item("Razão Social", razaoSocial),
        item("Nome Fantasia", nomeFantasia),
        item("Situação Cadastral", asStr(d["situacao_cadastral"])),
        item("Data Situação", fmtDate(sitData)),
        item("Porte", porte),
        item("Natureza Jurídica", natureza),
        item("CNAE Principal", cnae),
        item("Capital Social", capital),
        item("Município/UF", endMun && endUf ? `${endMun}/${endUf}` : endMun || endUf),
        item("E-mail", email),
        item("Telefone", telefone),
        ...socios.map((s, i) =>
          item(`Sócio ${i + 1}`, s.nome ? `${s.nome} (${s.qualificacao || "sem qualificação"})` : "")
        ),
      );

      return {
        status,
        titulo: "Cadastro CNPJ (Receita Federal)",
        resumo,
        itens,
        razaoSocial,
        nomeFantasia,
        cnpj: cnpjFormatado,
        situacaoCadastral: asStr(d["situacao_cadastral"]),
        socios,
        fonteUrl: extractFonteUrl(d),
      };
    },
  },

  // ─── 2. Receita Federal / Simples Nacional ───────────────────────────────────
  // Situação no Simples Nacional e SIMEI (optante ou não).
  // Endpoint: POST https://api.infosimples.com/api/v2/consultas/receita-federal/simples
  // Params de entrada: token, cnpj
  // Campos-chave: simples_nacional_situacao, simei_situacao,
  //               simples_nacional_periodos_anteriores[], simei_periodos_anteriores[]
  // Status: informacional => sempre "regular"; o resumo informa optante ou não.
  "receita-federal-simples": {
    endpoint: "https://api.infosimples.com/api/v2/consultas/receita-federal/simples",
    build: (url) => {
      const cnpj = sanitizeCnpj(url.searchParams.get("cnpj") ?? "");
      if (!cnpj) return { error: "CNPJ inválido: informe os 14 números." };
      return { key: cnpj, params: { cnpj } };
    },
    normalize: (data): NormalizedCompliance => {
      const d = (data[0] ?? {}) as Record<string, unknown>;
      const simplesStatus = asStr(d["simples_nacional_situacao"]);
      const simeiStatus = asStr(d["simei_situacao"]);

      // Simples Nacional é informacional: "regular" mesmo quando não optante.
      const status: StatusCompliance = "regular";

      const partes: string[] = [];
      if (simplesStatus) partes.push(`Simples Nacional: ${simplesStatus}`);
      if (simeiStatus) partes.push(`SIMEI: ${simeiStatus}`);
      const resumo = partes.length ? partes.join(" | ") : "Sem informações do Simples Nacional";

      const rawPeriodos = Array.isArray(d["simples_nacional_periodos_anteriores"])
        ? (d["simples_nacional_periodos_anteriores"] as unknown[])
        : [];
      const rawSimeiPeriodos = Array.isArray(d["simei_periodos_anteriores"])
        ? (d["simei_periodos_anteriores"] as unknown[])
        : [];

      const itensPeriodos: ItemRotulo[] = rawPeriodos.slice(0, 5).map((p, i) => {
        const o = (p ?? {}) as Record<string, unknown>;
        return {
          rotulo: `Período Simples ${i + 1}`,
          valor: `${fmtDate(o["inicio_data"])} – ${fmtDate(o["fim_data"])} ${asStr(o["detalhamento"])}`.trim(),
        };
      });

      const itensSimei: ItemRotulo[] = rawSimeiPeriodos.slice(0, 3).map((p, i) => {
        const o = (p ?? {}) as Record<string, unknown>;
        return {
          rotulo: `Período SIMEI ${i + 1}`,
          valor: `${fmtDate(o["inicio_data"])} – ${fmtDate(o["fim_data"])} ${asStr(o["detalhamento"])}`.trim(),
        };
      });

      const rawEventos = Array.isArray(d["simples_nacional_eventos_futuros"])
        ? (d["simples_nacional_eventos_futuros"] as unknown[])
        : [];
      const itensEventos: ItemRotulo[] = rawEventos.slice(0, 3).map((e) => {
        const o = (e ?? {}) as Record<string, unknown>;
        return { rotulo: "Evento Futuro", valor: `${asStr(o["descricao_evento"])} (${fmtDate(o["data_efeito"])})`.trim() };
      });

      const itens = compactItems(
        item("Simples Nacional", simplesStatus),
        item("SIMEI", simeiStatus),
        item("Razão Social", asStr(d["razao_social"])),
        item("Data Consulta", fmtDate(d["consulta_datahora"])),
        ...itensPeriodos,
        ...itensSimei,
        ...itensEventos,
      );

      return { status, titulo: "Simples Nacional (Receita Federal)", resumo, itens, fonteUrl: extractFonteUrl(d) };
    },
  },

  // ─── 3. Receita Federal / PGFN (CND Federal) ────────────────────────────────
  // Certidão de Débitos Relativos a Créditos Tributários Federais e Dívida Ativa.
  // Endpoint: POST https://api.infosimples.com/api/v2/consultas/receita-federal/pgfn
  // Params de entrada: token, cnpj, preferencia_emissao (fixado em "2via" para maior
  //                    taxa de sucesso, conforme recomendação da documentação InfoSimples)
  // Campos-chave: situacao, tipo, certidao_codigo, emissao_data, validade_data,
  //               debitos_rfb, debitos_pgfn, mensagem, razao_social
  // Status: situacao "Negativa" ou "Positiva com efeitos de negativa" => regular;
  //         "Positiva" => irregular; demais => atencao.
  "receita-federal-pgfn": {
    endpoint: "https://api.infosimples.com/api/v2/consultas/receita-federal/pgfn",
    build: (url) => {
      const cnpj = sanitizeCnpj(url.searchParams.get("cnpj") ?? "");
      if (!cnpj) return { error: "CNPJ inválido: informe os 14 números." };
      // Preferimos 2via: maior chance de obter certidão válida em caso de
      // "Positiva com efeitos de negativa" (conforme doc InfoSimples, jun/2026).
      return { key: cnpj, params: { cnpj, preferencia_emissao: "2via" } };
    },
    normalize: (data): NormalizedCompliance => {
      const d = (data[0] ?? {}) as Record<string, unknown>;
      const situacaoRaw = asStr(d["situacao"]);
      const situacaoLower = situacaoRaw.toLowerCase();

      let status: StatusCompliance = "indisponivel";
      // "positiva com efeitos de negativa" deve ser verificado ANTES de "positiva"
      // pura, pois a string contém "negativa" e "positiva" ao mesmo tempo.
      if (situacaoLower.includes("positiva com efeitos de negativa")) {
        status = "regular";
      } else if (situacaoLower.includes("negativa")) {
        status = "regular";
      } else if (situacaoLower.includes("positiva")) {
        status = "irregular";
      } else if (situacaoRaw) {
        status = "atencao";
      }

      const validade = fmtDate(d["validade_data"] ?? d["validade"]);
      const numeroCertidao = asStr(d["certidao_codigo"]);
      const mensagem = asStr(d["mensagem"]);
      const resumo = situacaoRaw
        ? `${situacaoRaw}${mensagem ? ` — ${mensagem}` : ""}`
        : "Sem resultado da PGFN";

      const itens = compactItems(
        item("Situação", situacaoRaw),
        item("Tipo", asStr(d["tipo"])),
        item("Razão Social", asStr(d["razao_social"])),
        item("Emissão", fmtDate(d["emissao_data"])),
        item("Validade", validade),
        item("Débitos RFB", asStr(d["debitos_rfb"])),
        item("Débitos PGFN", asStr(d["debitos_pgfn"])),
        item("Mensagem", mensagem),
      );

      return {
        status,
        titulo: "CND Federal (PGFN)",
        resumo,
        itens,
        validade: validade || undefined,
        numeroCertidao: numeroCertidao || undefined,
        fonteUrl: extractFonteUrl(d),
      };
    },
  },

  // ─── 4. TST / CNDT ───────────────────────────────────────────────────────────
  // Certidão Negativa de Débitos Trabalhistas emitida pelo TST.
  // Endpoint: POST https://api.infosimples.com/api/v2/consultas/tribunal/tst/cndt
  // Params de entrada: token, cnpj
  // Campos-chave: conseguiu_emitir_certidao_negativa (bool), consta, certidao,
  //               certidao_codigo, emissao_data, validade_data,
  //               processos_encontrados[], total_de_processos, site_receipt
  // Status: conseguiu_emitir_certidao_negativa=true OU consta=false => regular;
  //         caso contrário => irregular.
  "tst-cndt": {
    endpoint: "https://api.infosimples.com/api/v2/consultas/tribunal/tst/cndt",
    build: (url) => {
      const cnpj = sanitizeCnpj(url.searchParams.get("cnpj") ?? "");
      if (!cnpj) return { error: "CNPJ inválido: informe os 14 números." };
      return { key: cnpj, params: { cnpj } };
    },
    normalize: (data): NormalizedCompliance => {
      const d = (data[0] ?? {}) as Record<string, unknown>;
      const negativa = d["conseguiu_emitir_certidao_negativa"];
      const consta = d["consta"];
      // negativa=true significa que conseguiu emitir CNDT negativa (regular).
      // consta pode ser bool ou string "true"/"false".
      const isNegativa =
        negativa === true ||
        negativa === "true" ||
        consta === false ||
        consta === "false" ||
        asStr(consta).toLowerCase() === "false";

      const status: StatusCompliance = isNegativa ? "regular" : data.length === 0 ? "indisponivel" : "irregular";

      const totalProc = Number(d["total_de_processos"]) || 0;
      const rawProcs = Array.isArray(d["processos_encontrados"]) ? (d["processos_encontrados"] as unknown[]) : [];

      const resumo = isNegativa
        ? "Negativa — nenhum débito trabalhista consta"
        : totalProc
          ? `Positiva — consta(m) ${totalProc} processo(s) trabalhista(s)`
          : "Positiva — constam débitos trabalhistas";

      const validade = fmtDate(d["validade_data"]);
      const numeroCertidao = asStr(d["certidao_codigo"] ?? d["certidao"]);

      const itensProcs: ItemRotulo[] = rawProcs.slice(0, 10).map((p, i) => ({
        rotulo: `Processo ${i + 1}`,
        valor: asStr((p as Record<string, unknown>)["numero"] ?? p),
      }));

      const itens = compactItems(
        item("Situação", isNegativa ? "Negativa" : "Positiva"),
        item("Número da Certidão", numeroCertidao),
        item("Emissão", fmtDate(d["emissao_data"])),
        item("Validade", validade),
        item("Total de Processos", totalProc ? String(totalProc) : ""),
        ...itensProcs,
      );

      return {
        status,
        titulo: "CNDT (TST)",
        resumo,
        itens,
        validade: validade || undefined,
        numeroCertidao: numeroCertidao || undefined,
        fonteUrl: extractFonteUrl(d),
      };
    },
  },

  // ─── 5. Caixa / Regularidade do Empregador (FGTS / CRF) ─────────────────────
  // Certificado de Regularidade do FGTS emitido pela Caixa Econômica Federal.
  // Endpoint: POST https://api.infosimples.com/api/v2/consultas/caixa/regularidade
  // Params de entrada: token, cnpj, preferencia_emissao (fixado em "2via")
  // Campos-chave: situacao, crf, validade_inicio_data, validade_fim_data,
  //               razao_social, inscricao, site_receipt
  // Status: situacao "REGULAR" => regular; demais com valor => irregular; vazio => indisponivel.
  "caixa-fgts": {
    endpoint: "https://api.infosimples.com/api/v2/consultas/caixa/regularidade",
    build: (url) => {
      const cnpj = sanitizeCnpj(url.searchParams.get("cnpj") ?? "");
      if (!cnpj) return { error: "CNPJ inválido: informe os 14 números." };
      return { key: cnpj, params: { cnpj, preferencia_emissao: "2via" } };
    },
    normalize: (data): NormalizedCompliance => {
      const d = (data[0] ?? {}) as Record<string, unknown>;
      const situacaoRaw = asStr(d["situacao"]).toUpperCase();

      let status: StatusCompliance = "indisponivel";
      if (situacaoRaw === "REGULAR") status = "regular";
      else if (situacaoRaw) status = "irregular";

      const validade = fmtDate(d["validade_fim_data"]);
      const numeroCrf = asStr(d["crf"]);
      const resumo = situacaoRaw
        ? `Empregador ${situacaoRaw === "REGULAR" ? "REGULAR perante o FGTS" : `IRREGULAR: ${situacaoRaw}`}`
        : "Sem resultado da Caixa/FGTS";

      const itens = compactItems(
        item("Situação", asStr(d["situacao"])),
        item("Número CRF", numeroCrf),
        item("Razão Social", asStr(d["razao_social"])),
        item("Inscrição", asStr(d["inscricao"])),
        item("Validade Início", fmtDate(d["validade_inicio_data"])),
        item("Validade Fim", validade),
      );

      return {
        status,
        titulo: "Regularidade do Empregador (FGTS/CRF)",
        resumo,
        itens,
        validade: validade || undefined,
        numeroCertidao: numeroCrf || undefined,
        fonteUrl: extractFonteUrl(d),
      };
    },
  },

  // ─── 6. Portal da Transparência / CEIS ──────────────────────────────────────
  // Cadastro de Empresas Inidôneas e Suspensas — restrição a licitações e contratos.
  // Endpoint: POST https://api.infosimples.com/api/v2/consultas/portal-transparencia/ceis
  // Params de entrada: token, cnpj
  // Campos-chave: cada item de data[] é uma sanção com:
  //   nome_sancionado, orgao_sancionador.nome, sancao.tipo,
  //   sancao.fundamentacao_legal, sancao.inicio_data, sancao.fim_data,
  //   sancao.processo
  // Status: data[] vazio => regular; data[] com registros => irregular.
  "transparencia-ceis": {
    endpoint: "https://api.infosimples.com/api/v2/consultas/portal-transparencia/ceis",
    build: (url) => {
      const cnpj = sanitizeCnpj(url.searchParams.get("cnpj") ?? "");
      if (!cnpj) return { error: "CNPJ inválido: informe os 14 números." };
      return { key: cnpj, params: { cnpj } };
    },
    normalize: (data): NormalizedCompliance => {
      const count = data.length;
      const status: StatusCompliance = count === 0 ? "regular" : "irregular";
      const resumo = count === 0 ? "Nada consta no CEIS" : `Consta(m) ${count} sanção(ões) no CEIS`;

      const itensSancoes: ItemRotulo[] = data.flatMap((raw, i) => {
        const s = (raw ?? {}) as Record<string, unknown>;
        const sancao = (s["sancao"] ?? {}) as Record<string, unknown>;
        const orgao = (s["orgao_sancionador"] ?? {}) as Record<string, unknown>;
        const prefix = `Sanção ${i + 1}`;
        return compactItems(
          item(`${prefix} — Entidade`, asStr(s["nome_sancionado"])),
          item(`${prefix} — Tipo`, asStr(sancao["tipo"])),
          item(`${prefix} — Órgão`, asStr(orgao["nome"])),
          item(`${prefix} — Início`, fmtDate(sancao["inicio_data"])),
          item(`${prefix} — Fim`, fmtDate(sancao["fim_data"])),
          item(`${prefix} — Processo`, asStr(sancao["processo"])),
          item(`${prefix} — Fundamentação`, asStr(sancao["fundamentacao_legal"])),
        );
      });

      const firstSancao = count > 0 ? ((data[0] as Record<string, unknown>)["sancao"] ?? {}) as Record<string, unknown> : {};
      const fonteUrl = count > 0 ? extractFonteUrl(data[0] as Record<string, unknown>) : undefined;

      return {
        status,
        titulo: "CEIS (Portal da Transparência)",
        resumo,
        itens: itensSancoes,
        validade: fmtDate(firstSancao["fim_data"]) || undefined,
        fonteUrl,
      };
    },
  },

  // ─── 7. Portal da Transparência / CNEP ──────────────────────────────────────
  // Cadastro Nacional de Empresas Punidas — Lei Anticorrupção (Lei 12.846/2013).
  // Endpoint: POST https://api.infosimples.com/api/v2/consultas/portal-transparencia/cnep
  // Params de entrada: token, cnpj
  // Campos-chave: cada item de data[] é uma sanção com:
  //   nome_sancionado, orgao_sancionador (obj com nome/uf), sancao.tipo,
  //   sancao.valor_multa, sancao.inicio_data, sancao.fim_data,
  //   sancao.fundamentacao_legal, origem_informacao
  // Status: data[] vazio => regular; data[] com registros => irregular.
  "transparencia-cnep": {
    endpoint: "https://api.infosimples.com/api/v2/consultas/portal-transparencia/cnep",
    build: (url) => {
      const cnpj = sanitizeCnpj(url.searchParams.get("cnpj") ?? "");
      if (!cnpj) return { error: "CNPJ inválido: informe os 14 números." };
      return { key: cnpj, params: { cnpj } };
    },
    normalize: (data): NormalizedCompliance => {
      const count = data.length;
      const status: StatusCompliance = count === 0 ? "regular" : "irregular";
      const resumo = count === 0 ? "Nada consta no CNEP" : `Consta(m) ${count} punição(ões) no CNEP`;

      const itensSancoes: ItemRotulo[] = data.flatMap((raw, i) => {
        const s = (raw ?? {}) as Record<string, unknown>;
        const sancao = (s["sancao"] ?? {}) as Record<string, unknown>;
        const orgao = (s["orgao_sancionador"] ?? {}) as Record<string, unknown>;
        const prefix = `Punição ${i + 1}`;
        return compactItems(
          item(`${prefix} — Entidade`, asStr(s["nome_sancionado"])),
          item(`${prefix} — Tipo`, asStr(sancao["tipo"])),
          item(`${prefix} — Órgão`, asStr(orgao["nome"])),
          item(`${prefix} — Multa`, asStr(sancao["valor_multa"])),
          item(`${prefix} — Início`, fmtDate(sancao["inicio_data"])),
          item(`${prefix} — Fim`, fmtDate(sancao["fim_data"])),
          item(`${prefix} — Fundamentação`, asStr(sancao["fundamentacao_legal"])),
          item(`${prefix} — Origem`, asStr(s["origem_informacao"])),
        );
      });

      const firstSancao = count > 0 ? ((data[0] as Record<string, unknown>)["sancao"] ?? {}) as Record<string, unknown> : {};
      const fonteUrl = count > 0 ? extractFonteUrl(data[0] as Record<string, unknown>) : undefined;

      return {
        status,
        titulo: "CNEP (Portal da Transparência)",
        resumo,
        itens: itensSancoes,
        validade: fmtDate(firstSancao["fim_data"]) || undefined,
        fonteUrl,
      };
    },
  },

  // ─── 8. TCU / Certidão Negativa de Inidôneo (CNI) ───────────────────────────
  // Inabilitados e inidôneos para licitar perante o TCU.
  // A InfoSimples expõe via um único endpoint com param tipo_relacao:
  //   tipo_relacao=1 => Inidôneo | tipo_relacao=2 => Inabilitado
  // Fazemos duas chamadas virtuais usando o mesmo endpoint, mas como o proxy
  // realiza uma chamada por kind, adotamos tipo_relacao=1 (inidôneo) para o kind
  // "tcu-inidoneo" — o front pode chamar "tcu-inabilitado" (mesmo normalize, tipo=2).
  // Para cobrir ambos os casos com um único kind, passamos tipo_relacao=1
  // (inidôneos, mais abrangente para compliance geral de licitação).
  //
  // Endpoint: POST https://api.infosimples.com/api/v2/consultas/tcu/cni
  // Params de entrada: token, cnpj, tipo_relacao
  // Campos-chave: conseguiu_emitir_certidao_negativa (bool), processos[]{processo,
  //               acordao, entrada_cadastro, saida_cadastro}, codigo_controle,
  //               data_emissao, data_validade, nome, titulo, site_receipt
  // Status: conseguiu_emitir_certidao_negativa=true => regular;
  //         processos[] não vazio => irregular; senão atencao.
  "tcu-inidoneo": {
    endpoint: "https://api.infosimples.com/api/v2/consultas/tcu/cni",
    build: (url) => {
      const cnpj = sanitizeCnpj(url.searchParams.get("cnpj") ?? "");
      if (!cnpj) return { error: "CNPJ inválido: informe os 14 números." };
      // tipo_relacao=1 => inidôneos (mais restritivo para compliance).
      return { key: `${cnpj}:inidoneo`, params: { cnpj, tipo_relacao: "1" } };
    },
    normalize: (data): NormalizedCompliance => {
      const d = (data[0] ?? {}) as Record<string, unknown>;
      const negativa = d["conseguiu_emitir_certidao_negativa"];
      const isNegativa = negativa === true || negativa === "true";
      const rawProcs = Array.isArray(d["processos"]) ? (d["processos"] as unknown[]) : [];
      const totalProcs = rawProcs.length;

      let status: StatusCompliance;
      if (isNegativa && totalProcs === 0) status = "regular";
      else if (totalProcs > 0) status = "irregular";
      else if (data.length === 0) status = "indisponivel";
      else status = "atencao";

      const resumo = isNegativa && totalProcs === 0
        ? "Negativa — não consta como inidôneo no TCU"
        : totalProcs > 0
          ? `Positiva — consta(m) ${totalProcs} processo(s) de inidoneidade no TCU`
          : "Sem resultado do TCU/CNI";

      const validade = fmtDate(d["data_validade"]);
      const numeroCertidao = asStr(d["codigo_controle"]);

      const itensProcs: ItemRotulo[] = rawProcs.slice(0, 10).flatMap((p, i) => {
        const o = (p ?? {}) as Record<string, unknown>;
        const prefix = `Processo TCU ${i + 1}`;
        return compactItems(
          item(`${prefix} — Número`, asStr(o["processo"])),
          item(`${prefix} — Acórdão`, asStr(o["acordao"])),
          item(`${prefix} — Entrada`, fmtDate(o["entrada_cadastro"])),
          item(`${prefix} — Saída`, fmtDate(o["saida_cadastro"])),
        );
      });

      const itens = compactItems(
        item("Situação", isNegativa ? "Negativa (não inidôneo)" : totalProcs > 0 ? "Positiva (inidôneo)" : ""),
        item("Nome/Entidade", asStr(d["nome"])),
        item("Código Controle", numeroCertidao),
        item("Emissão", fmtDate(d["data_emissao"])),
        item("Validade", validade),
        ...itensProcs,
      );

      return {
        status,
        titulo: "TCU — Inidôneos para Licitar",
        resumo,
        itens,
        validade: validade || undefined,
        numeroCertidao: numeroCertidao || undefined,
        fonteUrl: extractFonteUrl(d),
      };
    },
  },

  // ─── 9. Secretaria de Inspeção do Trabalho / Trabalho Escravo ───────────────
  // "Lista suja" — empregadores que submeteram trabalhadores a condições análogas
  // à escravidão (consulta offline, publicada periodicamente pela SIT).
  // Endpoint: POST https://api.infosimples.com/api/v2/consultas/sit/trabalho-escravo
  // Params de entrada: token, cnpj
  // Campos-chave (por item de data[]): cnpj, nome, ano_acao, decisao_data,
  //   inclusao_data, lista_data, estabelecimento, uf, cnae,
  //   trabalhadores_envolvidos, site_origem, site_receipt
  // Status: data[] vazio => regular; data[] com registros => irregular.
  "mte-trabalho-escravo": {
    endpoint: "https://api.infosimples.com/api/v2/consultas/sit/trabalho-escravo",
    build: (url) => {
      const cnpj = sanitizeCnpj(url.searchParams.get("cnpj") ?? "");
      if (!cnpj) return { error: "CNPJ inválido: informe os 14 números." };
      return { key: cnpj, params: { cnpj } };
    },
    normalize: (data): NormalizedCompliance => {
      const count = data.length;
      const status: StatusCompliance = count === 0 ? "regular" : "irregular";
      const resumo = count === 0
        ? "Nada consta na lista de trabalho escravo (SIT)"
        : `Consta(m) ${count} registro(s) na lista de trabalho escravo`;

      const itensRegistros: ItemRotulo[] = data.flatMap((raw, i) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        const prefix = `Registro ${i + 1}`;
        return compactItems(
          item(`${prefix} — Nome/Razão Social`, asStr(r["nome"])),
          item(`${prefix} — Ano da Ação`, asStr(r["ano_acao"])),
          item(`${prefix} — Data Decisão`, fmtDate(r["decisao_data"])),
          item(`${prefix} — Inclusão na Lista`, fmtDate(r["inclusao_data"])),
          item(`${prefix} — Publicação da Lista`, fmtDate(r["lista_data"])),
          item(`${prefix} — Estabelecimento`, asStr(r["estabelecimento"])),
          item(`${prefix} — UF`, asStr(r["uf"])),
          item(`${prefix} — CNAE`, asStr(r["cnae"])),
          item(`${prefix} — Trabalhadores Envolvidos`, asStr(r["trabalhadores_envolvidos"])),
        );
      });

      const fonteUrl = count > 0 ? extractFonteUrl(data[0] as Record<string, unknown>) : undefined;

      return {
        status,
        titulo: "Lista de Trabalho Escravo (SIT/MTE)",
        resumo,
        itens: itensRegistros,
        fonteUrl,
      };
    },
  },

  // INPI / Marcas por CNPJ (titular). Caso de uso #1.
  "inpi-marcas-cnpj": {
    endpoint: "https://api.infosimples.com/api/v2/consultas/inpi/marcas-titular",
    build: (url) => {
      const cnpj = sanitizeCnpj(url.searchParams.get("cnpj") ?? "");
      if (!cnpj) return { error: "CNPJ invalido: informe os 14 numeros." };
      const pagina = url.searchParams.get("pagina") ?? "1";
      // A chave de cache inclui a pagina (cada pagina e uma consulta distinta).
      return { key: `${cnpj}:p${pagina}`, params: { cnpj, pagina } };
    },
    normalize: (data) => {
      // O endpoint de marcas devolve data[0] com processos[] + totais.
      const first = (data[0] ?? {}) as Record<string, unknown>;
      const rawProcessos = Array.isArray(first.processos) ? first.processos : [];
      const trademarks: InpiProcesso[] = rawProcessos.map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        return {
          numero: asStr(o.numero),
          marca: asStr(o.marca),
          classe: asStr(o.classe),
          situacao: asStr(o.situacao),
          tipo: asStr(o.tipo),
          titular: asStr(o.titular),
          prioridade: asStr(o.prioridade),
          registro: asStr(o.registro),
        };
      });
      return {
        trademarks,
        total: Number(first.processos_total ?? trademarks.length) || trademarks.length,
        totalPaginas: Number(first.total_paginas ?? 1) || 1,
        paginaAtual: Number(first.pagina_atual ?? 1) || 1,
      };
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // CONSULTAS GENÉRICAS (genericCnpjLookup) — entrada CNPJ, normalize defensivo.
  // Chave = "<org-com-/-trocada-por-->-<slug>". Não duplicar chaves dos ricos.
  // ════════════════════════════════════════════════════════════════════════════

  // ─── Receita Federal extras ──────────────────────────────────────────────────
  "receita-federal-situacao": genericCnpjLookup({ org: "receita-federal", slug: "situacao", titulo: "Situação Fiscal (Receita Federal)", categoria: "cadastro_federal", tipo: "info" }),
  "receita-federal-radar": genericCnpjLookup({ org: "receita-federal", slug: "radar", titulo: "Radar de Habilitação (Receita Federal)", categoria: "comercio_exterior", tipo: "info" }),
  "receita-federal-pgfn-devedores": genericCnpjLookup({ org: "receita-federal/pgfn", slug: "devedores", titulo: "Devedores PGFN (Receita Federal)", categoria: "certidoes_federais", tipo: "sancao" }),

  // ─── Regulatórios federais ───────────────────────────────────────────────────
  "anvisa-empresas": genericCnpjLookup({ org: "anvisa", slug: "empresas", titulo: "Empresas (ANVISA)", categoria: "saude", tipo: "cadastro" }),
  "anp-postos": genericCnpjLookup({ org: "anp", slug: "postos", titulo: "Postos (ANP)", categoria: "ambiental_energetico", tipo: "cadastro" }),
  "anp-certificados": genericCnpjLookup({ org: "anp", slug: "certificados", titulo: "Certificados (ANP)", categoria: "ambiental_energetico", tipo: "certidao" }),
  "anp-revendas": genericCnpjLookup({ org: "anp", slug: "revendas", titulo: "Revendas (ANP)", categoria: "ambiental_energetico", tipo: "cadastro" }),
  "antt-transportador": genericCnpjLookup({ org: "antt", slug: "transportador", titulo: "Transportador (ANTT)", categoria: "transportes", tipo: "cadastro" }),
  "antt-sifama-lista-autos": genericCnpjLookup({ org: "antt/sifama", slug: "lista-autos", titulo: "Lista de Autos SIFAMA (ANTT)", categoria: "transportes", tipo: "sancao" }),
  "b3-participantes": genericCnpjLookup({ org: "b3", slug: "participantes", titulo: "Participantes (B3)", categoria: "financeiro", tipo: "cadastro" }),
  "bcb-cheques-sem-fundo": genericCnpjLookup({ org: "bcb", slug: "cheques-sem-fundo", titulo: "Cheques sem Fundo (BCB)", categoria: "financeiro", tipo: "info" }),
  "cade-processos": genericCnpjLookup({ org: "cade", slug: "processos", titulo: "Processos (CADE)", categoria: "sancoes", tipo: "sancao" }),
  "carf-processo": genericCnpjLookup({ org: "carf", slug: "processo", titulo: "Processo Administrativo (CARF)", categoria: "tributario", tipo: "info" }),
  "cgu-cnc-tipo1": genericCnpjLookup({ org: "cgu", slug: "cnc-tipo1", titulo: "CNC Tipo 1 (CGU)", categoria: "sancoes", tipo: "certidao" }),
  "cvm-participante": genericCnpjLookup({ org: "cvm", slug: "participante", titulo: "Participante (CVM)", categoria: "financeiro", tipo: "cadastro" }),
  "cvm-processo-administrativo": genericCnpjLookup({ org: "cvm", slug: "processo-administrativo", titulo: "Processo Administrativo (CVM)", categoria: "financeiro", tipo: "sancao" }),
  "cvm-sancionadores": genericCnpjLookup({ org: "cvm", slug: "sancionadores", titulo: "Sancionadores (CVM)", categoria: "financeiro", tipo: "sancao" }),
  "dataprev-fap": genericCnpjLookup({ org: "dataprev", slug: "fap", titulo: "FAP (Dataprev)", categoria: "tributario", tipo: "info" }),
  "drei-registro": genericCnpjLookup({ org: "drei", slug: "registro", titulo: "Registro (DREI)", categoria: "junta_comercial", tipo: "cadastro" }),
  "fazenda-sped": genericCnpjLookup({ org: "fazenda", slug: "sped", titulo: "SPED (Fazenda)", categoria: "tributario", tipo: "cadastro" }),

  // ─── IBAMA ───────────────────────────────────────────────────────────────────
  "ibama-cr": genericCnpjLookup({ org: "ibama", slug: "cr", titulo: "Cadastro Técnico Federal (IBAMA)", categoria: "ambiental", tipo: "certidao" }),
  "ibama-embargos": genericCnpjLookup({ org: "ibama", slug: "embargos", titulo: "Embargos (IBAMA)", categoria: "ambiental", tipo: "sancao" }),
  "ibama-infracoes": genericCnpjLookup({ org: "ibama", slug: "infracoes", titulo: "Infrações Ambientais (IBAMA)", categoria: "ambiental", tipo: "sancao" }),

  // ─── Juntas Comerciais ───────────────────────────────────────────────────────
  "junta-comercial-ba-ficha-completa": genericCnpjLookup({ org: "junta-comercial/ba", slug: "ficha-completa", titulo: "Ficha Completa JUCEB (BA)", categoria: "junta_comercial", tipo: "cadastro" }),
  "junta-comercial-es-ficha-completa": genericCnpjLookup({ org: "junta-comercial/es", slug: "ficha-completa", titulo: "Ficha Completa JUCEES (ES)", categoria: "junta_comercial", tipo: "cadastro" }),
  "junta-comercial-go-ficha-completa": genericCnpjLookup({ org: "junta-comercial/go", slug: "ficha-completa", titulo: "Ficha Completa JUCEG (GO)", categoria: "junta_comercial", tipo: "cadastro" }),
  "junta-comercial-mg-ficha-completa": genericCnpjLookup({ org: "junta-comercial/mg", slug: "ficha-completa", titulo: "Ficha Completa JUCEMG (MG)", categoria: "junta_comercial", tipo: "cadastro" }),
  "junta-comercial-ms-ficha-completa": genericCnpjLookup({ org: "junta-comercial/ms", slug: "ficha-completa", titulo: "Ficha Completa JUCEMS (MS)", categoria: "junta_comercial", tipo: "cadastro" }),
  "junta-comercial-pe-ficha-completa": genericCnpjLookup({ org: "junta-comercial/pe", slug: "ficha-completa", titulo: "Ficha Completa JUCEPE (PE)", categoria: "junta_comercial", tipo: "cadastro" }),
  "junta-comercial-pr-ficha-completa": genericCnpjLookup({ org: "junta-comercial/pr", slug: "ficha-completa", titulo: "Ficha Completa JUCEPAR (PR)", categoria: "junta_comercial", tipo: "cadastro" }),
  "junta-comercial-rj-ficha-completa": genericCnpjLookup({ org: "junta-comercial/rj", slug: "ficha-completa", titulo: "Ficha Completa JUCERJA (RJ)", categoria: "junta_comercial", tipo: "cadastro" }),
  "junta-comercial-rs-ficha-completa": genericCnpjLookup({ org: "junta-comercial/rs", slug: "ficha-completa", titulo: "Ficha Completa JUCERGS (RS)", categoria: "junta_comercial", tipo: "cadastro" }),
  "junta-comercial-sc-ficha-completa": genericCnpjLookup({ org: "junta-comercial/sc", slug: "ficha-completa", titulo: "Ficha Completa JUCESC (SC)", categoria: "junta_comercial", tipo: "cadastro" }),
  "junta-comercial-sp-ficha-completa": genericCnpjLookup({ org: "junta-comercial/sp", slug: "ficha-completa", titulo: "Ficha Completa JUCESP (SP)", categoria: "junta_comercial", tipo: "cadastro" }),
  "junta-comercial-sp-cli": genericCnpjLookup({ org: "junta-comercial/sp", slug: "cli", titulo: "CLI JUCESP (SP)", categoria: "junta_comercial", tipo: "certidao" }),
  "junta-comercial-sp-completa": genericCnpjLookup({ org: "junta-comercial/sp", slug: "completa", titulo: "Dados Completos JUCESP (SP)", categoria: "junta_comercial", tipo: "info" }),

  // ─── Sanções / Compliance ────────────────────────────────────────────────────
  "cnj-improbidade": genericCnpjLookup({ org: "cnj", slug: "improbidade", titulo: "Improbidade Administrativa (CNJ)", categoria: "sancoes", tipo: "sancao" }),
  "cnj-seeu-processos": genericCnpjLookup({ org: "cnj/seeu", slug: "processos", titulo: "Processos SEEU (CNJ)", categoria: "juridico", tipo: "info" }),
  "comprot-processo": genericCnpjLookup({ org: "comprot", slug: "processo", titulo: "Processo COMPROT", categoria: "tributario", tipo: "info" }),
  "cenprot-sp-protestos": genericCnpjLookup({ org: "cenprot-sp", slug: "protestos", titulo: "Protestos CENPROT (SP)", categoria: "financeiro", tipo: "sancao" }),
  "tce-sp-certidao-apenados": genericCnpjLookup({ org: "tce/sp", slug: "certidao-apenados", titulo: "Certidão de Apenados TCE-SP", categoria: "sancoes", tipo: "sancao" }),
  "tcu-cnp": genericCnpjLookup({ org: "tcu", slug: "cnp", titulo: "Certidão Negativa de Processo (TCU)", categoria: "sancoes", tipo: "certidao" }),
  "tcu-consolidada-pj": genericCnpjLookup({ org: "tcu", slug: "consolidada-pj", titulo: "Consulta Consolidada PJ (TCU/APF)", categoria: "sancoes", tipo: "info" }),
  "tcu-inabilitados": genericCnpjLookup({ org: "tcu", slug: "inabilitados", titulo: "Inabilitados (TCU)", categoria: "sancoes", tipo: "sancao" }),
  "tcu-inidoneos": genericCnpjLookup({ org: "tcu", slug: "inidoneos", titulo: "Inidôneos (TCU)", categoria: "sancoes", tipo: "sancao" }),
  "transparencia-cepim": genericCnpjLookup({ org: "portal-transparencia", slug: "cepim", titulo: "CEPIM (Portal da Transparência)", categoria: "sancoes", tipo: "sancao" }),
  "transparencia-contratos": genericCnpjLookup({ org: "portal-transparencia", slug: "contratos", titulo: "Contratos Federais (Portal da Transparência)", categoria: "contratos_publicos", tipo: "info" }),

  // ─── MPF / MPT ───────────────────────────────────────────────────────────────
  "mpf-certidao-negativa": genericCnpjLookup({ org: "mpf", slug: "certidao-negativa", titulo: "Certidão Negativa (MPF)", categoria: "juridico", tipo: "certidao" }),
  "mpt-cnf-unificada": genericCnpjLookup({ org: "mpt/cnf", slug: "unificada", titulo: "CNF Unificada (MPT)", categoria: "trabalhista", tipo: "certidao" }),

  // ─── SUSEP ───────────────────────────────────────────────────────────────────
  "susep-administradores": genericCnpjLookup({ org: "susep", slug: "administradores", titulo: "Administradores (SUSEP)", categoria: "financeiro", tipo: "cadastro" }),

  // ─── PGE-SP ──────────────────────────────────────────────────────────────────
  "pge-sp-cndt": genericCnpjLookup({ org: "pge/sp", slug: "cndt", titulo: "CNDT PGE-SP", categoria: "tributario_estadual", tipo: "certidao" }),
  "pge-sp-divida-ativa": genericCnpjLookup({ org: "pge/sp", slug: "divida-ativa", titulo: "Dívida Ativa PGE-SP", categoria: "tributario_estadual", tipo: "sancao" }),

  // ─── Prefeitura SP Capital ────────────────────────────────────────────────────
  "pref-sp-sao-paulo-cadin": genericCnpjLookup({ org: "pref/sp/sao-paulo", slug: "cadin", titulo: "CADIN Municipal SP", categoria: "tributario_municipal", tipo: "sancao" }),
  "pref-sp-sao-paulo-cpom": genericCnpjLookup({ org: "pref/sp/sao-paulo", slug: "cpom", titulo: "CPOM (Prefeitura SP)", categoria: "tributario_municipal", tipo: "cadastro" }),
  "pref-sp-sao-paulo-ccm": genericCnpjLookup({ org: "pref/sp/sao-paulo", slug: "ccm", titulo: "CCM (Prefeitura SP)", categoria: "tributario_municipal", tipo: "cadastro" }),
  "pref-sp-sao-paulo-ctm": genericCnpjLookup({ org: "pref/sp/sao-paulo", slug: "ctm", titulo: "CTM Municipal SP", categoria: "tributario_municipal", tipo: "certidao" }),

  // ─── SEFAZ Unificada e estados ───────────────────────────────────────────────
  "sefaz-certidao-debitos": genericCnpjLookup({ org: "sefaz", slug: "certidao-debitos", titulo: "Certidão de Débitos SEFAZ (Unificada)", categoria: "tributario_estadual", tipo: "certidao" }),
  "sefaz-cadastro-centralizado": genericCnpjLookup({ org: "sefaz", slug: "cadastro-centralizado", titulo: "Cadastro Centralizado SEFAZ", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sefaz-df-iss": genericCnpjLookup({ org: "sefaz/df", slug: "iss", titulo: "ISS SEFAZ-DF", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sefaz-mg-cadin": genericCnpjLookup({ org: "sefaz/mg", slug: "cadin", titulo: "CADIN SEFAZ-MG", categoria: "tributario_estadual", tipo: "sancao" }),
  "sefaz-mg-protesto": genericCnpjLookup({ org: "sefaz/mg", slug: "protesto", titulo: "Protesto SEFAZ-MG", categoria: "tributario_estadual", tipo: "sancao" }),
  "sefaz-pr-cadin": genericCnpjLookup({ org: "sefaz/pr", slug: "cadin", titulo: "CADIN SEFAZ-PR", categoria: "tributario_estadual", tipo: "sancao" }),
  "sefaz-ap-certidao-debitos": genericCnpjLookup({ org: "sefaz/ap", slug: "certidao-debitos", titulo: "CND SEFAZ-AP", categoria: "tributario_estadual", tipo: "certidao" }),
  "sefaz-ba-certidao-debitos": genericCnpjLookup({ org: "sefaz/ba", slug: "certidao-debitos", titulo: "CND SEFAZ-BA", categoria: "tributario_estadual", tipo: "certidao" }),
  "sefaz-ce-certidao-debitos": genericCnpjLookup({ org: "sefaz/ce", slug: "certidao-debitos", titulo: "CND SEFAZ-CE", categoria: "tributario_estadual", tipo: "certidao" }),
  "sefaz-df-certidao-debitos": genericCnpjLookup({ org: "sefaz/df", slug: "certidao-debitos", titulo: "CND SEFAZ-DF", categoria: "tributario_estadual", tipo: "certidao" }),
  "sefaz-es-certidao-debitos": genericCnpjLookup({ org: "sefaz/es", slug: "certidao-debitos", titulo: "CND SEFAZ-ES", categoria: "tributario_estadual", tipo: "certidao" }),
  "sefaz-go-certidao-debitos": genericCnpjLookup({ org: "sefaz/go", slug: "certidao-debitos", titulo: "CND SEFAZ-GO", categoria: "tributario_estadual", tipo: "certidao" }),
  "sefaz-ma-certidao-debitos": genericCnpjLookup({ org: "sefaz/ma", slug: "certidao-debitos", titulo: "CND SEFAZ-MA", categoria: "tributario_estadual", tipo: "certidao" }),
  "sefaz-mg-certidao-debitos": genericCnpjLookup({ org: "sefaz/mg", slug: "certidao-debitos", titulo: "CND SEFAZ-MG", categoria: "tributario_estadual", tipo: "certidao" }),
  "sefaz-ms-certidao-debitos": genericCnpjLookup({ org: "sefaz/ms", slug: "certidao-debitos", titulo: "CND SEFAZ-MS", categoria: "tributario_estadual", tipo: "certidao" }),
  "sefaz-mt-certidao-debitos": genericCnpjLookup({ org: "sefaz/mt", slug: "certidao-debitos", titulo: "CND SEFAZ-MT", categoria: "tributario_estadual", tipo: "certidao" }),
  "sefaz-pa-certidao-debitos": genericCnpjLookup({ org: "sefaz/pa", slug: "certidao-debitos", titulo: "CND SEFAZ-PA", categoria: "tributario_estadual", tipo: "certidao" }),
  "sefaz-pb-certidao-debitos": genericCnpjLookup({ org: "sefaz/pb", slug: "certidao-debitos", titulo: "CND SEFAZ-PB", categoria: "tributario_estadual", tipo: "certidao" }),
  "sefaz-pe-certidao-debitos": genericCnpjLookup({ org: "sefaz/pe", slug: "certidao-debitos", titulo: "CND SEFAZ-PE", categoria: "tributario_estadual", tipo: "certidao" }),
  "sefaz-pr-certidao-debitos": genericCnpjLookup({ org: "sefaz/pr", slug: "certidao-debitos", titulo: "CND SEFAZ-PR", categoria: "tributario_estadual", tipo: "certidao" }),

  // ─── SINTEGRA ────────────────────────────────────────────────────────────────
  "sintegra-unificada": genericCnpjLookup({ org: "sintegra", slug: "unificada", titulo: "SINTEGRA Unificado", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-ac": genericCnpjLookup({ org: "sintegra", slug: "ac", titulo: "SINTEGRA AC", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-al": genericCnpjLookup({ org: "sintegra", slug: "al", titulo: "SINTEGRA AL", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-am": genericCnpjLookup({ org: "sintegra", slug: "am", titulo: "SINTEGRA AM", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-ap": genericCnpjLookup({ org: "sintegra", slug: "ap", titulo: "SINTEGRA AP", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-ba": genericCnpjLookup({ org: "sintegra", slug: "ba", titulo: "SINTEGRA BA", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-ce": genericCnpjLookup({ org: "sintegra", slug: "ce", titulo: "SINTEGRA CE", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-df": genericCnpjLookup({ org: "sintegra", slug: "df", titulo: "SINTEGRA DF", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-es": genericCnpjLookup({ org: "sintegra", slug: "es", titulo: "SINTEGRA ES", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-go": genericCnpjLookup({ org: "sintegra", slug: "go", titulo: "SINTEGRA GO", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-ma": genericCnpjLookup({ org: "sintegra", slug: "ma", titulo: "SINTEGRA MA", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-ms": genericCnpjLookup({ org: "sintegra", slug: "ms", titulo: "SINTEGRA MS", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-mt": genericCnpjLookup({ org: "sintegra", slug: "mt", titulo: "SINTEGRA MT", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-pa": genericCnpjLookup({ org: "sintegra", slug: "pa", titulo: "SINTEGRA PA", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-pb": genericCnpjLookup({ org: "sintegra", slug: "pb", titulo: "SINTEGRA PB", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-pe": genericCnpjLookup({ org: "sintegra", slug: "pe", titulo: "SINTEGRA PE", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-pr": genericCnpjLookup({ org: "sintegra", slug: "pr", titulo: "SINTEGRA PR", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-rj": genericCnpjLookup({ org: "sintegra", slug: "rj", titulo: "SINTEGRA RJ", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-rn": genericCnpjLookup({ org: "sintegra", slug: "rn", titulo: "SINTEGRA RN", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-ro": genericCnpjLookup({ org: "sintegra", slug: "ro", titulo: "SINTEGRA RO", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-rr": genericCnpjLookup({ org: "sintegra", slug: "rr", titulo: "SINTEGRA RR", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-rs": genericCnpjLookup({ org: "sintegra", slug: "rs", titulo: "SINTEGRA RS", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-sc": genericCnpjLookup({ org: "sintegra", slug: "sc", titulo: "SINTEGRA SC", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-se": genericCnpjLookup({ org: "sintegra", slug: "se", titulo: "SINTEGRA SE", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-sp": genericCnpjLookup({ org: "sintegra", slug: "sp", titulo: "SINTEGRA SP", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-to": genericCnpjLookup({ org: "sintegra", slug: "to", titulo: "SINTEGRA TO", categoria: "tributario_estadual", tipo: "cadastro" }),
  "sintegra-suframa": genericCnpjLookup({ org: "sintegra", slug: "suframa", titulo: "SINTEGRA SUFRAMA", categoria: "tributario_estadual", tipo: "cadastro" }),

  // ─── Tribunais TRT (CEAT) ────────────────────────────────────────────────────
  "tribunal-trt1-ceat": genericCnpjLookup({ org: "tribunal/trt1", slug: "ceat", titulo: "CEAT TRT1 (RJ)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt2-ceat": genericCnpjLookup({ org: "tribunal/trt2", slug: "ceat", titulo: "CEAT TRT2 (SP físico)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt2-ceat-digital": genericCnpjLookup({ org: "tribunal/trt2", slug: "ceat-digital", titulo: "CEAT TRT2 (SP digital)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt3-ceat": genericCnpjLookup({ org: "tribunal/trt3", slug: "ceat", titulo: "CEAT TRT3 (MG)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt4-ceat": genericCnpjLookup({ org: "tribunal/trt4", slug: "ceat", titulo: "CEAT TRT4 (RS)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt5-ceat": genericCnpjLookup({ org: "tribunal/trt5", slug: "ceat", titulo: "CEAT TRT5 (BA)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt6-certidao": genericCnpjLookup({ org: "tribunal/trt6", slug: "certidao", titulo: "CEAT TRT6 (PE)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt7-ceat": genericCnpjLookup({ org: "tribunal/trt7", slug: "ceat", titulo: "CEAT TRT7 (CE)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt7-ceat-digital": genericCnpjLookup({ org: "tribunal/trt7", slug: "ceat-digital", titulo: "CEAT TRT7 (CE digital)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt8-ceat": genericCnpjLookup({ org: "tribunal/trt8", slug: "ceat", titulo: "CEAT TRT8 (PA/AP)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt9-ceat": genericCnpjLookup({ org: "tribunal/trt9", slug: "ceat", titulo: "CEAT TRT9 (PR)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt10-ceat": genericCnpjLookup({ org: "tribunal/trt10", slug: "ceat", titulo: "CEAT TRT10 (DF/TO)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt10-ceat-digital": genericCnpjLookup({ org: "tribunal/trt10", slug: "ceat-digital", titulo: "CEAT TRT10 (DF/TO digital)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt11-ceat": genericCnpjLookup({ org: "tribunal/trt11", slug: "ceat", titulo: "CEAT TRT11 (AM/RR)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt12-ceat": genericCnpjLookup({ org: "tribunal/trt12", slug: "ceat", titulo: "CEAT TRT12 (SC)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt13-ceat": genericCnpjLookup({ org: "tribunal/trt13", slug: "ceat", titulo: "CEAT TRT13 (PB)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt14-ceat": genericCnpjLookup({ org: "tribunal/trt14", slug: "ceat", titulo: "CEAT TRT14 (RO/AC)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt15-ceat": genericCnpjLookup({ org: "tribunal/trt15", slug: "ceat", titulo: "CEAT TRT15 (Campinas)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt16-ceat": genericCnpjLookup({ org: "tribunal/trt16", slug: "ceat", titulo: "CEAT TRT16 (MA)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt17-ceat": genericCnpjLookup({ org: "tribunal/trt17", slug: "ceat", titulo: "CEAT TRT17 (ES)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt18-ceat": genericCnpjLookup({ org: "tribunal/trt18", slug: "ceat", titulo: "CEAT TRT18 (GO)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt19-ceat": genericCnpjLookup({ org: "tribunal/trt19", slug: "ceat", titulo: "CEAT TRT19 (AL)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt20-ceat": genericCnpjLookup({ org: "tribunal/trt20", slug: "ceat", titulo: "CEAT TRT20 (SE)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt21-ceat": genericCnpjLookup({ org: "tribunal/trt21", slug: "ceat", titulo: "CEAT TRT21 (RN)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt23-ceat": genericCnpjLookup({ org: "tribunal/trt23", slug: "ceat", titulo: "CEAT TRT23 (MT)", categoria: "trabalhista", tipo: "certidao" }),
  "tribunal-trt24-ceat": genericCnpjLookup({ org: "tribunal/trt24", slug: "ceat", titulo: "CEAT TRT24 (MS)", categoria: "trabalhista", tipo: "certidao" }),

  // ─── Tribunais TRF (certidões) ───────────────────────────────────────────────
  "tribunal-trf-cert-unificada": genericCnpjLookup({ org: "tribunal/trf", slug: "cert-unificada", titulo: "Certidão Unificada Justiça Federal (TRF)", categoria: "certidoes_federais", tipo: "certidao" }),
  "tribunal-trf1-certidao": genericCnpjLookup({ org: "tribunal/trf1", slug: "certidao", titulo: "Certidão Negativa TRF1", categoria: "certidoes_federais", tipo: "certidao" }),
  "tribunal-trf2-certidao": genericCnpjLookup({ org: "tribunal/trf2", slug: "certidao", titulo: "Certidão Negativa TRF2", categoria: "certidoes_federais", tipo: "certidao" }),
  "tribunal-trf3-certidao-distr": genericCnpjLookup({ org: "tribunal/trf3", slug: "certidao-distr", titulo: "Certidão de Distribuição TRF3", categoria: "certidoes_federais", tipo: "certidao" }),
  "tribunal-trf4-certidao": genericCnpjLookup({ org: "tribunal/trf4", slug: "certidao", titulo: "Certidão Negativa TRF4", categoria: "certidoes_federais", tipo: "certidao" }),
  "tribunal-trf5-certidao": genericCnpjLookup({ org: "tribunal/trf5", slug: "certidao", titulo: "Certidão Negativa TRF5", categoria: "certidoes_federais", tipo: "certidao" }),
  "tribunal-trf6-certidao": genericCnpjLookup({ org: "tribunal/trf6", slug: "certidao", titulo: "Certidão Negativa TRF6", categoria: "certidoes_federais", tipo: "certidao" }),
  "tribunal-stj-certidao-negativa": genericCnpjLookup({ org: "tribunal/stj", slug: "certidao-negativa", titulo: "Certidão Negativa STJ", categoria: "certidoes_federais", tipo: "certidao" }),

  // ─── Tribunais TJ (certidões estaduais) ─────────────────────────────────────
  "tribunal-tjba-primeiro-grau": genericCnpjLookup({ org: "tribunal/tjba", slug: "primeiro-grau", titulo: "Certidão 1º Grau TJBA", categoria: "certidoes_estaduais", tipo: "certidao" }),
  "tribunal-tjgo-nada-consta": genericCnpjLookup({ org: "tribunal/tjgo", slug: "nada-consta", titulo: "Nada Consta TJGO", categoria: "certidoes_estaduais", tipo: "certidao" }),
  "tribunal-tjma-nada-consta": genericCnpjLookup({ org: "tribunal/tjma", slug: "nada-consta", titulo: "Nada Consta TJMA", categoria: "certidoes_estaduais", tipo: "certidao" }),
  "tribunal-tjms-pedido-cert": genericCnpjLookup({ org: "tribunal/tjms", slug: "pedido-cert", titulo: "Pedido de Certidão TJMS", categoria: "certidoes_estaduais", tipo: "certidao" }),
  "tribunal-tjpr-processo": genericCnpjLookup({ org: "tribunal/tjpr", slug: "processo", titulo: "Processos TJPR", categoria: "certidoes_estaduais", tipo: "info" }),
  "tribunal-tjrj-pedido-cert": genericCnpjLookup({ org: "tribunal/tjrj", slug: "pedido-cert", titulo: "Pedido de Certidão TJRJ", categoria: "certidoes_estaduais", tipo: "certidao" }),
  "tribunal-tjrs-primeiro-grau": genericCnpjLookup({ org: "tribunal/tjrs", slug: "primeiro-grau", titulo: "Certidão 1º Grau TJRS", categoria: "certidoes_estaduais", tipo: "certidao" }),
  "tribunal-tjsc-pedido-certidao": genericCnpjLookup({ org: "tribunal/tjsc", slug: "pedido-certidao", titulo: "Pedido de Certidão TJSC", categoria: "certidoes_estaduais", tipo: "certidao" }),
  "tribunal-tjsp-pedido-certidao": genericCnpjLookup({ org: "tribunal/tjsp", slug: "pedido-certidao", titulo: "Pedido de Certidão TJSP", categoria: "certidoes_estaduais", tipo: "certidao" }),
  "tribunal-tjsp-pedido-civel": genericCnpjLookup({ org: "tribunal/tjsp", slug: "pedido-civel", titulo: "Certidão Cível 1º Grau TJSP", categoria: "certidoes_estaduais", tipo: "certidao" }),
  "tribunal-tjsp-primeiro-grau": genericCnpjLookup({ org: "tribunal/tjsp", slug: "primeiro-grau", titulo: "Processos 1º Grau TJSP", categoria: "certidoes_estaduais", tipo: "info" }),
  "tribunal-tjsp-segundo-grau": genericCnpjLookup({ org: "tribunal/tjsp", slug: "segundo-grau", titulo: "Processos 2º Grau TJSP", categoria: "certidoes_estaduais", tipo: "info" }),
  "tribunal-tjto-cert-judicial": genericCnpjLookup({ org: "tribunal/tjto", slug: "cert-judicial", titulo: "Certidão Judicial TJTO", categoria: "certidoes_estaduais", tipo: "certidao" }),

  // ─── TST extras ───────────────────────────────────────────────────────────────
  "tribunal-tst-banco-falencias": genericCnpjLookup({ org: "tribunal/tst", slug: "banco-falencias", titulo: "Banco de Falências (TST)", categoria: "juridico", tipo: "info" }),

  // ─── SIVISA ───────────────────────────────────────────────────────────────────
  "sivisa-sp": genericCnpjLookup({ org: "sivisa", slug: "sp", titulo: "Alvará Vigilância Sanitária (SIVISA/SP)", categoria: "saude", tipo: "certidao" }),
};

// ─── Catálogo público de consultas disponíveis ────────────────────────────────
// Usado pelo GET /catalog — não requer plano pago.
interface CatalogEntry {
  kind: string;
  titulo: string;
  categoria: string;
  inputs: string[];
}

const CATALOG: CatalogEntry[] = Object.entries(LOOKUPS).map(([kind, def]) => {
  // Para ricos: extrair titulo do normalize("") não é prático — usar mapa fixo p/ os 10 ricos.
  const richTitles: Record<string, { titulo: string; categoria: string }> = {
    "receita-federal-cnpj":   { titulo: "Cadastro CNPJ (Receita Federal)",               categoria: "cadastro_federal" },
    "receita-federal-simples":{ titulo: "Simples Nacional (Receita Federal)",             categoria: "cadastro_federal" },
    "receita-federal-pgfn":   { titulo: "CND Federal (PGFN)",                            categoria: "certidoes_federais" },
    "tst-cndt":               { titulo: "CNDT (TST)",                                    categoria: "trabalhista" },
    "caixa-fgts":             { titulo: "Regularidade do Empregador (FGTS/CRF)",         categoria: "trabalhista" },
    "transparencia-ceis":     { titulo: "CEIS (Portal da Transparência)",                categoria: "sancoes" },
    "transparencia-cnep":     { titulo: "CNEP (Portal da Transparência)",                categoria: "sancoes" },
    "tcu-inidoneo":           { titulo: "TCU — Inidôneos para Licitar",                  categoria: "sancoes" },
    "mte-trabalho-escravo":   { titulo: "Lista de Trabalho Escravo (SIT/MTE)",           categoria: "sancoes" },
    "inpi-marcas-cnpj":       { titulo: "Marcas por CNPJ (INPI)",                        categoria: "propriedade_intelectual" },
  };
  const rich = richTitles[kind];
  const anyDef = def as Record<string, unknown>;
  return {
    kind,
    titulo: rich?.titulo ?? (typeof anyDef["_titulo"] === "string" ? anyDef["_titulo"] : kind),
    categoria: rich?.categoria ?? (typeof anyDef["_categoria"] === "string" ? anyDef["_categoria"] : "outros"),
    inputs: ["cnpj"],
  };
});

// ─── Plano do usuario (gating: so plano pago dispara consulta paga) ──────────
async function isPaidUser(req: Request, supabaseUrl: string): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  // Publishable key nao e sessao; sem token de usuario => nao e pago.
  if (!token || token === PUBLISHABLE_KEY || token.startsWith("sb_publishable_")) return false;
  try {
    const res = await fetchWithRetry(`${supabaseUrl}/rest/v1/rpc/my_plan`, {
      timeoutMs: 10000,
      retries: 1,
      init: {
        method: "POST",
        headers: {
          apikey: PUBLISHABLE_KEY,
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: "{}",
      },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { plan?: string };
    return data.plan === "pro" || data.plan === "corporativo";
  } catch {
    return false;
  }
}

// ─── Acesso a tabela external_lookups (service_role; ignora RLS) ─────────────
interface DbCtx {
  url: string;
  serviceKey: string;
}

function dbCtx(): DbCtx | null {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

function dbHeaders(db: DbCtx, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: db.serviceKey,
    authorization: `Bearer ${db.serviceKey}`,
    "content-type": "application/json",
    ...extra,
  };
}

// Resolve o token da InfoSimples: primeiro a env var (caso setada no dashboard),
// senao o Vault do Supabase (RPC get_vault_secret) — que pode ser provisionado
// via SQL. Assim a integracao liga por Secret de Edge Function OU por Vault.
async function resolveToken(): Promise<string> {
  const envTok = (Deno.env.get("INFOSIMPLES_TOKEN") ?? "").trim();
  if (envTok) return envTok;
  const db = dbCtx();
  if (!db) return "";
  try {
    const res = await fetchWithRetry(`${db.url}/rest/v1/rpc/get_vault_secret`, {
      timeoutMs: 8000,
      retries: 1,
      init: { method: "POST", headers: dbHeaders(db), body: JSON.stringify({ p_name: "INFOSIMPLES_TOKEN" }) },
    });
    if (!res.ok) return "";
    const v = (await res.json()) as unknown;
    return typeof v === "string" ? v.trim() : "";
  } catch {
    return "";
  }
}

interface CacheRow {
  payload: unknown;
  fetched_at: string;
}

// Le a linha de cache (provider, kind, key). Devolve null em qualquer falha
// (fail-open p/ leitura: pior caso = cache miss, que a trava ainda protege).
async function readCache(db: DbCtx, kind: string, key: string): Promise<CacheRow | null> {
  try {
    const qs = new URLSearchParams({
      provider: `eq.${PROVIDER}`,
      lookup_kind: `eq.${kind}`,
      lookup_key: `eq.${key}`,
      select: "payload,fetched_at",
      limit: "1",
    });
    const res = await fetchWithRetry(`${db.url}/rest/v1/external_lookups?${qs}`, {
      timeoutMs: 8000,
      retries: 1,
      init: { headers: dbHeaders(db) },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as CacheRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// Grava (upsert) o resultado 'live' no cache. on_conflict no indice unico
// (provider, lookup_kind, lookup_key) p/ atualizar payload+fetched_at no refresh.
async function writeCache(
  db: DbCtx,
  kind: string,
  key: string,
  payload: unknown,
  userId: string,
): Promise<void> {
  try {
    await fetchWithRetry(
      `${db.url}/rest/v1/external_lookups?on_conflict=provider,lookup_kind,lookup_key`,
      {
        timeoutMs: 8000,
        retries: 1,
        init: {
          method: "POST",
          headers: dbHeaders(db, { prefer: "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify({
            provider: PROVIDER,
            lookup_kind: kind,
            lookup_key: key,
            payload,
            source: "live",
            requested_by: userId,
            fetched_at: new Date().toISOString(),
          }),
        },
      },
    );
  } catch (e) {
    // Falha de escrita nao derruba a resposta — so perde o cache desta consulta.
    console.error("[infosimples-proxy] writeCache falhou:", String(e));
  }
}

// Conta chamadas 'live' do mes (trava de gasto). Fail-CLOSED: se nao der p/
// contar, assume estouro e NAO chama a API paga (seguranca de custo > UX).
async function monthlyLiveCount(db: DbCtx): Promise<number | null> {
  try {
    const res = await fetchWithRetry(`${db.url}/rest/v1/rpc/external_lookup_spend_count`, {
      timeoutMs: 8000,
      retries: 1,
      init: { method: "POST", headers: dbHeaders(db), body: JSON.stringify({ p_provider: PROVIDER }) },
    });
    if (!res.ok) return null;
    return Number(await res.json());
  } catch {
    return null;
  }
}

// Conta chamadas 'live' do usuario nas ultimas 24h (rate-limit). Fail-OPEN:
// a trava mensal global ja segura o custo; nao penalizamos o usuario por erro de infra.
async function userDayCount(db: DbCtx, userId: string): Promise<number> {
  try {
    const res = await fetchWithRetry(`${db.url}/rest/v1/rpc/external_lookup_user_day_count`, {
      timeoutMs: 8000,
      retries: 1,
      init: {
        method: "POST",
        headers: dbHeaders(db),
        body: JSON.stringify({ p_provider: PROVIDER, p_user: userId }),
      },
    });
    if (!res.ok) return 0;
    return Number(await res.json()) || 0;
  } catch {
    return 0;
  }
}

// Conta TODAS as chamadas 'live' do usuario (sem limite de data) — usada para
// a cota de cortesia do trial. Fail-OPEN: em erro de infra retorna 0, deixando
// a trava mensal global como ultima linha de defesa de custo.
async function userTotalLiveCount(db: DbCtx, userId: string): Promise<number> {
  try {
    const res = await fetchWithRetry(`${db.url}/rest/v1/rpc/external_lookup_user_total_count`, {
      timeoutMs: 8000,
      retries: 1,
      init: {
        method: "POST",
        headers: dbHeaders(db),
        body: JSON.stringify({ p_provider: PROVIDER, p_user: userId }),
      },
    });
    if (!res.ok) return 0;
    return Number(await res.json()) || 0;
  } catch {
    return 0;
  }
}

// ─── Chamada a InfoSimples ───────────────────────────────────────────────────
interface InfosimplesEnvelope {
  code?: number;
  code_message?: string;
  data?: unknown[];
  errors?: unknown[];
  site_receipts?: unknown[];
}

async function callInfosimples(
  def: LookupDef,
  token: string,
  params: Record<string, string>,
): Promise<InfosimplesEnvelope> {
  const form = new URLSearchParams({ token, timeout: String(envInt("INFOSIMPLES_TIMEOUT_S", DEFAULT_TIMEOUT_S)) });
  for (const [k, v] of Object.entries(params)) form.set(k, v);
  // timeoutMs do nosso fetch > timeout da InfoSimples p/ nao abortar antes dela.
  const res = await fetchWithRetry(def.endpoint, {
    timeoutMs: (envInt("INFOSIMPLES_TIMEOUT_S", DEFAULT_TIMEOUT_S) + 20) * 1000,
    retries: 1,
    backoffMs: 1500,
    // Nao re-tentar 4xx (codigos de negocio); so erro de rede/5xx via throw.
    retryOnStatus: (s) => s >= 500,
    init: {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: form.toString(),
    },
  });
  return (await res.json()) as InfosimplesEnvelope;
}

// ─── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req, { methods: "GET, POST, OPTIONS" });
  if (preflight) return preflight;

  const reply = (body: unknown, status = 200) => jsonResponse(body, { status }, req);

  // Gate 1: header apikey (publishable). Sem ele, endpoint nao responde.
  if (!hasValidApiKey(req, PUBLISHABLE_KEY)) {
    return reply({ ok: false, error: "apikey_invalida", message: "apikey ausente ou invalida." }, 401);
  }

  const url = new URL(req.url);

  // Health: util p/ checar se a integracao esta ligada sem gastar consulta.
  if (url.pathname.endsWith("/health")) {
    return reply({
      service: "infosimples-proxy",
      status: "ok",
      configured: Boolean(await resolveToken()),
      kinds: Object.keys(LOOKUPS),
      time: new Date().toISOString(),
    });
  }

  // Catalogo de consultas disponíveis — sem custo, sem sessao, so apikey.
  if (url.pathname.endsWith("/catalog")) {
    return reply({ ok: true, kinds: CATALOG });
  }

  // DORMENTE: sem token => 200 configured:false, SEM erro. O front mantem o
  // comportamento atual (RPI/base ingerida). Responde antes de qualquer authz
  // de sessao p/ nunca custar nada e nunca quebrar a tela.
  const token = await resolveToken();
  if (!token) {
    return reply({
      ok: true,
      configured: false,
      source: "disabled",
      message: "InfoSimples nao configurada.",
    });
  }

  // Gate 2: usuario logado (token de sessao verificado contra o Supabase Auth).
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const userId = supabaseUrl ? await getVerifiedUserId(req, supabaseUrl, PUBLISHABLE_KEY) : null;
  if (!userId) {
    return reply(
      {
        ok: false,
        configured: true,
        error: "login_requerido",
        message: "Faca login para consultar dados premium (InfoSimples).",
      },
      401,
    );
  }

  // Status da autenticação gov.br — apikey + sessao; SEM custo (nao exige plano pago).
  if (url.pathname.endsWith("/govbr-status")) {
    try {
      const res = await fetchWithRetry("https://api.infosimples.com/api/admin/autenticacao-govbr", {
        timeoutMs: 15000,
        retries: 1,
        init: {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
          body: new URLSearchParams({ token }).toString(),
        },
      });
      if (!res.ok) {
        return reply({ ok: false, configured: true, error: "govbr_unavailable", message: `InfoSimples respondeu ${res.status}` });
      }
      const body = (await res.json()) as { code?: number; data?: unknown[] };
      const sessions = Array.isArray(body.data) ? body.data : [];
      return reply({ ok: true, configured: true, sessions });
    } catch (e) {
      return reply({ ok: false, configured: true, error: "govbr_error", message: String(e) });
    }
  }

  // Roteamento por `kind` (default = caso de uso #1: INPI marcas por CNPJ).
  const kind = (url.searchParams.get("kind") ?? "inpi-marcas-cnpj").trim();
  const def = LOOKUPS[kind];
  if (!def) {
    return reply({ ok: false, configured: true, error: "kind_invalido", message: `kind '${kind}' nao suportado.` }, 400);
  }

  const built = def.build(url);
  if ("error" in built) {
    return reply({ ok: false, configured: true, error: "parametro_invalido", message: built.error }, 400);
  }

  const db = dbCtx();
  if (!db) {
    // Sem acesso ao banco nao ha como aplicar cache nem trava => NAO gastamos.
    return reply(
      { ok: false, configured: true, error: "indisponivel", message: "Servico temporariamente indisponivel." },
      503,
    );
  }

  // CACHE-FIRST: hit fresco (dentro do TTL) => devolve do cache, custo ZERO.
  // Posicionado ANTES do gate de plano/cota: cache hits sao gratis para qualquer
  // usuario autenticado (trial ou pago) e nao consomem cota de cortesia.
  const ttlMs = envInt("INFOSIMPLES_CACHE_TTL_DAYS", DEFAULT_CACHE_TTL_DAYS) * 86_400_000;
  const cached = await readCache(db, kind, built.key);
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < ttlMs) {
    // Spread do payload PRIMEIRO p/ os campos do envelope (source:'cache' etc.) vencerem.
    return reply({ ...(cached.payload as object), ok: true, configured: true, source: "cache", kind, cachedAt: cached.fetched_at });
  }

  // GATE 3 (cache miss): so aqui e que uma chamada live seria disparada.
  // Plano pago => prossegue sem restricao de cota de cortesia.
  // Trial/free => verifica cota de cortesia (INFOSIMPLES_TRIAL_QUOTA consultas live no total).
  const paid = await isPaidUser(req, supabaseUrl);
  if (!paid) {
    const trialQuota = envInt("INFOSIMPLES_TRIAL_QUOTA", DEFAULT_TRIAL_QUOTA);
    const totalUsed = await userTotalLiveCount(db, userId);
    if (totalUsed >= trialQuota) {
      return reply(
        {
          ok: false,
          configured: true,
          error: "plano_requerido",
          message:
            `Voce ja utilizou suas ${trialQuota} consultas de demonstracao gratuitas. ` +
            "Assine um plano para continuar consultando dados premium.",
          quotaUsed: totalUsed,
          quotaLimit: trialQuota,
        },
        403,
      );
    }
    // Dentro da cota: prossegue, sujeito tambem aos caps globais de gasto abaixo.
  }

  // RATE-LIMIT por usuario (chamadas 'live'/dia). Acima do limite, recusa.
  const dailyCap = envInt("INFOSIMPLES_DAILY_PER_USER", DEFAULT_DAILY_PER_USER);
  if ((await userDayCount(db, userId)) >= dailyCap) {
    return reply(
      {
        ok: false,
        configured: true,
        error: "rate_limited",
        message: `Limite diario de ${dailyCap} consultas premium atingido. Tente amanha.`,
      },
      429,
    );
  }

  // TRAVA DE GASTO mensal. Fail-closed: se nao conseguimos contar, recusamos
  // (nunca chamamos a API paga as cegas). Acima do teto, recusa com mensagem clara.
  const monthlyCap = envInt("INFOSIMPLES_MONTHLY_CAP", DEFAULT_MONTHLY_CAP);
  const used = await monthlyLiveCount(db);
  if (used === null) {
    return reply(
      { ok: false, configured: true, error: "indisponivel", message: "Nao foi possivel validar a cota. Tente mais tarde." },
      503,
    );
  }
  if (used >= monthlyCap) {
    return reply(
      {
        ok: false,
        configured: true,
        error: "cota_mensal_excedida",
        message: "Cota mensal de consultas premium atingida. Fale com o suporte.",
        used,
        cap: monthlyCap,
      },
      429,
    );
  }

  // LIVE: chama a InfoSimples. Degrada com elegancia — qualquer falha vira
  // 200 ok:false (nao derruba a tela), e so gravamos cache em sucesso real.
  try {
    const env = await callInfosimples(def, token, built.params);
    const success = env.code === 200 || env.code === 201;
    if (!success) {
      // Codigo de negocio (sem resultado, captcha, etc.): nao e cache, nao trava.
      return reply({
        ok: false,
        configured: true,
        source: "live",
        kind,
        code: env.code ?? null,
        message: env.code_message ?? "Consulta sem resultado.",
        errors: env.errors ?? [],
      });
    }

    const normalized = def.normalize(env.data ?? []);
    const payload = {
      ...(normalized as object),
      code: env.code,
      codeMessage: env.code_message ?? null,
      siteReceipts: env.site_receipts ?? [],
    };
    // So o sucesso conta na trava e entra no cache.
    await writeCache(db, kind, built.key, payload, userId);
    return reply({ ok: true, configured: true, source: "live", kind, ...payload });
  } catch (error) {
    console.error("[infosimples-proxy] live falhou:", String(error));
    // Erro de rede/timeout: nao gravamos cache (sem custo confirmado) e nao
    // quebramos o front — ok:false com 200.
    return reply({
      ok: false,
      configured: true,
      source: "live",
      kind,
      error: "falha_consulta",
      message: "Nao foi possivel consultar a InfoSimples agora. Tente novamente em instantes.",
    });
  }
});
