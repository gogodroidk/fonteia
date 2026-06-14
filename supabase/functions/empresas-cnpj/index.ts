// Supabase Edge Function: "empresas-cnpj" — Consulta de CNPJ on-demand (grátis).
//
// AUTENTICAÇÃO PRÓPRIA (verify_jwt=false, autorizado pelo dono): exige o header
// `apikey` (chave pública do projeto), exatamente como a função "fonteia". O
// conteúdo é PÚBLICO (cadastro de CNPJ vindo da Receita via Minha Receita), sem
// segredo e sem escrita. Fazer o proxy aqui evita o CORS no navegador.
//
// Fonte: Minha Receita — espelho aberto e anônimo da base de CNPJ da Receita
// Federal (sem auth, sem chave):
//   GET https://minhareceita.org/{cnpj_14_digitos}
//     -> JSON com razao_social, nome_fantasia, descricao_situacao_cadastral,
//        cnae_fiscal_descricao, uf, municipio, qsa[socios], data_inicio_atividade…
//
// Rota:
//   GET ?cnpj=00000000000191   -> perfil normalizado do CNPJ.
//
// Respostas:
//   200 { ok:true, empresa:{ cnpj, razaoSocial, nomeFantasia, situacao,
//                            cnaePrincipal, uf, municipio, socios:[...], abertura } }
//   400 { ok:false, error } — CNPJ ausente/!=14 dígitos.
//   404 { ok:false, error } — CNPJ inexistente na base.
//   502 { ok:false, error } — falha ao consultar a fonte.
//
// Deploy: verify_jwt=FALSE (a auth é por header `apikey`, feita aqui dentro).

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, apikey, x-client-info",
  "access-control-max-age": "86400",
};

const MINHA_RECEITA = "https://minhareceita.org";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

// ── Tipos crus (subset do que a Minha Receita devolve — amostra real) ──────────

interface RawSocio {
  nome_socio?: string;
  qualificacao_socio?: string;
  faixa_etaria?: string;
  data_entrada_sociedade?: string;
  cnpj_cpf_do_socio?: string;
  identificador_de_socio?: number;
}

interface RawEmpresa {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  situacao_cadastral?: string | number;
  data_situacao_cadastral?: string;
  cnae_fiscal?: number;
  cnae_fiscal_descricao?: string;
  natureza_juridica?: string;
  porte?: string;
  uf?: string;
  municipio?: string;
  bairro?: string;
  logradouro?: string;
  numero?: string;
  cep?: string;
  ddd_telefone_1?: string;
  email?: string;
  data_inicio_atividade?: string;
  capital_social?: number;
  qsa?: RawSocio[];
  // A API também devolve "message"/"detail" em erros — preservado no eco.
  message?: string;
  detail?: string;
  [key: string]: unknown;
}

// ── Saída normalizada — o que o produto lê ─────────────────────────────────────

interface SocioNormalizado {
  nome: string;
  qualificacao: string;
  faixaEtaria: string;
  entrada: string;
}

interface EmpresaNormalizada {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacao: string;
  cnaePrincipal: string;
  cnaeCodigo: string;
  naturezaJuridica: string;
  porte: string;
  uf: string;
  municipio: string;
  endereco: string;
  email: string;
  telefone: string;
  capitalSocial: number;
  abertura: string;
  socios: SocioNormalizado[];
  sourceUrl: string;
}

/** Mantém só os dígitos; devolve "" se não restarem 14 (CNPJ inválido). */
function sanitizeCnpj(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 14 ? digits : "";
}

/** Formata um CNPJ de 14 dígitos como 00.000.000/0000-00. */
function formatCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

