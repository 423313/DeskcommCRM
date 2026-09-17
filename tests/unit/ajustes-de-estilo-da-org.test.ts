// @vitest-environment node
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  AJUSTES_DESLIGADOS,
  aplicarAjustesDeEstilo,
  lerAjustesDeEstiloDaOrg,
  removerTravessaoLongo,
} from "@/lib/agent-engine/guardrails/ajustes-de-estilo-da-org";

describe("ajustes de estilo da organização", () => {
  it("nasce desligado e não muda o texto", () => {
    const texto = "Olá — posso te ajudar — agora";
    expect(aplicarAjustesDeEstilo(texto, AJUSTES_DESLIGADOS)).toBe(texto);
  });

  it("troca travessão longo no meio por vírgula + espaço", () => {
    expect(removerTravessaoLongo("Olá — posso te ajudar")).toBe("Olá, posso te ajudar");
    expect(removerTravessaoLongo("Olá—posso te ajudar")).toBe("Olá, posso te ajudar");
    expect(removerTravessaoLongo("A — B — C")).toBe("A, B, C");
  });

  it("não deixa vírgula órfã quando o travessão está na borda", () => {
    expect(removerTravessaoLongo("— Olá")).toBe("Olá");
    expect(removerTravessaoLongo("Até amanhã —")).toBe("Até amanhã");
  });

  it("preserva quebras de linha ao ajustar pontuação", () => {
    expect(removerTravessaoLongo("Primeiro\n— Segundo")).toBe("Primeiro\n, Segundo");
    expect(removerTravessaoLongo("Primeiro —\nSegundo")).toBe("Primeiro, \nSegundo");
  });

  it("liga a regra pela configuração da organização", () => {
    expect(
      aplicarAjustesDeEstilo("Olá — tudo bem?", { sem_travessao_longo: true }),
    ).toBe("Olá, tudo bem?");
  });

  it("consulta a escolha com organization_id explícito", async () => {
    const chamadas: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      async query(sql: string, params?: unknown[]) {
        chamadas.push({ sql, params: params ?? [] });
        return {
          rows: [{ layer: "estilo:sem_travessao_longo", enabled: true }],
          rowCount: 1,
          command: "SELECT",
          oid: 0,
          fields: [],
        };
      },
    };

    await expect(lerAjustesDeEstiloDaOrg(db, "org-1")).resolves.toEqual({
      sem_travessao_longo: true,
    });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.sql).toContain("organization_id = $1");
    expect(chamadas[0]!.params[0]).toBe("org-1");
  });

  it("falha de leitura não derruba atendimento e mantém todos desligados", async () => {
    const db = {
      async query() {
        throw new Error("db indisponível");
      },
    };
    await expect(lerAjustesDeEstiloDaOrg(db, "org-1")).resolves.toEqual(AJUSTES_DESLIGADOS);
  });
});

describe("fiação antes do before_send", () => {
  it("normaliza o texto do modelo antes do classificador semântico e do GateContext", () => {
    const fonte = fs.readFileSync(
      path.join(process.cwd(), "lib/agent-engine/guardrails/before-send.ts"),
      "utf8",
    );
    const ajuste = fonte.indexOf("const bodyDoModelo =");
    const semantica = fonte.indexOf("args.classifyPromiseSemantic(bodyDoModelo)");
    const contexto = fonte.indexOf("body: bodyDoModelo");

    expect(ajuste).toBeGreaterThan(-1);
    expect(semantica).toBeGreaterThan(ajuste);
    expect(contexto).toBeGreaterThan(ajuste);
  });

  it("usa presença de enforceInternalVocabulary para alcançar também o re-run do fail-safe", () => {
    const fonte = fs.readFileSync(
      path.join(process.cwd(), "lib/agent-engine/guardrails/before-send.ts"),
      "utf8",
    );
    expect(fonte).toContain("args.enforceInternalVocabulary !== undefined");
    expect(fonte).not.toContain("args.enforceInternalVocabulary === true\n        ? aplicarAjustesDeEstilo");
  });
});
