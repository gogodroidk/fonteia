// _shared/r2.ts — Helper R2/S3 reutilizavel para as Edge Functions (runtime Deno).
//
// Usa `aws4fetch` (AwsClient) para assinar requisicoes S3 com SigV4 contra o
// endpoint S3-compativel do Cloudflare R2.
//
// SEGREDOS: todos lidos do Supabase Vault em runtime via `resolveR2Creds()`.
// Nomes dos segredos no Vault:
//   R2_ACCESS_KEY_ID     — chave de acesso S3 do R2
//   R2_SECRET_ACCESS_KEY — chave secreta S3 do R2
//   R2_S3_ENDPOINT       — ex.: https://2105e563047965db94fc8a82e2521838.r2.cloudflarestorage.com
//
// Uso tipico:
//   const r2 = await getR2Client();
//   await r2.putObject("fonteia-blobs", "editais/foo.pdf", pdfBytes, "application/pdf");
//   const exists = await r2.objectExists("fonteia-blobs", "editais/foo.pdf");

import { AwsClient } from "npm:aws4fetch@1.0.20";
import { fetchWithRetry } from "./http.ts";

// ─── Resolucao de credenciais via Vault ──────────────────────────────────────

export interface R2Creds {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string; // https://<accountId>.r2.cloudflarestorage.com
}

/** Busca um segredo pelo nome no Supabase Vault (RPC get_vault_secret). */
async function vaultSecret(supabaseUrl: string, serviceKey: string, name: string): Promise<string> {
  const res = await fetchWithRetry(`${supabaseUrl}/rest/v1/rpc/get_vault_secret`, {
    timeoutMs: 8000,
    retries: 2,
    backoffMs: 500,
    init: {
      method: "POST",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_name: name }),
    },
  });
  if (!res.ok) throw new Error(`Vault: nao foi possivel resolver '${name}' (${res.status})`);
  const v = (await res.json()) as unknown;
  if (typeof v !== "string" || !v.trim()) throw new Error(`Vault: segredo '${name}' vazio ou ausente`);
  return v.trim();
}

/**
 * Resolve as credenciais R2 do Vault.
 * Tentativa 1: variaveis de ambiente (Edge Function Secrets setadas no dashboard).
 * Tentativa 2: Vault RPC (para migracao gradual ou vault-only).
 */
export async function resolveR2Creds(): Promise<R2Creds> {
  const envId = (Deno.env.get("R2_ACCESS_KEY_ID") ?? "").trim();
  const envSec = (Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "").trim();
  const envUrl = (Deno.env.get("R2_S3_ENDPOINT") ?? "").trim();

  if (envId && envSec && envUrl) {
    return { accessKeyId: envId, secretAccessKey: envSec, endpoint: envUrl };
  }

  // Cai para o Vault (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY sao injetados automaticamente).
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    throw new Error("R2Creds: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY necessarios para Vault");
  }

  const [accessKeyId, secretAccessKey, endpoint] = await Promise.all([
    vaultSecret(supabaseUrl, serviceKey, "R2_ACCESS_KEY_ID"),
    vaultSecret(supabaseUrl, serviceKey, "R2_SECRET_ACCESS_KEY"),
    vaultSecret(supabaseUrl, serviceKey, "R2_S3_ENDPOINT"),
  ]);

  return { accessKeyId, secretAccessKey, endpoint };
}

// ─── Cliente R2 ──────────────────────────────────────────────────────────────

export class R2Client {
  private aws: AwsClient;
  private endpoint: string;

  constructor(creds: R2Creds) {
    this.endpoint = creds.endpoint.replace(/\/$/, "");
    this.aws = new AwsClient({
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      region: "auto",
      service: "s3",
    });
  }

  /** URL S3 para o objeto: <endpoint>/<bucket>/<key> */
  private objectUrl(bucket: string, key: string): string {
    return `${this.endpoint}/${bucket}/${key}`;
  }

  /**
   * Faz HEAD no objeto. Retorna o ETag (sem aspas) se o objeto existir, null caso contrario.
   * Util para idempotencia: compare o ETag com o SHA-256 antes de re-upload.
   */
  async headObject(bucket: string, key: string): Promise<{ etag: string; size: number } | null> {
    const url = this.objectUrl(bucket, key);
    let res: Response;
    try {
      res = await this.aws.fetch(url, { method: "HEAD" });
    } catch {
      return null;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 HEAD ${url} -> ${res.status}`);
    const etag = (res.headers.get("etag") ?? "").replace(/"/g, "");
    const size = Number(res.headers.get("content-length") ?? "0");
    return { etag, size };
  }

  /** true se o objeto ja existe no bucket. */
  async objectExists(bucket: string, key: string): Promise<boolean> {
    return (await this.headObject(bucket, key)) !== null;
  }

  /**
   * Faz PUT do objeto no R2 via S3 API.
   * Retorna o ETag retornado pelo R2 (sem aspas).
   */
  async putObject(
    bucket: string,
    key: string,
    body: Uint8Array | ArrayBuffer,
    contentType = "application/octet-stream",
    metadata: Record<string, string> = {},
  ): Promise<string> {
    const url = this.objectUrl(bucket, key);

    // Metadados custom via x-amz-meta-* headers
    const metaHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(metadata)) {
      metaHeaders[`x-amz-meta-${k.toLowerCase()}`] = v;
    }

    const res = await this.aws.fetch(url, {
      method: "PUT",
      headers: {
        "content-type": contentType,
        ...metaHeaders,
      },
      body,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`R2 PUT ${url} -> ${res.status}: ${txt.slice(0, 300)}`);
    }

    return (res.headers.get("etag") ?? "").replace(/"/g, "");
  }
}

/** Constrói um R2Client com credenciais resolvidas do Vault (ou env vars). */
export async function getR2Client(): Promise<R2Client> {
  const creds = await resolveR2Creds();
  return new R2Client(creds);
}
