-- 0333_voice_calls_sip (nasceu 0252 no PR #677; renumerada)
--
-- Unifica `crm_calls` (nosso módulo SIP/AudioSocket, ainda não mergeado —
-- PR #677) dentro de `voice_calls` (WhatsApp/WaCalls, mergeada via #628/#697,
-- migrations 0233-0236). A própria triagem do #677 apontou o problema: duas
-- tabelas de chamada que não conversam — o histórico de uma ligação SIP não
-- aparecia junto do de uma ligação de WhatsApp na ficha do mesmo cliente.
--
-- `voice_calls` foi desenhada só pra WhatsApp: `channel_session_id`
-- (sessão pareada) e `wacalls_call_id` são `not null`, e o vocabulário de
-- `status` (`starting|ringing|connected|ended`) é literal do BINÁRIO WaCalls
-- upstream, não nosso — não se toca nisso (mesmo espírito do `end_reason`,
-- que a 0233 já deixa livre de propósito por ser vocabulário de terceiro).
--
-- O que este arquivo faz:
--   1. Relaxa as duas colunas WhatsApp-only pra nullable (SIP não tem sessão
--      pareada nem id do binário WaCalls).
--   2. Acrescenta `provider` (discriminador) + colunas SIP/IA, todas aditivas
--      e nullable — toda linha de WhatsApp existente fica com elas em null.
--   3. Migra as linhas de `crm_calls` (dados de teste do módulo SIP, ainda
--      não em produção real) pro novo formato e derruba a tabela antiga —
--      dentro do mesmo arquivo pra não deixar as duas tabelas concorrentes
--      vivas em nenhum commit.
--   4. Estende `fn_lgpd_cascade_redact_contact`: sem isto, anonimizar um
--      contato deixaria a TRANSCRIÇÃO da ligação (que pode conter o nome
--      dele, falado em voz) intacta, ligada ao `contact_id` — mesmo buraco
--      de reidentificação que a 0235 já fechou pra `peer_phone`.
--
-- Doutrina deste repo: migration não se edita depois de aplicada em algum
-- ambiente — o que se corrige, corrige-se pra frente. Tudo aqui é
-- idempotente (`if not exists`/`if exists`) pra rodar seguro num clone que
-- ainda não tem `crm_calls` (a tabela nunca chegou a ser mergeada em `main`)
-- e também num ambiente (esta VPS) onde ela já existe com dados de teste.

-- ─── 1. relaxa colunas WhatsApp-only ────────────────────────────────────────
alter table public.voice_calls alter column channel_session_id drop not null;
alter table public.voice_calls alter column wacalls_call_id drop not null;

-- ─── 2. colunas novas, aditivas ─────────────────────────────────────────────
alter table public.voice_calls
  add column if not exists provider text not null default 'wacalls',
  add column if not exists asterisk_channel_id text,
  add column if not exists lead_id uuid references public.crm_leads(id) on delete set null,
  add column if not exists ai_agent_id uuid references public.ai_agents(id) on delete set null,
  add column if not exists handled_by text,
  add column if not exists transcript jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.voice_calls drop constraint if exists voice_calls_provider_check;
alter table public.voice_calls
  add constraint voice_calls_provider_check
  check (provider = any (array['wacalls', 'sip']));

alter table public.voice_calls drop constraint if exists voice_calls_handled_by_check;
alter table public.voice_calls
  add constraint voice_calls_handled_by_check
  check (handled_by is null or handled_by = any (array['human', 'ai', 'ai_then_human']));

create index if not exists idx_voice_calls_asterisk_channel
  on public.voice_calls(asterisk_channel_id) where asterisk_channel_id is not null;
create index if not exists idx_voice_calls_lead
  on public.voice_calls(lead_id) where lead_id is not null;

comment on column public.voice_calls.provider is
  'Discrimina a origem da ligação: ''wacalls'' (WhatsApp, #628/#697) ou ''sip'' (Asterisk/AudioSocket, #677). Todo o resto do schema é compartilhado.';
comment on column public.voice_calls.status is
  'Vocabulário do provider ''wacalls'' (binário WaCalls upstream) reaproveitado por ''sip'': ringing=tocando, connected=atendida, ended=terminal (granularidade extra em end_reason). Ver mapeamento no worker (lib/voip).';

-- ─── 3. migra dados de crm_calls (se existir) e derruba a tabela antiga ────
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'crm_calls') then

    insert into public.voice_calls (
      id, organization_id, contact_id, lead_id, provider, direction, status,
      end_reason, peer_phone, asterisk_channel_id, ai_agent_id, handled_by,
      transcript, metadata, started_at, answered_at, ended_at, duration_ms,
      created_by, created_at, updated_at
    )
    select
      c.id, c.organization_id, c.contact_id, c.lead_id, 'sip', c.direction,
      case c.status
        when 'ringing' then 'ringing'
        when 'in_progress' then 'connected'
        else 'ended'
      end,
      case c.status
        when 'no_answer' then 'timeout'
        when 'busy' then 'busy'
        when 'failed' then 'failed'
        when 'canceled' then 'cancelled'
        when 'completed' then 'user_ended'
        else null
      end,
      case c.direction when 'outbound' then c.to_number else c.from_number end,
      c.asterisk_channel_id, c.ai_agent_id, c.handled_by, c.transcript,
      coalesce(c.metadata, '{}'::jsonb), c.started_at, c.answered_at,
      c.ended_at, c.duration_seconds * 1000, c.assigned_to_user_id,
      c.created_at, c.updated_at
    from public.crm_calls c
    on conflict (id) do nothing;

    drop table public.crm_calls;
  end if;
