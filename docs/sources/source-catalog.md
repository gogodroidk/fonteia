# Fonte.ia - Catalogo Inicial De Fontes

Atualizado em: 2026-06-10

Este catalogo e gerado a partir de `packages/sources/src/catalog.ts`. Ele separa fontes oficiais abertas, fontes sem API, fontes frageis, fontes restritas e fontes complementares.

| Fonte | Dono | Status | Acesso | Modulos | Atualizacao | Risco comercial | Docs |
|---|---|---|---|---|---|---|---|
| [`receita-leiloes-sle`](https://www25.receita.fazenda.gov.br/sle-sociedade/portal/editais-disponiveis) | Receita Federal do Brasil | Fragil/sem SLA | open | leiloes | daily | medium | [docs](https://www.gov.br/receitafederal/pt-br/assuntos/leilao) |
| [`pncp-consulta`](https://pncp.gov.br/api/consulta/swagger-ui/index.html) | Governo Federal | Conectada | open | licitacoes, empresas, municipios | daily | low | [docs](https://www.gov.br/pncp/pt-br/acesso-a-informacao/dados-abertos) |
| [`compras-gov-dados-abertos`](https://dadosabertos.compras.gov.br/) | Ministerio da Gestao e da Inovacao em Servicos Publicos | Conectada | open | licitacoes, empresas, municipios | daily | low | [docs](https://www.gov.br/compras/pt-br/acesso-a-informacao/manuais/manual-dados-abertos/manual-api-compras.pdf) |
| [`portal-transparencia-api`](https://portaldatransparencia.gov.br/api-de-dados) | Controladoria-Geral da Uniao | Em integracao | open_with_token | empresas, politica, municipios, licitacoes | daily | low | [docs](https://api.portaldatransparencia.gov.br/) |
| [`camara-dados-abertos`](https://dadosabertos.camara.leg.br/) | Camara dos Deputados | Em integracao | open | politica, juridico | daily | low | [docs](https://dadosabertos.camara.leg.br/swagger/api.html) |
| [`senado-dados-abertos`](https://legis.senado.leg.br/dadosabertos/api-docs/swagger-ui/index.html) | Senado Federal | Em integracao | open | politica, juridico | daily | low | [docs](https://www12.senado.leg.br/dados-abertos) |
| [`tse-dados-abertos`](https://dadosabertos.tse.jus.br/) | Tribunal Superior Eleitoral | Aberta sem API | public_files | politica, municipios | manual | low | [docs](https://www.tse.jus.br/eleicoes/estatisticas/repositorio-de-dados-eleitorais-1) |
| [`cnj-datajud`](https://www.cnj.jus.br/sistemas/datajud/api-publica/) | Conselho Nacional de Justica | Em integracao | open | juridico, empresas | daily | medium | [docs](https://www.cnj.jus.br/sistemas/datajud/api-publica/) |
| [`inpi-dados-abertos`](https://www.gov.br/inpi/pt-br/acesso-a-informacao/dados-abertos) | Instituto Nacional da Propriedade Industrial | Em integracao | public_files | inpi, empresas | manual | medium | [docs](https://www.gov.br/inpi/pt-br/projetos-estrategicos/portal-de-servicos) |
| [`ibama-dados-abertos`](https://dadosabertos.ibama.gov.br/) | Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renovaveis | Em integracao | public_files | ambiental, empresas | monthly | low | [docs](https://dadosabertos.ibama.gov.br/) |
| [`inpe-terrabrasilis`](https://terrabrasilis.dpi.inpe.br/) | Instituto Nacional de Pesquisas Espaciais | Em integracao | open | ambiental, municipios | daily | low | [docs](https://terrabrasilis.dpi.inpe.br/) |
| [`inpe-queimadas`](https://data.inpe.br/queimadas/dados-abertos/) | Instituto Nacional de Pesquisas Espaciais | Em integracao | open | ambiental, municipios | hourly | low | [docs](https://data.inpe.br/queimadas/dados-abertos/) |
| [`mapbiomas-alerta`](https://plataforma.alerta.mapbiomas.org/) | MapBiomas | Complementar nao governamental | open | ambiental | daily | medium | [docs](https://plataforma.alerta.mapbiomas.org/api) |
| [`ana-hidrowebservice`](https://www.ana.gov.br/hidrowebservice/swagger-ui/index.html) | Agencia Nacional de Aguas e Saneamento Basico | Em integracao | open | ambiental, municipios | daily | low | [docs](https://www.ana.gov.br/hidrowebservice/swagger-ui/index.html) |
| [`tesouro-siconfi`](https://www.tesourotransparente.gov.br/consultas/consultas-siconfi/siconfi-api-de-dados-abertos) | Tesouro Nacional | Em integracao | open | municipios, politica | monthly | low | [docs](https://apidatalake.tesouro.gov.br/docs/siconfi/) |
| [`transferegov-dados-abertos`](https://www.gov.br/rededeparcerias/pt-br/acesso-informacao/dados-abertos) | Governo Federal | Em integracao | open | municipios, politica, licitacoes | daily | low | [docs](https://www.gov.br/transferegov/pt-br/ferramentas-gestao/dados-abertos) |
| [`bndes-dados-abertos`](https://dadosabertos.bndes.gov.br/) | Banco Nacional de Desenvolvimento Economico e Social | Aberta sem API | public_files | empresas, politica, municipios | monthly | low | [docs](https://dadosabertos.bndes.gov.br/) |
| [`dou-inlabs`](https://inlabs.in.gov.br/) | Imprensa Nacional | Em integracao | open_with_token | juridico, politica, licitacoes, empresas | daily | low | [docs](https://inlabs.in.gov.br/) |

## Regras

- Toda fonte precisa ter dono, URL oficial, status, tipo de acesso e modulo associado.
- Fontes oficiais sem API documentada devem ser marcadas como `open_no_api` ou `fragile_operational`.
- Fontes como MapBiomas podem entrar como complementares, mas nao devem ser apresentadas como orgao oficial.
- O produto deve guardar evidencia, data de coleta e link original para cada resposta factual.
