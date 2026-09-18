-- 9012 — as funções do módulo passam para o eixo da profissional, e o
-- fechamento de comissão ganha corpo. Depende da 9011.
--
-- Três mudanças, e as duas primeiras consertam defeito além de trocar eixo:
--
-- 1. `fn_finalizar_comanda` só gera comissão com percentual > 0. Sem isso
--    nasce comissão de R$ 0,00 que entra na lista "em aberto", entra na conta
--    do fechamento e faz o lançamento ser recusado pelo CHECK `amount_cents >
--    0` — ou seja, UMA profissional sem regra travaria o fechamento do mês
--    inteiro. O legado tinha essa condição; o fork não tinha.
--
-- 2. `fn_relatorio_financeiro` deixa de somar comanda ESTORNADA pelo valor
--    cheio. Hoje o CTE base filtra só por `finalized_at` e a estornada entra
--    inteira em `faturado_cents`, `ticket_medio_cents`, `por_forma`,
--    `por_servico` e `por_cliente` — só o contador `comandas_estornadas` sabe
--    dela. Medido em 17/09/2026 na base do Studio: 6 comandas, R$ 322,00.
--    O número do Faturamento CAI esse valor, e isso é correção, não perda.
--    O contador de estornadas continua contando, porque agora há dois CTEs.
--
-- 3. `fn_fechar_comissoes` passa a existir.

-- ─── 1. a finalização, no eixo novo ──────────────────────────────────────────
-- Só o laço da comissão muda; o resto do corpo é o que já estava lá.
create or replace function public.fn_finalizar_comanda(
  p_org uuid,
  p_sale uuid,
  p_payment_method uuid,
  p_loyalty_points integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale       public.sales%rowtype;
  v_conta      uuid;
  v_plano      uuid;
  v_total      bigint;
  v_item       record;
  v_entry      uuid;
begin
  if auth.uid() is null or not public.fn_role_at_least(p_org, 'agent') then
    raise exception 'comanda_forbidden' using errcode = '42501';
  end if;

  select * into v_sale from public.sales
   where id = p_sale and organization_id = p_org
   for update;

  if not found then
    raise exception 'comanda_nao_encontrada' using errcode = 'P0002';
  end if;
  if v_sale.status = 'finalized' then
    return jsonb_build_object('sale_id', p_sale, 'ja_finalizada', true);
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'comanda_cancelada' using errcode = '22023';
  end if;

  select account_id into v_conta from public.payment_methods
   where id = p_payment_method and organization_id = p_org;
  if not found then
    raise exception 'forma_de_pagamento_invalida' using errcode = '22023';
  end if;
  if v_conta is null then
    raise exception 'forma_sem_conta'
      using errcode = '22023',
            hint = 'Esta forma de pagamento não diz para qual conta o dinheiro vai. Configure a conta dela em Configurações › Financeiro.';
  end if;

  select coalesce(sum(total_cents), 0) into v_total
    from public.sale_items where sale_id = p_sale;
  v_total := greatest(v_total - coalesce(v_sale.discount_cents, 0), 0);

  -- (1) a venda
  update public.sales
     set status = 'finalized',
         finalized_at = now(),
         payment_method_id = p_payment_method,
         total_cents = v_total
   where id = p_sale;

  -- (2) a comissão por item, com o percentual CONGELADO na inclusão
  --
  -- `commission_percent > 0` é condição, não detalhe: comissão de zero é uma
  -- linha que não paga ninguém e que, somada num fechamento, gera lançamento
  -- de R$ 0,00 — recusado pelo CHECK de `financial_entries`.
  for v_item in
    select * from public.sale_items
     where sale_id = p_sale
       and professional_id is not null
       and coalesce(commission_percent, 0) > 0
  loop
    insert into public.commissions
      (organization_id, sale_item_id, professional_id, percent, amount_cents)
    values (
      p_org, v_item.id, v_item.professional_id, v_item.commission_percent,
      -- Sobre o item, NUNCA sobre o desconto da comanda: um desconto de caixa
      -- não pode reduzir o que quem atendeu combinou.
      floor(v_item.total_cents * v_item.commission_percent / 100.0)
    )
    on conflict (sale_item_id) do nothing;
  end loop;

  -- (3) a entrada na conta que a FORMA DE PAGAMENTO determina
  select id into v_plano from public.account_plans
   where organization_id = p_org and direction = 'in' and is_active
   order by created_at limit 1;

  insert into public.financial_entries
    (organization_id, account_id, account_plan_id, sale_id, direction, amount_cents,
     currency, description, status, paid_at, origin, created_by_user_id)
  values (
    p_org, v_conta, v_plano, p_sale, 'in', greatest(v_total, 1),
    v_sale.currency, format('Comanda #%s', v_sale.number), 'paid', now(), 'sale', auth.uid()
  )
  returning id into v_entry;

  -- (4) o ponto de fidelidade, idempotente pela chave da comanda
  if p_loyalty_points > 0 and v_sale.contact_id is not null then
    insert into public.loyalty_ledger
      (organization_id, contact_id, points, reason, sale_id, idempotency_key, created_by_user_id)
    values (
      p_org, v_sale.contact_id, p_loyalty_points, 'Comanda finalizada', p_sale,
      format('sale:%s', p_sale), auth.uid()
    )
    on conflict do nothing;
  end if;

  -- (5) o agendamento conclui — e SÓ se ainda estiver de pé.
  if v_sale.appointment_id is not null then
    update public.calendar_appointments
       set status = 'completed', outcome_recorded_at = now()
     where id = v_sale.appointment_id
       and organization_id = p_org
       -- A guarda que o sistema de origem não tinha em todos os caminhos:
       -- cancelado e faltou são desfechos DECIDIDOS, e faturar não os desfaz.
       and status not in ('cancelled', 'no_show');
  end if;

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'number', v_sale.number,
    'total_cents', v_total,
    'entry_id', v_entry
  );
