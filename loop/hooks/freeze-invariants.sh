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

# ── O que o OUTRO LADO DO MERGE mudou não é edição desta branch ────────────
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
# ── O EIXO: PROCEDÊNCIA, não conteúdo nem existência de caminho ────────────
#
# Duas formas mais simples foram MEDIDAS e as duas furam:
#
#   (a) existência de caminho (`git cat-file -e origin/main:$p`, a forma do
#       guard de migration): o invariante existe na main tanto quando a main o
#       trouxe quanto quando a branch o reescreveu. Edição própria escondida
#       dentro do merge passa com exit 0.
#   (b) identidade de CONTEÚDO contra `origin/main` (`:$p` == `origin/main:$p`):
#       também é verdade quando a sessão REVERTE o invariante para a versão da
#       main — que é autoria, e é o exato enfraquecimento que o freeze existe
#       para impedir. Medido pelo caminho de produção (`git commit` real, pelo
#       dispatcher), no mesmo estado: hook (b) → exit 0, o invariante commitado
#       com a asserção que a branch tinha acrescentado APAGADA; hook anterior →
#       exit 1. E a rota não precisa de válvula em passo nenhum: basta mesclar
#       LIMPO a branch de um colega que fortaleceu o invariante (merge limpo não
#       chama hook) e reverter no commit seguinte. Alcançabilidade medida nos
#       últimos 300 commits sem-merge da main: 15 modificações de invariante —
#       "HEAD tem o invariante diferente do da main" é rotina.
#
# O eixo certo é o que o outro lado do merge EFETIVAMENTE MUDOU, e isso exige
# três referências, não duas:
#
#   ENCENADO    o índice                          (`:<path>`)
#   OUTRO_LADO  MERGE_HEAD (só existe DURANTE um merge)
#   BASE        git merge-base HEAD MERGE_HEAD
#
# Um caminho sai da lista se, e só se, as DUAS condições valem:
#   1. o ENCENADO é idêntico ao de MERGE_HEAD — inclusive "ausente nos dois",
#      que é a deleção que o merge trouxe; E
#   2. MERGE_HEAD DIFERE da BASE, isto é, o outro lado realmente mexeu ali.
#
# A condição 2 é o que mata a forma (b): fora de um merge não há MERGE_HEAD, e
# então NADA é excluído — reverter para a main em commit normal volta a ser
# acusado. E ela é o que mantém o caso D2 vermelho: a branch criou o invariante
# e o apaga dentro do merge; ausente nos dois lados satisfaz a condição 1, mas a
# BASE também não o tem, então o outro lado não mexeu em nada e a perda é
# autoria da branch.
#
# A condição 1 vale para TODOS os caminhos da linha. Numa linha `R` (rename) o
# path VELHO é uma DELEÇÃO, e julgar só o novo (`$3`) deixava o invariante
# antigo ser apagado em silêncio — medido com arquivos reais: `R058` de um
# invariante para outro passava com exit 0 pelo dispatcher. O par `R` o git
# forma sozinho quando a adição que chega é ≥50% similar ao arquivo apagado.
#
# ⚠️ Falhar FECHADO é o lado seguro aqui (bloquear pede uma válvula declarada;
# liberar perde o eval em silêncio). Por isso: sem MERGE_HEAD, merge de mais de
# um lado (octopus) ou `merge-base` sem ancestral comum → nenhuma exclusão.
#
# (E o `[ -f ... ] && lados=...` que pedia uma linha só aqui NÃO serve: sob
# `set -e`, o compound inteiro sai 1 quando o arquivo não existe e mata o hook —
# fecha, mas fecha SEMPRE, inclusive no commit comum sem invariante nenhum.)
arquivo_merge_head="$(git rev-parse --git-path MERGE_HEAD)"
lados=0
if [ -f "$arquivo_merge_head" ]; then
  lados=$(grep -c . "$arquivo_merge_head" || true)
fi

if [ -n "$violations" ] && [ "$lados" = "1" ]; then
  outro_lado=$(git rev-parse --quiet --verify MERGE_HEAD^0 2>/dev/null || true)
  base=$(git merge-base HEAD "$outro_lado" 2>/dev/null || true)
  if [ -n "$outro_lado" ] && [ -n "$base" ]; then
    violations=$(while IFS= read -r linha; do
      [ -z "$linha" ] && continue
      veio_do_merge=1
      while IFS= read -r caminho; do
        [ -z "$caminho" ] && continue
        encenado=$(git rev-parse --quiet --verify ":$caminho" 2>/dev/null || true)
        no_outro=$(git rev-parse --quiet --verify "$outro_lado:$caminho" 2>/dev/null || true)
        na_base=$(git rev-parse --quiet --verify "$base:$caminho" 2>/dev/null || true)
        if [ "$encenado" = "$no_outro" ] && [ "$no_outro" != "$na_base" ]; then continue; fi
        veio_do_merge=0
        break
      done <<EOF
$(printf '%s' "$linha" | awk -F'\t' '{ for (i = 2; i <= NF; i++) if ($i != "") print $i }')
EOF
      [ "$veio_do_merge" = "1" ] && continue
      printf '%s\n' "$linha"
    done <<<"$violations")
  fi
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
