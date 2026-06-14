import { chromium } from "playwright";
import { join } from "node:path";

const BASE = "http://localhost:5173";
const OUT = "/home/user/fonteia/screenshots/after-all";
const INIT = `
  localStorage.setItem("fonteia-theme","dark");
  localStorage.setItem("fonteia.onboarded","1");
  localStorage.setItem("fonteia.consent", JSON.stringify({necessarios:true,funcionais:true,analiticos:false,publicidade:false,ts:new Date().toISOString()}));
`;

async function settle(page) {
  try { await page.waitForLoadState("networkidle", { timeout: 12000 }); } catch {}
  await page.waitForTimeout(1500);
}
async function login(page) {
  await page.goto(`${BASE}/entrar`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: /Já tem conta\? Entrar/ }).first().click();
  await page.waitForTimeout(300);
  await page.fill("#auth-email", "qa@fonteia.app");
  await page.fill("#auth-password", "Teste1234");
  await page.getByRole("button", { name: /^Entrar$/ }).last().click();
  await page.waitForFunction(() => !document.querySelector("#auth-email"), { timeout: 15000 });
  await settle(page);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/opt/pw-browsers/chromium-1223/chrome-linux64/chrome",
});

for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, colorScheme: "dark" });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  await login(page);
  // Rota de detalhe (Raio-X) com ID sintético — exercita o estado de carga/erro do LotDetailPage.
  await page.goto(`${BASE}/app/lotes/demo-lote-0001`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.waitForTimeout(2000); // dá tempo pro fetch resolver/falhar
  await page.screenshot({ path: join(OUT, name, "app-lote-detalhe.png"), fullPage: true });
  const snippet = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 220);
  console.log(`${name}/app-lote-detalhe.png | ${snippet}`);
  await ctx.close();
}
await browser.close();
