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
