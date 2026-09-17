import { describe, expect, it } from "vitest";

import { SCENARIO_READS } from "@/lib/agent-engine/agent/preview";
import { allTools } from "@/lib/mcp/tools";

describe("leituras permitidas na prévia usam nomes reais do catálogo MCP", () => {
  it("toda leitura de cenário existe e é uma ferramenta de leitura", () => {
    const catalogo = new Map(allTools.map((tool) => [tool.name, tool]));

    for (const nome of SCENARIO_READS) {
      const ferramenta = catalogo.get(nome);
      expect(ferramenta, `SCENARIO_READS contém ferramenta inexistente: ${nome}`).toBeDefined();
      expect(ferramenta?.category, `${nome} precisa continuar sendo uma leitura`).toBe("read");
    }
  });

  it("a cadeia da agenda começa pela ferramenta registrada de tipos de atendimento", () => {
    expect(SCENARIO_READS.has("crm_list_event_types")).toBe(true);
    expect(SCENARIO_READS.has("crm_list_appointment_types")).toBe(false);
  });
});
