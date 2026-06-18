/**
 * Tipos comuns da camada de IA da Fonte.ia.
 *
 * São intencionalmente neutros em relação ao provedor: o roteador (router.ts)
 * fala somente estes tipos, e cada provedor (gemini.ts, claude.ts) traduz de/para
 * o formato nativo da sua API. Assim trocar de modelo nunca vaza para o resto do app.
 */

/** Papéis aceitos numa conversa. O `system` é tratado à parte (campo `system`). */
export type AiRole = "user" | "assistant";

/** Uma mensagem de conversa, simples e serializável (vai e volta como JSON). */
export interface AiMessage {
  role: AiRole;
  content: string;
}

/**
 * Tarefas conhecidas. O roteador usa isto para escolher provedor/modelo e o
 * "tier" de custo. Mantemos uma união aberta (`| (string & {})`) para permitir
 * tarefas novas sem quebrar o tipo, sem perder o autocomplete das conhecidas.
 */
export type AiTaskKind =
  | "intent" // entender a intenção do usuário (omnibox) — rápido/barato
  | "chat-rapido" // chat contextual leve — rápido/barato
  | "analise-profunda" // análise densa com raciocínio — caro/forte
  | "raio-x" // Raio-X de lote (comportamento legado) — caro/forte
  | (string & {});

/** Entrada única do roteador. Tudo que um provedor precisa para gerar. */
export interface AiGenerateRequest {
  /** Qual tarefa — guia a escolha de provedor/modelo. Default: "chat-rapido". */
  task?: AiTaskKind | undefined;
  /** Histórico/turnos da conversa (o último item costuma ser do usuário). */
  messages: AiMessage[];
  /** Instrução de sistema (persona + guardrails). Opcional. */
  system?: string | undefined;
  /** Contexto extra da tela/entidade (vira bloco no prompt do sistema). */
  context?: string | undefined;
  /** Teto de tokens de saída. Default por tarefa (ver router). */
  maxTokens?: number | undefined;
  /** Timeout de rede em ms. Default 30s. */
  timeoutMs?: number | undefined;
}

/** Saída normalizada de qualquer provedor. */
export interface AiGenerateResult {
  /** Texto da resposta, já concatenado e aparado. */
  text: string;
  /** Qual provedor atendeu de fato (útil para debug/telemetria). */
  provider: AiProviderName;
  /** Id do modelo usado (ex.: "gemini-2.5-flash", "claude-opus-4-8"). */
  model: string;
}

export type AiProviderName = "gemini" | "claude";

/**
 * Contrato mínimo de um provedor. O roteador só conhece isto.
 * `isConfigured()` permite o fallback: se a chave do preferido faltar, pula.
 */
export interface AiProvider {
  readonly name: AiProviderName;
  /** true quando há credenciais suficientes para chamar a API. */
  isConfigured(): boolean;
  /** Gera uma resposta a partir da requisição neutra. */
  generate(request: AiGenerateRequest, model: string): Promise<AiGenerateResult>;
}

/** Lançado quando nenhum provedor está configurado (nenhuma chave presente). */
export class AiNotConfiguredError extends Error {
  constructor(message = "Nenhum provedor de IA configurado (defina GEMINI_API_KEY ou ANTHROPIC_API_KEY).") {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

/** Lançado quando a chamada ao provedor falha (rede, status !=2xx, timeout). */
export class AiProviderError extends Error {
  constructor(
    public readonly provider: AiProviderName,
    message: string,
    public readonly status?: number,
    /**
     * Sinaliza recusa de conteúdo do provedor (ex.: classificadores de segurança
     * que devolvem HTTP 200 mas se recusam a responder, ou finishReason de bloqueio).
     * O roteador trata isto como qualquer outra falha (cai para o próximo provedor),
     * mas o flag permite distinguir "recusa" de "erro técnico" em telemetria/logs.
     */
    public readonly refusal: boolean = false,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

/**
 * Variáveis de ambiente que a camada de IA lê. Espelha (parcialmente) o Env
 * do Worker, mas vive aqui para o pacote não depender do serviço.
 */
export interface AiEnv {
  GEMINI_API_KEY?: string | undefined;
  GEMINI_MODEL?: string | undefined;
  GEMINI_MODEL_PRO?: string | undefined;
  ANTHROPIC_API_KEY?: string | undefined;
  ANTHROPIC_MODEL?: string | undefined;
}
