-- Atualiza a unidade de um item de emenda e propaga para registros
-- operacionais vinculados ao mesmo emenda_item_id.

begin;

create or replace function public.editar_emenda_item_unidade_cascade(
  p_emenda_item_id uuid,
  p_unidade text,
  p_unidade_entrega text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unidade text := nullif(btrim(coalesce(p_unidade, '')), '');
  v_unidade_entrega text := nullif(btrim(coalesce(p_unidade_entrega, '')), '');
  v_unidade_norm text;
  v_unidade_entrega_norm text;
  v_unidade_exec text;
  v_unidade_id bigint;
  v_unidade_entrega_id bigint;
  v_item_id_count integer := 0;
  v_exec_count integer := 0;
  v_inv_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Login obrigatorio para editar unidade do item da emenda.'
      using errcode = '42501';
  end if;

  if not public.can_access_tab('dashboard', 'edit') then
    raise exception 'Sem permissao para editar itens de emendas.'
      using errcode = '42501';
  end if;

  if p_emenda_item_id is null then
    raise exception 'Item de emenda invalido.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.emenda_itens where id = p_emenda_item_id) then
    raise exception 'Item de emenda nao encontrado.'
      using errcode = 'P0002';
  end if;

  v_unidade_norm := regexp_replace(upper(coalesce(v_unidade, '')), '\s+', '', 'g');
  v_unidade_entrega_norm := regexp_replace(upper(coalesce(v_unidade_entrega, '')), '\s+', '', 'g');

  if v_unidade is not null and v_unidade_norm not like 'V_RIAS' then
    select id into v_unidade_id
    from public.unidades
    where lower(nome) = lower(v_unidade)
    order by ativo desc, id
    limit 1;

    if v_unidade_id is null then
      insert into public.unidades(nome, ativo)
      values (v_unidade, true)
      returning id into v_unidade_id;
    end if;
  end if;

  if v_unidade_entrega is not null and v_unidade_entrega_norm not like 'V_RIAS' then
    select id into v_unidade_entrega_id
    from public.unidades
    where lower(nome) = lower(v_unidade_entrega)
    order by ativo desc, id
    limit 1;

    if v_unidade_entrega_id is null then
      insert into public.unidades(nome, ativo)
      values (v_unidade_entrega, true)
      returning id into v_unidade_entrega_id;
    end if;
  end if;

  update public.emenda_itens
  set unidade_beneficiada = v_unidade,
      unidade_entrega = v_unidade_entrega,
      unidade_beneficiada_id = v_unidade_id,
      unidade_entrega_id = v_unidade_entrega_id
  where id = p_emenda_item_id;

  v_unidade_exec := case
    when v_unidade_entrega is not null and v_unidade_entrega_norm not like 'V_RIAS' then v_unidade_entrega
    when v_unidade is not null then v_unidade
    else v_unidade_entrega
  end;

  update public.atas_execucao
  set unidade = v_unidade_exec
  where emenda_item_id = p_emenda_item_id;
  get diagnostics v_exec_count = row_count;

  if coalesce(v_unidade_entrega_id, v_unidade_id) is not null then
    update public.itens
    set unidade_destino_id = coalesce(v_unidade_entrega_id, v_unidade_id)
    where emenda_item_id = p_emenda_item_id;
    get diagnostics v_item_id_count = row_count;

    update public.inventario_ac
    set unidade_id = coalesce(v_unidade_entrega_id, v_unidade_id)
    where emenda_item_id = p_emenda_item_id;
    get diagnostics v_inv_count = row_count;
  end if;

  return jsonb_build_object(
    'emenda_item_id', p_emenda_item_id,
    'unidade', v_unidade,
    'unidade_entrega', v_unidade_entrega,
    'unidade_execucao', v_unidade_exec,
    'unidade_id', v_unidade_id,
    'unidade_entrega_id', v_unidade_entrega_id,
    'atas_execucao_atualizadas', v_exec_count,
    'itens_atualizados', v_item_id_count,
    'inventario_atualizado', v_inv_count
  );
end;
$$;

revoke all on function public.editar_emenda_item_unidade_cascade(uuid, text, text) from public, anon;
grant execute on function public.editar_emenda_item_unidade_cascade(uuid, text, text) to authenticated, service_role;

comment on function public.editar_emenda_item_unidade_cascade(uuid, text, text)
  is 'Updates emenda item unit fields and propagates the delivery unit to linked ATA executions, items, and inventory.';

notify pgrst, 'reload schema';

commit;
