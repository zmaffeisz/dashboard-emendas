-- Hardening de segurança/LGPD.
-- Mantém fluxos existentes, mas exige aprovação administrativa para novas contas.

alter table public.profiles
  add column if not exists aprovado boolean;

update public.profiles
set aprovado = true
where aprovado is null;

alter table public.profiles
  alter column aprovado set default false,
  alter column aprovado set not null;

create or replace function public.is_approved_profile()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (p.aprovado is true or p.papel = 'admin')
  );
$$;

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_admin_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.papel = 'admin'
      and p.aprovado is true
  );
$$;

revoke all on function public.is_approved_profile() from public, anon;
revoke all on function private.is_admin_approved() from public, anon;
grant execute on function public.is_approved_profile() to authenticated, service_role;
grant execute on function private.is_admin_approved() to authenticated, service_role;

create or replace function public.can_access_tab(p_tab text, p_action text)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_papel text;
  v_aprovado boolean;
  v_perm record;
begin
  if auth.uid() is null then
    return false;
  end if;

  select papel, aprovado
    into v_papel, v_aprovado
  from public.profiles
  where id = auth.uid();

  if coalesce(v_aprovado, false) is not true then
    return false;
  end if;

  if v_papel = 'admin' then
    return true;
  end if;

  select * into v_perm
  from public.user_tab_permissions
  where user_id = auth.uid()
    and tab_key = p_tab;

  if not found then
    return false;
  end if;

  if p_action = 'view' then
    return v_perm.can_view = true;
  end if;

  if p_action = 'edit' then
    return v_perm.can_view = true and v_perm.can_edit = true;
  end if;

  return false;
end;
$$;

alter function public._unidade_key(text) set search_path = public;
alter function public.fill_chamado_id_by_protocolo() set search_path = public;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.rls_auto_enable() to service_role;

revoke execute on function public._unidade_key(text) from public, anon;
revoke execute on function public.can_access_tab(text, text) from public, anon;
revoke execute on function public.fill_chamado_id_by_protocolo() from public, anon;
grant execute on function public.can_access_tab(text, text) to authenticated, service_role;
grant execute on function public._unidade_key(text) to authenticated, service_role;

drop policy if exists "usuarios autenticados veem perfis" on public.profiles;
drop policy if exists "usuarios editam proprio perfil" on public.profiles;
drop policy if exists "Admins podem alterar papel de qualquer perfil" on public.profiles;
drop policy if exists "usuario insere proprio perfil" on public.profiles;
drop policy if exists "usuarios veem proprio perfil" on public.profiles;
drop policy if exists "admins veem perfis" on public.profiles;
drop policy if exists "admins alteram perfis" on public.profiles;

create policy "usuarios veem proprio perfil"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "admins veem perfis"
  on public.profiles
  for select
  to authenticated
  using (private.is_admin_approved());

create policy "usuario insere proprio perfil"
  on public.profiles
  for insert
  to authenticated
  with check (
    id = auth.uid()
    and papel = 'visualizador'
    and aprovado is false
  );

create policy "usuarios editam proprio perfil"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and papel = (select p.papel from public.profiles p where p.id = auth.uid())
    and aprovado = (select p.aprovado from public.profiles p where p.id = auth.uid())
  );

create policy "admins alteram perfis"
  on public.profiles
  for update
  to authenticated
  using (private.is_admin_approved())
  with check (private.is_admin_approved());

drop policy if exists "admins_manage_tab_perms" on public.user_tab_permissions;
drop policy if exists "users_read_own_tab_perms" on public.user_tab_permissions;

create policy "admins_manage_tab_perms"
  on public.user_tab_permissions
  for all
  to authenticated
  using (private.is_admin_approved())
  with check (private.is_admin_approved());

create policy "users_read_own_tab_perms"
  on public.user_tab_permissions
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_approved_profile()
  );

drop function if exists public.is_admin_approved();

do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and cmd = 'SELECT'
      and qual = 'true'
      and 'authenticated' = any(roles)
      and tablename <> 'profiles'
  loop
    execute format(
      'alter policy %I on %I.%I using (public.is_approved_profile())',
      pol.policyname, pol.schemaname, pol.tablename
    );
  end loop;
end $$;

drop policy if exists "anon_insert_anexos" on public.chamados_anexos;
drop policy if exists "auth_select_anexos" on public.chamados_anexos;
drop policy if exists "auth_update_anexos" on public.chamados_anexos;
drop policy if exists "auth_delete_anexos" on public.chamados_anexos;

