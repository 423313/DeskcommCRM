#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMMON="$ROOT/hostgator-setup-kit/_common.sh"
BACKUP="$ROOT/hostgator-setup-kit/backup.sh"
RESTORE="$ROOT/hostgator-setup-kit/restore.sh"

# Regressão: `docker compose config --volumes` devolve `waha-data`, mas o volume
# real tem o prefixo do projeto (ex.: `deskcommcrm_waha-data`). O backup antigo
# montava um volume global vazio e gerava um .tgz de ~87 bytes que passava no
# `tar tzf`. A fonte da verdade deve ser a montagem `/app/.sessions` do contêiner.
grep -q 'dc ps -a -q waha' "$COMMON"
grep -q 'eq .Destination "/app/.sessions"' "$COMMON"
grep -q 'vol="$(volume_waha_data)"' "$BACKUP"
grep -q 'vol="$(volume_waha_data)"' "$RESTORE"

if grep -q 'dc config --volumes.*waha-data' "$BACKUP" "$RESTORE"; then
  echo 'backup/restore ainda confiam no nome lógico do volume WAHA' >&2
  exit 1
fi

echo 'ok: backup e restore resolvem o volume físico das sessões WAHA'
