import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * O SELO DA ABA FILA MOSTRA A POSIÇÃO DE ESPERA — não o lugar na lista.
 *
 * ─── Por que este arquivo existe ────────────────────────────────────────────
 *
 * Enquanto a Fila tinha ordem própria (`last_inbound_at` ASC), o índice da lista
 * COINCIDIA com a posição de espera: o selo `{i + 1}º` dizia a verdade por
 * construção. Ao unificar a ordem da lista em atividade recente (#639), o índice
 * deixou de coincidir — e o selo continuou desenhando o índice, sob o
 * `aria-label="Posição N na fila"`. O mesmo produto passava a dizer números
 * DIFERENTES para a MESMA conversa: um na tela do atendente, outro pelo MCP e na
 * mensagem que o cliente recebe no WhatsApp (`getQueuePosition`).
 *
 * ─── A fixture, e por que ela discrimina ────────────────────────────────────
 *
 * As mesmas três conversas de `tests/invariants/gov-5d-queue-assign-unread.test.ts`:
 *
 *   | conversa | espera (last_inbound_at) | última msg (last_message_at) |
 *   | OLD      | 30 min                   | 10 min                       |
 *   | MID      | 10 min                   |  2 min                       |
 *   | NEW      |  2 min                   | 30 min                       |
 *
 * Ordem da LISTA (atividade recente): MID, OLD, NEW  → índices 1, 2, 3.
 * Ordem da FILA  (quem espera há mais): OLD, MID, NEW → posições 1, 2, 3.
 *
 * MID é a linha que separa as duas respostas: primeira na lista, SEGUNDA na
 * fila. Uma fixture em que as duas ordens coincidissem ficaria verde com o
 * defeito em pé.
 */
import { ConversationList } from "@/components/inbox/ConversationList";
import { comPosicaoNaFila, ehAVisaoDaFila } from "@/lib/inbox/posicao-na-fila";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

vi.mock("@/hooks/channels/useChannelSessions", () => ({
  useChannelSessions: () => ({ data: [{ id: "s1" }] }),
}));
vi.mock("@/hooks/ai/useAutomaticoAtivo", () => ({
  useAutomaticoAtivo: () => ({ data: false }),
}));

const AGORA = new Date("2026-09-15T12:00:00.000Z").getTime();
const haMin = (m: number) => new Date(AGORA - m * 60_000).toISOString();

const FILA = [
  { id: "OLD", last_inbound_at: haMin(30), last_message_at: haMin(10) },
  { id: "MID", last_inbound_at: haMin(10), last_message_at: haMin(2) },
  { id: "NEW", last_inbound_at: haMin(2), last_message_at: haMin(30) },
];

/** A página como o handler a devolve: ordenada por atividade recente. */
const ORDEM_DA_LISTA = ["MID", "OLD", "NEW"];

interface Linha {
  [coluna: string]: unknown;
}

/**
 * Dublê que ORDENA de verdade: `getQueuePositions` pede `last_inbound_at` ASC e
 * é dessa ordem que sai o número. Um dublê que ignorasse `order` devolveria o
 * mapa na ordem em que as linhas foram escritas — e aí o teste mediria a
 * fixture, não a consulta.
 */
function clienteFalso(linhasDaFila: Linha[]) {
  function daTabela(tabela: string) {
    const linhas = tabela === "conversations" ? [...linhasDaFila] : [];
    // ⚠️ Os `order` ACUMULAM, como no PostgREST: o segundo é DESEMPATE do
    // primeiro, não uma reordenação. Um dublê que reordenasse a cada chamada
    // devolveria a lista ordenada só pelo ÚLTIMO `order` — aqui, `id` ASC — e o
    // teste mediria o dublê. (Foi o que aconteceu na primeira escrita deste
    // arquivo: as posições saíram na ordem alfabética dos ids.)
    const ordens: Array<[string, boolean]> = [];
    const ordenadas = () =>
      [...linhas].sort((a, b) => {
        for (const [coluna, asc] of ordens) {
          const x = String(a[coluna]);
          const y = String(b[coluna]);
          if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
        }
        return 0;
      });
    const api = {
      select: () => api,
      eq: () => api,
      is: () => api,
      in: () => api,
      order: (coluna: string, spec?: { ascending?: boolean }) => {
        ordens.push([coluna, spec?.ascending !== false]);
        return api;
      },
      then: (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: ordenadas(), error: null }).then(ok),
    };
    return api;
  }
  return { from: (tabela: string) => daTabela(tabela) } as never;
}

