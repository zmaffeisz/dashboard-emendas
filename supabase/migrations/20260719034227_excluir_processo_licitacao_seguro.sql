-- Exclui um processo de licitacao somente quando ainda nao gerou registros
-- operacionais. Os itens de emenda sao preservados e apenas desvinculados.

begin;

create or replace function public.excluir_processo_licitacao(
  p_processo_id bigint,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item_ids uuid[] := '{}';
  v_exists boolean := false;
  v_bloqueios jsonb := '{}'::jsonb;
  v_bloqueado boolean := false;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Login obrigatorio para excluir processo.' using errcode = '42501';
  end if;

  if not public.can_access_tab('contratos', 'edit') then
    raise exception 'Sem permissao para excluir processos.' using errcode = '42501';
  end if;

  if p_processo_id is null then
    raise exception 'Processo invalido.' using errcode = '22023';
  end if;

  select exists(select 1 from public.processos where id = p_processo_id)
    into v_exists;
  if not v_exists then
    raise exception 'Processo nao encontrado.' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(i.id), '{}') into v_item_ids
  from public.itens i where i.processo_id = p_processo_id;

  v_bloqueios := jsonb_build_object(
    'contratos', (select count(*) from public.contratos c where c.processo_id = p_processo_id),
    'empenhos', (select count(*) from public.empenhos e where e.processo_id = p_processo_id),
    'notas_fiscais', (select count(*) from public.notas_fiscais n where n.processo_id = p_processo_id),
    'itens_contratados', (select count(*) from public.itens i where i.processo_id = p_processo_id and i.contrato_id is not null),
    'entregas', (select count(*) from public.itens_entregas e where e.item_id = any(v_item_ids)),
    'unidades_recebidas', (select count(*) from public.itens_entregas_unidades u where u.item_id = any(v_item_ids)),
    'execucoes_ata', (
      select count(*) from public.atas_execucao ae
      join public.atas_itens ai on ai.id = ae.ata_item_id
      join public.contratos c on c.id = ai.contrato_id
      where c.processo_id = p_processo_id
    ),
    'sancoes', 0,
    'inventario', 0
  );

  v_bloqueado := exists(select 1 from jsonb_each_text(v_bloqueios) x where x.value::integer > 0);

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'blocked', v_bloqueado,
      'reason', case when v_bloqueado then 'O processo possui registros operacionais e nao pode ser excluido.' else null end,
      'counts', v_bloqueios, 'itens', coalesce(array_length(v_item_ids, 1), 0));
  end if;

  if v_bloqueado then
    raise exception 'Processo possui registros operacionais e nao pode ser excluido.' using errcode = '23514';
  end if;

  -- A emenda continua existindo e volta a ficar disponivel para novo processo.
  update public.emenda_itens set processo_id = null where processo_id = p_processo_id;

  if to_regclass('public.itens_status_historico') is not null then
    execute 'delete from public.itens_status_historico where item_id = any($1)' using v_item_ids;
  end if;

  -- Evita referencias internas de item_origem_id impedirem a remocao.
  update public.itens set item_origem_id = null where item_origem_id = any(v_item_ids);
  delete from public.itens where id = any(v_item_ids);
  get diagnostics v_count = row_count;

  delete from public.processos where id = p_processo_id;
  get diagnostics v_count = row_count;

  return jsonb_build_object('dry_run', false, 'blocked', false,
    'deleted', jsonb_build_object('itens', coalesce(array_length(v_item_ids, 1), 0), 'processos', v_count));
end;
$$;

revoke all on function public.excluir_processo_licitacao(bigint, boolean) from public, anon;
grant execute on function public.excluir_processo_licitacao(bigint, boolean) to authenticated, service_role;

comment on function public.excluir_processo_licitacao(bigint, boolean)
  is 'Dry-run and transactional deletion of an unexecuted licitacao process; preserves emenda items.';

notify pgrst, 'reload schema';
commit;
