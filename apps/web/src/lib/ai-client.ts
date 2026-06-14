/**
 * Cliente de IA do app — wrappers fetch para as rotas de IA do backend:
 *   POST /ai/chat    -> chat contextual            (router: Gemini flash -> Claude)
 *   POST /ai/intent  -> intenção do omnibox        (router: Gemini flash -> Claude)
 *
 * Reaproveita a mesma base de API do resto do app (getConfiguredApiUrl), então
 * estas rotas seguem o mesmo backend que /ia/raio-x já usa — basta o backend
 * (Worker services/api) ter os endpoints e a chave GEMINI_API_KEY/ANTHROPIC_API_KEY.
 *
 * Degradação elegante: 503 vira AiUnavailableError (a UI mostra "IA em ativação");
 * qualquer outra falha vira AiRequestError com mensagem amigável.
 */

import {
  getConfiguredApiUrl,
  getSupabasePublicConfig,
  trimTrailingSlash,
} from "./api-client";

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatResponse {
  answer: string;
  model: string;
}

export interface AiIntentResponse {
  understanding: string;
  suggestedRoute: string | null;
  suggestedAction: string | null;
  answer: string;
  model: string;
}

/** Um resultado da busca semântica (RPC match_entities via /ai/search). */
export interface AiSearchResult {
  id: string;
  kind: string;
  name: string;
  attributes: Record<string, unknown>;
  /** Similaridade de cosseno: 1.0 = idêntico, 0.0 = sem relação. */
  score: number;
}

export interface AiSearchResponse {
  query: string;
  kind: string | null;
  count: number;
  results: AiSearchResult[];
  model: string;
}

/** A IA respondeu 503 (nenhum provedor configurado). UI deve degradar com elegância. */
export class AiUnavailableError extends Error {
  constructor(message = "O assistente de IA ainda nao foi ativado.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** Falha genérica ao falar com a IA (rede, 4xx/5xx, corpo inválido). */
export class AiRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

interface ErrorBody {
  error?: string;
  message?: string;
}

/**
 * POST genérico para as rotas de IA. Centraliza headers (a Edge Function exige
 * apikey/authorization; o Worker ignora — então mandar não atrapalha), o
 * tratamento de 503 e o parse de erro.
 */
async function postAi<T>(
  path: "/ai/chat" | "/ai/intent",
  body: unknown,
  accessToken?: string,
): Promise<T> {
  const base = getConfiguredApiUrl();
  if (!base) {
    throw new AiRequestError("Backend nao configurado.");
  }

  const { key } = getSupabasePublicConfig();
  let response: Response;
  try {
    response = await fetch(`${trimTrailingSlash(base)}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${accessToken && accessToken.length > 0 ? accessToken : key}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new AiRequestError(`Falha de rede: ${(error as Error).message}`);
  }

  if (response.status === 503) {
    let parsed: ErrorBody = {};
    try {
      parsed = (await response.json()) as ErrorBody;
    } catch {
      // corpo vazio/inválido — usa mensagem padrão
    }
    throw new AiUnavailableError(parsed.message);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new AiRequestError(`Resposta invalida (status ${response.status}).`, response.status);
  }

  if (!response.ok) {
    const err = data as ErrorBody;
    throw new AiRequestError(err.message ?? err.error ?? `Erro ${response.status}.`, response.status);
  }

  return data as T;
}

/** Envia o histórico de chat e devolve a resposta da IA. */
export function aiChat(
  messages: AiChatMessage[],
  options?: { context?: string; accessToken?: string },
): Promise<AiChatResponse> {
  const body: { messages: AiChatMessage[]; context?: string } = { messages };
  if (options?.context) {
    body.context = options.context;
  }
  return postAi<AiChatResponse>("/ai/chat", body, options?.accessToken);
}

/** Manda a frase do omnibox e devolve a intenção estruturada. */
export function aiIntent(
  query: string,
  options?: { context?: string; accessToken?: string },
): Promise<AiIntentResponse> {
  const body: { query: string; context?: string } = { query };
  if (options?.context) {
    body.context = options.context;
  }
  return postAi<AiIntentResponse>("/ai/intent", body, options?.accessToken);
}

/**
 * Busca semântica (pgvector) — embeda a query no Gemini e roda match_entities.
 * Sempre fala com a Edge Function "fonteia" diretamente (a rota /ai/search só
 * existe lá; o Worker não a tem), independente de VITE_API_URL. Use no omnibox
 * e na feature "itens parecidos / último valor".
 *
 * @param kind  filtra por tipo (ex.: "auction_lot", "bidding_opportunity"); null = todos.
 */
export async function aiSearch(
  query: string,
  options?: { kind?: string; limit?: number; accessToken?: string },
): Promise<AiSearchResponse> {
  const { url, key } = getSupabasePublicConfig();
  const endpoint = `${trimTrailingSlash(url)}/functions/v1/fonteia/ai/search`;
  const token = options?.accessToken && options.accessToken.length > 0 ? options.accessToken : key;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, kind: options?.kind, limit: options?.limit }),
    });
  } catch (error) {
    throw new AiRequestError(`Falha de rede: ${(error as Error).message}`);
  }

  if (response.status === 503) {
    let parsed: ErrorBody = {};
    try {
      parsed = (await response.json()) as ErrorBody;
    } catch {
      // corpo vazio/inválido — usa mensagem padrão
    }
    throw new AiUnavailableError(parsed.message);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new AiRequestError(`Resposta invalida (status ${response.status}).`, response.status);
  }

  if (!response.ok) {
    const err = data as ErrorBody;
    throw new AiRequestError(err.message ?? err.error ?? `Erro ${response.status}.`, response.status);
  }

  return data as AiSearchResponse;
}
