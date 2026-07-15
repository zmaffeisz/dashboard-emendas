create or replace function private.guard_profile_organizacional()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if private.is_admin_approved() then return new; end if;
  if new.papel is distinct from old.papel
    or new.aprovado is distinct from old.aprovado
    or new.escopo_organizacional is distinct from old.escopo_organizacional
    or new.secao_id is distinct from old.secao_id
    or new.contexto_modo is distinct from old.contexto_modo
    or new.contexto_secao_id is distinct from old.contexto_secao_id then
    raise exception 'Somente administradores podem alterar papel, aprovacao ou vinculo organizacional.' using errcode='42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_organizacional on public.profiles;
create trigger guard_profile_organizacional
before update on public.profiles
for each row execute function private.guard_profile_organizacional();

revoke all on function private.guard_profile_organizacional() from public;
