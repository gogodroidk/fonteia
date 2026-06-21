/**
 * auth-error.test.ts — garante que mapAuthError NUNCA vaza a mensagem crua do
 * servidor e sempre devolve um texto claro em PT-BR para cada caso conhecido.
 *
 * Segurança: o caso "desconhecido" deve cair no fallback fornecido, jamais
 * ecoar a string interna do Supabase/Postgres ao usuário.
 */

import { describe, it, expect } from "vitest";
import { mapAuthError } from "./auth-context";

const LOGIN_FALLBACK = "Não foi possível entrar. Tente novamente em instantes.";
const SIGNUP_FALLBACK = "Não foi possível criar sua conta. Tente novamente em instantes.";

describe("mapAuthError", () => {
  it("returns the fallback when message is empty/null/undefined", () => {
    expect(mapAuthError(null, LOGIN_FALLBACK)).toBe(LOGIN_FALLBACK);
    expect(mapAuthError(undefined, LOGIN_FALLBACK)).toBe(LOGIN_FALLBACK);
    expect(mapAuthError("", LOGIN_FALLBACK)).toBe(LOGIN_FALLBACK);
  });

  it("maps captcha failures to a PT-BR message", () => {
    const out = mapAuthError("captcha protection: request disallowed", SIGNUP_FALLBACK);
    expect(out).toContain("anti-bot");
    expect(out).not.toContain("captcha protection"); // no raw leak
  });

  it("maps invalid credentials to a generic anti-enumeration message", () => {
    const out = mapAuthError("Invalid login credentials", LOGIN_FALLBACK);
    expect(out).toBe("E-mail ou senha incorretos. Verifique os dados e tente novamente.");
  });

  it("maps already-registered email (signup)", () => {
    expect(mapAuthError("User already registered", SIGNUP_FALLBACK)).toContain("já está cadastrado");
    expect(mapAuthError("Email address is already in use", SIGNUP_FALLBACK)).toContain("já está cadastrado");
  });

  it("maps weak/short password", () => {
    expect(mapAuthError("Password should be at least 8 characters", SIGNUP_FALLBACK)).toContain("Senha muito fraca");
    expect(mapAuthError("Weak password", SIGNUP_FALLBACK)).toContain("Senha muito fraca");
  });

  it("maps invalid email", () => {
    expect(mapAuthError("Unable to validate email address: invalid format", SIGNUP_FALLBACK)).toContain("E-mail inválido");
  });

  it("maps email-not-confirmed", () => {
    expect(mapAuthError("Email not confirmed", LOGIN_FALLBACK)).toContain("Confirme seu e-mail");
  });

  it("maps rate limit / too many requests", () => {
    expect(mapAuthError("Email rate limit exceeded", SIGNUP_FALLBACK)).toContain("Muitas tentativas");
    expect(mapAuthError("For security purposes, you can only request this after 31 seconds", LOGIN_FALLBACK)).toContain("Muitas tentativas");
  });

  it("maps network errors", () => {
    expect(mapAuthError("Failed to fetch", LOGIN_FALLBACK)).toContain("Falha de conexão");
    expect(mapAuthError("NetworkError when attempting to fetch resource", LOGIN_FALLBACK)).toContain("Falha de conexão");
  });

  it("does NOT leak an unknown raw server message — falls back instead", () => {
    const internal = 'duplicate key value violates unique constraint "users_pkey"';
    const out = mapAuthError(internal, SIGNUP_FALLBACK);
    expect(out).toBe(SIGNUP_FALLBACK);
    expect(out).not.toContain("constraint");
    expect(out).not.toContain("pkey");
  });
});
