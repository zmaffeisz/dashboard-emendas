-- A aba Emendas monta o andamento público a partir de public.itens e inclui
-- secretarias(sigla) na mesma consulta PostgREST. Sem SELECT neste catálogo,
-- a relação embutida faz a consulta inteira falhar para anon.
drop policy if exists public_emenda_flow_secretarias on public.secretarias;
create policy public_emenda_flow_secretarias
on public.secretarias
for select
to anon
using (
  exists (
    select 1
    from public.itens i
    where i.status_lic_secretaria_id = secretarias.id
      and i.emenda_item_id is not null
  )
);

-- Somente as opções efetivamente usadas pelo painel público ficam visíveis.
-- Os demais contextos do catálogo continuam internos.
drop policy if exists public_emenda_flow_status_opcoes on public.status_opcoes;
create policy public_emenda_flow_status_opcoes
on public.status_opcoes
for select
to anon
using (
  (
    contexto = 'emenda_item'
    and exists (
      select 1
      from public.emenda_itens ei
      where ei.status_id = status_opcoes.id
    )
  )
  or
  (
    contexto = 'licitacao'
    and exists (
      select 1
      from public.itens i
      where i.status_lic_id = status_opcoes.id
        and i.emenda_item_id is not null
    )
  )
);

grant select on public.secretarias, public.status_opcoes to anon;
