#!/usr/bin/env bash
# Arma este clone/worktree para viver como fork de longa duracao.
# Roda uma vez por arvore. Nao versiona nada: tudo em <gitdir>/info.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
GITDIR="$(git rev-parse --git-dir)"   # em worktree isto NAO e ".git"

# Arquivos de LISTA em que upstream e fork so acrescentam no fim:
# union = o git fica com os dois lados em vez de parar o merge.
mkdir -p "$GITDIR/info"
cat > "$GITDIR/info/attributes" <<'ATTR'
lib/audit/actions.ts            merge=union
lib/i18n/dicionario.ts          merge=union
supabase/migrations/MANIFEST.md merge=union
ATTR

echo "upstream = $(git remote get-url origin)"
echo "fork     = $(git remote get-url fork)"
echo "union instalado em $GITDIR/info/attributes"
