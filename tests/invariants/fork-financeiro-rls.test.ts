import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * O MÓDULO FINANCEIRO NÃO VAZA ENTRE ORGANIZAÇÕES — E AS TRÊS DEFINER DELE
 * CONFEREM DE QUEM É A ORGANIZAÇÃO QUE RECEBERAM.
 *
 * ═══ Por que um arquivo próprio ═══
 *
 * Mesma razão do `agenda-rls.test.ts`: o molde de `rls-isolation.test.ts`
 * semeia UM `agent` por organização e prova duas coisas por tabela. As dez
 * tabelas do financeiro precisam de uma cadeia inteira de fixtures (conta →
 * forma de pagamento → plano → comanda → item → comissão → lançamento) e de um
 * usuário `manager`, porque o estorno tem gate de papel. Enfiar isso no seed
 * comum tornaria aquele arquivo refém deste módulo — que é justamente o que o
 * fork existe para evitar.
 *
 * ═══ O que este arquivo prova ═══
 *
 * 1. Isolamento nas DEZ tabelas, nos dois sentidos, com controle positivo:
 *    zero linhas do vizinho e mais de zero linhas próprias. Sem o controle
 *    positivo, o jeito trivial de ficar verde é quebrar a feature inteira.
 * 2. `fn_proximo_numero_de_comanda` recusa a organização de fora. Ela é
 *    `security definer`, recebe o org POR ARGUMENTO, e antes da 9010 devolvia
 *    o próximo número do vizinho — que é o VOLUME de vendas dele, um número
 *    por chamada, sem tocar em linha nenhuma (a RLS não tinha o que barrar).
 * 3. `fn_finalizar_comanda` e `fn_estornar_comanda` recusam quem não é da
 *    organização, e FUNCIONAM para quem é (as duas estão em
 *    AUTHENTICATED_PERMITIDO de `hardening-definer-varredura.test.ts`, e esta
 *    é a prova que aquela razão cita).
 * 4. A anonimização da LGPD apaga o texto livre da comanda — e não encosta na
 *    comanda do vizinho com o mesmo texto.
 *
 * Conectar como `postgres` mediria NADA (`rolbypassrls = t`). Aqui é
 * `set role authenticated` + `request.jwt.claims`, o mesmo caminho da produção.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error(
    "TEST_DB_CONTAINER not set — rode esta suíte via `pnpm test:db` (scripts/test-db.sh)",
  );
}
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"],
    { input: script, encoding: "utf8" },
  ).trim();
}

function comoUsuario(userId: string, corpo: string): string {
  return `
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    ${corpo}
  `;
}

function ultimaLinha(saida: string): string {
  const linhas = saida.split("\n");
  const ultima = linhas[linhas.length - 1];
  if (ultima === undefined) throw new Error(`saída vazia do psql`);
  return ultima;
}

function contaComo(userId: string, consulta: string): number {
  const ultima = ultimaLinha(sql(comoUsuario(userId, consulta)));
  if (!/^\d+$/.test(ultima)) throw new Error(`saída inesperada do psql: ${ultima}`);
  return Number(ultima);
}

/** Devolve `{ ok: saída }` ou `{ erro: stderr }` — o erro é o desfecho que interessa aqui. */
function tentaComo(userId: string, corpo: string): { ok?: string; erro?: string } {
  try {
    return { ok: ultimaLinha(sql(comoUsuario(userId, corpo))) };
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    return { erro: String(err.stderr ?? err.message ?? e) };
  }
}

// UUIDs próprios, para este arquivo não disputar linhas com os outros.
const ORG_A = "f1a1ce00-0000-4000-8000-00000000000a";
const ORG_B = "f1a1ce00-0000-4000-8000-00000000000b";
const USER_A = "f1a1ce00-1111-4000-8000-00000000000a";
const USER_B = "f1a1ce00-1111-4000-8000-00000000000b";

/** As dez tabelas que o módulo acrescentou. Tabela nova do fork entra AQUI. */
const TABELAS_DO_FINANCEIRO = [
  "professionals",
  "financial_accounts",
  "payment_methods",
  "account_plans",
  "sales",
  "sale_items",
  "commission_rules",
  "commissions",
  "financial_entries",
  "loyalty_ledger",
  "recurring_entries",
] as const;

