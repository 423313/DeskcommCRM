-- ---- catálogo financeiro: contas, formas de pagamento, plano de contas (migration 9001) ----
-- O CATÁLOGO FINANCEIRO — a primeira camada do módulo de comanda/financeiro.
--
-- Três tabelas que não guardam dinheiro, só definem PARA ONDE ele vai:
--
--   financial_accounts  onde o dinheiro fica (Caixa, Banco)
--   payment_methods     como o cliente paga — e cada forma APONTA para a conta
--                       em que aquele dinheiro cai
--   account_plans       a classificação contábil do lançamento
--
-- A ordem importa: a forma de pagamento é quem decide em qual conta a entrada
-- é lançada quando uma comanda é finalizada. Sem esta camada, a comanda não tem
-- onde depositar, e é por isso que ela vem primeiro.
--
-- ⚠️ NADA AQUI TEM SALDO GRAVADO. `opening_balance_cents` é o saldo INICIAL —
-- o ponto de partida declarado por quem cadastrou a conta, que não muda com
-- lançamento nenhum. O saldo corrente é sempre DERIVADO por soma, e essa é uma
-- das invariantes do modelo: saldo gravado e lançamentos divergem no primeiro
-- estorno, e a divergência não dá sinal.
--
-- ⚠️ DINHEIRO EM `_cents` + `currency`, como manda o CLAUDE.md. Nunca `numeric`
-- solto: arredondamento de ponto flutuante em dinheiro é defeito que aparece
-- meses depois, num relatório que não fecha por centavos.

-- ─── onde o dinheiro fica ────────────────────────────────────────────────────
create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null,
  -- `text` + CHECK e não enum: enum é difícil de estender, e a lista de tipos de
  -- conta cresce com o negócio (carteira digital, aplicação, adquirente).
  kind text not null default 'cash' check (kind in ('cash', 'bank', 'other')),

  opening_balance_cents bigint not null default 0,
  currency text not null default 'BRL' check (char_length(currency) = 3),

  -- Inativa-se, não se apaga: conta com lançamento é história, e apagá-la
  -- deixaria o lançamento órfão ou o levaria junto.
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists financial_accounts_org_nome_key
  on public.financial_accounts (organization_id, lower(name))
  where is_active;
create index if not exists financial_accounts_org_idx
  on public.financial_accounts (organization_id, is_active);

-- ─── como o cliente paga ─────────────────────────────────────────────────────
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null,

  -- ⚠️ `on delete restrict`, e é a decisão desta migration: a forma de pagamento
  -- é quem diz em que conta o dinheiro cai. Apagar a conta em cascata deixaria
  -- formas apontando para o nada e lançamentos futuros sem destino — em
  -- silêncio. `restrict` obriga a inativar a conta, que é o caminho certo.
  account_id uuid references public.financial_accounts(id) on delete restrict,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_methods_org_nome_key
  on public.payment_methods (organization_id, lower(name))
  where is_active;
create index if not exists payment_methods_org_idx
  on public.payment_methods (organization_id, is_active);

-- ─── a classificação do lançamento ───────────────────────────────────────────
create table if not exists public.account_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null,
  -- Entrada ou saída. O sistema de origem tinha TODAS as 17 linhas como
  -- 'debito', inclusive "Serviços" e "Comissão", que são coisas opostas — um
  -- campo que existe e não distingue nada. Aqui ele distingue, e o CHECK
  -- garante que continue distinguindo.
  direction text not null check (direction in ('in', 'out')),

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_plans_org_nome_key
  on public.account_plans (organization_id, lower(name))
  where is_active;
create index if not exists account_plans_org_idx
  on public.account_plans (organization_id, is_active, direction);

-- ─── RLS: as três são tenant-aware e seguem o helper da casa ─────────────────
--
-- Leitura para quem é da organização; escrita para manager+. Dinheiro não é
-- coisa que `agent` configure — quem atende não define plano de contas.
do $$
declare t text;
begin
  foreach t in array array['financial_accounts', 'payment_methods', 'account_plans'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation_%I_all on public.%I', t, t);
    execute format($f$
      create policy tenant_isolation_%I_all on public.%I
        for all
        using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())
        with check (
          public.fn_is_platform_admin()
          or (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, 'manager'))
        )
    $f$, t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- `updated_at` pelo mesmo trigger que o resto da base usa, se ele existir nesta
-- instalação. `if exists` porque o baseline de um clone antigo pode não tê-lo, e
-- uma migration que falha por causa de carimbo de data é migration que trava
-- atualização por nada.
do $$
declare t text;
begin
  if exists (select 1 from pg_proc where proname = 'fn_touch_updated_at') then
    foreach t in array array['financial_accounts', 'payment_methods', 'account_plans'] loop
      execute format('drop trigger if exists trg_%I_touch on public.%I', t, t);
      execute format(
        'create trigger trg_%I_touch before update on public.%I for each row execute function public.fn_touch_updated_at()',
        t, t);
    end loop;
  end if;
end $$;

comment on table public.financial_accounts is
  'Onde o dinheiro fica. `opening_balance_cents` é o saldo INICIAL declarado; o saldo corrente é sempre derivado por soma dos lançamentos, nunca gravado.';
