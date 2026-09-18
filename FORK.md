# FORK.md — o módulo financeiro fora do upstream

Este fork carrega **uma coisa**: comanda, financeiro, comissão e fidelidade.
Tudo o mais é espelho do upstream (`melgarafael/DeskcommCRM`).

O módulo está fora do upstream por arquitetura, não por qualidade. **A razão
mudou em 17/09/2026 e ficou menor** — leia "O caminho de saída" antes de
planejar qualquer coisa de longo prazo aqui.

## Remotes

| Nome | Aponta para |
|---|---|
| `origin` | upstream, `melgarafael/DeskcommCRM` — **nunca receba push** |
| `fork` | `423313/DeskcommCRM` — é para cá que vai o seu trabalho |

## Branches

- `fork/financeiro` — a única branch de trabalho. Todo o módulo vive nela.
- Não mantenha a pilha de sete branches empilhadas: ela multiplicava por sete o
  custo de cada sync, e os PRs upstream já registram a história fatiada.

## O ciclo

```bash
bash scripts/fork-setup.sh   # uma vez por árvore
bash scripts/fork-sync.sh    # quando houver MOTIVO — ver abaixo
```

**Sincronize por gatilho, não por calendário.** Este arquivo mandava sincronizar
toda semana, e a régua estava errada: media o volume do upstream (~2.500 commits
por mês) em vez do que de fato chega até você. Os três gatilhos:

1. **Antes de publicar qualquer versão** — a VPS recebe o que você publicar, e
   publicar de uma base velha é entregar bug que o upstream já consertou.
2. **Quando houver correção do upstream que te interessa** — você leu o
   changelog e quer aquilo.
3. **Teto de segurança: não deixe passar de ~200 commits.** Acima disso o merge
   deixa de ser leitura e vira arqueologia.

**O custo real, medido em 17/09/2026:** um sync de **169 commits** (mais de um
mês de upstream) produziu **dois** conflitos para resolver na mão, ambos de um
minuto — uma lista de exceções em que os dois lados acrescentaram um item, e um
arquivo que o upstream apagou de propósito. Todo o resto foi automático. Se um
sync seu custar muito mais que isso, algo mudou de forma e vale investigar em
vez de empurrar.

## As três convenções que evitam quase toda a dor

1. **Migration do fork usa a faixa `9001+`.** O upstream produz ~5 migrations por
   dia e já passou de `0271` — qualquer número baixo colide. A faixa alta nunca
   colide e deixa óbvio no diff o que é seu.

2. **`supabase/baseline.sql` é DERIVADO: não edite.** O que é seu mora em
   `supabase/fork-apendice.sql`. O `fork-sync.sh` regenera o baseline como
   *upstream puro + apêndice*. Editar o baseline direto ressuscita o conflito de
   900 linhas que essa separação existe para matar.

3. **Escreva sempre no FIM** de `lib/audit/actions.ts`, `lib/i18n/dicionario.ts` e
   `supabase/migrations/MANIFEST.md`. O `fork-setup.sh` marca os três como
   `merge=union`, e o git passa a resolvê-los sozinho — mas só funciona se os dois
   lados acrescentarem no fim.

## O fork publica as próprias imagens

A VPS puxa três imagens: `deskcommcrm`, `deskcomm-worker` e `deskcomm-scheduler`.
Enquanto elas vinham do upstream, a VPS não tinha o financeiro — **as telas nunca
estiveram no ar até a primeira publicação do fork**, em 17/09/2026. Os dados
estavam no banco; a imagem que os lia, não.

- **Namespace:** `ghcr.io/423313`. A fonte é `IMG_NS` em
  `hostgator-setup-kit/_common.sh`; quem vigia os outros lugares (compose,
  `.env.hostgator.example`, `REPO_URL`, os `LABEL` dos Dockerfiles) é
  `tests/unit/namespace-das-imagens.test.ts`. Ele **conflita a cada sync** em que
  o upstream o edite — resolva ficando com o valor do fork nas duas constantes.
- **A `main` do repo `423313` é o fork.** O job `a-tag-veio-da-main` do
  `publish-image.yml` só publica tag contida na `main` do próprio repositório.
  Trabalhe em `fork/financeiro`; publique com `git push fork fork/financeiro:main`.
- **Versão em CalVer: `v2026.9.1`, `v2026.9.2`, `v2026.10.1`.** Não use hífen
  (`ultima_versao_publicada` descarta como pré-release) nem quarto segmento
  (`type=semver` do metadata-action não emite tag). CalVer é semver válido e
  ordena acima de qualquer `v1.x` do upstream que sobre no clone. A versão do
  upstream de origem vai **no corpo da tag** (`git tag -a ... -m "base: ..."`).
- **Pacote novo no GHCR nasce privado.** Torne os três públicos depois da primeira
  publicação, senão o `pull` da VPS é negado sem dizer por quê. Confira com
  `ghcr_status` do `_common.sh`: quer `200` nas três.
- **O fork não corta CHANGELOG.** `scripts/cortar-release.ts` deriva o número do
  CHANGELOG e tem o repo do upstream cravado. `pnpm release:conferir` fica só
  como linter dos fragmentos em `.changes/`, que continuam sendo escritos: são o
  material do dia em que o módulo voltar ao upstream.

## Atualizar o Studio (o runbook inteiro)

Atualizar é raro e acontece em sessão. Quatro passos, nesta ordem; se um
falhar, não passe ao seguinte.

