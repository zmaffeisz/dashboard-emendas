-- Produção: qpvgpfwuurqcqprnpxua. Backup do schema capturado antes da aplicação.
-- Escopo fechado tem execução própria; não cria recebimentos físicos ou inventário.
alter table public.contratos add column if not exists recebimento_escopo text
  check (recebimento_escopo in ('integral','parcial'));
alter table public.itens add column if not exists escopo_execucao jsonb;
alter table public.contratos_medicoes add column if not exists escopo_item_id uuid references public.itens(id);
alter table public.contratos_medicoes add column if not exists escopo_conclusao boolean not null default false;
alter table public.contratos_medicoes add column if not exists escopo_dados jsonb;
create index if not exists contratos_medicoes_escopo_item_idx on public.contratos_medicoes(escopo_item_id) where escopo_item_id is not null;

drop policy if exists escopo_entregas_select on public.contratos_medicoes;
create policy escopo_entregas_select on public.contratos_medicoes for select to authenticated
using (escopo_item_id is not null and private.can_access_domain(secao_id,array['itens'],'view'));
drop policy if exists escopo_entregas_select on public.termos_ateste;
create policy escopo_entregas_select on public.termos_ateste for select to authenticated
using (private.can_access_domain(secao_id,array['itens'],'view') and exists
  (select 1 from public.contratos_medicoes m where m.id=medicao_id and m.escopo_item_id is not null));

