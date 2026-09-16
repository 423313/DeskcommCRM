#!/usr/bin/env bash
# Prova de `reaplicar_baseline` (hostgator-setup-kit/_common.sh), com `docker`
# substituído por um dublê que devolve a saída do psql passada a passada.
#
#   bash tests/shell/baseline-reaplica-apos-disputa.test.sh
#
# O defeito, medido numa VPS real na v1.27.3: o update.sh re-aplicou o baseline
# com o app atendendo, dois comandos perderam um `deadlock detected`, e um deles
# era o `create policy` logo depois do `drop policy` da mesma policy. O psql
# seguiu (é o contrato sem ON_ERROR_STOP), o script avisou e seguiu também, e
# `ai_knowledge_sources` ficou sem a policy de leitura até alguém refazer o
# bloco à mão.
#
# O que está sob prova:
#   1. erro de disputa numa passada → o arquivo é aplicado DE NOVO, e o veredito
#      é o da última passada (a que fica no banco);
#   2. disputa que não passa → desiste no teto e devolve o erro, sem "✓";
#   3. erro que não é de disputa (permissão, dado) → uma passada só: repetir
#      daria o mesmo erro, mais tarde;
#   4. o psql que não chega ao fim do arquivo NUNCA é lido como sucesso, mesmo
#      quando a mensagem de conexão perdida não traz a palavra ERROR;
#   5. o ruído benigno de sempre não dispara passada nenhuma.
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FAILS=0
check() {  # check <descrição> <comando de verificação...>
  if "${@:2}"; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s\n' "$1"; FAILS=$((FAILS + 1)); fi
}

# ── Dublê de `docker` ────────────────────────────────────────────────────────
# Cada chamada que aplica o baseline consome a próxima passada do roteiro:
# `$ROTEIRO/passada.N` é o que o psql imprime, `$ROTEIRO/saida.N` o código com
# que ele sai (0 quando o arquivo não existe). Passada sem roteiro sai limpa.
mkdir -p "$WORK/bin"
cat > "$WORK/bin/docker" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_LOG"
case " $* " in
  *" -f /b.sql "*)
    n=$(( $(cat "$ROTEIRO/n" 2>/dev/null || echo 0) + 1 ))
    printf '%s' "$n" > "$ROTEIRO/n"
    [ -f "$ROTEIRO/passada.$n" ] && cat "$ROTEIRO/passada.$n"
    exit "$(cat "$ROTEIRO/saida.$n" 2>/dev/null || echo 0)" ;;
esac
exit 0
STUB
chmod +x "$WORK/bin/docker"

printf 'select 1;\n' > "$WORK/baseline.sql"

# Saídas de psql copiadas da forma real (update-1.27.3.log da VPS, 2026-09-15).
BENIGNO='psql:/b.sql:1918: ERROR:  multiple primary keys for table "ai_agent_runs" are not allowed
psql:/b.sql:2554: ERROR:  relation "ai_invocations_org_created_idx" already exists'
DEADLOCK='psql:/b.sql:16766: ERROR:  deadlock detected
DETAIL:  Process 4121 waits for AccessExclusiveLock on relation 29187 of database 5; blocked by process 3987.
HINT:  See server log for query details.'

