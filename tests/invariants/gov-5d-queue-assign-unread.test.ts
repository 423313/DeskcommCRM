import { beforeAll, describe, expect, it } from "vitest";

import { GOV_AGENT_A, GOV_ORG, GOV_SESSION, seedGov, sql } from "./gov-helpers";

/**
 * G5-03 — fila visível + atribuição via worker (spec 13 §5).
 *
 * Prova no Postgres descartável:
 *  (a) acceptance 3 — o assign via fn_conversation_assign(reason='routing')
 *      deixa `unread_count_for_assignee` CORRETO (=0, fresh), sem carregar valor
 *      STALE de antes da atribuição. Semeamos unread=7 (dono anterior) e provamos
 *      que a atribuição do worker zera — o novo dono não herda contagem alheia.
 *  (b) acceptance 1 (coerência) — a MEMBRESIA da fila (o predicado que o listing
 *      e o counts.unassigned compartilham: sem dono ∧ status='open') não depende
 *      da ordenação por tempo de espera. Após o assign, a conversa SAI da fila.
 *
 * Namespace 4050/3050 (não colide com 4040/3040 do gov-4b nem 4444/3333 do helper).
 */

// Conversa na fila com unread "stale" de um dono anterior.
const CONV_STALE = "cccccccc-4050-4000-8000-000000000001";
const CONTACT = "cccccccc-3050-4000-8000-000000000001";

// 3 conversas de tempos de espera conhecidos (coerência ordem↔posição).
const CONV_OLD = "cccccccc-4050-4000-8000-000000000002"; // espera há 30 min ⇒ pos 1
const CONV_MID = "cccccccc-4050-4000-8000-000000000003"; // espera há 10 min ⇒ pos 2
const CONV_NEW = "cccccccc-4050-4000-8000-000000000004"; // espera há 2 min  ⇒ pos 3
const CONTACT_N = (n: number) => `cccccccc-3050-4000-8000-00000000000${n}`;

// Predicado ÚNICO da fila = o de counts.unassigned (app/api/v1/conversations/counts).
const QUEUE_PREDICATE = `assigned_to_user_id is null and status = 'open'`;

function unreadOf(id: string): number {
  return Number(
    sql(`select unread_count_for_assignee from public.conversations where id = '${id}';`),
  );
}
function inQueue(id: string): boolean {
  return (
    sql(
      `select count(*) from public.conversations where id = '${id}' and ${QUEUE_PREDICATE};`,
    ) === "1"
  );
}

beforeAll(() => {
  seedGov();
  sql(`
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTACT}', '${GOV_ORG}', 'Queue Stale Contact')
      on conflict do nothing;

    -- Entra na fila (sem dono, open) MAS carregando unread=7 de um dono anterior.
    insert into public.conversations
      (id, organization_id, contact_id, channel_session_id, status,
       unread_count_for_assignee, last_inbound_at)
      values ('${CONV_STALE}', '${GOV_ORG}', '${CONTACT}', '${GOV_SESSION}', 'open', 7, now())
      on conflict do nothing;

    insert into public.contacts (id, organization_id, display_name)
      values
        ('${CONTACT_N(2)}', '${GOV_ORG}', 'Queue Order Contact Old'),
        ('${CONTACT_N(3)}', '${GOV_ORG}', 'Queue Order Contact Mid'),
        ('${CONTACT_N(4)}', '${GOV_ORG}', 'Queue Order Contact New')
      on conflict do nothing;

    -- Tempos de espera conhecidos: quanto MAIS antigo o last_inbound_at, mais cedo na
    -- fila de ESPERA (getQueuePositions). last_message_at é de propósito NÃO
    -- monotônico em relação a ele: a lista EXIBIDA não pode segui-lo (#639).
    insert into public.conversations
      (id, organization_id, contact_id, channel_session_id, status, last_inbound_at, last_message_at)
      values
        ('${CONV_OLD}', '${GOV_ORG}', '${CONTACT_N(2)}', '${GOV_SESSION}', 'open', now() - interval '30 minutes', now() - interval '10 minutes'),
        ('${CONV_MID}', '${GOV_ORG}', '${CONTACT_N(3)}', '${GOV_SESSION}', 'open', now() - interval '10 minutes', now() - interval '2 minutes'),
        ('${CONV_NEW}', '${GOV_ORG}', '${CONTACT_N(4)}', '${GOV_SESSION}', 'open', now() - interval '2 minutes', now() - interval '30 minutes')
      on conflict do nothing;
  `);
});

