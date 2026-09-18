-- 9014 — a FICHA DA CLIENTE, e o carimbo que faltava para ela existir.
--
-- ## O conflito que esta migration resolve
--
-- O produto já tem uma definição de "cliente": `contacts.first_service_at`,
-- carimbada pelos gatilhos de AGENDAMENTO (0262). Este fork trouxe 4.766
-- comandas do sistema anterior, e nenhuma delas tem agendamento — foram
-- importadas como venda, não como horário marcado.
--
-- Resultado medido em 17/09/2026 na base do Studio: **536 contatos com comanda,
-- ZERO com `first_service_at`**. A ficha diria "23 visitas · R$ 4.180" numa
-- pessoa que, para o resto do CRM, nunca foi cliente: sem selo na listagem,
-- "Cliente desde" vazio, fora do filtro de etiqueta e invisível para as
-- automações. Duas verdades sobre a mesma pessoa, na mesma tela.
--
-- Por decisão do dono (17/09/2026): **a comanda finalizada também faz cliente.**
--
-- ## A régua de VISITA, e por que não é "dias distintos"
--
-- Visita = UMA COMANDA finalizada e não estornada. É a régua do sistema
-- anterior. Contar dias distintos seria defensável, e foi recusado com número:
-- mudaria o total de 84 das 536 clientes (15,7%), até 5 visitas a menos, e a
-- Mariana conhece esses números de cinco anos de uso. Um indicador que
-- contradiz a memória de quem opera é um indicador que ninguém usa.

-- ─── 1. o grant que a ficha precisa ──────────────────────────────────────────
--
-- `fn_situacao_conta_como_atendimento` é a régua canônica de "este agendamento
-- conta" (0262), e hoje está revogada até de `authenticated` — só `postgres` e
-- `service_role` a executam. A ficha roda na sessão da pessoa, então sem este
-- grant ela morre com 42501 no primeiro clique.
--
-- A alternativa seria copiar `status not in ('cancelled','no_show')` para
-- dentro da função do fork, criando a SEGUNDA CÓPIA da régua que a 0262 existe
-- para evitar. A função é `immutable` e pura: recebe um texto, devolve um
-- booleano, não toca em linha nenhuma e não vaza nada.
grant execute on function public.fn_situacao_conta_como_atendimento(text) to authenticated;

