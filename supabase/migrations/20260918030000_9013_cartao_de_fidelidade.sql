-- 9013 — o CARTÃO de fidelidade, como o sistema anterior tinha.
--
-- Até aqui o fork só tinha um livro de pontos: quem finalizava a comanda
-- DIGITAVA quantos pontos dar. Não havia meta, serviço pontuável, prêmio nem
-- resgate — o saldo existia e não valia nada.
--
-- O sistema anterior tem a regra inteira, e é ela que vale (decisão do dono,
-- 17/09/2026): a cada comanda com ao menos um serviço pontuável a cliente
-- ganha UM selo; ao completar a meta (padrão 10) fica elegível a um prêmio,
-- que é um desconto percentual num serviço; o resgate acontece dentro de uma
-- comanda aberta e zera o cartão.
--
-- O que NÃO vem, e por quê:
--   • "resgate avulso" (zerar fora de comanda) existia só como capacidade do
--     robô de WhatsApp do sistema anterior, que sai de cena.
--   • pontos retroativos do histórico da Belasis — o próprio cartão digital
--     nasceu sem eles.
--
-- Efeito colateral herdado e ACEITO: o item premiado gera comissão menor,
-- porque a comissão incide sobre o valor já descontado.

-- ─── 1. o serviço diz se pontua e qual prêmio dá ─────────────────────────────
-- Mesmo caminho que `default_price_cents` (9009) abriu: o catálogo de serviços
-- deste produto JÁ é `calendar_event_types`.
alter table public.calendar_event_types
  add column if not exists fidelidade_pontua boolean not null default false;
alter table public.calendar_event_types
  add column if not exists fidelidade_premio_percentual numeric(5, 2)
  check (fidelidade_premio_percentual is null
         or (fidelidade_premio_percentual > 0 and fidelidade_premio_percentual <= 100));

comment on column public.calendar_event_types.fidelidade_pontua is
  'Se uma comanda com este serviço gera selo. Reparo, remoção e curso não pontuam.';
comment on column public.calendar_event_types.fidelidade_premio_percentual is
  'Desconto percentual quando este serviço é resgatado como prêmio. Nulo = não é prêmio.';

