import { describe, expect, it } from "vitest";

import { listConversationsHandler } from "@/app/api/v1/conversations/_handler";

/**
 * O FILTRO POR MARCADOR DO INBOX PERGUNTA À TABELA ONDE SE MARCA.
 *
 * ## O defeito que fez este arquivo existir (relatado 2026-08-17)
 *
 * O Inbox passou a ter UMA caixa de marcador — a do contato, a mesma da ficha e a
 * mesma que a campanha lê. O filtro da lista, porém, continuou buscando em
 * `conversations.tags`. Resultado na tela: *"adicionei a tag nele para testar e
 * ele n aparece no filtro"*, e o único marcador oferecido era o de uma conversa
 * antiga. Escrever num lugar e procurar em outro não dá erro nenhum — dá lista
 * vazia, que o usuário lê como "o CRM perdeu meu marcador".
 *
 * ## Por que os dois casos, e não só o primeiro
 *
 * Filtrar coluna de tabela embutida no PostgREST exige junção INTERNA. Sem
 * `!inner`, o filtro é aplicado ao embutido: o contato vem `null` e a conversa
 * FICA na lista — ou seja, o filtro não filtra, e um teste que só olhasse o
 * `contains` passaria com o defeito vivo.
 *
 * O `!inner` também não fica permanente: sem marcador, a consulta da lista
 * continua a mesma de antes (`conversations.contact_id` é NOT NULL, então a
 * junção interna não tiraria linha hoje — mas mudaria a consulta mais lida do
 * Inbox sem necessidade). O segundo caso prova que ele só entra com marcador.
 */

/** Registra a cadeia do PostgREST; resolve como lista vazia no `await`. */
function fakeSupabase() {
  const chamadas: { metodo: string; args: unknown[] }[] = [];
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (ok: (v: unknown) => unknown) => ok({ data: [], error: null });
        }
        return (...args: unknown[]) => {
          chamadas.push({ metodo: String(prop), args });
          return proxy;
        };
      },
    },
  ) as Record<string, unknown>;
  return { client: { from: () => proxy } as never, chamadas };
}

const ctx = {
  organization_id: "org-1",
  requestId: "req-1",
  actor: { type: "user" as const, id: "user-1" },
} as never;

async function rodar(q: Record<string, unknown>) {
  const { client, chamadas } = fakeSupabase();
  await listConversationsHandler(client, ctx, { limit: 50, ...q } as never);
  return chamadas;
}

const selectDe = (chamadas: { metodo: string; args: unknown[] }[]) =>
  String(chamadas.find((c) => c.metodo === "select")?.args[0] ?? "");

describe("listConversationsHandler — filtro por marcador", () => {
  it("filtra `contacts.tags`, e NÃO `tags` da conversa", async () => {
    const chamadas = await rodar({ tag: "fidic" });
    const contains = chamadas.filter((c) => c.metodo === "contains");

    expect(contains).toHaveLength(1);
    expect(contains[0]!.args).toEqual(["contacts.tags", ["fidic"]]);
  });

  it("junta o contato por `!inner` — senão o filtro não exclui ninguém", async () => {
    expect(selectDe(await rodar({ tag: "fidic" }))).toContain("contacts:contact_id!inner");
  });

  it("sem marcador no filtro, a junção NÃO é interna — a lista fica como era", async () => {
    const select = selectDe(await rodar({}));
    expect(select).toContain("contacts:contact_id (");
    expect(select).not.toContain("!inner");
  });

  it("continua filtrando por organização — o filtro novo não desloca o de tenant", async () => {
    const chamadas = await rodar({ tag: "fidic" });
    expect(
      chamadas.some(
        (c) => c.metodo === "eq" && c.args[0] === "organization_id" && c.args[1] === "org-1",
      ),
    ).toBe(true);
  });
});
