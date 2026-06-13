// Supabase Edge Function: "edital-pdf"
// Proxy + arquivo do PDF do edital da Receita Federal (SLE).
//
// O SLE NÃO expõe o PDF via URL direta. O endpoint oficial é:
//   GET https://www25.receita.fazenda.gov.br/sle-sociedade/api/edital/{u}/{n}/{e}/edital-completo
// que retorna JSON { "data": "<base64 do PDF>" }.
// Esta função decodifica o base64 e responde com o PDF binário ao navegador
// (Content-Disposition: attachment) — modo PROXY. Opcionalmente, pode persistir no
// Supabase Storage (bucket "editais") e responder com a URL pública para reuso.
//
// Parâmetros aceitos (query string):
//   ?edle=317900/2/2026          — formato edle (unidade/numero/exercicio)
//   OU
//   ?unidade=0317900&numero=000002&exercicio=2026
//
//   &store=1                     — (opcional) persiste no Storage antes de responder
//                                  (exige SUPABASE_SERVICE_ROLE_KEY + bucket "editais" público)
//
// Autenticação: verify_jwt=false; exige header `apikey` (chave pública do projeto).
// Dado público — o mesmo PDF que qualquer pessoa acessa no site da Receita.
//
// Uso: GET /functions/v1/edital-pdf?edle=317900/2/2026
//      GET /functions/v1/edital-pdf?edle=317900/2/2026&store=1
//      Também aceita a notação padded: ?edital=0317900/000002/2026

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SLE_BASE = "https://www25.receita.fazenda.gov.br/sle-sociedade";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-max-age": "86400",
};

function jsonErr(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

// Normaliza um componente de edital: "317900" → "0317900" (7 dígitos), "2" → "000002" (6 dígitos).
// O endpoint do SLE aceita tanto a forma curta como a longa — usamos a forma curta para a URL
// e mantemos a longa apenas para nomes de arquivo.
function padUnidade(s: string): string {
  return s.trim().padStart(7, "0");
}
function padNumero(s: string): string {
  return s.trim().padStart(6, "0");
}
function normalizeExercicio(s: string): string {
  return s.trim();
}

// Converte "317900/2/2026" (edle) ou "0317900/000002/2026" (edital) nas 3 partes.
function parseRef(raw: string): { unidade: string; numero: string; exercicio: string } | null {
  const parts = raw.trim().split("/");
  if (parts.length !== 3) return null;
  const [u, n, e] = parts;
  if (!u || !n || !e) return null;
  return { unidade: u.trim(), numero: n.trim(), exercicio: e.trim() };
}

// Busca o PDF no SLE e devolve os bytes.
async function fetchEditalPdf(
  unidade: string,
  numero: string,
  exercicio: string,
): Promise<Uint8Array> {
  // O SLE aceita tanto "317900" quanto "0317900" — usamos como veio.
  const url = `${SLE_BASE}/api/edital/${unidade}/${numero}/${exercicio}/edital-completo`;
  const resp = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });

  if (resp.status === 404) {
    throw new SleNotFoundError("Edital não encontrado no SLE (404).");
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`SLE retornou ${resp.status}: ${body.slice(0, 200)}`);
  }

  // O SLE retorna { "data": "<base64 do PDF>" } — confirmado empiricamente.
  const payload = (await resp.json()) as { data?: string };
  if (!payload?.data) {
    throw new SleNotFoundError(
      "A resposta do SLE não contém o campo 'data' (PDF em base64). " +
      "O edital talvez não tenha um PDF gerado ainda.",
    );
  }

  // base64 → Uint8Array (Deno nativo, sem libs externas)
  const binaryStr = atob(payload.data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Sanity check: PDF deve começar com "%PDF-"
  const magic = String.fromCharCode(...bytes.slice(0, 5));
  if (magic !== "%PDF-") {
    throw new Error(
      `Resposta do SLE não é um PDF válido (magic: ${JSON.stringify(magic)}).`,
    );
  }

  return bytes;
}

class SleNotFoundError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SleNotFoundError";
  }
}