comment on table public.payment_methods is
  'Como o cliente paga. `account_id` decide em qual conta a entrada cai quando a comanda é finalizada.';
comment on table public.account_plans is
  'Classificação do lançamento, com direção (in/out) que o sistema de origem tinha e não usava.';


-- ---- profissional e fechamento de comissão (migration 9011) ----
-- 9011 — quem atende deixa de ser um USUÁRIO e passa a ser uma PROFISSIONAL,
-- e o fechamento de comissão passa a existir.
--
-- ## Por que trocar o eixo
--
-- O módulo nasceu com `attendant_user_id → auth.users` porque, num CRM, quem
-- atende costuma ter login. Num estúdio de beleza não tem: a profissional
-- executa o serviço e nunca abre o sistema. Criar usuário para ela seria pôr
-- gente que não usa o produto na equipe, no roteamento, no plantão e na conta
-- de assentos — e ainda assim ela não poderia ser inativada sem sumir do
-- histórico.
--
-- ## Por que DROPAR a coluna antiga, e não conviver com as duas
--
-- Medido em 17/09/2026 na base do Studio, a única instalação viva do fork:
-- `sale_items` com 11.374 linhas e `attendant_user_id` **nulo em todas**;
-- `commissions` e `commission_rules` **vazias**. Não há dado a preservar.
--
-- Dois eixos vivos custariam: `fn_finalizar_comanda` decidindo qual vale, a
-- tela com dois seletores (ou um que grava escondido), e o índice de alvo
-- único tendo de cobrir o par. É a dívida que ninguém remove — e aqui ela não
-- compraria nada.
--
-- ⚠️ A GUARDA ABAIXO é o que torna o drop defensável. Sem ela isto é uma aposta
-- na medição de UMA base: qualquer outro clone que tenha usado o eixo antigo
-- perderia a atribuição de comissão em silêncio. Com ela, a atualização PARA e
-- diz o que fazer.
--
-- ## Por que o fechamento não ganha tabela
--
-- O legado tinha `comissao_fechamentos` guardando `total` e `quantidade`. São
-- dois números derivados, e derivado gravado é o que diverge no primeiro
-- estorno. Aqui **o fechamento É o lançamento de saída**: `paid_entry_id`
-- aponta para ele, os itens do fechamento são as comissões que apontam para a
-- mesma linha, e o total não pode divergir da soma porque não existe segunda
-- cópia.

-- ─── 2. A profissional ───────────────────────────────────────────────────────
create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null check (length(btrim(name)) between 1 and 120),

  -- O dia em que alguma ganhar login. NULO é o estado normal, não a exceção:
  -- quem atende no balcão não usa o CRM. A coluna existe para que esse dia não
  -- exija migration nem refazer o histórico.
  user_id uuid references auth.users(id) on delete set null,

  -- A ponte com o sistema anterior. Identidade é ESTE id, nunca o nome: nome
  -- muda (casamento, apelido) e casar por nome refaria vínculo errado na
  -- segunda execução da migração de dados.
  legacy_id uuid,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Parcial em `is_active`, como as três do catálogo (9001): duas "Scarlet"
-- ativas é erro de digitação; uma inativa e uma ativa é rotatividade.
create unique index if not exists professionals_org_nome_key
  on public.professionals (organization_id, lower(btrim(name))) where is_active;
create unique index if not exists professionals_org_legacy_key
  on public.professionals (organization_id, legacy_id) where legacy_id is not null;
-- Duas linhas para o mesmo usuário partiriam a ficha dele em duas, sem erro.
create unique index if not exists professionals_org_user_key
  on public.professionals (organization_id, user_id) where user_id is not null;
create index if not exists professionals_org_ativas_idx
  on public.professionals (organization_id) where is_active;

alter table public.professionals enable row level security;
drop policy if exists tenant_isolation_professionals_all on public.professionals;
create policy tenant_isolation_professionals_all on public.professionals
  for all to authenticated
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));
revoke all on public.professionals from anon;

drop trigger if exists trg_professionals_updated_at on public.professionals;
create trigger trg_professionals_updated_at
  before update on public.professionals
  for each row execute function public.fn_touch_updated_at();

