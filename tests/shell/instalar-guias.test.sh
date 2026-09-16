#!/usr/bin/env bash
# Prova do scripts/instalar-guias.sh num HOME descartável e com um "repositório" local no
# lugar do GitHub — nada aqui toca as pastas de skills de quem roda o teste.
#
#   bash tests/shell/instalar-guias.test.sh
#
# O que está sob prova:
#   1. Instala: cada guia deskcomm-* vira link nas três pastas globais que os CLIs leem
#      (~/.claude/skills, ~/.agents/skills, ~/.gemini/config/skills), e só os deskcomm-*.
#      A cópia é esparsa (só .agents/skills), e a saída diz que nada se atualiza sozinho
#      e como chamar o guia em cada CLI.
#   2. Não sobrescreve skill da pessoa com o mesmo nome — avisa e pula.
#   3. Atualiza: uma mudança no repositório chega pelo link depois de rodar de novo.
#   4. --fonte DIR aponta para um clone local.
#   5. --remover apaga só o que o script criou; a skill da pessoa fica.
#   6. Opção inválida.
#   7. Guia renomeado na fonte sai das três pastas (não fica link quebrado).
#   8. Sem link simbólico (Windows): copia, marca, atualiza e remove as cópias.
#   9. Execução interrompida entre o clone e o sparse-checkout se cura na seguinte.
#  10. sparse-checkout que falha num clone novo não deixa a cópia pela metade.
#  11. "nenhum guia" diz como sair dali.
#  12. Edição à mão pela pasta global não trava a atualização.
#  13. DESKCOMM_GUIAS_HOME: pasta alheia é recusada intacta; caminho relativo vira absoluto.
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$RAIZ/scripts/instalar-guias.sh"
falhas=0; casos=0
ok()   { casos=$((casos+1)); printf '  ✓ %s\n' "$1"; }
falha(){ casos=$((casos+1)); falhas=$((falhas+1)); printf '  ✗ %s\n     %s\n' "$1" "${2:-}"; }
checa(){ if eval "$1"; then ok "$2"; else falha "$2" "condição: $1"; fi; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
export HOME="$TMP/home"; mkdir -p "$HOME"
REAL_GIT="$(command -v git)"; export REAL_GIT

# ── um "DeskcommCRM" mínimo: dois guias e uma skill que não é guia ────────────
montar_repo() {  # montar_repo <pasta>
  local r="$1" n
  mkdir -p "$r"
  git -C "$r" init -q -b main
  git -C "$r" config user.email t@t; git -C "$r" config user.name t
  for n in deskcomm-instalar deskcomm-prompt sistema-vivo; do
    mkdir -p "$r/.agents/skills/$n"
    printf -- "---\nname: %s\ndescription: 'guia %s'\n---\n\nversão 1\n" "$n" "$n" > "$r/.agents/skills/$n/SKILL.md"
  done
  mkdir -p "$r/app"; echo x > "$r/app/fora-do-sparse.ts"
  git -C "$r" add -A && git -C "$r" commit -q -m base
}

# Cada caso de 7 em diante começa do zero: HOME e repositório próprios.
cenario() {  # cenario <nome> → HOME, DESKCOMM_REPO_URL e $repo novos
  export HOME="$TMP/$1/home"; mkdir -p "$HOME"
  repo="$TMP/$1/repo"; montar_repo "$repo"
  export DESKCOMM_REPO_URL="file://$repo"
}

# Um git que se comporta como o de verdade, menos no sparse-checkout.
git_falso() {  # git_falso <pasta> <corpo-do-desvio>
  mkdir -p "$1"
  # shellcheck disable=SC2016  # o "$@" e o "$REAL_GIT" são do script gerado, não daqui
  printf '#!/usr/bin/env bash\nfor a in "$@"; do [ "$a" = sparse-checkout ] && { %s; }; done\nexec "$REAL_GIT" "$@"\n' "$2" > "$1/git"
  chmod +x "$1/git"
}

repo="$TMP/repo"; montar_repo "$repo"
export DESKCOMM_REPO_URL="file://$repo"

echo "1. instalar a partir do repositório"
saida="$(bash "$SCRIPT" 2>&1)"; code=$?
checa "[ $code = 0 ]" "sai com 0"
for dest in .claude/skills .agents/skills .gemini/config/skills; do
  checa "[ -L \"\$HOME/$dest/deskcomm-instalar\" ] && [ -f \"\$HOME/$dest/deskcomm-instalar/SKILL.md\" ]" "deskcomm-instalar ligado em ~/$dest"
  checa "[ -L \"\$HOME/$dest/deskcomm-prompt\" ]" "deskcomm-prompt ligado em ~/$dest"
  checa "[ ! -e \"\$HOME/$dest/sistema-vivo\" ]" "sistema-vivo (não é guia deskcomm-*) fica de fora de ~/$dest"
done
checa "grep -q 'deskcomm-instalar' <<<\"\$saida\"" "a saída lista os guias"
checa "grep -q 'sessão NOVA' <<<\"\$saida\"" "a saída avisa para abrir sessão nova"
checa "[ -d \"\$HOME/.deskcomm/guias/.agents/skills\" ] && [ ! -e \"\$HOME/.deskcomm/guias/app\" ]" "a cópia é esparsa: traz .agents/skills e não traz app/"
checa "grep -q 'NÃO se atualizam sozinhos' <<<\"\$saida\"" "a saída diz que os guias não se atualizam sozinhos"
checa "grep -q 'Claude Code, um guia instalado aqui vale mais' <<<\"\$saida\"" "a saída diz que no Claude Code o guia global vence o do clone"
checa "grep -qF '\$deskcomm-instalar no Codex' <<<\"\$saida\" && ! grep -q 'digite /deskcomm-' <<<\"\$saida\"" "a saída ensina \$ no Codex, sem mandar digitar / em todos"

echo "2. não sobrescreve skill da pessoa"
rm -f "$HOME/.claude/skills/deskcomm-prompt"; mkdir -p "$HOME/.claude/skills/deskcomm-prompt"
echo "minha versão" > "$HOME/.claude/skills/deskcomm-prompt/SKILL.md"
saida="$(bash "$SCRIPT" 2>&1)"
checa "grep -q 'pulei .*deskcomm-prompt' <<<\"\$saida\"" "avisa que pulou"
checa "grep -q 'minha versão' \"\$HOME/.claude/skills/deskcomm-prompt/SKILL.md\"" "a skill da pessoa ficou intacta"

echo "3. atualizar"
sed -i.bak 's/versão 1/versão 2/' "$repo/.agents/skills/deskcomm-instalar/SKILL.md" && rm -f "$repo/.agents/skills/deskcomm-instalar/SKILL.md.bak"
git -C "$repo" commit -qam "v2"
bash "$SCRIPT" >/dev/null 2>&1
checa "grep -q 'versão 2' \"\$HOME/.agents/skills/deskcomm-instalar/SKILL.md\"" "a versão nova chega pelo link"

echo "4. --fonte DIR"
clone="$TMP/clone"; git clone -q "$repo" "$clone"
sed -i.bak 's/versão 2/versão local/' "$clone/.agents/skills/deskcomm-instalar/SKILL.md" && rm -f "$clone/.agents/skills/deskcomm-instalar/SKILL.md.bak"
bash "$SCRIPT" --fonte "$clone" >/dev/null 2>&1
checa "grep -q 'versão local' \"\$HOME/.claude/skills/deskcomm-instalar/SKILL.md\"" "o link passa a apontar para o clone local"

echo "5. --remover"
saida="$(bash "$SCRIPT" --remover 2>&1)"; code=$?
checa "[ $code = 0 ]" "sai com 0"
checa "[ ! -e \"\$HOME/.agents/skills/deskcomm-instalar\" ] && [ ! -L \"\$HOME/.agents/skills/deskcomm-instalar\" ]" "remove o link"
checa "[ -f \"\$HOME/.claude/skills/deskcomm-prompt/SKILL.md\" ]" "não remove a skill da pessoa"

echo "6. opção inválida"
bash "$SCRIPT" --nao-existe >/dev/null 2>&1; code=$?
checa "[ $code = 2 ]" "opção desconhecida sai com 2"

echo "7. guia renomeado na fonte"
cenario renomeado
bash "$SCRIPT" >/dev/null 2>&1
mkdir -p "$HOME/.claude/skills/deskcomm-meu"; echo "meu" > "$HOME/.claude/skills/deskcomm-meu/SKILL.md"
git -C "$repo" mv .agents/skills/deskcomm-prompt .agents/skills/deskcomm-prompt-agente && git -C "$repo" commit -qm renomeia
bash "$SCRIPT" >/dev/null 2>&1
for dest in .claude/skills .agents/skills .gemini/config/skills; do
  checa "[ ! -e \"\$HOME/$dest/deskcomm-prompt\" ] && [ ! -L \"\$HOME/$dest/deskcomm-prompt\" ] && [ -f \"\$HOME/$dest/deskcomm-prompt-agente/SKILL.md\" ]" "em ~/$dest, o nome antigo sai e o novo entra"
done
checa "[ -f \"\$HOME/.claude/skills/deskcomm-meu/SKILL.md\" ]" "a varredura não toca skill deskcomm-* da pessoa"

echo "8. sem link simbólico: cópia marcada"
cenario copia
mkdir -p "$TMP/ln-falso"; printf '#!/bin/sh\nexit 1\n' > "$TMP/ln-falso/ln"; chmod +x "$TMP/ln-falso/ln"
saida="$(PATH="$TMP/ln-falso:$PATH" bash "$SCRIPT" 2>&1)"; code=$?
checa "[ $code = 0 ] && grep -q '0 ligados, 6 copiados' <<<\"\$saida\"" "sem ln, copia os 6 e sai com 0"
checa "[ ! -L \"\$HOME/.agents/skills/deskcomm-instalar\" ] && [ -f \"\$HOME/.agents/skills/deskcomm-instalar/.deskcomm-guia\" ]" "a cópia leva a marca .deskcomm-guia"
sed -i.bak 's/versão 1/versão 2/' "$repo/.agents/skills/deskcomm-instalar/SKILL.md" && rm -f "$repo/.agents/skills/deskcomm-instalar/SKILL.md.bak"
git -C "$repo" mv .agents/skills/deskcomm-prompt .agents/skills/deskcomm-prompt-agente
git -C "$repo" commit -qam "v2 e renomeia"
saida="$(PATH="$TMP/ln-falso:$PATH" bash "$SCRIPT" 2>&1)"
checa "grep -q 'versão 2' \"\$HOME/.agents/skills/deskcomm-instalar/SKILL.md\" && ! grep -q pulei <<<\"\$saida\"" "a segunda execução atualiza a cópia (não pula)"
checa "[ ! -e \"\$HOME/.claude/skills/deskcomm-prompt\" ]" "a cópia do guia renomeado sai"
saida="$(bash "$SCRIPT" --remover 2>&1)"
checa "grep -q 'ok: 6 ligação' <<<\"\$saida\" && [ ! -e \"\$HOME/.agents/skills/deskcomm-instalar\" ]" "--remover apaga as 6 cópias"

echo "9. execução interrompida no sparse-checkout"
cenario interrompido
# shellcheck disable=SC2016  # o $PPID é o do git falso: o script que o chamou
git_falso "$TMP/git-mata" 'kill -KILL "$PPID"; exit 130'
{ PATH="$TMP/git-mata:$PATH" bash "$SCRIPT" >/dev/null 2>&1; } 2>/dev/null; code=$?   # o aviso "Killed" é do bash de fora
checa "[ $code != 0 ]" "(pré-condição) a primeira execução morre no meio"
saida="$(bash "$SCRIPT" 2>&1)"; code=$?
checa "[ $code = 0 ] && [ -f \"\$HOME/.claude/skills/deskcomm-instalar/SKILL.md\" ]" "a execução seguinte se cura e liga os guias"

echo "10. sparse-checkout que falha num clone novo"
cenario sparse-falha
git_falso "$TMP/git-falha" 'echo "fatal: could not fetch from promisor remote" >&2; exit 128'
saida="$(PATH="$TMP/git-falha:$PATH" bash "$SCRIPT" 2>&1)"; code=$?
checa "[ $code != 0 ] && [ ! -e \"\$HOME/.deskcomm/guias\" ]" "sai com erro e não deixa a cópia pela metade"

echo "11. nenhum guia na fonte"
cenario sem-guias
git -C "$repo" rm -rq .agents/skills/deskcomm-instalar .agents/skills/deskcomm-prompt && git -C "$repo" commit -qm "sem guias"
saida="$(bash "$SCRIPT" 2>&1)"; code=$?
checa "[ $code = 1 ] && grep -qF \"rm -rf \\\"\$HOME/.deskcomm/guias\\\"\" <<<\"\$saida\"" "sai com 1 e diz como apagar a cópia"

echo "12. edição à mão pela pasta global"
cenario editado
bash "$SCRIPT" >/dev/null 2>&1
echo "anotação local" >> "$HOME/.claude/skills/deskcomm-instalar/SKILL.md"
echo "anotação local" >> "$HOME/.claude/skills/deskcomm-prompt/SKILL.md"
sed -i.bak 's/versão 1/versão 2/' "$repo/.agents/skills/deskcomm-instalar/SKILL.md" && rm -f "$repo/.agents/skills/deskcomm-instalar/SKILL.md.bak"
git -C "$repo" commit -qam v2
saida="$(bash "$SCRIPT" 2>&1)"; code=$?
checa "[ $code = 0 ]" "a atualização não trava (sai com 0)"
checa "grep -q 'versão 2' \"\$HOME/.claude/skills/deskcomm-instalar/SKILL.md\" && ! grep -q 'anotação' \"\$HOME/.claude/skills/deskcomm-instalar/SKILL.md\"" "o guia editado E mudado na main chega na versão nova"
checa "! grep -q 'anotação' \"\$HOME/.claude/skills/deskcomm-prompt/SKILL.md\"" "a edição que não conflita também não sobrevive calada"
checa "grep -q 'descartad' <<<\"\$saida\"" "avisa que descartou a alteração"

echo "13. DESKCOMM_GUIAS_HOME"
cenario pasta-alheia
mkdir -p "$TMP/pasta-alheia/minha"; echo nota > "$TMP/pasta-alheia/minha/nota.txt"
saida="$(DESKCOMM_GUIAS_HOME="$TMP/pasta-alheia/minha" bash "$SCRIPT" 2>&1)"; code=$?
checa "[ $code != 0 ] && [ -f \"\$TMP/pasta-alheia/minha/nota.txt\" ] && grep -q 'não mexo' <<<\"\$saida\"" "pasta com arquivo e sem .git: recusa e a nota fica"
alheio="$TMP/pasta-alheia/clone-alheio"; git clone -q "$repo" "$alheio"; echo "trabalho" >> "$alheio/.agents/skills/deskcomm-instalar/SKILL.md"
DESKCOMM_GUIAS_HOME="$alheio" bash "$SCRIPT" >/dev/null 2>&1; code=$?
checa "[ $code != 0 ] && grep -q 'trabalho' \"\$alheio/.agents/skills/deskcomm-instalar/SKILL.md\"" "clone que não é a cópia do script: recusa e o trabalho não commitado fica"
mkdir -p "$TMP/pasta-alheia/vazia"
PATH="$TMP/git-falha:$PATH" DESKCOMM_GUIAS_HOME="$TMP/pasta-alheia/vazia" bash "$SCRIPT" >/dev/null 2>&1
checa "[ -d \"\$TMP/pasta-alheia/vazia\" ]" "pasta vazia que já existia: uma falha não a apaga"
DESKCOMM_GUIAS_HOME="$TMP/pasta-alheia/vazia" bash "$SCRIPT" >/dev/null 2>&1; code=$?
checa "[ $code = 0 ] && [ -f \"\$HOME/.agents/skills/deskcomm-instalar/SKILL.md\" ]" "pasta vazia que já existia: é aceita"
cenario relativo
mkdir -p "$TMP/relativo/cwd"
(cd "$TMP/relativo/cwd" && DESKCOMM_GUIAS_HOME=cache-rel bash "$SCRIPT" >/dev/null 2>&1)
checa "[ -f \"\$HOME/.claude/skills/deskcomm-instalar/SKILL.md\" ]" "caminho relativo: o link resolve (vira absoluto)"

echo
if [ "$falhas" = 0 ]; then echo "instalar-guias: $casos casos, todos verdes"; exit 0
else echo "instalar-guias: $falhas de $casos casos vermelhos"; exit 1; fi
