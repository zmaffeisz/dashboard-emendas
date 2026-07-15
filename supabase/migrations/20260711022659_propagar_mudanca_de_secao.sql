create or replace function private.cascade_record_secao()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.secao_id is not distinct from old.secao_id then return new; end if;
  case tg_table_name
    when 'processos' then
      update public.contratos set secao_id=new.secao_id where processo_id=new.id;
      update public.itens set secao_id=new.secao_id where processo_id=new.id and contrato_id is null;
      update public.empenhos set secao_id=new.secao_id where processo_id=new.id and contrato_id is null;
      update public.notas_fiscais set secao_id=new.secao_id where processo_id=new.id and contrato_id is null;
    when 'contratos' then
      update public.itens set secao_id=new.secao_id where contrato_id=new.id;
      update public.atas_itens set secao_id=new.secao_id where contrato_id=new.id;
      update public.empenhos set secao_id=new.secao_id where contrato_id=new.id;
      update public.notas_fiscais set secao_id=new.secao_id where contrato_id=new.id;
      update public.contratos_fiscalizadores set secao_id=new.secao_id where contrato_id=new.id;
      update public.contratos_historico set secao_id=new.secao_id where contrato_id=new.id;
      update public.contratos_vigencias set secao_id=new.secao_id where contrato_id=new.id;
      update public.contratos_medicoes set secao_id=new.secao_id where contrato_id=new.id;
      update public.sancoes_administrativas set secao_id=new.secao_id where contrato_id=new.id;
      update public.sancoes_solicitadas set secao_id=new.secao_id where contrato_id=new.id;
    when 'emendas' then
      update public.emenda_itens set secao_id=new.secao_id where emenda_id=new.id;
    when 'itens' then
      update public.itens_entregas set secao_id=new.secao_id where item_id=new.id;
      update public.itens_entregas_unidades set secao_id=new.secao_id where item_id=new.id;
      update public.itens_status_historico set secao_id=new.secao_id where item_id=new.id;
    when 'atas_itens' then
      update public.atas_execucao set secao_id=new.secao_id where ata_item_id=new.id;
    when 'atas_execucao' then
      update public.atas_execucao_unidades set secao_id=new.secao_id where exec_id=new.id;
    when 'empenhos' then
      update public.empenho_itens set secao_id=new.secao_id where empenho_id=new.id;
    when 'notas_fiscais' then
      update public.nota_fiscal_itens set secao_id=new.secao_id where nota_fiscal_id=new.id;
    when 'contratos_medicoes' then
      update public.contratos_medicao_itens set secao_id=new.secao_id where medicao_id=new.id;
      update public.contratos_medicao_glosas set secao_id=new.secao_id where medicao_id=new.id;
    when 'sancoes_solicitadas' then
      update public.sancao_itens set secao_id=new.secao_id where sancao_id=new.id;
  end case;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['processos','contratos','emendas','itens','atas_itens','atas_execucao','empenhos','notas_fiscais','contratos_medicoes','sancoes_solicitadas'] loop
    execute format('drop trigger if exists cascade_record_secao on public.%I',t);
    execute format('create trigger cascade_record_secao after update of secao_id on public.%I for each row execute function private.cascade_record_secao()',t);
  end loop;
end $$;

revoke all on function private.cascade_record_secao() from public;
