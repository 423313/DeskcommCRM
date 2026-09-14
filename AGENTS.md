# AGENTS.md — DeskcommCRM

> Contrato para **qualquer** agente de código (Codex, Cursor, Copilot, Amp, Claude Code).
> Este arquivo é o núcleo portável. A **doutrina completa e não-negociável vive em
> [`CLAUDE.md`](CLAUDE.md)** — leia-o antes de tocar em código. Aqui está o mínimo
> para não causar dano.

---

## Objetivo do projeto

Sistema operacional de vendas open source com agentes de IA nativos, multi-nicho,
WhatsApp como canal primário (via WAHA). Multi-tenant com RLS desde o dia 1, LGPD
nativa. Monetização = self-host em VPS, não assinatura. Posicionamento: [`VISION.md`](VISION.md).

**Consequência que muda como você trabalha:** o produto é distribuído como código.
Quem instala numa VPS **é** o usuário. Uma mudança que funciona na máquina do dev e
quebra no clone fresco é um bug de produto, não um detalhe de ambiente.

## Stack (CONFIRMADO em `package.json`)

Next.js 16 (App Router) · React 19 · TypeScript 6 estrito · Tailwind 4 ·
shadcn/ui · Supabase (Postgres + Auth + Realtime + Storage) · Upstash Redis ·
Vercel AI Gateway (`@ai-sdk/anthropic|openai|google`) · WAHA 2026.7.2 (engine NOWEB; sem bloqueio por tier) ·
Zod 4 · Vitest 4 · Playwright 1 · Sentry 10.

Só a **major**, de propósito: é onde o idioma muda, e é o que
`tests/unit/agents-md-versoes.test.ts` verifica contra o `package.json`. Declarar a minor
aqui fazia todo bump do Dependabot reprovar o `verify` (5 dos 8 pacotes) e não cobria nada
que a major já não cobrisse — issue #235. Para a versão exata, `package.json` é a fonte.

Runtime: **Node ≥22** (`.nvmrc` = 22; os quatro workflows fixam `node-version: 22` —
`ci` ×2, `perf`, `e2e`). Gerenciador: **pnpm 9.15.9** (`packageManager`).
Versão do produto: **não está escrita aqui, de propósito.** Esta linha afirmava `1.0.0` até a
v1.6.0 — seis minors de atraso, e nenhum teste a vigiava. Afirmação de versão envelhece a cada
release; comando não. A que está publicada agora:

```bash
git ls-remote --tags --refs origin 'refs/tags/v*' \
  | sed 's#.*refs/tags/v##' | awk '!/-/' | sort -V | tail -1   # awk, nao grep -v -- '-':
                                                                # em maquina com ugrep aquele nao roda
```

O `package.json` **não** é a fonte da versão do produto (segue em `0.1.0`, e é assim de
propósito). A fonte é a tag `v*` mais a seção do `CHANGELOG.md` — que é tela de produto, lida
pelo dono da VPS. Como o número é decidido: [`docs/doctrine/versionamento.md`](docs/doctrine/versionamento.md).

## Estrutura que importa

| Path | O quê |
|---|---|
| `app/api/v1/` | Route handlers REST (versionado por path) — **reconte, não cite**: `git ls-files 'app/api/v1/**/route.ts' \| wc -l` (e `git ls-files 'app/api/**/route.ts' \| wc -l` para o total de `app/api/**`) |
| `app/api/internal/`, `app/api/mcp/`, `app/api/v1/cron/` | superfícies não-cookie (secret/bearer próprio) |
| `app/app/` | UI autenticada do tenant · `app/admin/` UI de plataforma |
| `app/actions/` | Server Actions (auth, onboarding, team, settings) |
| `lib/agent-engine/`, `lib/ai/` | runtime do agente, guardrails, RAG, dispatcher |
| `lib/api/wrappers.ts` | `ok()` / `fail()` — **use sempre**, não monte Response na mão |
| `lib/auth/require-role.ts` | `requireRole()` — guard canônico de RBAC |
| `lib/supabase/{browser,server,admin}.ts` | clients canônicos |
| `workers/` | workers de `event_log` + crons |
| `supabase/migrations/` | schema versionado · `supabase/baseline.sql` = o que o self-host aplica |
| `proxy.ts` | middleware do Next 16 (auth de borda, `X-Request-Id`) |

