// features/feedback/feedback-api.test.ts
// Testes unitários do módulo de feedback — sem rede (supabase mockado como null).

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mocka o módulo supabase-client antes de importar feedback-api.
vi.mock("../../auth/supabase-client", () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

import {
  submitFeedback,
  listMyFeedback,
  listAllFeedback,
  FEEDBACK_TIPOS,
  FEEDBACK_STATUS_LABELS,
  type FeedbackTipo,
} from "./feedback-api";

describe("feedback-api (sem Supabase)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("FEEDBACK_TIPOS contém os 4 tipos esperados", () => {
    const valores = FEEDBACK_TIPOS.map((t) => t.value);
    expect(valores).toContain("sugestão");
    expect(valores).toContain("melhoria");
    expect(valores).toContain("reclamação");
    expect(valores).toContain("bug");
    expect(valores).toHaveLength(4);
  });

  it("FEEDBACK_STATUS_LABELS cobre os 3 status", () => {
    expect(FEEDBACK_STATUS_LABELS["novo"]).toBe("Novo");
    expect(FEEDBACK_STATUS_LABELS["em_análise"]).toBe("Em análise");
    expect(FEEDBACK_STATUS_LABELS["resolvido"]).toBe("Resolvido");
  });

  it("submitFeedback retorna ok=false quando Supabase não está configurado", async () => {
    const result = await submitFeedback({
      tipo: "sugestão" as FeedbackTipo,
      mensagem: "Sugestão de teste com pelo menos 10 caracteres",
    });
    expect(result.ok).toBe(false);
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("listMyFeedback retorna [] quando Supabase não está configurado", async () => {
    const result = await listMyFeedback();
    expect(result).toEqual([]);
  });

  it("listAllFeedback retorna [] quando Supabase não está configurado", async () => {
    const result = await listAllFeedback({ status: "novo" });
    expect(result).toEqual([]);
  });
});
