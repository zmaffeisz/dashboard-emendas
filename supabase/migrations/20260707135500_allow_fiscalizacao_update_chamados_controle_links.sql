drop policy if exists chamados_controle_auth_update on public.chamados_controle;
create policy chamados_controle_auth_update
on public.chamados_controle
for update
to authenticated
using (
  public.can_access_tab('chamados-novos', 'edit')
  or public.can_access_tab('fiscalizacao', 'edit')
  or public.can_access_tab('contratos', 'edit')
)
with check (
  protocolo is not null
  and (
    public.can_access_tab('chamados-novos', 'edit')
    or public.can_access_tab('fiscalizacao', 'edit')
    or public.can_access_tab('contratos', 'edit')
  )
);
