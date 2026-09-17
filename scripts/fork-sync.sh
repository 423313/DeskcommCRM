#!/usr/bin/env bash
# Traz a main do upstream para dentro da branch do fork.
# Rode por MOTIVO, nao por calendario: antes de publicar, quando houver correcao
# do upstream que te interessa, ou quando o atraso passar do teto (ver TETO).
# A regua e o FORK.md, secao "O ciclo".
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

[ -z "$(git status --porcelain)" ] || { echo "arvore suja. commite ou guarde antes."; exit 1; }

git fetch origin --quiet
ANTES=$(git rev-list --count HEAD..origin/main)
DESDE=$(git log -1 --format=%cd --date=short origin/main 2>/dev/null || echo "?")
echo "upstream esta $ANTES commits a frente (ultimo commit la: $DESDE)."
[ "$ANTES" -gt 0 ] || { echo "nada a trazer."; exit 0; }

# TETO: acima disto o merge deixa de ser leitura e vira arqueologia. O numero
# saiu de medicao, nao de chute: 169 commits custaram DOIS conflitos de um
# minuto (17/09/2026). Nao e limite tecnico - e o ponto onde vale parar e
# decidir com calma, em vez de empurrar.
TETO=200
if [ "$ANTES" -gt "$TETO" ]; then
  echo
  echo "ATENCAO: passou do teto de $TETO commits. Reserve tempo e rode os tres"
  echo "gates depois; nao encaixe este sync antes de outra coisa."
  echo
fi

# baseline.sql e DERIVADO aqui: o do upstream + o apendice do fork.
# Resolver conflito nele a mao e trabalho perdido; a gente regenera.
if ! git merge origin/main --no-edit; then
  if git diff --name-only --diff-filter=U | grep -qx supabase/baseline.sql; then
    echo "regenerando baseline.sql (upstream + supabase/fork-apendice.sql)"
    git checkout --theirs supabase/baseline.sql
    python scripts/fork-baseline.py
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

echo "merge feito. agora prove, que e o que o git NAO sabe:"
echo "  pnpm install      # PRIMEIRO: o upstream adiciona dependencia sem avisar,"
echo "                    # e o sintoma parece 'o merge quebrou o mundo'"
echo "  pnpm typecheck && pnpm test:unit"
echo "  pnpm test:db      # o unico que pega mudanca de contrato no schema"
echo
echo "a 17 falhas em 5 arquivos (leads-import, lgpd-pdf-*, rascunho-superado,"
echo "followups-de-demonstracao) ja vem vermelhas da main do upstream - confira"
echo "contra ela antes de culpar o merge."
