// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { mensagemDaRecusaDeLeitura } from "@/lib/agenda/google/calendar-executor";
import { GoogleHttpError, googleTransport } from "@/lib/agenda/google/transport";

const RAIZ = process.cwd();

function catchDaFuncao(caminho: string, nome: string): string {
  const texto = readFileSync(join(RAIZ, caminho), "utf8");
  const fonte = ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let resultado = "";

  const visita = (no: ts.Node): void => {
    if (ts.isFunctionDeclaration(no) && no.name?.text === nome) {
      const procuraCatch = (filho: ts.Node): void => {
        if (ts.isCatchClause(filho)) resultado = filho.getText(fonte);
        else ts.forEachChild(filho, procuraCatch);
      };
      procuraCatch(no);
      return;
    }
    ts.forEachChild(no, visita);
  };

  visita(fonte);
  expect(resultado, `não encontrei o catch de ${nome} em ${caminho}`).not.toBe("");
  return resultado;
}

async function recusaNaLeitura(): Promise<unknown> {
  const corpo = {
    error: {
      code: 400,
      status: "INVALID_ARGUMENT",
      message: "Invalid attendee: maria.souza@exemplo.test não pode ser convidada",
      errors: [
        {
          domain: "global",
          reason: "invalid",
          message: "Invalid attendee: maria.souza@exemplo.test — Consulta de rotina",
        },
      ],
    },
  };
  const api = googleTransport("test-token", async () =>
    new Response(JSON.stringify(corpo), {
      status: 400,
      headers: { "content-type": "application/json; charset=UTF-8" },
    }),
  );

  return api.page("primary/calendar@example.test", "sync-token").then(
    () => null,
    (erro: unknown) => erro,
  );
}

describe("erros do Google são sanitizados no ponto que os persiste", () => {
  it("a leitura incremental preserva motivo/status sem persistir texto humano", async () => {
    const erro = await recusaNaLeitura();
    expect(erro).toBeInstanceOf(GoogleHttpError);

    const mensagem = mensagemDaRecusaDeLeitura(erro);
    expect(mensagem).toContain("invalid");
    expect(mensagem).toContain("HTTP 400");
    expect(mensagem).not.toContain("maria.souza@exemplo.test");
    expect(mensagem).not.toContain("Invalid attendee");
    expect(mensagem).not.toContain("Consulta de rotina");
    expect(mensagem).not.toContain("@");
  });

  it("erro local de leitura continua com frase genérica, sem ecoar detalhe livre", () => {
    const mensagem = mensagemDaRecusaDeLeitura(
      new Error("segredo interno maria.souza@exemplo.test"),
    );
    expect(mensagem).toBe(
      "A leitura não terminou. Tente sincronizar novamente nas configurações.",
    );
    expect(mensagem).not.toContain("@");
  });

  it("a publicação persiste a função sanitizada no catch real, não e.message", () => {
    const catchReal = catchDaFuncao(
      "lib/agenda/google/sync-executor.ts",
      "reconcileAppointment",
    );
    expect(catchReal).toContain("mensagemDaRecusaDePublicacao(e, metodoEmVoo)");
    expect(catchReal).toContain('call("error", { message })');
    expect(catchReal).not.toMatch(/\be\.message\b/);
  });

  it("a leitura persiste a função sanitizada no catch real, não e.message", () => {
    const catchReal = catchDaFuncao("lib/agenda/google/calendar-executor.ts", "syncCalendar");
    expect(catchReal).toContain("mensagemDaRecusaDeLeitura(e)");
    expect(catchReal).not.toMatch(/\be\.message\b/);
  });
});
