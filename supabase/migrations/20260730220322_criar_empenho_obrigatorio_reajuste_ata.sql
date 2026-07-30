begin;

alter table public.atas_execucao_reajustes
  add column if not exists empenho_id uuid
    references public.empenhos(id) on delete restrict;

create index if not exists atas_execucao_reajustes_empenho_idx
  on public.atas_execucao_reajustes (empenho_id);

alter table public.atas_execucao_reajustes
  alter column empenho set not null,
  alter column nota_fiscal set not null,
  alter column empenho_id set not null;

alter table public.atas_execucao_reajustes
  drop constraint if exists atas_execucao_reajustes_documentos_obrigatorios;

alter table public.atas_execucao_reajustes
  add constraint atas_execucao_reajustes_documentos_obrigatorios
  check (
    nullif(trim(empenho), '') is not null
    and nullif(trim(nota_fiscal), '') is not null
  );

create or replace function public.registrar_reajuste_execucao_ata(
  p_ata_reajuste_id uuid,
  p_ata_execucao_id uuid,
  p_origem_recurso text,
  p_emenda_id uuid default null,
  p_quantidade numeric default null,
  p_empenho text default null,
  p_nota_fiscal text default null
)
returns public.atas_execucao_reajustes
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_reajuste public.atas_item_reajustes%rowtype;
  v_execucao public.atas_execucao%rowtype;
  v_item public.atas_itens%rowtype;
  v_contrato public.contratos%rowtype;
  v_emenda public.emendas%rowtype;
  v_emenda_item_id uuid;
  v_empenho_id uuid;
  v_empenho_numero text;
  v_nota_fiscal text;
  v_empenho_ano integer;
  v_numero_normalizado text;
  v_quantidade numeric;
  v_valor_anterior numeric;
  v_diferenca numeric;
  v_total numeric;
  v_descricao text;
  v_status_entregue_id bigint;
  v_registro public.atas_execucao_reajustes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if p_origem_recurso not in ('emenda','recurso_proprio') then
    raise exception 'Informe uma origem de recurso válida.';
  end if;

  v_empenho_numero := nullif(trim(coalesce(p_empenho, '')), '');
  v_nota_fiscal := nullif(trim(coalesce(p_nota_fiscal, '')), '');
  if v_empenho_numero is null then
    raise exception 'Informe o número do novo empenho do reajuste.';
  end if;
  if v_nota_fiscal is null then
    raise exception 'Informe o número da nota fiscal do reajuste.';
  end if;

  select * into v_reajuste
    from public.atas_item_reajustes
   where id = p_ata_reajuste_id and status = 'ATIVO';
  if not found then
    raise exception 'Reajuste do item não encontrado ou cancelado.';
  end if;

  select * into v_execucao
    from public.atas_execucao
   where id = p_ata_execucao_id;
  if not found then
    raise exception 'Execução da ATA não encontrada.';
  end if;
  if v_execucao.ata_item_id is distinct from v_reajuste.ata_item_id then
    raise exception 'A execução não pertence ao item reajustado.';
  end if;

  if exists (
    select 1
      from public.atas_execucao_reajustes er
     where er.ata_reajuste_id = p_ata_reajuste_id
       and er.ata_execucao_id = p_ata_execucao_id
       and er.status = 'ATIVO'
  ) then
    raise exception 'Esta execução já recebeu o reajuste selecionado.';
  end if;

  select * into v_item from public.atas_itens where id = v_reajuste.ata_item_id;
  select * into v_contrato from public.contratos where id = v_reajuste.contrato_id;

  v_quantidade := coalesce(p_quantidade, v_execucao.qtde, 0);
  if v_quantidade <= 0 or v_quantidade > coalesce(v_execucao.qtde, 0) then
    raise exception 'A quantidade reajustada deve ser maior que zero e não pode ultrapassar a execução.';
  end if;

  v_valor_anterior := case
    when coalesce(v_execucao.qtde, 0) > 0
      then coalesce(v_execucao.valor, 0) / v_execucao.qtde
    else v_reajuste.valor_unitario_anterior
  end;
  v_diferenca := v_reajuste.valor_unitario_novo - v_valor_anterior;
  if v_diferenca <= 0 then
    raise exception 'Esta execução já possui valor igual ou superior ao valor reajustado.';
  end if;
  v_total := round(v_diferenca * v_quantidade, 2);

  v_descricao := concat(
    'REAJUSTE DO ITEM ', coalesce(v_item.item, v_execucao.item, 'SEM DESCRIÇÃO'),
    ' - EMPENHO ', v_empenho_numero,
    ' - NOTA FISCAL ', v_nota_fiscal
  );

  if p_origem_recurso = 'emenda' then
    if p_emenda_id is null then
      raise exception 'Selecione a emenda que pagará o reajuste.';
    end if;
    select * into v_emenda from public.emendas where id = p_emenda_id;
    if not found then
      raise exception 'Emenda selecionada não encontrada.';
    end if;

    select id into v_status_entregue_id
      from public.status_opcoes
     where contexto = 'emenda_item' and upper(nome) = 'ENTREGUE'
     order by ordem
     limit 1;

    insert into public.emenda_itens (
      emenda_id, emenda, item, qtde, vl_unitario, vl_total,
      cpl, processo_id, status, status_id, nota_fiscal, empenho,
      unidade_beneficiada, unidade_entrega,
      item_cadastrado, qtde_cadastrada,
      vl_unitario_cadastrado, vl_total_cadastrado,
      data_atualizacao, secao_id
    ) values (
      v_emenda.id, v_emenda.emenda, v_descricao, v_quantidade, v_diferenca, v_total,
      coalesce(v_contrato.cpl, v_execucao.cpl), v_contrato.processo_id,
      'ENTREGUE', v_status_entregue_id,
      v_nota_fiscal, v_empenho_numero,
      nullif(trim(v_execucao.unidade), ''), nullif(trim(v_execucao.unidade), ''),
      v_descricao, v_quantidade, v_diferenca, v_total,
      to_char(current_date, 'DD/MM/YYYY'), coalesce(v_execucao.secao_id, v_item.secao_id)
    )
    returning id into v_emenda_item_id;
  end if;

  v_numero_normalizado := upper(regexp_replace(v_empenho_numero, '[^A-Za-z0-9]', '', 'g'));
  v_empenho_ano := coalesce(
    nullif(substring(v_empenho_numero from '([0-9]{4})$'), '')::integer,
    extract(year from current_date)::integer
  );

  if exists (
    select 1
      from public.empenhos e
     where e.contrato_id is not distinct from v_contrato.id
       and e.numero_normalizado = v_numero_normalizado
  ) then
    raise exception 'Este número de empenho já está cadastrado para o contrato. Informe o novo empenho específico do reajuste.';
  end if;

  insert into public.empenhos (
    numero, numero_normalizado, ano,
    processo_id, contrato_id, fornecedor_id, emenda_id,
    fonte_tipo, fonte_descricao,
    valor_empenhado, valor_anulado, saldo_empenho,
    data_emissao, status, origem_sistema, origem_codigo,
    observacoes, updated_at, secao_id
  ) values (
    v_empenho_numero, v_numero_normalizado, v_empenho_ano,
    v_contrato.processo_id, v_contrato.id, v_contrato.fornecedor_id,
    case when p_origem_recurso = 'emenda' then p_emenda_id else null end,
    p_origem_recurso, 'Pagamento complementar de reajuste de ATA',
    v_total, 0, 0,
    current_date, 'emitido', 'reajuste_ata', v_execucao.id::text,
    v_descricao, now(), coalesce(v_execucao.secao_id, v_item.secao_id)
  )
  returning id into v_empenho_id;

  insert into public.empenho_itens (
    empenho_id, item_id, emenda_id, emenda_item_id,
    quantidade_vinculada, valor_vinculado, exec_id,
    observacoes, secao_id
  ) values (
    v_empenho_id, null,
    case when p_origem_recurso = 'emenda' then p_emenda_id else null end,
    v_emenda_item_id,
    v_quantidade, v_total, v_execucao.id,
    v_descricao, coalesce(v_execucao.secao_id, v_item.secao_id)
  );

  insert into public.atas_execucao_reajustes (
    ata_reajuste_id, ata_execucao_id, origem_recurso,
    emenda_id, emenda_item_id, empenho_id,
    quantidade_reajustada,
    valor_unitario_anterior, valor_unitario_reajustado,
    valor_reajuste_unitario, valor_reajuste_total,
    empenho, nota_fiscal, criado_por, secao_id
  ) values (
    v_reajuste.id, v_execucao.id, p_origem_recurso,
    case when p_origem_recurso = 'emenda' then p_emenda_id else null end,
    v_emenda_item_id, v_empenho_id,
    v_quantidade,
    v_valor_anterior, v_reajuste.valor_unitario_novo,
    v_diferenca, v_total,
    v_empenho_numero, v_nota_fiscal,
    auth.uid(), coalesce(v_execucao.secao_id, v_item.secao_id)
  )
  returning * into v_registro;

  return v_registro;
end;
$function$;

revoke all on function public.registrar_reajuste_execucao_ata(uuid,uuid,text,uuid,numeric,text,text) from public;
grant execute on function public.registrar_reajuste_execucao_ata(uuid,uuid,text,uuid,numeric,text,text) to authenticated;

commit;
