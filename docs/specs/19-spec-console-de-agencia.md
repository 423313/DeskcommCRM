---
title: Spec Técnica 19 — Console de Agência (operação de N clientes)
parent: 00-prd-master.md
depends_on: 01-spec-platform-base.md, 11-spec-mcp-server-internal.md, 12-spec-ai-agents-ui.md, 13-spec-governanca-atendimento.md
version: 0.1
status: rascunho
date: 2026-09-13
owner: Josue Tostado
related_rules: (nenhuma regra de negócio formal ainda — as decisões de produto estão na §1.2 desta spec e na doutrina docs/doctrine/operacao-de-agentes.md)
---

# Spec Técnica 19 — Console de Agência (operação de N clientes)

> Capacidade nova, fora do escopo original do MVP (`00-prd-master.md` §4). Não existe sub-PRD
> dedicado. Mesmo padrão da spec 18: as decisões de produto foram tomadas com o dono do produto e
> estão registradas na §1.2. A lei que esta spec serve é
> [`operacao-de-agentes.md`](../doctrine/operacao-de-agentes.md).

---

## 1. Visão Geral

### 1.1 O que é

Uma superfície para **um operador servir N organizações clientes** a partir de uma instalação: ver
a carteira, saber se o agente de cada cliente está de pé, entrar no cliente com auditoria, aplicar
um modelo de agente e registrar o aceite antes de entregar.

**O que esta spec NÃO é.** Não é o CRM do cliente (isso já existe), não é faturamento e não é um
runtime de agentes novo. É a **camada de operação** que hoje só existe como procedimento manual
descrito nas skills `deskcomm-cliente-novo` e `deskcomm-metricas` — o trabalho de transformar esse
procedimento em produto.

**A restrição que define o desenho.** Quase tudo que o console precisa já existe no repo. Escrever
um subsistema novo aqui seria duplicação; a spec existe para **compor** o que já está de pé.

### 1.2 Decisões de produto fechadas

1. **Unidade de cobrança: retainer por cliente operado** (decisão do dono do produto,
   2026-09-13). Consequência direta: o trabalho imediato é **este console**, não um medidor de
   consumo. Cobro por consumo foi **rejeitado por ora** — exigiria construir medidor → fatura antes
   do primeiro real, e hoje não existe nenhuma tabela de plano, fatura ou assinatura no schema.
2. **O software permanece MIT e completo.** O que se cobra é a operação (invariantes 1 e 2 da
   doutrina). Nenhuma capacidade desta spec pode ficar atrás de pagamento para quem opera sozinho.
3. **A marca do cliente é do cliente.** O console opera em nome da agência, mas cada organização
   mantém a própria marca — `platform_branding` é da instalação, `organizations.settings.branding` é
   do cliente, e o gate de marca continua valendo.
4. **Entrar no cliente é ato auditado.** Não se cria um "modo deus": reusa-se a sessão de suporte já
   contratada em `docs/support-sessions.md`, com ator real e prazo.
5. **Pacote de agente é agente-modelo, não subsistema.** Não se inventa formato novo de configuração
   de agente; reusa-se o que `lib/ai/agents/duplicate.ts` já faz.
6. **A agência hospeda.** O console opera N organizações clientes numa instalação da agência — um
   tenant por cliente —, e **não** uma instalação por cliente com console local (decisão do dono do
   produto, 2026-09-13, sobre recomendação). É o que o modelo multi-tenant já suporta e o que a §4
   assume. Se um cliente exigir hospedar os próprios dados, o console deixa de ser remoto e passa a
   ser superfície local da instalação dele — isso é outra spec, não uma variação desta.

### 1.3 Posição na arquitetura

