/**
 * qa-shots.mjs — captura de telas autenticadas /app/* em MODO DEMO.
 *
 * Pré-condição: dev server rodando em http://localhost:5173 SEM Supabase
 * (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY vazias) → demoMode=true.
 *
 * Estratégia:
 *   1. Pré-semeia localStorage (tema dark, onboarding concluído, consentimento
 *      de cookies) via addInitScript, ANTES de qualquer carga do app — assim o
 *      banner de cookies não cobre as telas e pulamos o onboarding.
 *   2. Faz login no formulário demo (qualquer e-mail + senha >= 8 chars).
 *   3. Visita cada rota /app/*, espera networkidle + 1000ms, captura full-page
 *      em desktop (1440x900) e mobile (390x844).
 *   4. Tenta abrir o detalhe de um lote (/app/lotes/<id>, Raio-X).
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:5173";
const OUT = "/home/user/fonteia/screenshots/after-all";
const EMAIL = "qa@fonteia.app";
const PASSWORD = "Teste1234";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

// rota -> slug de arquivo
const ROUTES = [
  { path: "/app", slug: "app-painel" },
  { path: "/app/lotes", slug: "app-lotes" },
  { path: "/app/licitacoes", slug: "app-licitacoes" },
  { path: "/app/alertas", slug: "app-alertas" },
  { path: "/app/relatorios", slug: "app-relatorios" },
  { path: "/app/fontes", slug: "app-fontes" },
  { path: "/app/conta", slug: "app-conta" },
  { path: "/app/planos", slug: "app-planos" },
  { path: "/app/buscar", slug: "app-buscar" },
  { path: "/app/modules", slug: "app-modules" },
];

// Semeia localStorage antes do app montar: tema dark, onboarding feito,
// consentimento de cookies salvo (some o banner).
const INIT_SCRIPT = `
  try {
    localStorage.setItem("fonteia-theme", "dark");
    localStorage.setItem("fonteia.onboarded", "1");
    localStorage.setItem("fonteia.consent", JSON.stringify({
      necessarios: true, funcionais: true, analiticos: false,
      publicidade: false, ts: new Date().toISOString()
    }));
  } catch (e) {}
`;

async function settle(page) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 15000 });
  } catch {
    /* networkidle pode não chegar; segue mesmo assim */
  }
  await page.waitForTimeout(1000);
}

async function shot(page, dir, slug) {
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${slug}.png`), fullPage: true });
  console.log(`  ✓ ${dir.split("/").pop()}/${slug}.png`);
}

async function login(page) {
  await page.goto(`${BASE}/entrar`, { waitUntil: "domcontentloaded" });
  await settle(page);

  // O formulário abre em modo "signup" por padrão; troca para "login" para um
  // fluxo mais curto (só e-mail + senha). Há vários botões "Entrar"; usamos o
  // link do cabeçalho "Já tem conta? Entrar".
  const toLogin = page.getByRole("button", { name: /Já tem conta\? Entrar|^Entrar$/ }).first();
  try {
    await toLogin.click({ timeout: 3000 });
  } catch {
    /* talvez já esteja em login */
  }
  await page.waitForTimeout(300);

  await page.fill("#auth-email", EMAIL);
  await page.fill("#auth-password", PASSWORD);

  // Botão de submit "Entrar" (login mode) — submit do form.
  const submit = page.getByRole("button", { name: /^Entrar$/ }).last();
  await submit.click();

  // Espera o app autenticar e sair da tela de login.
  await page.waitForFunction(
    () => !document.querySelector("#auth-email"),
    { timeout: 15000 },
  );
  await settle(page);
  const url = page.url();
  const demoUser = await page.evaluate(() => localStorage.getItem("fonteia.demo.user"));
  console.log(`Login OK → ${url} | demo.user salvo: ${demoUser ? "sim" : "NÃO"}`);
}

async function captureViewport(browser, viewport, dirName) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  await context.addInitScript(INIT_SCRIPT);
  const page = await context.newPage();
  const dir = join(OUT, dirName);

  console.log(`\n=== ${dirName} (${viewport.width}x${viewport.height}) ===`);
  await login(page);

  for (const r of ROUTES) {
    await page.goto(`${BASE}${r.path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await shot(page, dir, r.slug);
  }

  // Detalhe de lote (Raio-X): vai para /app/lotes e clica no primeiro card.
  let lotCaptured = false;
  try {
    await page.goto(`${BASE}/app/lotes`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const card = page.locator('.card.card--hover[role="button"]').first();
    if (await card.count()) {
      await card.click({ timeout: 5000 });
      await page.waitForTimeout(500);
      await settle(page);
      if (/\/app\/(lotes|leiloes)\/[^/]+/.test(page.url())) {
        await shot(page, dir, "app-lote-detalhe");
        lotCaptured = true;
      }
    }
  } catch (e) {
    console.log(`  ! detalhe de lote não capturado: ${e.message}`);
  }
  if (!lotCaptured) console.log("  ! nenhum card de lote clicável encontrado (dados vazios em demo)");

  await context.close();
  return lotCaptured;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/opt/pw-browsers/chromium-1223/chrome-linux64/chrome",
  });

  const d = await captureViewport(browser, DESKTOP, "desktop");
  const m = await captureViewport(browser, MOBILE, "mobile");

  await browser.close();
  console.log(`\nConcluído. Detalhe de lote: desktop=${d} mobile=${m}`);
}

main().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});
