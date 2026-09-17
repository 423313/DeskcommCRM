#!/usr/bin/env bash
# Traz a main do upstream para dentro da branch do fork.
# Rode SEMANALMENTE. Com 2500 commits/mes no upstream, atraso longo vira reescrita.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

[ -z "$(git status --porcelain)" ] || { echo "arvore suja. commite ou guarde antes."; exit 1; }

git fetch origin --quiet
ANTES=$(git rev-list --count HEAD..origin/main)
echo "upstream esta $ANTES commits a frente."
[ "$ANTES" -gt 0 ] || { echo "nada a trazer."; exit 0; }

# baseline.sql e DERIVADO aqui: o do upstream + o apendice do fork.
# Resolver conflito nele a mao e trabalho perdido; a gente regenera.
if ! git merge origin/main --no-edit; then
  if git diff --name-only --diff-filter=U | grep -qx supabase/baseline.sql; then
    echo "regenerando baseline.sql (upstream puro + supabase/fork-apendice.sql)"
    git checkout --theirs supabase/baseline.sql
    cat supabase/fork-apendice.sql >> supabase/baseline.sql
    git add supabase/baseline.sql
  fi
  RESTANTES=$(git diff --name-only --diff-filter=U)
  if [ -n "$RESTANTES" ]; then
    echo
    echo "conflitos que precisam de voce:"; echo "$RESTANTES"
    echo
    echo "quase sempre e 'os dois lados acrescentaram um campo': fique com OS DOIS."
    echo "quando resolver: git add <arquivos> && git commit"
    exit 1
  fi
  git commit --no-edit
fi

echo "merge feito. agora prove, que e o que o git nao sabe:"
echo "  pnpm typecheck && pnpm test:unit"
echo "  pnpm test:db      # o unico que pega mudanca de contrato no schema"
