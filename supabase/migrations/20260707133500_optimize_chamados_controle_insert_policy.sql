drop policy if exists chamados_controle_insert on public.chamados_controle;

create policy chamados_controle_insert
on public.chamados_controle
for insert
to anon, authenticated
with check (
  protocolo is not null
  and (
    status = 'Aguardando abertura'
    or (
      (select auth.role()) = 'authenticated'
      and public.can_access_tab('chamados-novos', 'edit')
    )
  )
);
