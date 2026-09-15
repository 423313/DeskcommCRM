-- 0262 — cliente pela agenda: quem tem horário marcado vira cliente, SE a organização ligar
--
-- Contribuição de @423313 (PR #867). Ajustes da triagem pela decisão do dono do
-- produto (opção B): a regra nasce DESLIGADA e cada organização a liga; horário
-- cancelado e falta não contam; a etiqueta tirada à mão é respeitada; e quando o
-- sistema põe a etiqueta, as automações enxergam.
--
-- O PROBLEMA, medido pelo autor: `lib/leads/nascimento-do-lead.ts` abre um lead
-- no funil `is_default` para TODO número que escreve. Num estúdio com 630
-- contatos e a agenda inteira migrada, quem é cliente há anos entra no funil de
-- captação a cada "oi" — e o funil de entrada deixa de significar "gente nova".
-- Não havia coluna, flag ou tag que registrasse a diferença.
--
-- O GATILHO É O AGENDAMENTO, NÃO O COMPARECIMENTO: combinar hora já é relação
-- estabelecida. Mas só o agendamento que CONTA — `fn_situacao_conta_como_atendimento`
-- é o espelho SQL de `LIBERAM_O_HORARIO` (lib/agenda/ocupados.ts): o que libera o
-- horário (cancelado, falta) não faz cliente.
--
-- POR QUE DESLIGADA POR PADRÃO. Ligar reescreve etiquetas de toda a organização,
-- e uma etiqueta nova é gatilho de automação ("Quando um contato ganhar uma
-- tag" → enviar WhatsApp). Uma atualização do produto não pode fazer isso por
-- conta própria em todas as organizações de todas as instalações. Por isso NÃO
-- há backfill neste arquivo nem no apêndice do baseline: o `update.sh` de quem
-- já roda não muda nenhum contato. O histórico é classificado por
-- `fn_definir_cliente_pela_agenda`, só na organização que liga, só no instante
-- em que liga, e SEM evento por contato.
--
-- A CHAVE: `organizations.settings.crm.cliente_pela_agenda`. Só o jsonb `true`
-- liga — ausente, `false`, `"true"` ou lixo é DESLIGADO. A mesma régua em
-- TypeScript é `clientePelaAgendaLigado` (lib/schemas/settings.ts). Não mora em
-- `settings.agenda` porque `fn_agenda_settings` substitui aquele objeto inteiro
-- e recusa chave extra.
--
-- POR QUE TRIGGER E NÃO CÓDIGO NO HANDLER (do autor, e continua valendo):
-- "`marcarAgendamentoHandler` é o único INSERT" é afirmação de estado que
-- envelhece; regra no chamador o próximo chamador não herda. E o trigger ouve
-- UPDATE também: pela tela o horário nasce `pending` ou `confirmed`, e a falta
-- só se registra depois — um trigger só de INSERT nunca veria cancelamento nem
-- falta.
--
-- A COLUNA MANDA, A ETIQUETA É DE TRABALHO. `first_service_at` decide o funil e
-- o selo; a tag `cliente` serve ao filtro, às automações e ao agente. A etiqueta
-- entra só na virada "não era cliente → é" e sai só na virada "era → deixou de
-- ser"; entre as duas, o sistema não a toca. É isso que respeita quem a tirou à
-- mão.
--
-- LAÇO DE RETORNO (quando a regra erra): a equipe tira a etiqueta à mão e isso é
-- respeitado; ou um administrador desliga a regra em Configurações › Tipos de
-- agendamento; e a auditoria `crm.cliente_pela_agenda_alterado` mostra quem
-- ligou e quantos contatos foram etiquetados.
--
-- CLONE QUE APLICOU A VERSÃO DO PR (só o banco de desenvolvimento do autor; ela
-- nunca esteve em release nem na main): `drop trigger if exists` + `create or
-- replace` substituem o trigger antigo. As etiquetas postas pelo backfill antigo
-- ficam — não há como distingui-las de uma etiqueta posta à mão.

-- ────────────────────────────────────────────────────────────────────────────
-- 1 · o fato, no contato
-- ────────────────────────────────────────────────────────────────────────────
alter table public.contacts
  add column if not exists first_service_at timestamptz;

comment on column public.contacts.first_service_at is
  'Início do primeiro agendamento que CONTA (fn_situacao_conta_como_atendimento). '
  'Mantida por trg_agendamento_marca_cliente/trg_agendamento_recalcula_cliente só '
  'enquanto organizations.settings.crm.cliente_pela_agenda = true; desligada, fica '
  'congelada e nenhuma tela a lê. Recalculada: cancelar ou marcar falta no único '
  'horário que conta a devolve a null. Preservada na anonimização.';

create index if not exists contacts_clientes_idx
  on public.contacts (organization_id, first_service_at desc)
  where first_service_at is not null;

-- ────────────────────────────────────────────────────────────────────────────
-- 2 · onde o cliente que volta a escrever entra
-- ────────────────────────────────────────────────────────────────────────────
-- COLUNA, E NÃO CHAVE EM `crm_pipelines.settings` (do autor): papel do funil
-- dentro da organização já mora em coluna (`is_default`, `is_archived`), e só
-- com índice único quem cobra a exclusividade é o banco.
alter table public.crm_pipelines
  add column if not exists is_client_pipeline boolean not null default false;

comment on column public.crm_pipelines.is_client_pipeline is
  'Onde nasce o negocio de quem JA e cliente (contacts.first_service_at nao nulo). '
  'So tem efeito com organizations.settings.crm.cliente_pela_agenda ligado. '
  'Espelha is_default: booleano, exclusivo por organizacao, com tela em /app/kanban. '
  'Ausente e estado VALIDO, e e o de toda instalacao nova: sem funil marcado, o '
  'cliente nasce no funil padrao. Um mesmo funil pode ser padrao E de clientes.';

-- Cópia literal da forma de `uniq_crm_pipelines_org_default`, que é
-- `where (is_default = true)` — sem recorte de arquivado.
create unique index if not exists uniq_crm_pipelines_org_client
  on public.crm_pipelines (organization_id) where (is_client_pipeline = true);

-- ────────────────────────────────────────────────────────────────────────────
-- 3 · a régua: que situação de agendamento conta como atendimento
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_situacao_conta_como_atendimento(p_status text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$ select p_status not in ('cancelled', 'no_show') $$;

comment on function public.fn_situacao_conta_como_atendimento(text) is
  'A agenda conta este status como atendimento? Espelho SQL de LIBERAM_O_HORARIO '
  '(lib/agenda/ocupados.ts): o que libera o horário não faz cliente. Vigiado por '
  'tests/invariants/cliente-nasce-do-agendamento.test.ts, que compara com '
  'SITUACOES_QUE_OCUPAM para todo status do vocabulário.';

revoke execute on function public.fn_situacao_conta_como_atendimento(text) from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4 · o recálculo de UM contato — a única régua de transição
-- ────────────────────────────────────────────────────────────────────────────
-- Usado pelo trigger (com evento) e pela ligação da regra (sem evento). Devolve
-- o que aconteceu, para quem liga poder contar.
create or replace function public.fn_recalcular_cliente_do_contato(p_org uuid, p_contact uuid, p_emitir boolean)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_etiqueta constant text := 'cliente';
  v_antes timestamptz;
  v_tags text[];
  v_depois timestamptz;
  v_novas text[];
  v_tinha boolean;
begin
  -- TRAVA O CONTATO ANTES DE LER A AGENDA. Na ordem inversa, duas marcações
  -- simultâneas do mesmo contato gravam um min() velho por cima do certo: em
  -- READ COMMITTED o min() lido DEPOIS da trava enxerga a marcação concorrente
  -- que já commitou.
  --
  -- Anonimizado e mesclado não recebem escrita derivada nova: sem esta guarda
  -- um agendamento posterior faria "Cliente Anonimizado #N" reaparecer
  -- etiquetado.
  select c.first_service_at, coalesce(c.tags, '{}'::text[])
    into v_antes, v_tags
    from public.contacts c
   where c.organization_id = p_org
     and c.id = p_contact
     and c.is_anonymized = false
     and c.is_merged_into is null
   for update;
  if not found then
    return 'ignorado';
  end if;

  select min(a.starts_at) into v_depois
    from public.calendar_appointments a
   where a.organization_id = p_org
     and a.contact_id = p_contact
     and public.fn_situacao_conta_como_atendimento(a.status);

  -- O caso comum — cliente antigo marcando a enésima hora — não escreve nada:
  -- `updated_at` não se move e o contato não vira ruído de realtime.
  if v_antes is not distinct from v_depois then
    return 'igual';
  end if;

  v_tinha := c_etiqueta = any(v_tags);
  -- A etiqueta só se mexe NA VIRADA. Entre as viradas o sistema não a toca, e
  -- é isso que respeita quem a tirou à mão: quem já é cliente e perdeu a
  -- etiqueta não passa por virada nenhuma ao marcar outra hora.
  --
  -- `array_append`/`array_remove` e não `||`: sem cast, o `||` lê o literal
  -- como ARRAY e morre em `malformed array literal` (medido pelo autor no CI).
  v_novas := case
    when v_antes is null and not v_tinha then array_append(v_tags, c_etiqueta)
    when v_depois is null then array_remove(v_tags, c_etiqueta)
    else v_tags
  end;

  update public.contacts
     set first_service_at = v_depois,
         tags = v_novas,
         updated_at = now()
   where organization_id = p_org
     and id = p_contact;

  if v_antes is null then
    if v_tinha then
      return 'virou_cliente';
    end if;
    if p_emitir then
      -- O MESMO formato que o app emite (app/api/v1/contacts/_handler.ts e
      -- lib/automation/actions/add-tag.ts): `added_tags` + `tags`.
      --
      -- SEM `service_origin`: `emit_event` o carimba sozinho para
      -- contact.tag_added, e o recusaria (42501) vindo de sessão autenticada.
      -- SEM `caused_by_rule`: a automação TEM de ver este evento.
      -- Trigger nunca faz HTTP: a linha vai para event_log e o worker consome.
      perform public.emit_event(
        'contact.tag_added',
        'contact',
        p_contact,
        jsonb_build_object('added_tags', jsonb_build_array(c_etiqueta), 'tags', to_jsonb(v_novas)),
        jsonb_build_object('actor_type', 'system', 'actor_id', 'trg_agendamento_marca_cliente'),
        p_org
      );
    end if;
    return 'etiquetado';
  end if;

  if v_depois is null then
    return case when v_tinha then 'desetiquetado' else 'deixou_de_ser_cliente' end;
  end if;
  return 'mudou_a_data';
end $$;

revoke execute on function public.fn_recalcular_cliente_do_contato(uuid, uuid, boolean) from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5 · o trigger — condicional ao interruptor, em INSERT e UPDATE
-- ────────────────────────────────────────────────────────────────────────────
-- Os nomes são os do PR (`fn_marcar_contato_como_cliente`,
-- `trg_agendamento_marca_cliente`); o corpo é outro.
--
-- A SERIALIZAÇÃO COM QUEM LIGA A REGRA É UM ADVISORY LOCK DA ORGANIZAÇÃO, e não
-- uma trava de linha em `organizations`. O trigger toma a versão COMPARTILHADA
-- (não espera ninguém a não ser a ligação); `fn_definir_cliente_pela_agenda`
-- toma a EXCLUSIVA. Uma trava de linha (`for key share` aqui, `for update` lá)
-- serializaria o mesmo par, mas o `for update` na linha da organização barra
-- TODO insert com FK para ela enquanto o histórico é classificado — mensagem,
-- event_log, auditoria — e a trava compartilhada de linha escreve na tupla da
-- organização a cada alteração de agendamento, em toda organização, ligada ou
-- não. O advisory serializa só as duas partes que precisam.
create or replace function public.fn_marcar_contato_como_cliente()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ligado boolean;
begin
  -- Espera a ligação em voo commitar. O SELECT abaixo é outro comando, então
  -- em READ COMMITTED tira snapshot novo e enxerga a chave já gravada.
  perform pg_advisory_xact_lock_shared(hashtextextended(new.organization_id::text, 262));

  -- Comparar com 'true'::jsonb nunca lança erro. Um `::boolean` abortaria a
  -- marcação do horário se alguém gravasse lixo na chave.
  select (o.settings -> 'crm' -> 'cliente_pela_agenda') = 'true'::jsonb
    into v_ligado
    from public.organizations o
   where o.id = new.organization_id;

  if v_ligado is not true then
    return null;
  end if;

  if new.contact_id is not null then
    perform public.fn_recalcular_cliente_do_contato(new.organization_id, new.contact_id, true);
  end if;

  -- O horário trocou de contato (mesclagem de contatos repõe `contact_id` por
  -- UPDATE): quem perdeu o horário também é recalculado.
  if tg_op = 'UPDATE'
     and old.contact_id is not null
     and old.contact_id is distinct from new.contact_id then
    perform public.fn_recalcular_cliente_do_contato(old.organization_id, old.contact_id, true);
  end if;

  return null;
end $$;

-- Função de trigger não exige EXECUTE de quem dispara o INSERT: revogar das
-- DUAS origens (o grant a PUBLIC e o grant direto a `anon` do ALTER DEFAULT
-- PRIVILEGES do baseline) não quebra nada.
revoke execute on function public.fn_marcar_contato_como_cliente() from public, anon, authenticated;

drop trigger if exists trg_agendamento_marca_cliente on public.calendar_appointments;
create trigger trg_agendamento_marca_cliente
  after insert on public.calendar_appointments
  for each row
  when (new.contact_id is not null)
  execute function public.fn_marcar_contato_como_cliente();

drop trigger if exists trg_agendamento_recalcula_cliente on public.calendar_appointments;
create trigger trg_agendamento_recalcula_cliente
  after update of status, starts_at, contact_id on public.calendar_appointments
  for each row
  when (old.status is distinct from new.status
        or old.starts_at is distinct from new.starts_at
        or old.contact_id is distinct from new.contact_id)
  execute function public.fn_marcar_contato_como_cliente();

-- ────────────────────────────────────────────────────────────────────────────
-- 6 · ligar e desligar — e classificar o histórico ao ligar
-- ────────────────────────────────────────────────────────────────────────────
-- Chamada por app/actions/settings/definirClientePelaAgenda.ts com o client da
-- SESSÃO: `auth.uid()` é o que permite conferir papel aqui dentro. Nunca pelo
-- admin client, e nunca com `.from('organizations').update` — a única policy de
-- escrita da tabela é de platform admin, e o UPDATE de um admin de tenant casa
-- ZERO linhas e devolve sucesso.
--
-- PAPEL `admin`, e não `manager` como a vizinha `fn_agenda_settings`: aquela é
-- configuração reversível que não reescreve dado; ligar esta reescreve as
-- etiquetas de todo contato com histórico, e desligar não desfaz.
--
-- O HISTÓRICO É CLASSIFICADO SEM EVENTO. No estúdio medido pelo autor seriam
-- 630 `contact.tag_added` de uma vez, e uma regra "Quando um contato ganhar uma
-- tag" → enviar WhatsApp dispararia centenas de mensagens que ninguém pediu,
-- contra a doutrina de anti-banimento. O rastro é UMA linha de auditoria (na
-- action) com as contagens que esta função devolve.
--
-- DESLIGAR só grava `false`: nenhum contato muda, `first_service_at` fica
-- congelada e nenhuma tela a lê. RELIGAR recalcula todos — quem virou cliente
-- enquanto estava desligada ganha a etiqueta, quem teve todos os horários
-- cancelados perde, e quem já tinha data não passa por virada (então a
-- etiqueta tirada à mão continua fora).
create or replace function public.fn_definir_cliente_pela_agenda(p_org uuid, p_ligado boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings jsonb;
  v_antes boolean;
  v_contato uuid;
  v_r text;
  v_ganharam integer := 0;
  v_perderam integer := 0;
begin
  if auth.uid() is null
     or p_org is null
     or p_ligado is null
     or not public.fn_role_at_least(p_org, 'admin')
     or not public.fn_support_write_allowed(p_org) then
    raise exception 'cliente_pela_agenda_forbidden' using errcode = '42501';
  end if;
  if not public.fn_session_mfa_proven() then
    raise exception 'cliente_pela_agenda_mfa_required' using errcode = '42501';
  end if;

  -- EXCLUSIVA, ANTES de ler qualquer coisa: espera todo INSERT/UPDATE de
  -- agendamento desta organização que já passou pelo trigger (e segura a
  -- compartilhada até commitar), e faz os seguintes esperarem esta transação.
  -- Os comandos abaixo tiram snapshot novo e enxergam o que já commitou.
  perform pg_advisory_xact_lock(hashtextextended(p_org::text, 262));

  -- Sem `for update` na linha da organização: a exclusiva acima já serializa
  -- esta função consigo mesma e com o trigger, e a trava de linha barraria todo
  -- insert com FK para a organização durante o laço. O UPDATE abaixo toma só a
  -- trava que não conflita com essas FKs.
  select o.settings into v_settings
    from public.organizations o
   where o.id = p_org;
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;
  v_antes := (v_settings -> 'crm' -> 'cliente_pela_agenda') = 'true'::jsonb;

  -- Mescla dentro de `crm`: o que mais morar ali (hoje nada) não é apagado, e
  -- um `crm` que não seja objeto é substituído em vez de abortar.
  update public.organizations
     set settings = jsonb_set(
           coalesce(settings, '{}'::jsonb),
           '{crm}',
           (case when jsonb_typeof(settings -> 'crm') = 'object' then settings -> 'crm' else '{}'::jsonb end)
             || jsonb_build_object('cliente_pela_agenda', p_ligado),
           true)
   where id = p_org;

  -- O histórico, SÓ na virada desligado → ligado, SÓ desta organização.
  if p_ligado and v_antes is not true then
    for v_contato in
      select c.id
        from public.contacts c
       where c.organization_id = p_org
         and c.is_anonymized = false
         and c.is_merged_into is null
         and (c.first_service_at is not null
              or exists (select 1 from public.calendar_appointments a
                          where a.organization_id = p_org and a.contact_id = c.id))
       order by c.id
    loop
      v_r := public.fn_recalcular_cliente_do_contato(p_org, v_contato, false);
      if v_r = 'etiquetado' then
        v_ganharam := v_ganharam + 1;
      elsif v_r = 'desetiquetado' then
        v_perderam := v_perderam + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ligado', p_ligado,
    'mudou', coalesce(v_antes, false) <> p_ligado,
    'ganharam_etiqueta', v_ganharam,
    'perderam_etiqueta', v_perderam,
    'clientes', (select count(*) from public.contacts
                  where organization_id = p_org and first_service_at is not null
                    and is_anonymized = false and is_merged_into is null)
  );
end $$;

revoke execute on function public.fn_definir_cliente_pela_agenda(uuid, boolean) from public, anon;
grant  execute on function public.fn_definir_cliente_pela_agenda(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
