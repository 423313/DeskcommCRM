/**
 * A guarda de colisão de número de migration TEM DE SER EXECUTADA PELO CI.
 *
 * Ela existia desde antes, com 7 casos provados em
 * `tests/shell/colisao-de-migration.test.ts`, e ninguém a chamava no CI: só o
 * gancho local e `pnpm checar:colisao-de-migration`. Gancho local não alcança
 * quem contribui de um fork, e PR antigo não o roda de novo — o número que
 * estava livre quando ele nasceu pode ter sido tomado depois.
 *
 * Medido em 19/09/2026 sobre os PRs abertos: **12 colidiam com a `main` com os
 * cinco checks obrigatórios VERDES**; um deles com 10 números de uma vez. O
 * defeito só aparece quando o SEGUNDO entra, e aí quem fica com duas migrations
 * de mesmo NNNN é a `main`.
 *
 * Este arquivo guarda as três propriedades que fazem a guarda valer:
 *   1. o CI a INVOCA (existir não é rodar);
 *   2. ela mede contra o REMOTO da base, não contra cópia local;
 *   3. o passo não está desligado por condição que o apague em pull_request.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const CI = readFileSync(".github/workflows/ci.yml", "utf-8");

/** O bloco do job `verify-parte` — é onde o passo tem de morar. */
function blocoDoJob(job: string): string {
  const inicio = CI.indexOf(`\n  ${job}:\n`);
  if (inicio < 0) throw new Error(`job ${job} não encontrado`);
  const resto = CI.slice(inicio + 1);
  const fim = resto.slice(1).search(/\n  [a-zA-Z0-9_-]+:\n/);
  return fim < 0 ? resto : resto.slice(0, fim + 1);
}

describe("a guarda de colisão de migration roda no CI", () => {
  const verify = blocoDoJob("verify-parte");

  it("controle positivo: o recorte pegou o job que roda a suíte", () => {
    expect(verify).toContain("pnpm");
    expect(verify.length).toBeGreaterThan(500);
  });

  it("o CI invoca o script — existir não é rodar", () => {
    expect(
      verify,
      "o passo que chama scripts/checar-colisao-de-migration.sh saiu do verify-parte: a guarda volta a ser só gancho local, que fork nenhum roda",
    ).toMatch(/bash scripts\/checar-colisao-de-migration\.sh/);
  });

  it("mede contra o REMOTO da base do PR, nunca contra uma cópia local", () => {
    // `origin/<base>` faz o próprio script buscar a ref no remoto antes de
    // comparar. Medir contra `main` local mediria uma árvore que pode estar
    // parada em qualquer ponto do passado — e a colisão nasce justamente do que
    // entrou na base DEPOIS.
    expect(verify).toMatch(/checar-colisao-de-migration\.sh origin\/\$\{GITHUB_BASE_REF:-main\}/);
  });

  it("o passo não é apagado por condição em pull_request", () => {
    // `if:` na altura do passo não faz falhar: faz não rodar. Um `github.event_name
    // != 'pull_request'` aqui desligaria a guarda exatamente onde ela serve.
    const passo = verify.slice(verify.indexOf("O número da migration já está tomado?"));
    const condicao = passo.match(/^\s+if: (.*)$/m)?.[1];
    expect(condicao, "a condição do passo mudou — descreva por que, e confira que ela ainda vale em pull_request").toBe(
      "matrix.parte == 1",
    );
  });

  it("código diferente de zero reprova — inclusive o 2 (não consegui medir)", () => {
    const passo = verify.slice(verify.indexOf("O número da migration já está tomado?"));
    expect(passo).toMatch(/if \[ "\$codigo" != 0 \]; then/);
    expect(passo).toMatch(/exit "\$codigo"/);
  });
});
