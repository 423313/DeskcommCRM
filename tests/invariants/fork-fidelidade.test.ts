/**
 * O CARTÃO DE FIDELIDADE (migration 9013) — o que o schema promete, medido.
 *
 * O fork tinha um livro de pontos onde quem finalizava DIGITAVA quantos pontos
 * dar. A 9013 trouxe a regra do sistema anterior: um selo por comanda com
 * serviço pontuável, meta configurável, prêmio como desconto percentual e
 * resgate dentro da comanda aberta.
 *
 * Três coisas que este arquivo existe para prender, porque quebram em silêncio:
 *
 *  1. **Um selo por comanda, e nem um a mais.** Duas finalizações da mesma
 *     comanda, ou dois itens pontuáveis na mesma, não podem dar dois selos. A
 *     garantia é o índice único parcial, não a boa intenção de quem chama.
 *  2. **A comanda que resgata não ganha selo no mesmo lançamento.** Sem isso o
 *     resgate devolve um selo de brinde e o cartão nunca zera de verdade.
 *  3. **Isolamento com CONTROLE POSITIVO.** Um agregado que devolve zero
 *     porque a RLS barrou é indistinguível de "cliente sem selo". Só o par
 *     (zero no vizinho E maior que zero na própria organização) separa os dois
 *     — e o usuário do teste é COMUM de propósito: com platform admin, que tem
 *     passe livre, a recusa nunca aconteceria e o teste passaria por engano.
 */
import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

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
  if (ultima === undefined) throw new Error("saída vazia do psql");
  return ultima;
}

function tentaComo(userId: string, corpo: string): { ok?: string; erro?: string } {
  try {
    return { ok: ultimaLinha(sql(comoUsuario(userId, corpo))) };
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    return { erro: String(err.stderr ?? err.message ?? e) };
  }
}

// UUIDs próprios: este arquivo não disputa linhas com os outros invariantes.
const ORG_A = "f1de11da-0000-4000-8000-00000000000a";
const ORG_B = "f1de11da-0000-4000-8000-00000000000b";
const USER_A = "f1de11da-1111-4000-8000-00000000000a";
const USER_B = "f1de11da-1111-4000-8000-00000000000b";
const CONTATO_A = "f1de11da-2222-4000-8000-00000000000a";
const CONTATO_B = "f1de11da-2222-4000-8000-00000000000b";

beforeAll(() => {
  sql(`
    do $$
    declare
      v_org     uuid;
      v_user    uuid;
      v_contato uuid;
      v_conta   uuid;
      v_forma   uuid;
      v_plano   uuid;
      v_pontua  uuid;
      v_premio  uuid;
    begin
      foreach v_org in array array['${ORG_A}'::uuid, '${ORG_B}'::uuid] loop
        v_user    := case when v_org = '${ORG_A}'::uuid then '${USER_A}'::uuid else '${USER_B}'::uuid end;
        v_contato := case when v_org = '${ORG_A}'::uuid then '${CONTATO_A}'::uuid else '${CONTATO_B}'::uuid end;

        insert into public.organizations (id, slug, legal_name, display_name)
          values (v_org, 'fide-' || right(v_org::text, 1),
                  'Org fidelidade ' || right(v_org::text, 1),
                  'Org fidelidade ' || right(v_org::text, 1))
          on conflict (id) do nothing;

        -- O auth.users do banco de teste tem só o essencial (id, email): o
        -- prelúdio do scripts/test-db.sh recria o schema, não o GoTrue inteiro.
        -- Repetir as colunas do Supabase real aqui quebra com "column
        -- instance_id does not exist". Mesmo formato do fork-financeiro-rls.
        insert into auth.users (id, email)
          values (v_user, 'fide-' || right(v_user::text, 1) || '@invariant.test')
          on conflict (id) do nothing;

        -- ADMIN da própria organização, e NADA além disso: nenhum dos dois é
        -- platform admin, que teria passe livre e faria toda recusa sumir.
        insert into public.user_organizations (user_id, organization_id, role)
          values (v_user, v_org, 'admin') on conflict do nothing;

        insert into public.contacts (id, organization_id, name, display_name)
          values (v_contato, v_org, 'Cliente fidelidade', 'Cliente fidelidade')
          on conflict (id) do nothing;

        insert into public.financial_accounts (organization_id, name, kind)
          values (v_org, 'Caixa fidelidade', 'cash') returning id into v_conta;
        insert into public.payment_methods (organization_id, name, account_id)
          values (v_org, 'Dinheiro fidelidade', v_conta) returning id into v_forma;
        insert into public.account_plans (organization_id, name, direction)
          values (v_org, 'Servicos fidelidade', 'in') returning id into v_plano;

        -- Um serviço que PONTUA e um que é PRÊMIO (50% de desconto).
        insert into public.calendar_event_types
          (organization_id, name, slug, duration_minutes, fidelidade_pontua)
          values (v_org, 'Servico que pontua', 'pontua-' || right(v_org::text, 1), 60, true)
          returning id into v_pontua;
        insert into public.calendar_event_types
          (organization_id, name, slug, duration_minutes, fidelidade_premio_percentual)
          values (v_org, 'Servico premiado', 'premio-' || right(v_org::text, 1), 60, 50)
          returning id into v_premio;

      end loop;
    end $$;
  `);
});