```bash
# 1. aqui, no worktree do fork — trazer o upstream e provar
bash scripts/fork-sync.sh && pnpm install && pnpm typecheck && pnpm test:unit && pnpm test:db

# 2. aqui — publicar (a main do repo 423313 É o fork; a tag é CalVer)
git push fork fork/financeiro:main
git tag -a v2026.M.N -m "base upstream: vX.Y.Z" && git push fork v2026.M.N

# 3. aqui — esperar o CI e conferir que as três imagens existem e são públicas
source hostgator-setup-kit/_common.sh
ghcr_status deskcommcrm 2026.M.N; ghcr_status deskcomm-worker 2026.M.N; ghcr_status deskcomm-scheduler 2026.M.N   # quer 200 ×3

# 4. na VPS — atualizar, conferir, guardar o resgate
bash hostgator-setup-kit/update.sh
bash scripts/fork-doutor.sh
cp supabase/fork-apendice.sql /root/fork-apendice.sql
```

**Se o financeiro sumir depois de um update**, quem diz é o `fork-doutor.sh` —
**não confie em HTTP sem login**: o proxy responde 307 em `/app/*` e 401 em
`/api/*` para qualquer rota, exista ou não (medido em 17/09/2026). A sonda que
vale é de dentro do contêiner: `.next/server/app/app/comandas/page.js` existe se
e só se a imagem tem o módulo. O resgate é uma linha: as três `*_IMAGE` do `.env` de volta para
`ghcr.io/423313/...:2026.M.N` e `docker compose ... up -d`. Depois confira o
`origin` do clone e apague qualquer tag `v1.*` que tenha voltado. Os dados nunca
saem do lugar: estão no Supabase, e nenhum caminho do update os toca.

**Quando a issue #1114 do upstream fechar**, o caminho muda: consolidar no PR
#819 com os seis incorporados, no formato que o mantenedor pediu. Aí este fork
deixa de ser residência.

## O que NÃO vale a pena consertar

Medido em 17/09/2026, para você não gastar uma tarde onde não dói:

- **`lib/database.types.ts` não precisa ser extraído.** O fork acrescenta 590
  linhas e remove 1, num arquivo de 9.452. O upstream o tocou 8 vezes em 169
  commits e o merge foi **automático**, sem conflito. Separar os tipos do
  financeiro num arquivo próprio é trabalho real para pagar uma dor que não
  existe.
- **O enxerto da agenda não precisa virar tabela do fork.** Pôr
  `default_price_cents` no tipo de evento toca quatro arquivos do upstream, mas
  com poucas linhas cada, e esses arquivos foram tocados 0 e 2 vezes no mesmo
  período.

## O que o git NÃO vai avisar

Conflito de texto é o problema fácil, e o esqueleto já o resolve. O que quebra um
fork longo é **mudança de contrato** no upstream: uma tabela que você referencia
muda de forma, `ok()`/`fail()` mudam de assinatura, a RLS troca de helper. O
merge fica verde e o código fica errado.

Quem pega isso é `pnpm test:db` — o único gate que aplica o `baseline.sql` num
Postgres real. Rode-o em todo sync, não só quando mexer em schema.

**Uma dívida que este fork assumiu de propósito:** a migration 9014 dá
`grant execute` em `fn_situacao_conta_como_atendimento(text)` para
`authenticated`, que o upstream revogou. A alternativa era copiar a régua de
"conta como atendimento" para dentro do fork, criando a segunda cópia que a
0262 existe para evitar. O risco não é o privilégio — a função é `immutable` e
pura —, é o dia em que o upstream escrever um invariante afirmando que ela NÃO
é executável por `authenticated`: o `test:db` fica vermelho por um motivo que
ninguém associa a esta linha. Está escrito aqui para esse dia.

**Depois de todo sync, rode `pnpm install` antes dos gates.** O upstream adiciona
dependência sem avisar, e o sintoma engana: em 17/09 o `jsonc-parser` novo fez o
typecheck falhar e dez arquivos de teste ficarem vermelhos, o que lê como "o
merge quebrou o mundo" e era só um pacote faltando.

## O caminho de saída

**A premissa que criou este fork caiu em 17/09/2026.** Este arquivo dizia que o
módulo só entraria "quando existir instalação de banco independente por extensão
(issue #792)". A [`docs/adr/0002-tabelas-de-modulo-num-banco-so.md`](docs/adr/0002-tabelas-de-modulo-num-banco-so.md),
aceita nessa data, **recusa banco independente por escrito e para sempre** —
chave estrangeira não atravessa bancos, e as tabelas do financeiro têm 23 chaves
para o núcleo. A barreira não foi removida: foi trocada por outra, menor e
definida.

O que vale hoje, e é preciso ler na fonte antes de agir:

- **O financeiro é duas metades.** [`docs/doctrine/extensoes.md`](docs/doctrine/extensoes.md)
  classifica o **caixa** (contas, formas de pagamento, plano de contas,
  lançamento avulso) como **núcleo, já liberado**; e **comanda, comissão e
  fidelidade** como o que fica em cima, opcional. Só a segunda metade tem razão
  de morar aqui.
- **A v1 de extensões não serve** para este módulo, e não é perto: um pacote de
  extensão é um JSON de até 64 KiB que publica cards de texto, sem SQL, sem
  rotas, sem telas, sem cron. Não tente encaixar o financeiro nela.
- **O caminho real é a ADR-0002**, ainda **não construída**: tabelas de módulo
  criadas por uma função `fn_<modulo>_provisionar()`, `security definer`, só
  `service_role`, disparada ao instalar o módulo. A própria ADR diz que **o
  primeiro módulo a usá-la é a comanda** — este aqui.
- **A ADR resolve tabelas, não o resto.** As rotas, as telas e o cron
  continuam sendo código do produto, revisado PR a PR. Mesmo depois dela, o fork
  não desaparece sozinho.

Enquanto isso não for construído, o fork é a residência do módulo. Quando for,
ele deixa de ser residência e vira etapa.
