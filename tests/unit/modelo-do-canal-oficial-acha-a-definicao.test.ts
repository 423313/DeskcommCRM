import { describe, expect, it } from "vitest";

import { linhaDoEspelho } from "@/lib/channels/linha-do-espelho";

// O sync do canal oficial grava `meta_templates` por `waba_id`, com
// `channel_session_id` NULO; os parceiros gravam a conexão. Desde que o envio
// passou a filtrar pela conexão da conversa, o canal oficial não achava a
// própria linha: todo envio de modelo lançava `template_missing`.

const ORG = "org-1";
const OFICIAL = "sessao-oficial";
const PARCEIRO = "sessao-parceiro";

type Linha = { organization_id: string; name: string; language: string; channel_session_id: string | null; status: string };

/** Supabase mínimo que APLICA os filtros `eq`/`is` sobre as linhas. */
function banco(linhas: Linha[]) {
  return {
    from: () => {
      const filtros: Array<(l: Linha) => boolean> = [];
      const q = {
        select: () => q,
        eq: (col: keyof Linha, val: unknown) => (filtros.push((l) => l[col] === val), q),
        is: (col: keyof Linha, val: null) => (filtros.push((l) => l[col] === val), q),
        maybeSingle: async () => {
          const achadas = linhas.filter((l) => filtros.every((f) => f(l)));
          if (achadas.length > 1) return { data: null, error: { message: "multiple rows" } };
          return { data: achadas[0] ?? null, error: null };
        },
      };
      return q;
    },
  } as never;
}

const linha = (channel_session_id: string | null, status: string): Linha => ({
  organization_id: ORG,
  name: "retomada",
  language: "pt_BR",
  channel_session_id,
  status,
});

const buscar = (db: never, channelSessionId: string | null) =>
  linhaDoEspelho<Linha>(db, "*", { organizationId: ORG, name: "retomada", language: "pt_BR", channelSessionId });

describe("a definição do modelo para uma conexão", () => {
  it("canal oficial: acha a linha do sync, gravada sem conexão", async () => {
    const r = await buscar(banco([linha(null, "APPROVED")]), OFICIAL);
    expect(r.error).toBeNull();
    expect(r.data?.status).toBe("APPROVED");
  });

  it("oficial + parceiro com o mesmo nome: cada conexão acha a SUA linha, sem ambiguidade", async () => {
    const db = banco([linha(null, "APPROVED"), linha(PARCEIRO, "PENDING")]);
    expect((await buscar(db, OFICIAL)).data?.channel_session_id).toBeNull();
    expect((await buscar(db, PARCEIRO)).data?.status).toBe("PENDING");
  });

  it("a linha de OUTRA conexão nunca serve (o número A não é conferido com a definição do B)", async () => {
    const r = await buscar(banco([linha(PARCEIRO, "APPROVED")]), OFICIAL);
    expect(r.data).toBeNull();
  });

  it("sem conexão (base anterior à 0144): busca como sempre buscou", async () => {
    const r = await buscar(banco([linha(null, "APPROVED")]), null);
    expect(r.data?.status).toBe("APPROVED");
  });
});