function semeia(org: string, user: string, tag: string): string {
  return `
    insert into auth.users (id, email) values ('${user}', 'fin-${tag}@invariant.test')
      on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${org}', 'fin-inv-${tag}', 'Financeiro Invariant ${tag}', 'Fin ${tag}')
      on conflict (id) do nothing;
    -- manager: o estorno tem gate de papel, e manager >= agent cobre os dois.
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${user}', '${org}', 'manager', now())
      on conflict do nothing;
  `;
}

beforeAll(() => {
  sql(semeia(ORG_A, USER_A, "a") + semeia(ORG_B, USER_B, "b"));
  sql(`
    do $seed$
    declare
      v_org      uuid;
      v_user     uuid;
      v_contato  uuid;
      v_lgpd     uuid;
      v_conta    uuid;
      v_forma    uuid;
      v_plano    uuid;
      v_venda1   uuid;
      v_venda2   uuid;
      v_venda3   uuid;
      v_item1    uuid;
      v_prof     uuid;
      v_entry    uuid;
    begin
      foreach v_org in array array['${ORG_A}'::uuid, '${ORG_B}'::uuid] loop
        v_user := case when v_org = '${ORG_A}'::uuid then '${USER_A}'::uuid else '${USER_B}'::uuid end;

        insert into public.contacts (organization_id, display_name)
          values (v_org, 'Cliente do invariante financeiro') returning id into v_contato;
        insert into public.contacts (organization_id, display_name)
          values (v_org, 'Cliente que pede anonimizacao') returning id into v_lgpd;

        insert into public.financial_accounts (organization_id, name, kind)
          values (v_org, 'Caixa do invariante', 'cash') returning id into v_conta;
        insert into public.payment_methods (organization_id, name, account_id)
          values (v_org, 'Dinheiro do invariante', v_conta) returning id into v_forma;
        insert into public.account_plans (organization_id, name, direction)
          values (v_org, 'Servicos do invariante', 'in') returning id into v_plano;

        -- Quem EXECUTA o serviço. Não é usuária do sistema (9011): v_user é
        -- quem OPERA a comanda, e os dois papéis não se confundem mais.
        insert into public.professionals (organization_id, name)
          values (v_org, 'Profissional do invariante') returning id into v_prof;

        -- #9001: a comanda que só existe para ser LIDA (e para a LGPD apagar o texto).
        insert into public.sales (organization_id, number, contact_id, attendant_user_id,
                                  created_by_user_id, notes, cancel_reason, reverse_reason)
          values (v_org, 9001, v_lgpd, v_user, v_user,
                  'Anotacao livre sobre a pessoa', 'Motivo digitado a mao', 'Estorno explicado a mao')
          returning id into v_venda1;
        insert into public.sale_items (organization_id, sale_id, description, professional_id,
                                       unit_price_cents, total_cents, commission_percent)
          values (v_org, v_venda1, 'Servico do invariante', v_prof, 10000, 10000, 10)
          returning id into v_item1;

        -- #9002: a que vai ser FINALIZADA pela função, no controle positivo.
        insert into public.sales (organization_id, number, contact_id, attendant_user_id, created_by_user_id)
          values (v_org, 9002, v_contato, v_user, v_user) returning id into v_venda2;
        insert into public.sale_items (organization_id, sale_id, description, professional_id,
                                       unit_price_cents, total_cents, commission_percent)
          values (v_org, v_venda2, 'Servico a faturar', v_prof, 5000, 5000, 10);

        -- #9003: já finalizada, com o lançamento de origem, para o ESTORNO ter o que estornar.
        insert into public.sales (organization_id, number, contact_id, attendant_user_id,
                                  created_by_user_id, status, finalized_at, payment_method_id, total_cents)
          values (v_org, 9003, v_contato, v_user, v_user, 'finalized', now(), v_forma, 7000)
          returning id into v_venda3;
        insert into public.financial_entries
          (organization_id, account_id, account_plan_id, sale_id, direction, amount_cents,
           description, status, paid_at, origin, created_by_user_id)
          values (v_org, v_conta, v_plano, v_venda3, 'in', 7000,
                  'Comanda #9003', 'paid', now(), 'sale', v_user);

        -- O lançamento avulso, a comissão, o ponto e o molde recorrente.
        insert into public.financial_entries
          (organization_id, account_id, account_plan_id, direction, amount_cents,
           description, status, origin, created_by_user_id)
          values (v_org, v_conta, v_plano, 'in', 1234, 'Lancamento do invariante', 'pending', 'manual', v_user)
          returning id into v_entry;
        insert into public.commission_rules (organization_id, professional_id, percent)
          values (v_org, v_prof, 10);
        insert into public.commissions (organization_id, sale_item_id, professional_id, percent, amount_cents)
          values (v_org, v_item1, v_prof, 10, 1000);
        insert into public.loyalty_ledger (organization_id, contact_id, points, reason, sale_id)
          values (v_org, v_contato, 10, 'Ponto do invariante', v_venda1);
        insert into public.recurring_entries
          (organization_id, account_id, account_plan_id, name, direction, amount_cents, day_of_month, created_by_user_id)
          values (v_org, v_conta, v_plano, 'Aluguel do invariante', 'out', 50000, 5, v_user);
      end loop;
    end
    $seed$;
  `);
});

