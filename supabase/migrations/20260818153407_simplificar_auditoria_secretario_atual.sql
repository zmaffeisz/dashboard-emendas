-- A ficha é singleton; apenas o instante da alteração é necessário para auditoria.
-- Remover a FK evita um índice sem utilidade em uma tabela de uma única linha.

create or replace function private.atualizar_auditoria_secretario_atual()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

alter table public.secretario_atual
  drop column if exists atualizado_por;

notify pgrst, 'reload schema';
