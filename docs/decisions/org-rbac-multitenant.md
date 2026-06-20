# ADR-001: Organizações Multi-usuário e RBAC

**Status:** PROPOSTA — aguardando aprovação do Igor  
**Data:** 2026-06-20  
**Autores:** Sistema (gerado por auditoria automatizada)  
**Impacto:** IRREVERSÍVEL após Fase 2 — requer aprovação explícita antes de qualquer migration

---

## 1. Contexto e Motivação

O plano "corporativo" existe no Stripe e no código (R$597/mês), mas hoje significa exatamente um usuário com um limite de cota mais alto. Não há multi-seat, não há convite de membros, não há papéis diferenciados. Qualquer lead enterprise que perguntar "posso adicionar minha equipe?" recebe uma resposta embaraçosa.

O bloqueador técnico central é o modelo email-centric de `subscriptions`. A tabela vincula billing a um endereço de email individual — a RPC `my_plan()` retorna o plano cruzando `email = auth.email()` — e todo o RBAC subsequente (`entitlements`, `usage_events`, `alerts`, `dossiers`) usa `account_id = auth.uid()::text` como fronteira de isolamento. Esse design é adequado para um usuário solo e incompatível com times: se dois colaboradores compartilharem credenciais (workaround comum), o RLS deixa de isolar dados; se pagarem assinaturas separadas, não há como consolidar billing nem visibilidade.

Equipes querem billing centralizado (uma fatura para o escritório, não uma por advogado), dados compartilhados dentro do tenant (dossier criado por um sócio visível para outro), e controle de acesso granular (associado vê, sócio administra). Nada disso é construível sobre o modelo atual sem uma refatoração coordenada de RLS, billing e frontend.

Este ADR descreve o modelo proposto, a estratégia de migração em fases reversíveis e as decisões abertas que precisam de aprovação antes da execução.

---

## 2. Modelo de Dados Proposto

### 2.1 Novas tabelas

Os três DDLs abaixo são rascunhos para revisão. Nenhum deve ser aplicado antes da aprovação das Seções 7 e 8.

```sql
-- RASCUNHO — NÃO APLICAR
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,           -- para URL e identificação humana
  created_by  uuid references auth.users(id), -- fundador (histórico; não é o campo de billing)
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
```

```sql
-- RASCUNHO — NÃO APLICAR
create table organization_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner', 'admin', 'member')),
  invited_by  uuid references auth.users(id),
  joined_at   timestamptz default now(),
  unique (org_id, user_id)
);
```

```sql
-- RASCUNHO — NÃO APLICAR
create table organization_invites (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  email        text not null,
  role         text not null check (role in ('admin', 'member')),
  token        text unique not null default encode(gen_random_bytes(32), 'hex'),
  invited_by   uuid references auth.users(id),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  created_at   timestamptz default now(),
  unique (org_id, email)
);
```

### 2.2 Mudanças nas tabelas existentes

As tabelas `dossiers`, `alerts`, `external_lookups`, `usage_events` e `entitlements` receberão uma coluna `org_id uuid references organizations(id)` nullable na Fase 1. A coluna será preenchida via backfill antes de qualquer alteração de policy.

A distinção entre autoria e posse organizacional é deliberada. `dossiers.created_by` continua registrando quem criou o documento (rastreabilidade individual); `dossiers.org_id` define quem pode ler e gerenciar o documento (boundary do tenant). Um associate cria um dossier; a org inteira enxerga. Na Fase 2 a leitura passa a depender de `org_id` e não de `created_by`, mas o campo `created_by` não é removido — ele alimenta o log de auditoria.

`subscriptions` é o ponto mais delicado. A Fase 1 adiciona `org_id nullable` e preenche via backfill com a org pessoal do usuário. A `my_plan()` continua retornando por email enquanto a Fase 1 estiver ativa. Só na Fase 2 a leitura migra para `org_id` e o campo `email` em `subscriptions` deixa de ser a chave de negócio.

### 2.3 Como `my_plan()` evolui