# roteiro <passada> <saída do psql> [código de saída]
roteiro() {
  printf '%s\n' "$2" > "$ROTEIRO/passada.$1"
  [ $# -ge 3 ] && printf '%s' "$3" > "$ROTEIRO/saida.$1"
  return 0
}

novo_caso() {
  ROTEIRO="$WORK/roteiro.$1"
  rm -rf "$ROTEIRO"; mkdir -p "$ROTEIRO"
  : > "$WORK/docker.log"
}

# Roda a função num bash filho, com o `set -euo pipefail` que o _common.sh liga
# nos scripts de verdade, e guarda o que a prova lê: código, veredito, tela, log.
rodar() {
  bash -c '
    export PATH="$1/bin:$PATH" DOCKER_LOG="$1/docker.log" ROTEIRO="$2"
    export SUPABASE_DB_URL="postgresql://postgres:x@db.exemplo:5432/postgres"
    export BASELINE_ESPERA_S=0
    source "$3/hostgator-setup-kit/_common.sh" >/dev/null 2>&1
    if reaplicar_baseline "$1/baseline.sql" "$1/apply.log"; then rc=0; else rc=1; fi
    printf "%s" "$rc" > "$1/rc"
    printf "%s" "${BASELINE_INESPERADO-<nunca definido>}" > "$1/inesperado"
  ' _ "$WORK" "$ROTEIRO" "$RAIZ" > "$WORK/tela" 2>&1
}

rc()          { cat "$WORK/rc"; }
passadas()    { grep -c -- '-f /b.sql' "$WORK/docker.log"; }
inesperado()  { cat "$WORK/inesperado"; }
e_igual()     { [ "$1" = "$2" ]; }
contem()      { printf '%s' "$1" | grep -qiE -- "$2"; }
nao_contem()  { ! printf '%s' "$1" | grep -qiE -- "$2"; }

echo "── 0. O dublê é o que a prova pensa que é"
# Controle positivo: sem ele, uma função que nunca chama o docker daria
# "uma passada só" por zero passadas, e os casos 3 e 5 ficariam verdes medindo nada.
novo_caso controle
roteiro 1 "$DEADLOCK"
PATH="$WORK/bin:$PATH" DOCKER_LOG="$WORK/docker.log" ROTEIRO="$ROTEIRO" \
  docker run --rm -i postgres:17-alpine psql x -q -f /b.sql > "$WORK/controle" 2>&1
check "uma chamada do psql consome a passada 1 do roteiro" grep -q "deadlock detected" "$WORK/controle"
check "e o log do dublê conta a chamada" e_igual "$(passadas)" 1

echo "── 1. Deadlock na 1ª passada, limpa na 2ª: aplica de novo e o veredito é o da 2ª"
novo_caso disputa-passa
roteiro 1 "$BENIGNO
$DEADLOCK"
roteiro 2 "$BENIGNO"
rodar
check "devolve sucesso" e_igual "$(rc)" 0
check "aplicou o arquivo duas vezes" e_igual "$(passadas)" 2
check "o veredito não carrega o deadlock da 1ª passada" e_igual "$(inesperado)" ""
check "a tela diz que está aplicando de novo, e que é seguro" grep -q "aplicando de novo, é seguro (passada 2 de 3)" "$WORK/tela"
check "o log guarda as DUAS passadas, com cabeçalho" e_igual "$(grep -c '^── passada ' "$WORK/apply.log")" 2
check "  e o deadlock da 1ª continua lá para quem investigar" grep -q "deadlock detected" "$WORK/apply.log"

echo "── 2. Disputa que não passa: desiste no teto e devolve o erro"
novo_caso disputa-persiste
roteiro 1 "$DEADLOCK"; roteiro 2 "$DEADLOCK"; roteiro 3 "$DEADLOCK"; roteiro 4 ""
rodar
check "devolve falha" e_igual "$(rc)" 1
check "parou no teto de 3 passadas (não tentou a 4ª)" e_igual "$(passadas)" 3
check "o veredito traz o deadlock" contem "$(inesperado)" "deadlock detected"

echo "── 3. Erro que não é de disputa: uma passada só"
novo_caso permissao
roteiro 1 'psql:/b.sql:88: ERROR:  permission denied for schema public'
roteiro 2 ""
rodar
check "devolve falha" e_igual "$(rc)" 1
check "não re-aplicou (repetir daria o mesmo erro)" e_igual "$(passadas)" 1
check "o veredito traz o erro de permissão" contem "$(inesperado)" "permission denied"

echo "── 4. psql que não chega ao fim do arquivo nunca é sucesso"
novo_caso conexao-cai
# Sem a palavra ERROR de propósito: é o que isola a leitura do código de saída.
roteiro 1 'psql:/b.sql:9000: server closed the connection unexpectedly
	This probably means the server terminated abnormally
	before or while processing the request.
psql:/b.sql:9000: connection to server was lost' 2
roteiro 2 ""
rodar
check "conexão que cai no meio vira nova passada" e_igual "$(passadas)" 2
check "  e, limpa a 2ª, devolve sucesso" e_igual "$(rc)" 0

novo_caso docker-falha
roteiro 1 'Unable to find image postgres:17-alpine locally' 125
roteiro 2 ""
rodar
check "saída 125 sem mensagem reconhecível devolve falha" e_igual "$(rc)" 1
check "  sem nova passada (não é disputa)" e_igual "$(passadas)" 1
check "  e o veredito diz que parou antes do fim, com o código" contem "$(inesperado)" "parou antes do fim do arquivo \(saída 125\)"

echo "── 5. Ruído benigno não é aviso nem motivo para aplicar de novo"
novo_caso benigno
roteiro 1 "$BENIGNO"
roteiro 2 "$DEADLOCK"
rodar
check "devolve sucesso" e_igual "$(rc)" 0
check "uma passada só" e_igual "$(passadas)" 1
check "veredito vazio" e_igual "$(inesperado)" ""
check "a tela não fala em aplicar de novo" nao_contem "$(cat "$WORK/tela")" "aplicando de novo"

if [ "$FAILS" -gt 0 ]; then printf '\n%d falha(s)\n' "$FAILS"; exit 1; fi
printf '\ntudo verde\n'
