-- Corrige permissões do ciclo de entregas/AF no PostgREST.
-- Idempotente: pode ser reaplicado com segurança.

begin;

grant select, insert, update, delete on public.itens_status_historico to authenticated;
grant select, insert, update, delete on public.itens_entregas_unidades to authenticated;

alter table public.itens_status_historico enable row level security;

drop policy if exists "leitura autenticada itens_status_historico" on public.itens_status_historico;
create policy "leitura autenticada itens_status_historico"
  on public.itens_status_historico
  for select
  to authenticated
  using (is_approved_profile());

drop policy if exists "escrita itens_status_historico" on public.itens_status_historico;
create policy "escrita itens_status_historico"
  on public.itens_status_historico
  for all
  to authenticated
  using (
    can_access_tab('itens'::text, 'edit'::text)
    or can_access_tab('contratos'::text, 'edit'::text)
    or can_access_tab('dashboard'::text, 'edit'::text)
    or can_access_tab('atas'::text, 'edit'::text)
  )
  with check (
    can_access_tab('itens'::text, 'edit'::text)
    or can_access_tab('contratos'::text, 'edit'::text)
    or can_access_tab('dashboard'::text, 'edit'::text)
    or can_access_tab('atas'::text, 'edit'::text)
  );

notify pgrst, 'reload schema';

commit;
