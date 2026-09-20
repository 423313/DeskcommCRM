#!/usr/bin/env bash
# Prova as duas garantias do instalador local: ele não apaga o ambiente de
# quem já usa o clone, e a senha do dono não nasce publicada.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
INSTALADOR="$ROOT_DIR/ubuntu-local-installer.sh"
STACK="$ROOT_DIR/scripts/local-stack.sh"
SUPA="$ROOT_DIR/scripts/local-supabase.sh"
ENVGEN="$ROOT_DIR/scripts/local-env.sh"
FAILS=0

check() {
  local descricao="$1"
  shift
  if "$@"; then
    printf '  ✓ %s\n' "$descricao"
  else
    printf '  ✗ %s\n' "$descricao"
    FAILS=$((FAILS + 1))
  fi
}

echo "stack local — instalador e scripts"

for arquivo in "$INSTALADOR" "$STACK" "$SUPA" "$ENVGEN"; do
  check "sintaxe Bash válida: ${arquivo#"$ROOT_DIR"/}" bash -n "$arquivo"
done

# ── A senha do dono ────────────────────────────────────────────────────────
#
# O instalador publica as credenciais na tela no fim. Se a senha for literal
# no arquivo, ela está publicada NO REPOSITÓRIO — e o `.env.local` que este
# mesmo script gera aponta a aplicação para o IP da VM na rede, não para
# 127.0.0.1. Qualquer máquina da rede alcançaria o CRM com a senha do GitHub.
check "a senha do dono não é literal no script" bash -c '
  ! grep -qE "^export OWNER_PASSWORD=\"[^$]" "$1"' _ "$INSTALADOR"
check "a senha do dono nasce aleatória" bash -c '
  grep -q "openssl rand" <<<"$(grep "^export OWNER_PASSWORD=" "$1")"' _ "$INSTALADOR"
check "quem quiser escolher a senha consegue (OWNER_PASSWORD respeitado)" bash -c '
  grep -q "OWNER_PASSWORD:-" "$1"' _ "$INSTALADOR"

# ── O .env.local de quem já usa o clone ────────────────────────────────────
#
# O instalador roda DENTRO de um clone existente (ele só clona quando não acha
# `package.json`), e 93 scripts deste repositório leem `.env.local`. Escrever
# por cima sem cópia apaga o ambiente de trabalho de quem rodar por curiosidade.
check "o instalador faz backup de um .env.local que não é local" bash -c '
  grep -q "cloud-backup" "$1"' _ "$INSTALADOR"
check "o instalador reconhece o ambiente local pela marca DESKCOMM_ENV_MODE" bash -c '
  grep -q "DESKCOMM_ENV_MODE=local" "$1"' _ "$INSTALADOR"
check "o .env.local gerado carrega a marca (senão o próximo run apaga sem backup)" bash -c '
  awk "/^cat <<EOF > .env.local\$/,/^EOF\$/" "$1" | grep -q "^DESKCOMM_ENV_MODE=local\$"' _ "$INSTALADOR"

# ── O COMPORTAMENTO, e não só o texto ──────────────────────────────────────
#
# As checagens acima leem o arquivo; esta EXECUTA o trecho da guarda contra um
# `.env.local` de mentira, que é a única forma de saber que a condição casa.
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
guarda() {
  # O mesmo bloco do instalador, extraído por marcador — se ele mudar lá, esta
  # extração falha e o teste fica vermelho em vez de medir um texto obsoleto.
  awk '/^if \[\[ -s .env.local \]\]/,/^fi$/' "$INSTALADOR"
}
[[ -n "$(guarda)" ]] || { printf '  ✗ não achei a guarda no instalador\n'; FAILS=$((FAILS + 1)); }

(
  cd "$TMP_DIR" || exit 1
  paint() { :; }
  printf 'NEXT_PUBLIC_SUPABASE_URL=https://nuvem.supabase.co\n' > .env.local
  eval "$(guarda)"
) >/dev/null 2>&1
check "ambiente da NUVEM é copiado antes de ser substituído" test -s "$TMP_DIR/.env.local.cloud-backup"

(
  cd "$TMP_DIR" || exit 1
  rm -f .env.local.cloud-backup
  paint() { :; }
  printf 'DESKCOMM_ENV_MODE=local\nNEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n' > .env.local
  eval "$(guarda)"
) >/dev/null 2>&1
check "ambiente JÁ local não vira backup a cada run" bash -c '! test -e "$1/.env.local.cloud-backup"' _ "$TMP_DIR"

if [[ "$FAILS" -gt 0 ]]; then
  printf '\n%s verificação(ões) falharam\n' "$FAILS"
  exit 1
fi
printf '\ntodas as verificações passaram\n'