end $$;

revoke execute on function public.fn_finalizar_comanda(uuid, uuid, uuid, integer) from public, anon;
grant  execute on function public.fn_finalizar_comanda(uuid, uuid, uuid, integer) to authenticated;

-- ─── 2. o relatório: profissional com nome, e estornada fora das somas ───────
create or replace function public.fn_relatorio_financeiro(
  p_org uuid,
  p_de date,
  p_ate date
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with lancamentos as (
    select direction, amount_cents
      from public.financial_entries
     where organization_id = p_org
       and status = 'paid'
       and entry_date between p_de and p_ate
  ),
  -- TODAS as finalizadas do período, estornadas inclusive. Serve a UMA coisa:
  -- contar quantas foram estornadas. Nenhuma soma sai daqui.
  comandas_todas as (
    select id, status, total_cents, reversed_at, payment_method_id, contact_id
      from public.sales
     where organization_id = p_org
       and finalized_at is not null
       and finalized_at::date between p_de and p_ate
  ),
  -- O que de fato valeu. Toda soma de dinheiro sai DAQUI.
  comandas as (
    select * from comandas_todas where reversed_at is null
  ),
  por_forma as (
    select coalesce(pm.name, 'Sem forma') as nome,
           count(*)                       as quantidade,
           sum(c.total_cents)             as total_cents
      from comandas c
      left join public.payment_methods pm
        on pm.id = c.payment_method_id and pm.organization_id = p_org
     group by 1
  ),
  por_profissional as (
    -- O nome vem do banco, e é uma mudança deliberada: `professionals` é
    -- tabela DESTE módulo, tenant-scoped, e a função é `stable`/invoker, então
    -- a RLS continua valendo. Sem o join, cada consumidor faria seu próprio
    -- mapa de id → nome, e a profissional não está em nenhuma rota de equipe
    -- (ela não é usuária do sistema).
    select co.professional_id,
           p.name                                                    as nome,
           count(*)                                                  as itens,
           sum(co.amount_cents)                                      as comissao_cents,
           sum(co.amount_cents) filter (where co.status = 'pending') as pendente_cents,
           sum(co.amount_cents) filter (where co.status = 'paid')    as pago_cents
      from public.commissions co
      join public.sale_items si
        on si.id = co.sale_item_id and si.organization_id = p_org
      join comandas s on s.id = si.sale_id
      left join public.professionals p
        on p.id = co.professional_id and p.organization_id = p_org
     where co.organization_id = p_org
       and co.status <> 'reversed'
     group by 1, 2
  ),
  por_servico as (
    -- Agrupa pela DESCRIÇÃO congelada no item, e não pelo nome atual do tipo de
    -- evento. É o que o cliente comprou, com o nome que tinha na hora — e é o
    -- único agrupamento que continua verdadeiro depois de alguém renomear um
    -- serviço. O item avulso (sem `event_type_id`) entra por aqui também, em vez
    -- de sumir do relatório.
    select si.description       as nome,
           sum(si.quantity)     as quantidade,
           sum(si.total_cents)  as total_cents
      from public.sale_items si
      join comandas s on s.id = si.sale_id
     where si.organization_id = p_org
     group by 1
  ),
  por_cliente as (
    select c.contact_id,
           count(*)             as comandas,
           sum(c.total_cents)   as total_cents
      from comandas c
     where c.contact_id is not null
     group by 1
  )
  select jsonb_build_object(
    'de', p_de,
    'ate', p_ate,
    'entradas_cents', coalesce((select sum(amount_cents) from lancamentos where direction = 'in'), 0),
    'saidas_cents',   coalesce((select sum(amount_cents) from lancamentos where direction = 'out'), 0),
    'saldo_cents',    coalesce((select sum(case when direction = 'in' then amount_cents else -amount_cents end) from lancamentos), 0),
    'comandas_finalizadas', (select count(*) from comandas),
    'comandas_estornadas',  (select count(*) from comandas_todas where reversed_at is not null),
    'faturado_cents',       coalesce((select sum(total_cents) from comandas), 0),
    'ticket_medio_cents',   coalesce((select sum(total_cents) / nullif(count(*), 0) from comandas), 0),
    'por_forma', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome, 'quantidade', quantidade, 'total_cents', total_cents)
             order by total_cents desc)
        from por_forma
    ), '[]'::jsonb),
    'por_profissional', coalesce((
      select jsonb_agg(jsonb_build_object(
               'professional_id', professional_id,
               'nome', coalesce(nome, 'Sem profissional'),
               'itens', itens,
               'comissao_cents', comissao_cents,
               'pendente_cents', coalesce(pendente_cents, 0),
               'pago_cents', coalesce(pago_cents, 0))
             order by comissao_cents desc)
        from por_profissional
    ), '[]'::jsonb),
    'por_servico', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome, 'quantidade', quantidade, 'total_cents', total_cents)
             order by total_cents desc)
        from (select * from por_servico order by total_cents desc limit 10) t
    ), '[]'::jsonb),
    'por_cliente', coalesce((
      select jsonb_agg(jsonb_build_object('contact_id', contact_id, 'comandas', comandas, 'total_cents', total_cents)
             order by total_cents desc)
        from (select * from por_cliente order by total_cents desc limit 10) t
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.fn_relatorio_financeiro(uuid, date, date) from public, anon;
grant  execute on function public.fn_relatorio_financeiro(uuid, date, date) to authenticated;

-- ─── 3. o fechamento ─────────────────────────────────────────────────────────
--
-- Paga de uma vez as comissões pendentes de UMA profissional num período,
-- criando o lançamento de saída que as representa.
--
-- ⚠️ `security definer` COM a organização por argumento é a forma que abriu o
-- vazamento que a 9010 fechou. Por isso a checagem de papel é a primeira coisa
-- do corpo, e há caso de teste que chama com org de fora.
create or replace function public.fn_fechar_comissoes(
  p_org uuid,
  p_professional uuid,
  p_de date,
  p_ate date,
  p_account uuid,
  p_account_plan uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_qtd   integer;
  v_entry uuid;
  v_nome  text;
  v_plano uuid;
  v_pago  bigint;
  v_marcadas integer;
begin
  if auth.uid() is null or not public.fn_role_at_least(p_org, 'manager') then
    raise exception 'comissao_forbidden' using errcode = '42501';
  end if;
  if p_ate < p_de then
    raise exception 'periodo_invalido' using errcode = '22023';
  end if;

  -- Por ORG e profissional: travar só pelo profissional serializaria tenants
  -- diferentes sem motivo.
  perform pg_advisory_xact_lock(hashtext(p_org::text || ':' || p_professional::text));

  select name into v_nome from public.professionals
   where id = p_professional and organization_id = p_org;
  if not found then
    raise exception 'profissional_nao_encontrada' using errcode = 'P0002';
  end if;

  -- A conta de saída é escolha de quem paga, e precisa ser desta organização:
  -- `security definer` não pode aceitar conta de fora por argumento.
  if not exists (
    select 1 from public.financial_accounts
     where id = p_account and organization_id = p_org and is_active
  ) then
    raise exception 'conta_invalida' using errcode = '22023';
  end if;

  -- ⚠️ SEM TEMP TABLE. A primeira versão usava `create temp table … on commit
  -- drop`, e duas chamadas na MESMA transação quebravam com "relation already
  -- exists" — mascarando a recusa correta com um erro de infraestrutura.
  -- Medido em 17/09/2026. A doutrina de migrations do repo já proíbe temp
  -- table por razão irmã; aqui o predicado é escrito uma vez e reusado.
  select coalesce(sum(c.amount_cents), 0), count(*)
    into v_total, v_qtd
    from public.commissions c
    join public.sale_items si on si.id = c.sale_item_id
    join public.sales s on s.id = si.sale_id
   where c.organization_id = p_org
     and c.professional_id = p_professional
     and c.status = 'pending'
     and c.paid_entry_id is null
     and c.amount_cents > 0
     and s.finalized_at is not null
     and s.finalized_at::date between p_de and p_ate
     -- Dupla guarda: o estorno da comanda já marca a comissão como `reversed`,
     -- mas estorno e fechamento travam coisas diferentes e podem se cruzar.
     and s.reversed_at is null;

  -- Não devolver "ok, já estava fechado": mascararia o caso de quem achou que
  -- estava fechando comissão nova. O legado erra explicitamente, e é o certo.
  if v_qtd = 0 then
    raise exception 'NENHUM_ITEM_PENDENTE' using errcode = 'P0001';
  end if;

  select id into v_plano from public.account_plans
   where organization_id = p_org and direction = 'out' and is_active
     and (p_account_plan is null or id = p_account_plan)
   order by (id = p_account_plan) desc, created_at limit 1;

  insert into public.financial_entries
    (organization_id, account_id, account_plan_id, direction, amount_cents,
     description, status, paid_at, origin, created_by_user_id)
  values (
    p_org, p_account, v_plano, 'out', v_total,
    format('Comissão de %s · %s a %s', v_nome, to_char(p_de, 'DD/MM/YYYY'), to_char(p_ate, 'DD/MM/YYYY')),
    'paid', now(), 'commission', auth.uid()
  )
  returning id into v_entry;

  -- O MESMO predicado. O advisory lock acima serializa por profissional, e
  -- `paid_entry_id is null` impede marcar duas vezes; ainda assim o resultado
  -- é conferido, porque um lançamento cujo valor não corresponde às linhas que
  -- ele paga é pior que um erro.
  with pagas as (
    update public.commissions c
       set status = 'paid', paid_at = now(), paid_entry_id = v_entry
      from public.sale_items si, public.sales s
     where si.id = c.sale_item_id
       and s.id = si.sale_id
       and c.organization_id = p_org
       and c.professional_id = p_professional
       and c.status = 'pending'
       and c.paid_entry_id is null
       and c.amount_cents > 0
       and s.finalized_at is not null
       and s.finalized_at::date between p_de and p_ate
       and s.reversed_at is null
    returning c.amount_cents
  )
  select coalesce(sum(amount_cents), 0), count(*) into v_pago, v_marcadas from pagas;

  if v_marcadas <> v_qtd or v_pago <> v_total then
    raise exception 'fechamento_inconsistente'
      using errcode = 'P0001',
            message = format('O lançamento somaria %s em %s comissões, mas %s linhas de %s foram marcadas. Nada foi pago.',
                             v_total, v_qtd, v_marcadas, v_pago);
  end if;

  return jsonb_build_object('entry_id', v_entry, 'itens', v_qtd, 'total_cents', v_total);
end $$;

revoke execute on function public.fn_fechar_comissoes(uuid, uuid, date, date, uuid, uuid) from public, anon;
grant  execute on function public.fn_fechar_comissoes(uuid, uuid, date, date, uuid, uuid) to authenticated;

comment on function public.fn_fechar_comissoes(uuid, uuid, date, date, uuid, uuid) is
  'Fecha as comissões pendentes de uma profissional num período: cria UM lançamento de saída e marca as comissões com paid_entry_id. Não existe tabela de fechamento — o lançamento é o fechamento.';
