import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { SITUACOES_QUE_OCUPAM } from "@/lib/agenda/ocupados";
import { SITUACOES_DO_AGENDAMENTO } from "@/lib/agenda/tipos";
import { evaluateConditions } from "@/lib/automation/conditions";
import { TAG_DE_CLIENTE } from "@/lib/contacts/cliente";
import { funilDeEntrada, garantirLeadDaConversa } from "@/lib/leads/nascimento-do-lead";
import { ENTIDADE_ESPERADA_POR_GATILHO } from "@/lib/schemas/webhooks";

import { pgComoSupabase } from "../pg-como-supabase";

/**
 * CLIENTE PELA AGENDA (migration 0262) — contribuição de @423313 (PR #867), com a
 * decisão do dono: a regra nasce DESLIGADA e cada organização a liga.
 *
 * Invariante de banco, e não teste de unidade, porque o que se mede aqui É o
 * banco: dois triggers, a régua de situação, o recálculo que trava o contato, a
 * RPC que confere papel/suporte/MFA pelo `auth.uid()` e classifica o histórico.
 * Um dublê de `supabase` provaria só que o dublê concorda comigo.
 *
 * Cada decisão do dono tem caso próprio, e os de permissão vêm EM PAR (o papel
 * de baixo barrado, o de cima passando):
 *
 *   I1, I13        desligada (o padrão) não toca contato
 *   I2             ligada: data + etiqueta + contact.tag_added no formato do app,
 *                  que uma condição de automação reconhece
 *   I3, I4         data só se move quando o mínimo muda; sem contato, nada
 *   I5–I9          cancelado e falta não contam — nem na inserção, nem depois
 *   I10            a etiqueta tirada à mão não volta (marcando ou religando)
 *   I11, I12       LGPD e tenancy
 *   I14–I16        ligar classifica SÓ a organização que liga, sem evento;
 *                  religar recalcula; desligar não mexe em ninguém
 *   I17–I21        quem pode ligar: admin da própria organização, com MFA
 *                  comprovado e fora de suporte somente leitura
 *   I22–I26        o funil de clientes (do PR) só vale com a regra ligada
 *   I27, I28       as duas corridas que as travas existem para impedir
 *
 * ORGANIZAÇÕES SEPARADAS POR PAPEL NO TESTE, para que um caso não verdeie outro
 * por estado compartilhado: A ligada no beforeAll, B sempre desligada, C é o
 * ciclo liga/desliga/religa, D é o alvo das negações, E é a de MFA.
 */
const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 5,
});
const db = pgComoSupabase(pool);

const ORG_A = "c11e0000-0000-4000-8000-000000000001";
const ORG_B = "c11e0000-0000-4000-8000-000000000002";
const ORG_C = "c11e0000-0000-4000-8000-000000000003";
const ORG_D = "c11e0000-0000-4000-8000-000000000004";
const ORG_E = "c11e0000-0000-4000-8000-000000000005";
/** Só para a corrida entre ligar a regra e marcar um horário (I28). */
const ORG_F = "c11e0000-0000-4000-8000-000000000006";

const ADMIN_A = "c11e1111-0000-4000-8000-000000000001";
const AGENT_A = "c11e1111-0000-4000-8000-000000000002";
const ADMIN_B = "c11e1111-0000-4000-8000-000000000003";
const ADMIN_C = "c11e1111-0000-4000-8000-000000000004";
const ADMIN_D = "c11e1111-0000-4000-8000-000000000005";
const MANAGER_D = "c11e1111-0000-4000-8000-000000000006";
const AGENT_D = "c11e1111-0000-4000-8000-000000000007";
const VIEWER_D = "c11e1111-0000-4000-8000-000000000008";
const ADMIN_E = "c11e1111-0000-4000-8000-000000000009";
/** Operador de plataforma que é TAMBÉM admin da D: isola a guarda de suporte da de papel. */
const SUPORTE_D = "c11e1111-0000-4000-8000-00000000000a";
const ADMIN_F = "c11e1111-0000-4000-8000-00000000000b";

const CONVERSA = "c11e0000-0000-4000-8000-00000000c001";

const RPC = "select fn_definir_cliente_pela_agenda($1, $2) as r";

interface Resultado {
  ligado: boolean;
  mudou: boolean;
  ganharam_etiqueta: number;
  perderam_etiqueta: number;
  clientes: number;
}

interface Opcoes {
  aal?: "aal1" | "aal2";
  sessao?: string;
  /** Sem `sub` no JWT (authenticated anônimo) ou como service_role. */
  papel?: "authenticated" | "service_role";
  semClaims?: boolean;
}

/**
 * Roda SQL COMO o usuário: `set local role` + o JWT em `request.jwt.claims`, que
 * é como o PostgREST fala com o banco. Transação própria, desfeita no erro.
 */
