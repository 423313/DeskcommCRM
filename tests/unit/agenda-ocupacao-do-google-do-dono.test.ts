import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A OCUPAÇÃO DO GOOGLE NÃO DEPENDE DE QUEM PERGUNTA (#879).
 *
 * ─── O defeito, medido ──────────────────────────────────────────────────────
 *
 * A coleta chega ao Google Agenda por junção com `calendar_connections`
 * (`calendar_selected_external_events` → `calendar_connections!inner`), e a RLS
 * dessa tabela mostra a conexão **ao próprio dono e a `manager` para cima**.
 * Com o cliente de SESSÃO, a junção de um Atendente volta vazia: medido num
 * Postgres descartável com o `baseline.sql`, a MESMA agenda rende **1** evento
 * para o dono, **1** para o gerente e **0** para o atendente. Quem marca na
 * agenda de outra pessoa, então, confere ocupação contra uma lista sem o Google
 * dela — e aceita por cima de um compromisso pessoal que existe.
 *
 * ─── O que este arquivo prende ──────────────────────────────────────────────
 *
 * Que as duas leituras do Google saem pelo cliente ADMIN (`createAdminClient`),
 * com o filtro explícito de `organization_id` + dono, e que o resultado é o
 * MESMO para quem pergunta: um Atendente (que a RLS deixaria sem o evento) e um
 * dono (que o veria). A ocupação é uma propriedade da AGENDA, não da visibilidade
 * de quem consulta.
 *
 * ─── O que este arquivo NÃO mede (declarado, não estimado) ──────────────────
 *
 * 1. **A RLS de verdade.** Nenhum Postgres aqui: dois dublês simulam os dois
 *    olhares (um "vê", outro "não vê"), e a medição da RLS é a do issue
 *    (`pnpm test:db` é quem mede banco e isolamento).
 * 2. **Conteúdo de evento.** O que a coleta devolve é `Slot[]` — nenhum título,
 *    nenhuma descrição. O dublê carrega as colunas que a query PEDE
 *    (`starts_at, ends_at, transparency, status`), e nada além.
 * 3. **`fn_google_coverage`.** A RPC de cobertura continua saindo pelo cliente
 *    que veio de fora, de propósito: ela só decide o aviso de defasagem.
 */
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const { createAdminClient } = await import("@/lib/supabase/admin");
const { horariosLivresDaOrg } = await import("@/lib/agenda/consulta");

const TZ = "America/Sao_Paulo";
const ORG = "org-1";
const DONO = "dono-1";
const TIPO_ID = "11111111-1111-4111-8111-111111111111";

/** 21:00 do dia 16 em São Paulo (00:00Z do dia 17) — a janela pedida. */
const DE = new Date("2026-09-17T00:00:00.000Z");
const ATE = new Date("2026-09-17T00:30:00.000Z");
const AGORA = new Date("2026-09-16T12:00:00.000Z");

/** O compromisso pessoal do dono, no Google, encostando na janela pedida. */
const EVENTO = { de: "2026-09-16T23:30:00.000Z", ate: "2026-09-17T00:30:00.000Z" };

interface Linha {
  [coluna: string]: unknown;
}

/**
 * O valor da coluna, resolvendo CAMINHO COM PONTO — que é o que o PostgREST faz
 * na relação embutida (`calendar_connections.user_id` do `!inner`).
 *
 * ⚠️ Sem isto o dublê não acha a linha, a ocupação some e o teste "prova" que o
 * conserto não funciona — ou pior, passaria aprovando um filtro de dono que não
 * existe.
 */
const valorDaColuna = (linha: Linha, coluna: string): unknown =>
  coluna.split(".").reduce<unknown>((acc, parte) => (acc as Linha | undefined)?.[parte], linha);

type Filtro = (linha: Linha) => boolean;

/**
 * Um `SupabaseClient` de mentira que FILTRA de verdade (mesmo dublê do teste da
 * exceção de data): aplica `eq/gte/lte/lt/gt` sobre linhas em memória. Um dublê
 * que ignorasse o filtro deixaria o teste passar pelo motivo errado — e aqui o
 * `organization_id` explícito é justamente a única proteção que existe no
 * caminho do admin.
 */
function clienteFalso(tabelas: Record<string, Linha[]>): SupabaseClient {
  function daTabela(tabela: string) {
    const filtros: Filtro[] = [];
    const linhas = () => (tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
    const compara = (coluna: string, valor: unknown, ok: (a: string, b: string) => boolean) => {
      filtros.push((l) => ok(String(valorDaColuna(l, coluna)), String(valor)));
      return api;
    };
    const api = {
      select: () => api,
      eq: (coluna: string, valor: unknown) => {
        filtros.push((l) => valorDaColuna(l, coluna) === valor);
        return api;
      },
      gte: (coluna: string, valor: unknown) => compara(coluna, valor, (a, b) => a >= b),
      lte: (coluna: string, valor: unknown) => compara(coluna, valor, (a, b) => a <= b),
      lt: (coluna: string, valor: unknown) => compara(coluna, valor, (a, b) => a < b),
      gt: (coluna: string, valor: unknown) => compara(coluna, valor, (a, b) => a > b),
      maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: linhas(), error: null }).then(resolve),
    };
    return api;
  }

  return {
    from: (tabela: string) => daTabela(tabela),
    rpc: async () => ({ data: false, error: null }),
  } as unknown as SupabaseClient;
}