end $$;

-- ─── 4. LGPD: a transcrição entra na cascata de redação ────────────────────
-- (redefine a function inteira — mesmo padrão da 0235, que já fez isto pra
-- acrescentar o bloco de voice_calls original; aqui só o UPDATE de
-- voice_calls ganha `transcript = null` a mais. O corpo é a definição
-- VIGENTE da main no momento da renumeração, e não a de quando este PR
-- nasceu: redefinir a partir de uma cópia velha desfaria em silêncio o que
-- a main consertou na cascata desde então.)
CREATE OR REPLACE FUNCTION "public"."fn_lgpd_cascade_redact_contact"("p_organization_id" "uuid", "p_contact_id" "uuid", "p_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_already bool;
  v_counts jsonb := '{}'::jsonb;
  v_media_paths text[] := '{}';
  v_anon_label text;
  v_count int;
begin
  perform public.fn_service_lock(p_organization_id,p_contact_id);
  select is_anonymized into v_already
    from contacts
    where id = p_contact_id and organization_id = p_organization_id;

  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  if v_already then
    return jsonb_build_object('already_anonymized', true, 'counts', v_counts, 'media_paths', v_media_paths);
  end if;

  v_anon_label := 'Cliente Anonimizado #' || substring(p_contact_id::text from 1 for 8);

  -- Collect media storage paths (we only delete what we own — media_storage_path)
  select coalesce(array_agg(distinct media_storage_path) filter (where media_storage_path is not null), '{}')
    into v_media_paths
    from messages
    where organization_id = p_organization_id
      and conversation_id in (
        select id from conversations
          where contact_id = p_contact_id and organization_id = p_organization_id
      );

  -- 1. contacts (irreversible)
  update contacts set
    name = v_anon_label,
    display_name = v_anon_label,
    email = null,
    -- email_normalized NÃO entra: é GENERATED ALWAYS AS (lower(trim(email)))
    -- e o Postgres recusa escrita nela — a linha acima já a zera por derivação.
    -- Com a atribuição, o cascade INTEIRO abortava e nada era anonimizado.
    phone_number = null,
    cpf_encrypted = null,
    cpf_hash = null,
    birthdate = null,
    is_anonymized = true,
    anonymized_at = now(),
    consent = '{}'::jsonb,
    source_metadata = '{}'::jsonb,
    tags = '{}'::text[],
    updated_at = now()
  where id = p_contact_id and organization_id = p_organization_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('contacts', v_count);

  -- 2. conversations metadata + preview strip
  update conversations set
    metadata = '{}'::jsonb,
    last_message_preview = null,
    updated_at = now()
  where contact_id = p_contact_id and organization_id = p_organization_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('conversations', v_count);

  -- 3. messages: redact body + null media + strip metadata (preserve status/timestamps/conversation_id)
  update messages set
    body = '[mensagem anonimizada]',
    media_url = null,
    media_mime = null,
    media_size_bytes = null,
    media_storage_path = null,
    metadata = '{}'::jsonb,
    updated_at = now()
  where organization_id = p_organization_id
    and conversation_id in (
      select id from conversations
        where contact_id = p_contact_id and organization_id = p_organization_id
    );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('messages', v_count);

  -- 4. crm_lead_activities — strip payload, metadata E reason (migration 0071).
  --    `reason` é texto livre escrito por LLM sobre a conversa do lead: supor que
  --    nunca conterá um nome é a suposição que falha. `evidence` NÃO é limpa —
  --    guarda só ids, e as linhas apontadas são redigidas por conta própria.
  update crm_lead_activities set
    payload = '{}'::jsonb,
    metadata = '{}'::jsonb,
    reason = null
  where organization_id = p_organization_id
    and (
      contact_id = p_contact_id
      or lead_id in (
        select lead_id from crm_lead_links
          where target_kind = 'contact'
            and target_id = p_contact_id
            and organization_id = p_organization_id
      )
      or lead_id in (
        select id from crm_leads
          where contact_id = p_contact_id and organization_id = p_organization_id
      )
    );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('activities', v_count);

  -- 5. crm_leads — strip title/description/custom_fields/source_metadata/tags but PRESERVE pipeline/stage/value
  update crm_leads set
    title = v_anon_label,
    description = null,
    custom_fields = '{}'::jsonb,
    source_metadata = '{}'::jsonb,
    tags = '{}'::text[],
    updated_at = now()
  where organization_id = p_organization_id
    and (
      contact_id = p_contact_id
      or id in (
        select lead_id from crm_lead_links
          where target_kind = 'contact'
            and target_id = p_contact_id
            and organization_id = p_organization_id
      )
    );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('leads', v_count);

  -- 6. orders — PRESERVE values + status + timestamps. Strip personal fields from payload jsonb
  --    and replace customer_external_id with null (FK-safe; soft de-link). Keep contact_id null.
  update orders set
    payload = (coalesce(payload, '{}'::jsonb))
      - 'customer'
      - 'customer_name'
      - 'customer_email'
      - 'customer_phone'
      - 'shipping_address'
      - 'billing_address'
      - 'contact_identification',
    customer_external_id = null,
    contact_id = null,
    is_anonymized = true,
    updated_at = now()
  where organization_id = p_organization_id
    and contact_id = p_contact_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('orders', v_count);

  -- 7. enqueue media for async deletion (idempotent via unique (bucket, object_path))
  if array_length(v_media_paths, 1) > 0 then
    insert into storage_redaction_queue (organization_id, request_id, bucket, object_path)
    select p_organization_id, p_request_id, 'whatsapp-media', path
      from unnest(v_media_paths) as path
      where path is not null and length(path) > 0
    on conflict (bucket, object_path) do nothing;
  end if;

  -- 7b. voice_calls — o TELEFONE de quem falou ao telefone (migration 0235).
  --
  -- `peer_phone` é `not null` e guarda o número da outra ponta: depois de
  -- anonimizar o contato, ele sobrevivia ligado ao `contact_id` e reidentificava
  -- a pessoa que pediu para ser esquecida. É o mesmo argumento que a foto de
  -- perfil já tinha (ver o bloco do avatar em `lib/lgpd/redact-cascade.ts`):
  -- anonimizar em toda parte menos numa é não ter anonimizado.
  --
  -- O que fica: direção, status, motivo do fim, marcas de tempo e duração. Um
  -- registro de "houve uma chamada de 12 minutos" sem número e sem dono não
  -- identifica ninguém e é o que sustenta a métrica do atendente e a fatura.
  -- `peer_phone` é NOT NULL, então recebe o rótulo, não `null`.
  update voice_calls set
    transcript = null,
    peer_phone = v_anon_label,
    owner_user_id = null,
    created_by = null,
    updated_at = now()
  where organization_id = p_organization_id
    and contact_id = p_contact_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('voice_calls', v_count);

  -- 8. dense audit row
  insert into api_audit_log (organization_id, action, actor_user_id, resource_type, resource_id, metadata, bypassed_rls)
  values (
    p_organization_id,
    'lgpd.redact_executed',
    null,
    'contact',
    p_contact_id,
    jsonb_build_object(
      'cascaded_to', v_counts,
      'media_queued', coalesce(array_length(v_media_paths, 1), 0),
      'request_id', p_request_id
    ),
    true
  );

  return jsonb_build_object(
    'already_anonymized', false,
    'counts', v_counts,
    'media_paths', v_media_paths
  );
end;
$$;
revoke all on function public.fn_lgpd_cascade_redact_contact(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.fn_lgpd_cascade_redact_contact(uuid,uuid,uuid) to service_role;

notify pgrst, 'reload schema';
