-- Somente contratos-dag (qpvgpfwuurqcqprnpxua). Não altera dados existentes.
-- Helper privado: a inspeção precisa enxergar referências de outros domínios,
-- mesmo quando suas políticas RLS escondem o documento operacional do chamador.
create or replace function private.emenda_item_bloqueio_edicao(p_id uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v public.emenda_itens%rowtype;
begin
  if auth.uid() is null or not private.is_admin_approved() then
    raise exception 'Somente administradores aprovados podem editar os itens.' using errcode='42501';
  end if;
  select * into v from public.emenda_itens where id=p_id;
  if not found then raise exception 'Item não encontrado.' using errcode='P0002'; end if;
  if not private.can_access_domain(v.secao_id,array['dashboard'],'edit') then
    raise exception 'Sem permissão para esta seção.' using errcode='42501';
  end if;
  if v.processo_id is not null or nullif(btrim(v.cpl),'') is not null then return 'Processo vinculado'; end if;
  if exists(select 1 from public.itens where emenda_item_id=p_id) then return 'Item de processo/contrato vinculado'; end if;
  if exists(select 1 from public.ata_planejamento_emendas where emenda_item_id=p_id) then return 'Planejamento de ata vinculado'; end if;
  if exists(select 1 from public.atas_execucao where emenda_item_id=p_id) then return 'Execução de ata vinculada'; end if;
  if exists(select 1 from public.atas_execucao_unidades where emenda_item_id=p_id) then return 'Unidade física de ata vinculada'; end if;
  if exists(select 1 from public.atas_execucao_reajustes where emenda_item_id=p_id) then return 'Reajuste de ata vinculado'; end if;
  if exists(select 1 from public.empenho_itens where emenda_item_id=p_id) then return 'Empenho vinculado'; end if;
  if exists(select 1 from public.nota_fiscal_itens where emenda_item_id=p_id) then return 'Nota fiscal vinculada'; end if;
  if exists(select 1 from public.licitacao_item_ocorrencia_emendas where emenda_item_id=p_id) then return 'Histórico de ocorrência em licitação'; end if;
  if coalesce(nullif(btrim(v.nota_fiscal),''),nullif(btrim(v.empenho),''),
    nullif(btrim(v.patrimonio),''),nullif(btrim(v.data_entrega),''),
    nullif(btrim(v.ordem_pagamento),''),nullif(btrim(v.comprovante_pagamento),'')) is not null
    or coalesce(v.vl_unitario,0)<>0 or coalesce(v.vl_total,0)<>0 then
    return 'Registro legado de execução, documento ou entrega';
  end if;
  return null;
end;
$$;
revoke all on function private.emenda_item_bloqueio_edicao(uuid) from public,anon;
grant execute on function private.emenda_item_bloqueio_edicao(uuid) to authenticated;

create or replace function public.listar_emenda_itens_edicao(p_emenda_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare v_secao bigint; v_result jsonb;
begin
  if auth.uid() is null or not private.is_admin_approved() then
    raise exception 'Somente administradores aprovados podem editar os itens.' using errcode='42501';
  end if;
  select secao_id into v_secao from public.emendas where id=p_emenda_id;
  if not found or not private.can_access_domain(v_secao,array['dashboard'],'edit') then
    raise exception 'Emenda não encontrada ou sem permissão.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',ei.id,'item',coalesce(nullif(ei.item_cadastrado,''),ei.item,''),
    'unidade',ei.unidade_beneficiada,'qtde',coalesce(ei.qtde_cadastrada,ei.qtde),
    'valor',ei.vl_unitario_cadastrado,'versao',md5(to_jsonb(ei)::text),
    'bloqueio',private.emenda_item_bloqueio_edicao(ei.id)
  ) order by ei.created_at,ei.id),'[]'::jsonb) into v_result
  from public.emenda_itens ei where ei.emenda_id=p_emenda_id;
  return v_result;
end;
$$;
revoke all on function public.listar_emenda_itens_edicao(uuid) from public,anon;
grant execute on function public.listar_emenda_itens_edicao(uuid) to authenticated;

create or replace function public.salvar_emenda_com_itens_livres(
  p_emenda_id uuid,p_dados jsonb,p_itens jsonb default '[]'::jsonb
)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_secao bigint; v_alt jsonb; v_item public.emenda_itens%rowtype;
  v_bloqueio text; v_descricao text; v_qtde numeric; v_valor numeric;
  v_ano integer; v_cedido numeric; v_atualizados integer:=0; v_excluidos integer:=0;
