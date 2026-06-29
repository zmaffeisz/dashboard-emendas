-- Exclui uma linha de emenda que nao sera executada e limpa os rastros
-- operacionais criados a partir dela. A funcao faz dry-run por padrao para
-- permitir confirmacao no frontend antes da exclusao real.

begin;

create or replace function public.excluir_emenda_item_cascade(
  p_emenda_item_id uuid,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item_ids uuid[] := '{}';
  v_entrega_ids uuid[] := '{}';
  v_nf_ids uuid[] := '{}';
  v_emp_ids uuid[] := '{}';
  v_proc_ids bigint[] := '{}';
  v_sancao_ids uuid[] := '{}';
  v_exists boolean := false;
  v_execucao_real boolean := false;
  v_counts jsonb := '{}'::jsonb;
  v_deleted jsonb := '{}'::jsonb;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Login obrigatorio para excluir item de emenda.'
      using errcode = '42501';
  end if;

  if not public.can_access_tab('dashboard', 'edit') then
    raise exception 'Sem permissao para excluir itens de emendas.'
      using errcode = '42501';
  end if;

  if p_emenda_item_id is null then
    raise exception 'Item de emenda invalido.'
      using errcode = '22023';
  end if;

  select exists (
    select 1 from public.emenda_itens ei where ei.id = p_emenda_item_id
  ) into v_exists;

  if not v_exists then
    raise exception 'Item de emenda nao encontrado.'
      using errcode = 'P0002';
  end if;

  select coalesce(array_agg(i.id), '{}')
    into v_item_ids
  from public.itens i
  where i.emenda_item_id = p_emenda_item_id;

  select coalesce(array_agg(e.id), '{}')
    into v_entrega_ids
  from public.itens_entregas e
  where e.item_id = any(v_item_ids);

  select coalesce(array_agg(distinct nf_id), '{}')
    into v_nf_ids
  from (
    select nfi.nota_fiscal_id as nf_id
    from public.nota_fiscal_itens nfi
    where nfi.emenda_item_id = p_emenda_item_id
       or nfi.item_id = any(v_item_ids)
    union
    select e.nota_fiscal_id
    from public.itens_entregas e
    where e.item_id = any(v_item_ids)
    union
    select u.nota_fiscal_id
    from public.itens_entregas_unidades u
    where u.entrega_id = any(v_entrega_ids)
       or u.item_id = any(v_item_ids)
  ) x
  where nf_id is not null;

  select coalesce(array_agg(distinct emp_id), '{}')
    into v_emp_ids
  from (
    select ei.empenho_id as emp_id
    from public.empenho_itens ei
    where ei.emenda_item_id = p_emenda_item_id
       or ei.item_id = any(v_item_ids)
    union
    select e.empenho_id
    from public.itens_entregas e
    where e.item_id = any(v_item_ids)
    union
    select nfi.empenho_id
    from public.nota_fiscal_itens nfi
    where nfi.emenda_item_id = p_emenda_item_id
       or nfi.item_id = any(v_item_ids)
  ) x
  where emp_id is not null;

  select coalesce(array_agg(distinct proc_id), '{}')
    into v_proc_ids
  from (
    select ei.processo_id as proc_id
    from public.emenda_itens ei
    where ei.id = p_emenda_item_id
    union
    select i.processo_id
    from public.itens i
    where i.id = any(v_item_ids)
  ) x
  where proc_id is not null;

  select coalesce(array_agg(distinct si.sancao_id), '{}')
    into v_sancao_ids
  from public.sancao_itens si
  where si.emenda_item_id = p_emenda_item_id;

  select exists (
    select 1
    from public.itens_entregas e
    where e.item_id = any(v_item_ids)
      and (
        coalesce(e.qtde_recebida, 0) > 0
        or e.data_recebimento is not null
        or e.data_entrega_unidade is not null
      )
    union all
    select 1
    from public.itens_entregas_unidades u
    where u.entrega_id = any(v_entrega_ids)
       or u.item_id = any(v_item_ids)
    union all
    select 1
    from public.atas_execucao ae
    where ae.emenda_item_id = p_emenda_item_id
      and (
        ae.dt_entrega is not null
        or ae.data_entrega_unidade is not null
      )
  ) into v_execucao_real;

  v_counts := jsonb_build_object(
    'emenda_itens', 1,
    'itens', coalesce(array_length(v_item_ids, 1), 0),
    'itens_entregas', coalesce(array_length(v_entrega_ids, 1), 0),
    'itens_entregas_unidades', (
      select count(*)
      from public.itens_entregas_unidades u
      where u.entrega_id = any(v_entrega_ids)
         or u.item_id = any(v_item_ids)
    ),
    'atas_execucao', (
      select count(*)
      from public.atas_execucao ae
      where ae.emenda_item_id = p_emenda_item_id
    ),
    'empenho_itens', (
      select count(*)
      from public.empenho_itens ei
      where ei.emenda_item_id = p_emenda_item_id
         or ei.item_id = any(v_item_ids)
    ),
    'nota_fiscal_itens', (
      select count(*)
      from public.nota_fiscal_itens nfi
      where nfi.emenda_item_id = p_emenda_item_id
         or nfi.item_id = any(v_item_ids)
    ),
    'sancao_itens', (
      select count(*)
      from public.sancao_itens si
      where si.emenda_item_id = p_emenda_item_id
    ),
    'inventario_desvinculado', (
      select count(*)
      from public.inventario_ac inv
      where inv.emenda_item_id = p_emenda_item_id
    ),
    'notas_fiscais_possivelmente_orfas', coalesce(array_length(v_nf_ids, 1), 0),
    'empenhos_possivelmente_orfaos', coalesce(array_length(v_emp_ids, 1), 0),
    'processos_possivelmente_orfaos', coalesce(array_length(v_proc_ids, 1), 0),
    'bloqueado_por_execucao_real', v_execucao_real
  );

  if p_dry_run then
    return jsonb_build_object(
      'dry_run', true,
      'blocked', v_execucao_real,
      'reason', case when v_execucao_real then 'Item ja possui recebimento, entrega ou unidade fisica registrada.' else null end,
      'counts', v_counts
    );
  end if;

  if v_execucao_real then
    raise exception 'Item ja possui recebimento, entrega ou unidade fisica registrada. Exclusao bloqueada.'
      using errcode = '23514';
  end if;

  delete from public.sancao_itens si
  where si.emenda_item_id = p_emenda_item_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('sancao_itens', v_count);

  delete from public.sancoes_solicitadas ss
  where ss.id = any(v_sancao_ids)
    and not exists (
      select 1 from public.sancao_itens si where si.sancao_id = ss.id
    );
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('sancoes_solicitadas_orfas', v_count);

  update public.inventario_ac inv
  set emenda_item_id = null
  where inv.emenda_item_id = p_emenda_item_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('inventario_desvinculado', v_count);

  delete from public.atas_execucao ae
  where ae.emenda_item_id = p_emenda_item_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('atas_execucao', v_count);

  delete from public.itens_entregas_unidades u
  where u.entrega_id = any(v_entrega_ids)
     or u.item_id = any(v_item_ids);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('itens_entregas_unidades', v_count);

  delete from public.nota_fiscal_itens nfi
  where nfi.emenda_item_id = p_emenda_item_id
     or nfi.item_id = any(v_item_ids);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('nota_fiscal_itens', v_count);

  delete from public.empenho_itens ei
  where ei.emenda_item_id = p_emenda_item_id
     or ei.item_id = any(v_item_ids);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('empenho_itens', v_count);

  if to_regclass('public.itens_status_historico') is not null then
    execute 'delete from public.itens_status_historico h where h.item_id = any($1)'
      using v_item_ids;
    get diagnostics v_count = row_count;
  else
    v_count := 0;
  end if;
  v_deleted := v_deleted || jsonb_build_object('itens_status_historico', v_count);

  delete from public.itens_entregas e
  where e.item_id = any(v_item_ids);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('itens_entregas', v_count);

  delete from public.itens i
  where i.id = any(v_item_ids);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('itens', v_count);

  delete from public.emenda_itens ei
  where ei.id = p_emenda_item_id;
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('emenda_itens', v_count);

  delete from public.notas_fiscais nf
  where nf.id = any(v_nf_ids)
    and not exists (select 1 from public.nota_fiscal_itens nfi where nfi.nota_fiscal_id = nf.id)
    and not exists (select 1 from public.itens_entregas e where e.nota_fiscal_id = nf.id)
    and not exists (select 1 from public.itens_entregas_unidades u where u.nota_fiscal_id = nf.id);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('notas_fiscais_orfas', v_count);

  delete from public.empenhos emp
  where emp.id = any(v_emp_ids)
    and not exists (select 1 from public.empenho_itens ei where ei.empenho_id = emp.id)
    and not exists (select 1 from public.nota_fiscal_itens nfi where nfi.empenho_id = emp.id)
    and not exists (select 1 from public.itens_entregas e where e.empenho_id = emp.id);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('empenhos_orfaos', v_count);

  delete from public.processos p
  where p.id = any(v_proc_ids)
    and not exists (select 1 from public.emenda_itens ei where ei.processo_id = p.id)
    and not exists (select 1 from public.itens i where i.processo_id = p.id)
    and not exists (select 1 from public.contratos c where c.processo_id = p.id)
    and not exists (select 1 from public.empenhos emp where emp.processo_id = p.id)
    and not exists (select 1 from public.notas_fiscais nf where nf.processo_id = p.id);
  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_object('processos_orfaos', v_count);

  return jsonb_build_object(
    'dry_run', false,
    'blocked', false,
    'counts', v_counts,
    'deleted', v_deleted
  );
end;
$$;

revoke all on function public.excluir_emenda_item_cascade(uuid, boolean) from public, anon;
grant execute on function public.excluir_emenda_item_cascade(uuid, boolean) to authenticated, service_role;

comment on function public.excluir_emenda_item_cascade(uuid, boolean)
  is 'Dry-run and transactional delete for non-executed emenda items and operational records derived from them.';

notify pgrst, 'reload schema';

commit;
