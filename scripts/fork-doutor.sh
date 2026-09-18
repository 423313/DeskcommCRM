#!/usr/bin/env bash
# fork-doutor.sh — o módulo financeiro ainda está inteiro nesta instalação?
#
# Quatro perguntas, uma linha cada. NÃO conserta nada: em cada falha imprime o
# comando exato do conserto, e a decisão de rodá-lo é de quem está na sessão.
# Roda na VPS, a partir da pasta do projeto (ou de /root), DEPOIS de todo
# update.sh. Não é chamado pelo update.sh de propósito: seria uma linha num
# arquivo do kit que o upstream edita, e conflitaria a cada sync para disparar
# só quando alguém já está olhando.
#
# O que se perde numa atualização errada é a CAPACIDADE DE LER o financeiro,
# nunca o financeiro: os dados ficam no Supabase, fora do ciclo do contêiner.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=hostgator-setup-kit/_common.sh
. hostgator-setup-kit/_common.sh
enter_project

FALHAS=0
ok()    { c_grn "  ✓ $*"; }
falha() { c_red "  ✗ $*"; FALHAS=$((FALHAS + 1)); }
dica()  { printf '      → %s\n' "$*"; }

TABELAS_DO_FINANCEIRO="financial_accounts payment_methods account_plans sales sale_items commission_rules commissions financial_entries loyalty_ledger recurring_entries"
DEFINERS_DO_FINANCEIRO="fn_finalizar_comanda fn_estornar_comanda fn_relatorio_financeiro fn_saldo_de_fidelidade"

echo "fork-doutor — o financeiro está inteiro?"

# 1. O código veio do fork?
ORIGIN="$(git remote get-url origin 2>/dev/null || echo '?')"
TAGS_ESTRANHAS="$(git tag -l 'v*' | grep -v '^v20' || true)"
if [[ "$ORIGIN" == *"423313/DeskcommCRM"* ]] && [ -z "$TAGS_ESTRANHAS" ]; then
  ok "clone aponta para o fork e só tem tags do fork"
else
  falha "clone pode voltar ao upstream (origin=$ORIGIN; tags estranhas: ${TAGS_ESTRANHAS:-nenhuma})"
  dica "git remote set-url origin https://github.com/423313/DeskcommCRM.git"
  dica "git tag -l 'v*' | grep -v '^v20' | xargs -r git tag -d && git fetch --tags origin"
fi

# 2. A imagem em execução é do fork? (as três, não só o app)
RUIM=""
for v in APP_IMAGE WORKER_IMAGE SCHEDULER_IMAGE; do
  val="${!v:-}"
  [[ "$val" == "$IMG_NS"/* ]] || RUIM="$RUIM $v=${val:-<ausente>}"
done
if [ -z "$RUIM" ]; then
  ok "as três imagens do .env estão em $IMG_NS"
else
  falha "imagem fora do fork:$RUIM"
  dica "no .env: APP_IMAGE=$IMG_APP:<versão>  WORKER_IMAGE=$IMG_WORKER:<versão>  SCHEDULER_IMAGE=$IMG_SCHEDULER:<versão>"
  dica "docker compose $(dc_files) --env-file .env up -d"
fi

# 3. A tela do financeiro responde? 307 = existe (manda logar). 404 = sumiu.
URL="${NEXT_PUBLIC_APP_URL:-}"
if [ -n "$URL" ]; then
  CODIGO="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL/app/comandas" || echo 000)"
  case "$CODIGO" in
    307|302|200) ok "/app/comandas responde $CODIGO — o módulo está no ar" ;;
    404) falha "/app/comandas responde 404 — a imagem em execução NÃO tem o financeiro"
         dica "é o sintoma da pergunta 2: corrija as imagens e suba de novo" ;;
    *)   falha "/app/comandas respondeu $CODIGO (app fora do ar ou domínio errado)"
         dica "docker compose $(dc_files) --env-file .env ps" ;;
  esac
else
  falha "sem NEXT_PUBLIC_APP_URL no .env — não consegui sondar a tela"
fi

# 4. O schema está inteiro? Tabelas presentes e anon sem EXECUTE nas definers.
SQL="
with t as (
  select count(*) as n from information_schema.tables
  where table_schema='public' and table_name = any(string_to_array('$TABELAS_DO_FINANCEIRO',' '))
), a as (
  select count(*) as expostas from information_schema.routine_privileges
  where specific_schema='public' and grantee='anon' and privilege_type='EXECUTE'
    and routine_name = any(string_to_array('$DEFINERS_DO_FINANCEIRO',' '))
), s as (
  select provolatile from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fn_proximo_numero_de_comanda' limit 1
)
select t.n, a.expostas, coalesce((select provolatile from s),'-') from t, a;"
if LINHA="$(printf '%s' "$SQL" | psql_run -At -F' ' -f - 2>/dev/null)"; then
  read -r N EXPOSTAS VOL <<<"$LINHA"
  if [ "$N" = "10" ] && [ "$EXPOSTAS" = "0" ] && [ "$VOL" = "s" ]; then
    ok "10 tabelas presentes, anon sem EXECUTE nas definers, numeração de comanda é stable"
  else
    falha "schema incompleto (tabelas=$N/10, definers expostas a anon=$EXPOSTAS, fn_proximo_numero_de_comanda=$VOL, queria 's')"
    dica "docker run --rm -i postgres:17-alpine psql \"\$(url_do_schema)\" -f - < /root/fork-apendice.sql   # idempotente"
  fi
else
  falha "não consegui consultar o banco (SUPABASE_DB_URL no .env?)"
fi

# 5. O resgate está à mão?
if [ -f /root/fork-apendice.sql ]; then
  if cmp -s /root/fork-apendice.sql supabase/fork-apendice.sql; then
    ok "/root/fork-apendice.sql existe e é igual ao da árvore"
  else
    falha "/root/fork-apendice.sql existe mas DIFERE do da árvore (um dos dois está velho)"
    dica "cp supabase/fork-apendice.sql /root/fork-apendice.sql   # se a árvore for a versão certa"
  fi
else
  falha "/root/fork-apendice.sql não existe — sem cópia fora da árvore que o git checkout substitui"
  dica "cp supabase/fork-apendice.sql /root/fork-apendice.sql"
fi

echo
if [ "$FALHAS" -eq 0 ]; then
  c_grn "tudo inteiro."
else
  c_red "$FALHAS problema(s). Os comandos acima consertam; rode-os você, não eu."
  exit 1
fi
