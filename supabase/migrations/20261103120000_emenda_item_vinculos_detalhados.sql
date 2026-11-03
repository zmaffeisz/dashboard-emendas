-- Somente contratos-dag (qpvgpfwuurqcqprnpxua). Não altera dados existentes.
-- O bloqueio de edição/exclusão de item de emenda passa a listar TODOS os vínculos
-- (antes devolvia só o primeiro) e a considerar também o rateio financeiro de
-- licitação (licitacao_item_recursos, FK RESTRICT). Assinatura e permissões idênticas.
create or replace function private.emenda_item_bloqueio_edicao(p_id uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v public.emenda_itens%rowtype; r text[] := '{}'; n bigint;
begin
  if auth.uid() is null or not private.is_admin_approved() then
    raise exception 'Somente administradores aprovados podem editar os itens.' using errcode='42501';
  end if;
  select * into v from public.emenda_itens where id=p_id;
  if not found then raise exception 'Item não encontrado.' using errcode='P0002'; end if;
  if not private.can_access_domain(v.secao_id,array['dashboard'],'edit') then
    raise exception 'Sem permissão para esta seção.' using errcode='42501';
  end if;
  if v.processo_id is not null or nullif(btrim(v.cpl),'') is not null then
    r := r || 'Processo vinculado'::text;
  end if;
  select count(*) into n from public.itens where emenda_item_id=p_id;
  if n>0 then r := r || format('Item de processo/contrato vinculado (%s)',n); end if;
  select count(*) into n from public.ata_planejamento_emendas where emenda_item_id=p_id;
  if n>0 then r := r || format('Planejamento de ata vinculado (%s)',n); end if;
  select count(*) into n from public.atas_execucao where emenda_item_id=p_id;
  if n>0 then r := r || format('Execução de ata vinculada (%s)',n); end if;
  select count(*) into n from public.atas_execucao_unidades where emenda_item_id=p_id;
  if n>0 then r := r || format('Unidade física de ata vinculada (%s)',n); end if;
  select count(*) into n from public.atas_execucao_reajustes where emenda_item_id=p_id;
  if n>0 then r := r || format('Reajuste de ata vinculado (%s)',n); end if;
  select count(*) into n from public.empenho_itens where emenda_item_id=p_id;
  if n>0 then r := r || format('Empenho vinculado (%s)',n); end if;
  select count(*) into n from public.nota_fiscal_itens where emenda_item_id=p_id;
  if n>0 then r := r || format('Nota fiscal vinculada (%s)',n); end if;
  select count(*) into n from public.licitacao_item_recursos where emenda_item_id=p_id;
  if n>0 then r := r || format('Rateio financeiro de item de licitação (%s)',n); end if;
  select count(*) into n from public.licitacao_item_ocorrencia_emendas where emenda_item_id=p_id;
  if n>0 then r := r || format('Histórico de ocorrência em licitação (%s)',n); end if;
  if coalesce(nullif(btrim(v.nota_fiscal),''),nullif(btrim(v.empenho),''),
    nullif(btrim(v.patrimonio),''),nullif(btrim(v.data_entrega),''),
    nullif(btrim(v.ordem_pagamento),''),nullif(btrim(v.comprovante_pagamento),'')) is not null
    or coalesce(v.vl_unitario,0)<>0 or coalesce(v.vl_total,0)<>0 then
    r := r || 'Registro legado de execução, documento ou entrega'::text;
  end if;
  return case when cardinality(r)=0 then null else array_to_string(r,'; ') end;
end;
$$;
revoke all on function private.emenda_item_bloqueio_edicao(uuid) from public,anon;
grant execute on function private.emenda_item_bloqueio_edicao(uuid) to authenticated;
