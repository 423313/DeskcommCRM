import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EXTENSION_CAPABILITIES, EXTENSION_PERMISSIONS } from "@/lib/extensions/capacidades";

/**
 * O CATÁLOGO DE ENSAIO É OUTRO PROCESSO, E POR ISSO ELE DIVERGE CALADO.
 *
 * `experiments/extensoes/catalog/catalog.py` é a bancada que os três E2E de extensão usam para
 * publicar um pacote (`make-example`). Ele é isolado de propósito — SQLite próprio, sem o banco
 * do CRM —, então não importa o TypeScript: ele REPETE o vocabulário em Python.
 *
 * Repetição sem guarda envelhece. Quando a ADR-0003 ampliou o contrato, a bancada continuou
 * validando `permissions == ["navigation.tasks"]` e gerando `host_api {1,1}` — ou seja, ela
 * passou a publicar um pacote que o host RECUSA. O sintoma não apareceu em nenhum teste
 * unitário: apareceu 22 minutos depois, no E2E, como três specs vermelhas cujo erro dizia
 * "instalação falhou" — longe da causa.
 *
 * Este arquivo compara as duas listas. É barato, roda em milissegundos, e reprova no lugar
 * onde a pessoa está editando.
 */

const CATALOG_PY = join(__dirname, "..", "..", "experiments", "extensoes", "catalog", "catalog.py");
const fonte = readFileSync(CATALOG_PY, "utf8");

/** Lê uma lista literal de strings do Python — `NOME = [ "a", "b" ]`. */
function listaPython(nome: string): string[] {
  const bloco = new RegExp(`^${nome}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "m").exec(fonte);
  if (!bloco) throw new Error(`${nome} não encontrada em catalog.py`);
  return [...bloco[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
}

describe("o catálogo de ensaio espelha o vocabulário do host", () => {
  it("as permissões são as mesmas, na mesma ordem", () => {
    expect(listaPython("PERMISSOES")).toEqual([...EXTENSION_PERMISSIONS]);
  });

  it("as capacidades são as mesmas, na mesma ordem", () => {
    expect(listaPython("CAPACIDADES")).toEqual([...EXTENSION_CAPABILITIES]);
  });

  it("a versão do host da bancada é a que o manifesto aceita", () => {
    const declarada = /^HOST_API_ATUAL\s*=\s*(\d+)/m.exec(fonte)?.[1];
    expect(declarada, "HOST_API_ATUAL ausente em catalog.py").toBeDefined();
    // A fonte é o manifesto: um pacote com {min:1,max:N} tem de ser compatível com este host.
    const manifesto = readFileSync(
      join(__dirname, "..", "..", "lib", "extensions", "manifest.ts"),
      "utf8",
    );
    const host = /HOST_API_VERSION\s*=\s*(\d+)/.exec(manifesto)?.[1];
    expect(declarada).toBe(host);
  });

  it("a bancada não guarda mais o valor fixo do contrato v1", () => {
    // A forma exata que travou o E2E: comparação com a lista literal de um elemento.
    expect(fonte).not.toContain('!= ["navigation.tasks"]');
    expect(fonte).not.toContain('!= "tasks.open"');
  });
});