async function comoUsuario<T extends pg.QueryResultRow>(
  uid: string | null,
  sql: string,
  params: unknown[],
  opcoes: Opcoes = {},
): Promise<pg.QueryResult<T>> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${opcoes.papel ?? "authenticated"}`);
    if (!opcoes.semClaims) {
      const claims =
        opcoes.papel === "service_role"
          ? { role: "service_role" }
          : {
              ...(uid ? { sub: uid } : {}),
              role: "authenticated",
              aal: opcoes.aal ?? "aal1",
              ...(opcoes.sessao ? { session_id: opcoes.sessao } : {}),
            };
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    }
    const r = await c.query<T>(sql, params);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

async function ligar(uid: string, org: string, ligado: boolean, opcoes?: Opcoes): Promise<Resultado> {
  const r = await comoUsuario<{ r: Resultado }>(uid, RPC, [org, ligado], opcoes);
  return r.rows[0]!.r;
}

async function criarContato(org: string, nome: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into contacts (organization_id, display_name, source) values ($1, $2, 'whatsapp') returning id`,
    [org, nome],
  );
  return rows[0]!.id;
}

/**
 * INSERT direto, como postgres: o que está sob teste é o TRIGGER. Passar pela
 * rota traria disponibilidade, jornada e dono do tipo — e um vermelho ali não
 * falaria desta feature.
 */
