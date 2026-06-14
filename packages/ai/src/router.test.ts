import { afterEach, describe, expect, it, vi } from "vitest";
import { AiRouter } from "./router";
import { AiNotConfiguredError, type AiEnv } from "./types";

/**
 * Os providers chamam `fetch` global. Mockamos o fetch para exercitar o roteador
 * (escolha de provedor, fallback, erro honesto) sem rede.
 */

function geminiOk(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function claudeOk(text: string): Response {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function httpError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
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
});
