-- A mesma função protege o estado atual e o histórico. O campo documento_path
-- existe apenas no histórico; por isso o acesso precisa ficar dentro de um bloco
-- executado exclusivamente para inventario_movimentacoes.

begin;

create or replace function public._proteger_historico_inventario()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if current_setting('app.inventario_movimentacao_autorizada', true) is distinct from '1' then
    raise exception 'O estado do inventario so pode ser alterado por uma movimentacao registrada.';
  end if;

  if tg_table_name = 'inventario_movimentacoes' and tg_op = 'INSERT' then
    if not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'inventario-movimentacoes'
        and o.name = new.documento_path
    ) then
      raise exception 'O documento da movimentacao nao foi encontrado no armazenamento.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function public._proteger_historico_inventario() is
  'Protege estado e histórico do inventário; valida documento somente ao inserir em inventario_movimentacoes.';

notify pgrst, 'reload schema';

commit;