Hoje a RPC retorna `plan_id` cruzando `email = auth.email()` em `subscriptions`. Na versão org ela precisa retornar o plano da organização ativa do usuário — o que exige saber qual é a "org ativa" da sessão corrente.

Há três abordagens possíveis, cada uma com trade-offs:

**Opção A — Header HTTP.** O frontend passa `X-Org-Id` em cada request. As Edge Functions validam que `auth.uid()` é membro da org no header. Simples de implementar, mas requer que o cliente sempre saiba e envie a org ativa.

**Opção B — JWT custom claim.** Supabase permite adicionar claims ao JWT via hook de auth. Um claim `org_id` seria preenchido com a org padrão do usuário no login. Transparente para as Edge Functions — `auth.jwt() -> 'org_id'` — mas exige um hook de sessão e torna a troca de org ativa dependente de re-autenticação ou token refresh.

**Opção C — Parâmetro de RPC.** `my_plan(org_id uuid)` recebe o org_id explicitamente. Flexível, mas coloca a responsabilidade de validação de membership na própria RPC (necessário de qualquer forma) e não resolve rate limiting nas Edge Functions sem o header.

A recomendação técnica é a combinação: JWT claim para a org padrão (backward-compatible, zero overhead nas Edge Functions) mais header HTTP para troca de contexto em sessões multi-org. A decisão final é do Igor (ver Seção 8, item 5).

---

## 3. RBAC — Papéis e Matriz de Permissões

Três papéis, sem hierarquia de herança explícita — as permissões são enumeradas diretamente.

**owner** — exatamente um por org. Intransferível exceto por transferência explícita (que automaticamente rebaixa o antigo owner para admin). Tem acesso a tudo incluindo billing e exclusão da org.

**admin** — pode fazer quase tudo exceto mexer em billing e deletar a organização. Pode convidar e remover membros, mas não pode rebaixar ou remover owners.

**member** — acesso de leitura, criação própria e exportação. Não vê billing, não convida ninguém, não deleta recursos de outros.

| Ação | owner | admin | member |
|---|---|---|---|
| Convidar membros | sim | sim | não |
| Remover membros | sim | sim (não owners) | não |
| Alterar papel de membro | sim | sim (não owners) | não |
| Ver/gerenciar billing | sim | não | não |
| Cancelar assinatura | sim | não | não |
| Criar/editar alertas | sim | sim | sim |
| Ver dossiers da org | sim | sim | sim |
| Criar dossiers | sim | sim | sim |
| Deletar dossiers de outros | sim | sim | não |
| Exportar dados | sim | sim | sim (limitado por plano) |
| Ver log de auditoria da org | sim | sim | não |
| Consultar infosimples | sim | sim | sim (dentro da cota) |
| Deletar organização | sim | não | não |

As regras de RBAC são enforced server-side via RLS (`role` em `organization_members`) e via RPCs SECURITY DEFINER para operações de escrita. O frontend exibe ou oculta UI baseado no papel, mas o enforcement real é no banco.

---

## 4. Estratégia de Migração de RLS (o ponto perigoso)

Esta é a seção crítica. O maior risco não é complexidade técnica — é lockout silencioso de usuários pagantes ou vazamento cross-tenant por policy mal configurada. A estratégia é de três fases com pontos de reversão explícitos.

### Fase 0 — Fundação sem tocar em RLS existente (REVERSÍVEL a qualquer momento)

Criar as três tabelas novas (`organizations`, `organization_members`, `organization_invites`). Não existe migration de schema em tabelas existentes nesta fase.

O backfill é automatizado: para cada `auth.uid()` distinto que aparece em `created_by`, `account_id` ou `user_id` nas tabelas existentes, criar uma organização pessoal com `slug = 'personal-{uid}'` e registrar o usuário como `owner` em `organization_members`. O mapeamento `user_id → org_id_pessoal` fica em `organization_members` e é a base de toda a Fase 1.

Nenhuma policy RLS existente é alterada. O sistema continua funcionando exatamente como hoje. Reverter é DROP das três tabelas novas — sem efeito colateral em dados existentes.

### Fase 1 — Adicionar `org_id` + políticas duais (REVERSÍVEL)