-- O lançamento financeiro, o rateio e o ateste são confirmados na mesma transação.
create or replace function private.servico_escopo_operar(p_item_id uuid,p_acao text,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_item public.itens%rowtype; v_ct public.contratos%rowtype;
  v_nf public.notas_fiscais%rowtype; v_med public.contratos_medicoes%rowtype;
  v_tipo text; v_id uuid; v_emp uuid; v_total numeric; v_bruto numeric; v_glosa numeric;
  v_medido numeric; v_total_ct numeric; v_modo text; v_final boolean; v_fiscal text;
  v_inicio date; v_fim date; v_data date; v_snapshot jsonb; v_recurso record;
  v_alocado numeric; v_rateado numeric:=0; v_rateio numeric; v_count integer; v_pos integer:=0;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária.'; end if;
  -- Ordem única dos locks: contrato, item, NF. Serializa medições concorrentes do contrato.
  select * into v_item from public.itens where id=p_item_id;
  if not found or v_item.contrato_id is null then raise exception 'Item sem contrato.'; end if;
  select * into v_ct from public.contratos where id=v_item.contrato_id for update;
  select * into v_item from public.itens where id=p_item_id for update;
  if v_item.contrato_id is distinct from v_ct.id then raise exception 'Vínculo alterado. Reabra o recebimento.'; end if;
  if not private.can_access_domain(v_item.secao_id,array['itens','contratos'],'edit')
     or not private.can_access_domain(v_ct.secao_id,array['itens','contratos'],'edit') then
    raise exception 'Sem permissão para executar serviços desta seção.';
  end if;
  select tipo_servico into v_tipo from public.processos where id=v_item.processo_id;
  if v_tipo is distinct from 'Serviço por escopo fechado' or v_item.origem is distinct from 'servico'
     or v_ct.tipo_instrumento is distinct from 'CONTRATO' then
    raise exception 'Este fluxo é exclusivo de serviço por escopo fechado.';
  end if;
  perform set_config('app.servico_escopo_rpc','on',true);

  if p_acao='configurar' then
    v_modo=p_dados->>'modo';
    if v_modo is null or v_modo not in ('integral','parcial') then raise exception 'Selecione recebimento integral ou parcial.'; end if;
    if v_ct.recebimento_escopo is distinct from v_modo and exists
      (select 1 from public.contratos_medicoes where contrato_id=v_ct.id and escopo_item_id is not null and status<>'cancelada') then
      raise exception 'O modo de recebimento não pode mudar após a primeira medição ativa.';
    end if;
    v_inicio=nullif(p_dados->>'inicio','')::date; v_fim=nullif(p_dados->>'prazo','')::date;
    if v_inicio is not null and v_fim<v_inicio then raise exception 'Prazo anterior ao início.'; end if;
    update public.contratos set recebimento_escopo=v_modo where id=v_ct.id;
    update public.itens set escopo_execucao=jsonb_build_object('ordem',trim(p_dados->>'ordem'),'inicio',v_inicio,'prazo',v_fim,
      'atualizado_por',auth.uid(),'atualizado_em',now()) where id=v_item.id;
    return jsonb_build_object('item_id',v_item.id);
  end if;

  if p_acao='cancelar' then
    select * into v_med from public.contratos_medicoes where id=(p_dados->>'id')::uuid and escopo_item_id=v_item.id for update;
    if not found then raise exception 'Medição não encontrada.'; end if;
    if length(trim(coalesce(p_dados->>'motivo','')))<5 then raise exception 'Informe o motivo do cancelamento.'; end if;
    if v_med.status='cancelada' then return jsonb_build_object('id',v_med.id); end if;
    select * into v_nf from public.notas_fiscais where medicao_id=v_med.id for update;
    if v_nf.status='encaminhada_para_pagamento' then raise exception 'NF encaminhada para pagamento. Regularize o encaminhamento antes de cancelar.'; end if;
    update public.contratos_medicoes set status='cancelada',updated_at=now(),
      escopo_dados=escopo_dados||jsonb_build_object('cancelado_por',auth.uid(),'cancelado_em',now(),'motivo_cancelamento',trim(p_dados->>'motivo')) where id=v_med.id;
    -- Preserva medição/ateste como histórico; libera a mesma NF para correção, sem duplicá-la.
    delete from public.nota_fiscal_itens where nota_fiscal_id=v_nf.id and item_id=v_item.id;
    update public.notas_fiscais set medicao_id=null,status='recebida',valor_glosa=0,
      valor_aprovado=valor_total,valor_liquido=valor_total,validado_por=null,validado_em=null,updated_at=now() where id=v_nf.id;
    return jsonb_build_object('id',v_med.id);
  end if;
  if p_acao is distinct from 'receber' then raise exception 'Operação inválida.'; end if;
  v_id=(p_dados->>'id')::uuid;
  if v_id is null then raise exception 'Identificador de lançamento obrigatório.'; end if;
  select * into v_med from public.contratos_medicoes where id=v_id;
  if found then
    if v_med.escopo_item_id is distinct from v_item.id or (v_med.escopo_dados->>'nota_fiscal_id') is distinct from (p_dados->>'nota_fiscal_id') then
      raise exception 'Identificador já utilizado por outro lançamento.';
    end if;
    return jsonb_build_object('id',v_id,'repetido',true);
  end if;
  if upper(coalesce(v_ct.status,'')) in ('SUSPENSO','ENCERRADO','CANCELADO') then raise exception 'Contrato suspenso ou encerrado.'; end if;
  v_modo=v_ct.recebimento_escopo;
  if v_modo is null then raise exception 'Configure a forma de recebimento primeiro.'; end if;
  if exists(select 1 from public.contratos_medicoes where escopo_item_id=v_item.id and escopo_conclusao and status<>'cancelada') then
    raise exception 'Escopo já concluído. Cancele o ateste final para corrigir.';
  end if;
  v_final=coalesce((p_dados->>'conclusao')::boolean,false);
  if v_modo='integral' and not v_final then raise exception 'Recebimento integral exige conclusão do serviço.'; end if;
  v_data=nullif(p_dados->>'data','')::date;
  v_inicio=nullif(p_dados->>'periodo_inicio','')::date; v_fim=nullif(p_dados->>'periodo_fim','')::date;
  v_fiscal=trim(p_dados->>'fiscal');
  if v_data is null or v_inicio is null or v_fim is null or v_inicio>v_fim or v_fim>v_data or v_data>current_date then
    raise exception 'Informe datas válidas: período executado até a data do ateste, sem data futura.';
  end if;
  if coalesce(v_fiscal,'')='' or coalesce(trim(p_dados->>'descricao'),'')='' then raise exception 'Informe fiscal e descrição da execução atestada.'; end if;
  v_emp=nullif(p_dados->>'empenho_id','')::uuid;
  if v_emp is null or not exists(select 1 from public.empenho_itens ei join public.empenhos e on e.id=ei.empenho_id
      where ei.item_id=v_item.id and ei.empenho_id=v_emp and e.contrato_id=v_ct.id) then
    raise exception 'Vincule e selecione um empenho deste item e contrato.';
  end if;
  select * into v_nf from public.notas_fiscais where id=(p_dados->>'nota_fiscal_id')::uuid for update;
  if not found or v_nf.contrato_id is distinct from v_ct.id or v_nf.fornecedor_id is distinct from v_ct.fornecedor_id
    or v_nf.medicao_id is not null or v_nf.status not in ('recebida','em_conferencia')
    or exists(select 1 from public.nota_fiscal_itens where nota_fiscal_id=v_nf.id) then
    raise exception 'Selecione uma NF recebida, livre, da empresa e do contrato deste serviço.';
  end if;
  v_bruto=round(v_nf.valor_total,2); v_glosa=round(coalesce(nullif(p_dados->>'glosa','')::numeric,0),2);
  if v_bruto is null or v_bruto<=0 or v_glosa<0 or v_glosa>v_bruto then raise exception 'Valores inválidos na NF/glosa.'; end if;
  if v_glosa>0 and coalesce(trim(p_dados->>'motivo_glosa'),'')='' then raise exception 'Justifique a glosa.'; end if;
  v_total=round(coalesce(v_item.valor_contratado,v_item.valor_estimado,0)*coalesce(v_item.qtde,0),2);
  select coalesce(sum(valor_bruto),0) into v_medido from public.contratos_medicoes where escopo_item_id=v_item.id and status<>'cancelada';
  if v_medido+v_bruto>v_total then raise exception 'Medição ultrapassa o saldo contratado do item.'; end if;
  if v_modo='integral' and (v_medido>0 or v_bruto<>v_total) then raise exception 'Recebimento integral deve contemplar o valor total do item; utilize glosa para descontos.'; end if;
  if v_final and v_medido+v_bruto<v_total and length(trim(coalesce(p_dados->>'justificativa_conclusao','')))<5 then
    raise exception 'Justifique a conclusão com saldo não executado.';
  end if;
  v_total_ct=coalesce(v_ct.valor_atual_num,v_ct.valor_total_num,v_ct.valor_inicial_num,0);
  if (select coalesce(sum(valor_bruto),0) from public.contratos_medicoes where contrato_id=v_ct.id and status<>'cancelada')+v_bruto>v_total_ct then
    raise exception 'Medições ultrapassam o valor atual do contrato.';
  end if;
  v_snapshot=p_dados||jsonb_build_object('usuario_id',auth.uid(),'modo',v_modo,'item',v_item.descricao,
    'contrato',v_ct.numero_contrato,'empresa',v_ct.prestador,'processo',v_ct.cpl,'emenda_id',v_item.emenda_id,
    'emenda_item_id',v_item.emenda_item_id,'nota_numero',v_nf.numero,'empenho_numero',(select numero from public.empenhos where id=v_emp));
  insert into public.contratos_medicoes(id,contrato_id,competencia,tipo_medicao,data_medicao,fiscal_responsavel,status,
    valor_bruto,valor_glosa,valor_liquido,observacoes,validado_por,validado_em,secao_id,escopo_item_id,escopo_conclusao,escopo_dados)
  values(v_id,v_ct.id,to_char(v_data,'YYYY-MM'),'escopo_'||v_modo,v_data,v_fiscal,
    case when v_glosa>0 then 'aprovada_com_glosa' else 'aprovada_pelo_fiscal' end,
    v_bruto,v_glosa,v_bruto-v_glosa,trim(p_dados->>'descricao'),auth.uid()::text,now(),v_item.secao_id,v_item.id,v_final,v_snapshot);
  insert into public.contratos_medicao_itens(medicao_id,contrato_id,item_id,descricao,valor_total,observacoes,secao_id)
    values(v_id,v_ct.id,v_item.id,v_item.descricao,v_bruto,'Serviço por escopo: valor medido, sem unidades físicas.',v_item.secao_id);
  update public.notas_fiscais set medicao_id=v_id,valor_bruto=v_bruto,valor_glosa=v_glosa,valor_liquido=v_bruto-v_glosa,
    valor_aprovado=v_bruto-v_glosa,status=case when v_glosa>0 then 'aprovada_com_glosa' else 'aprovada' end,
    validado_por=auth.uid()::text,validado_em=now(),updated_at=now() where id=v_nf.id;
  select coalesce(sum(valor_alocado),0),count(*) into v_alocado,v_count from public.licitacao_item_recursos
    where item_id=v_item.id and status='ATIVO' and valor_alocado>0;
  if v_alocado>0 then
    for v_recurso in select * from public.licitacao_item_recursos where item_id=v_item.id and status='ATIVO' and valor_alocado>0 order by id loop
      v_pos=v_pos+1;
      v_rateio=case when v_pos=v_count then v_bruto-v_rateado else round(v_bruto*v_recurso.valor_alocado/v_alocado,2) end;
      v_rateado=v_rateado+v_rateio;
      insert into public.nota_fiscal_itens(nota_fiscal_id,item_id,emenda_id,emenda_item_id,empenho_id,valor_total,secao_id,observacoes)
      values(v_nf.id,v_item.id,v_recurso.emenda_id,v_recurso.emenda_item_id,v_emp,v_rateio,v_item.secao_id,'Rateio de medição de escopo; NF contabilizada uma única vez.');
    end loop;
  else
    insert into public.nota_fiscal_itens(nota_fiscal_id,item_id,emenda_id,emenda_item_id,empenho_id,valor_total,secao_id)
    values(v_nf.id,v_item.id,v_item.emenda_id,v_item.emenda_item_id,v_emp,v_bruto,v_item.secao_id);
  end if;
  insert into public.termos_ateste(contrato_id,medicao_id,nota_fiscal_id,responsavel,fiscalizado_por,observacao,
    valor_atestado,cpl_contrato,competencia,nf_referencia,gerado_em,secao_id)
  values(v_ct.id,v_id,v_nf.id,v_fiscal,v_fiscal,trim(p_dados->>'descricao'),v_bruto-v_glosa,v_ct.cpl,
    to_char(v_data,'YYYY-MM'),v_nf.numero,v_data,v_item.secao_id);
  return jsonb_build_object('id',v_id);
end $$;
revoke all on function private.servico_escopo_operar(uuid,text,jsonb) from public,anon;
grant execute on function private.servico_escopo_operar(uuid,text,jsonb) to authenticated;
create or replace function public.servico_escopo_operar(p_item_id uuid,p_acao text,p_dados jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.servico_escopo_operar(p_item_id,p_acao,p_dados);
$$;
revoke all on function public.servico_escopo_operar(uuid,text,jsonb) from public,anon;
grant execute on function public.servico_escopo_operar(uuid,text,jsonb) to authenticated;

-- Edições genéricas de medição/NF não podem quebrar o saldo ou apagar o histórico.
create or replace function private.proteger_recebimento_escopo()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_setting('app.servico_escopo_rpc',true)='on' then
    if tg_op='DELETE' then return old; end if; return new;
  end if;
  if tg_table_name='contratos_medicoes' then
    if (tg_op<>'INSERT' and old.escopo_item_id is not null) or (tg_op<>'DELETE' and new.escopo_item_id is not null) then
      raise exception 'Use o recebimento de serviço no Controle de Entregas para alterar esta medição.';
    end if;
  elsif tg_table_name='notas_fiscais' then
    if exists(select 1 from public.contratos_medicoes where id=old.medicao_id and escopo_item_id is not null and status<>'cancelada') then
      if tg_op='DELETE' then raise exception 'NF vinculada a serviço atestado.'; end if;
      if (new.valor_total,new.valor_bruto,new.valor_glosa,new.valor_liquido,new.valor_aprovado,new.medicao_id,new.contrato_id,new.fornecedor_id,new.numero)
        is distinct from (old.valor_total,old.valor_bruto,old.valor_glosa,old.valor_liquido,old.valor_aprovado,old.medicao_id,old.contrato_id,old.fornecedor_id,old.numero)
        or new.status='cancelada' then raise exception 'Cancele a medição de escopo antes de alterar a NF atestada.'; end if;
    end if;
  elsif tg_table_name='contratos' then
    if old.recebimento_escopo is distinct from new.recebimento_escopo and exists
      (select 1 from public.contratos_medicoes where contrato_id=old.id and escopo_item_id is not null and status<>'cancelada') then
      raise exception 'Forma de recebimento bloqueada após medição ativa.';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function private.proteger_recebimento_escopo() from public,anon,authenticated;
drop trigger if exists proteger_recebimento_escopo on public.contratos_medicoes;
create trigger proteger_recebimento_escopo before insert or update or delete on public.contratos_medicoes for each row execute function private.proteger_recebimento_escopo();
drop trigger if exists proteger_recebimento_escopo on public.notas_fiscais;
create trigger proteger_recebimento_escopo before update or delete on public.notas_fiscais for each row execute function private.proteger_recebimento_escopo();
drop trigger if exists proteger_recebimento_escopo on public.contratos;
create trigger proteger_recebimento_escopo before update on public.contratos for each row execute function private.proteger_recebimento_escopo();