function trimStr(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildEndereco(raw: RawEmpresa): string {
  const partes = [
    [trimStr(raw.logradouro), trimStr(raw.numero)].filter(Boolean).join(", "),
    trimStr(raw.bairro),
    [trimStr(raw.municipio), trimStr(raw.uf)].filter(Boolean).join("/"),
    trimStr(raw.cep),
  ].filter((p) => p !== "");
  return partes.join(" · ");
}

function normalizeSituacao(raw: RawEmpresa): string {
  const desc = trimStr(raw.descricao_situacao_cadastral);
  if (desc !== "") return desc;
  const code = raw.situacao_cadastral;
  if (code !== undefined && code !== null) return `Situação ${code}`;
  return "Não informada";
}

function normalize(raw: RawEmpresa, cnpj: string): EmpresaNormalizada {
  const socios: SocioNormalizado[] = (raw.qsa ?? [])
    .map((s) => ({
      nome: trimStr(s.nome_socio),
      qualificacao: trimStr(s.qualificacao_socio),
      faixaEtaria: trimStr(s.faixa_etaria),
      entrada: trimStr(s.data_entrada_sociedade),
    }))
    .filter((s) => s.nome !== "");

  const cnaeCodigo = raw.cnae_fiscal !== undefined && raw.cnae_fiscal !== null ? String(raw.cnae_fiscal) : "";

  return {
    cnpj: formatCnpj(cnpj),
    razaoSocial: trimStr(raw.razao_social) || "Razão social não informada",
    nomeFantasia: trimStr(raw.nome_fantasia),
    situacao: normalizeSituacao(raw),
    cnaePrincipal: trimStr(raw.cnae_fiscal_descricao),
    cnaeCodigo,
    naturezaJuridica: trimStr(raw.natureza_juridica),
    porte: trimStr(raw.porte),
    uf: trimStr(raw.uf),
    municipio: trimStr(raw.municipio),
    endereco: buildEndereco(raw),
    email: trimStr(raw.email),
    telefone: trimStr(raw.ddd_telefone_1),
    capitalSocial: typeof raw.capital_social === "number" ? raw.capital_social : 0,
    abertura: trimStr(raw.data_inicio_atividade),
    socios,
    sourceUrl: `${MINHA_RECEITA}/${cnpj}`,
  };
}

async function fetchEmpresa(cnpj: string): Promise<EmpresaNormalizada | { notFound: true } | { failed: string }> {
  let res: Response;
  try {
    res = await fetch(`${MINHA_RECEITA}/${cnpj}`, {
      headers: { accept: "application/json", "user-agent": UA },
    });
  } catch (e) {
    return { failed: String(e) };
  }

  // 404 explícito = CNPJ inexistente; a Minha Receita devolve 404 com mensagem.
  if (res.status === 404) return { notFound: true };
  if (!res.ok) return { failed: `Minha Receita respondeu ${res.status}` };

  let raw: RawEmpresa;
  try {
    raw = (await res.json()) as RawEmpresa;
  } catch (e) {
    return { failed: `Resposta inválida da fonte: ${String(e)}` };
  }

  // Defesa extra: alguns 200 vêm sem razão social (CNPJ não encontrado/erro lógico).
  if (!raw || (trimStr(raw.razao_social) === "" && (raw.message || raw.detail))) {
    return { notFound: true };
  }

  return normalize(raw, cnpj);
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Auth própria: exige a chave pública do projeto no header `apikey` (igual à "fonteia").
  const apikey = request.headers.get("apikey") ?? "";
  if (apikey.trim() === "") {
    return json({ ok: false, error: "apikey ausente" }, 401);
  }

  const url = new URL(request.url);

  // Health check.
  if (url.pathname.endsWith("/health")) {
    return json({ service: "empresas-cnpj", status: "ok", fonte: MINHA_RECEITA, time: new Date().toISOString() });
  }

  const rawCnpj = url.searchParams.get("cnpj") ?? "";
  if (rawCnpj.trim() === "") {
    return json({ ok: false, error: "Informe o parâmetro 'cnpj' (14 dígitos)." }, 400);
  }

  const cnpj = sanitizeCnpj(rawCnpj);
  if (cnpj === "") {
    return json(
      { ok: false, error: "CNPJ inválido: precisa ter 14 dígitos (apenas números)." },
      400,
    );
  }

  const result = await fetchEmpresa(cnpj);

  if ("notFound" in result) {
    return json(
      { ok: false, error: `CNPJ ${formatCnpj(cnpj)} não encontrado na base da Receita Federal.` },
      404,
    );
  }
  if ("failed" in result) {
    return json(
      { ok: false, error: "Não foi possível consultar o CNPJ agora.", detail: result.failed },
      502,
    );
  }

  return json({ ok: true, empresa: result, fonte: MINHA_RECEITA });
});
