#!/usr/bin/env bash
# Prova de que os guards de commit do gov-loop (loop/hooks/) não acusam o AUTOR por
# trabalho que chegou de um MERGE DA MAIN — e de que a guarda real continua de pé.
#
#   bash tests/shell/hooks-nao-acusam-a-main.test.sh
#
# Cada caso monta um repositório git DESCARTÁVEIS e sem rede: um "principal" local faz o
# papel da main e o `git clone` dá um `origin/main` de verdade (é isso que torna o teste
# independente do checkout raso do CI, onde a ref do repo não existe). Nada aqui toca o
# clone de quem roda.
#
# A CLASSE sob prova: um hook que julga `git diff --cached` sem excluir o que já é
# alcançável por `origin/main` acusa o autor pelo que veio da main. Um merge LIMPO não
# chama hook nenhum; um merge com CONFLITO passa por `git commit`, e aí o pre-commit roda
# sobre o índice INTEIRO do merge. Medido em 18/09/2026 em três guards irmãos:
# check-migration-triple.sh (PR #1179), freeze-invariants.sh e validate-features.sh
# (casos 4/5 da issue #1161).
#
# O que está sob prova, hook por hook:
#
#   freeze-invariants.sh — o eixo é PROCEDÊNCIA: o que o OUTRO LADO DO MERGE mudou
#        (`:<p>` == `MERGE_HEAD:<p>` **e** `MERGE_HEAD:<p>` != `merge-base:<p>`).
#     1. o FALSO POSITIVO morreu: invariante que o merge trouxe não é acusado — nem quando
#        o merge o MODIFICA (caso B) nem quando ele o RENOMEIA (caso REN-LEGIT).
#     2. a GUARDA REAL continua inteira, e este é o ponto: editar invariante com conteúdo
#        PRÓPRIO segue bloqueado — inclusive escondido DENTRO do merge da main, que é o
#        disfarce mais fácil depois de relaxar o hook.
#     3. DELETE segue acusado, ADIÇÃO segue liberada (é a regra declarada no cabeçalho do
#        hook) e a válvula segue funcionando.
#     4. e os dois eixos mais SIMPLES furam, cada um com o seu caso aqui:
#        · existência de CAMINHO (`git cat-file -e origin/main:$p`, a forma do guard de
#          migration): o invariante existe na main tanto quando a main o trouxe quanto
#          quando a branch o reescreveu → caso B+.
#        · identidade de CONTEÚDO contra `origin/main` (a forma anterior deste arquivo):
#          também é verdade quando a sessão REVERTE o invariante para a versão da main,
#          que é autoria → casos R1 e R1-LIMPO. E ela julgava só o `$3` da linha `R`,
#          deixando o path VELHO ser apagado em silêncio → caso R-VELHO.
#     5. falha FECHADA onde a procedência não é decidível: sem MERGE_HEAD (R1) e sem
#        ancestral comum (FECHADO-SEM-BASE). Já `origin/main` deixou de ser NECESSÁRIA —
#        MERGE_HEAD e a merge-base são locais, então fork e clone raso ganham o conserto
#        de graça (caso SEM-REF, cuja expectativa virou 0 por isso).
#
#   validate-features.sh
#     5. o FALSO POSITIVO morreu nos dois caminhos: a main EDITANDO e a main CRIANDO
#        plan/features.json depois do ponto da branch.
#     6. a guarda real continua: reescrever `title` segue bloqueado, fora e DENTRO do
#        merge; mexer só em `passes`/`verification` segue liberado.
#     7. a sonda da linha de entrada não falha mais ABERTA em merge grande. Sem pathspec,
#        `git diff --cached --name-only | grep -q` fecha o pipe no meio, o git morre de
#        SIGPIPE, o `pipefail` propaga 141 e o `|| exit 0` engole — o hook saía 0 sem
#        validar NADA. Este caso é o que impede o conserto de trocar um defeito por outro.
#
# Controle de vivacidade: os casos 2, 3, 4, 5, 6 e 7 são as asserções POSITIVAS (A, B+, D,
# D2, R1, R1-LIMPO, R-VELHO, FECHADO-SEM-BASE, F-A, F-B+, F-CRIA-PRÓPRIA, F-BIG+). Um hook
# substituído por `exit 0` os deixa vermelhos — é o que prova que este arquivo mede algo.
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOKS_ORIGEM="$RAIZ/loop/hooks"

