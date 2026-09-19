#!/usr/bin/env bash
# checar-colisao-de-migration.sh — o número que o PR acrescenta não pode já estar tomado.
#
# ## A classe de defeito (issue #285)
#
# Dois PRs com migrations de NOMES DIFERENTES não conflitam textualmente: o merge sai
# limpo, o commit nasce sem `pre-commit`, e o número duplicado entra calado. Medido em
# 14/09: o #804 entrou assim com o `0241` que o #770 já ocupava desde o lote 2, e nenhuma
# guarda viu (TRIAGEM.md:913-924). O `0161` foi disputado por cinco PRs. A régua por
# número existia só em hook local — `core.hooksPath` é configuração local, NÃO versionada:
# um fork nunca a executa, e nenhum job do `ci.yml` a invocava
# (`triagem/references/complemento-do-ci.md`, §1).
#
# ## A régua é a que o repo já pratica — a mesma, contra o REMOTO
#
# Espelha a parte de NNNN/timestamp de
# `.agents/skills/deskcomm-contribuir/scripts/hooks/check-migration-triple.sh`, trocando o
# index pelo diff do PR (o CI não tem nada staged). O que a régua decide:
#
#   * só o arquivo que o PR ACRESCENTA entra na conta (`--diff-filter=A`): editar ou
#     reordenar migration existente não acrescenta arquivo nenhum, e passa;
#   * com `-M`, renome entra como `R` e passa. LIMITE DECLARADO, igual ao do hook: ele
#     "não é rede para renumeração" (TRIAGEM.md:906) — fechar isso é a sonda de árvore do
#     mantenedor, não este passo;
#   * dois arquivos DESTE PR com o mesmo NNNN (ou o mesmo timestamp) reprovam: é a sonda
#     de árvore da TRIAGEM.md:926 (`uniq -d`) restrita às adições do PR;
#   * duplicata que JÁ existe na base não é do PR (TRIAGEM.md:934: com linha de base, "se
#     ela também devolver a duplicata, o número é antigo e não do lote");
#   * o merge da própria main não acrescenta nada: no `pull_request` o HEAD é o merge ref,
#     que já contém a base.
#
# ## Por que o fetch da base mora aqui
#
# Medido no run 35091061120: o checkout do job `verify` é `--depth=1` do merge ref e NÃO
# tem ref `origin/main` algum. O diff de duas ÁRVORES precisa das duas árvores, não de
# merge-base — que é justamente o que um clone raso não tem, e o que torna
# `origin/main...HEAD` impossível ali. Então a base é resolvida aqui, com fetch raso
# quando o clone é raso.
#
# `origin/<branch>` é ATUALIZADO antes de medir, sempre: ref remoto velho dá falso verde
# exatamente no caso desta issue — outro PR mergeou o número primeiro e a branch ainda
# aponta para o fork point. Se o fetch falhar e houver cópia local, mede-se contra ela
# **declarando** num `::warning` — reprovar por rede é a classe de vermelho que treina a
# ignorar vermelho (razão no cabeçalho de tests/unit/preambulo-do-ci-nao-come-o-relogio.test.ts).
#
# ## O limite medido: branch atrás da base
#
# O diff de duas árvores só tem o sentido do merge quando o HEAD CONTÉM a base — que é o
# caso do `pull_request`, onde o HEAD é o merge ref (base + PR; medido no run
# 35091061120). Numa branch que ficou atrás, a migration que só existe na base entra como
# REMOÇÃO e o `-M` a pareia com a migration nova do PR: medido, `git diff --name-status -M
# origin/main HEAD -- supabase/migrations/` devolveu
# `R100 ..._0268_rascunho.sql -> ..._0268_lembrete.sql` — e a adição desaparece do
# `--diff-filter=A`. Verde silencioso é o que este passo não pode dar, então a divergência
# é DECLARADA num `::warning`; no CI ela não aparece (a base é pai do merge ref, e o clone
# raso nem history tem para julgar).
#
# ## O universo medido (issue #1155)
#
# "Próximo livre" medido só em BASE ∪ HEAD engana: branch local de outra sessão e head de
# outro PR aberto ocupam número e ficavam invisíveis — num único dia, a 0275 nasceu em
# dois PRs e numa branch local, e cada um perguntou a uma ferramenta que só via as duas
# árvores (três renumerações: 0265 → 0275 → 0283). Agora mede-se também refs/heads e
# refs/remotes do clone. Duas exclusões para o alvo não medir a si mesmo: refs que
# resolvem para o MESMO commit da base (já medida) ou do HEAD (este PR) saem da conta —
# a armadilha registrada na issue é a varredura apontar "tomada" para a própria branch.
# Quando outra ref levanta o teto, a saída NOMEIA quem tem o número; renumerar a própria
# branch é decisão do dono dela, não conselho cego daqui.
#
# Onde não há outras refs para medir (o clone raso do CI, por exemplo), o comportamento
# degrada para o de antes E a saída DECLARA o limite: "branches locais e outros PRs
# abertos NÃO foram medidos". Número sem régua declarada é o defeito que este repo já
# paga em outros lugares.
#
# ## Os PRs ABERTOS, inclusive de fork (19/09/2026)
#
# refs/remotes só tem branch que mora NESTE repositório. A cabeça de um PR de fork vive em
# refs/pull/N/head, que `git clone` não traz, e o universo acima não a via. Medido: o #677
# (fork) tinha o 0333, e este gate diria "livre" ao dono do #1176 — dois colegas erraram a
# redistribuição da madrugada por herdar a população desta ferramenta. Agora a cabeça de
# cada PR ABERTO entra, com três regras que custaram caro a alguém:
#
#   * a população é a LISTA DE ABERTOS (`gh pr list`), nunca o curinga refs/pull/*: a
#     cabeça persiste depois que o PR fecha — 965 cabeças contra 43 PRs abertos, medido —,
#     e um fork abandonado com número alto empurraria o "próximo livre" de todo mundo;
#   * PR listado cuja cabeça não veio é "NÃO MEDIDO: #N", e a saída declara a SOMA
#     (listados contra medidos) — o lote de fetch com `2>/dev/null` que trouxe ZERO cabeças
#     calado foi o erro de um colega na mesma noite;
#   * colisão com outro PR AVISA (::warning no arquivo), não reprova: quem entrar primeiro
#     fica e o outro renumera — o outro PR pode nunca entrar, e vermelho por coisa fora do
#     controle do autor treina a ignorar vermelho;
#   * as cabeças buscadas moram num namespace DA RODADA (refs/colisao-pr/<PID>), e a
#     rodada só apaga o que é dela: todo worktree de um repositório vê as mesmas refs, e
#     duas sessões rodando isto juntas se atropelariam no meio da medição.
#
# A cabeça do PR de quem roda sai da conta por SHA (é o HEAD ou ancestral dele), nunca por
# nome de branch: `headRefName` de fork colide com o seu (o fork que abre PR da `main` dele).
# O CI não exporta GH_TOKEN para este passo: lá o bloco declara NÃO MEDIDO e o resto segue
# igual. O ganho é local, no minuto do push.
#
# ## Não medir não é passar
#
# Sem base resolvida, este passo REPROVA (exit 2) declarando o NÃO MEDIDO e o comando do
# conserto. Gate que volta verde sem ter comparado nada é a falha-em-verde que a própria
# triagem chama de mais cara num produto self-host (complemento-do-ci.md, §7).
#
# Exit: 0 medido e livre · 1 colisão · 2 não medido.
#
# Uso: bash scripts/checar-colisao-de-migration.sh [base]      (padrão: origin/main)
set -uo pipefail

