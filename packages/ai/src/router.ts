/**
 * Roteador multimodelo da Fonte.ia — o cérebro provider-agnostic.
 *
 * Decide QUAL provedor e QUAL modelo atendem cada tarefa, e faz FALLBACK:
 * se o provedor preferido não tem chave, cai para o próximo; se nenhum tem
 * chave, lança AiNotConfiguredError (503 honesto, nada de resposta falsa).
 *
 * Política padrão (Gemini gratuito primeiro, Claude como reforço):
 *   - 'intent' / 'chat-rapido'        -> Gemini flash  (rápido/barato) -> Claude
 *   - 'analise-profunda' / 'raio-x'   -> Claude        (forte)         -> Gemini pro
 *
 * Ordem de preferência é configurável por construção (RouterOptions.preference).
 */

import { ClaudeProvider } from "./providers/claude";
import { GeminiProvider } from "./providers/gemini";
import type {
  AiEnv,
  AiGenerateRequest,
  AiGenerateResult,
  AiProvider,
  AiProviderName,
  AiTaskKind,
} from "./types";
import { AiNotConfiguredError, AiProviderError } from "./types";

/** Como cada tarefa quer ser atendida: ordem de provedores + "peso" do modelo. */
interface TaskPolicy {
  /** Ordem de tentativa entre provedores. */
  order: AiProviderName[];
  /** "flash" = modelo rápido/barato; "deep" = modelo forte/caro. */
  weight: "flash" | "deep";
  /** Teto de saída padrão para a tarefa (pode ser sobrescrito no request). */
  defaultMaxTokens: number;
}

/** Política por tarefa. Tarefas desconhecidas caem no DEFAULT_POLICY. */
const TASK_POLICIES: Record<string, TaskPolicy> = {
  intent: { order: ["gemini", "claude"], weight: "flash", defaultMaxTokens: 800 },
  "chat-rapido": { order: ["gemini", "claude"], weight: "flash", defaultMaxTokens: 1200 },
  "analise-profunda": { order: ["claude", "gemini"], weight: "deep", defaultMaxTokens: 2000 },
  "raio-x": { order: ["claude", "gemini"], weight: "deep", defaultMaxTokens: 1500 },
};

const DEFAULT_POLICY: TaskPolicy = {
  order: ["gemini", "claude"],
  weight: "flash",
  defaultMaxTokens: 1200,
};

export interface RouterOptions {
  /**
   * Sobrescreve a ordem GLOBAL de preferência entre provedores. Quando definido,
   * tem prioridade sobre a ordem da política da tarefa (útil p/ forçar um provedor
   * em ambientes específicos). Ex.: ["claude", "gemini"].
   */
  preference?: AiProviderName[];
}

/** Resultado do roteamento, com de onde veio (para telemetria/debug). */
export type AiRouterResult = AiGenerateResult;

export class AiRouter {
  private readonly gemini: GeminiProvider;
  private readonly claude: ClaudeProvider;
  private readonly preference: AiProviderName[] | undefined;

  constructor(env: AiEnv, options: RouterOptions = {}) {
    this.gemini = new GeminiProvider(env);
    this.claude = new ClaudeProvider(env);
    this.preference = options.preference;
  }

  /** true se PELO MENOS um provedor está configurado. */
  isConfigured(): boolean {
    return this.gemini.isConfigured() || this.claude.isConfigured();
  }

  /** Provedores configurados, na ordem [gemini, claude] (para health/debug). */
  configuredProviders(): AiProviderName[] {
    const out: AiProviderName[] = [];
    if (this.gemini.isConfigured()) out.push("gemini");
    if (this.claude.isConfigured()) out.push("claude");
    return out;
  }

  private providerByName(name: AiProviderName): AiProvider {
    return name === "claude" ? this.claude : this.gemini;
  }

  /** Resolve o id do modelo conforme provedor + peso da tarefa. */
  private modelFor(name: AiProviderName, weight: TaskPolicy["weight"]): string {
    if (name === "claude") {
      // Claude tem um único modelo padrão (configurável); serve flash e deep.
      return this.claude.defaultModel();
    }
    return weight === "deep" ? this.gemini.proModel() : this.gemini.flashModel();
  }

  /**
   * Monta a ordem efetiva de tentativa: aplica a preferência global (se houver)
   * por cima da ordem da política, sem duplicar e mantendo só nomes válidos.
   */
  private resolveOrder(policy: TaskPolicy): AiProviderName[] {
    const base = this.preference ?? policy.order;
    const seen = new Set<AiProviderName>();
    const ordered: AiProviderName[] = [];
    for (const name of [...base, ...policy.order]) {
      if ((name === "gemini" || name === "claude") && !seen.has(name)) {
        seen.add(name);
        ordered.push(name);
      }
    }
    return ordered;
  }

  /**
   * Gera uma resposta escolhendo provedor/modelo por tarefa, com fallback.
   *
   * - Pula provedores sem chave (isConfigured === false).
   * - Se um provedor configurado falhar (rede/status), tenta o próximo.
   * - Se nenhum estiver configurado: AiNotConfiguredError.
   * - Se todos os configurados falharem: relança o último AiProviderError.
   */
  async generate(request: AiGenerateRequest): Promise<AiRouterResult> {
    const task: AiTaskKind = request.task ?? "chat-rapido";
    const policy = TASK_POLICIES[task] ?? DEFAULT_POLICY;
    const order = this.resolveOrder(policy);

    const effectiveRequest: AiGenerateRequest = {
      ...request,
      maxTokens: request.maxTokens ?? policy.defaultMaxTokens,
    };

    let lastError: AiProviderError | undefined;
    let lastTriedProvider: AiProviderName | undefined;
    let anyConfigured = false;

    for (const name of order) {
      const provider = this.providerByName(name);
      if (!provider.isConfigured()) {
        continue;
      }
      anyConfigured = true;
      lastTriedProvider = name;
      const model = this.modelFor(name, policy.weight);
      try {
        return await provider.generate(effectiveRequest, model);
      } catch (error) {
        if (error instanceof AiProviderError) {
          lastError = error;
          // tenta o próximo provedor da ordem
          continue;
        }
        throw error;
      }
    }

    if (!anyConfigured) {
      throw new AiNotConfiguredError();
    }
    // Algum provedor estava configurado mas todos falharam. Reporta o provedor que
    // de fato falhou por último (não order[0], que pode nem ter sido tentado).
    throw lastError ?? new AiProviderError(lastTriedProvider ?? "gemini", "Falha ao gerar resposta.");
  }
}

/** Açúcar: cria um roteador e gera numa tacada (uso pontual no Worker). */
export function createAiRouter(env: AiEnv, options?: RouterOptions): AiRouter {
  return new AiRouter(env, options);
}