/** As tabelas que a coleta lê; `googleVisivel` é o olhar de quem consulta. */
function tabelas(googleVisivel: boolean): Record<string, Linha[]> {
  const conexao = {
    organization_id: ORG,
    user_id: DONO,
    status: "connected",
    last_sync_at: "2026-09-16T11:00:00.000Z",
  };
  const evento = {
    organization_id: ORG,
    starts_at: EVENTO.de,
    ends_at: EVENTO.ate,
    transparency: "opaque",
    status: "confirmed",
    // O embed `calendar_connections!inner(user_id, status)`, como o PostgREST
    // entrega. A RLS decide se esta linha existe; o dublê não faz junção.
    calendar_connections: { user_id: DONO, status: "connected" },
  };

  return {
    calendar_event_types: [
      {
        id: TIPO_ID,
        organization_id: ORG,
        name: "Consulta",
        is_active: true,
        duration_minutes: 30,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        minimum_notice_minutes: 0,
        slot_interval_minutes: 30,
        booking_window_days: 365,
        default_owner_user_id: DONO,
      },
    ],
    // Na AGENDA, `windows` vazio é "nada publicado" — jornada de verdade aqui.
    attendant_availability: [
      {
        organization_id: ORG,
        user_id: DONO,
        schedule: {
          timezone: TZ,
          windows: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, start: "09:00", end: "23:00" })),
        },
      },
    ],
    calendar_availability_exceptions: [],
    calendar_appointments: [],
    calendar_connections: googleVisivel ? [conexao] : [],
    calendar_selected_external_events: googleVisivel ? [evento] : [],
  };
}

beforeEach(() => {
  vi.mocked(createAdminClient).mockReset();
});

describe("a ocupação do Google do dono barra a marcação de quem não enxerga a conexão", () => {
  it("Atendente (RLS esconde a conexão): o compromisso do Google do dono recusa o horário", async () => {
    // O admin é o único que vê; o cliente de sessão do Atendente não veria nada.
    vi.mocked(createAdminClient).mockReturnValue(clienteFalso(tabelas(true)));

    const resultado = await horariosLivresDaOrg(clienteFalso(tabelas(false)), ORG, {
      eventTypeId: TIPO_ID,
      ownerUserId: DONO,
      de: DE,
      ate: ATE,
      agora: AGORA,
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    // A vaga das 21:00 locais está em cima do compromisso; a das 21:30 está
    // livre. É EXATAMENTE isso que a lista tem que dizer — nem a mais, nem a
    // menos: `toEqual([])` esconderia a vaga seguinte ter sumido junto.
    expect(resultado.slots.map((s) => s.inicio.toISOString())).toEqual([
      "2026-09-17T00:30:00.000Z",
    ]);
  });

  it("o dono consultando recebe a MESMA resposta — a ocupação não depende de quem pergunta", async () => {
    vi.mocked(createAdminClient).mockReturnValue(clienteFalso(tabelas(true)));

    const resultado = await horariosLivresDaOrg(clienteFalso(tabelas(true)), ORG, {
      eventTypeId: TIPO_ID,
      ownerUserId: DONO,
      de: DE,
      ate: ATE,
      agora: AGORA,
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    // Mesma lista do caso anterior, com o cliente de sessão enxergando o evento:
    // a resposta não muda com quem pergunta.
    expect(resultado.slots.map((s) => s.inicio.toISOString())).toEqual([
      "2026-09-17T00:30:00.000Z",
    ]);
  });

  it("controle: sem compromisso no Google o horário das 21:00 é oferecido", async () => {
    vi.mocked(createAdminClient).mockReturnValue(clienteFalso(tabelas(false)));

    const resultado = await horariosLivresDaOrg(clienteFalso(tabelas(false)), ORG, {
      eventTypeId: TIPO_ID,
      ownerUserId: DONO,
      de: DE,
      ate: ATE,
      agora: AGORA,
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    // Sem esta metade, o teste acima passaria por "a grade nunca oferece nada".
    expect(resultado.slots.map((s) => s.inicio.toISOString())).toContain(
      "2026-09-17T00:00:00.000Z",
    );
  });
});