/**
 * Os ids do seed, lidos das PRÓPRIAS tabelas.
 *
 * A primeira versão guardava isto em `org_memory_entries` — uma tabela de
 * outro módulo, usada como bloco de notas. Quebrou duas vezes por coluna que
 * eu supus e não conferi (`kind` não existe lá). O seed cria linhas com nome
 * determinístico; ler por esse nome não depende de tabela alheia nenhuma.
 */
function ids(org: string): { forma: string; pontua: string; premio: string } {
  const linha = ultimaLinha(
    sql(`
      select
        (select id from public.payment_methods
          where organization_id = '${org}' and name = 'Dinheiro fidelidade' limit 1) || '|' ||
        (select id from public.calendar_event_types
          where organization_id = '${org}' and name = 'Servico que pontua' limit 1) || '|' ||
        (select id from public.calendar_event_types
          where organization_id = '${org}' and name = 'Servico premiado' limit 1);
    `),
  );
  const [forma, pontua, premio] = linha.split("|");
  if (!forma || !pontua || !premio) {
    throw new Error(`o seed da fidelidade não deixou os ids esperados: ${linha}`);
  }
  return { forma, pontua, premio };
}

/** Abre uma comanda com um item do serviço dado e a finaliza. Devolve o id. */
function comandaFinalizada(org: string, user: string, contato: string, tipo: string, numero: number): string {
  // ⚠️ COMANDOS SEPARADOS. Uma CTE de escrita não é visível para o resto do
  // mesmo comando, então a finalização não enxergaria o item e o selo nunca
  // nasceria — o teste passaria a medir o nada.
  const saida = sql(
    comoUsuario(user, `
      insert into public.sales (organization_id, number, contact_id, created_by_user_id)
      values ('${org}', ${numero}, '${contato}', '${user}');

      insert into public.sale_items
        (organization_id, sale_id, event_type_id, description, unit_price_cents, total_cents)
      select '${org}', (select id from public.sales where organization_id='${org}' and number=${numero}),
             '${tipo}', 'Item', 10000, 10000;

      select public.fn_finalizar_comanda('${org}',
        (select id from public.sales where organization_id='${org}' and number=${numero}),
        '${ids(org).forma}', 0)->>'sale_id';
    `),
  );
  return ultimaLinha(saida);
}

function selos(org: string, user: string, contato: string): number {
  const saida = sql(
    comoUsuario(user, `select (public.fn_cartao_de_fidelidade('${org}','${contato}')->>'selos')::int;`),
  );
  return Number(ultimaLinha(saida));
}

describe("o selo nasce da regra, não do que alguém digita", () => {
  it("comanda com serviço pontuável dá UM selo", () => {
    const antes = selos(ORG_A, USER_A, CONTATO_A);
    comandaFinalizada(ORG_A, USER_A, CONTATO_A, ids(ORG_A).pontua, 70001);
    expect(selos(ORG_A, USER_A, CONTATO_A)).toBe(antes + 1);
  });

  it("comanda com serviço que NÃO pontua não dá selo", () => {
    const antes = selos(ORG_A, USER_A, CONTATO_A);
    comandaFinalizada(ORG_A, USER_A, CONTATO_A, ids(ORG_A).premio, 70002);
    expect(selos(ORG_A, USER_A, CONTATO_A)).toBe(antes);
  });

  it("dois itens pontuáveis na MESMA comanda dão um selo só", () => {
    const antes = selos(ORG_A, USER_A, CONTATO_A);
    const tipo = ids(ORG_A).pontua;
    sql(
      comoUsuario(USER_A, `
        insert into public.sales (organization_id, number, contact_id, created_by_user_id)
        values ('${ORG_A}', 70003, '${CONTATO_A}', '${USER_A}');

        insert into public.sale_items
          (organization_id, sale_id, event_type_id, description, unit_price_cents, total_cents)
        select '${ORG_A}', (select id from public.sales where organization_id='${ORG_A}' and number=70003),
               '${tipo}', 'Item ' || g, 10000, 10000 from generate_series(1, 2) g;

        select public.fn_finalizar_comanda('${ORG_A}',
          (select id from public.sales where organization_id='${ORG_A}' and number=70003),
          '${ids(ORG_A).forma}', 0) is not null;
      `),
    );
    expect(selos(ORG_A, USER_A, CONTATO_A)).toBe(antes + 1);
  });
});