BASE="${1:-origin/main}"
if ! cd "$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "::error::não estou dentro de um repositório git — não há árvore para medir."
  exit 2
fi

nao_medido() {
  echo "::error::$1"
  echo "NÃO MEDIDO: não consegui comparar com '$BASE' — isto NÃO é colisão no PR."
  echo "  Conserto: git fetch origin $BASE"
  exit 2
}

# ── a base é o REMOTO (complemento-do-ci.md §1), nunca uma cópia velha ─────────────
if [ "${BASE#origin/}" != "$BASE" ]; then
  remoto="${BASE#origin/}"
  opcoes=()
  [ -f "$(git rev-parse --git-dir)/shallow" ] && opcoes+=(--depth=1)
  if ! git fetch --no-tags ${opcoes[@]+"${opcoes[@]}"} origin \
       "+refs/heads/${remoto}:refs/remotes/origin/${remoto}" >/dev/null 2>&1; then
    git rev-parse --verify -q "${BASE}^{commit}" >/dev/null 2>&1 \
      || nao_medido "não consegui buscar '$BASE' e não existe cópia local dela."
    echo "::warning::fetch de '$BASE' falhou — medindo contra a cópia LOCAL, que pode estar atrasada."
  fi
elif ! git rev-parse --verify -q "${BASE}^{commit}" >/dev/null 2>&1; then
  nao_medido "'$BASE' não resolve para commit nenhum neste clone."
