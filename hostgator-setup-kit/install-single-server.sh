#!/usr/bin/env bash
# Instala CRM + Supabase self-hosted na mesma VPS. A unica resposta humana e o
# dominio; todo segredo e a conta inicial sao gerados localmente.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly KIT_DIR="$ROOT_DIR/hostgator-setup-kit"
readonly SUPABASE_REF="self-hosted/v0.8.1"
readonly SUPABASE_SETUP_URL="https://raw.githubusercontent.com/supabase/supabase/${SUPABASE_REF}/docker/setup.sh"
readonly SUPABASE_SETUP_SHA256="848973911bd5fa03dfd714b67bff4132e49b1b7777b6edb6ab0a9d9e85bc813c"
readonly RUNTIME_DIR="$ROOT_DIR/.runtime"
readonly SUPABASE_DIR="$RUNTIME_DIR/supabase"
readonly CREDENTIALS_FILE="$RUNTIME_DIR/admin-credentials"
readonly SINGLE_SERVER_NETWORK="deskcomm_single_server"

# shellcheck source=_common.sh
source "$KIT_DIR/_common.sh"

usage() {
  cat <<'EOF'
Uso: bash hostgator-setup-kit/install-single-server.sh [--domain DOMINIO]

Instala na mesma VPS:
  - Supabase self-hosted oficial (Postgres 17, Auth, REST, Realtime e Storage);
  - app, worker, scheduler, WAHA, Redis/SRH e Caddy;
  - HTTPS e roteamento por um unico dominio.

Sem --domain, pergunta somente o dominio. Administrador, senha e todos os
segredos sao gerados automaticamente. A IA nasce desativada e pode ser
configurada depois pela interface.
EOF
}

validar_dominio() {
  local dominio="$1"
  [[ "$dominio" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]]
}

ler_env() {
  local arquivo="$1" chave="$2" linha
  linha="$(grep -E "^${chave}=" "$arquivo" | tail -1 || true)"
  linha="${linha#*=}"
  linha="${linha#\"}"; linha="${linha%\"}"
  linha="${linha#\'}"; linha="${linha%\'}"
  printf '%s' "$linha"
}