describe("financeiro: isolamento entre organizações", () => {
  for (const tabela of TABELAS_DO_FINANCEIRO) {
    it(`o usuário da org A lê 0 linhas da org B em ${tabela}`, () => {
      expect(
        contaComo(USER_A, `select count(*) from public.${tabela} where organization_id = '${ORG_B}';`),
      ).toBe(0);
    });

    it(`o usuário da org A ainda lê as linhas dele em ${tabela} (controle positivo)`, () => {
      expect(
        contaComo(USER_A, `select count(*) from public.${tabela} where organization_id = '${ORG_A}';`),
      ).toBeGreaterThanOrEqual(1);
    });

    it(`e a direção inversa: a org B lê as dela e 0 de A em ${tabela}`, () => {
      expect(
        contaComo(USER_B, `select count(*) from public.${tabela} where organization_id = '${ORG_B}';`),
      ).toBeGreaterThanOrEqual(1);
      expect(
        contaComo(USER_B, `select count(*) from public.${tabela} where organization_id = '${ORG_A}';`),
      ).toBe(0);
    });
  }
});

describe("financeiro: as definer conferem de quem é a organização do argumento", () => {
  it("fn_proximo_numero_de_comanda recusa a organização do vizinho", () => {
    const r = tentaComo(USER_A, `select public.fn_proximo_numero_de_comanda('${ORG_B}');`);
    expect(r.ok, "a numeração do vizinho foi devolvida — é o volume de vendas dele").toBeUndefined();
    expect(r.erro).toContain("caller_not_authorized_for_org");
  });

  it("fn_proximo_numero_de_comanda funciona na própria organização (controle positivo)", () => {
    const r = tentaComo(USER_A, `select public.fn_proximo_numero_de_comanda('${ORG_A}');`);
    expect(r.erro).toBeUndefined();
    // As comandas semeadas vão até 9003.
    expect(Number(r.ok)).toBe(9004);
  });

  it("fn_finalizar_comanda recusa a comanda do vizinho", () => {
    const r = tentaComo(
      USER_A,
      `select public.fn_finalizar_comanda(
         '${ORG_B}',
         (select id from public.sales where organization_id = '${ORG_B}' and number = 9002),
         (select id from public.payment_methods where organization_id = '${ORG_B}' limit 1),
         0);`,
    );
    expect(r.erro).toContain("comanda_forbidden");
    // E a comanda do vizinho continua aberta: não houve efeito parcial.
    expect(
      sql(`select status from public.sales where organization_id = '${ORG_B}' and number = 9002;`),
    ).toBe("open");
  });

  it("fn_finalizar_comanda funciona na própria organização (controle positivo)", () => {
    const r = tentaComo(
      USER_A,
      `select public.fn_finalizar_comanda(
         '${ORG_A}',
         (select id from public.sales where organization_id = '${ORG_A}' and number = 9002),
         (select id from public.payment_methods where organization_id = '${ORG_A}' limit 1),
         0)->>'total_cents';`,
    );
    expect(r.erro).toBeUndefined();
    expect(r.ok).toBe("5000");
    expect(
      sql(`select status from public.sales where organization_id = '${ORG_A}' and number = 9002;`),
    ).toBe("finalized");
  });

  it("fn_estornar_comanda recusa a comanda do vizinho", () => {
    const r = tentaComo(
      USER_A,
      `select public.fn_estornar_comanda(
         '${ORG_B}',
         (select id from public.sales where organization_id = '${ORG_B}' and number = 9003),
         'tentativa cruzada');`,
    );
    expect(r.erro).toContain("estorno_forbidden");
    expect(
      sql(`select count(*) from public.sales
            where organization_id = '${ORG_B}' and number = 9003 and reversed_at is null;`),
    ).toBe("1");
  });

  it("fn_estornar_comanda funciona na própria organização (controle positivo)", () => {
    const r = tentaComo(
      USER_A,
      `select public.fn_estornar_comanda(
         '${ORG_A}',
         (select id from public.sales where organization_id = '${ORG_A}' and number = 9003),
         'motivo do invariante')->>'estornada';`,
    );
    expect(r.erro).toBeUndefined();
    expect(r.ok).toBe("true");
    // O contra-lançamento nasceu, e a entrada original continua de pé.
    expect(
      sql(`select count(*) from public.financial_entries
            where organization_id = '${ORG_A}' and origin = 'reversal';`),
    ).toBe("1");
  });

  it("as três não são executáveis pela anon key", () => {
    const expostas = sql(`
      select p.oid::regprocedure::text
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('fn_proximo_numero_de_comanda', 'fn_finalizar_comanda', 'fn_estornar_comanda')
         and has_function_privilege('anon', p.oid, 'EXECUTE');
    `);
    expect(expostas, "definer do financeiro alcançável pela chave que vai para o browser").toBe("");
  });
});

