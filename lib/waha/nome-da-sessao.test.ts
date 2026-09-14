import { describe, expect, it } from "vitest";
import { TETO_NOME_WAHA, cabeNoWaha, nomeWahaNovo } from "./nome-da-sessao";

const ORG = "52d2a0d0-b31d-4563-a943-1411da81728f";

describe("nome da sessão WAHA", () => {
  it("o formato da 0228/0230 estoura o teto de 54 — é o 400 do create", () => {
    const legado = `org_${ORG.replaceAll("-", "")}_${crypto.randomUUID().replaceAll("-", "")}`;
    expect(legado.length).toBe(69);
    expect(cabeNoWaha(legado)).toBe(false);
  });

  it("o nome novo cabe no DTO e no pattern do WAHA", () => {
    const nome = nomeWahaNovo(ORG, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(nome).toBe("org_52d2a0d0_aaaaaaaabbbbccccddddeeeeeeeeeeee");
    expect(nome.length).toBeLessThanOrEqual(TETO_NOME_WAHA);
    expect(cabeNoWaha(nome)).toBe(true);
  });

  it("recusa caractere que o WAHA também recusa", () => {
    expect(cabeNoWaha("org/slash")).toBe(false);
    expect(cabeNoWaha("org.dot")).toBe(false);
  });
});
