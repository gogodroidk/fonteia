/**
 * prerender.mjs — pós-build de pré-renderização estática (SEO/GEO).
 *
 * Roda DEPOIS de `vite build`. Para cada rota pública de marketing:
 *   1. Renderiza o componente standalone com `renderToStaticMarkup`
 *      (sem auth, sem APIs de browser — `useSeo` é no-op em SSR).
 *   2. Clona o `dist/index.html` da SPA, injeta o markup dentro de
 *      `<div id="root">…</div>` e corrige <title>/description/canonical/OG
 *      para a rota.
 *   3. Grava `dist/<rota>/index.html`.
 *
 * O resultado: crawlers e IAs sem JS veem o conteúdo; o navegador continua
 * carregando o mesmo bundle SPA, que hidrata por cima (app inalterado).
 *
 * Estratégia de compilação: usamos a API JS do Vite para fazer um build SSR
 * isolado de `scripts/prerender-entry.tsx` (reaproveita o esbuild/JSX do Vite,
 * sem loader extra). Nada disso toca o build SPA já gerado em `dist/`.
 */
import { build } from "vite";
import { pathToFileURL } from "node:url";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");
const distDir = join(webRoot, "dist");
const entryFile = join(__dirname, "prerender-entry.tsx");

const SITE_URL = "https://fontebrasil.online";

/** Escapa texto para uso seguro como conteúdo de atributo HTML. */
function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escapa texto para uso como conteúdo de elemento (ex.: <title>). */
function escapeText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Substitui (ou insere) o conteúdo de uma <meta> identificada por name/property.
 * Mantém o restante do atributo intacto reescrevendo só o `content`.
 */
function setMeta(html, attrKey, attrValue, content) {
  const safe = escapeAttr(content);
  // <meta ... name|property="X" ... content="..." ...>  (ordem qualquer)
  const re = new RegExp(
    `(<meta\\b[^>]*\\b${attrKey}=["']${attrValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>)`,
    "i",
  );
  const match = html.match(re);
  if (match) {
    let tag = match[1];
    if (/\bcontent=["'][^"']*["']/i.test(tag)) {
      tag = tag.replace(/\bcontent=["'][^"']*["']/i, `content="${safe}"`);
    } else {
      tag = tag.replace(/\s*\/?>$/, ` content="${safe}" />`);
    }
    return html.replace(re, tag);
  }
  // Não existe: insere antes de </head>.
  const inject = `    <meta ${attrKey}="${attrValue}" content="${safe}" />\n`;
  return html.replace(/<\/head>/i, `${inject}</head>`);
}

/** Reescreve o href de <link rel="canonical">, inserindo se faltar. */
function setCanonical(html, href) {
  const safe = escapeAttr(href);
  const re = /<link\b[^>]*\brel=["']canonical["'][^>]*>/i;
  if (re.test(html)) {
    return html.replace(re, `<link rel="canonical" href="${safe}" />`);
  }
  return html.replace(
    /<\/head>/i,
    `    <link rel="canonical" href="${safe}" />\n</head>`,
  );
}

/** Reescreve o <title>. */
function setTitle(html, title) {
  const safe = escapeText(title);
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safe}</title>`);
  }
  return html.replace(/<\/head>/i, `    <title>${safe}</title>\n</head>`);
}

/**
 * Injeta o markup pré-renderizado dentro de <div id="root">…</div>.
 * O index.html da SPA tem o root vazio.
 */
function injectRoot(html, markup) {
  const re = /(<div\b[^>]*\bid=["']root["'][^>]*>)([\s\S]*?)(<\/div>)/i;
  if (!re.test(html)) {
    throw new Error('Não encontrei <div id="root"> no index.html da SPA.');
  }
  return html.replace(re, (_m, open, _inner, close) => `${open}${markup}${close}`);
}

async function main() {
  // 1) Confirma que o build SPA já rodou (precisamos do index.html base).
  const baseIndexPath = join(distDir, "index.html");
  let baseHtml;
  try {
    baseHtml = readFileSync(baseIndexPath, "utf8");
  } catch {
    console.error(
      `[prerender] dist/index.html não encontrado em ${baseIndexPath}. Rode \`vite build\` antes.`,
    );
    process.exitCode = 1;
    return;
  }

  // 2) Build SSR isolado da entrada de pré-renderização (não toca o dist da SPA).
  const tmpRoot = mkdtempSync(join(tmpdir(), "fonteia-prerender-"));
  try {
    await build({
      root: webRoot,
      logLevel: "warn",
      configFile: false, // a SPA não usa vite.config; mantemos consistente
      // Bundla TODAS as deps (react, react-dom/server, lucide-react) no output,
      // para o .mjs ser autocontido e carregável de fora do projeto (/tmp).
      ssr: { noExternal: true },
      build: {
        ssr: entryFile,
        outDir: tmpRoot,
        emptyOutDir: false,
        write: true,
        minify: false,
        rollupOptions: {
          output: { entryFileNames: "prerender-entry.mjs" },
        },
      },
    });

    // 3) Importa o bundle SSR compilado.
    const bundlePath = join(tmpRoot, "prerender-entry.mjs");
    const mod = await import(pathToFileURL(bundlePath).href);
    const { PRERENDER_ROUTES, renderRoute } = mod;

    if (!Array.isArray(PRERENDER_ROUTES) || typeof renderRoute !== "function") {
      throw new Error(
        "Bundle SSR não exportou PRERENDER_ROUTES/renderRoute como esperado.",
      );
    }

    // 4) Para cada rota: renderiza, injeta, ajusta metadados, grava.
    let written = 0;
    for (const route of PRERENDER_ROUTES) {
      const canonical = `${SITE_URL}${route.path}`;
      let markup;
      try {
        markup = renderRoute(route);
      } catch (err) {
        console.error(`[prerender] Falha ao renderizar ${route.path}:`, err);
        throw err;
      }

      let html = baseHtml;
      html = injectRoot(html, markup);
      html = setTitle(html, route.title);
      html = setMeta(html, "name", "description", route.description);
      html = setCanonical(html, canonical);
      // Open Graph + Twitter (espelham title/description/url da rota).
      html = setMeta(html, "property", "og:title", route.title);
      html = setMeta(html, "property", "og:description", route.description);
      html = setMeta(html, "property", "og:url", canonical);
      html = setMeta(html, "name", "twitter:title", route.title);
      html = setMeta(html, "name", "twitter:description", route.description);

      // dist/<rota>/index.html
      const outDir = join(distDir, route.path.replace(/^\//, ""));
      mkdirSync(outDir, { recursive: true });
      const outFile = join(outDir, "index.html");
      writeFileSync(outFile, html, "utf8");
      written += 1;
      console.log(
        `[prerender] ${route.path.padEnd(36)} → ${outFile.replace(webRoot + "/", "")} (${markup.length} bytes de markup)`,
      );
    }

    console.log(`[prerender] OK — ${written} rota(s) pré-renderizada(s).`);
  } finally {
    // Limpa o build SSR temporário.
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[prerender] ERRO:", err);
  process.exitCode = 1;
});