fi

# ── o que este PR acrescenta ──────────────────────────────────────────────────────
# Antes de medir: se a branch está atrás da base, o diff de árvores muda de sentido (a
# migration que só existe na base vira remoção e o `-M` a pareia com a adição do PR). Não
# há history para julgar no clone raso do CI, e lá a base é pai do merge ref — o aviso é
# para quem roda isto fora do CI.
if [ ! -f "$(git rev-parse --git-dir)/shallow" ] \
   && ! git merge-base --is-ancestor "$BASE" HEAD 2>/dev/null; then
  echo "::warning::a base '$BASE' andou depois do fork — esta é a medição da BRANCH, não a do merge. Rode 'git merge $BASE' e meça de novo: migration nova pareada como renome pelo -M não aparece aqui."
fi

adicionadas="$(git diff --name-only -M --diff-filter=A "$BASE" HEAD -- supabase/migrations/ 2>/dev/null \
  | grep -E '^supabase/migrations/[^/]+\.sql$' || true)"
if [ -z "$adicionadas" ]; then
  echo "OK — nenhuma migration acrescentada por este PR (base '$BASE')."
  exit 0
fi
adicionadas_nomes="$(xargs -n1 basename <<<"$adicionadas" | sed '/^$/d')"

base_arvore="$(git ls-tree -r --name-only "$BASE" -- supabase/migrations 2>/dev/null | sed 's#^supabase/migrations/##' || true)"
head_arvore="$(git ls-tree -r --name-only HEAD -- supabase/migrations 2>/dev/null | sed 's#^supabase/migrations/##' || true)"

# ── as outras refs da máquina (issue #1155) ────────────────────────────────────────────
base_commit="$(git rev-parse "$BASE^{commit}" 2>/dev/null || true)"
head_commit="$(git rev-parse HEAD^{commit} 2>/dev/null || true)"
# Só entra na conta a ref que é DE OUTREM: nem a base (já medida), nem o HEAD (este PR), nem
# ancestral do HEAD — a cabeça do próprio PR publicada antes de um commit local, a main de
# antes de um merge, as branches já mescladas. O filtro de ancestral é UMA passada pelo grafo
# (`--no-merged HEAD`), não um `merge-base --is-ancestor` por ref: medido em 19/09/2026 num
# clone com 2601 refs, a checagem por ref custava 33 ms cada e rodava em dois laços (~3 min);
# o filtro inteiro custa 0,2 s e deixa 578. No clone raso não há history para julgar
# ancestralidade — lá a lista vai inteira, como antes.
raso=0; [ -f "$(git rev-parse --git-dir)/shallow" ] && raso=1
filtro_ancestral=(); [ "$raso" = 0 ] && filtro_ancestral=(--no-merged HEAD)
refs_de_outrem() { # $@ = padrões de ref
  git for-each-ref ${filtro_ancestral[@]+"${filtro_ancestral[@]}"} \
      --format='%(objectname) %(refname)' "$@" 2>/dev/null \
    | awk -v b="$base_commit" -v h="$head_commit" \
        '$2 != "refs/remotes/origin/HEAD" && $1 != b && $1 != h { print $2 }' || true
}
todos_refs="$(refs_de_outrem refs/heads refs/remotes)"

# Só o NNNN do nome canônico <14 dígitos>_<NNNN>_<slug>.sql. `grep -oE '_[0-9]{4}_'`
# pegava também número do SLUG — `_0277_relatorio_2024_` virava teto 2024 e conselho 2025.
nnnn_das() { sed -nE 's/^[0-9]{14}_([0-9]{4})_.*$/\1/p'; }
# O nome de exibição de uma ref: a cabeça buscada de um PR vira "PR aberto #N".
rotulo() { sed -E 's#^refs/colisao-pr/[0-9]+/([0-9]+)$#PR aberto \#\1#'; }

