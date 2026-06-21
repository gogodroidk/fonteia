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
 *
 * Adicionalmente, gera `dist/sitemap.xml` e copia `public/robots.txt` para
 * `dist/robots.txt` (Cloudflare Pages serve do dist/).
 */
import { build } from "vite";
import { pathToFileURL } from "node:url";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");
const distDir = join(webRoot, "dist");
const entryFile = join(__dirname, "prerender-entry.tsx");

const SITE_URL = "https://fontebrasil.online";
const OG_IMAGE_DEFAULT = `${SITE_URL}/og-image.png`;

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

/**
 * Prioridades de sitemap por padrão de path.
 * Permite que cada rota defina sua própria prioridade e changefreq.
 */
function sitemapMeta(path) {
  if (path === "/" || path === "") return { priority: "1.0", changefreq: "weekly" };
  if (path.startsWith("/guias/") || path === "/como-participar-leilao-receita-federal" || path === "/leiloes-receita-federal") {
    return { priority: "0.9", changefreq: "monthly" };
  }
  if (path === "/guias" || path === "/ferramentas/calculadora-lance") {
    return { priority: "0.9", changefreq: "monthly" };
  }
  if (path.startsWith("/blog/") || path === "/faq" || path === "/glossario-leiloes") {
    return { priority: "0.7", changefreq: "monthly" };
  }
  if (path === "/blog") {
    return { priority: "0.8", changefreq: "weekly" };
  }
  if (path === "/sobre" || path === "/para-quem") {
    return { priority: "0.7", changefreq: "monthly" };
  }
  if (path === "/analise-de-edital-com-ia" || path === "/riscos-leiloes-publicos") {
    return { priority: "0.7", changefreq: "monthly" };
  }
  if (path === "/fonteia-vs-planilha" || path === "/fonteia-vs-analise-manual" || path === "/melhores-ferramentas-analisar-leiloes") {
    return { priority: "0.6", changefreq: "monthly" };
  }
  if (path === "/seguranca" || path === "/enterprise") {
    return { priority: "0.6", changefreq: "monthly" };
  }
  if (path === "/contato") {
    return { priority: "0.5", changefreq: "yearly" };
  }
  if (path === "/privacidade" || path === "/termos" || path === "/cookies" || path === "/central-privacidade") {
    return { priority: "0.3", changefreq: "yearly" };
  }
  return { priority: "0.6", changefreq: "monthly" };
}

/** Gera sitemap.xml a partir das rotas pré-renderizadas mais a home (/). */
function generateSitemap(routes, today) {
  const homeEntry = `  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`;

  const routeEntries = routes.map((route) => {
    const { priority, changefreq } = sitemapMeta(route.path);
    return `  <url>
    <loc>${SITE_URL}${route.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

${homeEntry}

${routeEntries.join("\n\n")}

</urlset>
`;
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

    // Data ISO de hoje para lastmod do sitemap.
    const today = new Date().toISOString().slice(0, 10);

    // 4) Para cada rota: renderiza, injeta, ajusta metadados, grava.
    let written = 0;
    for (const route of PRERENDER_ROUTES) {
      const canonical = `${SITE_URL}${route.path}`;
      const ogImage = route.ogImage ?? OG_IMAGE_DEFAULT;
      const ogType = route.ogType ?? "website";
      const descShort = route.description.slice(0, 80);
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
      // Open Graph
      html = setMeta(html, "property", "og:title", route.title);
      html = setMeta(html, "property", "og:description", route.description);
      html = setMeta(html, "property", "og:url", canonical);
      html = setMeta(html, "property", "og:type", ogType);
      html = setMeta(html, "property", "og:locale", "pt_BR");
      html = setMeta(html, "property", "og:image", ogImage);
      html = setMeta(html, "property", "og:image:width", "1200");
      html = setMeta(html, "property", "og:image:height", "630");
      html = setMeta(html, "property", "og:image:alt", `Fonte.ia — ${descShort}`);
      // Twitter Card
      html = setMeta(html, "name", "twitter:card", "summary_large_image");
      html = setMeta(html, "name", "twitter:title", route.title);
      html = setMeta(html, "name", "twitter:description", route.description);
      html = setMeta(html, "name", "twitter:image", ogImage);

      // dist/<rota>/index.html
      const outDir = join(distDir, route.path.replace(/^\//, ""));
      mkdirSync(outDir, { recursive: true });
      const outFile = join(outDir, "index.html");
      writeFileSync(outFile, html, "utf8");
      written += 1;
      console.log(
        `[prerender] ${route.path.padEnd(44)} → ${outFile.replace(webRoot + "/", "")} (${markup.length} bytes)`,
      );
    }

    // 5) Gera sitemap.xml em dist/ (sobrepõe o estático copiado pelo Vite do public/).
    const sitemapXml = generateSitemap(PRERENDER_ROUTES, today);
    const sitemapPath = join(distDir, "sitemap.xml");
    writeFileSync(sitemapPath, sitemapXml, "utf8");
    console.log(`[prerender] sitemap.xml gerado → ${PRERENDER_ROUTES.length + 1} URLs (inclui /)`);

    // 6) Copia robots.txt se não estiver no dist (Vite copia do public/ mas confirma).
    const robotsSrc = join(webRoot, "public", "robots.txt");
    const robotsDst = join(distDir, "robots.txt");
    if (existsSync(robotsSrc) && !existsSync(robotsDst)) {
      copyFileSync(robotsSrc, robotsDst);
      console.log("[prerender] robots.txt copiado para dist/");
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
