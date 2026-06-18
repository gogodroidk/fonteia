import { afterEach, describe, expect, it, vi } from "vitest";
import { AiRouter } from "./router";
import { AiNotConfiguredError, AiProviderError, type AiEnv } from "./types";

/**
 * Os providers chamam `fetch` global. Mockamos o fetch para exercitar o roteador
 * (escolha de provedor, fallback, erro honesto) sem rede.
 */

function geminiOk(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function claudeOk(text: string): Response {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/** Claude HTTP 200, mas o classificador de seguranca recusou (content vazio). */
function claudeRefusal(): Response {
  return new Response(
    JSON.stringify({ content: [], stop_reason: "refusal", stop_details: { category: "cyber" } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function httpError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Lê o corpo JSON enviado num call do mock de fetch (RequestInit.body). */
function parseBody(init: unknown): Record<string, unknown> {
  const body = (init as RequestInit | undefined)?.body;
  return typeof body === "string" ? (JSON.parse(body) as Record<string, unknown>) : {};
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AiRouter", () => {
  it("lanca AiNotConfiguredError quando nenhuma chave existe", async () => {
    const router = new AiRouter({} satisfies AiEnv);
    expect(router.isConfigured()).toBe(false);
    await expect(
      router.generate({ messages: [{ role: "user", content: "oi" }] }),
    ).rejects.toBeInstanceOf(AiNotConfiguredError);
  });

  it("usa Gemini para 'intent' quando Gemini esta configurado", async () => {
    const env: AiEnv = { GEMINI_API_KEY: "g-key", ANTHROPIC_API_KEY: "a-key" };
    const url = vi.fn();
    vi.stubGlobal("fetch", (input: string) => {
      url(input);
      return Promise.resolve(geminiOk("intencao entendida"));
    });

    const router = new AiRouter(env);
    const res = await router.generate({ task: "intent", messages: [{ role: "user", content: "leiloes" }] });

    expect(res.provider).toBe("gemini");
    expect(res.text).toBe("intencao entendida");
    expect(String(url.mock.calls[0]?.[0])).toContain("generativelanguage.googleapis.com");
  });

  it("usa Claude para 'analise-profunda' quando Claude esta configurado", async () => {
    const env: AiEnv = { GEMINI_API_KEY: "g-key", ANTHROPIC_API_KEY: "a-key" };
    vi.stubGlobal("fetch", () => Promise.resolve(claudeOk("analise densa")));

    const router = new AiRouter(env);
    const res = await router.generate({
      task: "analise-profunda",
      messages: [{ role: "user", content: "explique" }],
    });

    expect(res.provider).toBe("claude");
    expect(res.text).toBe("analise densa");
  });

  it("faz fallback para Claude quando Gemini nao tem chave (tarefa intent)", async () => {
    const env: AiEnv = { ANTHROPIC_API_KEY: "a-key" }; // sem GEMINI
    vi.stubGlobal("fetch", () => Promise.resolve(claudeOk("respondido pelo claude")));

    const router = new AiRouter(env);
    expect(router.configuredProviders()).toEqual(["claude"]);

    const res = await router.generate({ task: "intent", messages: [{ role: "user", content: "x" }] });
    expect(res.provider).toBe("claude");
  });

  it("faz fallback ao proximo provedor quando o preferido falha (erro HTTP)", async () => {
    const env: AiEnv = { GEMINI_API_KEY: "g-key", ANTHROPIC_API_KEY: "a-key" };
    // intent prefere gemini; primeiro fetch (gemini) falha, segundo (claude) ok.
    const calls: string[] = [];
    vi.stubGlobal("fetch", (input: string) => {
      calls.push(String(input));
      if (String(input).includes("googleapis.com")) {
        return Promise.resolve(httpError(500, "indisponivel"));
      }
      return Promise.resolve(claudeOk("salvo pelo fallback"));
    });

    const router = new AiRouter(env);
    const res = await router.generate({ task: "intent", messages: [{ role: "user", content: "x" }] });

    expect(res.provider).toBe("claude");
    expect(res.text).toBe("salvo pelo fallback");
    expect(calls.length).toBe(2);
  });

  it("respeita preferencia global sobre a ordem da tarefa", async () => {
    const env: AiEnv = { GEMINI_API_KEY: "g-key", ANTHROPIC_API_KEY: "a-key" };
    vi.stubGlobal("fetch", (input: string) => {
      // preference força claude primeiro, mesmo em 'intent' (que normalmente é gemini)
      return Promise.resolve(
        String(input).includes("anthropic.com") ? claudeOk("claude primeiro") : geminiOk("nao deveria"),
      );
    });

    const router = new AiRouter(env, { preference: ["claude", "gemini"] });
    const res = await router.generate({ task: "intent", messages: [{ role: "user", content: "x" }] });
    expect(res.provider).toBe("claude");
  });

  // (a) Claude stop_reason:"refusal" → erro/fallback.
  it("faz fallback do Claude para o Gemini quando o Claude RECUSA (stop_reason refusal)", async () => {
    const env: AiEnv = { GEMINI_API_KEY: "g-key", ANTHROPIC_API_KEY: "a-key" };
    // analise-profunda prefere claude; claude recusa, gemini salva.
    const calls: string[] = [];
    vi.stubGlobal("fetch", (input: string) => {
      calls.push(String(input));
      if (String(input).includes("anthropic.com")) {
        return Promise.resolve(claudeRefusal());
      }
      return Promise.resolve(geminiOk("salvo apos recusa do claude"));
    });

    const router = new AiRouter(env);
    const res = await router.generate({
      task: "analise-profunda",
      messages: [{ role: "user", content: "explique" }],
    });

    expect(res.provider).toBe("gemini");
    expect(res.text).toBe("salvo apos recusa do claude");
    expect(calls.length).toBe(2); // tentou claude, caiu p/ gemini
  });

  it("a recusa do Claude vira AiProviderError com flag refusal quando e o unico provedor", async () => {
    const env: AiEnv = { ANTHROPIC_API_KEY: "a-key" }; // só claude
    vi.stubGlobal("fetch", () => Promise.resolve(claudeRefusal()));

    const router = new AiRouter(env);
    const err = await router
      .generate({ task: "analise-profunda", messages: [{ role: "user", content: "x" }] })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).provider).toBe("claude");
    expect((err as AiProviderError).refusal).toBe(true);
  });

  // (b) thinking ENVIADO p/ modelo suportado e NÃO enviado p/ um da denylist.
  it("envia thinking adaptativo para o modelo padrao do Claude (suportado)", async () => {
    const env: AiEnv = { ANTHROPIC_API_KEY: "a-key" }; // ANTHROPIC_MODEL ausente → claude-opus-4-8
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", (_input: string, init?: unknown) => {
      bodies.push(parseBody(init));
      return Promise.resolve(claudeOk("ok"));
    });

    const router = new AiRouter(env);
    await router.generate({ task: "analise-profunda", messages: [{ role: "user", content: "x" }] });

    expect(bodies[0]?.model).toBe("claude-opus-4-8");
    expect(bodies[0]?.thinking).toEqual({ type: "adaptive" });
  });

  it("NAO envia thinking para um modelo da denylist (ex.: claude-3-opus)", async () => {
    const env: AiEnv = { ANTHROPIC_API_KEY: "a-key", ANTHROPIC_MODEL: "claude-3-opus-20240229" };
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", (_input: string, init?: unknown) => {
      bodies.push(parseBody(init));
      return Promise.resolve(claudeOk("ok"));
    });

    const router = new AiRouter(env);
    await router.generate({ task: "analise-profunda", messages: [{ role: "user", content: "x" }] });

    expect(bodies[0]?.model).toBe("claude-3-opus-20240229");
    expect(bodies[0]?.thinking).toBeUndefined();
  });

  it("envia thinking para um modelo futuro nao listado (ex.: claude-opus-4-9)", async () => {
    const env: AiEnv = { ANTHROPIC_API_KEY: "a-key", ANTHROPIC_MODEL: "claude-opus-4-9" };
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", (_input: string, init?: unknown) => {
      bodies.push(parseBody(init));
      return Promise.resolve(claudeOk("ok"));
    });

    const router = new AiRouter(env);
    await router.generate({ task: "analise-profunda", messages: [{ role: "user", content: "x" }] });

    expect(bodies[0]?.thinking).toEqual({ type: "adaptive" });
  });

  // (c) Todos os provedores falham → relanca AiProviderError com o provider correto.
  it("quando TODOS os provedores falham, relanca o erro do ULTIMO provedor tentado", async () => {
    const env: AiEnv = { GEMINI_API_KEY: "g-key", ANTHROPIC_API_KEY: "a-key" };
    // intent: ordem [gemini, claude]; ambos falham via HTTP. O ultimo e claude.
    vi.stubGlobal("fetch", (input: string) =>
      Promise.resolve(
        String(input).includes("googleapis.com")
          ? httpError(500, "gemini fora")
          : httpError(503, "claude fora"),
      ),
    );

    const router = new AiRouter(env);
    const err = await router
      .generate({ task: "intent", messages: [{ role: "user", content: "x" }] })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AiProviderError);
    // O provedor reportado deve ser o que falhou por ULTIMO (claude), nao o order[0] (gemini).
    expect((err as AiProviderError).provider).toBe("claude");
    expect((err as AiProviderError).status).toBe(503);
  });
});