begin
  if auth.uid() is null or not private.is_admin_approved() then
    raise exception 'Somente administradores aprovados podem editar os itens.' using errcode='42501';
  end if;
  if p_dados is null or jsonb_typeof(p_dados)<>'object' or p_itens is null or jsonb_typeof(p_itens)<>'array' then
    raise exception 'Dados de edição inválidos.' using errcode='22023';
  end if;
  select secao_id into v_secao from public.emendas where id=p_emenda_id for update;
  if not found or not private.can_access_domain(v_secao,array['dashboard'],'edit') then
    raise exception 'Emenda não encontrada ou sem permissão.' using errcode='42501';
  end if;
  v_ano:=(p_dados->>'ano')::integer;
  v_cedido:=(p_dados->>'valor_cedido')::numeric;
  if coalesce(p_dados->>'tipo','') not in ('FEDERAL','ESTADUAL','MUNICIPAL')
    or coalesce(btrim(p_dados->>'emenda'),'')='' or coalesce(btrim(p_dados->>'parlamentar'),'')=''
    or coalesce(btrim(p_dados->>'objeto'),'')='' or v_ano is null or v_ano not between 1900 and 2200
    or v_cedido is null or v_cedido<0 or v_cedido::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Preencha os dados obrigatórios da emenda.' using errcode='22023';
  end if;
  if exists(select 1 from public.emendas where id<>p_emenda_id and btrim(emenda)=btrim(p_dados->>'emenda') and ano=v_ano) then
    raise exception 'Já existe uma emenda com este número e ano.' using errcode='23505';
  end if;
  if exists(select 1 from jsonb_array_elements(p_itens) x group by x->>'id' having count(*)>1) then
    raise exception 'Item repetido no pedido de edição.' using errcode='22023';
  end if;
  -- Ordem fixa; FOR UPDATE conflita com o KEY SHARE das FKs que criam vínculos.
  -- A verificação VOLATILE é feita depois da trava, nunca pela fotografia da tela.
  for v_alt in select value from jsonb_array_elements(p_itens) order by value->>'id' loop
    select * into v_item from public.emenda_itens
      where id=(v_alt->>'id')::uuid and emenda_id=p_emenda_id for update;
    if not found then raise exception 'Item não encontrado nesta emenda. Reabra a edição.' using errcode='P0002'; end if;
    v_bloqueio:=private.emenda_item_bloqueio_edicao(v_item.id);
    if v_bloqueio is not null then
      raise exception 'Item "%" bloqueado: %. Nenhuma alteração foi salva.',v_item.item,v_bloqueio using errcode='23503';
    end if;
    if (v_alt->>'versao') is distinct from md5(to_jsonb(v_item)::text) then
      raise exception 'O item "%" foi alterado por outra operação. Reabra a edição. Nenhuma alteração foi salva.',v_item.item using errcode='40001';
    end if;
    if coalesce((v_alt->>'excluir')::boolean,false) then
      -- Sem cascade: qualquer referência inesperada deve impedir a exclusão.
      delete from public.emenda_itens where id=v_item.id;
      if not found then raise exception 'Sem permissão para excluir o item.' using errcode='42501'; end if;
      v_excluidos:=v_excluidos+1;
    else
      v_descricao:=btrim(v_alt->>'item');
      v_qtde:=(v_alt->>'qtde')::numeric; v_valor:=(v_alt->>'valor')::numeric;
      if coalesce(v_descricao,'')='' or v_qtde is null or v_valor is null or v_qtde<=0 or v_valor<=0
        or v_qtde::text in ('NaN','Infinity','-Infinity') or v_valor::text in ('NaN','Infinity','-Infinity') then
        raise exception 'Descrição, quantidade e valor unitário inválidos.' using errcode='22023';
      end if;
      update public.emenda_itens set item_cadastrado=v_descricao,item=v_descricao,
        qtde_cadastrada=v_qtde,qtde=v_qtde,vl_unitario_cadastrado=v_valor,
        vl_total_cadastrado=round(v_qtde*v_valor,2)
        where id=v_item.id;
      if not found then raise exception 'Sem permissão para editar o item.' using errcode='42501'; end if;
      v_atualizados:=v_atualizados+1;
    end if;
  end loop;
  -- Último passo: o trigger de renumeração não invalida versões antes da conferência.
  update public.emendas set tipo=p_dados->>'tipo',emenda=btrim(p_dados->>'emenda'),ano=v_ano,
    parlamentar=btrim(p_dados->>'parlamentar'),sei_emenda=nullif(btrim(p_dados->>'sei_emenda'),''),
    valor_cedido=round(v_cedido,2),objeto=btrim(p_dados->>'objeto') where id=p_emenda_id;
  if not found then raise exception 'Sem permissão para editar a emenda.' using errcode='42501'; end if;
  return jsonb_build_object('atualizados',v_atualizados,'excluidos',v_excluidos);
end;
$$;
revoke all on function public.salvar_emenda_com_itens_livres(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.salvar_emenda_com_itens_livres(uuid,jsonb,jsonb) to authenticated;
