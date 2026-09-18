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
#   freeze-invariants.sh
#     1. o FALSO POSITIVO morreu: invariante que a main trouxe, byte-a-byte igual ao dela,
#        não é acusado — nem dentro de um merge nem por `git checkout origin/main -- <inv>`.
#     2. a GUARDA REAL continua inteira, e este é o ponto: editar invariante com conteúdo
#        PRÓPRIO segue bloqueado — inclusive escondido DENTRO do merge da main, que é o
#        disfarce mais fácil depois de relaxar o hook. É por isso que o eixo é identidade
#        de CONTEÚDO e não existência de CAMINHO: a forma do #1179 (`git cat-file -e`)
#        deixaria essa porta aberta, porque o invariante existe na main nos dois casos.
#     3. DELETE segue acusado (não há blob encenado para comparar), ADIÇÃO segue liberada
#        (é a regra declarada no cabeçalho do hook) e a válvula segue funcionando.
#     4. sem a ref `origin/main` (fork, clone raso) nada é excluído: falha FECHADA.
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
# Controle de vivacidade: os casos 2, 3, 6 e 7 são as asserções POSITIVAS. Um hook
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

# ── monta uma branch de trabalho atrasada, com um commit próprio ─────────────────────
# $1 destino, $2 repo principal, $3 commit-base (o ponto em que a branch saiu)
preparar() {
  rm -rf "$1"; git clone -q "$2" "$1" >/dev/null 2>&1; identificar "$1"
  mkdir -p "$1/loop/hooks"; cp "$HOOKS_ORIGEM"/*.sh "$HOOKS_ORIGEM/pre-commit" "$1/loop/hooks/"
  chmod +x "$1"/loop/hooks/*
  git -C "$1" checkout -q -B trabalho "$3"
  printf 'arquivo nao relacionado\n' > "$1/meu-trabalho.txt"
  commitar "$1" "meu commit proprio"
}
# roda UM hook direto sobre o índice, sem pipe (armadilha: exit code depois de pipe é o do
# último comando do pipe, e um `| grep` imprime sucesso sobre uma recusa)
rodar() { local d=$1 h=$2 saida rc; saida=$( cd "$d" && bash "loop/hooks/$h" 2>&1 ); rc=$?; printf '%s\n__EXIT__%s\n' "$saida" "$rc"; }
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

# CASO ADD · invariante NOVO é permitido (regra declarada no cabeçalho do hook)
add="$TMP/add"; preparar "$add" "$principal" "$BASE_DA_BRANCH"
printf 'test("invariante novo", () => {});\n' > "$add/tests/invariants/novinho.test.ts"
git -C "$add" add tests/invariants/novinho.test.ts
r=$(rodar "$add" freeze-invariants.sh)
assert_exit "$(exit_de "$r")" 0 "ADD: acrescentar invariante novo segue liberado"

# CASO CO · `git checkout origin/main -- <inv>`, a mesma classe FORA de merge
co="$TMP/co"; preparar "$co" "$principal" "$BASE_DA_BRANCH"
git -C "$co" checkout origin/main -- "$INV"; git -C "$co" add "$INV"
if [ -z "$(git -C "$co" rev-parse -q --verify MERGE_HEAD)" ]; then ok "CO: o estado não é um merge (MERGE_HEAD ausente) — a premissa do caso"
else falha "CO: o estado não é um merge" "MERGE_HEAD existe"; fi
r=$(rodar "$co" freeze-invariants.sh)
assert_exit "$(exit_de "$r")" 0 "CO: trazer o invariante da main sem merge também não é acusado"

# CASO SEM-REF · sem `origin/main` a guarda falha FECHADA (fork, clone raso)
semref="$TMP/semref"; preparar "$semref" "$principal" "$BASE_DA_BRANCH"
git -C "$semref" merge --no-commit --no-ff origin/main >/dev/null 2>&1 || true
git -C "$semref" remote remove origin
if [ -z "$(git -C "$semref" rev-parse -q --verify origin/main)" ]; then ok "SEM-REF: origin/main realmente não resolve mais (a premissa do caso)"
else falha "SEM-REF: origin/main realmente não resolve mais" "a ref ainda resolve"; fi
r=$(rodar "$semref" freeze-invariants.sh)
assert_exit "$(exit_de "$r")" 1 "SEM-REF: sem a ref, nada é excluído — falha FECHADA, não aberta"

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