# ── os PRs ABERTOS, inclusive de fork (ver o cabeçalho) ─────────────────────────────────
# Namespace POR RODADA: todo worktree de um repositório vê as mesmas refs, e com duas
# sessões rodando isto ao mesmo tempo, limpar refs/colisao-pr inteiro apagaria as cabeças
# da outra no meio da medição. Cada rodada só lê e só apaga o que é dela.
ns="refs/colisao-pr/$$"
erro_gh="$(mktemp)"
limpar_cabecas() {
  git for-each-ref --format='%(refname)' "$ns" 2>/dev/null \
    | while IFS= read -r r; do git update-ref -d "$r" 2>/dev/null; done
}
limpar_cabecas   # PID reaproveitado de uma rodada morta: a sobra dela não vira população
trap 'limpar_cabecas; rm -f "$erro_gh"' EXIT

repo_gh=""
url_origin="$(git remote get-url origin 2>/dev/null || true)"
case "$url_origin" in
  *github.com[:/]*) repo_gh="$(sed -E 's#^.*github\.com[:/]##; s#\.git$##' <<<"$url_origin")" ;;
esac
prs_listados=""; prs_n_listados=0; prs_medidos=0; prs_falhos=""; prs_motivo=""
if lista_gh="$(GH_PROMPT_DISABLED=1 gh pr list ${repo_gh:+--repo "$repo_gh"} --state open \
                 --limit 1000 --json number --jq '.[].number' 2>"$erro_gh")"; then
  prs_listados="$(grep -E '^[0-9]+$' <<<"$lista_gh" || true)"
  prs_n_listados="$(grep -c . <<<"$prs_listados" || true)"
  if [ -n "$prs_listados" ]; then
    opcoes_pr=(); [ "$raso" = 1 ] && opcoes_pr+=(--depth=1)
    specs=()
    while IFS= read -r n; do specs+=("+refs/pull/$n/head:$ns/$n"); done <<<"$prs_listados"
    # Um lote é uma ida à rede; mas UMA cabeça ausente aborta o lote inteiro. Então, se o
    # lote falhar, repete um a um — só para NOMEAR quem falhou, nunca para pular calado.
    if ! git fetch --no-tags -q ${opcoes_pr[@]+"${opcoes_pr[@]}"} origin "${specs[@]}" >/dev/null 2>&1; then
      while IFS= read -r n; do
        git fetch --no-tags -q ${opcoes_pr[@]+"${opcoes_pr[@]}"} origin \
          "+refs/pull/$n/head:$ns/$n" >/dev/null 2>&1 || true
      done <<<"$prs_listados"
    fi
    # Controle de SOMA: todo PR listado virou ref, ou é NÃO MEDIDO nomeado.
    while IFS= read -r n; do
      if git rev-parse -q --verify "$ns/$n^{commit}" >/dev/null 2>&1; then
        prs_medidos=$((prs_medidos + 1))
      else
        prs_falhos="${prs_falhos}${prs_falhos:+ }#$n"
      fi
    done <<<"$prs_listados"
  fi
else
  prs_motivo="$(grep -m1 . "$erro_gh" 2>/dev/null || true)"
  [ -z "$prs_motivo" ] && prs_motivo="gh não respondeu"
fi
cabecas="$(refs_de_outrem "$ns")"

