#!/usr/bin/env bash
# Contrato estrutural do instalador de uma pergunta, sem tocar no Docker real.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
INSTALLER="$ROOT_DIR/hostgator-setup-kit/install-single-server.sh"
CANONICAL="$ROOT_DIR/hostgator-setup-kit/install.sh"
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

echo "instalador single-server"
check "sintaxe Bash valida" bash -n "$INSTALLER"
check "Supabase self-hosted esta pinado" grep -q 'self-hosted/v0.8.1' "$INSTALLER"
check "download oficial tem SHA-256 fixo" grep -q 'SUPABASE_SETUP_SHA256=' "$INSTALLER"
check "rede privada liga CRM e Supabase" grep -q 'deskcomm_single_server' "$INSTALLER"
check "Postgres do app usa DNS privado" grep -q '@supabase-db:5432/postgres' "$INSTALLER"
check "gateway interno nao depende do DNS publico" grep -q 'SUPABASE_INTERNAL_URL http://127.0.0.1:8000' "$INSTALLER"
check "validador usa o gateway interno antes do Caddy" grep -q 'SUPABASE_INTERNAL_URL' "$CANONICAL"
check "catálogo OpenRouter é preenchido no primeiro deploy" grep -q 'api/v1/cron/sync-model-catalog' "$CANONICAL"
check "administrador recebe senha aleatoria" grep -q 'openssl rand -hex 16' "$INSTALLER"
check "IA inicia explicitamente desativada" grep -q 'AI_PROVIDER disabled' "$INSTALLER"
check "nao existe mais pergunta de imagem" bash -c '! grep -q "Imagem Docker do app" "$1"' _ "$CANONICAL"
check "deriva imagens do namespace canonico" grep -q 'APP_IMAGE "${IMG_APP}:latest"' "$INSTALLER"
check "Caddy publica somente rotas Supabase necessarias" grep -q '@supabase path /auth/v1' "$ROOT_DIR/Caddyfile.single-server"
check "Studio nao e publicado pelo Caddy" bash -c '! grep -q "/studio" "$1"' _ "$ROOT_DIR/Caddyfile.single-server"
check "Compose conecta Caddy a rede privada" grep -q 'supabase_private' "$ROOT_DIR/docker-compose.single-server.yml"
check "dominio resolve internamente para o Caddy" grep -q -- '- ${DOMAIN}' "$ROOT_DIR/docker-compose.single-server.yml"
check "gateway Supabase escuta apenas em loopback" grep -q '127.0.0.1:${API_GW_HTTP_PORT' "$ROOT_DIR/hostgator-setup-kit/supabase-single-server.override.yml"
check "Postgres Supabase escuta apenas em loopback" grep -q '127.0.0.1:${POSTGRES_PORT' "$ROOT_DIR/hostgator-setup-kit/supabase-single-server.override.yml"

if [[ "$FAILS" -ne 0 ]]; then
  printf '\n%d teste(s) falharam.\n' "$FAILS"
  exit 1
fi

printf '\nTodos os testes do modo single-server passaram.\n'