domain="${DOMAIN:-}"
while (($#)); do
  case "$1" in
    --domain)
      shift
      (($#)) || die "--domain exige um dominio."
      domain="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *) usage >&2; exit 2;;
  esac
  shift
done

if [[ -z "$domain" ]]; then
  read -r -p "Dominio do CRM (ex: crm.suaempresa.com.br): " domain
fi
domain="$(printf '%s' "$domain" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
validar_dominio "$domain" || die "Dominio invalido. Informe somente o host, sem https:// nem caminho."

command -v docker >/dev/null 2>&1 || die "Docker nao esta instalado. Rode primeiro ubuntu-production-installer.sh."
docker info >/dev/null 2>&1 || die "Nao foi possivel acessar o daemon Docker."
command -v curl >/dev/null 2>&1 || die "curl nao encontrado."
command -v jq >/dev/null 2>&1 || die "jq nao encontrado."
command -v openssl >/dev/null 2>&1 || die "openssl nao encontrado."

mem_kb="$(awk '/MemTotal:/ {print $2}' /proc/meminfo)"
if [[ "${mem_kb:-0}" -lt 3900000 && "${SINGLE_SERVER_ALLOW_LOW_MEMORY:-0}" != "1" ]]; then
  die "O modo single-server exige pelo menos 4 GB de RAM e recomenda 8 GB. Esta VPS tem aproximadamente $((mem_kb / 1024)) MB."
fi

mkdir -p "$RUNTIME_DIR"
chmod 700 "$RUNTIME_DIR"

if [[ ! -f "$SUPABASE_DIR/.env" ]]; then
  step "Preparando o Supabase self-hosted ${SUPABASE_REF}"
  setup_tmp="$(mktemp)"
  trap 'rm -f "${setup_tmp:-}"' EXIT
  curl -fsSL --max-time 30 "$SUPABASE_SETUP_URL" -o "$setup_tmp"
  checksum="$(sha256sum "$setup_tmp" | awk '{print $1}')"
  [[ "$checksum" == "$SUPABASE_SETUP_SHA256" ]] || die "O instalador oficial do Supabase nao passou na verificacao SHA-256."
  (cd "$ROOT_DIR" && sh "$setup_tmp" -y --skip-deps --ref "$SUPABASE_REF" --project-dir ".runtime/supabase")
  rm -f "$setup_tmp"
  trap - EXIT
fi

cp "$KIT_DIR/supabase-single-server.override.yml" "$SUPABASE_DIR/docker-compose.deskcomm.yml"
docker network inspect "$SINGLE_SERVER_NETWORK" >/dev/null 2>&1 \
  || docker network create "$SINGLE_SERVER_NETWORK" >/dev/null

supabase_env="$SUPABASE_DIR/.env"
set_env_var "$supabase_env" SUPABASE_PUBLIC_URL "https://${domain}"
set_env_var "$supabase_env" API_EXTERNAL_URL "https://${domain}/auth/v1"
set_env_var "$supabase_env" SITE_URL "https://${domain}"
set_env_var "$supabase_env" ADDITIONAL_REDIRECT_URLS "https://${domain}/auth/confirm,https://${domain}/**"
# Confirmacao de e-mail fica LIGADA: sem ela qualquer pessoa cria conta com
# um e-mail que nao e dela. Fixada aqui, e nao herdada do default do Supabase,
# para que um bump do SUPABASE_REF nao a desligue calado. Vigiado por
# tests/shell/single-server-installer.test.sh.
set_env_var "$supabase_env" ENABLE_EMAIL_AUTOCONFIRM false
set_env_var "$supabase_env" PROXY_DOMAIN "$domain"
set_env_var "$supabase_env" CERTBOT_EMAIL "admin@${domain}"
set_env_var "$supabase_env" SINGLE_SERVER_NETWORK "$SINGLE_SERVER_NETWORK"
set_env_var "$supabase_env" COMPOSE_FILE "docker-compose.yml:docker-compose.deskcomm.yml"

step "Subindo o Supabase local"
(cd "$SUPABASE_DIR" && sh run.sh start)

anon_key="$(ler_env "$supabase_env" ANON_KEY)"
service_key="$(ler_env "$supabase_env" SERVICE_ROLE_KEY)"
postgres_password="$(ler_env "$supabase_env" POSTGRES_PASSWORD)"
[[ -n "$anon_key" && -n "$service_key" && -n "$postgres_password" ]] \
  || die "O Supabase nao gerou ANON_KEY, SERVICE_ROLE_KEY ou POSTGRES_PASSWORD."
postgres_password_uri="$(jq -rn --arg value "$postgres_password" '$value|@uri')"

if [[ -f "$CREDENTIALS_FILE" ]]; then
  owner_email="$(ler_env "$CREDENTIALS_FILE" OWNER_EMAIL)"
  owner_password="$(ler_env "$CREDENTIALS_FILE" OWNER_PASSWORD)"
else
  owner_email="admin@${domain}"
  owner_password="$(openssl rand -hex 16)"
  umask 077
  {
    printf 'OWNER_EMAIL=%s\n' "$owner_email"
    printf 'OWNER_PASSWORD=%s\n' "$owner_password"
  } > "$CREDENTIALS_FILE"
  chmod 600 "$CREDENTIALS_FILE"
fi

[[ -f "$ROOT_DIR/.env" ]] || { umask 077; : > "$ROOT_DIR/.env"; chmod 600 "$ROOT_DIR/.env"; }
app_env="$ROOT_DIR/.env"
set_env_var "$app_env" DOMAIN "$domain"
set_env_var "$app_env" ACME_EMAIL "admin@${domain}"
set_env_var "$app_env" REVERSE_PROXY caddy
set_env_var "$app_env" SINGLE_SERVER 1
set_env_var "$app_env" SINGLE_SERVER_NETWORK "$SINGLE_SERVER_NETWORK"
set_env_var "$app_env" PSQL_DOCKER_NETWORK "$SINGLE_SERVER_NETWORK"
set_env_var "$app_env" SUPABASE_INTERNAL_URL http://127.0.0.1:8000
set_env_var "$app_env" NEXT_PUBLIC_SUPABASE_URL "https://${domain}"
set_env_var "$app_env" NEXT_PUBLIC_SUPABASE_ANON_KEY "$anon_key"
set_env_var "$app_env" SUPABASE_SERVICE_ROLE_KEY "$service_key"
set_env_var "$app_env" SUPABASE_DB_URL "postgresql://postgres:${postgres_password_uri}@supabase-db:5432/postgres"
# Imagens: nao se grava nada aqui. O install.sh resolve a ultima versao
# publicada das TRES imagens e grava numero de versao (nunca tag movel).
set_env_var "$app_env" OWNER_EMAIL "$owner_email"
set_env_var "$app_env" OWNER_PASSWORD "$owner_password"
set_env_var "$app_env" APP_NAME DeskcommCRM
set_env_var "$app_env" APP_LOCALE pt-BR
# IA: nenhuma chave e gravada, entao ela nasce sem credencial (desligada) e o
# fim do install.sh aponta o caminho em IA > Credenciais. Chaves NAO sao
# zeradas: re-rodar este script nao pode apagar uma chave posta depois.
set_env_var "$app_env" SENTRY_DSN off

step "Configurando o CRM sem perguntas adicionais"
cd "$ROOT_DIR"
bash "$KIT_DIR/install.sh" --yes

cat <<EOF

Credenciais iniciais (arquivo protegido com permissao 600):
  usuario: ${owner_email}
  senha:   ${owner_password}
  arquivo: ${CREDENTIALS_FILE}

Supabase, banco, Auth, APIs, CRM, WhatsApp, Redis e proxy estao nesta VPS.
A IA inicia desativada; configure um provedor depois em Agente de IA.
EOF
