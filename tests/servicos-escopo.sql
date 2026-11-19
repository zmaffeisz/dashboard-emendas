-- Teste transacional: nenhum contrato, NF, medição ou inventário de teste persiste.
begin;
do $$
declare
  ct integer; proc bigint; sec bigint; fornecedor bigint; usuario uuid;
  item uuid; emp uuid; nf1 uuid; nf2 uuid; nfextra uuid; med1 uuid:=gen_random_uuid(); med2 uuid:=gen_random_uuid();
  payload jsonb; esperado boolean; qtd integer; antes bigint; depois bigint;
begin
  select id,secao_id into proc,sec from public.processos where tipo_servico='Serviço por escopo fechado' limit 1;
  select id into usuario from public.profiles where papel='admin' and aprovado and contexto_secao_id=sec limit 1;
  if usuario is null or proc is null then raise exception 'Sem contexto para teste.'; end if;
  perform set_config('request.jwt.claim.sub',usuario::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',usuario,'role','authenticated')::text,true);
  select id into fornecedor from public.fornecedores limit 1;
  select coalesce(max(id),0)+10000 into ct from public.contratos;
  insert into public.contratos(id,processo_id,secao_id,secao,numero_contrato,cpl,prestador,fornecedor_id,valor_atual_num,status)
  overriding system value
  values(ct,proc,sec,'SMCP','TESTE ESCOPO ROLLBACK','TESTE','Empresa teste',fornecedor,1000,'VIGENTE');
  insert into public.itens(processo_id,contrato_id,secao_id,origem,descricao,qtde,valor_contratado,fornecedor_id)
  values(proc,ct,sec,'servico','TESTE ESCOPO ROLLBACK',1,1000,fornecedor) returning id into item;
  insert into public.empenhos(numero,contrato_id,secao_id,valor_empenhado) values('TESTE-'||item,ct,sec,1000) returning id into emp;
  insert into public.empenho_itens(empenho_id,item_id,secao_id,valor_vinculado) values(emp,item,sec,1000);
  insert into public.notas_fiscais(numero,contrato_id,fornecedor_id,secao_id,valor_total,status)
  values('TESTE-A-'||item,ct,fornecedor,sec,400,'recebida') returning id into nf1;
  insert into public.notas_fiscais(numero,contrato_id,fornecedor_id,secao_id,valor_total,status)
  values('TESTE-B-'||item,ct,fornecedor,sec,600,'recebida') returning id into nf2;
  insert into public.notas_fiscais(numero,contrato_id,fornecedor_id,secao_id,valor_total,status)
  values('TESTE-C-'||item,ct,fornecedor,sec,700,'recebida') returning id into nfextra;
  select (select count(*) from public.itens_entregas_unidades)+(select count(*) from public.inventario_unidades) into antes;
  perform public.servico_escopo_operar(item,'configurar','{"modo":"integral"}');
  payload=jsonb_build_object('id',med1,'nota_fiscal_id',nf1,'empenho_id',emp,'data',current_date,
    'periodo_inicio',current_date-7,'periodo_fim',current_date,'fiscal','Fiscal teste','descricao','Etapa teste','conclusao',false);
  esperado=false;
  begin perform public.servico_escopo_operar(item,'receber',payload); exception when others then
    if sqlerrm like '%integral exige%' then esperado=true; else raise; end if;
  end;
  if not esperado then raise exception 'Integral aceitou parcial.'; end if;
  perform public.servico_escopo_operar(item,'configurar','{"modo":"parcial"}');
  perform public.servico_escopo_operar(item,'receber',payload);
  perform public.servico_escopo_operar(item,'receber',payload);
  select count(*) into qtd from public.contratos_medicoes where escopo_item_id=item;
  if qtd<>1 then raise exception 'Reenvio duplicou medição.'; end if;
  if (select escopo_conclusao from public.contratos_medicoes where id=med1) then raise exception 'Parcial concluiu item.'; end if;
  if (select count(*) from public.termos_ateste where medicao_id=med1)<>1 then raise exception 'Ateste duplicado/ausente.'; end if;
  if (select sum(valor_total) from public.nota_fiscal_itens where nota_fiscal_id=nf1)<>400 then raise exception 'Rateio incorreto.'; end if;
  esperado=false;
  begin perform public.servico_escopo_operar(item,'configurar','{"modo":"integral"}'); exception when others then
    if sqlerrm like '%primeira medição%' then esperado=true; else raise; end if;
  end;
  if not esperado then raise exception 'Modo alterado após medição.'; end if;
  esperado=false;
  begin perform public.servico_escopo_operar(item,'receber',payload||jsonb_build_object('id',gen_random_uuid(),'nota_fiscal_id',nfextra)); exception when others then
    if sqlerrm like '%ultrapassa o saldo%' then esperado=true; else raise; end if;
  end;
  if not esperado then raise exception 'Aceitou extrapolação.'; end if;
  if (select medicao_id from public.notas_fiscais where id=nfextra) is not null then raise exception 'Falha deixou NF vinculada.'; end if;
  perform public.servico_escopo_operar(item,'receber',payload||jsonb_build_object('id',med2,'nota_fiscal_id',nf2,'conclusao',true,'glosa',20,'motivo_glosa','Desconto de teste'));
  if (select sum(valor_liquido) from public.contratos_medicoes where escopo_item_id=item)<>980 then raise exception 'Líquido incorreto.'; end if;
  if not(select escopo_conclusao from public.contratos_medicoes where id=med2) then raise exception 'Não concluiu.'; end if;
  perform set_config('app.servico_escopo_rpc','off',true);
  esperado=false;
  begin update public.contratos_medicoes set status='cancelada' where id=med2; exception when others then
    if sqlerrm like '%Use o recebimento%' then esperado=true; else raise; end if;
  end;
  if not esperado then raise exception 'Edição genérica burlou controle.'; end if;
  esperado=false;
  begin update public.notas_fiscais set valor_total=1 where id=nf2; exception when others then
    if sqlerrm like '%Cancele a medição%' then esperado=true; else raise; end if;
  end;
  if not esperado then raise exception 'Alterou NF atestada.'; end if;
  esperado=false;
  begin update public.termos_ateste set valor_atestado=1 where medicao_id=med2; exception when others then
    if sqlerrm like '%histórico de item/ateste%' then esperado=true; else raise; end if;
  end;
  if not esperado then raise exception 'Alterou ateste fora do fluxo.'; end if;
  perform public.servico_escopo_operar(item,'cancelar',jsonb_build_object('id',med2,'motivo','Correção de teste'));
  if (select medicao_id from public.notas_fiscais where id=nf2) is not null then raise exception 'Cancelamento não liberou NF.'; end if;
  if exists(select 1 from public.contratos_medicoes where escopo_item_id=item and escopo_conclusao and status<>'cancelada') then raise exception 'Cancelamento não reabriu saldo.'; end if;
  perform public.servico_escopo_operar(item,'cancelar',jsonb_build_object('id',med1,'motivo','Teste de integral'));
  perform public.servico_escopo_operar(item,'configurar','{"modo":"integral"}');
  update public.notas_fiscais set valor_total=1000 where id=nfextra;
  perform public.servico_escopo_operar(item,'receber',payload||jsonb_build_object('id',gen_random_uuid(),'nota_fiscal_id',nfextra,'conclusao',true));
  if (select sum(valor_bruto) from public.contratos_medicoes where escopo_item_id=item and status<>'cancelada')<>1000 then raise exception 'Integral incorreto.'; end if;
  select (select count(*) from public.itens_entregas_unidades)+(select count(*) from public.inventario_unidades) into depois;
  if depois<>antes then raise exception 'Serviço criou unidade física.'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  esperado=false;
  begin perform public.servico_escopo_operar(item,'configurar','{"modo":"parcial"}'); exception when others then
    if sqlerrm like '%Autenticação necessária%' then esperado=true; else raise; end if;
  end;
  if not esperado then raise exception 'Aceitou usuário anônimo.'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  esperado=false;
  begin perform public.servico_escopo_operar(item,'configurar','{"modo":"parcial"}'); exception when others then
    if sqlerrm like '%Sem permissão%' then esperado=true; else raise; end if;
  end;
  if not esperado then raise exception 'Aceitou usuário sem acesso.'; end if;
end $$;
select 'OK: integral/parcial, reenvio, saldo, ateste, NF, cancelamento, imutabilidade, autenticação e inventário' as resultado;
rollback;