ALTER TABLE nas tabelas core para adicionar `org_id uuid references organizations(id)` nullable. Backfill: preencher `org_id` com o `org_id_pessoal` correspondente ao `created_by`/`account_id` de cada linha.

As novas políticas RLS são adicionadas **em paralelo com as antigas**, não substituindo. Um usuário acessa seus dados se `created_by = auth.uid()::text` (política antiga, intocada) **ou** se `org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())` (política nova). Qualquer das duas garante acesso — o usuário não percebe a transição.

Em `subscriptions`: adicionar `org_id nullable`, preencher com `org_id_pessoal`, sem remover `user_id` ou `email`. A RPC `my_plan()` continua por email nesta fase — a mudança de semântica fica para a Fase 2.

Reverter: DROP das novas políticas + DROP das colunas `org_id`. As políticas antigas nunca foram alteradas, então o sistema retorna ao estado pré-Fase 1 sem perda de dados.

### Fase 2 — Corte para org (IRREVERSÍVEL — exige aprovação escrita)

Remover as políticas antigas baseadas em `created_by = auth.uid()::text`. Tornar `org_id` NOT NULL (com constraint aplicada linha a linha via UPDATE validado). Migrar `my_plan()` para retornar por `org_id`. Atualizar o webhook Stripe para gravar `org_id` em `subscriptions`. Migrar cota do infosimples-proxy de por-usuário para por-org.

Não existe rollback direto desta fase. A reversão exigiria restauração de snapshot pré-Fase 2. Por isso a aprovação deve ser explícita e o snapshot verificado antes do `apply`.

### Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Lockout de usuários existentes | Alta sem backfill cuidadoso | Crítico | Backfill 100% validado antes da Fase 1; manter políticas duais durante toda a Fase 1 |
| Vazamento cross-org | Média se policy errada | Crítico | Testes de RLS com 3 orgs fictícias antes de qualquer Fase; security review por agente especializado |
| Quebra de billing (usuário perde plano pago) | Alta se email-centric persistir além do necessário | Alto | Migrar `subscriptions.org_id` e validar `my_plan()` por org antes de cortar a leitura por email |
| Abuso de cota por seat (N membros consumindo cota individual) | Baixa | Médio | Manter limite diário por `user_id` mesmo na Fase org; adicionar limite mensal por `org_id` |
| Webhook Stripe gravando `user_id` nulo permanentemente | Baixa (já é nulo em novos signups) | Médio | Processar `metadata.org_id` no checkout antes de cortar o campo `user_id` |

---

## 5. Billing por Organização

Hoje o Customer ID do Stripe representa um usuário individual identificado por email. Na versão org ele representa a organização: uma fatura, N membros.

As mudanças estruturais em `subscriptions` são: `org_id` substitui `user_id`/`email` como chave de relação de negócio; o `stripe_customer_id` passa a ser criado no nome da org, não do usuário fundador; `seats` em `plans.ts` deixa de ser declarativo e passa a ser enforced via `SELECT count(*) FROM organization_members WHERE org_id = $1` ≤ `max_seats` do plano antes de qualquer invite ser aceito.

O Checkout Session do frontend precisa passar `metadata.org_id` para que o webhook saiba a qual org associar a assinatura. Sem esse metadado, o webhook não tem como fazer o UPSERT correto em `subscriptions`.

**O que muda no webhook Stripe (`services/stripe-webhook/src/worker.ts`):**

1. `checkout.session.completed` captura `metadata.org_id` e faz UPSERT em `subscriptions` usando `org_id` + `stripe_subscription_id` como chave de negócio.
2. `customer.subscription.updated` e `customer.subscription.deleted` buscam `subscriptions` por `stripe_subscription_id` — esse campo já é único e não muda.
3. Após a Fase 2, `subscriptions.user_id` e `subscriptions.email` podem ser mantidos como histórico ou dropados — decisão a tomar na Fase 2.

Os Price IDs estão hardcoded em três locais: `services/stripe-webhook/src/worker.ts`, `services/billing/src/plans.ts` e `apps/web/src/config/stripe.ts`. Independente do modelo de billing escolhido (flat por org ou por seat), esses três arquivos precisam ser consolidados em um único ponto de verdade antes da Fase 2 — a divergência atual é um bug latente.

