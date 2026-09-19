#!/usr/bin/env bash
# Prova do gate de colisão de número de migration (scripts/checar-colisao-de-migration.sh)
# em repositórios git DESCARTÁVEIS e sem rede: cada caso monta um "principal" local fazendo
# o papel da origin/main. Nada aqui toca o clone de quem roda.
#
#   bash tests/shell/colisao-de-migration.test.sh
#
# O que está sob prova:
#   1. o instrumento está VIVO — o controle positivo é ele reprovar uma colisão real. A
#      TRIAGEM.md:937-939 exige esse registro: vazio num diff limpo prova vacuidade, não
#      que a sonda enxerga.
#   2. NNNN tomado na base reprova, e a mensagem nomeia o número E os dois arquivos.
#   3. timestamp tomado na base reprova.
#   4. os casos legítimos NÃO reprovam: editar/reordenar migration existente, `git mv` de
#      slug, merge da própria main, e duplicata que já existia na base (linha de base).
#   5. o caso do #804 reprova: os dois PRs não conflitam, o merge da main entra limpo e só
#      então a árvore mostra o número disputado (é o defeito da issue #285).
#   6. dois arquivos do MESMO PR com o mesmo NNNN reprovam (sonda de árvore restrita às
#      adições do PR — o pre-commit não vê isso).
#   7. nome fora de <14 dígitos>_<NNNN>_<slug>.sql reprova: sem NNNN não há o que medir.
#   8. sem ref da base, o gate busca a base sozinho (o clone raso do CI); e quando não
#      consegue medir, REPROVA (exit 2) declarando o NÃO MEDIDO — nunca verde silencioso.
#   9. outra ref do clone (branch local de resgate) levanta o teto do conselho: o número
#      salta e a saída nomeia QUEM tem (issue #1155).
#  10. clone sem outras refs (o raso do CI) declara na própria saída que NÃO as mediu.
#  11. ref que resolve para o próprio HEAD não vira "quem tem" — o alvo não mede a si
#      mesmo (a armadilha da #1155).
#  12. as cabeças dos PRs ABERTOS entram no universo — inclusive de fork, que não moram em
#      refs/remotes. Medido em 19/09/2026: o #677 (fork) tinha o 0333 e o gate, que só via
#      refs/heads + refs/remotes, diria "livre" ao dono do #1176. É o controle positivo da
#      POPULAÇÃO: sem ele, este teste passaria com o universo velho.
#  13. cabeça de PR FECHADO não entra: refs/pull/*/head persiste depois do fechamento
#      (965 cabeças contra 43 PRs abertos, medido) e empurraria o "próximo livre".
#  14. PR listado cuja cabeça não pôde ser buscada vira "NÃO MEDIDO: #N" — nunca pulado.
#  15. sem gh utilizável, o universo de PRs é declarado NÃO MEDIDO (como o clone raso).
#  16. número de 4 dígitos no SLUG não vira NNNN (`_0277_relatorio_2024_` não dá 2025).
#  17. a cabeça do PR de quem roda (ancestral do HEAD) não acusa o próprio número.
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE_ORIGEM="$RAIZ/scripts/checar-colisao-de-migration.sh"