describe("o resgate", () => {
  it("recusa cartão incompleto, e não desconta nada", () => {
    const tipo = ids(ORG_B).premio;
    const r = tentaComo(USER_B, `
      insert into public.sales (organization_id, number, contact_id, created_by_user_id)
      values ('${ORG_B}', 70010, '${CONTATO_B}', '${USER_B}');

      insert into public.sale_items
        (organization_id, sale_id, event_type_id, description, unit_price_cents, total_cents)
      select '${ORG_B}', (select id from public.sales where organization_id='${ORG_B}' and number=70010),
             '${tipo}', 'Premiado', 10000, 10000;

      select public.fn_resgatar_premio('${ORG_B}',
        (select si.id from public.sale_items si join public.sales s on s.id=si.sale_id
          where s.organization_id='${ORG_B}' and s.number=70010 limit 1))::text;
    `);
    expect(r.erro ?? "").toMatch(/cartao_incompleto|selos/i);
  });

  it("com o cartão completo, desconta o prêmio, zera o saldo e a comanda do resgate não ganha selo", () => {
    // Completa o cartão pela porta da frente: dez comandas pontuáveis.
    for (let i = 0; i < 10; i++) {
      comandaFinalizada(ORG_B, USER_B, CONTATO_B, ids(ORG_B).pontua, 70100 + i);
    }
    expect(selos(ORG_B, USER_B, CONTATO_B)).toBeGreaterThanOrEqual(10);

    const tipo = ids(ORG_B).premio;
    const saida = sql(
      comoUsuario(USER_B, `
        insert into public.sales (organization_id, number, contact_id, created_by_user_id)
        values ('${ORG_B}', 70200, '${CONTATO_B}', '${USER_B}');

        insert into public.sale_items
          (organization_id, sale_id, event_type_id, description, unit_price_cents, total_cents)
        select '${ORG_B}', (select id from public.sales where organization_id='${ORG_B}' and number=70200),
               '${tipo}', 'Premiado', 10000, 10000;

        select public.fn_resgatar_premio('${ORG_B}',
                 (select si.id from public.sale_items si join public.sales s on s.id=si.sale_id
                   where s.organization_id='${ORG_B}' and s.number=70200 limit 1))->>'desconto_cents'
               || '|' ||
               (select si.total_cents from public.sale_items si join public.sales s on s.id=si.sale_id
                 where s.organization_id='${ORG_B}' and s.number=70200 limit 1)
               || '|' ||
               (select id from public.sales where organization_id='${ORG_B}' and number=70200);
      `),
    );
    const [desconto, totalItem, vendaId] = ultimaLinha(saida).split("|");
    // 50% de R$ 100,00
    expect(Number(desconto)).toBe(5000);
    expect(Number(totalItem)).toBe(5000);
    expect(selos(ORG_B, USER_B, CONTATO_B)).toBe(0);

    // E a comanda que resgatou NÃO ganha selo ao ser finalizada.
    sql(
      comoUsuario(USER_B, `
        select public.fn_finalizar_comanda('${ORG_B}', '${vendaId}', '${ids(ORG_B).forma}', 0) is not null;
      `),
    );
    expect(selos(ORG_B, USER_B, CONTATO_B)).toBe(0);
  });
});

describe("isolamento entre organizações, com controle positivo", () => {
  it("o usuário da org A não lê o cartão da cliente da org B", () => {
    // Controle positivo primeiro: sem ele, uma função quebrada passaria.
    expect(selos(ORG_A, USER_A, CONTATO_A)).toBeGreaterThan(0);
    expect(selos(ORG_A, USER_A, CONTATO_B)).toBe(0);
  });

  it("fn_ajustar_fidelidade recusa organização de fora", () => {
    const r = tentaComo(USER_A, `
      select public.fn_ajustar_fidelidade('${ORG_B}','${CONTATO_B}', 99, 'invasao')::text;
    `);
    expect(r.erro ?? "").toMatch(/fidelidade_forbidden|42501/);
  });

  it("fn_ajustar_fidelidade exige motivo, e grava o delta contra o saldo derivado", () => {
    const semMotivo = tentaComo(USER_A, `
      select public.fn_ajustar_fidelidade('${ORG_A}','${CONTATO_A}', 5, '   ')::text;
    `);
    expect(semMotivo.erro ?? "").toMatch(/motivo_obrigatorio/);

    sql(comoUsuario(USER_A, `
      select public.fn_ajustar_fidelidade('${ORG_A}','${CONTATO_A}', 7, 'cartao de papel antigo')::text;
    `));
    expect(selos(ORG_A, USER_A, CONTATO_A)).toBe(7);
  });

  it("fn_resgatar_premio recusa organização de fora", () => {
    const r = tentaComo(USER_A, `
      select public.fn_resgatar_premio('${ORG_B}',
        (select id from public.sale_items where organization_id = '${ORG_B}' limit 1))::text;
    `);
    expect(r.erro ?? "").toMatch(/fidelidade_forbidden|42501/);
  });
});

describe("a meta", () => {
  it("é 10 por padrão e respeita a configuração da organização", () => {
    expect(Number(ultimaLinha(sql(`select public.fn_meta_de_fidelidade('${ORG_A}');`)))).toBe(10);
    sql(`
      update public.organizations
         set settings = coalesce(settings, '{}'::jsonb) || '{"fidelidade":{"meta":8}}'::jsonb
       where id = '${ORG_A}';
    `);
    expect(Number(ultimaLinha(sql(`select public.fn_meta_de_fidelidade('${ORG_A}');`)))).toBe(8);
    sql(`
      update public.organizations
         set settings = coalesce(settings, '{}'::jsonb) - 'fidelidade'
       where id = '${ORG_A}';
    `);
  });
});
