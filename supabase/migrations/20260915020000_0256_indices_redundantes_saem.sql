-- 0256 — três índices que não pagam o próprio aluguel
--
-- ─── O problema ─────────────────────────────────────────────────────────────
--
-- O advisor de desempenho apontou "índice duplicado em `ai_models`" numa VPS de
-- cliente. A varredura do baseline confirmou o caso e achou mais dois do mesmo
-- feitio — índice cujo trabalho JÁ é feito por outro, integralmente.
--
-- Índice redundante não é neutro: ele custa em TODO insert e update da tabela,
-- ocupa disco, e entra no cálculo do planner sem nunca ser a melhor escolha.
-- Numa VPS de 1 vCPU e disco pequeno — que é o alvo do kit self-host — isso é
-- pago todo dia por ninguém.
--
-- ─── Os três, e por que cada um é redundante ────────────────────────────────
--
-- 1. `ai_models_provider_model_unique (provider, model_id)`, criado pela
--    migration 0127, contra a constraint `ai_models_unique (provider, model_id)`
--    que já existia no schema original. Mesmas colunas, mesma ordem, os dois
--    UNIQUE. A 0127 acrescentou o índice e não removeu a constraint — é o que o
--    advisor viu. **Some o índice, fica a constraint**: constraint é a forma mais
--    forte (dá nome à violação, aparece em `pg_constraint`, não pode ser
--    derrubada por engano com `drop index`), e nenhum código cita qualquer um
--    dos dois nomes.
--
-- 2. `idx_crm_lead_links_lead (lead_id)` contra
--    `uniq_crm_lead_links_lead_target_link (lead_id, target_kind, target_id,
--    link_kind)`. Um btree responde por qualquer PREFIXO das suas colunas, e
--    `lead_id` é o primeiro do unique: toda consulta que o índice de uma coluna
--    atende, o de quatro atende também.
--
-- 3. `calendar_connections_org_pessoa_idx (organization_id, user_id)` contra
--    `calendar_connections_conta_key (organization_id, user_id, provider,
--    account_email)`. Mesmo argumento de prefixo.
--
-- ─── Por que o caso 1 vai dentro de um guard ────────────────────────────────
--
-- Só é seguro derrubar o índice se a constraint estiver LÁ. Num clone onde a
-- `ai_models_unique` tenha sido removida à mão, o índice da 0127 é a única coisa
-- impedindo dois cadastros do mesmo modelo — derrubá-lo abriria a porta para a
-- duplicata que a 0127 foi criada para fechar. O `DO` confere antes de agir.
--
-- Os casos 2 e 3 não precisam de guard: `drop index if exists` sobre um índice
-- que já não existe é silencioso, e o índice que os cobre é declarado no mesmo
-- baseline, alguns blocos acima.

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'ai_models_unique'
       and conrelid = 'public.ai_models'::regclass
  ) then
    drop index if exists public.ai_models_provider_model_unique;
  end if;
end $$;

drop index if exists public.idx_crm_lead_links_lead;
drop index if exists public.calendar_connections_org_pessoa_idx;
