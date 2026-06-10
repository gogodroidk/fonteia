# Fonte.ia - UX Research Notes

Data: 2026-06-10

## Objetivo

Definir a primeira tela web do Fonte.ia como um cockpit de decisao, nao como landing page. A interface precisa servir celular e web, manter a cascata comercial entre modulos e provar a origem de cada resposta.

## Fontes Consultadas

- NN/g Progressive Disclosure: https://www.nngroup.com/articles/progressive-disclosure/
- GOV.UK Design System: https://design-system.service.gov.uk/
- GOV.UK/MOJ filter pattern: https://design-patterns.service.justice.gov.uk/components/filter/
- GOV.UK search improvements: https://insidegovuk.blog.gov.uk/2024/12/12/making-it-quicker-and-easier-to-search-on-gov-uk/
- Material Design 3 navigation drawer: https://m3.material.io/components/navigation-drawer/overview
- Material Design 3 navigation bar: https://m3.material.io/components/navigation-bar/overview
- Material Design 3 navigation rail: https://m3.material.io/components/navigation-rail/overview

## Decisoes Aplicadas

1. A home do produto e um dashboard operacional: pergunta, oportunidades, evidencia, modulos e saude das fontes.
2. Leiloes fica vivo primeiro; os outros modulos aparecem travados para preservar cross-sell.
3. Evidencia fica em painel proprio, com fonte, data de coleta, confianca, registro bruto, hash e link original.
4. A lista de fontes usa status explicito para mostrar o que e conectado, em integracao ou fragil.
5. Desktop usa sidebar para troca rapida entre areas; mobile empilha os blocos e deixa as rotas principais no topo.
6. Complexidade aparece em camadas: primeiro a oportunidade, depois a evidencia, depois catalogo, modulos e trilhas completas.

## Artefatos

- Conceito visual: `docs/context/screenshots/fonteia-web-dashboard-concept-2026-06-10.png`
- Screenshot desktop: `docs/context/screenshots/fonteia-web-dashboard-2026-06-10-desktop.png`
- Screenshot mobile: `docs/context/screenshots/fonteia-web-dashboard-2026-06-10-mobile.png`

## Proxima Iteracao De UI

- Ligar dados reais de `/leiloes/lotes` no cockpit.
- Adicionar filtros do catalogo por status, modulo e risco comercial.
- Criar layout mobile nativo em `apps/mobile` com a mesma logica: pergunta, alertas, cards e evidencia.
- Trocar exemplos fixos por estado local e contratos de API compartilhados.
