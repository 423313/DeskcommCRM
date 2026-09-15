-- 0261 — o título do evento pessoal do Google sai do alcance do membro
--
-- ─── O que estava aberto, e foi medido ──────────────────────────────────────
--
-- `public.calendar_external_events` é o espelho da agenda PESSOAL de quem
-- atende: o compromisso que a pessoa sincronizou só para bloquear o próprio
-- horário — "Consulta médica", "Terapia", "entrevista de emprego". Numa clínica,
-- é o terapeuta que sincroniza a agenda pessoal e tem o texto legível pela
-- recepção inteira.
--
-- O papel `authenticated` tinha SELECT de TABELA nesta tabela, e a view
-- `calendar_selected_external_events` era `select e.*` — com o `title` dentro.
-- Num banco instalado do zero (`baseline.sql` da v1.26.0), um membro de OUTRO
-- papel, inclusive Somente leitura, lia o compromisso particular do colega:
--
--     select title from public.calendar_external_events …   → "Terapia sigilosa"
--
-- tanto direto na tabela quanto pela view; e
-- `has_column_privilege('authenticated','calendar_external_events','title','SELECT')`
-- respondia `true`.
--
-- ─── Por que o conserto é no PRIVILÉGIO, e não na policy ────────────────────
--
-- A policy de leitura é da ORGANIZAÇÃO de propósito: a grade da equipe mostra a
-- ocupação do colega, e é isso que a agenda existe para fazer. Restringir a
-- policy ao dono da conexão apagaria a ocupação de todo mundo — consertaria a
-- privacidade quebrando a agenda. O que o CRM usa de um evento de colega é
-- ocupado/livre (`starts_at`, `ends_at`, `transparency`, `status`); o `title`
-- não tem consumidor nenhum na tela. Isso é vigiado do lado da tela por
-- `tests/unit/ocupacao-do-google-nao-expoe-titulo.test.ts` (as leituras da tela
-- da Agenda e da rota de agendamentos, pela tabela ou pela view, não pedem a
-- coluna) e por `tests/e2e/agenda-ocupacao-do-google-na-grade.spec.ts` (o título
-- não aparece no texto nem no HTML da grade); do lado do banco, pela própria view
-- sem `title`.
--
-- Então o SELECT de `authenticated` sai da TABELA e volta COLUNA A COLUNA, sem o
-- `title`. Revogar a coluna sem revogar a tabela não faria nada: privilégio de
-- tabela cobre todas as colunas, e o `GRANT` enumerado do dump só ACRESCENTA.
--
-- ─── O que continua ao alcance do membro, e por quê ─────────────────────────
--
-- O `title` NÃO é o único dado pessoal do espelho. `external_calendar_id` é o
-- `id` do CalendarList do Google (`fn_google_catalog` grava `it->>'id'`), e na
-- agenda PRINCIPAL — a que conta por padrão — esse id é o e-mail da conta
-- conectada. A RLS de `calendar_connections` esconde essa conta de um colega que
-- não é gestor; esta tabela e a view a entregam a todo membro da organização.
-- `external_event_id` e `ical_uid`, identificadores do Google, também seguem
-- concedidos.
--
-- Esta migration deixa isso aberto, e por escrito. A view é `security_invoker` e
-- passa `e.external_calendar_id` a `fn_google_counts_for_conflicts`: revogar a
-- coluna faz TODA leitura da view por membro falhar com `permission denied for
-- table calendar_external_events` — a do próprio dono inclusive (medido). Fechar
-- pede servir a ocupação por função `security definer` que devolva só intervalo e
-- situação (o padrão da 0260) e mudar as duas leituras que usam a view
-- (`app/app/agenda/page.tsx` e `app/api/v1/agenda/agendamentos/route.ts`): é
-- decisão do dono, fora deste conserto. Um caso do invariante mede que o colega
-- segue lendo o id — no dia em que alguém fechar, ele fica vermelho e esta seção
-- muda junto.
--
-- ─── A view precisa ser recriada, não substituída no lugar ──────────────────
--
-- `calendar_selected_external_events` era `select e.*`. Com `security_invoker`,
-- o Postgres confere privilégio de coluna EM NOME DO INVOCADOR para toda coluna
-- referenciada na definição — inclusive as de um `e.*` já expandido quando a
-- view nasceu. Deixá-la assim faria TODA leitura de ocupação por membro falhar
-- com `permission denied` no `title`. E `create or replace view` não aceita
-- tirar coluna do meio (o Postgres recusa: "cannot drop columns from view"):
-- daí o `drop` + `create` com lista explícita. A lista explícita é o conserto de
-- fundo — `e.*` era a forma de a próxima coluna nascer exposta.
--
-- ─── Quem ainda alcança o título ────────────────────────────────────────────
--
-- `service_role`, que esta migration não toca, mantém SELECT/UPDATE na coluna.
-- Mas o produto não grava nem lê nome nenhum nessa coluna: desde a 0225 (v1.17.0,
-- PR #613) o sincronizador grava `title` NULO — `fn_google_calendar`, ação
-- `item`, insere `null` e, no `on conflict`, faz `set title=null`, zerando o que
-- encontra; o executor (`lib/agenda/google/calendar-executor.ts`) já manda
-- `title: null` — e nenhuma função do banco lê a coluna (a única que a menciona é
-- essa, para gravá-la nula). O invariante prende isso: como `service_role`, o
-- sincronizador grava dois eventos com `title` no payload e o espelho fica com
-- os dois títulos nulos.
--
-- Nenhum login de usuário lê o título depois desta migration — nem o colega, nem
-- o próprio dono da conexão. Nenhuma
-- tela mostra o título de um evento externo — os guardas de tela citados acima
-- vigiam isso —, então não há leitura de titular a preservar nos papéis do
-- PostgREST; se um dia houver uma tela do titular, ela nasce com função
-- `security definer` própria e o invariante muda junto, de propósito.
--
-- ─── O que esta migration NÃO faz, de propósito ─────────────────────────────
--
-- * Não apaga os títulos que sobraram de sincronizações anteriores à v1.17.0 (a
--   0225 deixou de gravá-los, mas não anulou os que já estavam lá). O que se
--   fecha é a LEITURA por login de usuário. Anular o resíduo é decisão do dono e
--   sai em migration própria, não de carona num conserto de permissão.
-- * Não concede nada a `anon`, que segue sem privilégio nesta tabela desde a
--   0177 (`revoke all … from anon`).
--
-- ─── Forma ──────────────────────────────────────────────────────────────────
--
-- `revoke`, `grant`, `drop view if exists` são idempotentes: o `update.sh` de um
-- clone reaplica à vontade. O apêndice rotulado do `baseline.sql` traz o mesmo
-- bloco para quem instala do zero. Vigiado por
-- `tests/invariants/titulo-do-evento-pessoal-fora-do-alcance.test.ts`.
--
-- Duas consequências da forma, para quem mexer depois:
-- * O grant é por LISTA de colunas: coluna nova no espelho nasce SEM SELECT para
--   `authenticated`. É o lado seguro, e é uma decisão — o invariante reprova até
--   alguém escrever se ela vai ao alcance do membro (entra no grant e na lista da
--   view, que andam juntos, senão `select *` na view vira 42501) ou não. Estar no
--   grant não quer dizer "não é pessoal": ver `external_calendar_id`, acima.
-- * Quem ler esta view de dentro de função não pode usar `begin atomic`: a
--   dependência registrada no catálogo impede o `drop view` + `create view` que
--   o `update.sh` reaplica. `fn_agenda_ocupacao_google_do_dono` (0260) e
--   `fn_google_counts_for_conflicts` são `language sql` sem `begin atomic`.

revoke select on public.calendar_external_events from authenticated;

grant select (
  id, organization_id, connection_id, external_calendar_id, external_event_id,
  starts_at, ends_at, is_all_day, status, transparency, external_updated_at,
  created_at, updated_at, ical_uid, seen_generation, recurring_event_id,
  original_start_time
) on public.calendar_external_events to authenticated;

drop view if exists public.calendar_selected_external_events;

create view public.calendar_selected_external_events
with (security_invoker = true) as
select
  e.id, e.organization_id, e.connection_id, e.external_calendar_id,
  e.external_event_id, e.starts_at, e.ends_at, e.is_all_day, e.status,
  e.transparency, e.external_updated_at, e.created_at, e.updated_at,
  e.ical_uid, e.seen_generation, e.recurring_event_id, e.original_start_time
from public.calendar_external_events e
where e.status <> 'cancelled'
  and public.fn_google_counts_for_conflicts(e.organization_id, e.connection_id, e.external_calendar_id);

revoke all on public.calendar_selected_external_events from public, anon;

grant select on public.calendar_selected_external_events to authenticated, service_role;

notify pgrst, 'reload schema';