-- ---- comanda, financeiro, comissão e fidelidade (migration 9002) ----
-- A COMANDA E O QUE ELA MOVE — segunda e última camada do módulo financeiro.
--
-- Cinco tabelas e uma função. A função é o ponto: finalizar uma comanda faz
-- SEIS coisas numa única transação — marca a venda, gera comissão por item,
-- lança a entrada na conta que a forma de pagamento determina, dá o ponto de
-- fidelidade e conclui o agendamento. Não são módulos vizinhos; é o corpo da
-- mesma transação, e é por isso que nascem juntos.
--
-- ═══ OS INVARIANTES, E POR QUE CADA UM ═══
--
-- 1. NADA É APAGADO. Comanda cancela, conta inativa, item sai por cancelamento
--    da comanda. `delete` em linha de dinheiro é reescrever o passado.
-- 2. SALDO É SEMPRE DERIVADO. Não existe coluna de saldo em lugar nenhum —
--    nem na conta, nem no cliente. Saldo gravado e lançamentos divergem no
--    primeiro estorno, e a divergência não dá sinal.
-- 3. ESTORNO É CONTRA-LANÇAMENTO, nunca exclusão. Duas linhas que se somam a
--    zero contam a história; uma linha apagada não conta nada.
-- 4. A COMISSÃO É RESOLVIDA NA INCLUSÃO DO ITEM e gravada na linha. A
--    finalização NÃO recalcula: mudar a regra de comissão amanhã não pode
--    mexer no que já foi combinado ontem.
-- 5. A NUMERAÇÃO NÃO REINICIA. Sequência por organização, monotônica.
-- 6. LANÇAMENTO PAGO É IMUTÁVEL. Trigger recusa UPDATE que mexa em valor,
--    conta ou data depois de `paid_at`.

-- ─── a comanda ───────────────────────────────────────────────────────────────
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Número visível, por organização. `bigint` e não `serial`: a sequência é
  -- própria de cada tenant (ver `fn_proximo_numero_de_comanda`), e um serial
  -- global vazaria o volume de um cliente para outro.
  number bigint not null,

  contact_id uuid references public.contacts(id) on delete set null,
  -- Quem atendeu. `set null` porque a pessoa pode sair da equipe e a venda
  -- continua tendo acontecido.
  attendant_user_id uuid references auth.users(id) on delete set null,
  appointment_id uuid references public.calendar_appointments(id) on delete set null,

  status text not null default 'open'
    check (status in ('open', 'finalized', 'cancelled')),

  -- Desconto da COMANDA, separado do desconto de item. Fidelidade e comissão
  -- incidem sobre o item, nunca sobre este — senão um desconto de caixa
  -- reduziria o prêmio de quem atendeu.
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null default 0,
  currency text not null default 'BRL' check (char_length(currency) = 3),

  payment_method_id uuid references public.payment_methods(id) on delete restrict,

  notes text,
  finalized_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  -- Estornada: a comanda continua finalizada e ganha o contra-lançamento.
  reversed_at timestamptz,
  reverse_reason text,

  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Finalizar exige forma de pagamento: é ela que diz em que conta o dinheiro
  -- cai. Sem isso, a entrada não teria destino — e o CHECK diz isso no schema,
  -- não numa validação que alguém pode esquecer de chamar.
  constraint sales_finalizada_tem_forma
    check (status <> 'finalized' or payment_method_id is not null)
);

create unique index if not exists sales_org_numero_key on public.sales (organization_id, number);
create index if not exists sales_org_status_idx on public.sales (organization_id, status, created_at desc);
create index if not exists sales_org_contato_idx on public.sales (organization_id, contact_id);
create index if not exists sales_appointment_idx on public.sales (appointment_id)
  where appointment_id is not null;

-- ─── o item ──────────────────────────────────────────────────────────────────
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- `cascade` aqui e só aqui: item não existe fora da comanda, e comanda não é
  -- apagada (cancela). O cascade só dispara se a ORGANIZAÇÃO inteira sair.
  sale_id uuid not null references public.sales(id) on delete cascade,

  -- O que foi feito. `event_type_id` porque, neste produto, o catálogo de
  -- serviços JÁ é `calendar_event_types` — criar uma tabela de serviços ao lado
  -- seria a segunda fonte da mesma verdade.
  event_type_id uuid references public.calendar_event_types(id) on delete restrict,
  -- Congelado na inclusão: o nome muda, a linha da venda não.
  description text not null,

  professional_id uuid references public.professionals(id) on delete restrict,

  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null,

  -- ⚠️ RESOLVIDA NA INCLUSÃO e gravada aqui. A finalização não recalcula:
  -- mudar a regra amanhã não mexe no que já foi combinado ontem.
  commission_percent numeric(5, 2) not null default 0
    check (commission_percent >= 0 and commission_percent <= 100),

  created_at timestamptz not null default now()
);

create index if not exists sale_items_sale_idx on public.sale_items (sale_id);
create index if not exists sale_items_org_idx on public.sale_items (organization_id, created_at desc);

-- ─── a regra de comissão ─────────────────────────────────────────────────────
--
-- Precedência: (pessoa + serviço) → (pessoa) → (serviço). A mais específica
-- vence, e é por isso que as três colunas são nullable com um índice único por
-- combinação — não há linha "curinga" mágica, há ausência.
create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  professional_id uuid references public.professionals(id) on delete cascade,
  event_type_id uuid references public.calendar_event_types(id) on delete cascade,

  percent numeric(5, 2) not null check (percent >= 0 and percent <= 100),

  created_at timestamptz not null default now(),

  -- Pelo menos um dos dois: uma regra sem pessoa E sem serviço seria a regra
  -- "de tudo", que é o default da organização e mora em outro lugar.
  constraint commission_rules_tem_alvo
    check (professional_id is not null or event_type_id is not null)
);

