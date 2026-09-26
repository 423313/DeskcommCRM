-- 0419 — rascunho sugerido por integração na conversa (issue #1611)
--
-- A mensagem ao cliente precisa sair de uma PESSOA, mas quem sabe o que dizer é
-- outro sistema (ERP que sabe que a cobrança venceu, documento faltando…).
-- Hoje a integração só tem duas saídas ruins: enviar por token (a mensagem
-- aparece como "Sistema", sem pessoa decidindo) ou copiar-e-colar.
--
-- Esta tabela guarda o TEXTO SUGERIDO no servidor. Quem tem token da
-- organização cria; a caixa de entrada abre por link com o texto no campo e o
-- aviso de origem; NADA é enviado sem o clique de quem atende. O link nunca
-- carrega o texto (`?texto=` iria para proxy, histórico do navegador e relatório
-- de erro — e viraria engenharia social contra o atendente).
--
-- Campos: org + conversa + corpo + origem + quem criou (token) + validade +
-- quem consumiu. `consumed_at` é o "já usado" da régua de leitura.
create table if not exists public.conversation_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  body text not null,
  source text not null default 'integracao',
  created_by_api_token_id uuid references public.api_tokens (id) on delete set null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint conversation_drafts_body_check
    check (char_length(body) >= 1 and char_length(body) <= 4096)
);

create index if not exists conversation_drafts_conversation
  on public.conversation_drafts (organization_id, conversation_id, created_at desc);

-- RLS de organização: a leitura da caixa de entrada é pela sessão do atendente
-- (RLS), a escrita da integração é pelo service role com `organization_id`
-- PROGRAMÁTICO na rota. A policy cobre o caminho da sessão nos DOIS sentidos —
-- `for all` porque o consumo do rascunho é um UPDATE feito pela sessão.
alter table public.conversation_drafts enable row level security;

drop policy if exists tenant_isolation_conversation_drafts_all
  on public.conversation_drafts;
create policy tenant_isolation_conversation_drafts_all
  on public.conversation_drafts
  for all to authenticated
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));