describe("financeiro: a anonimização da LGPD alcança o texto livre da comanda", () => {
  it("anonimizar o contato apaga notes, cancel_reason e reverse_reason da comanda dele", () => {
    // CONTROLE: o texto está lá antes.
    expect(
      sql(`select count(*) from public.sales
            where organization_id = '${ORG_A}' and number = 9001 and notes is not null;`),
    ).toBe("1");

    // Pelo caminho REAL da LGPD, não por um UPDATE de laboratório: é
    // `fn_lgpd_cascade_redact_contact` que a rota de anonimização chama, e o
    // trigger da 9010 pendura na transição que ELA faz. Um update à mão
    // provaria o trigger e não provaria a integração.
    sql(`
      select public.fn_lgpd_cascade_redact_contact(
        '${ORG_A}',
        (select id from public.contacts
          where organization_id = '${ORG_A}' and display_name = 'Cliente que pede anonimizacao'),
        null);
    `);

    // CONTROLE: a cascata de fato rodou (se ela tivesse falhado em silêncio, o
    // vazio abaixo seria "nada aconteceu", indistinguível de "foi apagado").
    expect(
      sql(`select display_name like 'Cliente Anonimizado #%' from public.contacts
            where organization_id = '${ORG_A}' and is_anonymized;`),
    ).toBe("t");

    expect(
      sql(`select coalesce(notes, '') || '|' || coalesce(cancel_reason, '') || '|' || coalesce(reverse_reason, '')
             from public.sales where organization_id = '${ORG_A}' and number = 9001;`),
    ).toBe("||");
  });

  it("e a linha da venda continua existindo, com o valor (obrigação fiscal)", () => {
    expect(
      sql(`select count(*) from public.sales where organization_id = '${ORG_A}' and number = 9001;`),
    ).toBe("1");
  });

  it("a comanda do vizinho, com o mesmo texto, não foi tocada", () => {
    expect(
      sql(`select notes from public.sales where organization_id = '${ORG_B}' and number = 9001;`),
    ).toBe("Anotacao livre sobre a pessoa");
  });
});
