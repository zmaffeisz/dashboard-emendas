do $migration$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.atas_execucao'::regclass
       and conname = 'atas_execucao_origem_recurso_check'
  ) then
    alter table public.atas_execucao
      add constraint atas_execucao_origem_recurso_check
      check (
        origem_recurso is null
        or origem_recurso in ('emenda', 'recurso_proprio', 'carona')
      ) not valid;
  end if;
end
$migration$;

alter table public.atas_execucao
  validate constraint atas_execucao_origem_recurso_check;

create or replace function public.criar_solicitacao_ata_execucao(
  p_ata_item_id uuid,
  p_unidade text,
  p_qtde numeric,
  p_valor numeric default 0,
  p_origem_recurso text default 'recurso_proprio',
  p_emenda_id uuid default null,
  p_emenda_item_id uuid default null,
  p_data_af text default null,
  p_dt_entrega text default null
)
returns table(exec_id uuid, emenda_item_id uuid, saldo_item_id uuid, parcial boolean)
language plpgsql
set search_path = public
as $function$
declare
  v_ata public.atas_itens%rowtype;
  v_item public.emenda_itens%rowtype;
  v_origem text := coalesce(nullif(trim(p_origem_recurso), ''), 'recurso_proprio');
  v_disponivel numeric;
  v_saldo numeric := 0;
  v_plan_unit numeric;
  v_exec_unit numeric;
  v_status_original text;
  v_status_id_original bigint;
begin
  if v_origem not in ('emenda', 'recurso_proprio', 'carona') then
    raise exception 'Origem do recurso inválida.';
  end if;
  if p_ata_item_id is null then
    raise exception 'Selecione o item da ATA.';
  end if;
  if nullif(trim(coalesce(p_unidade, '')), '') is null then
    raise exception 'Informe a unidade.';
  end if;
  if p_qtde is null or p_qtde <= 0 then
    raise exception 'Informe uma quantidade maior que zero.';
  end if;

  select * into v_ata from public.atas_itens where id = p_ata_item_id;
  if not found then
    raise exception 'Item da ATA nao encontrado.';
  end if;

  if v_origem = 'emenda' then
    if p_emenda_item_id is null then
      raise exception 'Selecione o item da emenda.';
    end if;

    select * into v_item from public.emenda_itens where id = p_emenda_item_id for update;
    if not found then
      raise exception 'Item da emenda nao encontrado.';
    end if;

    if exists (select 1 from public.atas_execucao ae where ae.emenda_item_id = p_emenda_item_id) then
      raise exception 'Este item da emenda ja possui solicitacao vinculada.';
    end if;
    if exists (select 1 from public.itens it where it.emenda_item_id = p_emenda_item_id) then
      raise exception 'Este item da emenda ja esta vinculado a outro processo.';
    end if;

    v_disponivel := coalesce(v_item.qtde, v_item.qtde_cadastrada, 0);
    if p_qtde > v_disponivel then
      raise exception 'Quantidade maior que o saldo disponivel (%).', v_disponivel;
    end if;

    v_saldo := v_disponivel - p_qtde;
    v_plan_unit := coalesce(
      v_item.vl_unitario_cadastrado,
      case when v_disponivel > 0 then v_item.vl_total_cadastrado / v_disponivel end,
      v_item.vl_unitario,
      case when v_disponivel > 0 then v_item.vl_total / v_disponivel end,
      case when p_qtde > 0 then p_valor / p_qtde end,
      0
    );
    v_exec_unit := case when p_qtde > 0 then coalesce(p_valor, 0) / p_qtde end;
    v_status_original := v_item.status;
    v_status_id_original := v_item.status_id;

    update public.emenda_itens
       set qtde = p_qtde,
           vl_unitario = v_exec_unit,
           vl_total = coalesce(p_valor, 0),
           cpl = coalesce(v_ata.cpl, v_item.cpl),
           status = 'AGUARDANDO AF',
           item_cadastrado = coalesce(v_item.item_cadastrado, v_item.item),
           qtde_cadastrada = p_qtde,
           vl_unitario_cadastrado = v_plan_unit,
           vl_total_cadastrado = v_plan_unit * p_qtde,
           data_atualizacao = to_char(current_date, 'DD/MM/YYYY')
     where id = v_item.id;

    emenda_item_id := v_item.id;

    if v_saldo > 0 then
      insert into public.emenda_itens (
        emenda_id, emenda, item, qtde, vl_unitario, vl_total, cpl, processo_id,
        status, status_id, nota_fiscal, empenho, patrimonio,
        unidade_beneficiada, unidade_beneficiada_id, unidade_entrega, unidade_entrega_id,
        data_entrega, ordem_pagamento, item_cadastrado, qtde_cadastrada,
        vl_unitario_cadastrado, vl_total_cadastrado, data_atualizacao, comprovante_pagamento
      ) values (
        v_item.emenda_id, v_item.emenda, v_item.item, v_saldo, null, null, null, null,
        v_status_original, v_status_id_original, null, null, null,
        v_item.unidade_beneficiada, v_item.unidade_beneficiada_id,
        v_item.unidade_entrega, v_item.unidade_entrega_id,
        null, null, coalesce(v_item.item_cadastrado, v_item.item), v_saldo,
        v_plan_unit, v_plan_unit * v_saldo, null, null
      ) returning id into saldo_item_id;
    end if;
  end if;

  insert into public.atas_execucao (
    ata_item_id, emenda_id, emenda_item_id, cpl, sim, item, unidade, qtde, valor,
    origem_recurso, data_af, dt_entrega
  ) values (
    p_ata_item_id,
    case when v_origem = 'emenda' then coalesce(p_emenda_id, v_item.emenda_id) else null end,
    case when v_origem = 'emenda' then emenda_item_id else null end,
    v_ata.cpl,
    v_ata.sim,
    v_ata.item,
    trim(p_unidade),
    p_qtde,
    coalesce(p_valor, 0),
    v_origem,
    p_data_af,
    p_dt_entrega
  ) returning id into exec_id;

  parcial := coalesce(v_saldo, 0) > 0;
  return next;
end;
$function$;