create policy "anon_insert_anexos"
  on public.chamados_anexos
  for insert
  to anon, authenticated
  with check (
    storage_path like 'chamados/%'
    and mime_type in ('image/jpeg', 'image/jpg', 'image/png', 'image/webp')
    and tamanho_bytes <= 5242880
  );

create policy "auth_select_anexos"
  on public.chamados_anexos
  for select
  to authenticated
  using (
    public.is_approved_profile()
    and (
      public.can_access_tab('chamados', 'view')
      or public.can_access_tab('chamados-novos', 'view')
      or public.can_access_tab('fiscalizacao', 'view')
      or public.can_access_tab('chamados', 'edit')
      or public.can_access_tab('chamados-novos', 'edit')
      or public.can_access_tab('fiscalizacao', 'edit')
    )
  );

create policy "auth_update_anexos"
  on public.chamados_anexos
  for update
  to authenticated
  using (
    public.can_access_tab('chamados', 'edit')
    or public.can_access_tab('chamados-novos', 'edit')
    or public.can_access_tab('fiscalizacao', 'edit')
  )
  with check (
    storage_path like 'chamados/%'
    and (
      public.can_access_tab('chamados', 'edit')
      or public.can_access_tab('chamados-novos', 'edit')
      or public.can_access_tab('fiscalizacao', 'edit')
    )
  );

create policy "auth_delete_anexos"
  on public.chamados_anexos
  for delete
  to authenticated
  using (
    public.can_access_tab('chamados', 'edit')
    or public.can_access_tab('chamados-novos', 'edit')
    or public.can_access_tab('fiscalizacao', 'edit')
  );

drop policy if exists "anon_upload_chamados_fotos" on storage.objects;
drop policy if exists "auth_select_chamados_fotos" on storage.objects;
drop policy if exists "auth_delete_chamados_fotos" on storage.objects;

create policy "anon_upload_chamados_fotos"
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'chamados-fotos'
    and (storage.foldername(name))[1] = 'chamados'
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

create policy "auth_select_chamados_fotos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chamados-fotos'
    and public.is_approved_profile()
    and (
      public.can_access_tab('chamados', 'view')
      or public.can_access_tab('chamados-novos', 'view')
      or public.can_access_tab('fiscalizacao', 'view')
      or public.can_access_tab('chamados', 'edit')
      or public.can_access_tab('chamados-novos', 'edit')
      or public.can_access_tab('fiscalizacao', 'edit')
    )
  );

create policy "auth_delete_chamados_fotos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chamados-fotos'
    and (
      public.can_access_tab('chamados', 'edit')
      or public.can_access_tab('chamados-novos', 'edit')
      or public.can_access_tab('fiscalizacao', 'edit')
    )
  );

alter view if exists public.vw_processos_resumo set (security_invoker = true);

revoke all on all tables in schema public from anon;
grant select on public.emendas to anon;
grant select on public.emenda_itens to anon;
grant select on public.vw_emendas_saldo to anon;
grant select on public.vw_processos_resumo to anon;
grant insert on public.chamados_anexos to anon;
grant execute on function public.abrir_chamado_publico(
  text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

revoke all on table public.chamados_backup_21jun from anon, authenticated;
revoke all on table public.chamados_controle_backup_21jun from anon, authenticated;
revoke all on table public.contratos_backup_21jun from anon, authenticated;
revoke all on table public.contratos_fiscalizadores_backup_21jun from anon, authenticated;
revoke all on table public.contratos_historico_backup_21jun from anon, authenticated;
revoke all on table public.contratos_vigencias_backup_21jun from anon, authenticated;
revoke all on table public.emenda_itens_backup_21jun from anon, authenticated;
revoke all on table public.emendas_backup_21jun from anon, authenticated;
revoke all on table public.inventario_ac_backup_21jun from anon, authenticated;
revoke all on table public.profiles_backup_21jun from anon, authenticated;
revoke all on table public.sancoes_solicitadas_backup from anon, authenticated;
revoke all on table public.sancoes_solicitadas_backup_21jun from anon, authenticated;
revoke all on table public.termos_ateste_backup from anon, authenticated;
revoke all on table public.termos_ateste_backup_21jun from anon, authenticated;
revoke all on table public.user_tab_permissions_backup_21jun from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
