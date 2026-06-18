import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { SOURCE_CATALOG } = await import("../packages/sources/src/catalog.ts");

const statusLabel = {
  connected: "Conectada",
  integrating: "Em integracao",
  open_no_api: "Aberta sem API",
  restricted_government: "Restrita a governo",
  paid_or_credentialed: "Paga/credenciada",
  fragile_operational: "Fragil/sem SLA",
  complementary_non_government: "Complementar nao governamental",
  deprecated: "Descontinuada",
};

const rows = SOURCE_CATALOG.map((source) => {
  const docs = source.docsUrl ? `[docs](${source.docsUrl})` : "";
  return `| ${[
    `[\`${source.id}\`](${source.sourceUrl})`,
    source.owner,
    statusLabel[source.status] ?? source.status,
    source.accessKind,
    source.modules.join(", "),
    source.refreshCadence,
    source.commercialRisk,
    docs,
  ].join(" | ")} |`;
});

const markdown = `# Fonte.ia - Catalogo Inicial De Fontes

Atualizado em: 2026-06-10

Este catalogo e gerado a partir de \`packages/sources/src/catalog.ts\`. Ele separa fontes oficiais abertas, fontes sem API, fontes frageis, fontes restritas e fontes complementares.

| Fonte | Dono | Status | Acesso | Modulos | Atualizacao | Risco comercial | Docs |
|---|---|---|---|---|---|---|---|
${rows.join("\n")}

## Regras

- Toda fonte precisa ter dono, URL oficial, status, tipo de acesso e modulo associado.
- Fontes oficiais sem API documentada devem ser marcadas como \`open_no_api\` ou \`fragile_operational\`.
- Fontes como MapBiomas podem entrar como complementares, mas nao devem ser apresentadas como orgao oficial.
- O produto deve guardar evidencia, data de coleta e link original para cada resposta factual.
`;

// Anchor to this script's own directory (one level up from scripts/ → project root)
// rather than process.cwd(), so it works regardless of where the script is invoked from.
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const outputPath = join(projectRoot, "docs", "sources", "source-catalog.md");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, markdown, "utf8");
console.log(`Generated ${outputPath}`);
