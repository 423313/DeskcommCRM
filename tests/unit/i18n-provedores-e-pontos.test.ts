/**
 * TEXTO DE PROVEDOR E DE PONTO DE IA TEM ESPANHOL.
 *
 * Esses textos chegam à tela por `t(variavel)` — `t(provedor.quandoUsar)`,
 * `t(ponto.rotulo)` —, e o guarda de tela (`i18n-espanhol-cobre-a-tela`) só
 * enxerga `t("literal")`. Sem este arquivo, texto novo sai em português numa
 * tela em espanhol sem nenhum gate reclamar: foi o que aconteceu com o
 * `quandoUsar` da DeepSeek.
 *
 * O `rotulo` do PROVEDOR fica de fora de propósito: é nome de marca
 * ("Anthropic (Claude)", "Jev (TypeSafe AI)"), igual nos dois idiomas, e a
 * falta de entrada já degrada para ele mesmo.
 */
import { describe, expect, it } from "vitest";

import { PROVEDORES_COM_CHAVE } from "@/lib/ai/pontos/provedores";
import { PONTOS_DE_IA } from "@/lib/ai/pontos/registro";
import { DICIONARIO } from "@/lib/i18n/dicionario";

function semEspanhol(textos: readonly string[]): string[] {
  return textos.filter((t) => !DICIONARIO[t]?.es);
}

describe("espanhol dos textos que vêm de lista, não de literal", () => {
  it("todo `quandoUsar` de provedor com chave", () => {
    expect(semEspanhol(PROVEDORES_COM_CHAVE.map((p) => p.quandoUsar))).toEqual([]);
  });

  it("todo texto de ponto de IA — rótulo, descrição, sintoma e o que o Jev faz", () => {
    const textos = PONTOS_DE_IA.flatMap((p) => [
      p.rotulo,
      p.oQueFaz,
      p.sintomaDeFalha,
      ...(p.decisaoRapida ? [p.decisaoRapida.oQueOJevFaz] : []),
    ]);
    expect(textos.length, "a varredura não enxergou o registro").toBeGreaterThan(30);
    expect(semEspanhol(textos)).toEqual([]);
  });
});