```
┌──────────────────────────────────────────────────────────────────────┐
│  Console de agência   app/admin/(protected)                          │
│  carteira · saúde do agente · custo vs teto · aplicar pacote · aceite │
└───────────┬──────────────────────────────────────────────────────────┘
            │ /api/v1/admin/*        (requirePlatformAdmin)
            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Já existente, reusado sem reescrita                                 │
│  support sessions (docs/support-sessions.md)  → entrar no cliente    │
│  lib/ai/agents/{publish,duplicate,escopo}.ts  → aplicar pacote       │
│  lib/ai/cost.ts + llm_calls/ai_invocations    → custo por cliente    │
│  lib/agent-engine/obs/metrics.ts + health/circuit.ts → saúde         │
│  lib/ai/budget/check.ts                       → teto por cliente     │
│  lib/branding/                                → marca do cliente     │
└──────────────────────────────────────────────────────────────────────┘
            │ RLS por organização (o console NÃO bypassa isolamento)
            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Organizações clientes (multi-tenant, RLS + invariantes em CI)       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Escopo

**Dentro:**

1. **Carteira** — uma tela que lista as organizações clientes com: modelo de agente publicado e sua
   versão, estado de saúde, custo do período contra o teto, se houve inbound recente, e a marca
   resolvida.
2. **Entrada auditada** — abrir a sessão de suporte de uma organização da lista, com o mesmo
   contrato de `docs/support-sessions.md`.
3. **Pacote de agente** — aplicar um agente-modelo a uma organização cliente, criando o agente do
   cliente a partir dele e registrando a origem.
4. **Aceite por cliente** — rodar a avaliação de um agente e registrar o resultado como condição de
   entrega; sem resultado registrado, o cliente aparece como "não entregue" na carteira.

**Fora (declarado de propósito):**

- Faturamento, planos, cotas e cobrança — ver decisão 1 da §1.2.
- Console de **revenda** (uma agência vendendo para outra) — se um dia existir, vira spec própria.
- Certificações, multi-região e idioma adicional — fora de escopo por decisão escrita no
  `docs/prd/00-prd-master.md` §7.4.
- Substituir, mover ou reescrever `lib/agent-engine/` — proibido pela §4 da doutrina.

---

## 3. Modelo de dados e reuso

Princípio: **tabela nova só quando não houver onde guardar.** O que existe e serve:

| Necessidade        | O que já existe                                                           | Ação                |
| ------------------ | ------------------------------------------------------------------------- | ------------------- |
| Listar clientes    | `organizations` + memberships + RLS                                       | nenhuma tabela nova |
| Agente por cliente | agentes já existentes por organização                                     | nenhuma tabela nova |
| Custo por cliente  | `llm_calls.cost_cents`, `ai_invocations`, agregados por `organization_id` | nenhuma tabela nova |
| Teto por cliente   | `lib/ai/budget/check.ts`                                                  | nenhuma tabela nova |
| Entrar no cliente  | sessões de suporte                                                        | nenhuma tabela nova |
| Marca do cliente   | `platform_branding` e `organizations.settings.branding`                   | nenhuma tabela nova |
| Pacote a aplicar   | `lib/ai/agents/duplicate.ts`                                              | nenhuma tabela nova |

**Proposta de schema (única peça que provavelmente exige migration):** o **registro de origem e de
aceite** — de qual agente-modelo um agente cliente nasceu, e qual foi o resultado da avaliação
(data, veredito, autor). Sem isso a carteira não consegue dizer "entregue" nem "de onde veio".

Se e quando essa peça for construída, ela segue a **tripla obrigatória** do repo: migration
versionada em `supabase/migrations/`, apêndice idempotente em `supabase/baseline.sql` e linha em
`supabase/migrations/MANIFEST.md`, com `lib/database.types.ts` regenerado. RLS na tabela nova, com
invariante de isolamento em `pnpm test:db`.

---

## 4. Superfície de API

Sob o guard de plataforma já existente, no segmento de administração de `app/api/v1/`:

| Rota proposta                                | Método | O que faz                                                              |
| -------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| `/api/v1/admin/portfolio`                    | GET    | Carteira: organizações com agente, saúde, custo, teto, inbound recente |
| `/api/v1/admin/portfolio/[orgId]/agent`      | GET    | Detalhe do agente de um cliente (versão, escopo, fontes)               |
| `/api/v1/admin/portfolio/[orgId]/package`    | POST   | Aplica um agente-modelo ao cliente e registra a origem                 |
| `/api/v1/admin/portfolio/[orgId]/acceptance` | POST   | Roda a avaliação e registra o veredito                                 |

Toda rota segue o padrão do repo: Zod valida o input, `requirePlatformAdmin` como guard,
`organization_id` de fonte confiável, `audit()` em toda mutação, resposta por `ok()`/`fail()`.

**Nenhuma rota usa service role sem filtro explícito de organização.** O console agrega N clientes,
e é exatamente aí que o vazamento cross-tenant nasce; o invariante de isolamento cobre o caminho.

---

## 5. Critérios de aceite

Todos observáveis por terceiro. "Está implementado" não é aceite.

1. **Carteira real.** Um operador abre a tela e vê **3 organizações** com agente publicado, cada uma
   com sua versão, custo do período e marca correta.
   _Prova:_ Playwright contra o app rodando, com 3 organizações semeadas — screenshot com as três.
2. **Saúde verdadeira.** Derrubar o agente de um cliente faz a linha daquele cliente mudar de estado
   na tela; os outros dois não mudam.
   _Prova:_ estado antes/depois na mesma sessão, sem refresh manual.
3. **Entrada auditada.** Abrir um cliente pelo console gera registro de sessão de suporte com o ator
   real (o operador), e o modo somente-leitura prevalece quando escolhido.
   _Prova:_ consulta ao audit log mostrando o ator correto, não o usuário do cliente.
4. **Pacote aplicado.** Aplicar um agente-modelo a um cliente cria o agente daquele cliente e a
   carteira passa a mostrar a origem.
   _Prova:_ diff do agente criado + registro de origem visível na tela.
5. **Isolamento mantido.** O usuário de um cliente **não** enxerga a carteira nem o agente de outro.
   _Prova:_ invariante em `pnpm test:db`, mais uma tentativa de acesso cruzado que devolve 403/404.
6. **Aceite registrado.** Sem avaliação registrada o cliente aparece como não entregue; com
   veredito, aparece entregue, com data e autor.
   _Prova:_ os dois estados na tela, e o registro no banco.
7. **Isso não quebrou nada.** `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` e `pnpm test:db`
   verdes.

---

## 6. Requisitos de harness

Uma tela nova tem obrigações que não são negociáveis neste repo:

- **Porta de navegação:** declarar a tela em `lib/navigation/registry.ts` (ou na allowlist com
  justificativa escrita) — `tests/unit/navegacao-completude.test.ts` reprova tela alcançável só por
  URL digitada.
- **Mapa de arquitetura:** representar a peça nova em `docs/architecture/` com pelo menos duas
  arestas, como o Living System Checklist exige.
- **Marca:** nada de nome de produto em código que alcança o usuário — `tests/unit/branding.test.ts`
  varre `app|components|lib|workers|hooks`.
- **Sem `console.log`:** log por `lib/logger.ts`.
- **Migrations:** tripla completa se houver tabela nova (§3).
- **Auditoria:** toda mutação do console emite `audit()`.

---

## 7. Aberto — decisões que esta spec NÃO toma

Não invente nenhuma destas; elas mudam o desenho e são do dono do produto:

1. **Preço e SLA.** Nenhum número existe em lugar nenhum do repo; o primeiro cliente real define.
2. **Limite da carteira.** Quantos clientes um operador deve conseguir ver sem paginação — a tela
   deve aguentar o número real, e esse número ainda não existe.

A decisão sobre **quem hospeda** saiu desta lista em 2026-09-13: está fechada na §1.2, item 6.
