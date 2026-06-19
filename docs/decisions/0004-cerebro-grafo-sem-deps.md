# ADR 0004 — Cérebro: grafo em canvas próprio, sem React Flow nem tldraw

**Data:** 2026-06  
**Status:** Aceita  
**Autores:** Igor/Olli  

---

## Contexto

O módulo "Cérebro Governamental" do Fonte.ia visualiza relações entre entidades públicas: empresas (CNPJ), contratos (PNCP), órgãos, políticos, infrações ambientais, sanções. O grafo conecta essas entidades por vínculos extraídos dos dados (ex: empresa → contrato → órgão público; político → empresa via quadro societário).

A visualização precisa ser: interativa (drag, zoom, pan), responsiva para mobile, sem pesado bundle de terceiros, e controlável no comportamento físico da simulação de força.

---

## Decisão

O motor do grafo é implementado **do zero**, sem React Flow, sem tldraw, sem d3-force, sem Cytoscape.

Estrutura em `apps/web/src/features/cerebro/`:
- `force-graph.ts` — motor de simulação de força (física pura: repulsão Coulomb, mola de Hooke, gravidade ao centro, amortecimento). Sem React, sem DOM. Muta `x/y/vx/vy` in-place. Nós com `fixed=true` (sendo arrastados) não são integrados mas continuam empurrando vizinhos.
- `types.ts` — tipos `GraphData`, `GraphNode`, `EdgeKind`.
- `cerebro-api.ts` — chamadas à Edge Function ou ao d1-bridge para buscar entidades e seus vínculos.

O canvas é renderizado pela página React usando `requestAnimationFrame`. A câmera (pan/zoom) é transformação CSS/canvas aplicada na hora de desenhar — o motor só conhece coordenadas em espaço de mundo.

**Conexões por dados reais:** os nós são entidades do Fonte.ia (kind: `auction_lot`, `public_contract`, `politician`, `organization`, `environmental_infraction`, `municipality`, etc.). Os vínculos são formados por:
- Mesmo CNPJ entre empresas e contratos/sanções.
- Mesmo código IBGE entre municípios e órgãos/contratos.
- Mesmo `external_id` de fonte entre entidades relacionadas.

---

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| React Flow | Bundle pesado (~500 KB); comportamento de nó/aresta ditado pela lib; difícil customizar a física da simulação; licença permissiva mas dependência não-trivial de manter |
| tldraw | Voltado para whiteboard colaborativo; excessivo para um grafo de conhecimento de dados; bundle ainda maior |
| d3-force | API low-level razoável, mas exige `d3-selection` e interage mal com React 19 concurrent mode; peso total do d3 desnecessário para usar só o force layout |
| Cytoscape.js | Maduro mas grande; API de grafo genérica demais para o caso de uso específico do Fonte.ia; difícil de estilizar com o design system próprio |
| Sigma.js / Graphology | Boas opções, mas adicionam dependência e ainda exigem adaptar a physics à nossa necessidade |

---

## Motivo da escolha

1. **Zero dependências em `packages/cerebro`** — o bundle do Fonte.ia não cresce; o motor é tree-shakeable porque é TypeScript puro.
2. **Física controlável:** os parâmetros `SimParams` (repulsão, springStiffness, gravity, damping, minDistance, sleepVelocity) são ajustáveis em runtime sem redeploy. O valor padrão (`repulsion: 5200, damping: 0.86`) foi calibrado empiricamente para grafos de 20–200 nós.
3. **Integração nativa com os dados do Fonte.ia:** o grafo não é um componente genérico — ele sabe o que é um `politician`, um `organization`, um `auction_lot`, e desenha ícones/cores do design system para cada kind.
4. **Sem lock-in de lib:** se a física precisar de GPU (WebGL) para milhares de nós, a migração é interna — o motor é substituível sem mudar a API da página React.

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Motor O(n²) de repulsão — lento com muitos nós | Limite prático: 200 nós na viewport; para grafos maiores, filtrar por grau de separação (1 hop, 2 hops). Otimização com Barnes-Hut se necessário no futuro |
| Tabela `entity_links` ainda vazia em produção | O grafo existe mas não tem vínculos reais ainda; popular `entity_links` é a próxima ação (ver cerebro-governamental.md, seção 4) |
| Drag no mobile (touch) | Implementar `touchstart/touchmove/touchend` no canvas além de `mousedown/mousemove` |
| Sem testes unitários do motor de física | Adicionar testes de convergência em `packages/cerebro` |

---

## Próximos passos

- Popular a tabela `entity_links` com vínculos reais (empresa→contrato via CNPJ, município→órgão via código IBGE).
- Expor API de grafo pela Edge Function `fonteia` ou `d1-bridge` (`/graph?cnpj=...`, `/graph?entity_id=...`).
- Implementar eventos de touch para drag no mobile.
- Adicionar filtro de "grau de separação" no painel lateral do Cérebro.
