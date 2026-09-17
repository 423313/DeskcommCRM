-- ---- o financeiro fecha as duas portas que a varredura do banco apontou (migration 9010) ----
--
-- Duas coisas que o módulo estreou com o gate verde, e que só apareceram quando
-- `pnpm test:db` rodou sobre ele pela primeira vez:
--
-- 1. `fn_proximo_numero_de_comanda` é `security definer`, recebe a organização
--    POR ARGUMENTO e não conferia de quem ela é. Um usuário logado no tenant A
--    chamava a RPC com o id do tenant B e recebia o próximo número de comanda
--    dele — que é o VOLUME de vendas do vizinho, um número por chamada. Era
--    exatamente a pergunta da 0149, e a resposta era "não confere".
--    Conserto: `fn_user_org_ids()` no corpo, e `stable` porque ela não escreve
--    nada — o `volatile` do default fazia a varredura de definer que ESCREVE
--    cobrá-la como se ela pudesse.
--
-- 2. `sales.notes` é texto livre sobre uma pessoa identificável (FK para
--    `contacts`) e a anonimização da LGPD não o alcançava. A rota devolvia
--    sucesso, a contagem fechava, o SLA D+15 era marcado como cumprido, e a
--    anotação com o nome de quem exerceu o direito continuava legível.
--
-- Por que TRIGGER e não um passo dentro de `fn_lgpd_cascade_redact_contact`: a
-- função tem 180 linhas e vive no dump do upstream. Acrescentar o passo aqui
-- exigiria reescrevê-la inteira no apêndice, e a partir daí existiriam duas
-- cópias que divergem no primeiro conserto que o upstream fizer na dele. É a
-- mesma decisão, escrita pelos mesmos motivos, da 0174 (captações) e da 0210
-- (tarefas). O gancho é a transição `is_anonymized false → true` na própria
-- `contacts`, que é o último fato da anonimização e roda na MESMA transação.
--
-- ⚠️ A LINHA DA VENDA NÃO É APAGADA, e isso é deliberado: ela é registro
-- financeiro (obrigação fiscal) e o invariante 1 do módulo é que nada de
-- dinheiro se apaga. O que sai é o TEXTO LIVRE sobre a pessoa — `notes`,
-- `cancel_reason` e `reverse_reason`, os três campos em que alguém digita
-- frase inteira. Valor, data e número continuam de pé, ligados a um contato
-- que já não identifica ninguém.

-- ─── 1 · a numeração confere de quem é a organização do argumento ────────────
create or replace function public.fn_proximo_numero_de_comanda(p_org uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
begin
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

-- ─── 2 · a anonimização alcança o texto livre da comanda ─────────────────────
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

notify pgrst, 'reload schema';
