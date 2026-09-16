import { describe, expect, it } from "vitest";

import { anonymize, detectResidualPii } from "./index";

describe("anonymize — NIF angolano (BI)", () => {
  it("redige NIF no formato do BI (9 dígitos + 2 letras + 3 dígitos)", () => {
    // Buraco real: antes desta guarda, nenhum padrão capturava letra no meio
    // do número, então esse NIF seguia intacto para o LLM.
    const { anonymized, hits } = anonymize("Meu NIF é 003862011LA042, pode confirmar?");
    expect(anonymized).toBe("Meu NIF é [NIF], pode confirmar?");
    expect(hits).toEqual([{ type: "nif", original: "003862011LA042", replacement: "[NIF]" }]);
  });

  it("continua redigindo CPF brasileiro (não é substituição, é adição)", () => {
    const { anonymized, hits } = anonymize("Meu CPF é 123.456.789-09 aqui");
    expect(anonymized).toBe("Meu CPF é [CPF] aqui");
    expect(hits[0]).toMatchObject({ type: "cpf" });
  });

  it("detectResidualPii pega NIF que sobrou sem passar pelo anonymize", () => {
    expect(detectResidualPii("número 003862011LA042 solto no texto")).toBe("nif");
  });

  /**
   * ⚠️ ESTE CASO PRENDE UM LIMITE, NÃO UMA GARANTIA.
   *
   * Ele afirma que o NIF numérico puro (empresa/estrangeiro, 9 dígitos sem as
   * letras do BI) CONTINUA saindo intacto — e está aqui porque a explicação que
   * acompanhava este padrão quando ele foi proposto dizia o contrário: "já cai
   * no padrão de telefone e sai como [TELEFONE]; o rótulo erra, mas o dado não
   * vaza". Não cai. O padrão de telefone exige 10 dígitos no mínimo, e os dois
   * controles abaixo medem exatamente essa fronteira.
   *
   * Quem um dia fechar esse buraco vai ver este caso ficar vermelho, e é para
   * isso que ele serve: o vermelho é o aviso de que a decisão foi tomada —
   * junto com o preço dela, que é todo número de pedido, protocolo e código de
   * rastreio de 9 dígitos virando `[NIF]` numa conversa de atendimento.
   */
  it("NÃO cobre o NIF numérico de 9 dígitos — e ele também não cai no telefone", () => {
    const noveDigitos = anonymize("Meu NIF é 541712345, pode confirmar?");
    expect(noveDigitos.anonymized).toBe("Meu NIF é 541712345, pode confirmar?");
    expect(noveDigitos.hits).toEqual([]);

    // Controle da fronteira: com 10 dígitos o padrão de telefone ACORDA. É o que
    // prova que a ausência acima é o limiar do `\d{4,5}` + `\d{4}`, e não uma
    // sonda cega que devolveria vazio para qualquer entrada.
    const dezDigitos = anonymize("Telefone 5417123456 aqui");
    expect(dezDigitos.anonymized).toBe("Telefone [TELEFONE] aqui");
    expect(dezDigitos.hits[0]).toMatchObject({ type: "phone" });
  });
});
