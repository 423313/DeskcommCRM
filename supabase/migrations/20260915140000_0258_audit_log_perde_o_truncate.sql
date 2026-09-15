-- 0258 — o audit log perde o TRUNCATE, e o append-only vira verdade inteira
--
-- ─── O problema ─────────────────────────────────────────────────────────────
--
-- `CLAUDE.md` afirma, sobre `api_audit_log`: "Audit é append-only, e isso é do
-- SCHEMA e não da prosa: nenhum papel tem GRANT de UPDATE/DELETE — nem
-- `service_role`". A afirmação é verdadeira e insuficiente, e o próprio arquivo
-- traz a ressalva: `TRUNCATE` **está** concedido a `anon`, `authenticated` e
-- `service_role`.
--
-- O privilégio é resíduo do `pg_dump`. `api_audit_log` é a única tabela do dump
-- que recebe lista enumerada de privilégios em vez de `GRANT ALL` — alguém
-- tirou UPDATE e DELETE da lista e deixou TRUNCATE, que estava ali no meio.
--
-- ─── Por que isto importa, se não é alcançável pela REST ────────────────────
--
-- Não é: o PostgREST não emite `TRUNCATE`, então não é buraco de superfície, e
-- esta migration não fecha um caminho de ataque que estivesse aberto ao
-- browser. O que ela conserta é a distância entre o que o schema garante e o
-- que a documentação promete a quem audita a instalação.
--
-- E a distância não é decorativa. `TRUNCATE` é o ÚNICO privilégio concedido que
-- apaga linha de auditoria, e ele apaga a tabela INTEIRA:
--
--   • não passa por RLS — RLS filtra linha, e `TRUNCATE` não olha linha;
--   • não passa pelas policies (que só existem para INSERT e SELECT);
--   • não deixa rastro na própria tabela, porque não sobra tabela.
--
-- Quem tem a service key — o app, os workers, o cron — passava a ter, sem
-- precisar de mais nada, um caminho de uma instrução para zerar a auditoria de
-- todas as organizações da instalação. O expurgo LEGÍTIMO já tem dono e já é
-- limitado: `fn_expurgar_auditoria_vencida` (migration 0167) não tem seletor de
-- linha, tem piso de 90 dias NO CORPO, e registra a própria erosão em
-- `retention.sweep_run`.
--
-- ─── Por que revogar não quebra ninguém ─────────────────────────────────────
--
-- Nenhum código do repositório emite `TRUNCATE` contra esta tabela (varrido em
-- `lib/`, `app/`, `workers/`, `scripts/`, `tests/`). O único apagamento em uso é
-- o `delete` de dentro da `security definer` do expurgo, que roda como `postgres`
-- (owner) e não depende destes grants.
--
-- O owner (`postgres`) continua podendo tudo, aqui como em qualquer tabela —
-- a garantia sempre foi sobre os papéis do PostgREST, nunca absoluta.
--
-- ─── Forma ──────────────────────────────────────────────────────────────────
--
-- `revoke` é idempotente por natureza: revogar o que já não existe não é erro.
-- Portável em `psql` puro, sem transação explícita, como as demais.

revoke truncate on table public.api_audit_log from anon, authenticated, service_role;

comment on table public.api_audit_log is
  'L-10: Append-only, e agora do schema por inteiro — sem UPDATE, sem DELETE e (migration 0258) sem TRUNCATE para anon/authenticated/service_role. O único apagamento é fn_expurgar_auditoria_vencida (0167), com piso de 90 dias no corpo. Retencao default 5 anos, configuravel em AUDIT_LOG_RETENTION_DAYS.';

notify pgrst, 'reload schema';