falhas=0; casos=0
ok()   { casos=$((casos+1)); printf '  ✓ %s\n' "$1"; }
falha(){ casos=$((casos+1)); falhas=$((falhas+1)); printf '  ✗ %s\n     %s\n' "$1" "${2:-}"; }
assert_exit() { if [ "$1" = "$2" ]; then ok "$3"; else falha "$3" "exit esperado $2, veio $1"; fi; }
assert_contains() { if grep -qF -- "$2" <<<"$1"; then ok "$3"; else falha "$3" "esperava conter '$2'; saída: $(head -c 500 <<<"$1")"; fi; }
assert_not_contains() { if grep -qF -- "$2" <<<"$1"; then falha "$3" "não esperava '$2'; saída: $(head -c 500 <<<"$1")"; else ok "$3"; fi; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
# ── isolamento do git: nada aqui escreve fora de "$TMP" ─────────────────────────────
# Um `git -C "$dir" config user.*` grava onde o git RESOLVER o repositório, e não
# necessariamente em "$dir": um GIT_DIR herdado (rodar de dentro de um hook, de um
# `rebase --exec`) manda por cima do -C; "$dir" que não é repositório sobe até o pai.
# Foi assim que "Pessoa <alguem@fork.dev>" parou no .git/config do checkout de quem
# rodava a suíte e assinou 829 commits da main a partir de 10/09/2026. Três travas:
#   1. zera o ambiente local do git herdado — o idioma canônico do próprio git;
#   2. a descoberta de repositório nunca sobe para fora de "$TMP";
#   3. identidade por ambiente, não por `git config` (NENHUM teste aqui mede o autor).
unset $(git rev-parse --local-env-vars)
export GIT_CEILING_DIRECTORIES="$TMP"
export GIT_AUTHOR_NAME="Teste" GIT_AUTHOR_EMAIL="teste@exemplo.invalid"
export GIT_COMMITTER_NAME="Teste" GIT_COMMITTER_EMAIL="teste@exemplo.invalid"

# ── gh FALSO, para TODOS os casos: sem rede e sem depender do gh de quem roda ──────────
# Responde `pr list` com os números de FAKE_GH_PRS; com a variável AUSENTE, finge gh
# indisponível (é o estado do CI, que não exporta GH_TOKEN para o passo do gate).
mkdir -p "$TMP/bin"
cat > "$TMP/bin/gh" <<'GH'
#!/usr/bin/env bash
if [ "${1:-}" = "pr" ] && [ "${2:-}" = "list" ] && [ -n "${FAKE_GH_PRS+x}" ]; then
  for n in $FAKE_GH_PRS; do echo "$n"; done
  exit 0
fi
echo "gh falso: indisponível neste teste" >&2
exit 1
GH
chmod +x "$TMP/bin/gh"
export PATH="$TMP/bin:$PATH"
unset FAKE_GH_PRS

# ── um "repositório principal" mínimo, com duas migrations já aplicadas ──────────────
principal="$TMP/principal"; mkdir -p "$principal/supabase/migrations"
git -C "$principal" init -q -b main
printf 'select 1;\n' > "$principal/supabase/migrations/20260101120000_0262_existente.sql"
printf 'select 2;\n' > "$principal/supabase/migrations/20260102090000_0261_anterior.sql"
printf '# leia\n' > "$principal/README.md"
git -C "$principal" add -A && git -C "$principal" commit -q -m "base"

clonar() { # $1 = destino (traz o gate SOB PROVA, a versão da árvore de trabalho)
  rm -rf "$1"; git clone -q "$principal" "$1"
  mkdir -p "$1/scripts"; cp "$GATE_ORIGEM" "$1/scripts/checar-colisao-de-migration.sh"
}
gate() { ( cd "$1" && bash scripts/checar-colisao-de-migration.sh "${2:-origin/main}" 2>&1 ); }
migrar() { printf 'select 9;\n' > "$1/supabase/migrations/$2"; }
commit() { git -C "$1" add -A >/dev/null && git -C "$1" commit -q -m "$2"; }

echo "1. o instrumento está vivo: colisão real de NNNN reprova nomeando número e arquivos"
c="$TMP/c1"; clonar "$c"; git -C "$c" switch -q -c fix/colide
migrar "$c" "20260916120000_0262_colide.sql"; commit "$c" "migration com NNNN tomado"
saida="$(gate "$c")"; code=$?
assert_exit "$code" 1 "NNNN já tomado na base reprova"
assert_contains "$saida" "NNNN=0262" "acusa QUAL número"
assert_contains "$saida" "20260916120000_0262_colide.sql" "acusa QUAL arquivo do PR"
assert_contains "$saida" "20260101120000_0262_existente.sql" "acusa QUAL arquivo da base já ocupava o número"
assert_contains "$saida" "::error file=supabase/migrations/20260916120000_0262_colide.sql::" "anota no arquivo do PR, inline no diff"

echo "2. NNNN livre passa"
c="$TMP/c2"; clonar "$c"; git -C "$c" switch -q -c fix/livre
migrar "$c" "20260916130000_0263_livre.sql"; commit "$c" "migration com NNNN livre"
saida="$(gate "$c")"; code=$?
assert_exit "$code" 0 "NNNN livre passa"
assert_contains "$saida" "OK" "diz que mediu"

echo "3. timestamp tomado na base reprova (o NNNN é outro)"
c="$TMP/c3"; clonar "$c"; git -C "$c" switch -q -c fix/ts
migrar "$c" "20260101120000_0264_ts_tomado.sql"; commit "$c" "migration com timestamp tomado"
saida="$(gate "$c")"; code=$?
assert_exit "$code" 1 "timestamp já usado na base reprova"
assert_contains "$saida" "timestamp 20260101120000" "acusa QUAL timestamp"
assert_contains "$saida" "20260101120000_0262_existente.sql" "acusa QUAL arquivo da base usa o timestamp"

echo "4. editar/reordenar migration existente passa (não acrescenta arquivo)"
c="$TMP/c4"; clonar "$c"; git -C "$c" switch -q -c fix/edita
printf '\n-- ajuste de comentário\n' >> "$c/supabase/migrations/20260101120000_0262_existente.sql"
commit "$c" "edita migration existente"
saida="$(gate "$c")"; code=$?
assert_exit "$code" 0 "edição de migration existente passa"
assert_not_contains "$saida" "CI REPROVADO" "não inventa colisão onde houve edição"

echo "5. git mv (renomear slug) passa"
c="$TMP/c5"; clonar "$c"; git -C "$c" switch -q -c fix/renomeia
git -C "$c" mv supabase/migrations/20260101120000_0262_existente.sql \
              supabase/migrations/20260101120000_0262_renomeada.sql
commit "$c" "renomeia slug da migration"
saida="$(gate "$c")"; code=$?
assert_exit "$code" 0 "renome passa (limite declarado, igual ao do hook: TRIAGEM.md:906)"

echo "6. merge da própria main passa (a main anda e entra na branch)"
c="$TMP/c6"; clonar "$c"; git -C "$c" switch -q -c fix/merge-main
migrar "$c" "20260916140000_0265_do_pr.sql"; commit "$c" "migration do PR"
migrar "$principal" "20260916150000_0266_da_main.sql"
git -C "$principal" add -A; git -C "$principal" commit -q -m "main anda"
git -C "$c" fetch -q origin main && git -C "$c" merge -q --no-edit FETCH_HEAD
saida="$(gate "$c")"; code=$?
assert_exit "$code" 0 "merge da própria main passa (a migration que veio da main não é adição do PR)"
assert_not_contains "$saida" "0266_da_main.sql" "não culpa o PR pela migration que a main trouxe"

echo "7. o caso do #804/#0161: número disputado que entra pela base"
c="$TMP/c7"; clonar "$c"; git -C "$c" switch -q -c fix/disputa
migrar "$c" "20260916160000_0268_lembrete.sql"; commit "$c" "PR A: 0268"
# outro PR mergeia o MESMO 0268 na main, com slug diferente: não há conflito textual
migrar "$principal" "20260916170000_0268_rascunho.sql"
git -C "$principal" add -A; git -C "$principal" commit -q -m "PR B: 0268 na main"
# (a) branch atrás da base: o `-M` pareia os dois arquivos (medido: R100), então o gate
#     não pode dar verde silencioso — ele declara a divergência
saida="$(gate "$c")"; code=$?
assert_exit "$code" 0 "branch atrás da base não vira acusação falsa"
assert_contains "$saida" "::warning::" "e não dá verde silencioso: declara o limite"
assert_contains "$saida" "andou depois do fork" "diz o que houve"
# (b) a árvore que o CI mede: base mergeada, como no merge ref do pull_request
git -C "$c" fetch -q origin main && git -C "$c" merge -q --no-edit FETCH_HEAD
saida="$(gate "$c")"; code=$?
assert_exit "$code" 1 "número disputado reprova na árvore do merge (o defeito da issue #285)"
assert_contains "$saida" "NNNN=0268" "acusa o número disputado"
assert_contains "$saida" "0268_lembrete.sql" "acusa o arquivo do PR"
assert_contains "$saida" "0268_rascunho.sql" "acusa o arquivo que entrou pela main"

echo "8. duplicata que JÁ existia na base não é do PR (linha de base, TRIAGEM.md:934)"
principal2="$TMP/principal2"; mkdir -p "$principal2/supabase/migrations"
git -C "$principal2" init -q -b main
printf 'select 1;\n' > "$principal2/supabase/migrations/20260101120000_0270_um.sql"
printf 'select 2;\n' > "$principal2/supabase/migrations/20260102090000_0270_dois.sql"
git -C "$principal2" add -A && git -C "$principal2" commit -q -m "base com divida herdada"
c="$TMP/c8"; rm -rf "$c"; git clone -q "$principal2" "$c"
mkdir -p "$c/scripts"; cp "$GATE_ORIGEM" "$c/scripts/checar-colisao-de-migration.sh"
git -C "$c" switch -q -c fix/livre
migrar "$c" "20260916180000_0271_livre.sql"; commit "$c" "migration livre com dívida antiga na base"
saida="$(gate "$c")"; code=$?
assert_exit "$code" 0 "dívida herdada da base não reprova o PR"
assert_not_contains "$saida" "NNNN=0270" "não culpa o PR pela duplicata antiga"

echo "9. dois arquivos do MESMO PR com o mesmo NNNN reprovam (sonda de árvore nas adições)"
c="$TMP/c9"; clonar "$c"; git -C "$c" switch -q -c fix/gemeas
migrar "$c" "20260916190000_0272_um.sql"; migrar "$c" "20260916200000_0272_dois.sql"
commit "$c" "dois arquivos com o mesmo NNNN"
saida="$(gate "$c")"; code=$?
assert_exit "$code" 1 "NNNN repetido entre adições do mesmo PR reprova"
assert_contains "$saida" "NNNN=0272 aparece em 2 arquivos deste PR" "diz QUANTOS e quais"
assert_contains "$saida" "0272_um.sql" "nomeia o primeiro arquivo"
assert_contains "$saida" "0272_dois.sql" "nomeia o segundo arquivo"

echo "10. migration fora do padrão <14 dígitos>_<NNNN>_<slug>.sql reprova"
c="$TMP/c10"; clonar "$c"; git -C "$c" switch -q -c fix/nome
migrar "$c" "ajuste_de_agenda.sql"; commit "$c" "migration fora do padrão"
saida="$(gate "$c")"; code=$?
assert_exit "$code" 1 "nome sem NNNN reprova (sem número não há o que medir)"
assert_contains "$saida" "ajuste_de_agenda.sql" "acusa QUAL arquivo"

echo "11. sem ref da base, o gate busca a base sozinho (o clone do CI é --depth=1)"
c="$TMP/c11"; clonar "$c"; git -C "$c" switch -q -c fix/sem-base
migrar "$c" "20260916210000_0273_livre.sql"; commit "$c" "migration livre"
git -C "$c" update-ref -d refs/remotes/origin/main
if git -C "$c" rev-parse -q --verify origin/main >/dev/null 2>&1; then
  falha "o caso exige origem sem ref origin/main" "origin/main ainda resolve"
else
  ok "cenário montado: ref origin/main AUSENTE no clone"
fi
saida="$(gate "$c")"; code=$?
assert_exit "$code" 0 "sem origin/main, o gate busca a base e mede (verde legítimo)"
if git -C "$c" rev-parse -q --verify origin/main >/dev/null 2>&1; then
  ok "o gate reconstruiu refs/remotes/origin/main sozinho"
else
  falha "o gate reconstruiu refs/remotes/origin/main sozinho" "ref continua ausente"
fi

echo "12. não conseguir medir REPROVA declarando o NÃO MEDIDO (nunca verde silencioso)"
c="$TMP/c12"; clonar "$c"; git -C "$c" switch -q -c fix/nao-medido
migrar "$c" "20260916220000_0274_livre.sql"; commit "$c" "migration livre"
saida="$(gate "$c" "origin/nao-existe")"; code=$?
assert_exit "$code" 2 "base imensurável reprova com exit 2 (distinto de colisão)"
assert_contains "$saida" "NÃO MEDIDO" "declara o não medido em vez de passar em silêncio"
assert_contains "$saida" "git fetch origin origin/nao-existe" "diz o comando do conserto"

# O commit() varre o gate copiado para dentro da árvore; o switch de branch seguinte o
# remove (ficou tracked na branch que ficou para trás). Re-arma a cópia antes de medir.
rearmar_gate() { rm -rf "$1/scripts"; mkdir -p "$1/scripts"; cp "$GATE_ORIGEM" "$1/scripts/"; }

echo "13. outra ref do clone levanta o teto: o conselho salta e nomeia QUEM tem"
c="$TMP/c13"; clonar "$c"
git -C "$c" switch -q -c outra/resgate
migrar "$c" "20260916230000_0275_resgate.sql"; commit "$c" "branch local de resgate com 0275"
git -C "$c" switch -q -c fix/do-pr origin/main
migrar "$c" "20260916233000_0274_do_pr.sql"; commit "$c" "PR com 0274"
rearmar_gate "$c"
saida="$(gate "$c")"; code=$?
assert_exit "$code" 0 "outra ref não reprova o PR — empurra o próximo livre"
assert_contains "$saida" "NNNN=0276" "o conselho pula o número que a outra ref tomou"
assert_contains "$saida" "refs/heads/outra/resgate" "nomeia QUEM tem o número que forçou o salto"
assert_contains "$saida" "1 outra(s) ref(s)" "declara a régua ampliada na própria saída"

echo "14. clone sem outras refs declara que NÃO as mediu (o raso do CI degrada limpo)"
c="$TMP/c14"; clonar "$c"; git -C "$c" switch -q -c fix/sozinho
migrar "$c" "20260916234000_0274_livre.sql"; commit "$c" "migration livre"
saida="$(gate "$c")"; code=$?
assert_exit "$code" 0 "sem outras refs o gate segue medindo (degradação limpa)"
assert_contains "$saida" "NÃO foram medidos" "declara o limite do conselho na própria saída"
assert_contains "$saida" "confira com a triagem antes de renomear" "diz o que fazer antes de confiar no número"

echo "15. ref que resolve para o próprio HEAD não vira 'quem tem' (o alvo não mede a si mesmo)"
c="$TMP/c15"; clonar "$c"
git -C "$c" switch -q -c outra/resgate
migrar "$c" "20260916235000_0275_resgate.sql"; commit "$c" "branch local de resgate com 0275"
git -C "$c" switch -q -c fix/do-pr origin/main
migrar "$c" "20260916235500_0274_do_pr.sql"; commit "$c" "PR com 0274"
git -C "$c" branch espelho-do-head fix/do-pr
rearmar_gate "$c"
saida="$(gate "$c")"; code=$?
assert_exit "$code" 0 "espelho do HEAD não interfere na medição"
assert_not_contains "$saida" "espelho-do-head" "não nomeia ref que é o próprio HEAD"
assert_contains "$saida" "refs/heads/outra/resgate" "só o dono de verdade é nomeado"

# ── PRs abertos, inclusive de fork (refs/pull/N/head) ─────────────────────────────────
# Uma cabeça de PR no principal, como o GitHub guarda: refs/pull/N/head. `git clone` NÃO
# traz refs/pull — igual ao clone real —, então só o gate buscando é que a enxerga.
pr_no_principal() { # $1 = número do PR, $2 = nome da migration que a cabeça dele carrega
  local w="$TMP/cabeca-pr-$1"; rm -rf "$w"; git clone -q "$principal" "$w"
  printf 'select %s;\n' "$1" > "$w/supabase/migrations/$2"
  git -C "$w" add -A >/dev/null && git -C "$w" commit -q -m "PR #$1"
  git -C "$w" push -q origin "HEAD:refs/pull/$1/head"
}
gate_prs() { # $1 = PRs abertos que o gh falso lista, $2 = clone
  ( export FAKE_GH_PRS="$1"; cd "$2" && bash scripts/checar-colisao-de-migration.sh origin/main 2>&1 )
}
pr_no_principal 7 "20260917100000_0276_do_fork.sql"
pr_no_principal 9 "20260917120000_0400_abandonado.sql"

echo "16. PR aberto de FORK com o mesmo NNNN: o gate o enxerga e nomeia (não reprova)"
c="$TMP/c16"; clonar "$c"; git -C "$c" switch -q -c fix/pr
migrar "$c" "20260917110000_0276_meu.sql"; commit "$c" "PR com o 0276 que o fork também tem"
if git -C "$c" rev-parse -q --verify refs/pull/7/head >/dev/null 2>&1; then
  falha "o caso exige clone SEM refs/pull (como o clone real)" "refs/pull/7/head já existe no clone"
else
  ok "cenário montado: o clone não traz refs/pull, igual ao do GitHub"
fi
saida="$(gate_prs "7" "$c")"; code=$?
assert_exit "$code" 0 "número de outro PR não reprova — quem entrar primeiro fica"
# Âncora no ARQUIVO do PR: o gate velho já emite um ::warning genérico ("não foram
# medidos"), e "::warning" solto passaria sem ter visto fork nenhum. E "NNNN=0277" aqui
# também não provaria nada — o próprio PR tem 0276. Quem prova o teto vindo do fork é o 17.
assert_contains "$saida" "::warning file=supabase/migrations/20260917110000_0276_meu.sql::NNNN=0276" "avisa NO ARQUIVO que colide"
assert_contains "$saida" "PR aberto #7" "nomeia O PR que tem o mesmo número"

echo "17. cabeça de PR FECHADO não entra: a população é a lista de ABERTOS, nunca o curinga"
c="$TMP/c17"; clonar "$c"; git -C "$c" switch -q -c fix/pr
migrar "$c" "20260917130000_0263_meu.sql"; commit "$c" "PR com número livre"
saida="$(gate_prs "7" "$c")"; code=$?
assert_exit "$code" 0 "PR com número livre passa"
assert_contains "$saida" "NNNN=0277" "o teto vem do PR ABERTO #7"
assert_not_contains "$saida" "0401" "o 0400 do PR fechado #9 não empurra o próximo livre"
assert_not_contains "$saida" "#9" "o PR fechado não aparece em lugar nenhum"

echo "18. PR listado cuja cabeça não pôde ser buscada: NÃO MEDIDO nomeado, e a soma aparece"
c="$TMP/c18"; clonar "$c"; git -C "$c" switch -q -c fix/pr
migrar "$c" "20260917140000_0263_meu.sql"; commit "$c" "PR com número livre"
saida="$(gate_prs "7 8" "$c")"; code=$?
assert_exit "$code" 0 "uma cabeça imensurável não reprova o PR (é informação, não ação)"
assert_contains "$saida" "NÃO MEDIDO: #8" "nomeia QUAL PR ficou de fora"
assert_contains "$saida" "2 listado(s), 1 medido(s)" "declara a soma: listados contra medidos"
assert_contains "$saida" "NNNN=0277" "o que foi medido continua valendo"

echo "19. sem gh utilizável, o universo de PRs abertos é declarado NÃO MEDIDO"
c="$TMP/c19"; clonar "$c"; git -C "$c" switch -q -c fix/pr
migrar "$c" "20260917150000_0263_meu.sql"; commit "$c" "PR com número livre"
saida="$(gate "$c")"; code=$?
assert_exit "$code" 0 "sem gh o gate segue medindo o resto (degradação limpa)"
assert_contains "$saida" "NÃO MEDIDO: PRs abertos" "declara que os PRs abertos ficaram de fora"

echo "20. número de 4 dígitos no SLUG não vira NNNN"
c="$TMP/c20"; clonar "$c"
git -C "$c" switch -q -c outra/relatorio
migrar "$c" "20260917160000_0277_relatorio_2024_anual.sql"; commit "$c" "slug com ano"
git -C "$c" switch -q -c fix/pr origin/main
migrar "$c" "20260917170000_0263_meu.sql"; commit "$c" "PR com número livre"
rearmar_gate "$c"
saida="$(gate "$c")"; code=$?
assert_exit "$code" 0 "PR com número livre passa"
assert_contains "$saida" "NNNN=0278" "o teto é o NNNN da outra ref (0277), não o ano do slug"
assert_not_contains "$saida" "NNNN=2025" "o 2024 do slug não é número de migration"

echo "21. a cabeça do PR de quem roda (ancestral do HEAD) não acusa o próprio número"
c="$TMP/c21"; clonar "$c"; git -C "$c" switch -q -c fix/meu
migrar "$c" "20260917180000_0263_meu.sql"; commit "$c" "PR com 0263"
git -C "$c" push -q origin "HEAD:refs/pull/5/head"
printf 'mais uma linha\n' >> "$c/README.md"; commit "$c" "commit local ainda não publicado"
saida="$(gate_prs "5" "$c")"; code=$?
assert_exit "$code" 0 "o próprio PR não reprova a si mesmo"
assert_not_contains "$saida" "PR aberto #5" "a cabeça do próprio PR não vira 'quem tem'"

echo
if [ "$falhas" = 0 ]; then echo "colisao-de-migration: $casos casos, todos verdes"; exit 0
else echo "colisao-de-migration: $falhas de $casos casos vermelhos"; exit 1; fi