-- ─── 2. a comanda finalizada também carimba `first_service_at` ───────────────
--
-- Espelha `fn_recalcular_cliente_do_contato` (0262) no que importa: trava o
-- contato ANTES de ler, não escreve se não mudou, e não toca em anonimizado
-- nem em mesclado. Não reusa aquela função porque ela lê a AGENDA para achar
-- o primeiro atendimento — aqui a fonte é a comanda.
create or replace function public.fn_cliente_pela_comanda(p_org uuid, p_contact uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c_etiqueta constant text := 'cliente';
  v_antes      timestamptz;
  v_primeira   timestamptz;
  v_tags       text[];
  v_novas      text[];
  v_reconhecido timestamptz;
  v_dono       text;
  v_tem        boolean;
  v_resultado  text := 'carimbado';
begin
  if p_contact is null then return 'sem_contato'; end if;

  -- TRAVA ANTES DE LER, pela mesma razão da 0262: em READ COMMITTED, duas
  -- finalizações simultâneas do mesmo contato gravariam um min() velho por
  -- cima do certo. `for no key update` (e não `for update`) para não brigar
  -- com o `for key share` que a FK de toda tabela que aponta para `contacts`
  -- toma num INSERT — com `for update` aquilo fechava deadlock.
  select first_service_at, coalesce(tags, '{}'::text[]), client_recognized_at, client_tag_by_system
    into v_antes, v_tags, v_reconhecido, v_dono
    from public.contacts
   where id = p_contact and organization_id = p_org
     and not coalesce(is_anonymized, false)
     and is_merged_into is null
   for no key update;
  if not found then return 'ignorado'; end if;

  select min(finalized_at) into v_primeira
    from public.sales
   where organization_id = p_org and contact_id = p_contact
     and status = 'finalized' and finalized_at is not null and reversed_at is null;

  if v_primeira is null then return 'sem_comanda'; end if;

  -- `least` porque a agenda pode ter carimbado uma data anterior: quem é
  -- cliente desde 2021 não vira "cliente desde 2026" por causa da ordem em que
  -- as duas fontes chegaram.
  v_primeira := least(v_primeira, coalesce(v_antes, v_primeira));

  -- ⚠️ NÃO sair aqui só porque a data não mudou. Data certa com etiqueta
  -- faltando é um estado real — foi o que sobrou do primeiro backfill, medido
  -- em 18/09: 536 com data, 0 com etiqueta. A saída antecipada por data
  -- pulava justamente o conserto. Quem decide a saída é o fim da função,
  -- quando as DUAS coisas já foram avaliadas.

  -- A ETIQUETA, com a MESMA regra da 0262 — replicada e não chamada, porque
  -- `fn_recalcular_cliente_do_contato` recalcula a data pela AGENDA e apagaria
  -- o carimbo que veio da comanda.
  --
  -- Quem decide é a coluna; a etiqueta serve para filtrar a listagem, alimentar
  -- automação e o agente ler. E ela respeita a mão humana: entra só na primeira
  -- vez (ou se foi o sistema que a tirou), nunca por cima de quem a removeu de
  -- propósito.
  v_tem := c_etiqueta = any(v_tags);

  -- Rede para banco restaurado com trigger desligada, onde a etiqueta pode ter
  -- mudado de mão sem a guarda ver.
  if (v_dono = 'added' and not v_tem) or (v_dono = 'removed' and v_tem) then
    v_dono := null;
  end if;

  v_novas := v_tags;
  -- `v_antes is null` era a condição da 0262, onde só há uma fonte. Aqui a data
  -- pode já ter vindo do backfill anterior, então a pergunta certa é "já foi
  -- reconhecido alguma vez?" — quem nunca foi ganha a etiqueta.
  if not v_tem and (v_reconhecido is null or v_dono = 'removed') then
    -- `array_append` e não `||`: sem cast o `||` lê o literal como ARRAY e
    -- morre em `malformed array literal`.
    v_novas := array_append(v_tags, c_etiqueta);
    v_dono := 'added';
    v_resultado := 'etiquetado';
  end if;

  -- ANUNCIA A ESCRITA AO GUARDA. `fn_colunas_de_cliente_sao_do_sistema` (0262)
  -- recusa com 42501 qualquer sessão que mexa em `first_service_at`, e
  -- `auth.uid()` continua preenchido dentro de uma `security definer` chamada
  -- pela sessão — então esta função é barrada como se fosse mão humana sem a
  -- chave. É de transação, e a mesma que a função da agenda usa.
  -- Nada a fazer: nem a data mudou, nem a etiqueta. Não escrever é o que
  -- impede o contato de virar ruído de realtime e `updated_at` de se mexer
  -- por nada — o mesmo cuidado da 0262.
  if v_antes is not distinct from v_primeira and v_novas = v_tags then
    return 'igual';
  end if;

  perform set_config('deskcomm.cliente_pela_agenda', 'on', true);

  update public.contacts
     set first_service_at = v_primeira,
         client_recognized_at = coalesce(client_recognized_at, now()),
         tags = v_novas,
         client_tag_by_system = v_dono
   where id = p_contact;

  perform set_config('deskcomm.cliente_pela_agenda', 'off', true);

  return v_resultado;
end $$;

revoke execute on function public.fn_cliente_pela_comanda(uuid, uuid) from public, anon, authenticated;
comment on function public.fn_cliente_pela_comanda(uuid, uuid) is
  'Carimba contacts.first_service_at a partir da primeira comanda finalizada. Chamada pela finalização e pelo backfill; nunca por sessão de usuário.';

-- ─── 3. o backfill das que já têm histórico ──────────────────────────────────
--
-- Sem isto, as 536 clientes do sistema anterior continuariam sem selo até
-- comprarem de novo. Idempotente: quem já tem o carimbo certo não é tocado.
do $$
declare v_linha record; v_n integer := 0; v_curados integer := 0;
begin
  if to_regclass('public.sales') is null then return; end if;

  -- AUTO-CURA de uma versão anterior DESTA migration.
  --
  -- A primeira versão gravava `client_recognized_at` e NÃO punha a etiqueta.
  -- Como `client_recognized_at` significa "já reconheci uma vez, não reponho a
  -- etiqueta", ela queimava o reconhecimento à toa: na passada seguinte a
  -- regra entendia que a equipe tinha removido a tag de propósito e a deixava
  -- de fora para sempre. Medido em 18/09: 536 com data, 0 com etiqueta.
  --
  -- O estado é reconhecível sem ambiguidade: tem `client_recognized_at`, NÃO
  -- tem a etiqueta e `client_tag_by_system` é nulo — ou seja, o sistema nunca
  -- pôs nem tirou nada. Devolver ao "nunca reconhecido" faz a função tratá-lo
  -- como primeira vez, que é o que ele de fato é.
  --
  -- Não alcança quem a equipe desetiquetou de verdade: naquele caso o sistema
  -- pôs antes, e `client_tag_by_system` seria 'removed'.
  update public.contacts
     set client_recognized_at = null
   where client_recognized_at is not null
     and client_tag_by_system is null
     and not (coalesce(tags, '{}'::text[]) @> array['cliente'])
     and first_service_at is not null;
  get diagnostics v_curados = row_count;
  if v_curados > 0 then
    raise notice '9014: % contato(s) curados de uma versão anterior desta migration', v_curados;
  end if;

  for v_linha in
    select s.organization_id, s.contact_id, min(s.finalized_at) as primeira
      from public.sales s
      join public.contacts c on c.id = s.contact_id
     where s.contact_id is not null
       and s.status = 'finalized' and s.finalized_at is not null and s.reversed_at is null
       and not coalesce(c.is_anonymized, false) and c.is_merged_into is null
     group by 1, 2
  loop
    -- Pela função, e não por UPDATE solto: é ela que sabe a regra da etiqueta
    -- e que se anuncia ao guarda. Duplicar a lógica aqui criaria a segunda
    -- versão que diverge no primeiro conserto.
    perform public.fn_cliente_pela_comanda(v_linha.organization_id, v_linha.contact_id);
    v_n := v_n + 1;
  end loop;

  if v_n > 0 then
    raise notice '9014: % contato(s) passaram a ser cliente pela comanda', v_n;
  end if;
end $$;

-- ─── 4. o resumo da ficha ────────────────────────────────────────────────────
--
-- `security invoker` de propósito: a RLS de `sales`, `sale_items` e
-- `calendar_appointments` continua decidindo o que a pessoa enxerga, em vez de
-- o isolamento ser reescrito no corpo.
--
-- ⚠️ Comanda válida = `status='finalized' AND finalized_at IS NOT NULL AND
-- reversed_at IS NULL`. O estorno NÃO muda o status (só carimba `reversed_at`),
-- então filtrar por `status <> 'reversed'` contaria estornada como válida.
--
-- ⚠️ As 5 comandas sem contato (medido) não aparecem em ficha nenhuma: a soma
-- de todas as fichas não fecha com o relatório, e isso é esperado.
create or replace function public.fn_resumo_do_cliente(p_org uuid, p_contact uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with fuso as (
    select coalesce(
      (select timezone from public.organizations where id = p_org),
      'America/Sao_Paulo'
    ) as tz
  ),
  validas as (
    select s.id, s.total_cents, s.finalized_at,
           (s.finalized_at at time zone (select tz from fuso))::date as dia
      from public.sales s
     where s.organization_id = p_org
       and s.contact_id = p_contact
       and s.status = 'finalized'
       and s.finalized_at is not null
       and s.reversed_at is null
  ),
  base as (
    select count(*)::int                         as visitas,
           coalesce(sum(total_cents), 0)::bigint as total_cents,
           min(dia)                              as primeira,
           max(dia)                              as ultima,
           count(distinct dia)::int              as dias
      from validas
  ),
  servicos as (
    select coalesce(et.name, si.description) as nome,
           sum(si.quantity)::int             as quantidade,
           sum(si.total_cents)::bigint       as total_cents
      from public.sale_items si
      join validas v on v.id = si.sale_id
      left join public.calendar_event_types et
        on et.id = si.event_type_id and et.organization_id = p_org
     where si.organization_id = p_org
     group by 1
     order by 2 desc, 3 desc
     limit 5
  ),
  agenda as (
    select count(*)::int as futuros
      from public.calendar_appointments a
     where a.organization_id = p_org
       and a.contact_id = p_contact
       and a.starts_at > now()
       and public.fn_situacao_conta_como_atendimento(a.status)
  )
  select jsonb_build_object(
    -- VISITA = comanda finalizada (a régua do sistema anterior). `dias` vai
    -- junto porque é ele que alimenta o intervalo médio — duas comandas no
    -- mesmo dia são duas visitas, mas um dia só de intervalo.
    'visitas', (select visitas from base),
    'dias_distintos', (select dias from base),
    'total_gasto_cents', (select total_cents from base),
    'ticket_medio_cents',
      coalesce((select total_cents / nullif(visitas, 0) from base), 0),
    'primeira_visita', (select primeira from base),
    'ultima_visita', (select ultima from base),
    'dias_desde_ultima',
      (select case when ultima is null then null
                   else ((now() at time zone (select tz from fuso))::date - ultima) end from base),
    'intervalo_medio_dias',
      (select case when dias > 1 then round((ultima - primeira)::numeric / (dias - 1)) end from base),
    'classificacao',
      (select case
         when visitas = 0 then 'sem_compra'
         when ((now() at time zone (select tz from fuso))::date - ultima) <= 60  then 'ativa'
         when ((now() at time zone (select tz from fuso))::date - ultima) <= 120 then 'em_risco'
         when ((now() at time zone (select tz from fuso))::date - ultima) <= 365 then 'inativa'
         else 'perdida' end
       from base),
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome, 'quantidade', quantidade, 'total_cents', total_cents))
        from servicos
    ), '[]'::jsonb),
    'cartao', public.fn_cartao_de_fidelidade(p_org, p_contact),
    'agendamentos_futuros', (select futuros from agenda)
  );
