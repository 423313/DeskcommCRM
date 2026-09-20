/**
 * Produção: o follow-up mandou o menu, o lead respondeu "1", e a mensagem
 * seguinte ficou presa. O `wait_started` ocupou `${nó}:${passo}` e o update
 * que incrementa `steps_taken` não pegou; o tick da resposta tenta
 * `node_advanced` com a mesma chave e era descartado. O `inbound_woke` ainda
 * regrava `updated_at`, então o piso do inbound escondia o "1".
 */
import { describe, expect, it, vi } from "vitest";

import { avancarEnrollmentAtivo, type AdminClient, type TickDeps } from "./engine";
import type { EnrollmentEventRef, EnrollmentRow } from "./node-handlers";
import type { FlowGraph } from "./graph-schema";

const NOW = new Date("2026-09-20T17:03:00.000Z");
const PARK = "2026-09-20T17:02:31.053Z";
const WAKE_AT = "2026-09-20T17:02:48.380Z";
const REPLY_AT = "2026-09-20T17:02:45.000Z";

const GRAFO = {
  nodes: [
    {
      id: "match_reply-1",
      type: "match_reply",
      config: {
        branches: [
          { id: "br_sim", op: "eq", label: "1", pattern: "1" },
          { id: "br_1", op: "eq", label: "2", pattern: "2" },
        ],
        grace_timeout_ms: 7_200_000,
      },
    },
    { id: "action-6", type: "action", config: { mode: "text", body: "menu" } },
    { id: "action-7", type: "action", config: { mode: "text", body: "agendar" } },
  ],
  edges: [
    { id: "e-sim", source: "match_reply-1", target: "action-7", priority: 0, condition: { type: "branch", branch_id: "br_sim" } },
    { id: "e-always", source: "match_reply-1", target: "action-6", priority: 0, condition: { type: "always" } },
  ],
} as unknown as FlowGraph;

function enrollment(): EnrollmentRow {
  return {
    id: "enr-1",
    organization_id: "org-1",
    pointer_id: "ptr-1",
    version_id: "ver-1",
    contact_id: "contact-1",
    conversation_id: null,
    current_node_id: "match_reply-1",
    status: "active",
    next_eval_at: WAKE_AT,
    claimed_until: null,
    attempts: 0,
    max_attempts: 5,
    last_error: null,
    steps_taken: 3,
    outcome: null,
    cancel_reason: null,
    started_at: PARK,
    completed_at: null,
    updated_at: NOW.toISOString(),
  };
}

const EVENTOS: EnrollmentEventRef[] = [
  {
    node_id: "match_reply-1",
    idempotency_key: "match_reply-1:3",
    event_type: "wait_started",
    payload: { wake_status: "waiting_reply", next_eval_at: "2026-09-20T19:02:31.053Z" },
  },
  {
    node_id: "match_reply-1",
    idempotency_key: "match_reply-1:3:wake",
    event_type: "inbound_woke",
    payload: {},
  },
];

describe("match_reply — resposta do lead após wait_started na mesma chave", () => {
  it("avança para o ramo do '1' mesmo com steps_taken desalinhado e updated_at depois da mensagem", async () => {
    const passos: Array<Record<string, unknown>> = [];
    const chaves = new Set(EVENTOS.map((e) => e.idempotency_key).filter((k): k is string => !!k));
    const inboundPorPiso: string[] = [];

    const db = {
      loadFlowGraph: vi.fn(async () => GRAFO),
      loadLeadFacts: vi.fn(async () => ({ lead_stage: null, tags: [] })),
      loadEnrollmentEvents: vi.fn(async () => EVENTOS),
      loadLastInboundBody: vi.fn(async (_org: string, _c: string, _conv: string | null, naoAntesDe?: string | null) => {
        inboundPorPiso.push(naoAntesDe ?? "");
        if (!naoAntesDe || REPLY_AT >= naoAntesDe) return "1";
        return null;
      }),
      loadFlowPointerName: vi.fn(async () => null),
      insertEnrollmentEvent: vi.fn(async (event: { idempotency_key: string }) => {
        if (chaves.has(event.idempotency_key)) return { inserted: false };
        chaves.add(event.idempotency_key);
        return { inserted: true };
      }),
      updateEnrollment: vi.fn(async (_id: string, _org: string, patch: Record<string, unknown>) => {
        passos.push(patch);
      }),
    } as unknown as AdminClient;

    const deps: TickDeps = { db, clock: () => NOW, enqueueJob: async () => {} };
    await avancarEnrollmentAtivo(deps, enrollment());

    expect(inboundPorPiso[0]).toBe(PARK);
    expect(passos.some((p) => p.current_node_id === "action-7")).toBe(true);
    expect(passos.some((p) => p.current_node_id === "action-6")).toBe(false);
  });
});
