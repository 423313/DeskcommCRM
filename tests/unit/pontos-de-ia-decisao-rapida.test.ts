/**
 * PONTO MARCADO COMO "DECISÃO RÁPIDA" TEM CHAMADOR DO JEV — e vice-versa.
 *
 * `decisaoRapida` no registro é o que a tela vai oferecer como "tarefa do Jev".
 * Marcado sem chamador, é botão que não controla nada: o dono liga o Jev, paga,
 * e nada muda. Chamador sem marca é o avesso: o Jev decide num ponto que a tela
 * não mostra. Mesmo molde de `pontos-de-ia-completude.test.ts`, lendo o
 * CÓDIGO-FONTE de `lib/ai/decisao/`, onde mora todo chamador do Jev.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PONTOS_DE_IA } from "@/lib/ai/pontos/registro";

import { arquivosDeCodigo, caminhoRelativo } from "./helpers/varrer-codigo";

const CHAMADA = /ponto:\s*["']([a-z_]+)["']/g;

/** ponto → arquivos de `lib/ai/decisao/` que o passam a `decidirNoPonto`. */
function chamadores(): Map<string, { arquivo: string; fonte: string }[]> {
  const mapa = new Map<string, { arquivo: string; fonte: string }[]>();
  for (const abs of arquivosDeCodigo(["lib/ai/decisao"])) {
    const fonte = readFileSync(abs, "utf8");
    for (const m of fonte.matchAll(CHAMADA)) {
      const lista = mapa.get(m[1]!) ?? [];
      lista.push({ arquivo: caminhoRelativo(abs), fonte });
      mapa.set(m[1]!, lista);
    }
  }
  return mapa;
}

const marcados = PONTOS_DE_IA.filter((p) => p.decisaoRapida !== undefined);
const porPonto = chamadores();

describe("decisão rápida: registro × chamador do Jev", () => {
  it("há ponto marcado e há chamador (controle positivo)", () => {
    expect(marcados.map((p) => p.id)).toContain("sentiment_classify");
    expect(porPonto.has("sentiment_classify")).toBe(true);
  });

  it("todo ponto marcado tem chamador, que pergunta na primitiva declarada", () => {
    const semChamador = marcados
      .filter((p) => {
        const quem = porPonto.get(p.id) ?? [];
        const tipo = new RegExp(`tipo:\\s*["']${p.decisaoRapida!.primitiva}["']`);
        return !quem.some((c) => tipo.test(c.fonte));
      })
      .map((p) => `${p.id} (${p.decisaoRapida!.primitiva})`);
    expect(semChamador, "ponto que a tela vai oferecer ao Jev sem ninguém chamá-lo").toEqual([]);
  });

  it("todo chamador do Jev está num ponto marcado", () => {
    const idsMarcados = new Set(marcados.map((p) => p.id));
    const orfaos = [...porPonto.entries()]
      .filter(([id]) => !idsMarcados.has(id))
      .map(([id, quem]) => `${id} (em ${quem.map((c) => c.arquivo).join(", ")})`);
    expect(orfaos, "o Jev decide num ponto que a tela não mostra").toEqual([]);
  });

  it("o que a tela diz sobre o Jev está escrito para quem não é engenheiro", () => {
    const jargao = /\b(401|403|429|HTTP|timeout|token|prompt|API|score|provider)\b/i;
    const tecnicos = marcados
      .filter((p) => jargao.test(p.decisaoRapida!.oQueOJevFaz))
      .map((p) => p.id);
    expect(tecnicos).toEqual([]);
  });
});
