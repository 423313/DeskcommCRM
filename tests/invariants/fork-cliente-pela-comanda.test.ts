/**
 * A ETIQUETA DE CLIENTE quando quem reconhece é a COMANDA (migration 9014).
 *
 * No núcleo, `contacts.first_service_at` nasce da AGENDA (0262). Neste fork a
 * comanda finalizada também carimba — sem isso, as 536 clientes que vieram do
 * sistema anterior (com compra e sem agendamento nenhum) não seriam cliente
 * para o CRM: sem selo na listagem, fora do filtro de etiqueta e invisíveis
 * para as automações.
 *
 * Três coisas que este arquivo prende, e as três falham MUDAS — nenhuma delas
 * dá erro, todas dão o resultado errado em silêncio:
 *
 *  1. **A data sem a etiqueta não serve.** A coluna decide quem é cliente, mas
 *     é a etiqueta que a listagem filtra e as automações leem. A primeira
 *     versão da 9014 carimbava a data e esquecia a tag: medido, 536 com data e
 *     0 com etiqueta.
 *  2. **A mão humana vence o sistema.** Quem tira a etiqueta de propósito não
 *     a recebe de volta na próxima comanda.
 *  3. **Não reescrever quando nada muda**, senão todo fechamento de comanda
 *     mexe em `updated_at` e o contato vira ruído de realtime.
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
  // O psql ecoa a TAG do comando depois de um `insert ... returning`: a saída
  // termina em "INSERT 0 1", não no uuid. Lido assim, esse texto ia inteiro
  // para o comando seguinte e o banco reclamava de "invalid input syntax for
  // type uuid: INSERT 0 1" — que parece defeito da migration e é defeito da
  // sonda.
  const linhas = saida
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !/^(INSERT|UPDATE|DELETE|SELECT|SET|COPY)\b/.test(l));
  const ultima = linhas[linhas.length - 1];
  if (ultima === undefined) throw new Error("saída vazia do psql");
  return ultima;
}

const ORG = "c11e17e0-0000-4000-8000-00000000000a";
const USER = "c11e17e0-1111-4000-8000-00000000000a";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values ('${USER}', 'etiqueta@invariant.test')
      on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'etiqueta-inv', 'Etiqueta Invariant', 'Etiqueta')
      on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${USER}', '${ORG}', 'manager', now())
      on conflict do nothing;

    insert into public.financial_accounts (organization_id, name, kind)
      select '${ORG}', 'Caixa etiqueta', 'cash'
      where not exists (select 1 from public.financial_accounts
                         where organization_id='${ORG}' and name='Caixa etiqueta');
    insert into public.payment_methods (organization_id, name, account_id)
      select '${ORG}', 'Dinheiro etiqueta',
             (select id from public.financial_accounts where organization_id='${ORG}' limit 1)
      where not exists (select 1 from public.payment_methods
                         where organization_id='${ORG}' and name='Dinheiro etiqueta');
    insert into public.account_plans (organization_id, name, direction)
      select '${ORG}', 'Servicos etiqueta', 'in'
      where not exists (select 1 from public.account_plans
                         where organization_id='${ORG}' and name='Servicos etiqueta');
  `);
});

/** Cria contato novo, comanda com item e finaliza. Devolve o id do contato. */
function clienteNovaComComanda(numero: number): string {
  const contato = ultimaLinha(
    sql(
      comoUsuario(
        USER,
        `insert into public.contacts (organization_id, name, display_name)
         values ('${ORG}', 'Cliente ${numero}', 'Cliente ${numero}') returning id;`,
      ),
    ),
  );
  faturar(contato, numero);
  return contato;
}

/** Abre e finaliza uma comanda para o contato. Comandos SEPARADOS de propósito:
 *  uma CTE de escrita não é visível para o resto do mesmo comando, e a
 *  finalização rodaria sem enxergar o item. */