# A listagem vai para ARQUIVO ("ref<TAB>nome"), não para uma variável que cresce a cada volta:
# concatenar string no bash recopia tudo a cada iteração, e são centenas de refs com centenas
# de migrations cada. O segundo laço (nomear donos) lê daqui, sem chamar o git de novo.
listagem="$(mktemp)"
trap 'limpar_cabecas; rm -f "$erro_gh" "$listagem"' EXIT
outras_medidas=0
while IFS= read -r ref; do
  [ -z "$ref" ] && continue
  git ls-tree -r --name-only "$ref" -- supabase/migrations 2>/dev/null \
    | sed 's#^supabase/migrations/##' | awk -v r="$ref" '{ print r "\t" $0 }' >> "$listagem"
  case "$ref" in "$ns"/*) ;; *) outras_medidas=$((outras_medidas + 1)) ;; esac
done <<<"$(printf '%s\n%s\n' "$todos_refs" "$cabecas")"
outras_arvores="$(cut -f2 "$listagem")"
# "N<espaço>nome" das cabeças de PR — sem array associativo: o bash do macOS é o 3.2
arvores_prs="$(awk -F'\t' -v p="$ns/" 'index($1, p) == 1 { print substr($1, length(p) + 1) " " $2 }' "$listagem")"

# Próximo livre medido no UNIVERSO: as duas árvores, as outras refs do clone e as cabeças
# dos PRs abertos. Olhar só a listagem local é o erro que a complemento-do-ci.md §1 aponta
# no hook — "compare contra o remoto"; olhar só base+HEAD é o cego da #1155; olhar só
# refs/remotes é o cego dos forks.
ultimo_base_head="$(printf '%s\n%s\n' "$base_arvore" "$head_arvore" | nnnn_das | sort -n | tail -1)"
ultimo="$(printf '%s\n%s\n%s\n' "$base_arvore" "$head_arvore" "$outras_arvores" | nnnn_das | sort -n | tail -1)"
proximo_livre=""
[ -n "$ultimo" ] && proximo_livre="$(printf '%04d' $((10#$ultimo + 1)))"

# Declara SEMPRE a régua do conselho — número sem escopo declarado é o defeito da #1155.
escopo_do_proximo_livre() {
  local regua="'$BASE' ∪ HEAD"
  [ "$outras_medidas" -gt 0 ] && regua="$regua ∪ $outras_medidas outra(s) ref(s) deste clone"
  [ "$prs_medidos" -gt 0 ] && regua="$regua ∪ $prs_medidos PR(s) aberto(s)"
  echo "Próximo livre medido em $regua: NNNN=${proximo_livre:-?}"
  if [ "$outras_medidas" -eq 0 ]; then
    echo "::warning::branches locais NÃO foram medidos — confira com a triagem antes de renomear."
  fi
  if [ -n "$prs_motivo" ]; then
    echo "::warning::NÃO MEDIDO: PRs abertos (inclusive de fork) — $prs_motivo. Confira com a triagem antes de renomear."
  else
    echo "PRs abertos: ${prs_n_listados} listado(s), ${prs_medidos} medido(s)."
    [ -n "$prs_falhos" ] && echo "::warning::NÃO MEDIDO: ${prs_falhos} — a cabeça não pôde ser buscada; o número desses PRs não entrou na conta."
  fi
  return 0
}

# Se outra ref levantou o teto, NOMEAR quem tem o número: "declarar tomado" sem o dono é
# a armadilha que a #1155 registra ("a resposta vem 'tomada' apontando para você mesmo").
# O dono da branch decide renumerá-la ou ceder; aqui só se mede quem é.
if [ $((outras_medidas + prs_medidos)) -gt 0 ] && [ -n "$ultimo" ] && [ -n "$ultimo_base_head" ] \
   && [ "$ultimo" -gt "$ultimo_base_head" ]; then
  donos="$(grep -E $'\t'"[0-9]{14}_${ultimo}_" "$listagem" | cut -f1 | sort -u | rotulo \
             | tr '\n' ' ' | sed 's/ *$//' || true)"
  echo "::notice::NNNN=${ultimo} (o teto medido) existe em: ${donos:-?} — não é colisão sua; se for branch sua descartável, apagá-la libera o número."
fi

falhou=0
while IFS= read -r nome; do
  [ -z "$nome" ] && continue
  caminho="supabase/migrations/$nome"
  ts="$(sed -nE 's/^([0-9]{14})_[0-9]{4}_.+\.sql$/\1/p' <<<"$nome")"
  nnnn="$(sed -nE 's/^[0-9]{14}_([0-9]{4})_.+\.sql$/\1/p' <<<"$nome")"

  if [ -z "$nnnn" ] || [ -z "$ts" ]; then
    echo "::error file=$caminho::migration nova fora do padrão <timestamp de 14 dígitos>_<NNNN>_<slug>.sql"
    echo "CI REPROVADO: '$nome' não segue <timestamp de 14 dígitos>_<NNNN>_<slug>.sql (doutrina de migrations). Sem NNNN no nome, a colisão de número é imensurável."
    falhou=1
    continue
  fi

  colisao_n="$(grep -E "^[0-9]{14}_${nnnn}_.+\.sql$" <<<"$base_arvore" || true)"
  colisao_t="$(grep -E "^${ts}_[0-9]{4}_.+\.sql$" <<<"$base_arvore" || true)"
  if [ -n "$colisao_n" ]; then
    lista="$(tr '\n' ' ' <<<"$colisao_n" | sed 's/ *$//')"
    echo "::error file=$caminho::NNNN=$nnnn já existe em '$BASE': $lista"
    echo "CI REPROVADO: NNNN=$nnnn de '$nome' já existe em '$BASE': $lista"
    escopo_do_proximo_livre | sed 's/^/  /'
    echo "  Troque o TIMESTAMP junto (date -u +%Y%m%d%H%M%S) — renumerar só o NNNN é o que fabrica colisão de timestamp."
    falhou=1
  fi
  if [ -n "$colisao_t" ]; then
    lista="$(tr '\n' ' ' <<<"$colisao_t" | sed 's/ *$//')"
    echo "::error file=$caminho::timestamp $ts já existe em '$BASE': $lista"
    echo "CI REPROVADO: timestamp $ts de '$nome' já existe em '$BASE': $lista"
    echo "  O Supabase usa o timestamp como identidade da migration; dois iguais quebram db push/reset."
    falhou=1
  fi

  # Outro PR ABERTO (inclusive de fork) com o mesmo NNNN ou timestamp: AVISA no arquivo,
  # não reprova — quem entrar primeiro fica; o outro PR pode nunca entrar.
  if [ -n "$arvores_prs" ]; then
    donos_n="$(grep -E "^[0-9]+ [0-9]{14}_${nnnn}_.+\.sql$" <<<"$arvores_prs" | cut -d' ' -f1 | sort -un \
                 | sed 's/^/PR aberto #/' | paste -sd, - | sed 's/,/, /g' || true)"
    donos_t="$(grep -E "^[0-9]+ ${ts}_[0-9]{4}_.+\.sql$" <<<"$arvores_prs" | cut -d' ' -f1 | sort -un \
                 | sed 's/^/PR aberto #/' | paste -sd, - | sed 's/,/, /g' || true)"
    if [ -n "$donos_n" ]; then
      echo "::warning file=$caminho::NNNN=$nnnn também está em: $donos_n — não reprova: quem entrar primeiro fica, e o outro renumera (NNNN e timestamp juntos)."
    fi
    if [ -n "$donos_t" ]; then
      echo "::warning file=$caminho::timestamp $ts também está em: $donos_t — o Supabase usa o timestamp como identidade; quem entrar depois troca o seu."
    fi
  fi

  # A sonda de árvore (TRIAGEM.md:926) restrita às adições: NNNN/timestamp repetidos
  # entre os arquivos DESTE PR — o hook do pre-commit não vê isso, o merge cego também não.
  gemeas_n="$(grep -cE "^[0-9]{14}_${nnnn}_.+\.sql$" <<<"$adicionadas_nomes" || true)"
  if [ "${gemeas_n:-0}" -gt 1 ]; then
    lista="$(grep -E "^[0-9]{14}_${nnnn}_.+\.sql$" <<<"$adicionadas_nomes" | tr '\n' ' ' | sed 's/ *$//')"
    echo "::error file=$caminho::NNNN=$nnnn repetido entre os arquivos deste PR: $lista"
    echo "CI REPROVADO: NNNN=$nnnn aparece em $gemeas_n arquivos deste PR: $lista"
    escopo_do_proximo_livre | sed 's/^/  /'
    falhou=1
  fi
  gemeas_t="$(grep -cE "^${ts}_[0-9]{4}_.+\.sql$" <<<"$adicionadas_nomes" || true)"
  if [ "${gemeas_t:-0}" -gt 1 ]; then
    lista="$(grep -E "^${ts}_[0-9]{4}_.+\.sql$" <<<"$adicionadas_nomes" | tr '\n' ' ' | sed 's/ *$//')"
    echo "::error file=$caminho::timestamp $ts repetido entre os arquivos deste PR: $lista"
    echo "CI REPROVADO: timestamp $ts aparece em $gemeas_t arquivos deste PR: $lista"
    echo "  O Supabase usa o timestamp como identidade da migration; dois iguais quebram db push/reset."
    falhou=1
  fi
done <<<"$adicionadas_nomes"

if [ "$falhou" = 1 ]; then
  echo
  echo "Correção: renumerar o arquivo do PR para um NNNN livre E trocar o TIMESTAMP junto, no mesmo commit."
  echo "  Os casos legítimos (editar, renomear, merge da main, dívida antiga da base) já passam por construção — ver o cabeçalho deste script."
  exit 1
fi
echo "OK — $(grep -c . <<<"$adicionadas_nomes") migration(ões) nova(s) com NNNN/timestamp livres contra '$BASE'."
escopo_do_proximo_livre
exit 0
