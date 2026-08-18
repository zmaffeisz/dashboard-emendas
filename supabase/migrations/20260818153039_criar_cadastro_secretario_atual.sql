-- Cadastro institucional único do secretário vigente.
-- Documentos devem consultar esta linha em vez de manter nome/cargo hardcoded.

create table if not exists public.secretario_atual (
  id smallint primary key default 1,
  nome text not null,
  cargo text,
  secretaria text,
  ato_nomeacao text,
  email text,
  telefone text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,
  constraint secretario_atual_registro_unico check (id = 1)
);

comment on table public.secretario_atual is
  'Ficha única do secretário vigente, reutilizada na geração de documentos.';

alter table public.secretario_atual enable row level security;

revoke all on table public.secretario_atual from anon;
grant select, insert, update on table public.secretario_atual to authenticated;

drop policy if exists read_secretario_atual on public.secretario_atual;
create policy read_secretario_atual on public.secretario_atual
  for select to authenticated
  using (true);

drop policy if exists insert_secretario_atual on public.secretario_atual;
create policy insert_secretario_atual on public.secretario_atual
  for insert to authenticated
  with check (
    id = 1
    and (select private.is_admin_approved())
  );

drop policy if exists update_secretario_atual on public.secretario_atual;
create policy update_secretario_atual on public.secretario_atual
  for update to authenticated
  using ((select private.is_admin_approved()))
  with check (
    id = 1
    and (select private.is_admin_approved())
  );

create or replace function private.atualizar_auditoria_secretario_atual()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

revoke all on function private.atualizar_auditoria_secretario_atual() from public;

drop trigger if exists trg_secretario_atual_auditoria on public.secretario_atual;
create trigger trg_secretario_atual_auditoria
before insert or update on public.secretario_atual
for each row execute function private.atualizar_auditoria_secretario_atual();

notify pgrst, 'reload schema';