A regra "nunca liberar plano pelo front" se mantém sem alteração: `my_plan()` continua como único oráculo server-side, agora retornando o plano da org ativa em vez do usuário individual.

---

## 6. Impacto no Código — Inventário de Pontos de Mudança

Esta lista cobre o que muda, não o como — o "como" é escopo das issues de execução pós-aprovação.

**`packages/domain/src/`**
- `entities.ts` — adicionar tipos `Organization`, `OrganizationMember`, `OrganizationInvite` e um novo tipo `PlanContext` que carrega `org_id` além de `plan_id`.

**`apps/web/src/`**
- `auth/auth-context.tsx` — adicionar `currentOrg` e `userOrgs[]` ao contexto de autenticação; `currentOrg` é a org ativa da sessão.
- `lib/use-plan.ts` — `usePlan()` passa a receber contexto de org; a chamada a `my_plan()` inclui o `org_id` da org ativa.
- `config/stripe.ts` — o Checkout deve incluir `metadata.org_id` ao criar a sessão de pagamento.
- Novos componentes necessários: `OrgSwitcher`, `InviteMembersModal`, `MemberList`, `OrgSettings`.

**`supabase/functions/`**
- `fonteia/index.ts` — a chave de rate limit muda de `user:{uid}` para `org:{org_id}:{uid}` (ou híbrido que preserva limite individual dentro do limite de org).
- `infosimples-proxy/index.ts` — `external_lookup_user_day_count` ganha contraparte `external_lookup_org_month_count`; a cota de cortesia de cache miss vira por-org.
- `_shared/auth.ts` — novo helper `getVerifiedOrgId(req, userId)` que valida membership do usuário na org solicitada antes de qualquer operação cross-tenant.

**`services/stripe-webhook/src/worker.ts`**
- Processar `metadata.org_id` do `checkout.session.completed`.
- UPSERT em `subscriptions` por `org_id` + `stripe_subscription_id`.

**`services/billing/src/`**
- `plans.ts` — `quotas.seats` passa de declarativo para enforced via check server-side no momento do invite.
- `entitlements.ts` — `evaluateUsage` recebe `org_id` em vez de (ou além de) `user_id`.

**`infra/migrations/` (arquivos novos, nunca alteração dos existentes)**

Quatro migrations separadas, uma por etapa lógica: criação das três tabelas novas; adição de `org_id` nas tabelas existentes; políticas duais de Fase 1; corte de Fase 2 (arquivo separado com comentário de aprovação explícita no topo). Nunca empacotar Fase 1 e Fase 2 na mesma migration.

---

## 7. Faseamento Incremental e Checklist de Security Review

### Fase 0

- [ ] DDL das três tabelas novas revisado pelo Igor
- [ ] Script de backfill testado em banco de staging com dados reais
- [ ] 100% dos `auth.uid()` distintos têm org pessoal criada (validação via `SELECT count(distinct ...) FROM ...` comparativa)
- [ ] Nenhuma policy existente foi alterada (validar via `SELECT * FROM pg_policies` antes e depois)

### Fase 1

- [ ] Colunas `org_id` adicionadas e backfill validado (zero nulls em linhas pré-existentes)
- [ ] Políticas duais testadas: usuário acessa seus dados via política antiga E via política nova independentemente
- [ ] Teste de isolamento: user A não vê dados do user B nem pela política antiga nem pela nova
- [ ] Coluna `org_id` em `subscriptions` preenchida e `my_plan()` testada com `org_id` em staging
- [ ] Deploy de Edge Functions com suporte a `org_id` em modo backward-compatible (header ausente = fallback para uid)

### Fase 2 (exige aprovação escrita do Igor antes do apply em produção)