## Comandos (CONFIRMADO em `package.json`)

```bash
pnpm install          # deps (frozen-lockfile no CI)
pnpm dev              # dev server
pnpm build            # next build
pnpm lint             # eslint
pnpm typecheck        # tsc --noEmit (estrito)
pnpm test:unit        # vitest — EXCLUI tests/invariants, tests/e2e e tests/journeys (lista viva em vitest.config.ts → exclude)
pnpm test:db          # invariantes de banco + gate do baseline (PRECISA de Docker)
pnpm test:e2e         # Playwright (PRECISA de app rodando + banco semeado)
pnpm gov:verify       # typecheck + lint + lint:channels + lint:role-rank + test:unit
                      # ← verificação única atual; o encadeamento real sai de:
                      #   node -e "console.log(require('./package.json').scripts['gov:verify'])"
```

⚠️ **`pnpm gov:verify` NÃO cobre tudo.** Ele omite `test:db` e `test:e2e`. Se sua
mudança toca schema, RLS ou UI, `gov:verify` verde **não** é prova — rode `pnpm test:db`
(exige Docker) e/ou `pnpm test:e2e` você mesmo. Ver [`docs/harness-audit.md`](docs/harness-audit.md).

**O que o CI cobre.** `.github/workflows/ci.yml`: `verify` = os passos do job, na ordem —
typecheck, lint, `lint:channels`, `test:unit` e `test:shell` hoje, e `pnpm lint` sozinho **não**
cobre os dois últimos (liste em vez de acreditar nesta linha:
`awk '/^  verify:/,/^  invariants:/' .github/workflows/ci.yml | grep -A1 'name:'`);
`invariants` = `pnpm test:db` (isolamento RLS + invariantes de governança contra Postgres
efêmero pg15). `.github/workflows/perf.yml`: `build-and-size` = `pnpm build`.
`.github/workflows/e2e.yml` roda as specs Playwright contra um Supabase local de verdade com
o `baseline.sql` aplicado — o mesmo banco que o self-hoster tem. **É check obrigatório** — a
data de ativação não é auditável pelo repositório, e a lista viva está logo abaixo, com o
comando ao lado. **Não há número aqui de propósito**: esta linha já afirmou uma contagem exata
de specs e "a única de fora", e as duas envelheceram — a suíte cresce toda semana e a lista de
exceções muda com ela. Quem fica de fora é o que a própria variável declara; leia, não confie:

```bash
git show origin/main:.github/workflows/e2e.yml | grep -A4 'FORA_DO_CI:'
```

O que continua verdade e é o que importa: `vps-fresh-onboarding` está entre elas (WAHA + Redis
+ Resend + Nuvemshop) e é a **P0** da doutrina de QA — ou seja, `e2e` verde não prova a jornada
de instalação fresca. `followup-journey`, `webhooks` e `capacidades-do-agente` estiveram fora e
**voltaram**: rodam hoje (`e2e.yml`, listas `SPECS_PARTE_*` — são três desde 2026-09-07).

`.github/workflows/publish-image.yml`: `imagens-ok` = as três imagens Docker constroem. **Obrigatório
desde 2026-08-13.**

**Os cinco são checks obrigatórios** na branch protection da `main` — medido em 2026-08-14 @ `741c4ec8` (o comando exige permissão de **admin** no repositório: com token de contribuidor ele devolve `404`, medido em 2026-09-13):

```console
$ gh api repos/melgarafael/DeskcommCRM/branches/main/protection --jq '.required_status_checks.contexts|join(", ")'
verify, build-and-size, invariants, e2e, imagens-ok
```