-- ─── 2. a meta ───────────────────────────────────────────────────────────────
-- Configurável, com 10 de padrão. No sistema anterior era constante em código,
-- e mudar para 8 exigiria deploy.
create or replace function public.fn_meta_de_fidelidade(p_org uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select greatest(
    coalesce(
      nullif((select settings->'fidelidade'->>'meta' from public.organizations where id = p_org), '')::integer,
      10
    ),
    1
  );
$$;

revoke execute on function public.fn_meta_de_fidelidade(uuid) from public, anon;
grant  execute on function public.fn_meta_de_fidelidade(uuid) to authenticated;

-- ─── 3. um selo por comanda, e um resgate por comanda ────────────────────────
-- Índices únicos PARCIAIS, como no sistema anterior: a garantia é do schema,
-- não da boa intenção de quem chama. `reason` não serve para isso — é texto —,
-- então a marcação entra em coluna própria.
alter table public.loyalty_ledger
  add column if not exists kind text not null default 'ajuste'
  check (kind in ('selo', 'resgate', 'ajuste'));

comment on column public.loyalty_ledger.kind is
  'selo = ganho pela comanda; resgate = uso do cartão completo; ajuste = mão humana (cartão de papel, correção).';

create unique index if not exists loyalty_ledger_um_selo_por_comanda
  on public.loyalty_ledger (organization_id, sale_id) where kind = 'selo' and sale_id is not null;
create unique index if not exists loyalty_ledger_um_resgate_por_comanda
  on public.loyalty_ledger (organization_id, sale_id) where kind = 'resgate' and sale_id is not null;

-- ─── 4. o saldo, e quanto falta ──────────────────────────────────────────────
-- O saldo continua DERIVADO por soma; esta função só o veste com a meta.
create or replace function public.fn_cartao_de_fidelidade(p_org uuid, p_contact uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with saldo as (
    select coalesce(sum(points), 0)::integer as selos
      from public.loyalty_ledger
     where organization_id = p_org and contact_id = p_contact
  ), meta as (
    select public.fn_meta_de_fidelidade(p_org) as m
  )
  select jsonb_build_object(
    'selos', (select selos from saldo),
    'meta',  (select m from meta),
    'completo', (select selos from saldo) >= (select m from meta),
    'faltam', greatest((select m from meta) - (select selos from saldo), 0)
  );
$$;

revoke execute on function public.fn_cartao_de_fidelidade(uuid, uuid) from public, anon;
grant  execute on function public.fn_cartao_de_fidelidade(uuid, uuid) to authenticated;

-- ─── 5. o resgate, dentro de uma comanda aberta ──────────────────────────────
--
-- Aplica o desconto no item premiado e zera o cartão, numa transação só.
-- `security definer` com organização por argumento ⇒ papel conferido na
-- primeira linha (a lição da 9010).
create or replace function public.fn_resgatar_premio(
  p_org uuid,
  p_sale_item uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item    public.sale_items%rowtype;
  v_sale    public.sales%rowtype;
  v_premio  numeric(5, 2);
  v_selos   integer;
  v_meta    integer;
  v_desc    bigint;
begin
  if auth.uid() is null or not public.fn_role_at_least(p_org, 'agent') then
    raise exception 'fidelidade_forbidden' using errcode = '42501';
  end if;

  select * into v_item from public.sale_items
   where id = p_sale_item and organization_id = p_org for update;
  if not found then
    raise exception 'item_nao_encontrado' using errcode = 'P0002';
  end if;

  select * into v_sale from public.sales where id = v_item.sale_id for update;
  if v_sale.status <> 'open' then
    raise exception 'comanda_nao_aberta'
      using errcode = '22023',
            hint = 'O prêmio é resgatado dentro de uma comanda aberta. Depois de finalizada, o item não muda mais.';
  end if;
  if v_sale.contact_id is null then
    raise exception 'comanda_sem_cliente'
      using errcode = '22023',
            hint = 'O cartão é da cliente: sem cliente na comanda não há cartão para resgatar.';
  end if;

  select fidelidade_premio_percentual into v_premio
    from public.calendar_event_types
   where id = v_item.event_type_id and organization_id = p_org;
  if v_premio is null then
    raise exception 'servico_nao_e_premio'
      using errcode = '22023',
            hint = 'Marque o percentual de prêmio deste serviço em Configurações › Agenda.';
  end if;

  v_meta := public.fn_meta_de_fidelidade(p_org);
  select coalesce(sum(points), 0) into v_selos
    from public.loyalty_ledger
   where organization_id = p_org and contact_id = v_sale.contact_id;

  if v_selos < v_meta then
    raise exception 'cartao_incompleto'
      using errcode = 'P0001',
            message = format('O cartão tem %s de %s selos.', v_selos, v_meta);
  end if;

  -- O desconto é sobre o ITEM, nunca sobre `sales.discount_cents`: o gatilho
  -- que recalcula o total da venda soma os itens e ignora aquela coluna — a
  -- armadilha que o sistema anterior documenta.
  v_desc := floor(v_item.total_cents * v_premio / 100.0);
  update public.sale_items
     set discount_cents = discount_cents + v_desc,
         total_cents = greatest(total_cents - v_desc, 0)
   where id = p_sale_item;

  -- Zera o cartão: o movimento é o negativo do saldo INTEIRO, não da meta —
  -- quem juntou 11 selos não perde o 11º por ter resgatado no 10.
  insert into public.loyalty_ledger
    (organization_id, contact_id, sale_id, sale_item_id, points, reason, kind,
     idempotency_key, created_by_user_id)
  values (
    p_org, v_sale.contact_id, v_sale.id, p_sale_item, -v_selos,
    format('Resgate de prêmio · %s%%', trim(to_char(v_premio, 'FM999D99'))), 'resgate',
    format('resgate:%s', v_sale.id), auth.uid()
  );

  return jsonb_build_object('desconto_cents', v_desc, 'selos_usados', v_selos);
end $$;

revoke execute on function public.fn_resgatar_premio(uuid, uuid) from public, anon;
grant  execute on function public.fn_resgatar_premio(uuid, uuid) to authenticated;

-- ─── 6. o ajuste, com justificativa ──────────────────────────────────────────
create or replace function public.fn_ajustar_fidelidade(
  p_org uuid,
  p_contact uuid,
  p_selos integer,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_atual integer;
begin
  if auth.uid() is null or not public.fn_role_at_least(p_org, 'manager') then
    raise exception 'fidelidade_forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'motivo_obrigatorio'
      using errcode = '22023',
            hint = 'Ajuste de cartão sem motivo é saldo que ninguém sabe explicar depois.';
  end if;
  if not exists (select 1 from public.contacts where id = p_contact and organization_id = p_org) then
    raise exception 'contato_nao_encontrado' using errcode = 'P0002';
  end if;

  select coalesce(sum(points), 0) into v_atual
    from public.loyalty_ledger where organization_id = p_org and contact_id = p_contact;

  -- Grava o DELTA até o alvo, porque o saldo é derivado por soma e gravá-lo
  -- direto criaria a segunda fonte do mesmo número.
  insert into public.loyalty_ledger
    (organization_id, contact_id, points, reason, kind, created_by_user_id)
  values (p_org, p_contact, p_selos - v_atual, btrim(p_motivo), 'ajuste', auth.uid());

  return jsonb_build_object('de', v_atual, 'para', p_selos);
end $$;

revoke execute on function public.fn_ajustar_fidelidade(uuid, uuid, integer, text) from public, anon;
grant  execute on function public.fn_ajustar_fidelidade(uuid, uuid, integer, text) to authenticated;

-- ─── 7. o selo nasce da regra, na finalização ────────────────────────────────
create or replace function public.fn_finalizar_comanda(
  p_org uuid,
  p_sale uuid,
  p_payment_method uuid,
  -- ⚠️ IGNORADO desde a 9013. O selo passou a nascer da regra do cartão (um
  -- por comanda com serviço pontuável), e não do que alguém digita no
  -- fechamento. O parâmetro fica na assinatura para não quebrar quem chama;
  -- a tela deixou de enviá-lo.
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

  -- (4) o SELO do cartão: nasce da regra, não do que alguém digitou.
  --
  -- Uma comanda gera NO MÁXIMO um selo, e só se tiver ao menos um item de
  -- serviço marcado como pontuável — reparo, remoção e curso não pontuam. O
  -- índice único parcial `loyalty_ledger_um_selo_por_comanda` é a garantia; o
  -- `on conflict` aqui é a cortesia.
  --
  -- ⚠️ A comanda que RESGATA o prêmio não ganha selo no mesmo lançamento: o
  -- cartão novo começa na próxima. É a regra do sistema anterior, e sem ela o
  -- resgate devolveria um selo de brinde.
  if v_sale.contact_id is not null
     and exists (
       select 1 from public.sale_items si
         join public.calendar_event_types et
           on et.id = si.event_type_id and et.organization_id = p_org
        where si.sale_id = p_sale and et.fidelidade_pontua
     )
     and not exists (
       select 1 from public.loyalty_ledger
        where organization_id = p_org and sale_id = p_sale and kind = 'resgate'
     )
  then
    insert into public.loyalty_ledger
      (organization_id, contact_id, points, reason, kind, sale_id, idempotency_key, created_by_user_id)
    values (
      p_org, v_sale.contact_id, 1, format('Comanda #%s', v_sale.number), 'selo', p_sale,
      format('selo:%s', p_sale), auth.uid()
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