const conversaDaTela = (id: string, posicao: number | null): ConversationWithContact =>
  ({
    id,
    organization_id: "org-1",
    contact_id: `ct-${id}`,
    channel_session_id: "s1",
    channel: "whatsapp",
    status: "open",
    last_inbound_at: FILA.find((f) => f.id === id)!.last_inbound_at,
    last_message_at: FILA.find((f) => f.id === id)!.last_message_at,
    last_message_preview: "olá",
    unread_count_for_assignee: 0,
    tags: [],
    created_at: haMin(60),
    queue_position: posicao,
    contacts: {
      id: `ct-${id}`,
      display_name: `Cliente ${id}`,
      name: null,
      phone_number: "+5511999999999",
      tags: [],
      is_blocked: false,
      is_anonymized: false,
    },
  }) as unknown as ConversationWithContact;

function pintarLista(items: ConversationWithContact[]) {
  const listQuery = {
    data: { pages: [{ data: items }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: () => {},
    refetch: () => {},
  } as never;
  return render(
    <ConversationList
      listQuery={listQuery}
      filters={{ comando: ["aguardando"] } as never}
      selectedId={null}
      onSelect={() => {}}
    />,
  );
}

describe("o número do selo vem da fila de espera, não do índice da lista", () => {
  it("a borda HTTP carimba cada conversa com a posição de getQueuePositions", async () => {
    const enriquecidas = await comPosicaoNaFila(
      clienteFalso(FILA),
      "org-1",
      ORDEM_DA_LISTA.map((id) => ({ id })),
      true,
    );

    // A lista chega em MID, OLD, NEW (atividade recente). As posições NÃO são
    // 1, 2, 3 — são as da espera. É esta diferença que o índice apagava.
    expect(enriquecidas).toEqual([
      { id: "MID", queue_position: 2 },
      { id: "OLD", queue_position: 1 },
      { id: "NEW", queue_position: 3 },
    ]);
  });

  it("fora da aba Fila o campo é null explícito — e nenhuma consulta é feita", async () => {
    const supabase = {
      from: () => {
        throw new Error("não devia consultar fora da fila");
      },
    } as never;
    const enriquecidas = await comPosicaoNaFila(supabase, "org-1", [{ id: "x" }], false);
    expect(enriquecidas).toEqual([{ id: "x", queue_position: null }]);
  });

  it("ehAVisaoDaFila reconhece o comando e o filtro antigo, e só eles", () => {
    expect(ehAVisaoDaFila({ comando: ["aguardando"] })).toBe(true);
    expect(ehAVisaoDaFila({ assigned_to: "unassigned" })).toBe(true);
    expect(ehAVisaoDaFila({ comando: ["humano"] })).toBe(false);
    expect(ehAVisaoDaFila({ assigned_to: "me" })).toBe(false);
    expect(ehAVisaoDaFila({})).toBe(false);
  });

  it("⭐ a lista DESENHA o queue_position, e não a posição da linha", () => {
    pintarLista([
      conversaDaTela("MID", 2),
      conversaDaTela("OLD", 1),
      conversaDaTela("NEW", 3),
    ]);

    // A primeira linha da lista é MID, e ela é a SEGUNDA da fila. Com `i + 1` o
    // selo diria "1º" — o número que o cliente ouviria pelo WhatsApp é "2º".
    const selos = screen.getAllByLabelText(/Posição \d+ na fila/);
    expect(selos.map((s) => s.textContent)).toEqual(["2º", "1º", "3º"]);
    expect(selos[0]!.getAttribute("aria-label")).toBe("Posição 2 na fila");
  });

  it("conversa sem posição conhecida não ganha selo com número inventado", () => {
    // `queue_position` nulo é o estado "é fila e esta conversa não está no mapa"
    // (saiu da fila entre a listagem e a leitura das posições). Desenhar um
    // número ali seria inventar a vez de alguém.
    pintarLista([conversaDaTela("MID", null), conversaDaTela("OLD", 1)]);
    const selos = screen.getAllByLabelText(/Posição \d+ na fila/);
    expect(selos.map((s) => s.textContent)).toEqual(["1º"]);
  });
});
