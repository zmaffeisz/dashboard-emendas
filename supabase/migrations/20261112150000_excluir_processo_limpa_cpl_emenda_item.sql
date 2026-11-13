-- Somente contratos-dag (qpvgpfwuurqcqprnpxua).
-- Bug: ao excluir um processo de licitação, excluir_processo_licitacao zerava
-- emenda_itens.processo_id mas deixava o texto emenda_itens.cpl. Como
-- private.emenda_item_bloqueio_edicao trata cpl preenchido como "Processo vinculado",
-- o item da emenda continuava impossível de excluir/editar mesmo sem processo.
-- Correção: a exclusão passa a limpar também o cpl dos itens que estavam vinculados.
-- Idempotente (create or replace + update restrito).
create or replace function public.excluir_processo_licitacao(
  p_processo_id bigint,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_ids uuid[] := '{}';
  v_secao_id bigint;
  v_bloqueios jsonb := '{}'::jsonb;
  v_bloqueado boolean := false;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Login obrigatorio para excluir processo.' using errcode = '42501';
  end if;

  if p_processo_id is null then
    raise exception 'Processo invalido.' using errcode = '22023';
  end if;

  select p.secao_id into v_secao_id
  from public.processos p where p.id = p_processo_id;
  if not found then
    raise exception 'Processo nao encontrado.' using errcode = 'P0002';
  end if;

  if not private.can_access_domain(v_secao_id, array['contratos'], 'edit') then
    raise exception 'Sem permissao para excluir processos desta secao.' using errcode = '42501';
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

  -- Limpa o vínculo por id e também o texto cpl (senão o item segue "vinculado a processo").
  update public.emenda_itens set processo_id = null, cpl = null where processo_id = p_processo_id;

  if to_regclass('public.itens_status_historico') is not null then
    execute 'delete from public.itens_status_historico where item_id = any($1)' using v_item_ids;
  end if;

  delete from public.itens where id = any(v_item_ids);
  get diagnostics v_count = row_count;

  delete from public.processos where id = p_processo_id;
  get diagnostics v_count = row_count;

  return jsonb_build_object('dry_run', false, 'blocked', false,
    'deleted', jsonb_build_object('itens', coalesce(array_length(v_item_ids, 1), 0), 'processos', v_count));
end
$$;

revoke all on function public.excluir_processo_licitacao(bigint, boolean) from public, anon;
grant execute on function public.excluir_processo_licitacao(bigint, boolean) to authenticated, service_role;

-- Repara itens já afetados: processo_id nulo e cpl apontando para um processo/contrato que
-- não existe mais. Na data desta migration só havia um (emenda 660, "Licença Microsoft Office",
-- cpl 343/2024).
update public.emenda_itens ei
set cpl = null
where ei.processo_id is null
  and nullif(btrim(ei.cpl),'') is not null
  and not exists (select 1 from public.processos p where p.identificador = ei.cpl)
  and not exists (select 1 from public.contratos c where c.cpl = ei.cpl);

notify pgrst, 'reload schema';
