/**
 * A rodada de atualização passa a contar o que aconteceu com o banco, e a tela
 * de atualização mostra isso em português de gente quando a atualização
 * termina. O achado veio do PR #997: o baseline reaplicado sobrevive a uma
 * disputa com o sistema no ar — o kit tenta de novo e fecha. Até aqui essa
 * parte da história morria no log do servidor: quem clicou via "terminou" sem
 * saber que o banco estava ocupado, que a primeira passada não fechou, nem em
 * qual passada a coisa terminou.
 *
 * O que este teste trava:
 *  1. o texto que a tela conta para cada combinação de disputa, retentativas e
 *     passada — é o que a pessoa lê no fim;
 *  2. que "não medido" NÃO vira texto nenhum: sem registro, a tela fica calada
 *     em vez de afirmar uma passada que ninguém contou;
 *  3. que as três colunas existem nos três lugares (migration versionada,
 *     apêndice idempotente do baseline e tipos gerados) — separadas, a tela lê
 *     coluna que não existe.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { rodadaDoBancoDaLinha, textoDaRodadaDoBanco } from "../../lib/system/update-run";

describe("o que a tela conta da rodada de banco", () => {
  it("não conta nada quando ninguém mediu", () => {
    expect(textoDaRodadaDoBanco(null)).toBeNull();
    expect(textoDaRodadaDoBanco(undefined)).toBeNull();
  });

  it("fechou de primeira: diz que foi de uma vez", () => {
    const texto = textoDaRodadaDoBanco({ disputa: false, retentativas: 0, passada: 1 });

    expect(texto).not.toBeNull();
    expect(texto).toContain("primeira passada");
    expect(texto).not.toContain("retentativa");
  });

  it("disputa com retentativa: conta o banco ocupado e em qual passada fechou", () => {
    const texto = textoDaRodadaDoBanco({ disputa: true, retentativas: 1, passada: 2 });

    expect(texto).toContain("disputa");
    expect(texto).toContain("duas passadas");
    expect(texto).toContain("retentativa");
  });

  it("mais de uma retentativa: conta o número certo de passadas e retentativas", () => {
    const texto = textoDaRodadaDoBanco({ disputa: true, retentativas: 2, passada: 3 });

    expect(texto).toContain("3 passadas");
    expect(texto).toContain("2 retentativas");
  });

  it("primeira passada incompleta sem disputa: conta a retentativa sem falar de disputa", () => {
    const texto = textoDaRodadaDoBanco({ disputa: false, retentativas: 1, passada: 2 });

    expect(texto).toContain("duas passadas");
    expect(texto).not.toContain("disputa");
  });

  it("número impossível vira silêncio, não mentira", () => {
    expect(textoDaRodadaDoBanco({ disputa: true, retentativas: 5, passada: 2 })).toBeNull();
    expect(textoDaRodadaDoBanco({ disputa: false, retentativas: -1, passada: 1 })).toBeNull();
    expect(textoDaRodadaDoBanco({ disputa: false, retentativas: 0, passada: 0 })).toBeNull();
    expect(textoDaRodadaDoBanco({ disputa: false, retentativas: 1.5, passada: 2 })).toBeNull();
  });
});

describe("a leitura da linha do banco não inventa o que falta", () => {
  it("linha ausente ou sem as três colunas é 'não medido'", () => {
    expect(rodadaDoBancoDaLinha(null)).toBeNull();
    expect(rodadaDoBancoDaLinha(undefined)).toBeNull();
    expect(rodadaDoBancoDaLinha({})).toBeNull();
    expect(
      rodadaDoBancoDaLinha({
        disputa_de_banco: true,
        retentativas_do_banco: null,
        passada_do_banco: null,
      }),
    ).toBeNull();
  });

  it("linha medida vira o estado que a tela conta", () => {
    expect(
      rodadaDoBancoDaLinha({
        disputa_de_banco: true,
        retentativas_do_banco: 1,
        passada_do_banco: 2,
      }),
    ).toEqual({ disputa: true, retentativas: 1, passada: 2 });
  });
});

describe("as colunas da rodada existem nos três lugares", () => {
  const colunas = ["disputa_de_banco", "retentativas_do_banco", "passada_do_banco"];
  const raiz = process.cwd();

  it("migration versionada + apêndice idempotente do baseline + tipos gerados", () => {
    const migrations = readdirSync(join(raiz, "supabase", "migrations")).filter((nome) =>
      nome.includes("_0276_"),
    );
    expect(migrations).toHaveLength(1);

    const [arquivo] = migrations;
    expect(arquivo).toBeTruthy();

    const migration = readFileSync(
      join(raiz, "supabase", "migrations", arquivo ?? ""),
      "utf8",
    );
    const baseline = readFileSync(join(raiz, "supabase", "baseline.sql"), "utf8");
    const tipos = readFileSync(join(raiz, "lib", "database.types.ts"), "utf8");

    for (const coluna of colunas) {
      expect(migration).toContain(coluna);
      expect(baseline).toContain(coluna);
      expect(tipos).toContain(coluna);
    }
  });

  it("o MANIFEST carrega a rodada como carga, não como opcional", () => {
    const manifest = readFileSync(
      join(raiz, "supabase", "migrations", "MANIFEST.md"),
      "utf8",
    );

    expect(manifest).toContain("0276");
    expect(manifest).toContain("disputa_de_banco");
  });
});
