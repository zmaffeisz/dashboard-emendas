-- Admin-only user management helpers.
-- The frontend calls this RPC from the Users tab; the function validates that
-- the caller is an approved admin before touching auth.users.

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = auth, public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Login obrigatorio para excluir usuario.'
      using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'Usuario invalido.'
      using errcode = '22023';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Voce nao pode excluir a propria conta por aqui.'
      using errcode = '42501';
  end if;

  if not private.is_admin_approved() then
    raise exception 'Apenas administradores aprovados podem excluir contas.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'Conta nao encontrada.'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.papel = 'admin'
  ) and not exists (
    select 1
    from public.profiles p
    where p.id <> p_user_id
      and p.papel = 'admin'
      and p.aprovado is true
  ) then
    raise exception 'Nao e possivel excluir o ultimo administrador aprovado.'
      using errcode = '42501';
  end if;

  delete from public.user_tab_permissions
  where user_id = p_user_id;

  delete from auth.users
  where id = p_user_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated, service_role;

comment on function public.admin_delete_user(uuid)
  is 'Deletes an Auth user and cascading profile data after approved-admin validation.';

notify pgrst, 'reload schema';
