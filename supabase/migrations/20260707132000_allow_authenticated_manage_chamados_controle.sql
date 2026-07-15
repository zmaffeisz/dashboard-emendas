drop policy if exists chamados_controle_auth_insert on public.chamados_controle;
drop policy if exists chamados_controle_auth_update on public.chamados_controle;
drop policy if exists chamados_controle_auth_delete on public.chamados_controle;

create policy chamados_controle_auth_insert
on public.chamados_controle
for insert
to authenticated
with check (protocolo is not null);

create policy chamados_controle_auth_update
on public.chamados_controle
for update
to authenticated
using (true)
with check (protocolo is not null);

create policy chamados_controle_auth_delete
on public.chamados_controle
for delete
to authenticated
using (true);
