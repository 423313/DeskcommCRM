import { describe, expect, it } from "vitest";

import { flowGraphSchema } from "@/lib/followup/graph-schema";
import {
  GRAFO_DE_DEMONSTRACAO,
  NO_ESPERA,
  NO_FIM,
  NO_INICIO,
  NO_MENSAGEM,
} from "../../scripts/lib/grafo-de-demonstracao";

/**
 * O GRAFO DA DEMONSTRAÇÃO TEM QUE ABRIR.
 *
 * `scripts/seed-automacoes-e-followups.ts` grava este grafo em
 * `followup_flow_versions.graph`, que é `jsonb`: o banco aceita QUALQUER objeto.
 * Um grafo que o `flowGraphSchema` recusa é gravado sem erro, o ponteiro fica
 * `active`, a lista de fluxos mostra o nome — e a falha só aparece quando
 * alguém clica para abrir o construtor. Isto é, na demonstração, na frente de
 * quem se queria impressionar.
 *
 * As armadilhas são reais e nenhuma é adivinhável:
 *   • quase todo nó é `strictObject`, então UMA chave a mais reprova;
 *   • `waitConfigSchema` tem piso de 300.000 ms (5 min) — um `duration_ms` de
 *     "30 segundos" para a demo ir rápido seria recusado;
 *   • `end` exige `outcome` de um enum fechado.
 *
 * Este teste roda o schema DE VERDADE, o mesmo que a API usa em
 * `lib/followup/api-schemas.ts`. Não é uma cópia das regras.
 */
describe("grafo de demonstração do follow-up", () => {
  it("passa pelo flowGraphSchema que a API usa", () => {
    const r = flowGraphSchema.safeParse(GRAFO_DE_DEMONSTRACAO);
    expect(
      r.success ? null : JSON.stringify(r.error.issues, null, 2),
      "o grafo do seed não abriria no construtor",
    ).toBeNull();
  });

  it("o schema REPROVA um grafo quebrado (controle do instrumento)", () => {
    // Sem este controle, um `safeParse` que passasse a devolver sucesso sempre
    // — schema afrouxado, import errado — deixaria o caso acima verde para
    // sempre, medindo nada.
    const curto = flowGraphSchema.safeParse({ nodes: [GRAFO_DE_DEMONSTRACAO.nodes[0]], edges: [] });
    expect(curto.success, "um grafo de um nó só deveria ser recusado").toBe(false);

    const esperaCurta = flowGraphSchema.safeParse({
      ...GRAFO_DE_DEMONSTRACAO,
      nodes: GRAFO_DE_DEMONSTRACAO.nodes.map((n) =>
        n.id === NO_ESPERA ? { ...n, config: { mode: "fixed", duration_ms: 30_000 } } : n,
      ),
    });
    expect(esperaCurta.success, "30s está abaixo do piso de 300.000 ms").toBe(false);
  });

  it("os ids que as inscrições apontam existem no grafo", () => {
    // O seed grava `current_node_id` com estes ids. Um id renomeado no grafo e
    // não no seed produz inscrição apontando para um nó que não existe — e o
    // motor não tem para onde avançar.
    const ids = new Set(GRAFO_DE_DEMONSTRACAO.nodes.map((n) => n.id));
    for (const id of [NO_INICIO, NO_ESPERA, NO_MENSAGEM, NO_FIM]) {
      expect(ids.has(id), `o nó "${id}" saiu do grafo e o seed ainda o usa`).toBe(true);
    }
  });

  it("toda aresta liga dois nós que existem", () => {
    const ids = new Set(GRAFO_DE_DEMONSTRACAO.nodes.map((n) => n.id));
    for (const e of GRAFO_DE_DEMONSTRACAO.edges) {
      expect(ids.has(e.source), `aresta ${e.id}: origem "${e.source}" não existe`).toBe(true);
      expect(ids.has(e.target), `aresta ${e.id}: destino "${e.target}" não existe`).toBe(true);
    }
  });
});