describe("G5-03 — ordem de EXIBIÇÃO do inbox, todas as abas (#639) — e a fila de ESPERA, que é outra", () => {
  it("o Postgres devolve a ordem que o handler PEDE: last_message_at DESC nulls last, id DESC (espelho — quem guarda o pedido é tests/unit/fila-ordena-por-ultima-mensagem.test.ts)", () => {
    // Espelha o ORDER BY do handler (app/api/v1/conversations/_handler.ts).
    // ⚠️ este arquivo NÃO chama o handler: reverter o ORDER BY do handler não o
    // deixa vermelho. Ele prova que o Postgres ordena como pedido, não que o
    // handler pede — a guarda do PEDIDO é o unit citado no título.
    // O índice nesta lista NÃO é mais a numeração que a tela mostra: o selo da
    // Fila passou a desenhar `queue_position` (`lib/inbox/posicao-na-fila.ts`),
    // que é a ordem de ESPERA — outra pergunta, medida em
    // tests/unit/fila-selo-mostra-a-posicao-de-espera.test.tsx.
    // A fixture põe last_message_at NÃO monotônico em relação ao tempo de espera
    // (MID 2min, OLD 10min, NEW 30min) — uma ordem por `last_inbound_at` ASC
    // devolveria OLD,MID,NEW e este teste reprova. CONV_STALE não tem
    // `last_message_at`: nulls last ⇒ fim da lista, apesar do inbound mais novo.
    const ordered = sql(
      `select string_agg(id::text, ',' order by last_message_at desc nulls last, id desc)
         from public.conversations
        where organization_id = '${GOV_ORG}'
          and id in ('${CONV_OLD}', '${CONV_MID}', '${CONV_NEW}', '${CONV_STALE}');`,
    );
    expect(ordered).toBe(`${CONV_MID},${CONV_OLD},${CONV_NEW},${CONV_STALE}`);
  });

  it("a fila de ESPERA é OUTRA ordem, e isso é deliberado: last_inbound_at ASC ⇒ quem espera há mais tempo é o 1º", () => {
    // Por que este caso existe: o describe acima se chamava "coerência
    // ordem↔posição" e provava só a ordem de EXIBIÇÃO. A propriedade que ele
    // dizia guardar — índice da tela = posição da fila — deixou de existir com o
    // #639, e por um lote inteiro ninguém REGISTROU que ela deixou de existir: a
    // divergência virou comentário, e comentário nenhum gate lê.
    //
    // O número que a tela desenha hoje é `queue_position`
    // (`lib/inbox/posicao-na-fila.ts` → `getQueuePositions`), que é ESTA ordem —
    // a mesma que o cliente ouve pelo WhatsApp por `getQueuePosition`. As duas
    // réguas convivem de propósito: "onde a conversa está na lista" e "qual a
    // minha vez" são perguntas diferentes.
    const espera = sql(
      `select string_agg(id::text, ',' order by last_inbound_at asc nulls last, id asc)
         from public.conversations
        where organization_id = '${GOV_ORG}'
          and id in ('${CONV_OLD}', '${CONV_MID}', '${CONV_NEW}', '${CONV_STALE}');`,
    );
    expect(espera).toBe(`${CONV_OLD},${CONV_MID},${CONV_NEW},${CONV_STALE}`);

    const exibida = sql(
      `select string_agg(id::text, ',' order by last_message_at desc nulls last, id desc)
         from public.conversations
        where organization_id = '${GOV_ORG}'
          and id in ('${CONV_OLD}', '${CONV_MID}', '${CONV_NEW}', '${CONV_STALE}');`,
    );
    // A asserção que fecha o buraco: as duas réguas produzem ordens DIFERENTES
    // sobre a MESMA fixture. Se um dia coincidirem, é porque uma das duas mudou
    // em silêncio — e aí vale reler qual delas o selo está desenhando.
    expect(espera).not.toBe(exibida);
  });
});

describe("G5-03 — fila: membresia coerente com counts.unassigned (acceptance 1)", () => {
  it("conversa sem dono + open ⇒ está na fila (mesmo predicado do counts)", () => {
    expect(inQueue(CONV_STALE)).toBe(true);
  });
});

describe("G5-03 — atribuição via worker zera unread (acceptance 3)", () => {
  it("antes do assign: unread stale do dono anterior = 7", () => {
    expect(unreadOf(CONV_STALE)).toBe(7);
  });

  it("após fn_conversation_assign(reason='routing'): unread_count_for_assignee = 0 (fresh, sem stale)", () => {
    sql(
      `select 1 from public.fn_conversation_assign('${GOV_ORG}', '${CONV_STALE}', '${GOV_AGENT_A}', 'routing', null, false);`,
    );
    expect(unreadOf(CONV_STALE)).toBe(0);
  });

  it("após o assign: conversa SAI da fila (ganhou dono) — coerência fila↔counts", () => {
    expect(inQueue(CONV_STALE)).toBe(false);
    const assignee = sql(
      `select (assigned_to_user_id = '${GOV_AGENT_A}')::int from public.conversations where id = '${CONV_STALE}';`,
    );
    expect(assignee).toBe("1");
  });
});
