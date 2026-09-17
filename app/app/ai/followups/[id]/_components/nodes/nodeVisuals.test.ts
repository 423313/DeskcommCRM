/**
 * O subtítulo do card do nó final passou a sair de `lib/followup/vocabulario.ts`
 * em vez de um mapa próprio deste arquivo — eram duas cópias das mesmas três
 * palavras. A troca só vale se o texto na tela for o MESMO, e "mesmo" aqui é
 * literal: `tests/e2e/followup-journey.spec.ts` confere "Convertido" no card.
 */
import { describe, expect, it } from "vitest";

import { validateFlowForPublish } from "@/lib/followup/validate-publish";
import type { FlowGraph } from "@/lib/followup/graph-schema";

import { describeNodeConfig, NODE_VISUAL_LIST, NODE_VISUALS } from "./nodeVisuals";

describe("describeNodeConfig — nó final", () => {
  it.each([
    ["converted", "Convertido"],
    ["exhausted", "Esgotado"],
    ["custom", "Personalizado"],
  ] as const)("outcome '%s' aparece no card como '%s'", (outcome, esperado) => {
    expect(describeNodeConfig("end", { outcome })).toBe(esperado);
  });
});

/**
 * O subtítulo do card de condição anunciava sempre o combinador. No modo
 * uma-saída-por-regra o motor NÃO consulta o combinador — o card estaria
 * afirmando uma coisa que o código ignora, e é no card que o usuário acredita.
 * Achado olhando o screenshot da própria evidência.
 */
describe("NODE_VISUAL_LIST", () => {
  it("oferece match_reply e repeat junto dos demais nós", () => {
    expect(NODE_VISUAL_LIST.map((v) => v.type)).toContain("match_reply");
    expect(NODE_VISUAL_LIST.map((v) => v.type)).toContain("repeat");
    expect(NODE_VISUAL_LIST.map((v) => v.type)).toContain("ai_classify");
  });
});

describe("describeNodeConfig — nó de condição", () => {
  const regras = [
    { id: "regra-1", field: "tag" as const, op: "contains" as const, value: "vip" },
    { id: "regra-2", field: "steps_taken" as const, op: "gte" as const, value: 3 },
  ];

  it("no modo combinado anuncia o combinador, que é o que decide", () => {
    expect(describeNodeConfig("condition", { combinator: "and", checks: regras })).toBe("2 condição(ões) · E");
    expect(describeNodeConfig("condition", { combinator: "or", checks: regras })).toBe("2 condição(ões) · OU");
  });

  it("no modo uma-saída-por-regra NÃO anuncia combinador nenhum", () => {
    const texto = describeNodeConfig("condition", {
      combinator: "and",
      branching: "per_check",
      checks: regras,
    });
    expect(texto).toBe("2 regras · uma saída por regra");
    expect(texto).not.toMatch(/\bE\b|\bOU\b/);
  });
});

describe("o nó de condição nasce sem decidir sozinho", () => {
  it("a regra padrão está a preencher, e o publish não a deixa passar", () => {
    // Era `passos ≥ 0`: verdadeira para todo lead, com cara de regra pronta no card.
    const config = NODE_VISUALS.condition.defaultConfig();
    const grafo: FlowGraph = {
      nodes: [
        { id: "t1", type: "trigger", label: "t1", position: { x: 0, y: 0 }, config: {} },
        { id: "c1", type: "condition", label: "c1", position: { x: 0, y: 0 }, config } as FlowGraph["nodes"][number],
        { id: "fim", type: "end", label: "fim", position: { x: 0, y: 0 }, config: { outcome: "exhausted" } },
      ],
      edges: [
        { id: "e1", source: "t1", target: "c1", priority: 0, condition: { type: "always" } },
        { id: "e2", source: "c1", target: "fim", priority: 0, condition: { type: "cond_result", value: true } },
        { id: "e3", source: "c1", target: "fim", priority: 0, condition: { type: "cond_result", value: false } },
      ],
    };
    const r = validateFlowForPublish(grafo);
    expect(r.ok ? [] : r.errors.map((e) => e.code)).toEqual(["empty_check_value"]);
  });
});