// Persiste no Supabase Storage (bucket "editais") via service role.
// Retorna a URL pública do arquivo.
async function storeInSupabase(
  pdfBytes: Uint8Array,
  unidade: string,
  numero: string,
  exercicio: string,
): Promise<string> {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_URL não configurado.");
  }

  // Caminho: editais/2026/317900/2/edital.pdf
  const path = `${exercicio}/${padUnidade(unidade)}/${padNumero(numero)}/edital.pdf`;
  const storageUrl = `${supabaseUrl}/storage/v1/object/editais/${path}`;

  const uploadResp = await fetch(storageUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/pdf",
      "x-upsert": "true", // idempotente: re-upload não gera erro
    },
    body: pdfBytes,
  });

  if (!uploadResp.ok) {
    const body = await uploadResp.text().catch(() => "");
    throw new Error(`Storage upload falhou (${uploadResp.status}): ${body.slice(0, 300)}`);
  }

  // URL pública (bucket deve ter política "public read")
  return `${supabaseUrl}/storage/v1/object/public/editais/${path}`;
}

Deno.serve(async (request: Request): Promise<Response> => {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Só aceita GET
  if (request.method !== "GET") {
    return jsonErr("Método não permitido. Use GET.", 405);
  }

  // Auth própria: exige header apikey (chave pública do projeto — padrão das outras funções).
  const apikey = (request.headers.get("apikey") ?? "").trim();
  if (!apikey) {
    return jsonErr("apikey ausente. Envie a chave pública do projeto no header 'apikey'.", 401);
  }

  const { searchParams } = new URL(request.url);
  const store = searchParams.get("store") === "1";

  // Aceita ?edle=317900/2/2026  OU  ?edital=0317900/000002/2026
  // OU  ?unidade=...&numero=...&exercicio=...
  let ref: { unidade: string; numero: string; exercicio: string } | null = null;

  const edle = searchParams.get("edle");
  const edital = searchParams.get("edital");
  const uParam = searchParams.get("unidade");
  const nParam = searchParams.get("numero");
  const eParam = searchParams.get("exercicio");

  if (edle) {
    ref = parseRef(edle);
    if (!ref) return jsonErr("Parâmetro 'edle' inválido. Formato esperado: '317900/2/2026'.", 400);
  } else if (edital) {
    ref = parseRef(edital);
    if (!ref) return jsonErr("Parâmetro 'edital' inválido. Formato esperado: '0317900/000002/2026'.", 400);
  } else if (uParam && nParam && eParam) {
    ref = { unidade: uParam, numero: nParam, exercicio: eParam };
  } else {
    return jsonErr(
      "Informe ?edle=317900/2/2026  OU  ?edital=0317900/000002/2026  OU  " +
      "?unidade=...&numero=...&exercicio=...",
      400,
    );
  }

  const { unidade, numero, exercicio } = ref;

  // Nome de arquivo legível para o download
  const filename = `edital_${padUnidade(unidade)}_${padNumero(numero)}_${normalizeExercicio(exercicio)}.pdf`;

  try {
    // Se &store=1 e o arquivo já existe no Storage, redireciona direto (economiza 1 fetch no SLE)
    if (store) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      if (supabaseUrl) {
        const path = `${exercicio}/${padUnidade(unidade)}/${padNumero(numero)}/edital.pdf`;
        const existingUrl = `${supabaseUrl}/storage/v1/object/public/editais/${path}`;
        const headResp = await fetch(existingUrl, { method: "HEAD" }).catch(() => null);
        if (headResp?.ok) {
          // Já em cache no Storage — redireciona
          return new Response(null, {
            status: 302,
            headers: { ...CORS, Location: existingUrl },
          });
        }
      }
    }

    // Busca o PDF no SLE
    const pdfBytes = await fetchEditalPdf(unidade, numero, exercicio);

    // Modo store: persiste e redireciona para URL permanente
    if (store) {
      const publicUrl = await storeInSupabase(pdfBytes, unidade, numero, exercicio);
      return new Response(null, {
        status: 302,
        headers: { ...CORS, Location: publicUrl },
      });
    }

    // Modo proxy (padrão): devolve o PDF diretamente com Content-Disposition attachment
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBytes.byteLength),
        // Cache razoável: edital não muda, mas erratas podem sair → 1 hora
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    if (err instanceof SleNotFoundError) {
      return new Response(
        JSON.stringify({
          error: "edital_sem_pdf",
          message: err.message,
          hint: "Verifique se o edital foi publicado no SLE e se o número/unidade/exercicio estão corretos.",
        }),
        {
          status: 404,
          headers: { "content-type": "application/json; charset=utf-8", ...CORS },
        },
      );
    }
    console.error("[edital-pdf] erro:", err);
    return jsonErr(`Falha ao buscar o PDF: ${String(err)}`, 502);
  }
});