falhas=0; casos=0
ok()   { casos=$((casos+1)); printf '  ✓ %s\n' "$1"; }
falha(){ casos=$((casos+1)); falhas=$((falhas+1)); printf '  ✗ %s\n     %s\n' "$1" "${2:-}"; }
assert_exit() { if [ "$1" = "$2" ]; then ok "$3"; else falha "$3" "exit esperado $2, veio $1"; fi; }
assert_contains() { if grep -qF -- "$2" <<<"$1"; then ok "$3"; else falha "$3" "esperava conter '$2'; saída: $(head -c 400 <<<"$1")"; fi; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
unset DESKCOMM_GOV_INVARIANTS_EDIT DESKCOMM_GOV_PLAN_EDIT || true

INV=tests/invariants/exemplo-congelado.test.ts
FEAT=plan/features.json

identificar() { git -C "$1" config user.email "quem@exemplo.com"; git -C "$1" config user.name "Quem"; }
commitar()    { git -C "$1" add -A >/dev/null && git -C "$1" commit -q --no-verify -m "$2"; }

# ── o "principal" que faz o papel da main ───────────────────────────────────────────
principal="$TMP/principal"; mkdir -p "$principal/tests/invariants" "$principal/plan"
git -C "$principal" init -q -b main; identificar "$principal"
printf 'test("invariante original", () => {});\n' > "$principal/$INV"
printf '{\n  "epico": "G6",\n  "features": [\n    { "id": "F1", "title": "titulo original", "passes": false }\n  ]\n}\n' > "$principal/$FEAT"
printf '# leia\n' > "$principal/README.md"
commitar "$principal" "base da main"
BASE_DA_BRANCH=$(git -C "$principal" rev-parse HEAD)

# uma branch de COLEGA que FORTALECE o invariante. Ela existe por causa do caso R1-LIMPO:
# a rota que apaga o fortalecimento de outra pessoa não precisa de válvula em passo nenhum
# — merge limpo não chama hook, e o commit seguinte só reverte para a versão da main.
git -C "$principal" checkout -q -b colega
printf 'test("invariante original", () => {});\ntest("asercao que o COLEGA acrescentou", () => {});\n' > "$principal/$INV"
commitar "$principal" "o colega fortalece o invariante"
git -C "$principal" checkout -q main

# a main ANDA: edita o invariante e o features.json (só campo proibido, como um ato humano)
printf 'test("invariante original", () => {});\ntest("linha que a MAIN acrescentou", () => {});\n' > "$principal/$INV"
printf '{\n  "epico": "G6",\n  "features": [\n    { "id": "F1", "title": "titulo original", "passes": false },\n    { "id": "F2", "title": "feature que a MAIN criou", "passes": false }\n  ]\n}\n' > "$principal/$FEAT"
# o README entra no mesmo commit de propósito: é o que faz o merge do caso E2E CONFLITAR,
# e sem conflito o `git commit` não acontece e o pre-commit nunca é chamado.
printf '# leia\nlinha que a MAIN acrescentou\n' > "$principal/README.md"
commitar "$principal" "a main anda: invariante, plano e README"

# e um commit só-de-plano, para o caminho de CRIAÇÃO (a main cria o arquivo depois)
principal2="$TMP/principal2"; mkdir -p "$principal2/plan"
git -C "$principal2" init -q -b main; identificar "$principal2"
printf '# leia\n' > "$principal2/README.md"; commitar "$principal2" "base sem plano"
BASE_SEM_PLANO=$(git -C "$principal2" rev-parse HEAD)
printf '{\n  "epico": "G6",\n  "features": [ { "id": "F1", "title": "criado pela main", "passes": false } ]\n}\n' > "$principal2/$FEAT"
commitar "$principal2" "a main CRIA o plano"

# ── dois principais só para a linha `R` (rename), que exige CORPO ─────────────────────
# A detecção de rename do git pede ≥50% de similaridade, e um invariante de UMA linha
# nunca forma par. Estes dois têm corpo de verdade de propósito; são separados do
# `$principal` para não mudar o que os casos B/D/E2E encenam.
CORPO_PAR='import { describe, it, expect } from "vitest";
describe("%s e server-side", () => {
  it("nao vaza credencial para o cliente", () => { expect(1 + 1).toBe(2); });
  it("nao aceita segredo em NEXT_PUBLIC", () => { expect(true).toBe(true); });
});
'
VELHO=tests/invariants/credencial-do-google-e-server-side.test.ts
NOVO_DA_MAIN=tests/invariants/app-da-meta-e-server-side.test.ts

# principal_par: a main ACRESCENTA um invariante parecido com o que já existe. É o par
# `R` que o git forma sozinho quando a SESSÃO apaga o velho dentro do merge (caso R-VELHO).
principal_par="$TMP/principal_par"; mkdir -p "$principal_par/tests/invariants"
git -C "$principal_par" init -q -b main; identificar "$principal_par"
printf "$CORPO_PAR" "credencial do google" > "$principal_par/$VELHO"
printf '# leia\n' > "$principal_par/README.md"
commitar "$principal_par" "base com o invariante velho"
BASE_PAR=$(git -C "$principal_par" rev-parse HEAD)
printf "$CORPO_PAR" "app da meta" > "$principal_par/$NOVO_DA_MAIN"
printf '# leia\nlinha que a MAIN acrescentou\n' > "$principal_par/README.md"
commitar "$principal_par" "a main ACRESCENTA o invariante novo (e mexe no README)"

# principal_ren: a main RENOMEIA o invariante. Rename legítimo do outro lado do merge tem
# de PASSAR — a linha `R` inteira veio de lá (caso REN-LEGIT).
RENOMEADO=tests/invariants/app-da-meta-e-server-side.test.ts
principal_ren="$TMP/principal_ren"; mkdir -p "$principal_ren/tests/invariants"
git -C "$principal_ren" init -q -b main; identificar "$principal_ren"
printf "$CORPO_PAR" "credencial do google" > "$principal_ren/$VELHO"
printf '# leia\n' > "$principal_ren/README.md"
commitar "$principal_ren" "base com o invariante velho"
BASE_REN=$(git -C "$principal_ren" rev-parse HEAD)
git -C "$principal_ren" mv "$VELHO" "$RENOMEADO"
printf "$CORPO_PAR" "app da meta" > "$principal_ren/$RENOMEADO"
printf '# leia\nlinha que a MAIN acrescentou\n' > "$principal_ren/README.md"
commitar "$principal_ren" "a main RENOMEIA o invariante (e mexe no README)"

# ── monta uma branch de trabalho atrasada, com um commit próprio ─────────────────────
# $1 destino, $2 repo principal, $3 commit-base (o ponto em que a branch saiu)
preparar() {
  rm -rf "$1"; git clone -q "$2" "$1" >/dev/null 2>&1; identificar "$1"
  mkdir -p "$1/loop/hooks"; cp "$HOOKS_ORIGEM"/*.sh "$HOOKS_ORIGEM/pre-commit" "$1/loop/hooks/"
  chmod +x "$1"/loop/hooks/*
  # o dispatcher fica ARMADO em todo fixture: os casos novos medem pelo caminho de
  # produção (`git commit`), e o `commitar()` do setup usa --no-verify de propósito.
  git -C "$1" config core.hooksPath loop/hooks
  git -C "$1" checkout -q -B trabalho "$3"
  printf 'arquivo nao relacionado\n' > "$1/meu-trabalho.txt"
  commitar "$1" "meu commit proprio"
}
# roda UM hook direto sobre o índice, sem pipe (armadilha: exit code depois de pipe é o do
# último comando do pipe, e um `| grep` imprime sucesso sobre uma recusa)
rodar() { local d=$1 h=$2 saida rc; saida=$( cd "$d" && bash "loop/hooks/$h" 2>&1 ); rc=$?; printf '%s\n__EXIT__%s\n' "$saida" "$rc"; }
# e o CAMINHO DE PRODUÇÃO: `git commit` de verdade, pelo dispatcher `loop/hooks/pre-commit`.
# Não é preciosismo de método — a versão REFUTADA deste conserto passava quando medida
# chamando o `.sh` direto; chamar o arquivo mede a FUNÇÃO, e o que decide é o SISTEMA.
commitar_pelo_dispatcher() {
  local d=$1 msg=$2 saida rc
  saida=$( cd "$d" && git commit --no-edit -m "$msg" 2>&1 ); rc=$?
  printf '%s\n__EXIT__%s\n' "$saida" "$rc"
}
exit_de()  { sed -n 's/^__EXIT__//p' <<<"$1"; }
saida_de() { sed '/^__EXIT__/d' <<<"$1"; }

printf '\nfreeze-invariants.sh — o falso positivo do merge da main\n'

# CASO B · o invariante chega pelo merge da main, byte-a-byte igual ao dela
b="$TMP/b"; preparar "$b" "$principal" "$BASE_DA_BRANCH"
git -C "$b" merge --no-commit --no-ff origin/main >/dev/null 2>&1 || true
encenado=$(git -C "$b" rev-parse ":$INV"); na_main=$(git -C "$b" rev-parse "origin/main:$INV")
if [ "$encenado" = "$na_main" ]; then ok "o blob encenado é IDÊNTICO ao da main (a premissa do caso)"
else falha "o blob encenado é IDÊNTICO ao da main (a premissa do caso)" "$encenado != $na_main"; fi
# procedência, nos dois sentidos — o segundo é o controle que fecha
if [ -z "$(git -C "$b" log --oneline origin/main..HEAD -- "$INV")" ]; then ok "nenhum commit da branch tocou o invariante (origin/main..HEAD vazio)"
else falha "nenhum commit da branch tocou o invariante" "log não veio vazio"; fi
if [ -n "$(git -C "$b" log --oneline HEAD..origin/main -- "$INV")" ]; then ok "e a main tocou (HEAD..origin/main não-vazio) — o controle positivo da sonda"
else falha "e a main tocou (HEAD..origin/main não-vazio)" "log veio vazio: a sonda está cega"; fi
r=$(rodar "$b" freeze-invariants.sh)
assert_exit "$(exit_de "$r")" 0 "B: invariante que a main trouxe NÃO é acusado"

# CASO B+ · o MESMO merge, mas a branch edita o invariante por cima (a guarda real)
bp="$TMP/bp"; preparar "$bp" "$principal" "$BASE_DA_BRANCH"
git -C "$bp" merge --no-commit --no-ff origin/main >/dev/null 2>&1 || true
printf 'test("reescrito pela SESSAO para passar", () => {});\n' > "$bp/$INV"
git -C "$bp" add "$INV"
r=$(rodar "$bp" freeze-invariants.sh)
assert_exit "$(exit_de "$r")" 1 "B+: edição PRÓPRIA escondida dentro do merge SEGUE bloqueada"
assert_contains "$(saida_de "$r")" "$INV" "B+: e a mensagem nomeia o invariante acusado"

# CASO A · edição genuína, fora de merge
a="$TMP/a"; preparar "$a" "$principal" "$BASE_DA_BRANCH"
printf 'test("reescrito pela SESSAO", () => {});\n' > "$a/$INV"; git -C "$a" add "$INV"
r=$(rodar "$a" freeze-invariants.sh)
assert_exit "$(exit_de "$r")" 1 "A: edição genuína fora de merge SEGUE bloqueada"

# CASO VÁLVULA · o mesmo estado A, com a env declarada
saida=$( cd "$a" && DESKCOMM_GOV_INVARIANTS_EDIT=1 bash loop/hooks/freeze-invariants.sh 2>&1 ); rc=$?
assert_exit "$rc" 0 "VÁLVULA: DESKCOMM_GOV_INVARIANTS_EDIT=1 segue liberando o estado A"

# CASO D · a branch DELETA um invariante que a main tem
d="$TMP/d"; preparar "$d" "$principal" "$BASE_DA_BRANCH"
git -C "$d" rm -q "$INV"
r=$(rodar "$d" freeze-invariants.sh)
assert_exit "$(exit_de "$r")" 1 "D: deletar invariante que a main tem SEGUE bloqueado"

# CASO D2 · a branch deleta um invariante que ELA MESMA criou (a main não o tem).
# Este caso existe porque a sabotagem o exigiu: removida a condição `[ -n "$encenado" ]`
# do hook, o D acima continua vermelho (o blob da main é não-vazio, os lados diferem) e
# NADA acusa a perda. Aqui os dois lados são vazios, comparariam IGUAIS, e o caminho
# sairia da lista em silêncio — é o único caso que essa condição sustenta.
d2="$TMP/d2"; preparar "$d2" "$principal" "$BASE_DA_BRANCH"
printf 'test("invariante que a branch criou", () => {});\n' > "$d2/tests/invariants/so-da-branch.test.ts"
commitar "$d2" "a branch cria um invariante proprio"
if [ -z "$(git -C "$d2" rev-parse -q --verify 'origin/main:tests/invariants/so-da-branch.test.ts')" ]; then ok "D2: o invariante NÃO está na main (a premissa do caso)"
else falha "D2: o invariante NÃO está na main" "a main o tem: o caso não mede o que devia"; fi
git -C "$d2" rm -q tests/invariants/so-da-branch.test.ts
r=$(rodar "$d2" freeze-invariants.sh)
assert_exit "$(exit_de "$r")" 1 "D2: deletar invariante que a PRÓPRIA branch criou SEGUE bloqueado"

# CASO D2-MERGE · o MESMO delete, agora DENTRO do merge — e é ele, não o D2 acima, que
# sustenta a CONDIÇÃO 2 (`MERGE_HEAD` difere da BASE). Ausente-nos-dois satisfaz a condição
# 1, então sem a condição 2 o caminho sairia da lista e a perda passaria em silêncio. O D2
# fora de merge NÃO cobre isso: lá não há MERGE_HEAD e nada é excluído de qualquer jeito —
# sabotar a condição 2 o deixa verde. Medido: é o único caso que fica vermelho.
d2m="$TMP/d2m"; preparar "$d2m" "$principal" "$BASE_DA_BRANCH"
printf 'test("invariante que a branch criou", () => {});\n' > "$d2m/tests/invariants/so-da-branch.test.ts"
printf 'ponta da BRANCH\n' > "$d2m/README.md"
commitar "$d2m" "a branch cria invariante proprio e mexe no README"
git -C "$d2m" merge --no-edit origin/main >/dev/null 2>&1 || true
if [ -n "$(git -C "$d2m" rev-parse -q --verify MERGE_HEAD)" ]; then ok "D2-MERGE: o merge conflitou de verdade (MERGE_HEAD presente)"
else falha "D2-MERGE: o merge conflitou de verdade" "sem MERGE_HEAD: não chamaria hook"; fi
if [ -z "$(git -C "$d2m" rev-parse -q --verify "MERGE_HEAD:tests/invariants/so-da-branch.test.ts")" ] \
   && [ -z "$(git -C "$d2m" rev-parse -q --verify "$(git -C "$d2m" merge-base HEAD MERGE_HEAD):tests/invariants/so-da-branch.test.ts")" ]; then
  ok "D2-MERGE: o invariante não está em MERGE_HEAD NEM na BASE (a premissa: o outro lado não mexeu nele)"
else falha "D2-MERGE: o invariante não está em MERGE_HEAD nem na BASE" "está em um dos dois: o caso não mede a condição 2"; fi
printf 'resolvido\n' > "$d2m/README.md"; git -C "$d2m" add README.md
git -C "$d2m" rm -q tests/invariants/so-da-branch.test.ts
r=$(commitar_pelo_dispatcher "$d2m" "merge da main, apagando o invariante proprio")
assert_exit "$(exit_de "$r")" 1 "D2-MERGE: apagar DENTRO do merge o invariante que a branch criou é ACUSADO"
assert_contains "$(saida_de "$r")" "tests/invariants/so-da-branch.test.ts" "D2-MERGE: e a mensagem nomeia o invariante perdido (não passou/reprovou por outro motivo)"

# CASO ADD · invariante NOVO é permitido (regra declarada no cabeçalho do hook)
add="$TMP/add"; preparar "$add" "$principal" "$BASE_DA_BRANCH"
printf 'test("invariante novo", () => {});\n' > "$add/tests/invariants/novinho.test.ts"
git -C "$add" add tests/invariants/novinho.test.ts
r=$(rodar "$add" freeze-invariants.sh)
assert_exit "$(exit_de "$r")" 0 "ADD: acrescentar invariante novo segue liberado"

# CASO R1 · a sessão FORTALECE o invariante e depois o REVERTE para a versão da main, em
# commit NORMAL. Identidade de CONTEÚDO não distingue isso de "a main chegando": nas duas
# formas `:$p` == `origin/main:$p`. Este caso EXPIRA o antigo CASO CO, que encenava o mesmo
# estado (`git checkout origin/main -- <inv>` fora de merge) esperando exit 0 — a
# expectativa era o defeito, não a medida.
#
# Medido pelo caminho de produção em 18/09/2026, no MESMO estado, com os dois hooks:
#   eixo de CONTEÚDO (6ef3cf1fa) → git commit exit 0, e `git show HEAD:<inv>` volta com
#                                  UMA asserção: a que a branch acrescentou foi apagada
#   eixo de PROCEDÊNCIA          → git commit exit 1, e o HEAD segue com as DUAS
# É por isso que o caso assere a CONSEQUÊNCIA (o conteúdo do HEAD) e não só o exit.
r1="$TMP/r1"; preparar "$r1" "$principal" "$BASE_DA_BRANCH"
printf 'test("invariante original", () => {});\ntest("asercao que a BRANCH acrescentou", () => {});\n' > "$r1/$INV"
git -C "$r1" add "$INV"
saida=$( cd "$r1" && DESKCOMM_GOV_INVARIANTS_EDIT=1 git commit --no-edit -m "fortalece o invariante (ato legitimo)" 2>&1 ); rc=$?
assert_exit "$rc" 0 "R1: fortalecer o invariante COM a válvula passa — é o ato que monta o estado"
# A sonda da consequência é pelo MARCADOR, não pela CONTAGEM — e isto foi medido, não
# escolhido: com `grep -c 'test('` o caso passava sob sabotagem, porque a versão da main
# TAMBÉM tem duas asserções. Contar prova que nada sumiu do total; só o marcador prova que
# não sumiu a asserção DESTA branch.
antes=$(grep -c 'BRANCH' "$r1/$INV")
git -C "$r1" checkout origin/main -- "$INV"; git -C "$r1" add "$INV"
if [ "$(git -C "$r1" rev-parse ":$INV")" = "$(git -C "$r1" rev-parse "origin/main:$INV")" ]; then ok "R1: o encenado é IDÊNTICO ao da main (a premissa — é o que enganava o eixo de conteúdo)"
else falha "R1: o encenado é IDÊNTICO ao da main" "os blobs diferem: o caso não mede o que devia"; fi
if [ -z "$(git -C "$r1" rev-parse -q --verify MERGE_HEAD)" ]; then ok "R1: e não há merge em curso (MERGE_HEAD ausente) — a procedência que decide"
else falha "R1: e não há merge em curso" "MERGE_HEAD existe"; fi
r=$(commitar_pelo_dispatcher "$r1" "reverte o invariante para a versao da main")
assert_exit "$(exit_de "$r")" 1 "R1: reverter para a versão da main fora de merge é ACUSADO (pelo dispatcher)"
depois=$(git -C "$r1" show "HEAD:$INV" | grep -c 'BRANCH')
if [ "$antes" = 1 ] && [ "$depois" = 1 ]; then ok "R1: e a asserção da branch SOBREVIVEU no HEAD — a consequência, não só o exit"
else falha "R1: a asserção da branch sobreviveu no HEAD" "antes=$antes depois=$depois"; fi

# CASO R1-LIMPO · a mesma perda, por uma rota que não pede válvula em PASSO NENHUM: mesclar
# LIMPO a branch de um colega que fortaleceu o invariante (merge limpo não chama hook) e
# reverter no commit seguinte. É o que torna o R1 rotina e não curiosidade.
r1l="$TMP/r1l"; preparar "$r1l" "$principal" "$BASE_DA_BRANCH"
git -C "$r1l" merge --no-edit origin/colega >/dev/null 2>&1; rc=$?
assert_exit "$rc" 0 "R1-LIMPO: o merge da branch do colega entra LIMPO — e nem passa por pre-commit"
colega_antes=$(git -C "$r1l" show "HEAD:$INV" | grep -c 'COLEGA')
git -C "$r1l" checkout origin/main -- "$INV"; git -C "$r1l" add "$INV"
r=$(commitar_pelo_dispatcher "$r1l" "reverte o que o colega fortaleceu")
assert_exit "$(exit_de "$r")" 1 "R1-LIMPO: apagar o fortalecimento do colega é ACUSADO"
colega_depois=$(git -C "$r1l" show "HEAD:$INV" | grep -c 'COLEGA')
if [ "$colega_antes" = 1 ] && [ "$colega_depois" = 1 ]; then ok "R1-LIMPO: e a asserção do colega SOBREVIVEU no HEAD"
else falha "R1-LIMPO: a asserção do colega sobreviveu no HEAD" "antes=$colega_antes depois=$colega_depois"; fi

# CASO SEM-REF · `origin/main` deixou de ser NECESSÁRIA, e isso é ganho, não relaxamento:
# MERGE_HEAD e a merge-base são locais e existem em qualquer merge. Onde o eixo antigo
# falhava fechado (fork, clone raso, CI com checkout sem a ref), o novo julga a procedência
# do mesmo jeito. A expectativa deste caso virou 0 por causa disso — e o que sustenta a
# falha fechada agora é o caso FECHADO-SEM-BASE, abaixo.
semref="$TMP/semref"; preparar "$semref" "$principal" "$BASE_DA_BRANCH"
git -C "$semref" merge --no-commit --no-ff origin/main >/dev/null 2>&1 || true
git -C "$semref" remote remove origin
if [ -z "$(git -C "$semref" rev-parse -q --verify origin/main)" ]; then ok "SEM-REF: origin/main realmente não resolve mais (a premissa do caso)"
else falha "SEM-REF: origin/main realmente não resolve mais" "a ref ainda resolve"; fi
if [ -n "$(git -C "$semref" rev-parse -q --verify MERGE_HEAD)" ]; then ok "SEM-REF: e MERGE_HEAD segue de pé — é ref local, não depende de remoto"
else falha "SEM-REF: MERGE_HEAD segue de pé" "MERGE_HEAD sumiu: o caso não mede o que devia"; fi
r=$(rodar "$semref" freeze-invariants.sh)
assert_exit "$(exit_de "$r")" 0 "SEM-REF: sem a ref do remoto o falso positivo MORRE igual (fork, clone raso)"

# CASO FECHADO-SEM-BASE · merge de histórias SEM ancestral comum: `git merge-base` sai 1 e
# a saída é vazia. Sem BASE não há como saber se o outro lado MEXEU no caminho, e o hook
# roda sob `set -euo pipefail` — a decisão é falhar FECHADO (bloquear pede uma válvula
# declarada; liberar perde o eval em silêncio).
fsb="$TMP/fsb"; mkdir -p "$fsb/tests/invariants" "$TMP/desconhecido/tests/invariants"
git -C "$TMP/desconhecido" init -q -b main; identificar "$TMP/desconhecido"
printf 'test("versao do OUTRO lado", () => {});\n' > "$TMP/desconhecido/$INV"
commitar "$TMP/desconhecido" "historia sem parentesco"
git -C "$fsb" init -q -b trabalho; identificar "$fsb"
printf 'test("versao da BRANCH", () => {});\n' > "$fsb/$INV"
commitar "$fsb" "base da branch"
mkdir -p "$fsb/loop/hooks"; cp "$HOOKS_ORIGEM"/*.sh "$HOOKS_ORIGEM/pre-commit" "$fsb/loop/hooks/"
chmod +x "$fsb"/loop/hooks/*; git -C "$fsb" config core.hooksPath loop/hooks
git -C "$fsb" remote add outro "$TMP/desconhecido"; git -C "$fsb" fetch -q outro
git -C "$fsb" merge --no-edit --allow-unrelated-histories outro/main >/dev/null 2>&1 || true
git -C "$fsb" checkout --theirs -- "$INV" >/dev/null 2>&1 || true; git -C "$fsb" add "$INV"
if ! git -C "$fsb" merge-base HEAD MERGE_HEAD >/dev/null 2>&1; then ok "FECHADO-SEM-BASE: não há ancestral comum (merge-base sai 1) — a premissa do caso"
else falha "FECHADO-SEM-BASE: não há ancestral comum" "merge-base resolveu: o caso não mede o que devia"; fi
if [ "$(git -C "$fsb" rev-parse ":$INV")" = "$(git -C "$fsb" rev-parse "MERGE_HEAD:$INV")" ]; then ok "FECHADO-SEM-BASE: e o encenado É o do outro lado — só a BASE falta (o controle que fecha)"
else falha "FECHADO-SEM-BASE: o encenado é o do outro lado" "difere: o caso mediria a condição 1, não a 2"; fi
r=$(commitar_pelo_dispatcher "$fsb" "merge de historia sem parentesco")
assert_exit "$(exit_de "$r")" 1 "FECHADO-SEM-BASE: sem merge-base nada é excluído — falha FECHADA, não aberta"

# CASO R-VELHO · a linha `R`: a main ACRESCENTA um invariante parecido, a SESSÃO apaga o
# velho dentro do merge, e o git forma o par de rename sozinho (≥50% de similaridade).
# Julgando só o `$3` da linha, a DELEÇÃO do path velho saía em silêncio — medido pelo
# dispatcher: hook de conteúdo → exit 0 e o invariante velho APAGADO no commit.
rv="$TMP/rv"; preparar "$rv" "$principal_par" "$BASE_PAR"
printf 'ponta da BRANCH\n' > "$rv/README.md"; commitar "$rv" "a branch reescreve o README"
git -C "$rv" merge --no-edit origin/main >/dev/null 2>&1 || true
if [ -n "$(git -C "$rv" rev-parse -q --verify MERGE_HEAD)" ]; then ok "R-VELHO: o merge conflitou de verdade (MERGE_HEAD presente)"
else falha "R-VELHO: o merge conflitou de verdade" "sem MERGE_HEAD: não chamaria hook"; fi
printf 'resolvido\n' > "$rv/README.md"; git -C "$rv" add README.md
git -C "$rv" rm -q "$VELHO"
if git -C "$rv" diff --cached --name-status | grep -q "^R.*$VELHO"; then ok "R-VELHO: o git formou a linha R com o path velho (a premissa do caso)"
else falha "R-VELHO: o git formou a linha R" "name-status: $(git -C "$rv" diff --cached --name-status | tr '\n' ' ')"; fi
r=$(commitar_pelo_dispatcher "$rv" "merge, e a sessao apaga o invariante velho")
assert_exit "$(exit_de "$r")" 1 "R-VELHO: apagar o invariante velho numa linha R é ACUSADO"
if [ -n "$(git -C "$rv" rev-parse -q --verify "HEAD:$VELHO")" ]; then ok "R-VELHO: e o invariante velho segue no HEAD — a consequência, não só o exit"
else falha "R-VELHO: o invariante velho segue no HEAD" "foi apagado: o commit passou"; fi

# CASO REN-LEGIT · o MERGE renomeia o invariante, e a linha `R` INTEIRA veio do outro lado:
# o path velho está ausente nos dois (deleção que o merge trouxe, e a BASE o tinha) e o
# path novo é byte-a-byte o do merge (e a BASE não o tinha). Tem de PASSAR — senão o
# conserto trocaria um falso positivo por outro.
rl="$TMP/rl"; preparar "$rl" "$principal_ren" "$BASE_REN"
printf 'ponta da BRANCH\n' > "$rl/README.md"; commitar "$rl" "a branch reescreve o README"
git -C "$rl" merge --no-edit origin/main >/dev/null 2>&1 || true
if [ -n "$(git -C "$rl" rev-parse -q --verify MERGE_HEAD)" ]; then ok "REN-LEGIT: o merge conflitou de verdade (MERGE_HEAD presente)"
else falha "REN-LEGIT: o merge conflitou de verdade" "sem MERGE_HEAD: não chamaria hook"; fi
printf 'resolvido\n' > "$rl/README.md"; git -C "$rl" add README.md
if git -C "$rl" diff --cached --name-status | grep -q "^R.*$VELHO"; then ok "REN-LEGIT: o índice do merge traz a linha R (a premissa do caso)"
else falha "REN-LEGIT: o índice do merge traz a linha R" "name-status: $(git -C "$rl" diff --cached --name-status | tr '\n' ' ')"; fi
r=$(commitar_pelo_dispatcher "$rl" "merge que renomeia o invariante")
assert_exit "$(exit_de "$r")" 0 "REN-LEGIT: rename que o MERGE trouxe não é acusado"

# CASO E2E · a operação de verdade: `git commit` de um merge CONFLITADO, pelo dispatcher
e2e="$TMP/e2e"; preparar "$e2e" "$principal" "$BASE_DA_BRANCH"
git -C "$e2e" config core.hooksPath loop/hooks
printf 'ponta da BRANCH\n' > "$e2e/README.md"; commitar "$e2e" "a branch reescreve o README"
git -C "$e2e" merge --no-edit origin/main >/dev/null 2>&1 || true
if [ -n "$(git -C "$e2e" rev-parse -q --verify MERGE_HEAD)" ]; then ok "E2E: o merge conflitou de verdade (MERGE_HEAD presente)"
else falha "E2E: o merge conflitou de verdade" "sem MERGE_HEAD: o merge entrou limpo e não chamaria hook"; fi
printf 'resolvido\n' > "$e2e/README.md"; git -C "$e2e" add README.md
saida=$( cd "$e2e" && git commit --no-edit 2>&1 ); rc=$?
assert_exit "$rc" 0 "E2E: o commit do merge conflitado PASSA pelos três guards"
if [ -z "$(git -C "$e2e" rev-parse -q --verify MERGE_HEAD)" ]; then ok "E2E: e o merge foi concluído de fato (MERGE_HEAD já não existe)"
else falha "E2E: e o merge foi concluído de fato" "MERGE_HEAD ainda resolve: o commit foi recusado"; fi

printf '\nvalidate-features.sh — o mesmo falso positivo, e a sonda que falhava aberta\n'

# CASO F-B · a main edita o plano; o merge traz o blob dela
fb="$TMP/fb"; preparar "$fb" "$principal" "$BASE_DA_BRANCH"
git -C "$fb" merge --no-commit --no-ff origin/main >/dev/null 2>&1 || true
mh=$(git -C "$fb" rev-parse MERGE_HEAD)
if [ "$(git -C "$fb" rev-parse ":$FEAT")" = "$(git -C "$fb" rev-parse "$mh:$FEAT")" ]; then ok "F-B: o blob encenado é IDÊNTICO ao do outro lado do merge (a premissa)"
else falha "F-B: o blob encenado é IDÊNTICO ao do outro lado" "difere"; fi
r=$(rodar "$fb" validate-features.sh)
assert_exit "$(exit_de "$r")" 0 "F-B: plano que a main trouxe NÃO é acusado"

# CASO F-B+ · o MESMO merge, mas eu reescrevo um title por cima (a guarda real)
fbp="$TMP/fbp"; preparar "$fbp" "$principal" "$BASE_DA_BRANCH"
git -C "$fbp" merge --no-commit --no-ff origin/main >/dev/null 2>&1 || true
python3 - "$fbp/$FEAT" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p)); d["features"][0]["title"] = "REESCRITO PELA SESSAO"
json.dump(d, open(p, "w"), indent=2)
PY
git -C "$fbp" add "$FEAT"
r=$(rodar "$fbp" validate-features.sh)
assert_exit "$(exit_de "$r")" 1 "F-B+: reescrever title DENTRO do merge SEGUE bloqueado"

# CASO F-A · reescrever title fora de merge
fa="$TMP/fa"; preparar "$fa" "$principal" "$BASE_DA_BRANCH"
python3 - "$fa/$FEAT" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p)); d["features"][0]["title"] = "REESCRITO PELA SESSAO"
json.dump(d, open(p, "w"), indent=2)
PY
git -C "$fa" add "$FEAT"
r=$(rodar "$fa" validate-features.sh)
assert_exit "$(exit_de "$r")" 1 "F-A: reescrever title fora de merge SEGUE bloqueado"

# CASO F-OK · mexer só em passes/verification segue liberado (não é bloqueio cego)
fok="$TMP/fok"; preparar "$fok" "$principal" "$BASE_DA_BRANCH"
python3 - "$fok/$FEAT" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p))
d["features"][0]["passes"] = True; d["features"][0]["verification"] = {"quando": "agora"}
json.dump(d, open(p, "w"), indent=2)
PY
git -C "$fok" add "$FEAT"
r=$(rodar "$fok" validate-features.sh)
assert_exit "$(exit_de "$r")" 0 "F-OK: mudar só passes/verification segue liberado"

# CASO F-CRIA · a main CRIA plan/features.json depois do ponto da branch
fc="$TMP/fc"; preparar "$fc" "$principal2" "$BASE_SEM_PLANO"
git -C "$fc" merge --no-commit --no-ff origin/main >/dev/null 2>&1 || true
r=$(rodar "$fc" validate-features.sh)
assert_exit "$(exit_de "$r")" 0 "F-CRIA: plano CRIADO pela main e trazido por merge não é acusado"

# CASO F-CRIA-PROPRIA · a branch cria o plano do próprio bolso (segue sendo ato humano)
fcp="$TMP/fcp"; preparar "$fcp" "$principal2" "$BASE_SEM_PLANO"
mkdir -p "$fcp/plan"
printf '{\n  "epico": "G6",\n  "features": [ { "id": "X", "title": "inventado pela sessao", "passes": false } ]\n}\n' > "$fcp/$FEAT"
git -C "$fcp" add "$FEAT"
r=$(rodar "$fcp" validate-features.sh)
assert_exit "$(exit_de "$r")" 1 "F-CRIA-PRÓPRIA: criar o plano na branch SEGUE exigindo sessão humana"

# CASO F-BIG+ · merge GRANDE: sem pathspec a sonda de entrada morre de SIGPIPE e o hook
# sai 0 sem validar nada. Com ela, a edição própria é pega no MESMO estado.
#
# O NOME do diretório de enchimento é parte do caso, não estética. `git diff --cached`
# imprime em ordem alfabética, e o SIGPIPE só acontece se o `grep -q` casar CEDO e
# fechar o pipe com o git ainda escrevendo. Medido: com o enchimento em `enchimento/`
# (antes de `plan/`) o match cai na posição 6002 de 6003, o grep lê o stream inteiro,
# não há SIGPIPE, e o caso passava PELO MOTIVO ERRADO — sabotar o pathspec não o
# deixava vermelho. Com `zzz-enchimento/` (depois de `plan/`) o match é o nome 1 e o
# `exit 141` aparece. É por isso que a premissa abaixo mede a POSIÇÃO, não só o volume.
fbig="$TMP/fbig"; preparar "$fbig" "$principal" "$BASE_DA_BRANCH"
git -C "$fbig" merge --no-commit --no-ff origin/main >/dev/null 2>&1 || true
mkdir -p "$fbig/zzz-enchimento"
python3 - "$fbig/zzz-enchimento" <<'PY'
import sys, pathlib
d = pathlib.Path(sys.argv[1])
for i in range(6000):
    (d / f"arquivo-de-enchimento-com-nome-longo-para-encher-o-pipe-{i:05d}.txt").write_text("x\n")
PY
python3 - "$fbig/$FEAT" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p)); d["features"][0]["title"] = "REESCRITO PELA SESSAO"
json.dump(d, open(p, "w"), indent=2)
PY
git -C "$fbig" add -A
encenados=$(git -C "$fbig" diff --cached --name-only | wc -l | tr -d ' ')
posicao=$(git -C "$fbig" diff --cached --name-only | grep -n -x "$FEAT" | cut -d: -f1)
if [ "$encenados" -gt 3000 ] && [ "${posicao:-0}" -lt 10 ]; then ok "F-BIG+: $encenados encenados e o match na posição $posicao (as DUAS premissas: volume e match cedo)"
else falha "F-BIG+: volume >3000 e match na posição <10" "encenados=$encenados posicao=${posicao:-nenhuma} — o caso não estressa o pipe"; fi
r=$(rodar "$fbig" validate-features.sh)
assert_exit "$(exit_de "$r")" 1 "F-BIG+: em merge grande o hook AINDA valida — a sonda não falha aberta"

printf '\nhooks-nao-acusam-a-main: %s casos, %s falha(s)\n' "$casos" "$falhas"
[ "$falhas" -eq 0 ] || exit 1
