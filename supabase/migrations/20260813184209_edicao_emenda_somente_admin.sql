-- Restringe a edição dos dados centrais de uma emenda a administradores aprovados.
-- INSERT/DELETE mantêm as políticas organizacionais existentes.
drop policy if exists scoped_update on public.emendas;

create policy scoped_update
on public.emendas
for update
to authenticated
using (
  (select private.is_admin_approved())
  and private.can_access_domain(secao_id, array['dashboard']::text[], 'edit')
)
with check (
  (select private.is_admin_approved())
  and private.can_access_domain(secao_id, array['dashboard']::text[], 'edit')
);

-- emenda_itens.emenda é um rótulo legado. A FK emenda_id continua sendo a fonte de
-- verdade, mas manter o rótulo sincronizado evita divergência em exportações antigas.
create or replace function private.sync_emenda_numero_legado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.emenda is distinct from old.emenda then
    update public.emenda_itens
       set emenda = new.emenda
     where emenda_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_emenda_numero_legado on public.emendas;
create trigger trg_sync_emenda_numero_legado
after update of emenda on public.emendas
for each row
execute function private.sync_emenda_numero_legado();