async function marcar(
  org: string,
  contato: string | null,
  inicio: string,
  status: "pending" | "confirmed" | "cancelled" = "confirmed",
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into calendar_appointments
       (organization_id, title, starts_at, ends_at, contact_id, status, cancelled_at)
     values ($1, 'Atendimento', $2::timestamptz, $2::timestamptz + interval '1 hour', $3, $4,
             case when $4 = 'cancelled' then now() end)
     returning id`,
    [org, inicio, contato, status],
  );
  return rows[0]!.id;
}

async function cancelar(agendamento: string): Promise<void> {
  await pool.query(
    "update calendar_appointments set status = 'cancelled', cancelled_at = now() where id = $1",
    [agendamento],
  );
}

interface Linha {
  first_service_at: Date | null;
  tags: string[];
  updated_at: Date;
}

async function lerContato(id: string): Promise<Linha> {
  const { rows } = await pool.query<Linha>(
    "select first_service_at, tags, updated_at from contacts where id = $1",
    [id],
  );
  return rows[0]!;
}

/** O retrato comparável de todos os contatos de uma organização. */
async function retrato(org: string): Promise<unknown[]> {
  const { rows } = await pool.query(
    `select id, first_service_at, tags, updated_at from contacts
      where organization_id = $1 order by id`,
    [org],
  );
  return rows;
}

async function eventosDeEtiqueta(filtro: { contato?: string; org?: string }): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `select count(*)::int as n from event_log
      where event_type = 'contact.tag_added'
        and ($1::uuid is null or entity_id = $1::uuid)
        and ($2::uuid is null or organization_id = $2::uuid)`,
    [filtro.contato ?? null, filtro.org ?? null],
  );
  return rows[0]!.n;
}

async function crmDe(org: string): Promise<unknown> {
  const { rows } = await pool.query<{ crm: unknown }>(
    "select settings -> 'crm' as crm from organizations where id = $1",
    [org],
  );
  return rows[0]!.crm;
}

beforeAll(async () => {
  const usuarios = [
    ADMIN_A, AGENT_A, ADMIN_B, ADMIN_C, ADMIN_D, MANAGER_D, AGENT_D, VIEWER_D, ADMIN_E, SUPORTE_D, ADMIN_F,
  ];
  for (const u of usuarios) {
    await pool.query("insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing", [
      u,
      `${u}@cliente-pela-agenda.test`,
    ]);
  }
  for (const [org, slug] of [
    [ORG_A, "cliente-agenda-a"],
    [ORG_B, "cliente-agenda-b"],
    [ORG_C, "cliente-agenda-c"],
    [ORG_D, "cliente-agenda-d"],
    [ORG_E, "cliente-agenda-e"],
    [ORG_F, "cliente-agenda-f"],
  ] as const) {
    await pool.query(
      `insert into organizations (id, slug, legal_name, display_name)
       values ($1, $2, 'Cliente LTDA', 'Cliente') on conflict (id) do nothing`,
      [org, slug],
    );
  }
  for (const [u, org, papel] of [
    [ADMIN_A, ORG_A, "admin"],
    [AGENT_A, ORG_A, "agent"],
    [ADMIN_B, ORG_B, "admin"],
    [ADMIN_C, ORG_C, "admin"],
    [ADMIN_D, ORG_D, "admin"],
    [MANAGER_D, ORG_D, "manager"],
    [AGENT_D, ORG_D, "agent"],
    [VIEWER_D, ORG_D, "viewer"],
    [ADMIN_E, ORG_E, "admin"],
    [SUPORTE_D, ORG_D, "admin"],
    [ADMIN_F, ORG_F, "admin"],
  ] as const) {
    await pool.query(
      `insert into user_organizations (user_id, organization_id, role, accepted_at)
       values ($1, $2, $3, now()) on conflict do nothing`,
      [u, org, papel],
    );
  }

  // Histórico da B e da D, gravado com as duas DESLIGADAS: é o que I14 confere
  // que ninguém tocou quando a C liga.
  await marcar(ORG_B, await criarContato(ORG_B, "Histórico da B"), "2024-01-10T10:00:00Z");
  await marcar(ORG_D, await criarContato(ORG_D, "Histórico da D 1"), "2024-02-10T10:00:00Z");
  await marcar(ORG_D, await criarContato(ORG_D, "Histórico da D 2"), "2024-03-10T10:00:00Z", "pending");

  const a = await ligar(ADMIN_A, ORG_A, true);
  expect(a.ligado, "a fixture da A precisa estar ligada").toBe(true);
});

afterAll(async () => {
  await pool.end();
});

describe("desligada — o padrão de toda organização", () => {
  it("I1 · organização sem a chave: a marcação não muda data, etiqueta nem emite", async () => {
    expect(await crmDe(ORG_B), "a B nasce sem settings.crm").toBeNull();
    const contato = await criarContato(ORG_B, "Sem regra");
    const antes = await lerContato(contato);

    await marcar(ORG_B, contato, "2026-03-12T14:00:00Z");

    const depois = await lerContato(contato);
    expect(depois.first_service_at).toBeNull();
    expect(depois.tags).not.toContain(TAG_DE_CLIENTE);
    expect(depois.updated_at.toISOString()).toBe(antes.updated_at.toISOString());
    expect(await eventosDeEtiqueta({ contato })).toBe(0);
  });

  it("I13 · marcação na B desligada enquanto a A está ligada: a B fica intocada", async () => {
    // A regra é por ORGANIZAÇÃO. Uma leitura da chave que olhasse "alguma
    // organização ligada" passaria no I1 (quando nenhuma estivesse) e cairia aqui.
    expect(await crmDe(ORG_A)).toEqual({ cliente_pela_agenda: true });
    const contato = await criarContato(ORG_B, "Vizinha da A");
    await marcar(ORG_B, contato, "2026-04-01T10:00:00Z");
    const depois = await lerContato(contato);
    expect(depois.first_service_at).toBeNull();
    expect(depois.tags).not.toContain(TAG_DE_CLIENTE);
  });
});

describe("ligada — a transição", () => {
  it("I2 · marcação pela sessão de um agent: data, etiqueta e UM contact.tag_added que a automação vê", async () => {
    const contato = await criarContato(ORG_A, "Joana");

    await comoUsuario(
      AGENT_A,
      `insert into calendar_appointments (organization_id, title, starts_at, ends_at, contact_id)
       values ($1, 'Pela sessão', '2026-03-12T14:00:00Z', '2026-03-12T15:00:00Z', $2)`,
      [ORG_A, contato],
    );

    const depois = await lerContato(contato);
    expect(depois.first_service_at?.toISOString()).toBe("2026-03-12T14:00:00.000Z");
    expect(depois.tags.filter((t) => t === TAG_DE_CLIENTE)).toHaveLength(1);

    const { rows } = await pool.query<{
      entity_kind: string;
      payload: { added_tags: string[]; tags: string[]; service_origin?: { kind?: string } };
      metadata: Record<string, unknown>;
    }>(
      `select entity_kind, payload, metadata from event_log
        where event_type = 'contact.tag_added' and entity_id = $1`,
      [contato],
    );
    expect(rows, "exatamente um evento por virada").toHaveLength(1);
    const evento = rows[0]!;
    expect(evento.entity_kind).toBe(ENTIDADE_ESPERADA_POR_GATILHO["contact.tag_added"]);
    expect(evento.payload.added_tags).toEqual([TAG_DE_CLIENTE]);
    expect(evento.payload.tags).toContain(TAG_DE_CLIENTE);
    // Carimbada por emit_event — sem ela, a ação de enviar mensagem da regra
    // cai em `stale_origin` e nunca sai.
    expect(evento.payload.service_origin?.kind).toBe("command");
    expect(evento.metadata.caused_by_rule, "o motor pula evento causado por regra").toBeUndefined();
    expect(
      evaluateConditions([{ field: "event.added_tags", op: "contains", value: TAG_DE_CLIENTE }], {
        event: evento.payload,
      }),
      "a condição que o editor de regras monta para 'ganhou a tag cliente'",
    ).toBe(true);
  });

  it("I3 · marcação posterior não move nada nem emite; anterior move a data para trás sem emitir", async () => {
    const contato = await criarContato(ORG_A, "Marta");
    await marcar(ORG_A, contato, "2026-03-12T14:00:00Z");
    const primeiro = await lerContato(contato);
    const eventos = await eventosDeEtiqueta({ contato });

    await marcar(ORG_A, contato, "2026-09-01T10:00:00Z");
    const segundo = await lerContato(contato);
    expect(segundo.first_service_at?.toISOString()).toBe("2026-03-12T14:00:00.000Z");
    expect(segundo.updated_at.toISOString()).toBe(primeiro.updated_at.toISOString());
    expect(segundo.tags.filter((t) => t === TAG_DE_CLIENTE)).toHaveLength(1);

    await marcar(ORG_A, contato, "2021-01-05T09:00:00Z");
    const terceiro = await lerContato(contato);
    expect(terceiro.first_service_at?.toISOString()).toBe("2021-01-05T09:00:00.000Z");
    expect(terceiro.tags.filter((t) => t === TAG_DE_CLIENTE)).toHaveLength(1);
    expect(await eventosDeEtiqueta({ contato })).toBe(eventos);
  });

  it("I4 · agendamento sem contato não toca contato nenhum", async () => {
    const contato = await criarContato(ORG_A, "Ninguém");
    await marcar(ORG_A, null, "2026-05-01T12:00:00Z");
    expect((await lerContato(contato)).first_service_at).toBeNull();
  });
});

describe("cancelado e falta não contam", () => {
  it("I5 · a régua SQL é o espelho de LIBERAM_O_HORARIO para todo status do vocabulário", async () => {
    for (const s of SITUACOES_DO_AGENDAMENTO) {
      const { rows } = await pool.query<{ conta: boolean }>(
        "select fn_situacao_conta_como_atendimento($1) as conta",
        [s],
      );
      expect(rows[0]!.conta, `status ${s}`).toBe(SITUACOES_QUE_OCUPAM.includes(s));
    }
  });

  it("I6 · agendamento que já nasce cancelado não faz cliente", async () => {
    const contato = await criarContato(ORG_A, "Desistiu antes");
    await marcar(ORG_A, contato, "2026-06-01T10:00:00Z", "cancelled");
    const depois = await lerContato(contato);
    expect(depois.first_service_at).toBeNull();
    expect(depois.tags).not.toContain(TAG_DE_CLIENTE);
  });

  it("I7 · cancelar o único horário devolve a data a null e tira a etiqueta, sem evento novo", async () => {
    const contato = await criarContato(ORG_A, "Cancelou");
    const ag = await marcar(ORG_A, contato, "2026-06-02T10:00:00Z");
    expect((await lerContato(contato)).tags).toContain(TAG_DE_CLIENTE);
    const eventos = await eventosDeEtiqueta({ contato });

    await cancelar(ag);

    const depois = await lerContato(contato);
    expect(depois.first_service_at).toBeNull();
    expect(depois.tags).not.toContain(TAG_DE_CLIENTE);
    expect(await eventosDeEtiqueta({ contato })).toBe(eventos);
  });

  it("I8 · marcar FALTA no único horário (passado, por quem atende) tem o mesmo efeito", async () => {
    const contato = await criarContato(ORG_A, "Faltou");
    const ag = await marcar(ORG_A, contato, "2025-01-10T10:00:00Z");
    expect((await lerContato(contato)).first_service_at).not.toBeNull();

    // `no_show` só se registra por um humano com papel (fn_appointment_stamp).
    await comoUsuario(AGENT_A, "update calendar_appointments set status = 'no_show' where id = $1", [ag]);

    const depois = await lerContato(contato);
    expect(depois.first_service_at).toBeNull();
    expect(depois.tags).not.toContain(TAG_DE_CLIENTE);
  });

  it("I9 · dois horários: cancelar o primeiro move a data para o segundo e mantém a etiqueta", async () => {
    const contato = await criarContato(ORG_A, "Remarcou");
    const primeiro = await marcar(ORG_A, contato, "2026-07-01T10:00:00Z");
    await marcar(ORG_A, contato, "2026-08-01T10:00:00Z");

    await cancelar(primeiro);

    const depois = await lerContato(contato);
    expect(depois.first_service_at?.toISOString()).toBe("2026-08-01T10:00:00.000Z");
    expect(depois.tags.filter((t) => t === TAG_DE_CLIENTE)).toHaveLength(1);
  });
});

describe("a etiqueta tirada à mão é respeitada", () => {
  it("I10 · marcação nova (inclusive ANTERIOR, que muda a data) não devolve a etiqueta nem emite", async () => {
    const contato = await criarContato(ORG_A, "Não quer etiqueta");
    await marcar(ORG_A, contato, "2026-03-12T14:00:00Z");
    await pool.query("update contacts set tags = array_remove(tags, $2) where id = $1", [
      contato,
      TAG_DE_CLIENTE,
    ]);
    const eventos = await eventosDeEtiqueta({ contato });

    await marcar(ORG_A, contato, "2026-05-12T14:00:00Z"); // posterior: nada muda
    // Anterior: a data MUDA — é o caso que passa pela escrita, e o que uma
    // régua de "repor se faltar" pegaria.
    await marcar(ORG_A, contato, "2025-12-01T14:00:00Z");

    const depois = await lerContato(contato);
    expect(depois.first_service_at?.toISOString()).toBe("2025-12-01T14:00:00.000Z");
    expect(depois.tags).not.toContain(TAG_DE_CLIENTE);
    expect(await eventosDeEtiqueta({ contato })).toBe(eventos);
  });
});

describe("LGPD e tenancy", () => {
  it("I11 · contato anonimizado não é re-etiquetado nem emite, e a data sobrevive", async () => {
    const contato = await criarContato(ORG_A, "Apagada");
    await marcar(ORG_A, contato, "2026-03-12T14:00:00Z");
    await pool.query(
      "update contacts set is_anonymized = true, anonymized_at = now(), tags = '{}'::text[] where id = $1",
      [contato],
    );
    const eventos = await eventosDeEtiqueta({ contato });

    await marcar(ORG_A, contato, "2020-07-01T09:00:00Z");

    const depois = await lerContato(contato);
    expect(depois.tags).not.toContain(TAG_DE_CLIENTE);
    expect(depois.first_service_at?.toISOString()).toBe("2026-03-12T14:00:00.000Z");
    expect(await eventosDeEtiqueta({ contato })).toBe(eventos);
  });

  it("I12 · agendamento da A com contato da B não toca o contato da B", async () => {
    const naOutra = await criarContato(ORG_B, "Alheia");
    // O banco já recusa (`appointment_contact_scope`); o teste aceita as duas
    // formas de estar protegido e reprova só se o contato for marcado.
    await marcar(ORG_A, naOutra, "2026-06-01T12:00:00Z").catch(() => undefined);
    const depois = await lerContato(naOutra);
    expect(depois.first_service_at).toBeNull();
    expect(depois.tags).not.toContain(TAG_DE_CLIENTE);
  });
});

describe("ligar classifica o histórico SÓ da organização que liga", () => {
  /** Os contatos da C, criados no I14 e reusados no I15/I16. */
  const c: Record<string, string> = {};

  it("I14 · a C liga: 3 com horário que conta ganham; cancelado e sem horário ficam; B e D intocadas; zero evento", async () => {
    c.confirmado = await criarContato(ORG_C, "C confirmado");
    c.pendente = await criarContato(ORG_C, "C pendente");
    c.dois = await criarContato(ORG_C, "C dois horários");
    c.soCancelado = await criarContato(ORG_C, "C só cancelado");
    c.semHorario = await criarContato(ORG_C, "C sem horário");
    await marcar(ORG_C, c.confirmado, "2023-05-01T10:00:00Z");
    await marcar(ORG_C, c.pendente, "2023-06-01T10:00:00Z", "pending");
    await marcar(ORG_C, c.dois, "2023-07-01T10:00:00Z", "cancelled");
    await marcar(ORG_C, c.dois, "2023-08-01T10:00:00Z");
    await marcar(ORG_C, c.soCancelado, "2023-09-01T10:00:00Z", "cancelled");

    const bAntes = await retrato(ORG_B);
    const dAntes = await retrato(ORG_D);
    const eventosC = await eventosDeEtiqueta({ org: ORG_C });

    const r = await ligar(ADMIN_C, ORG_C, true);

    expect(r).toEqual({
      ligado: true,
      mudou: true,
      ganharam_etiqueta: 3,
      perderam_etiqueta: 0,
      clientes: 3,
    });
    expect(await crmDe(ORG_C)).toEqual({ cliente_pela_agenda: true });
    for (const [id, data] of [
      [c.confirmado, "2023-05-01T10:00:00.000Z"],
      [c.pendente, "2023-06-01T10:00:00.000Z"],
      [c.dois, "2023-08-01T10:00:00.000Z"],
    ] as const) {
      const linha = await lerContato(id);
      expect(linha.first_service_at?.toISOString()).toBe(data);
      expect(linha.tags.filter((t) => t === TAG_DE_CLIENTE)).toHaveLength(1);
    }
    for (const id of [c.soCancelado, c.semHorario]) {
      const linha = await lerContato(id);
      expect(linha.first_service_at).toBeNull();
      expect(linha.tags).not.toContain(TAG_DE_CLIENTE);
    }
    expect(await retrato(ORG_B), "a B não liga nada").toEqual(bAntes);
    expect(await retrato(ORG_D), "a D não liga nada").toEqual(dAntes);
    // ZERO evento do histórico: 3 aqui seriam 630 no estúdio do autor, e uma
    // regra "ganhou tag → enviar WhatsApp" dispararia para todos.
    expect(await eventosDeEtiqueta({ org: ORG_C })).toBe(eventosC);
  });

  it("I15 · ligar de novo: mudou=false, ninguém ganha, nenhum updated_at se move", async () => {
    const antes = await retrato(ORG_C);
    const r = await ligar(ADMIN_C, ORG_C, true);
    expect(r).toMatchObject({ ligado: true, mudou: false, ganharam_etiqueta: 0, perderam_etiqueta: 0 });
    expect(await retrato(ORG_C)).toEqual(antes);
  });

  it("I16 · desligar não muda contato; o que acontece desligada não aplica; religar recalcula", async () => {
    const antes = await retrato(ORG_C);
    const desligou = await ligar(ADMIN_C, ORG_C, false);
    expect(desligou).toMatchObject({ ligado: false, mudou: true, ganharam_etiqueta: 0, perderam_etiqueta: 0 });
    expect(await crmDe(ORG_C)).toEqual({ cliente_pela_agenda: false });
    expect(await retrato(ORG_C), "desligar não toca contato").toEqual(antes);

    // Desligada: o único horário do c.confirmado é cancelado, e alguém novo marca.
    const { rows } = await pool.query<{ id: string }>(
      "select id from calendar_appointments where contact_id = $1",
      [c.confirmado],
    );
    for (const { id } of rows) await cancelar(id);
    const novo = await criarContato(ORG_C, "C marcou desligada");
    await marcar(ORG_C, novo, "2026-01-15T10:00:00Z");

    const confirmadoDesligada = await lerContato(c.confirmado!);
    expect(confirmadoDesligada.first_service_at?.toISOString(), "desligada, a data fica congelada").toBe(
      "2023-05-01T10:00:00.000Z",
    );
    expect(confirmadoDesligada.tags).toContain(TAG_DE_CLIENTE);
    expect((await lerContato(novo)).first_service_at).toBeNull();

    const religou = await ligar(ADMIN_C, ORG_C, true);
    expect(religou).toMatchObject({ ligado: true, mudou: true, ganharam_etiqueta: 1, perderam_etiqueta: 1 });

    const perdeu = await lerContato(c.confirmado!);
    expect(perdeu.first_service_at).toBeNull();
    expect(perdeu.tags).not.toContain(TAG_DE_CLIENTE);
    const ganhou = await lerContato(novo);
    expect(ganhou.first_service_at?.toISOString()).toBe("2026-01-15T10:00:00.000Z");
    expect(ganhou.tags).toContain(TAG_DE_CLIENTE);
  });

  it("I10b · na C: etiquetada, tirada à mão, desligada e religada — a etiqueta não volta", async () => {
    const contato = await criarContato(ORG_C, "C tirou a etiqueta");
    await marcar(ORG_C, contato, "2026-02-01T10:00:00Z");
    expect((await lerContato(contato)).tags).toContain(TAG_DE_CLIENTE);
    await pool.query("update contacts set tags = array_remove(tags, $2) where id = $1", [
      contato,
      TAG_DE_CLIENTE,
    ]);

    await ligar(ADMIN_C, ORG_C, false);
    await ligar(ADMIN_C, ORG_C, true);

    const depois = await lerContato(contato);
    expect(depois.first_service_at?.toISOString()).toBe("2026-02-01T10:00:00.000Z");
    expect(depois.tags).not.toContain(TAG_DE_CLIENTE);
  });
});

describe("quem pode ligar", () => {
  it("I17 · manager, agent e viewer da D: 42501, settings.crm ausente e contatos iguais", async () => {
    const antes = await retrato(ORG_D);
    for (const quem of [MANAGER_D, AGENT_D, VIEWER_D]) {
      await expect(ligar(quem, ORG_D, true), `papel ${quem}`).rejects.toMatchObject({ code: "42501" });
    }
    expect(await crmDe(ORG_D)).toBeNull();
    expect(await retrato(ORG_D)).toEqual(antes);
  });

  // Do I18 ao I21 a régua é ANTES × DEPOIS, e não "a chave está ausente": se
  // uma guarda falhar, o vermelho fica no caso que a derrubou, em vez de se
  // espalhar pelos seguintes como "a D já estava ligada".
  it("I18 · admin de OUTRA organização (B) chamando para a D: 42501 e nada muda", async () => {
    const antes = { crm: await crmDe(ORG_D), contatos: await retrato(ORG_D) };
    await expect(ligar(ADMIN_B, ORG_D, true)).rejects.toMatchObject({ code: "42501" });
    expect({ crm: await crmDe(ORG_D), contatos: await retrato(ORG_D) }).toEqual(antes);
  });

  it("I19 · sem sessão: authenticated sem sub e service_role — 42501", async () => {
    const antes = await crmDe(ORG_D);
    await expect(
      comoUsuario(null, RPC, [ORG_D, true], { semClaims: true }),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(comoUsuario(null, RPC, [ORG_D, true])).rejects.toMatchObject({ code: "42501" });
    await expect(
      comoUsuario(null, RPC, [ORG_D, true], { papel: "service_role" }),
    ).rejects.toMatchObject({ code: "42501" });
    expect(await crmDe(ORG_D)).toEqual(antes);
  });

  it("I20 · admin com fator TOTP verificado: aal1 recusa pela MFA, aal2 liga", async () => {
    const fator = randomUUID();
    await pool.query(
      "insert into auth.mfa_factors (id, user_id, status, factor_type) values ($1, $2, 'verified', 'totp')",
      [fator, ADMIN_E],
    );
    try {
      await expect(ligar(ADMIN_E, ORG_E, true, { aal: "aal1" })).rejects.toMatchObject({
        code: "42501",
        message: "cliente_pela_agenda_mfa_required",
      });
      expect(await crmDe(ORG_E)).toBeNull();
      const r = await ligar(ADMIN_E, ORG_E, true, { aal: "aal2" });
      expect(r).toMatchObject({ ligado: true, mudou: true });
    } finally {
      await pool.query("delete from auth.mfa_factors where id = $1", [fator]);
    }
  });

  it("I21 · suporte na D: somente leitura recusa, e sessão vencida recusa mesmo sendo admin da D", async () => {
    const sessao = randomUUID();
    const suporte = randomUUID();
    await pool.query("insert into auth.sessions (id, user_id, aal) values ($1, $2, 'aal1')", [
      sessao,
      SUPORTE_D,
    ]);
    await pool.query(
      `insert into platform_admins (user_id, granted_by, scope, mfa_required, reason)
       values ($1, $1, 'full', false, 'Invariante cliente pela agenda')`,
      [SUPORTE_D],
    );
    await pool.query(
      `insert into platform_support_sessions
         (id, organization_id, actor_user_id, auth_session_id, access_mode, expires_at)
       values ($1, $2, $3, $4, 'support_readonly', now() + interval '30 minutes')`,
      [suporte, ORG_D, SUPORTE_D, sessao],
    );
    const antes = { crm: await crmDe(ORG_D), contatos: await retrato(ORG_D) };
    try {
      await expect(ligar(SUPORTE_D, ORG_D, true, { sessao })).rejects.toMatchObject({ code: "42501" });

      // Vencida: `fn_user_role_in_org` volta a ler a filiação (admin da D), e
      // quem barra é `fn_support_write_allowed` — a guarda que só este caso isola.
      await pool.query(
        "update platform_support_sessions set access_mode = 'full', expires_at = now() - interval '1 second' where id = $1",
        [suporte],
      );
      await expect(ligar(SUPORTE_D, ORG_D, true, { sessao })).rejects.toMatchObject({ code: "42501" });

      expect({ crm: await crmDe(ORG_D), contatos: await retrato(ORG_D) }).toEqual(antes);
    } finally {
      await pool.query("delete from platform_support_sessions where id = $1", [suporte]);
      await pool.query("delete from platform_admins where user_id = $1", [SUPORTE_D]);
      await pool.query("delete from auth.sessions where id = $1", [sessao]);
    }
  });

  it("I21b · controle do par: o admin da D, sem suporte, liga", async () => {
    const r = await ligar(ADMIN_D, ORG_D, true);
    expect(r).toMatchObject({ ligado: true, mudou: true, ganharam_etiqueta: 2 });
  });
});

describe("o funil de clientes", () => {
  it("I22 · a marca é exclusiva por organização, e independente entre organizações", async () => {
    const marcarFunil = (org: string, slug: string) =>
      pool.query(
        `insert into crm_pipelines (organization_id, name, slug, position, is_client_pipeline)
         values ($1, 'Clientes', $2, 9000, true)`,
        [org, slug],
      );

    await marcarFunil(ORG_A, "clientes-a");
    await expect(marcarFunil(ORG_A, "clientes-a2")).rejects.toMatchObject({ code: "23505" });
    await expect(marcarFunil(ORG_B, "clientes-b")).resolves.toBeDefined();
  });

  it("I23 · A ligada: o lead de quem já é cliente nasce no funil de clientes", async () => {
    const { rows } = await pool.query<{ id: string }>(
      "select id from crm_pipelines where organization_id = $1 and is_client_pipeline",
      [ORG_A],
    );
    const funilDeClientes = rows[0]!.id;
    await pool.query(
      `insert into crm_stages (organization_id, pipeline_id, name, slug, position)
       values ($1, $2, 'Voltou a falar', 'voltou-a-falar', 1000)`,
      [ORG_A, funilDeClientes],
    );

    const contato = await criarContato(ORG_A, "Antiga");
    await marcar(ORG_A, contato, "2024-02-02T10:00:00Z");

    const r = await garantirLeadDaConversa(db, {
      organizationId: ORG_A,
      contactId: contato,
      conversationId: CONVERSA,
      nomeDoContato: "Antiga",
    });

    expect(r.criado, `esperava criar, veio ${JSON.stringify(r)}`).toBe(true);
    if (!r.criado) return;
    expect(r.pipelineId).toBe(funilDeClientes);
  });

  it("I24 · B desligada: contato COM data congelada e funil de clientes marcado nasce no padrão", async () => {
    // O funil de clientes da B existe (I22) e ganha etapa utilizável aqui, para
    // que a ÚNICA razão de não usá-lo seja a regra desligada.
    const { rows } = await pool.query<{ id: string }>(
      "select id from crm_pipelines where organization_id = $1 and is_client_pipeline",
      [ORG_B],
    );
    const funilDeClientes = rows[0]!.id;
    await pool.query(
      `insert into crm_stages (organization_id, pipeline_id, name, slug, position)
       values ($1, $2, 'Voltou', 'voltou-b', 1000)`,
      [ORG_B, funilDeClientes],
    );
    const contato = await criarContato(ORG_B, "Congelada");
    await pool.query("update contacts set first_service_at = '2022-01-01T10:00:00Z' where id = $1", [contato]);

    const r = await garantirLeadDaConversa(db, {
      organizationId: ORG_B,
      contactId: contato,
      conversationId: CONVERSA,
      nomeDoContato: "Congelada",
    });

    expect(r.criado, `esperava criar, veio ${JSON.stringify(r)}`).toBe(true);
    if (!r.criado) return;
    const padrao = await funilDeEntrada(db, ORG_B);
    if ("erro" in padrao) throw new Error(`a B precisa de funil padrão: ${padrao.erro}`);
    expect(r.pipelineId).toBe(padrao.pipelineId);
    expect(r.pipelineId).not.toBe(funilDeClientes);
  });

  it("I25 · quem NÃO é cliente continua no funil de entrada, mesmo havendo funil de clientes", async () => {
    const contato = await criarContato(ORG_A, "Nova");
    const r = await garantirLeadDaConversa(db, {
      organizationId: ORG_A,
      contactId: contato,
      conversationId: CONVERSA,
      nomeDoContato: "Nova",
    });

    expect(r.criado).toBe(true);
    if (!r.criado) return;
    const padrao = await funilDeEntrada(db, ORG_A);
    expect("erro" in padrao).toBe(false);
    if ("erro" in padrao) return;
    expect(r.pipelineId).toBe(padrao.pipelineId);
  });

  it("I26 · funil de clientes SEM etapa utilizável cai no padrão — o lead nasce de qualquer jeito", async () => {
    const semEtapaAberta = randomUUID();
    await pool.query("update crm_pipelines set is_client_pipeline = false where organization_id = $1", [ORG_A]);
    await pool.query(
      `insert into crm_pipelines (id, organization_id, name, slug, position, is_client_pipeline)
       values ($1, $2, 'Clientes sem etapa', 'clientes-sem-etapa', 9100, true)`,
      [semEtapaAberta, ORG_A],
    );
    await pool.query(
      `insert into crm_stages (organization_id, pipeline_id, name, slug, position, is_won)
       values ($1, $2, 'Ganho', 'ganho-clientes-a', 1000, true)`,
      [ORG_A, semEtapaAberta],
    );

    const destino = await funilDeEntrada(db, ORG_A, true);
    expect("erro" in destino, `esperava destino, veio ${JSON.stringify(destino)}`).toBe(false);
    if ("erro" in destino) return;
    expect(destino.pipelineId).not.toBe(semEtapaAberta);
  });
});

/**
 * AS CORRIDAS. Cada uma com duas conexões de verdade: a primeira segura a
 * transação aberta, a segunda é disparada e fica esperando a trava, e só então
 * a primeira commita. As asserções são sobre o DESFECHO (a data, a etiqueta),
 * não sobre a trava: se a trava sumir, o desfecho errado é o que fica vermelho.
 */
describe("as corridas", () => {
  /** Espera a conexão `pid` ficar bloqueada por `dono`, ou a promessa terminar. */
  async function esperarBloqueio(pid: number, dono: number, terminou: () => boolean): Promise<void> {
    for (let i = 0; i < 100 && !terminou(); i++) {
      const { rows } = await pool.query<{ bloqueada: boolean }>(
        "select $2::int = any(pg_blocking_pids($1::int)) as bloqueada",
        [pid, dono],
      );
      if (rows[0]!.bloqueada) return;
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  it("I27 · duas marcações simultâneas do mesmo contato: fica a data MAIS CEDO, não a do último a gravar", async () => {
    // Por que o recálculo trava o contato ANTES de ler a agenda: a segunda
    // transação, se lesse o min() antes da trava, não enxergaria o horário mais
    // cedo que a primeira ainda não commitou — e gravaria o dela por cima.
    const contato = await criarContato(ORG_A, "Corrida de marcação");
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await a.query("begin");
      await a.query(
        `insert into calendar_appointments (organization_id, title, starts_at, ends_at, contact_id)
         values ($1, 'Cedo', '2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z', $2)`,
        [ORG_A, contato],
      );
      const pidA = (await a.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;
      const pidB = (await b.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;

      await b.query("begin");
      let terminou = false;
      const segunda = b
        .query(
          `insert into calendar_appointments (organization_id, title, starts_at, ends_at, contact_id)
           values ($1, 'Tarde', '2026-10-01T15:00:00Z', '2026-10-01T16:00:00Z', $2)`,
          [ORG_A, contato],
        )
        .finally(() => {
          terminou = true;
        });
      await esperarBloqueio(pidB, pidA, () => terminou);

      await a.query("commit");
      await segunda;
      await b.query("commit");
    } finally {
      await a.query("rollback").catch(() => undefined);
      await b.query("rollback").catch(() => undefined);
      a.release();
      b.release();
    }

    const depois = await lerContato(contato);
    expect(depois.first_service_at?.toISOString()).toBe("2026-10-01T09:00:00.000Z");
    expect(depois.tags.filter((t) => t === TAG_DE_CLIENTE)).toHaveLength(1);
    expect(await eventosDeEtiqueta({ contato })).toBe(1);
  });

  it("I28 · ligar a regra enquanto um horário está sendo marcado: o contato não fica de fora", async () => {
    // Por que o trigger e a ligação se serializam: sem isso o horário em voo lê
    // a chave ainda desligada, e a classificação do histórico — que roda antes
    // de ele commitar — não o enxerga. O contato ficaria sem etiqueta até alguém
    // desligar e religar, sem erro nenhum.
    const contato = await criarContato(ORG_F, "Marcou enquanto ligavam");
    const a = await pool.connect();
    const b = await pool.connect();
    let resultado: Resultado | null = null;
    try {
      await a.query("begin");
      await a.query(
        `insert into calendar_appointments (organization_id, title, starts_at, ends_at, contact_id)
         values ($1, 'Em voo', '2026-11-01T09:00:00Z', '2026-11-01T10:00:00Z', $2)`,
        [ORG_F, contato],
      );
      const pidA = (await a.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;
      const pidB = (await b.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;

      await b.query("begin");
      await b.query("set local role authenticated");
      await b.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: ADMIN_F, role: "authenticated", aal: "aal1" }),
      ]);
      let terminou = false;
      const ligacao = b.query<{ r: Resultado }>(RPC, [ORG_F, true]).finally(() => {
        terminou = true;
      });
      await esperarBloqueio(pidB, pidA, () => terminou);

      await a.query("commit");
      resultado = (await ligacao).rows[0]!.r;
      await b.query("commit");
    } finally {
      await a.query("rollback").catch(() => undefined);
      await b.query("rollback").catch(() => undefined);
      a.release();
      b.release();
    }

    const depois = await lerContato(contato);
    expect(depois.first_service_at?.toISOString()).toBe("2026-11-01T09:00:00.000Z");
    expect(depois.tags).toContain(TAG_DE_CLIENTE);
    expect(resultado).toMatchObject({ ligado: true, mudou: true, ganharam_etiqueta: 1 });
  });
});