- [ ] Snapshot do banco verificado (Supabase backup ativado e restore testado em ambiente isolado)
- [ ] Teste completo em staging com políticas antigas removidas — zero regressões de acesso
- [ ] Zero linhas sem `org_id` nas tabelas core
- [ ] Webhook Stripe atualizado e testado com `org_id` em `metadata`
- [ ] `my_plan()` retornando corretamente por `org_id` em staging (sem fallback por email)
- [ ] Cota infosimples testada por org com N membros consumindo simultaneamente
- [ ] Price IDs consolidados em ponto único antes do deploy
- [ ] Security review por agente especializado antes do apply em produção

---

## 8. Decisões Abertas para o Dono (Igor)

Estas decisões bloqueiam a execução. Nenhuma migration deve ser iniciada sem resposta a pelo menos os itens 1, 2 e 3.

**1. Modelo de billing de seats.** Por-org flat (uma assinatura cobre N membros até o limite do plano, preço fixo) versus por-seat cobrado (R$ × número de membros ativos). O modelo flat é mais simples de implementar e vender; o por-seat maximiza receita em orgs grandes mas exige Price ID de seat no Stripe e lógica de proration. O código atual em `plans.ts` aponta para flat (seats como limite, não como multiplicador).

**2. Limite de membros por plano.** O plano free tem 1 seat (implícito). O pro tem 1 seat (individual). O corporativo: o marketing menciona "até 8" em algum lugar do seed de dados, mas não é definitivo. Qual é o número — 5, 8, ilimitado? A decisão afeta o `quotas.seats` em `plans.ts` e a enforcement na Fase 1.

**3. Upgrade de Pro para multi-seat.** Quando um usuário Pro (R$197, 1 seat) quer adicionar membros: ele precisa migrar para Corporativo? O plano Pro ganha uma variante com seats por preço maior? Ou multi-seat é exclusivo do Corporativo? Essa decisão define se precisamos de novos Price IDs ou apenas de nova lógica no Checkout.

**4. Portabilidade de dados na saída de um membro.** Quando um admin remove um membro, os dossiers que esse membro criou ficam na org (pertencentes à org) ou são devolvidos ao usuário (ou deletados)? A resposta afeta a semântica de `dossiers.created_by` versus `dossiers.org_id` e precisa estar clara antes de escrever as políticas de Fase 1.

**5. Org ativa no frontend.** Quando um usuário pertence a múltiplas orgs (caso do consultor externo que trabalha para dois escritórios), como ele seleciona a ativa — via switcher de UI, via parâmetro de URL (`/org/{slug}/...`), ou via JWT claim refresh? O JWT claim (opção B da Seção 2.3) é a mais limpa tecnicamente mas tem latência de troca; a URL é a mais explícita mas quebra links compartilhados. Decidir antes de desenhar o `OrgSwitcher`.

**6. Plano free com org.** Um usuário free pode criar uma organização pessoal (que já existirá via backfill) e convidar membros? Ou convite de membros é exclusivo de planos pagos? Se free pode convidar, como a cota se comporta — cada membro tem sua própria cota free ou a org tem uma cota compartilhada?

**7. Price IDs por-org no Stripe.** Os Price IDs atuais (`pro` e `corporativo`) foram criados para billing por-usuário. Ao migrar para por-org, eles podem ser reutilizados com metadados ou é necessário criar novos Price IDs? Novos Price IDs significam migrar assinantes existentes via Stripe API — operação possível mas com risco de interrupção de billing.

**8. Timeline para Fase 2.** As Fases 0 e 1 são seguras de executar agora (adicionam tabelas e colunas sem remover nada, reversíveis). A Fase 2 é irreversível e envolve mudar o comportamento de `my_plan()` e o webhook de billing. Faz sentido iniciar as Fases 0 e 1 antes de ter 10 clientes corporativos pagantes, para estar pronto quando a demanda chegar? Ou aguardar um cliente real pedir multi-seat antes de investir o esforço?

---

## Próximo passo

A aprovação do Igor nas Decisões Abertas (Seção 8) — especialmente itens 1, 2 e 3 — e no modelo de dados (Seção 2) é o gatilho para iniciar a Fase 0. Nenhuma migration deve ser executada em produção sem que a Fase 0 tenha sido validada em staging com dados reais e sem que um agente de security review tenha auditado as políticas RLS propostas. O documento será atualizado para "Aceita" após aprovação escrita.
