import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/opt/pw-browsers/chromium-1223/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
await ctx.addInitScript(`
  localStorage.setItem("fonteia-theme","dark");
  localStorage.setItem("fonteia.onboarded","1");
  localStorage.setItem("fonteia.consent", JSON.stringify({necessarios:true,funcionais:true,analiticos:false,publicidade:false,ts:new Date().toISOString()}));
`);
const page = await ctx.newPage();
page.on("console", (m) => console.log("[browser]", m.type(), m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

console.log("URL:", page.url());
console.log("demoMode banner present:", await page.getByText(/Modo demonstração/).count());
const buttons = await page.locator("button").allInnerTexts();
console.log("BUTTONS:", JSON.stringify(buttons));
console.log("has #auth-email:", await page.locator("#auth-email").count());
console.log("has #auth-fullname:", await page.locator("#auth-fullname").count());

// Try the login flow as the real script does
await page.screenshot({ path: "/tmp/login-initial.png", fullPage: true });

// Switch to login mode
const toLogin = page.getByRole("button", { name: /Já tem conta\? Entrar/ }).first();
console.log("toLogin count:", await toLogin.count());
if (await toLogin.count()) { await toLogin.click(); await page.waitForTimeout(400); }
console.log("after switch, has #auth-fullname:", await page.locator("#auth-fullname").count());
const buttons2 = await page.locator("button").allInnerTexts();
console.log("BUTTONS after switch:", JSON.stringify(buttons2));

await page.fill("#auth-email", "qa@fonteia.app");
await page.fill("#auth-password", "Teste1234");
const submit = page.getByRole("button", { name: /^Entrar$/ }).last();
console.log("submit count:", await submit.count());
await submit.click();
await page.waitForTimeout(2500);
console.log("AFTER SUBMIT URL:", page.url());
console.log("after submit has #auth-email:", await page.locator("#auth-email").count());
console.log("demo.user:", await page.evaluate(() => localStorage.getItem("fonteia.demo.user")));
const bodyText = (await page.locator("body").innerText()).slice(0, 300);
console.log("BODY SNIPPET:", JSON.stringify(bodyText));
await page.screenshot({ path: "/tmp/login-after.png", fullPage: true });

await browser.close();