function faturar(contato: string, numero: number): void {
  sql(
    comoUsuario(
      USER,
      `
      insert into public.sales (organization_id, number, contact_id, created_by_user_id)
      values ('${ORG}', ${numero}, '${contato}', '${USER}');

      insert into public.sale_items
        (organization_id, sale_id, description, unit_price_cents, total_cents)
      select '${ORG}', (select id from public.sales where organization_id='${ORG}' and number=${numero}),
             'Servico', 5000, 5000;

      select public.fn_finalizar_comanda('${ORG}',
        (select id from public.sales where organization_id='${ORG}' and number=${numero}),
        (select id from public.payment_methods where organization_id='${ORG}' limit 1), 0) is not null;
      `,
    ),
  );
}

function estado(contato: string): { data: boolean; etiqueta: boolean; dono: string } {
  const linha = ultimaLinha(
    sql(`
      select (first_service_at is not null) || '|' ||
             (coalesce(tags, '{}'::text[]) @> array['cliente']) || '|' ||
             coalesce(client_tag_by_system, 'nulo')
        from public.contacts where id = '${contato}';
    `),
  );
  const [data, etiqueta, dono] = linha.split("|");
  // "true", e não "t": `boolean || text` passa pela representação de SAÍDA do
  // tipo, que é a palavra inteira — o "t" é o que o psql imprime quando a
  // COLUNA é booleana. Comparar com "t" dava `false` para tudo, e o teste
  // acusava a migration de não carimbar o que ela tinha carimbado.
  return { data: data === "true", etiqueta: etiqueta === "true", dono: dono ?? "nulo" };
}

describe("a comanda reconhece a cliente", () => {
  it("dá a DATA e a ETIQUETA, e marca que a etiqueta é do sistema", () => {
    const e = estado(clienteNovaComComanda(9301));
    expect(e.data, "first_service_at não foi carimbado").toBe(true);
    // Sem esta, a cliente some do filtro e das automações, e o defeito é mudo.
    expect(e.etiqueta, "a etiqueta cliente não foi aplicada").toBe(true);
    // Sem dono, o sistema não sabe que a etiqueta é dele e não pode retirá-la.
    expect(e.dono, "a etiqueta ficou sem dono").toBe("added");
  });

  it("se a equipe tira a etiqueta, o sistema NÃO a repõe", () => {
    const contato = clienteNovaComComanda(9302);
    expect(estado(contato).etiqueta).toBe(true);

    // A mão humana: tira a etiqueta e assume a autoria (dono volta a nulo).
    sql(`
      update public.contacts
         set tags = array_remove(tags, 'cliente'), client_tag_by_system = null
       where id = '${contato}';
    `);

    faturar(contato, 9303);

    expect(
      estado(contato).etiqueta,
      "o sistema repôs a etiqueta que a equipe tinha tirado de propósito",
    ).toBe(false);
  });

  it("quando nada muda, devolve 'igual' e não escreve", () => {
    const contato = clienteNovaComComanda(9304);
    const antes = ultimaLinha(sql(`select updated_at from public.contacts where id = '${contato}';`));

    const r = ultimaLinha(sql(`select public.fn_cliente_pela_comanda('${ORG}', '${contato}');`));
    expect(r).toBe("igual");

    const depois = ultimaLinha(sql(`select updated_at from public.contacts where id = '${contato}';`));
    expect(depois, "escreveu sem precisar — o contato vira ruído de realtime").toBe(antes);
  });

  it("contato anonimizado não recebe etiqueta nova", () => {
    const contato = ultimaLinha(
      sql(
        comoUsuario(
          USER,
          `insert into public.contacts (organization_id, name, display_name, is_anonymized, anonymized_at)
           values ('${ORG}', 'Cliente Anonimizado #99', 'Cliente Anonimizado #99', true, now())
           returning id;`,
        ),
      ),
    );
    const r = ultimaLinha(sql(`select public.fn_cliente_pela_comanda('${ORG}', '${contato}');`));
    // A LGPD apagou a pessoa; reetiquetá-la a traria de volta como cliente.
    expect(r).toBe("ignorado");
    expect(estado(contato).etiqueta).toBe(false);
  });
});
