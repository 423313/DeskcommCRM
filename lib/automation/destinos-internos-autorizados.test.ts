import { lookup } from "node:dns/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  autorizacoesDeclaradas,
  donoDaInstalacaoAutorizou,
  listaCobreHost,
} from "./destinos-internos-autorizados";

/**
 * A lista que o operador escreve no `.env` — por aqui, como o app a lê.
 * `vi.stubEnv` não serve: o módulo lê o `env` do app, e é isso que o teste
 * tem de exercitar.
 */
const listaDoEnv = vi.hoisted(() => ({ valor: "" }));
vi.mock("@/lib/env", () => ({
  env: {
    get IA_DESTINOS_INTERNOS_PERMITIDOS() {
      return listaDoEnv.valor;
    },
  },
}));

/** A resolução de DNS que o guarda de IP pagaria — aqui, controlada. */
const dns = vi.hoisted(() => ({ resposta: [] as Array<{ address: string; family: number }> }));
vi.mock("node:dns/promises", () => {
  const lookup = vi.fn(async () => dns.resposta);
  // O default é obrigatório: sem ele o vitest recusa o mock na coleta.
  return { lookup, default: { lookup } };
});

const lookupMock = vi.mocked(lookup);

beforeEach(() => {
  vi.clearAllMocks();
  listaDoEnv.valor = "";
  dns.resposta = [{ address: "93.184.216.34", family: 4 }];
});

describe("destinos internos autorizados pelo dono da instalação (#1004)", () => {
  it("CONTROLE: sem a lista no .env, nada é autorizado — nem o que é interno, nem o que não é", async () => {
    await expect(donoDaInstalacaoAutorizou("http://10.1.2.7:8080/v1")).resolves.toBe(false);
    await expect(donoDaInstalacaoAutorizou("http://localhost:11434/v1")).resolves.toBe(false);
    await expect(donoDaInstalacaoAutorizou("https://api.groq.com/openai/v1")).resolves.toBe(false);
    expect(autorizacoesDeclaradas()).toEqual([]);
  });

  it("endereço declarado passa, e sem pagar DNS: o que já está na lista não tem o que resolver", async () => {
    listaDoEnv.valor = " coletor.interno.exemplo , 10.1.2.7 ";

    await expect(donoDaInstalacaoAutorizou("https://coletor.interno.exemplo/v1")).resolves.toBe(true);
    await expect(donoDaInstalacaoAutorizou("http://10.1.2.7:8080/v1")).resolves.toBe(true);
    expect(lookupMock, "o passo de graça resolveu o nome à toa").not.toHaveBeenCalled();
  });

  it("faixa CIDR cobre o que está dentro dela e mais nada", async () => {
    listaDoEnv.valor = "10.1.0.0/16";

    await expect(donoDaInstalacaoAutorizou("http://10.1.2.7:8080/v1")).resolves.toBe(true);
    await expect(donoDaInstalacaoAutorizou("http://10.1.255.254/v1")).resolves.toBe(true);
    await expect(donoDaInstalacaoAutorizou("http://10.2.0.1:8080/v1")).resolves.toBe(false);
    await expect(donoDaInstalacaoAutorizou("http://11.1.2.7:8080/v1")).resolves.toBe(false);
  });

  it("entrada fora do formato é ignorada — e ignorar é RECUSAR", async () => {
    // Curinga, esquema, porta, prefixo impossível: nada disso vira autorização.
    listaDoEnv.valor =
      "*, coletor.interno.exemplo:11434, https://coletor.interno.exemplo, 10.1.0.0/33, [::1]";

    expect(autorizacoesDeclaradas()).toEqual([]);
    await expect(donoDaInstalacaoAutorizou("https://coletor.interno.exemplo/v1")).resolves.toBe(false);
    await expect(donoDaInstalacaoAutorizou("http://10.1.2.7:8080/v1")).resolves.toBe(false);
  });

  it("faixa declarada cobre o nome que resolve para dentro dela", async () => {
    listaDoEnv.valor = "10.1.0.0/16";
    dns.resposta = [{ address: "10.1.2.3", family: 4 }];

    await expect(donoDaInstalacaoAutorizou("https://coletor.interno.exemplo/v1")).resolves.toBe(true);
    expect(lookupMock).toHaveBeenCalled();
  });

  it("nome que resolve para fora da faixa continua recusado", async () => {
    listaDoEnv.valor = "10.1.0.0/16";
    dns.resposta = [{ address: "93.184.216.34", family: 4 }];

    await expect(donoDaInstalacaoAutorizou("https://coletor.interno.exemplo/v1")).resolves.toBe(false);
  });

  it("nome que resolve para dentro E para fora não passa: meia autorização não é autorização", async () => {
    listaDoEnv.valor = "10.1.0.0/16";
    dns.resposta = [
      { address: "10.1.2.3", family: 4 },
      { address: "93.184.216.34", family: 4 },
    ];

    await expect(donoDaInstalacaoAutorizou("https://coletor.interno.exemplo/v1")).resolves.toBe(false);
  });

  it("URL que não dá para ler não autoriza nada", async () => {
    listaDoEnv.valor = "coletor.interno.exemplo";

    await expect(donoDaInstalacaoAutorizou("isso não é um endereço")).resolves.toBe(false);
  });

  it("CONTROLE: listaCobreHost distingue a lista vazia do endereço coberto", () => {
    const autorizacoes = autorizacoesDeclaradas("coletor.interno.exemplo,10.1.0.0/16");

    expect(listaCobreHost("coletor.interno.exemplo", [])).toBe(false);
    expect(listaCobreHost("coletor.interno.exemplo", autorizacoes)).toBe(true);
    expect(listaCobreHost("COLETOR.INTERNO.EXEMPLO", autorizacoes)).toBe(true);
    expect(listaCobreHost("10.1.9.9", autorizacoes)).toBe(true);
    expect(listaCobreHost("outra-maquina.interno", autorizacoes)).toBe(false);
  });
});
