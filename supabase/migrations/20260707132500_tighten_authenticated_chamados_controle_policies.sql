drop policy if exists chamados_controle_auth_insert on public.chamados_controle;
drop policy if exists chamados_controle_auth_update on public.chamados_controle;
drop policy if exists chamados_controle_auth_delete on public.chamados_controle;

create policy chamados_controle_auth_insert
on public.chamados_controle
for insert
to authenticated
with check (
  protocolo is not null
  and public.can_access_tab('chamados-novos', 'edit')
);

create policy chamados_controle_auth_update
on public.chamados_controle
for update
to authenticated
using (public.can_access_tab('chamados-novos', 'edit'))
with check (
  protocolo is not null
  and public.can_access_tab('chamados-novos', 'edit')
);

create policy chamados_controle_auth_delete
on public.chamados_controle
for delete
to authenticated
using (public.can_access_tab('chamados-novos', 'edit'));
