-- Licitações: secretaria padronizada + situação livre de até 55 caracteres.
-- Os antigos status manuais são convertidos para preservar a informação e a data Desde.

alter table public.itens
  add column if not exists status_lic_secretaria_id bigint references public.secretarias(id),
  add column if not exists status_lic_texto varchar(55);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'itens_status_lic_situacao_preenchida'
  ) then
    alter table public.itens add constraint itens_status_lic_situacao_preenchida check (
      (status_lic_secretaria_id is null and status_lic_texto is null)
      or (status_lic_secretaria_id is not null and nullif(btrim(status_lic_texto), '') is not null)
    );
  end if;
end $$;

with status_manual as (
  select so.id as status_id,
         se.id as secretaria_id,
         btrim(regexp_replace(so.nome, '^[^–-]+[–-][[:space:]]*', ''))::varchar(55) as texto
  from public.status_opcoes so
  join public.secretarias se on se.sigla = case when so.orgao = 'CONTROLADORIA' then 'CGM' else so.orgao end
  where so.contexto = 'licitacao' and coalesce(so.automatico, false) = false
)
update public.itens i
set status_lic_secretaria_id = sm.secretaria_id,
    status_lic_texto = sm.texto,
    status_lic_id = null
from status_manual sm
where i.status_lic_id = sm.status_id;

-- Mantém os dados dos itens de serviço periódico (armazenados em JSON) no mesmo formato novo.
with status_manual as (
  select so.id as status_id,
         se.id as secretaria_id,
         btrim(regexp_replace(so.nome, '^[^–-]+[–-][[:space:]]*', ''))::varchar(55) as texto
  from public.status_opcoes so
  join public.secretarias se on se.sigla = case when so.orgao = 'CONTROLADORIA' then 'CGM' else so.orgao end
  where so.contexto = 'licitacao' and coalesce(so.automatico, false) = false
)
update public.processos p
set servico_mensal_itens = (
  select jsonb_agg(case when sm.status_id is null then e.item else (e.item - 'status_lic_id') || jsonb_build_object('status_lic_secretaria_id', sm.secretaria_id, 'status_lic_texto', sm.texto) end order by e.ord) as itens
  from jsonb_array_elements(coalesce(p.servico_mensal_itens, '[]'::jsonb)) with ordinality e(item, ord)
  left join status_manual sm on sm.status_id = nullif(e.item->>'status_lic_id', '')::bigint
)
where p.servico_mensal_itens is not null;

with status_manual as (
  select so.id as status_id,
         se.id as secretaria_id,
         btrim(regexp_replace(so.nome, '^[^–-]+[–-][[:space:]]*', ''))::varchar(55) as texto
  from public.status_opcoes so
  join public.secretarias se on se.sigla = case when so.orgao = 'CONTROLADORIA' then 'CGM' else so.orgao end
  where so.contexto = 'licitacao' and coalesce(so.automatico, false) = false
)
update public.processos p
set servico_trimestral_itens = (
  select jsonb_agg(case when sm.status_id is null then e.item else (e.item - 'status_lic_id') || jsonb_build_object('status_lic_secretaria_id', sm.secretaria_id, 'status_lic_texto', sm.texto) end order by e.ord) as itens
  from jsonb_array_elements(coalesce(p.servico_trimestral_itens, '[]'::jsonb)) with ordinality e(item, ord)
  left join status_manual sm on sm.status_id = nullif(e.item->>'status_lic_id', '')::bigint
)
where p.servico_trimestral_itens is not null;

notify pgrst, 'reload schema';
