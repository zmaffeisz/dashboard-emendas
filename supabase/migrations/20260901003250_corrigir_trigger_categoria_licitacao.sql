-- Cada tabela possui colunas de origem diferentes. Os blocos aninhados evitam que o
-- PL/pgSQL tente resolver um campo inexistente do record NEW em outro tipo de trigger.
create or replace function private.herdar_categoria_licitacao()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  v_categoria_id bigint;
begin
  if tg_table_name = 'itens' then
    if new.processo_id is not null then
      select p.categoria_id into v_categoria_id
        from public.processos p where p.id = new.processo_id;
      new.categoria_id := v_categoria_id;
    end if;
  elsif tg_table_name = 'contratos' then
    if new.processo_id is not null then
      select p.categoria_id into v_categoria_id
        from public.processos p where p.id = new.processo_id;
      new.categoria_id := v_categoria_id;
    end if;
  elsif tg_table_name = 'atas_itens' then
    if new.contrato_id is not null then
      select c.categoria_id into v_categoria_id
        from public.contratos c where c.id = new.contrato_id;
      new.categoria_id := v_categoria_id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.herdar_categoria_licitacao() from public, anon, authenticated;
