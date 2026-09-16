/**
 * O `queue_position` CHEGA À TELA PORQUE A ROTA O CARIMBA — o ponto de uso.
 *
 * ─── Por que este arquivo existe (medido, não suposto) ──────────────────────
 *
 * `tests/unit/fila-selo-mostra-a-posicao-de-espera.test.tsx` importa
 * `comPosicaoNaFila` direto e monta a `ConversationList` com o campo já na mão:
 * ele guarda a FUNÇÃO e o DESENHO. Medido na triagem, apagando a chamada de
 * `app/api/v1/conversations/route.ts` (`const comFila = conversations;`):
 * aquele arquivo ficou **5 passed, ZERO vermelhos** — a Fila inteira perderia o
 * selo em produção com a suíte verde. É o mesmo modo de falha que
 * `tests/unit/rota-le-todo-filtro-do-schema.test.ts` nomeia no cabeçalho: a
 * cadeia rompe NO MEIO, sem erro e sem log, e o sintoma parece funcionamento.
 *
 * Aqui a rota é EXECUTADA. Os vizinhos são dublês, mas o elo que este arquivo
 * mede — a rota pedir a posição e devolvê-la no corpo — é código de verdade.
 *
 * ─── A fixture, e por que ela discrimina ────────────────────────────────────
 *
 * As mesmas três conversas de `tests/invariants/gov-5d-queue-assign-unread.test.ts`.
 * A lista vem do handler em ordem de ATIVIDADE (MID, OLD, NEW); a espera é
 * OUTRA ordem (OLD=1º, MID=2º, NEW=3º). MID é a linha que separa as duas
 * respostas: primeira na lista, SEGUNDA na fila. Com uma fixture em que as duas
 * ordens coincidissem, carimbar o índice passaria por carimbar a posição.
 *
 *     npx vitest run tests/unit/fila-selo-vem-da-rota.test.ts
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "00000000-0000-4000-8000-0000000000aa";

/** A página como o handler a devolve: ordenada por atividade recente. */
const PAGINA = [
  { id: "MID", contact: null },
  { id: "OLD", contact: null },
  { id: "NEW", contact: null },
];

/** O mapa da fila de ESPERA — `last_inbound_at` ASC, que é outra ordem. */
const ESPERA = new Map([
  ["OLD", 1],
  ["MID", 2],
  ["NEW", 3],
]);

const handler = vi.hoisted(() => vi.fn());
const posicoes = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1" } }, error: null }) },
  }),
}));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => ({ id: "u-1", idioma: "pt-BR" }),
  resolveActiveOrg: async () => ({ orgId: ORG, name: "Org", role: "manager" }),
}));
vi.mock("@/app/api/v1/conversations/_handler", () => ({
  listConversationsHandler: handler,
}));
// O enriquecimento VIZINHO é dublê de passagem: sem isto o teste mediria também
// a resolução de nome, que tem guarda própria — e um vermelho de lá leria como
// defeito daqui.
vi.mock("@/lib/users/com-nome-do-atendente", () => ({
  comNomeDoAtendente: async <T,>(linhas: T[]) => linhas,
}));
vi.mock("@/lib/routing/queue", () => ({ getQueuePositions: posicoes }));

import { GET } from "@/app/api/v1/conversations/route";

interface Corpo {
  data: Array<{ id: string; queue_position: number | null }>;
}

async function pedir(qs: string): Promise<Corpo> {
  const resposta = await GET(new NextRequest(`http://localhost/api/v1/conversations?${qs}`));
  expect(resposta.status, await resposta.clone().text()).toBe(200);
  return (await resposta.json()) as Corpo;
}

beforeEach(() => {
  handler.mockReset();
  handler.mockResolvedValue({ conversations: PAGINA, cursor: null, has_more: false });
  posicoes.mockReset();
  posicoes.mockResolvedValue(ESPERA);
});

describe("GET /api/v1/conversations — a posição de espera sai DAQUI", () => {
  it("⭐ na aba Fila, cada linha volta com a posição de ESPERA, não com o índice da lista", async () => {
    const corpo = await pedir("comando=aguardando");

    // A ORDEM continua a da lista — o conserto não reordena nada.
    expect(corpo.data.map((c) => c.id)).toEqual(["MID", "OLD", "NEW"]);
    // E o NÚMERO é o da espera. Se a rota carimbasse o índice, MID viria 1.
    expect(corpo.data.map((c) => c.queue_position)).toEqual([2, 1, 3]);
    expect(posicoes).toHaveBeenCalledTimes(1);
  });

  it("a forma antiga da aba (assigned_to=unassigned) também carimba", async () => {
    // A tela ainda aceita o filtro anterior à migration 0203 como fallback; as
    // duas leituras têm de concordar, senão o selo some para quem cair nele.
    const corpo = await pedir("assigned_to=unassigned");
    expect(corpo.data.map((c) => c.queue_position)).toEqual([2, 1, 3]);
  });

  it("CONTROLE: fora da Fila o campo é null explícito e a fila NÃO é consultada", async () => {
    // Sem este controle, carimbar TODA aba com a posição passaria pelos casos
    // acima — e custaria uma consulta por página em toda listagem do Inbox.
    const corpo = await pedir("status=open");
    expect(corpo.data.map((c) => c.queue_position)).toEqual([null, null, null]);
    expect(posicoes).not.toHaveBeenCalled();
  });

  it("CONTROLE: o dublê do handler foi mesmo exercitado", async () => {
    // Uma rota que devolvesse 500 antes de chamar o handler faria os casos de
    // `null` acima passarem por vacuidade.
    await pedir("status=open");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
