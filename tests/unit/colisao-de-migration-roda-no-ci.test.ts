/**
 * AS DUAS CAMADAS DA GUARDA DE COLISÃO DE MIGRATION TÊM DE CONTINUAR NO CI.
 *
 * Camada 1 (já existia, e NINGUÉM a vigiava): `pnpm checar:colisao-de-migration`
 * na parte 1 do `verify` — o número que o PR acrescenta não pode estar tomado na
 * base. Sem este arquivo, apagar essa linha sai verde, e a régua vira de novo o
 * gancho local, que `core.hooksPath` não versiona e fork nenhum roda.
 *
 * Camada 2 (nova): fora de `pull_request` a camada 1 é INERTE — HEAD é a própria
 * base e nada foi "acrescentado". Medido em 19/09/2026: o #965 estava verde com
 * prévia de 1039 commits atrás e cinco números já tomados, porque a guarda dele
 * rodou contra uma `main` que já não existe. A varredura da árvore fecha essa
 * fresta: nenhum NNNN nem timestamp repetido pode existir na `main`.
 *
 * ⚠️ O NOME DO COMANDO TEM DOIS FORMATOS, e foi assim que eu errei: buscar pelo
 * ARQUIVO (`checar-colisao-de-migration.sh`) não acha quem o chama pelo ALIAS
 * (`checar:colisao-de-migration`). Medi zero, concluí "o CI não executa" e
 * escrevi um PR inteiro em cima disso — até um colega medir na fonte. Por isso
 * as asserções abaixo casam os DOIS nomes.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const CI = readFileSync(".github/workflows/ci.yml", "utf-8");
const PKG = JSON.parse(readFileSync("package.json", "utf-8")) as { scripts: Record<string, string> };

function blocoDoJob(job: string): string {
  const inicio = CI.indexOf(`\n  ${job}:\n`);
  if (inicio < 0) throw new Error(`job ${job} não encontrado`);
  const resto = CI.slice(inicio + 1);
  const fim = resto.slice(1).search(/\n  [a-zA-Z0-9_-]+:\n/);
  return fim < 0 ? resto : resto.slice(0, fim + 1);
}

describe("as duas camadas da guarda de colisão rodam no CI", () => {
  const verify = blocoDoJob("verify-parte");

  it("controle positivo: o recorte pegou o job que roda a suíte", () => {
    expect(verify).toContain("pnpm");
    expect(verify.length).toBeGreaterThan(500);
  });

  it("o alias existe no package.json e aponta para o script", () => {
    // O elo que a minha sonda cega não atravessou: é ele que liga o nome usado
    // no workflow ao arquivo de verdade.
    expect(PKG.scripts["checar:colisao-de-migration"]).toMatch(/scripts\/checar-colisao-de-migration\.sh/);
  });

  it("camada 1: o verify invoca a guarda por QUALQUER um dos dois nomes", () => {
    const invoca =
      /pnpm checar:colisao-de-migration/.test(verify) ||
      /bash scripts\/checar-colisao-de-migration\.sh/.test(verify);
    expect(
      invoca,
      "nenhum passo do verify-parte chama a guarda de colisão, nem pelo alias nem pelo arquivo: a régua volta a ser só o gancho local, que fork nenhum roda",
    ).toBe(true);
  });

  it("camada 1 roda em pull_request — não pode ser desligada justamente onde serve", () => {
    const i = verify.search(/- name: Colisão de número de migration/);
    expect(i, "o passo da camada 1 sumiu ou foi renomeado").toBeGreaterThan(-1);
    const passo = verify.slice(i, i + 400);
    expect(passo.match(/^\s+if: (.*)$/m)?.[1]).toBe("matrix.parte == 1");
  });

  it("camada 1b: a prévia velha reprova SÓ quando as duas coisas valem", () => {
    // O #965 mostrou que o verde vence: a guarda mediu a `main` de 1039 commits
    // atrás. O recorte é estreito de propósito — este PR acrescenta migration E
    // a base ganhou migration desde a prévia. Alargar isto vira "branch sempre
    // em dia para todo mundo", que é o laço de retrabalho que a fila já pagou.
    const i = verify.search(/- name: As migrations da main andaram desde a prévia deste PR\?/);
    expect(i, "o passo da prévia velha saiu do verify").toBeGreaterThan(-1);
    const passo = verify.slice(i, i + 2200);
    expect(passo.match(/^\s+if: (.*)$/m)?.[1]).toBe("matrix.parte == 1 && github.event_name == 'pull_request'");
    // as duas condições, e não uma
    expect(passo, "sem a saída antecipada, PR que não toca schema seria alcançado").toMatch(
      /minhas:-0\}" = 0 \]; then\n\s+echo "este PR não acrescenta migration/,
    );
    expect(passo, "só migration ACRESCENTADA na base conta").toMatch(/status=="added".*supabase\/migrations/s);
    // e não medir não pode passar
    expect(passo, "comparação indisponível tem de reprovar, não seguir").toMatch(/NÃO MEDIDO[\s\S]*exit 2/);
  });

  it("camada 2: a varredura da árvore roda FORA de pull_request", () => {
    const i = verify.search(/- name: A árvore da main tem NNNN ou timestamp repetido\?/);
    expect(i, "a varredura de duplicata na árvore saiu do verify").toBeGreaterThan(-1);
    const passo = verify.slice(i, i + 400);
    expect(
      passo.match(/^\s+if: (.*)$/m)?.[1],
      "em pull_request a camada 1 já mede; fora dele é a única que mede",
    ).toBe("matrix.parte == 1 && github.event_name != 'pull_request'");
  });
});
