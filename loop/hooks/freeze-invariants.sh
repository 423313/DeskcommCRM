#!/usr/bin/env bash
# freeze-invariants.sh — tests/invariants/** é o eval do épico (congelado).
# ADICIONAR arquivo novo é permitido (G1-03 cria a suíte; fases seguintes podem
# acrescentar invariantes). MODIFICAR ou DELETAR arquivo pré-existente é bloqueado
# sem DESKCOMM_GOV_INVARIANTS_EDIT=1.
# Exceção legítima: o flip test.fails → teste normal nas fases G2+ (o catraca da
# G1-03) — a sessão exporta a env E o commit message cita o flip.
set -euo pipefail

[ "${DESKCOMM_GOV_INVARIANTS_EDIT:-0}" = "1" ] && exit 0

# Status M/D/R (rename = delete disfarçado) em tests/invariants/ bloqueia; A passa.
violations=$(git diff --cached --name-status \
  | awk '$1 ~ /^(M|D|R)/ && ($2 ~ /^tests\/invariants\// || $3 ~ /^tests\/invariants\//) { print $0 }')

# ── Conteúdo que JÁ ESTÁ na `main` não é edição desta branch ──────────────
#
# Um `git merge origin/main` que dá CONFLITO passa por `git commit`, e aí o
# pre-commit roda sobre o índice INTEIRO do merge — inclusive os invariantes
# que vieram da main. O guard lia isso como "o autor mexeu no eval".
#
# Medido em 18/09/2026 (caso 4/5 da issue #1161, medido por outra sessão da
# triagem): o merge de 38 commits da main numa branch de trabalho foi
# BLOQUEADO acusando `tests/invariants/rls-completude-varredura.test.ts`.
# A procedência, nos dois sentidos — o segundo é o controle que fecha:
#   git log --oneline origin/main..HEAD -- <o invariante>   → VAZIO
#   git log --oneline HEAD..origin/main -- <o invariante>   → ebeb83807
# Nenhum commit da branch tocou o arquivo; foi a main chegando.
#
# E era IMPOSSÍVEL de satisfazer: a única exceção que o guard oferece é o flip
# de test.fails, e num merge não há flip nenhum. Dentro do que ele oferecia
# sobravam descartar trabalho alheio ou não mesclar a main — as duas piores
# que abrir a válvula por rotina, que é como uma guarda deixa de proteger.
#
# O eixo do filtro é identidade de CONTEÚDO, não existência de CAMINHO. A
# forma do guard de migration (`git cat-file -e origin/main:$p`) FURA esta
# guarda: o invariante existe na main tanto quando a main o trouxe quanto
# quando a branch o reescreveu — medido, a edição própria escondida dentro do
# merge passaria com exit 0. Comparar o blob ENCENADO com o da main distingue
# os dois: igual = a main chegando; diferente = autoria desta branch.
#
# `[ -n "$encenado" ]` preserva a acusação em DELETE (não há blob no índice) —
# sem essa metade, apagar um invariante que a main tem passaria batido.
# O `git rev-parse --verify origin/main` do `if` é guarda de intenção e economia de
# duas chamadas por arquivo, NÃO o que sustenta o fork: medido num clone sem a ref,
# com e sem ele, os três estados (modificar, deletar o da main, deletar o próprio)
# dão exit 1 igual. Quem faz a guarda falhar FECHADA sem a ref é o `[ -n "$encenado" ]`
# acima — sem a ref, `na_main` é sempre vazio, então M/R diferem e os deletes são
# pegos por ele. Vale escrever porque o palpite natural é creditar o fork ao `if`.
if [ -n "$violations" ] && git rev-parse --verify --quiet origin/main >/dev/null; then
  violations=$(while IFS= read -r linha; do
    [ -z "$linha" ] && continue
    caminho=$(printf '%s' "$linha" | awk -F'\t' '{ print ($3 != "" ? $3 : $2) }')
    encenado=$(git rev-parse --quiet --verify ":$caminho" 2>/dev/null || true)
    na_main=$(git rev-parse --quiet --verify "origin/main:$caminho" 2>/dev/null || true)
    [ -n "$encenado" ] && [ "$encenado" = "$na_main" ] && continue
    printf '%s\n' "$linha"
  done <<<"$violations")
fi

if [ -n "$violations" ]; then
  echo "pre-commit BLOQUEADO: tests/invariants/** é congelado — modificar/deletar invariante existente:" >&2
  echo "$violations" >&2
  echo "Invariante incômodo = ou o código está errado, ou o invariante está mal-escrito —" >&2
  echo "o segundo caso vai pra inbox (loop/INBOX.md), não pro Edit." >&2
  echo "Exceção legítima (o catraca): flip de test.fails → teste normal quando a fase G2+ corrige o gap." >&2
  echo "Nesse caso: exporte DESKCOMM_GOV_INVARIANTS_EDIT=1 e cite o flip no commit message." >&2
  exit 1
fi

exit 0
