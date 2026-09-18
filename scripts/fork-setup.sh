#!/usr/bin/env bash
# Arma este clone/worktree para viver como fork de longa duracao.
# Roda uma vez por arvore. Nao versiona nada: tudo em <gitdir>/info.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
# ⚠️ COMMON dir, nao o git-dir do worktree. O git resolve `info/attributes`
# pelo diretorio COMUM, e num worktree o `--git-dir` aponta para
# `.git/worktrees/<nome>` — o arquivo era escrito la e NINGUEM o lia. Medido em
# 18/09/2026: `git check-attr merge` dizia `unspecified` para dois dos tres
# arquivos, e o unico que funcionava vinha do `.gitattributes` versionado.
# O comentario anterior aqui afirmava o oposto, e foi o que escondeu a falha.
GITDIR="$(git rev-parse --git-common-dir)"

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