> Este bloco estava errado em quatro pontos até 2026-08-14 (dizia "três checks", "28 das 32
> specs", "e2e não é obrigatório ainda" e listava como excluídas três specs que já rodavam).
> A pior era a do `e2e`: quem lesse mediria um PR contra a régua errada. **Reconte antes de
> citar** — `ls tests/e2e/*.spec.ts | wc -l` e o comando acima.

## Padrões de código (observados no repo, não inventados)

- **Route handler:** valida input com Zod → guard (`requireRole` / `requirePlatformAdmin` /
  secret) → query com `organization_id` explícito → `audit()` se mutação → `ok()` / `fail()`.
- Erro: `fail(code, message, status)` com código de `lib/api/errors.ts`. Nunca `throw` cru na borda.
- JSON **snake_case** na API. Dinheiro em `_cents` + `currency`. Datas ISO-8601 UTC.
- Log: `lib/logger.ts` (estruturado). **`console.log` é proibido** em código merged.
- Testes ao lado do código (`lib/foo/bar.test.ts`) ou em `tests/{unit,api,invariants,e2e}/`.
- Comentários em PT-BR são a norma neste repo — mantenha o idioma do arquivo que editar.

### Marca própria (white-label) — o produto é revendido, e o nome não é seu

- **Nunca escreva "Deskcomm"/"DeskcommCRM" em código que alcança o usuário.** `tests/unit/branding.test.ts` varre `app|components|lib|workers|hooks` e reprova; a allowlist **só encolhe**.
- A marca resolve do **banco** (`platform_branding` para a instalação, `organizations.settings.branding` para a organização). `APP_NAME`/`APP_LOGO_URL`/`APP_ACCENT_HEX` no `.env` são **semente e piso de rollback**, não a fonte.
- Precisa da marca **fora do DOM** (e-mail, remetente, ícone, `issuer` do MFA)? Use `marcaDaSaida()` de `lib/branding/saida.ts` — um hex e uma frente legível, tema claro. Nunca entregue `MarcaResolvida` a um template de e-mail.
- Resolvedor de marca **nunca lança**: ele roda em `app/layout.tsx`, e um throw ali é 500 em todas as telas.
- **O PDF de LGPD não leva marca** — ele nomeia o controlador (`organizations.legal_name`) e o DPO. Isso é decisão, não omissão; há gate no mapa de arquitetura.
- Contexto de venda em `docs/white-label.md`; mapa em `docs/architecture/marca-propria.architecture.json`.

## Diretórios e arquivos SENSÍVEIS

- **`supabase/baseline.sql`** — é o que o `install.sh`/`update.sh` do self-host aplicam.
  Toda mudança de schema tem que aparecer aqui **como apêndice idempotente**, senão
  não chega em quem instalou. Ver doutrina de Migrations em `CLAUDE.md`.
- **`supabase/migrations/*.sql` já aplicadas** — nunca edite. Corrija com migration nova.
- **`lib/supabase/admin.ts`** — service role **bypassa RLS**. Boa parte dos handlers de
  `app/api/**` o usa — reconte em vez de citar:
  `grep -rl createAdminClient app/api --include='route.ts' | wc -l` contra
  `git ls-files 'app/api/**/route.ts' | wc -l`. Toda query precisa filtrar
  `organization_id` manualmente, resolvido de fonte confiável
  (cookie/JWT/webhook secret/path token), **nunca do body**.
- **`lib/auth/public-paths.ts`** — adicionar path aqui remove a checagem de auth de borda.
  Só com guard próprio dentro da rota.
- **`.env*`** — não abra, não copie valor, não logue. Só `.env.example` é template.
- **`docker-compose.traefik.yml`** — numa VPS que já tem proxy reverso próprio
  (Hostinger, Coolify, Dokploy…), é o único lugar que dá ao contêiner `app` as labels
  de roteamento. Todo `up -d` leva os **dois** arquivos de compose:
  `docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml --env-file .env up -d app`.
  Esquecer o segundo `-f` recria o contêiner sem labels: o proxy deixa de enxergá-lo e o
  domínio inteiro responde `404`, com o contêiner `healthy` — o healthcheck é um probe TCP
  interno e não sabe nada de roteamento. Runbook: `docs/runbooks/deploy.md`.

## Arquivos GERADOS — não editar à mão

- `lib/database.types.ts` (gerado do schema Supabase — o tamanho de hoje sai de `wc -l lib/database.types.ts`)
- `graphify-out/` (grafo de conhecimento local; ignorado pelo git e **ausente num clone fresco** — só existe depois de rodar `/graphify .`)
- `pnpm-lock.yaml`, `tsconfig.tsbuildinfo`, `next-env.d.ts`, `.next/`

## Como validar uma alteração

1. `pnpm typecheck` e `pnpm lint` zerados.
2. `pnpm test:unit` verde.
3. Tocou schema/RLS/tabela tenant-aware → `pnpm test:db` (sobe Postgres efêmero via Docker,
   aplica `baseline.sql` em modo install **e** update, roda os invariantes).
4. Tocou UI ou fluxo de usuário → `pnpm test:e2e` com evidência visual. **`curl` não conta**
   como prova de UX (doutrina de QA Visual em `CLAUDE.md`).
5. Mudou schema → migration versionada em `supabase/migrations/` **+** apêndice idempotente
   em `supabase/baseline.sql` **+** linha em `supabase/migrations/MANIFEST.md`. Os três juntos.
6. Criou função em `public` → `revoke execute on function ... from public, anon;` e depois
   `grant` só a quem precisa. São **duas** origens de `EXECUTE` e revogar uma só deixa a
   função exposta como RPC alcançável pela anon key. Detalhe em `CLAUDE.md`, item 9 da
   doutrina de Migrations.

## Testes existentes (CONFIRMADO)

Cada linha abaixo traz o comando que a mede — **rode o comando em vez de citar número**. Este
bloco já foi datado num SHA uma vez e não funcionou: os itens envelhecem em ritmos diferentes, e o
cabeçalho passava a mentir por todos eles.

- Arquivos de teste em `tests/unit/` (`git ls-files 'tests/unit/*.test.ts' 'tests/unit/*.test.tsx' | wc -l`). O total do repositório sai de `git ls-files '*.test.ts' '*.test.tsx' | wc -l` — a diferença vive junto ao código, fora de `tests/`, e também roda em `test:unit`.
- Arquivos de invariante de banco em `tests/invariants/` — RLS/isolamento cross-tenant, RBAC,
  governança (G1–G6). Excluídos do `test:unit` de propósito; rodam via `pnpm test:db` **e no job
  `invariants` do CI**. Quantos: `git ls-files 'tests/invariants/*.test.ts' | wc -l`.
- Specs Playwright em `tests/e2e/`, quase todas no CI (via `e2e.yml`, **obrigatório**). As que
  ficam de fora estão declaradas em `FORA_DO_CI`, **com o motivo escrito ao lado**. Esta linha
  já afirmou "menos uma" depois de deixarem de ser uma — por isso não conta mais. A issue #63,
  que originou a discussão, está **fechada** e o título dela descreve um estado que já não vale.
  Quantas existem: `ls tests/e2e/*.spec.ts | wc -l`. Quantas ficam fora:
  `git show origin/main:.github/workflows/e2e.yml | grep -A4 'FORA_DO_CI:'`.

> **Os dois números saíram daqui, e é decisão, não descuido.** Estavam em 102 e 46/45 quando o
> medido era 114 e 51/50 — envelheceram porque toda entrega que acrescenta um teste os falsifica,
> e nenhum gate lê prosa. Onde a afirmação pode virar comando, ela vira: comando não envelhece.
> O que continua vigiado por gate é o que importa — `tests/unit/e2e-cobertura-completa.test.ts`
> reprova toda spec nova que não esteja em `SPECS_PARTE_*` ou em `FORA_DO_CI` com motivo escrito.

## Limitações conhecidas

Cada item abaixo carrega o comando que o mede — item sem comando é suspeito de estar podre,
e a régua da casa é medir antes de repassar. Datar o bloco inteiro num SHA foi abandonado: os
itens envelhecem em ritmos diferentes, e o cabeçalho passava a mentir por todos eles.
(O SHA `789dfa6`, que ficava aqui, ficou para trás — meça com
`git rev-list --count 789dfa6..origin/main`.)

- **As specs E2E fora do CI são exatamente as declaradas em `FORA_DO_CI`** — hoje
  `vps-fresh-onboarding` é a P0 entre elas —, e o `e2e` **é** check obrigatório. Ou seja: um PR
  que quebre o `e2e` não entra — mas a jornada de
  instalação fresca, que é o produto que se vende, continua sem gate. Se você mexeu nela, a
  prova é sua. O número e a contagem que ficavam aqui eram de uma fotografia de agosto, e o
  disco já tinha mudado desde então.
- Rate limit HTTP: `lib/auth/rate-limit.ts` cobre **login, signup, recuperação de senha e
  aceite de convite** (contando por IP **e** por identificador hasheado); `checkRateLimit` cobre
  o webhook de captação e o dispatcher de IA. **Crons e MCP seguem sem.** Meça antes de agir:
  `grep -rln 'authRateLimited\|checkRateLimit(' app lib --include='*.ts' --include='*.tsx'`.
  Esta linha dizia "existe em 2 pontos; login e signup estão sem" — era o estado anterior à
  issue #64, e o `docs/threat-model.md` ainda carrega a versão velha, com nota de reauditoria.
- Fallback do rate limit é **em memória** — mas o gatilho não é "sem Upstash": `lib/env.ts`
  declara as duas variáveis do Upstash como `required()` e o app não sobe sem elas
  (`grep -n UPSTASH lib/env.ts`). O que cai para a memória é Redis **inalcançável** com a
  variável presente, e aí o limite passa a ser por processo.
- `Idempotency-Key` é lido por **4** rotas e o contrato promete nos POSTs de criação. Há duas
  implementações com recibo (`lgpd/requests/[id]/approve` e `admin/tenants`) e, desde este
  commit, uma reutilizável em `lib/api/idempotency.ts`, aplicada em `message-templates`.
  Reconte antes de citar: `grep -rln 'Idempotency-Key' app/api/v1 --include='route.ts'`.
  **A corrida entre duas requisições simultâneas com a mesma chave segue aberta** —
  `idempotency_keys.status_code` e `.response_body` são `NOT NULL`, então não há onde gravar
  "em curso"; fechar exige mudança de schema. Ver issue #778.
- **`.env.example` está completo** — medido em 2026-08-14: das 45 chaves de `lib/env.ts`, a
  única ausente é `NODE_ENV`, que não é configuração do operador. Esta linha dizia que faltavam
  6, "incluindo 3 secrets"; os três (`IMPERSONATE_COOKIE_SECRET`, `INTERNAL_CRON_SECRET`,
  `LGPD_SIGNING_KEY`) estão lá. Se você adicionar env var, adicione nos dois lugares (item 9 do
  DoD) — a regra continua valendo, o que caiu foi a dívida.
- `lib/auth/invite-token.ts` cai em `"dev-fallback"` como secret HMAC se nenhum secret existir
  (inalcançável em produção, porque `INTERNAL_SECRET` é obrigatório e derruba o boot).
- **Boa parte dos handlers de `app/api/**` usa service role** — reconte:
  `grep -rl createAdminClient app/api --include='route.ts' | wc -l` contra
  `git ls-files 'app/api/**/route.ts' | wc -l`. Não há gate automático para o filtro de
  `organization_id`. Escrevendo handler novo, o filtro é responsabilidade sua.
- Detalhes e prioridade: [`docs/harness-audit.md`](docs/harness-audit.md),
  [`docs/current-state.md`](docs/current-state.md) e [`docs/threat-model.md`](docs/threat-model.md).

## Regras de segurança

- Sempre `getUser()` no backend. **Nunca `getSession()`** (confia no cookie sem revalidar).
- API key/token **nunca** em query string — só header. Plaintext do bearer é mostrado
  **uma vez**; no banco só hash SHA256.
- HMAC de webhook com `crypto.timingSafeEqual`. Fail-closed quando o secret falta.
- Nunca logue segredo, token, CPF, telefone ou e-mail. Sentry tem `beforeSend` que
  higieniza — não confie nele como única camada.
- Não commite screenshot/dump com dado real de cliente.

## Packaging — se você tocou `Dockerfile*`, `docker-compose*.yml` ou `hostgator-setup-kit/`

Lei completa em [`docs/doctrine/packaging.md`](docs/doctrine/packaging.md). O não-negociável:

- **Nenhum serviço de `docker-compose.prod.yml` constrói na máquina do cliente.** Todo serviço
  declara `image:` de uma imagem publicada; `build:` só existe **ao lado**, como escape.
  Serviço `build:`-only é pulado por `docker compose pull` e imune a `up -d` sem `--build` —
  ele não é só caro de instalar, ele **nunca é atualizado**.
- **Publicação é ato do CI**, nunca da sua máquina: build ARM local não roda na VPS amd64.
- **Instalação de cliente aponta para número de versão**, nunca para tag móvel. Aqui `latest`
  significa **topo da `main`**, não última release — quem quer a última release usa `stable`.
- **Dependência upstream é referenciada com tag fixa, nunca republicada** (WAHA é licenciado).
- **Bump de versão não pode exigir que o operador da VPS edite arquivo à mão.**

`pnpm test:shell` é o único gate que exercita o kit. Rode-o.

## Critério de conclusão

Vale a **Definition of Done em [`CLAUDE.md`](CLAUDE.md)** — conte lá em vez de confiar num número aqui (`sed -n '/^## Definition of Done/,/^Um staff engineer/p' CLAUDE.md | grep -cE '^[0-9]+\. '`; esta linha já disse 15 e o DoD tem 16). A régua tem que DELIMITAR a seção: a primeira versão desta linha oferecia `grep -c '^[0-9]\+\. \*\*' CLAUDE.md`, que devolve **25** — casa toda linha numerada em negrito do arquivo (anti-patterns, packaging, higiene de branches, migrations) e perde os itens 1–10 do próprio DoD, que não são negrito. Trocar o número pelo comando só ajuda se o comando responder à pergunta. Não declare pronto
sem: typecheck/lint zerados, testes relevantes verdes, RLS testada se tocou tabela
tenant-aware, migration + baseline + MANIFEST se mudou schema, prova visual se mudou UI, e a
regra de packaging acima se mudou o artefato que o self-hoster instala.

## Guias do assistente (skills embutidas)

O repositório embute guias em `.agents/skills/` — lidos por Codex, Cursor, OpenCode e
Antigravity; o Claude Code lê o espelho em `.claude/skills/` (`pnpm skills:sync` regrava, e
`tests/unit/skills-embutidas.test.ts` reprova divergência). Carregue o guia quando o pedido
casar, mesmo que a pessoa não saiba que ele existe:

| situação | guia |
|---|---|
| instalar, atualizar ou consertar a instalação numa VPS; domínio, Supabase, WhatsApp que não conecta | `deskcomm-instalar` |
| configurar o CRM para um cliente ou nicho: agentes, roteadores, follow-ups, base de conhecimento | `deskcomm-cliente-novo` |
| desempenho, conversão, custo de IA, funil, relatório | `deskcomm-metricas` |
| o agente responde errado, passa tudo para humano, não usa a agenda; melhorar o prompt | `deskcomm-prompt` |
| contribuir: corrigir bug, abrir ou atualizar PR, migration, conflito com a `main` | `deskcomm-contribuir` — que fica quieto quando `bash .agents/skills/deskcomm-contribuir/scripts/quem-sou.sh` responde `mantenedor` |
| escrever ou revisar código aqui | `deskcomm-doutrina` (as três regras que mais custam) e `sistema-vivo` (o gate de arquitetura) |

## Regra final — não invente

Este repositório tem PRDs, specs, regras de negócio e doutrina escritos
(`docs/prd/`, `docs/specs/`, `docs/business-rules/`, `docs/doctrine/`).
**Nunca invente regra de negócio, número, SLA ou comportamento de produto.**
Se a regra não está escrita, diga que não está e pergunte — não preencha a lacuna com
suposição plausível. Ao documentar, marque o que é `CONFIRMADO` (provado por código) e o
que é `INFERIDO`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