-- `coalesce` no índice: NULL não colide com NULL numa UNIQUE, e sem isto duas
-- regras "só para a Ana" passariam as duas, em silêncio.
create unique index if not exists commission_rules_alvo_key on public.commission_rules (
  organization_id,
  coalesce(professional_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(event_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- ─── a comissão gerada ───────────────────────────────────────────────────────
create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete restrict,

  percent numeric(5, 2) not null,
  amount_cents bigint not null,

  status text not null default 'pending' check (status in ('pending', 'paid', 'reversed')),
  paid_at timestamptz,
  reversed_at timestamptz,

  created_at timestamptz not null default now()
);

create unique index if not exists commissions_item_key on public.commissions (sale_item_id);
create index if not exists commissions_org_pessoa_idx
  on public.commissions (organization_id, professional_id, status);

-- ─── o lançamento financeiro ─────────────────────────────────────────────────
create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  account_id uuid not null references public.financial_accounts(id) on delete restrict,
  account_plan_id uuid references public.account_plans(id) on delete restrict,
  sale_id uuid references public.sales(id) on delete set null,

  direction text not null check (direction in ('in', 'out')),
  -- SEMPRE positivo; quem dá o sinal é `direction`. Valor negativo com direção
  -- é duas formas de dizer a mesma coisa, e elas divergem.
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'BRL' check (char_length(currency) = 3),

  description text,
  entry_date date not null default current_date,

  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,

  -- O contra-lançamento aponta para o que ele estorna. Duas linhas que se somam
  -- a zero, e a ligação entre elas explícita.
  reverses_entry_id uuid references public.financial_entries(id) on delete restrict,

  origin text not null default 'manual'
    check (origin in ('manual', 'sale', 'reversal', 'recurring', 'commission')),

  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financial_entries_org_data_idx
  on public.financial_entries (organization_id, entry_date desc);
create index if not exists financial_entries_conta_idx
  on public.financial_entries (organization_id, account_id, status);
create index if not exists financial_entries_sale_idx
  on public.financial_entries (sale_id) where sale_id is not null;

-- ─── o livro-razão da fidelidade ─────────────────────────────────────────────
--
-- LEDGER, não saldo. O saldo do cliente é `sum(points)` e nunca uma coluna:
-- guardar o saldo faria o primeiro estorno divergir em silêncio.
create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,

  -- Assinado: ganhar é positivo, resgatar é negativo. Uma coluna de "tipo" ao
  -- lado seria a segunda forma de dizer o mesmo sinal.
  points integer not null,
  reason text not null,

  sale_id uuid references public.sales(id) on delete set null,
  sale_item_id uuid references public.sale_items(id) on delete set null,

  -- Idempotência do ganho: finalizar a mesma comanda duas vezes não dá ponto
  -- em dobro. A UNIQUE parcial é a garantia, não a boa intenção de quem chama.
  idempotency_key text,

  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists loyalty_ledger_idem_key
  on public.loyalty_ledger (organization_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists loyalty_ledger_contato_idx
  on public.loyalty_ledger (organization_id, contact_id, created_at desc);

-- ─── lançamento pago é imutável ──────────────────────────────────────────────
create or replace function public.fn_lancamento_pago_e_imutavel()
returns trigger language plpgsql as $$
begin
  if old.paid_at is not null and (
       new.amount_cents is distinct from old.amount_cents
    or new.account_id   is distinct from old.account_id
    or new.direction    is distinct from old.direction
    or new.entry_date   is distinct from old.entry_date
  ) then
    -- Não é capricho: um lançamento pago já foi conciliado com extrato. Mudá-lo
    -- faz o relatório de ontem contar outra história hoje, sem deixar rastro.
    -- O caminho certo é o contra-lançamento.
    raise exception 'lancamento_pago_imutavel'
      using errcode = '42501',
            hint = 'Um lançamento já pago não muda de valor, conta, direção ou data. Estorne com um contra-lançamento.';
  end if;
  return new;
end $$;

drop trigger if exists trg_financial_entries_imutavel on public.financial_entries;
create trigger trg_financial_entries_imutavel
  before update on public.financial_entries
  for each row execute function public.fn_lancamento_pago_e_imutavel();

-- ─── a numeração que não reinicia ────────────────────────────────────────────
-- O corpo abaixo é o da 9010, que acrescentou a conferência de pertencimento e
-- passou a função a `stable`. O apêndice guarda o estado final, nunca as duas
-- versões empilhadas — senão quem lê o baseline vê a definição antiga primeiro
-- e conclui que ela é a que vale.
create or replace function public.fn_proximo_numero_de_comanda(p_org uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- A organização vem de FORA. Sem esta conferência, um usuário logado no
  -- tenant A chamava a RPC com o id do tenant B e recebia o próximo número de
  -- comanda dele — que é o VOLUME de vendas do vizinho (9010).
  -- `auth.uid() is null` = service_role/cron, que não tem sessão e já passou
  -- por outra porta. Mesma forma da 0260.
  if auth.uid() is not null
     and not public.fn_is_platform_admin()
     and p_org not in (select public.fn_user_org_ids()) then
    raise exception 'caller_not_authorized_for_org' using errcode = '42501';
  end if;

  -- `coalesce(max)+1` sob o lock da transação de quem chama. Uma sequence do
  -- Postgres seria global e vazaria volume entre tenants; e o buraco de uma
  -- sequence (números pulados no rollback) faria a numeração de uma comanda
  -- parecer que houve venda cancelada onde não houve.
  return (select coalesce(max(number), 0) + 1
            from public.sales
           where organization_id = p_org);
end $$;
revoke execute on function public.fn_proximo_numero_de_comanda(uuid) from public, anon;
grant execute on function public.fn_proximo_numero_de_comanda(uuid) to authenticated, service_role;

-- ─── A FINALIZAÇÃO: as seis coisas numa transação ────────────────────────────
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

-- ─── O ESTORNO: contra-lançamento, nunca exclusão ────────────────────────────
create or replace function public.fn_estornar_comanda(p_org uuid, p_sale uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sale   public.sales%rowtype;
  v_orig   public.financial_entries%rowtype;
  v_novo   uuid;
begin
  if auth.uid() is null or not public.fn_role_at_least(p_org, 'manager') then
    raise exception 'estorno_forbidden' using errcode = '42501';
  end if;

  select * into v_sale from public.sales
   where id = p_sale and organization_id = p_org for update;
  if not found then raise exception 'comanda_nao_encontrada' using errcode = 'P0002'; end if;
  if v_sale.status <> 'finalized' then
    raise exception 'comanda_nao_finalizada' using errcode = '22023';
  end if;
  if v_sale.reversed_at is not null then
    return jsonb_build_object('sale_id', v_sale.id, 'ja_estornada', true);
  end if;

  update public.sales set reversed_at = now(), reverse_reason = p_motivo where id = p_sale;

  -- O contra-lançamento de cada entrada da comanda. A original NÃO é tocada:
  -- ela está paga e é imutável (o trigger acima recusaria).
  for v_orig in
    select * from public.financial_entries
     where sale_id = p_sale and organization_id = p_org and origin = 'sale'
  loop
    insert into public.financial_entries
      (organization_id, account_id, account_plan_id, sale_id, direction, amount_cents,
       currency, description, status, paid_at, origin, reverses_entry_id, created_by_user_id)
    values (
      p_org, v_orig.account_id, v_orig.account_plan_id, p_sale,
      case when v_orig.direction = 'in' then 'out' else 'in' end,
      v_orig.amount_cents, v_orig.currency,
      format('Estorno da comanda #%s', v_sale.number), 'paid', now(), 'reversal',
      v_orig.id, auth.uid()
    )
    returning id into v_novo;
  end loop;

  -- A comissão vira 'reversed' — não some, porque ela existiu e alguém pode já
  -- ter sido pago por ela.
  update public.commissions c
     set status = 'reversed', reversed_at = now()
    from public.sale_items i
   where c.sale_item_id = i.id and i.sale_id = p_sale and c.status <> 'reversed';

  -- E o ponto de fidelidade volta como movimento NEGATIVO, nunca apagando o
  -- ganho: o livro-razão conta as duas coisas.
  insert into public.loyalty_ledger
    (organization_id, contact_id, points, reason, sale_id, idempotency_key, created_by_user_id)
  select p_org, v_sale.contact_id, -l.points, 'Estorno da comanda', p_sale,
         format('reversal:%s', p_sale), auth.uid()
    from public.loyalty_ledger l
   where l.sale_id = p_sale and l.organization_id = p_org and l.points > 0
     and v_sale.contact_id is not null
  on conflict do nothing;

  return jsonb_build_object('sale_id', v_sale.id, 'estornada', true);
end $$;

revoke execute on function public.fn_estornar_comanda(uuid, uuid, text) from public, anon;
grant execute on function public.fn_estornar_comanda(uuid, uuid, text) to authenticated;

-- ─── RLS nas cinco ───────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['sales', 'sale_items', 'commission_rules', 'commissions',
                           'financial_entries', 'loyalty_ledger'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation_%I_all on public.%I', t, t);
    execute format($f$
      create policy tenant_isolation_%I_all on public.%I
        for all
        using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())
        with check (
          public.fn_is_platform_admin()
          or (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, 'agent'))
        )
    $f$, t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

comment on table public.sales is
  'A comanda. Cancela, nunca apaga. `number` é sequencial por organização e não reinicia.';
comment on table public.loyalty_ledger is
  'Livro-razão de fidelidade. O saldo do cliente é sum(points) — NUNCA uma coluna.';
comment on function public.fn_finalizar_comanda(uuid, uuid, uuid, integer) is
  'As seis coisas numa transação: venda, comissão por item, entrada na conta da forma de pagamento, ponto de fidelidade e conclusão do agendamento. Idempotente sob FOR UPDATE.';


-- ---- eixo da profissional: cura da base existente (migration 9011) ----
-- As tabelas acima já nascem com `professional_id`. Este bloco é para o banco
-- que JÁ EXISTE com a coluna antiga — é ele que o `update.sh` do clone aplica.
-- Vem depois do 9002 de propósito: num banco novo, `sale_items` só existe aqui.

-- ─── 1. A guarda ─────────────────────────────────────────────────────────────
--
-- Só olha se a coluna antiga AINDA existe: na segunda aplicação (e o update.sh
-- do kit reaplica o baseline inteiro em toda atualização) ela já não existe, e
-- uma guarda que consultasse a coluna morta reprovaria a atualização de quem
-- já migrou. Idempotência é requisito, não cortesia.
do $$
declare v_itens bigint := 0; v_com bigint := 0; v_regras bigint := 0;
begin
  if to_regclass('public.sale_items') is null then return; end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'sale_items'
                and column_name = 'attendant_user_id') then
    execute 'select count(*) from public.sale_items where attendant_user_id is not null'
      into v_itens;
  end if;

  if to_regclass('public.commissions') is not null then
    execute 'select count(*) from public.commissions' into v_com;
  end if;
  if to_regclass('public.commission_rules') is not null then
    execute 'select count(*) from public.commission_rules' into v_regras;
  end if;

  -- `commissions`/`commission_rules` com linhas E já no eixo novo é o estado
  -- normal de quem migrou: só barra quem ainda tem a coluna antiga preenchida.
  if v_itens > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'A migration 9011 troca quem executa o serviço de usuário para profissional, e esta base JÁ USA o eixo antigo: %s item(ns) de comanda com attendant_user_id preenchido.',
        v_itens),
      hint = 'Cadastre as profissionais em public.professionals, repontue os itens para professional_id e rode de novo. Dropar agora apagaria a autoria da comissão.';
  end if;

  if (v_com > 0 or v_regras > 0)
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'commissions'
                    and column_name = 'attendant_user_id') then
    raise exception using
      errcode = 'P0001',
      message = format(
        'A 9011 dropa attendant_user_id de commissions/commission_rules, e elas não estão vazias (comissões: %s, regras: %s).',
        v_com, v_regras),
      hint = 'Repontue para professional_id antes de atualizar.';
  end if;
end $$;

-- ─── 3. A troca do eixo ──────────────────────────────────────────────────────
alter table public.sale_items
  add column if not exists professional_id uuid
  -- `restrict`: apagar a profissional levaria embora a autoria do item, que é
  -- o que a comissão prova. A tela inativa, não apaga.
  references public.professionals(id) on delete restrict;

alter table public.commission_rules
  add column if not exists professional_id uuid
  -- `cascade`: regra de quem saiu não vale mais para ninguém.
  references public.professionals(id) on delete cascade;

alter table public.commissions
  add column if not exists professional_id uuid
  references public.professionals(id) on delete restrict;

-- Índices e constraint que citam a coluna antiga saem ANTES do drop.
drop index if exists public.commission_rules_alvo_key;
drop index if exists public.commission_rules_org_ativas_idx;
drop index if exists public.commissions_org_pessoa_idx;
alter table public.commission_rules drop constraint if exists commission_rules_tem_alvo;

alter table public.sale_items       drop column if exists attendant_user_id;
alter table public.commission_rules drop column if exists attendant_user_id;
alter table public.commissions      drop column if exists attendant_user_id;

-- `commissions.professional_id` é obrigatória: comissão sem destinatário não é
-- comissão. O `not null` entra depois do drop porque a tabela está vazia.
do $$
begin
  -- Só aperta quando dá: numa base recém-migrada a tabela está vazia e o
  -- `set not null` passa; numa base que já opera, as linhas já têm valor
  -- (a coluna nasceu obrigatória para elas) e o comando é no-op.
  if not exists (select 1 from public.commissions where professional_id is null) then
    alter table public.commissions alter column professional_id set not null;
  else
    raise exception 'commissions tem comissão sem professional_id; repontue antes de atualizar';
  end if;
end $$;

alter table public.commission_rules drop constraint if exists commission_rules_tem_alvo;
alter table public.commission_rules
  add constraint commission_rules_tem_alvo
  check (professional_id is not null or event_type_id is not null);

create unique index if not exists commission_rules_alvo_key on public.commission_rules (
  organization_id,
  coalesce(professional_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(event_type_id,   '00000000-0000-0000-0000-000000000000'::uuid)
);
create index if not exists commission_rules_org_ativas_idx
  on public.commission_rules (organization_id, event_type_id, professional_id);
create index if not exists commissions_org_pessoa_idx
  on public.commissions (organization_id, professional_id, status);
create index if not exists sale_items_profissional_idx
  on public.sale_items (organization_id, professional_id)
  where professional_id is not null;

-- ─── 4. O fechamento é o lançamento ──────────────────────────────────────────
alter table public.commissions
  add column if not exists paid_entry_id uuid
  references public.financial_entries(id) on delete restrict;
create index if not exists commissions_fechamento_idx
  on public.commissions (paid_entry_id) where paid_entry_id is not null;

-- `add constraint` não é idempotente: derruba e recria (mesma nota da 0242).
alter table public.financial_entries drop constraint if exists financial_entries_origin_check;
alter table public.financial_entries
  add constraint financial_entries_origin_check
  -- ⚠️ `reversal` continua na lista: é o contra-lançamento do estorno, e
  -- omiti-lo aqui reprovaria toda comanda estornada que já existe.
  check (origin in ('manual', 'sale', 'reversal', 'recurring', 'commission'));



-- ---- uma comanda por agendamento (migration 9003) ----
-- A rota consulta antes de abrir, e isso resolve o toque repetido, não a
-- corrida: duas requisições simultâneas passam pelas duas consultas antes de
-- qualquer insert. Duas comandas abertas para o mesmo atendimento não dão erro
-- nenhum — são faturadas separadamente, e o cliente paga duas vezes.
--
-- Parcial nas duas pontas: comanda avulsa é a maioria e não se exclui entre si;
-- comanda cancelada deixa de valer, senão cancelar por engano trancaria o
-- agendamento para sempre.
update public.sales s
   set appointment_id = null
 where s.appointment_id is not null
   and s.status <> 'cancelled'
   and exists (
     select 1 from public.sales anterior
      where anterior.appointment_id = s.appointment_id
        and anterior.organization_id = s.organization_id
        and anterior.status <> 'cancelled'
        and (anterior.created_at, anterior.id) < (s.created_at, s.id)
   );

create unique index if not exists sales_agendamento_unico_idx
  on public.sales (organization_id, appointment_id)
  where appointment_id is not null and status <> 'cancelled';

-- ---- relatório financeiro (migrations 9004 + 9007) ----
-- Agrega NO BANCO: o PostgREST corta em 1000 linhas sem avisar, e somar na
-- aplicação devolve um número menor com cara de certo (medido nesta base:
-- R$ 141.436,00 em vez de R$ 641.103,60). Invoker, para a RLS de cada tabela
-- continuar valendo.
--
-- O corpo abaixo é o da 0247, que ACRESCENTOU `por_servico` e `por_cliente`
-- sem mudar a assinatura. O apêndice guarda o estado final, nunca as duas
-- versões empilhadas — senão quem lê o baseline vê a definição antiga
-- primeiro e conclui que ela é a que vale.
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
grant  execute on function public.fn_relatorio_financeiro(uuid, date, date) to authenticated, service_role;

-- ---- regra de comissao inativa (migration 9005) ----
-- A regra entra no catálogo financeiro genérico, que espera `is_active`.
-- Antes disto não havia porta nenhuma para cadastrar uma regra, e toda
-- comissão nascia 0% em toda instalação. Inativar e não apagar preserva a
-- resposta a "por que aquela comanda saiu com este percentual".
-- `name` é o rótulo que a pessoa lê na lista ("Ana em manicure"). Ele é
-- redundante com os dois alvos, e a redundância é deliberada: o catálogo
-- genérico exige um nome em toda entidade, e derivá-lo no servidor produziria um
-- texto que ninguém pode corrigir quando ficar ambíguo.
alter table public.commission_rules
  add column if not exists name text not null default 'Regra de comissão';

alter table public.commission_rules
  add column if not exists is_active boolean not null default true;

create index if not exists commission_rules_org_ativas_idx
  on public.commission_rules (organization_id, event_type_id, professional_id)
  where is_active;

comment on column public.commission_rules.is_active is
  'Regra em vigor. Inativa em vez de apagar: o percentual já aplicado está congelado no item, e o que se perderia é a resposta a "por que aquela comanda saiu com este percentual".';

-- ---- saldo de fidelidade (migration 9006) ----
-- O saldo é sum(points) do livro-razão, somado NO BANCO: o PostgREST corta em
-- 1000 linhas sem avisar, e saldo truncado vira prêmio negado a quem tinha
-- direito. Por CLIENTE, nunca agregado — o total geral esconde erros que se
-- compensam.
create or replace function public.fn_saldo_de_fidelidade(p_org uuid, p_contact uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(sum(points), 0)::integer
    from public.loyalty_ledger
   where organization_id = p_org
     and contact_id = p_contact;
$$;

revoke execute on function public.fn_saldo_de_fidelidade(uuid, uuid) from public, anon;
grant  execute on function public.fn_saldo_de_fidelidade(uuid, uuid) to authenticated, service_role;

comment on function public.fn_saldo_de_fidelidade(uuid, uuid) is
  'Saldo de pontos de um contato: sum(points) do livro-razão. Soma no banco porque o PostgREST corta em 1000 linhas sem avisar, e saldo truncado vira prêmio negado a quem tinha direito.';

-- ---- lancamento recorrente (migration 9008) ----
-- O molde de um lançamento que se repete todo mês. Não movimenta dinheiro:
-- quem nasce é uma linha PENDENTE em `financial_entries`. Nasce pendente e
-- nunca paga — o sistema sabe que a conta vence, não sabe se alguém pagou.
--
-- A idempotência é do BANCO (índice único por molde e competência), e não de
-- uma flag de "último gerado": esta resolveria o caso comum e falharia
-- exatamente no que importa, duas execuções simultâneas.
create table if not exists public.recurring_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null,
  account_id uuid not null references public.financial_accounts(id) on delete restrict,
  account_plan_id uuid references public.account_plans(id) on delete restrict,

  direction text not null check (direction in ('in', 'out')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'BRL' check (char_length(currency) = 3),

  -- 1 a 31. O que não existe no mês cai no último dia dele.
  day_of_month integer not null check (day_of_month between 1 and 31),

  -- Inativa-se, não se apaga: o molde explica os lançamentos que ele gerou.
  is_active boolean not null default true,

  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_entries_org_ativas_idx
  on public.recurring_entries (organization_id)
  where is_active;

alter table public.financial_entries
  add column if not exists recurring_entry_id uuid
  references public.recurring_entries(id) on delete set null;

-- A GARANTIA de que a mesma competência não nasce duas vezes. Parcial porque a
-- imensa maioria dos lançamentos não vem de molde nenhum.
create unique index if not exists financial_entries_recorrencia_competencia_idx
  on public.financial_entries (recurring_entry_id, entry_date)
  where recurring_entry_id is not null;

alter table public.recurring_entries enable row level security;
drop policy if exists tenant_isolation_recurring_entries_all on public.recurring_entries;
create policy tenant_isolation_recurring_entries_all on public.recurring_entries
  for all
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())
  with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  );
revoke all on public.recurring_entries from anon;

comment on table public.recurring_entries is
  'O molde de um lançamento que se repete todo mês. Não movimenta dinheiro: quem nasce é uma linha pendente em financial_entries. Mudar o molde não reescreve o que já foi gerado.';
comment on column public.recurring_entries.day_of_month is
  'Dia do mês, 1 a 31. O que não existe no mês cai no último dia dele — pular deixaria de cobrar o aluguel em fevereiro.';

-- ---- preco do tipo de evento (migration 9009) ----
-- O catálogo de serviços JÁ é o de tipos de agendamento (decisão da 0240), e
-- faltava o preço. Sem ele o balcão digita valor a cada item e o faturamento
-- em lote é impossível. NULLABLE: nem todo negócio tem preço fixo, e vazio
-- significa "digite na hora", que é o comportamento de antes desta migration.
-- É SEMENTE, nunca preço final — o item congela o seu próprio valor.
alter table public.calendar_event_types
  add column if not exists default_price_cents bigint
  check (default_price_cents is null or default_price_cents >= 0);

comment on column public.calendar_event_types.default_price_cents is
  'Preço padrão do serviço, em centavos. Vazio = digite na hora. É SEMENTE do item da comanda, nunca o preço dele: o item guarda o seu próprio unit_price_cents, congelado na inclusão.';

-- ---- a anonimização alcança o texto livre da comanda (migration 9010) ----
-- `sales.notes` é texto livre sobre uma pessoa identificável, e a cascata da
-- LGPD não o alcançava: anonimizar devolvia sucesso, a contagem fechava, o SLA
-- D+15 era marcado como cumprido e a anotação com o nome de quem exerceu o
-- direito continuava legível.
--
-- TRIGGER e não um passo dentro de `fn_lgpd_cascade_redact_contact`: a função
-- tem 180 linhas e vive no dump do upstream — reescrevê-la aqui criaria duas
-- cópias que divergem no primeiro conserto que o upstream fizer na dele. Mesma
-- decisão da 0174 (captações) e da 0210 (tarefas). A transição
-- `is_anonymized false → true` é o último fato da anonimização e roda na MESMA
-- transação dela.
--
-- ⚠️ A LINHA DA VENDA NÃO É APAGADA: ela é registro financeiro, e o invariante
-- 1 do módulo é que nada de dinheiro se apaga. Sai o TEXTO LIVRE — os três
-- campos em que alguém digita frase inteira. Valor, data e número ficam,
-- ligados a um contato que já não identifica ninguém.
create or replace function public.fn_redigir_comandas_do_contato_anonimizado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.sales
     set notes = null,
         cancel_reason = null,
         reverse_reason = null
   where organization_id = new.organization_id
     and contact_id = new.id
     and (notes is not null or cancel_reason is not null or reverse_reason is not null);
  return new;
end;
$$;

revoke execute on function public.fn_redigir_comandas_do_contato_anonimizado()
  from public, anon, authenticated;
grant execute on function public.fn_redigir_comandas_do_contato_anonimizado() to service_role;

drop trigger if exists trg_redigir_comandas_ao_anonimizar on public.contacts;
create trigger trg_redigir_comandas_ao_anonimizar
  after update of is_anonymized on public.contacts
  for each row
  when (new.is_anonymized and not coalesce(old.is_anonymized, false))
  execute function public.fn_redigir_comandas_do_contato_anonimizado();

-- Backfill: contato JÁ anonimizado antes desta migration nunca passou pelo
-- trigger, e o texto dele continua legível num clone que já usa o módulo. Sem
-- esta linha, o conserto só vale para quem for anonimizado de amanhã em diante.
update public.sales s
   set notes = null,
       cancel_reason = null,
       reverse_reason = null
  from public.contacts c
 where c.id = s.contact_id
   and c.organization_id = s.organization_id
   and c.is_anonymized
   and (s.notes is not null or s.cancel_reason is not null or s.reverse_reason is not null);

-- ---- fechamento de comissão (migration 9012) ----
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


notify pgrst, 'reload schema';