$$;

revoke execute on function public.fn_resumo_do_cliente(uuid, uuid) from public, anon;
grant  execute on function public.fn_resumo_do_cliente(uuid, uuid) to authenticated, service_role;

comment on function public.fn_resumo_do_cliente(uuid, uuid) is
  'Indicadores da ficha da cliente. Visita = comanda finalizada não estornada, no fuso da organização. Security invoker: a RLS das tabelas decide o que a pessoa vê.';

-- ─── 5. a finalização passa a carimbar o cliente ─────────────────────────────
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

  -- (6) a cliente passa a ser CLIENTE.
  --
  -- No núcleo, `first_service_at` nasce da agenda (0262). Aqui a comanda
  -- também carimba: o histórico importado tem venda e não tem agendamento, e
  -- sem isto quem compra há cinco anos fica sem selo de cliente, fora do
  -- filtro de etiqueta e invisível para as automações.
  perform public.fn_cliente_pela_comanda(p_org, v_sale.contact_id);

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'number', v_sale.number,
    'total_cents', v_total,
    'entry_id', v_entry
  );
end $$;

revoke execute on function public.fn_finalizar_comanda(uuid, uuid, uuid, integer) from public, anon;
grant  execute on function public.fn_finalizar_comanda(uuid, uuid, uuid, integer) to authenticated;
